import { createHash } from "node:crypto";
import { readEpcSession } from "./epc.mjs";
import { resolveCatalogVehicle } from "./epc-catalog.mjs";

/**
 * 极联「全库零件搜索」：EPC 前端 `POST /api/lql/inquire`（签名接口），
 * 一次请求跨主组/图号返回 OE、名称、主组、分组、图号位置，不需要本地索引。
 * sign = md5(固定 secret + 时间戳 YYYYMMDDHHmmss)，从 epc.g-part.cn 前端 bundle 反查得到。
 */
const SEARCH_SECRET = "xHDHee96klWYN8dHDgItLH147IqOuuZg";
const apiBase = () => String(process.env.EPC_API_BASE || "https://epcapi.g-part.cn").replace(/\/+$/, "");
const requestTimeout = 15_000;

const clean = (value) => String(value || "")
  .replace(/<br\s*\/?>/gi, " ")
  .replace(/\s+/g, " ")
  .trim();

const figureOf = (mid) => {
  const text = String(mid || "");
  return /^\d{6}$/.test(text) ? `${text.slice(0, 3)}-${text.slice(3)}` : text;
};

const signOf = (timestamp) => createHash("md5").update(SEARCH_SECRET + timestamp).digest("hex");

function timestampOf(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export async function searchEpcWorld(vin, keyword) {
  const q = String(keyword || "").trim();
  if (!q) return { results: [], total: 0 };
  const vehicle = await resolveCatalogVehicle(vin);
  const session = readEpcSession();
  if (!session.token) {
    const error = new Error("极联登录已失效，需要换 token");
    error.status = 401;
    throw error;
  }
  const timestamp = timestampOf();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeout);
  let payload;
  try {
    const response = await fetch(`${apiBase()}/api/lql/inquire`, {
      method: "POST",
      headers: {
        "content-type": "application/json;charset=UTF-8",
        token: session.token,
        origin: "https://epc.g-part.cn",
        referer: "https://epc.g-part.cn/",
      },
      body: JSON.stringify({
        sign: signOf(timestamp),
        timestamp,
        userId: session.userId,
        userName: session.userName,
        brandCode: vehicle.brandCode,
        search_key: q,
        mcid: vehicle.mcid,
        vin: vehicle.vin,
      }),
      signal: controller.signal,
    });
    payload = await response.json().catch(() => null);
  } finally {
    clearTimeout(timer);
  }
  if (!payload || String(payload.code) !== "0") {
    const error = new Error(payload?.msg || "极联零件搜索失败");
    error.status = 502;
    throw error;
  }
  const results = (payload.data || []).map((row) => ({
    mid: String(row.mid || ""),
    groupNum: String(row.mid || "").slice(0, 1),
    figure: figureOf(row.mid),
    position: String(row.pNum || ""),
    oe: String(row.pid || ""),
    name: clean(row.label || row.name),
    mainGroup: clean(row.mainGroupLabel || row.mainGroupName),
    group: clean(row.subGroupLabel || row.subGroupName),
    image: String(row.url || ""),
    kind: "oe",
  })).filter((row) => row.mid && row.oe);
  return { results, total: results.length };
}
