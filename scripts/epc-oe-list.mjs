#!/usr/bin/env node
// 打印某台车在极联 EPC 里的全部 OE 号（只读，不写库）。
// 用法：npm run oe:epc -- <VIN> [--csv 输出文件.csv]
// 目录类接口不扣 EPC 次数；VIN 解析优先走本机 API 的缓存，没有缓存才会扣 1 次。
import { writeFileSync } from "node:fs";
import { readEpcToken } from "../server/epc.mjs";

const HSCP = "https://mbd.cloud.harsonserver.com/hscp/llq";
const API = "https://epcapi.g-part.cn";
const LOCAL = process.env.HSX_API || "http://127.0.0.1:4188";

const args = process.argv.slice(2);
const vin = String(args[0] || "").trim().toUpperCase();
const csvIndex = args.indexOf("--csv");
const csvPath = csvIndex >= 0 ? args[csvIndex + 1] : "";
if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
  console.error("用法：npm run oe:epc -- <17 位 VIN> [--csv 输出文件.csv]");
  process.exit(1);
}

const token = readEpcToken();
const session = (() => {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split(".")[1] || "", "base64").toString("utf8"));
    const subject = JSON.parse(payload.sub || "{}");
    return { userId: String(subject.userId || "1007"), userName: String(subject.userName || "") };
  } catch {
    return { userId: "1007", userName: "" };
  }
})();

async function callHsPort(path) {
  const url = `${HSCP}${path}`;
  const params = new URLSearchParams({ url, userId: session.userId, userName: session.userName });
  const response = await fetch(`${API}/api/lql/hsPort?${params}`, {
    headers: { accept: "application/json, text/plain, */*", origin: "https://epc.g-part.cn", referer: "https://epc.g-part.cn/", token },
  });
  return response.json();
}

async function resolveVehicle() {
  try {
    const response = await fetch(`${LOCAL}/api/vin/epc?vin=${vin}`);
    if (response.ok) {
      const body = await response.json();
      return { ...body, source: body.cached ? "本地缓存" : "极联解析" };
    }
  } catch { /* 本机服务没起就直接调极联 */ }
  const response = await fetch(`${API}/api/oms/getVinAnalysisData?vin=${vin}`, {
    headers: { accept: "application/json, text/plain, */*", origin: "https://epc.g-part.cn", referer: "https://epc.g-part.cn/", token },
  });
  const payload = await response.json();
  const data = payload?.data?.data || payload?.data || {};
  return { vin, series: data.brand, source: "极联解析（未走缓存，扣 1 次）" };
}

const text = (value) => String(value ?? "").replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();

const vehicle = await resolveVehicle();
const catalogVin = await callHsPort(`/vins/cars/vin?vin=${vin}&brandCode=porsche`);
if (catalogVin.code !== 1) {
  console.error("极联目录没有这台车：", catalogVin.msg || JSON.stringify(catalogVin).slice(0, 120));
  process.exit(2);
}
const { mcid, brandCode, modelName } = catalogVin.data;
const groups = (await callHsPort(`/vins/cars/group?brandCode=${encodeURIComponent(brandCode)}&mcid=${encodeURIComponent(mcid)}`)).data || [];
const rows = [];
const seen = new Set();
for (const group of groups) {
  const parts = await callHsPort(`/vins/cars/parts?brandCode=${encodeURIComponent(brandCode)}&mcid=${encodeURIComponent(mcid)}&num=${group.num}`);
  for (const part of (parts.data?.partDetail || []).flat()) {
    const oe = text(part.pid);
    if (!oe) continue;
    const key = oe.replace(/[\s-]/g, "").toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      oe,
      name: text(part.label),
      group: text(group.label),
      figure: text(part.pnum),
      quantity: text(part.quantity),
      saCode: text(part.saCode),
      discontinued: /弃用/.test(text(part.label)) || text(part.isReplace) === "1",
    });
  }
}
rows.sort((a, b) => a.group.localeCompare(b.group, "zh") || a.oe.localeCompare(b.oe));

console.log(`车型：${modelName}  （${vehicle.source}）`);
console.log(`主组 ${groups.length} 个 · 不重复 OE ${rows.length} 个 · 其中弃用件 ${rows.filter((row) => row.discontinued).length} 个`);
for (const row of rows.slice(0, 20)) console.log(`  ${row.oe.padEnd(16)} ${row.name.slice(0, 28)}  [${row.group}]`);
if (rows.length > 20) console.log(`  …其余 ${rows.length - 20} 条`);

if (csvPath) {
  const header = ["OE号", "名称", "主组", "图号", "数量", "选装码", "弃用件"];
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [header, ...rows.map((row) => [row.oe, row.name, row.group, row.figure, row.quantity, row.saCode, row.discontinued ? "是" : ""])];
  writeFileSync(csvPath, `\uFEFF${lines.map((line) => line.map(escape).join(",")).join("\r\n")}\r\n`, "utf8");
  console.log(`\nCSV 已写入：${csvPath}`);
}
