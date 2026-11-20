// 极联（007vin / hscp）车型目录：VIN → 主组 → 图号卡片 → 零件（OE）。
// 目录类接口不扣极联次数，所以这里做进程内缓存，避免界面来回点重复请求。
import { readEpcSession } from "./epc.mjs";

const apiBase = () => String(process.env.EPC_API_BASE || "https://epcapi.g-part.cn").replace(/\/+$/, "");
const HSCP = "https://mbd.cloud.harsonserver.com/hscp/llq";
const requestTimeout = 15_000;
const cacheTtl = 10 * 60 * 1000;
const cache = new Map();

const HEADERS = {
  accept: "application/json, text/plain, */*",
  origin: "https://epc.g-part.cn",
  referer: "https://epc.g-part.cn/",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36",
};

function catalogError(message, status = 502) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > cacheTtl) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  if (cache.size > 400) cache.clear();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function hsPort(path) {
  const { token, userId, userName } = readEpcSession();
  if (!token) throw catalogError("未配置极联 token", 409);
  const params = new URLSearchParams({ url: `${HSCP}${path}`, userId, userName });
  let response;
  try {
    response = await fetch(`${apiBase()}/api/lql/hsPort?${params.toString()}`, { headers: { ...HEADERS, token }, signal: AbortSignal.timeout(requestTimeout) });
  } catch {
    throw catalogError("极联目录接口连不上");
  }
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw catalogError("极联目录接口返回了无法解析的内容");
  }
  if (payload?.code !== 1) throw catalogError(String(payload?.msg || "极联目录查询失败"));
  return payload;
}

const cleanLabel = (value) => String(value ?? "")
  .replace(/<br\s*\/?>/gi, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/\s+/g, " ")
  .trim();

/** 图号 101000 → 101-000，跟 EPC 卡片上的一致。 */
export const figureOf = (mid) => {
  const value = String(mid || "").trim();
  return value.length > 3 ? `${value.slice(0, 3)}-${value.slice(3)}` : value;
};

// 爆炸图缩略图：极联在 subgroup 响应里给出 imgs 映射（哈希 → 完整 URL，路径里的编号逐张不同），
// imgs 里没有时才退回 1000015 这个默认规格。
const THUMBNAIL_BASE = "https://structimgs.007vin.com/thumbnail/1000015";
export const thumbnailOf = (hash) => (hash ? `${THUMBNAIL_BASE}/${hash}.png` : "");

export function parseSubgroups(rows = [], imgs = {}) {
  return rows.map((row) => ({
    mid: String(row.mid || ""),
    figure: figureOf(row.mid),
    name: cleanLabel(row.name),
    subGroup: String(row.subGroup || ""),
    hasChild: String(row.hasChild || "0") === "1",
    mainGroup: String(row.mainGroup || ""),
    // colorValue=0：这张图不属于这台车的配置（极联的分组计数就是按这个过滤的）
    applicable: String(row.colorValue ?? "1") !== "0",
    image: String(row.imageLarge || ""),
    thumbnail: String(imgs?.[row.imageLarge] || thumbnailOf(row.imageLarge)),
    // 大图：同一份哈希把 /thumbnail/ 换成 /struct/（实测 200，约 100–200KB）
    diagram: String(imgs?.[row.imageLarge] || thumbnailOf(row.imageLarge)).replace("/thumbnail/", "/struct/"),
  })).filter((row) => row.mid);
}

export function parseParts(rows = []) {
  const parts = [];
  for (const row of rows) {
    const oe = cleanLabel(row.pid);
    if (!oe) continue;
    parts.push({
      oe,
      name: cleanLabel(row.label),
      position: cleanLabel(row.pnum),
      quantity: cleanLabel(row.quantity),
      saCode: cleanLabel(row.saCode),
      remark: cleanLabel(row.remark),
      model: cleanLabel(row.model),
      condition: cleanLabel(row.condition),
      alternate: cleanLabel(row.itid),
      discontinued: /弃用/.test(cleanLabel(row.label)) || String(row.isReplace || "") === "1",
      // 极联按 VIN 配置判断：colorValue=0 表示不适用这台车（接口在 filter=1 时直接剔除）
      applicable: String(row.colorValue ?? "1") !== "0",
    });
  }
  return parts;
}

const vinKey = (vin) => `vin:${vin}`;

export async function resolveCatalogVehicle(vin) {
  const key = vinKey(vin);
  const cached = cacheGet(key);
  if (cached) return cached;
  const data = (await hsPort(`/vins/cars/vin?vin=${encodeURIComponent(vin)}&brandCode=`)).data;
  const modelName = cleanLabel(data.modelName);
  const [brand = "", ...seriesParts] = modelName.split("-");
  const vehicle = {
    vin: String(data.vin || vin),
    modelName,
    brand,
    series: seriesParts.join("-"),
    year: cleanLabel(data.year),
    brandCode: String(data.brandCode || ""),
    mcid: String(data.mcid || ""),
  };
  if (!vehicle.mcid) throw catalogError("极联目录里没有这台车", 404);
  return cacheSet(key, vehicle);
}

export async function loadCatalog(vin) {
  const vehicle = await resolveCatalogVehicle(vin);
  const groups = await groupsOf(vehicle);
  return { vehicle, groups };
}

async function groupsOf(vehicle) {
  const key = `groups:${vehicle.mcid}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const rows = (await hsPort(`/vins/cars/group?brandCode=${encodeURIComponent(vehicle.brandCode)}&mcid=${encodeURIComponent(vehicle.mcid)}`)).data;
  const groups = (rows || []).map((row) => ({
    num: String(row.num || ""),
    label: cleanLabel(row.label),
    image: String(row.img || ""),
  }));
  return cacheSet(key, groups);
}

/** 每个主组适用的分组张数（免费接口，10 张一次拉齐后缓存 10 分钟）。 */
export async function loadGroupCounts(vin) {
  const vehicle = await resolveCatalogVehicle(vin);
  const key = `counts:${vehicle.mcid}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const groups = await groupsOf(vehicle);
  const counts = {};
  for (const group of groups) {
    try {
      const payload = await hsPort(`/vins/cars/subgroup?group1Index=${encodeURIComponent(group.num)}&brandCode=${encodeURIComponent(vehicle.brandCode)}&vin=${encodeURIComponent(vin)}&mcid=${encodeURIComponent(vehicle.mcid)}&num=${encodeURIComponent(group.num)}`);
      const rows = payload?.data || [];
      counts[group.num] = rows.filter((row) => String(row.colorValue ?? "1") !== "0").length;
    } catch {
      counts[group.num] = null;
    }
  }
  return cacheSet(key, counts);
}

export async function loadSubgroups(vin, num) {
  const vehicle = await resolveCatalogVehicle(vin);
  const key = `subgroups:${vehicle.mcid}:${num}`;
  const cached = cacheGet(key);
  if (cached) return cached;  // 必须带 group1Index 和 vin：极联才会返回 colorValue（配置过滤）和 imgs（每张图的实际缩略图地址）
  const payload = await hsPort(`/vins/cars/subgroup?group1Index=${encodeURIComponent(num)}&brandCode=${encodeURIComponent(vehicle.brandCode)}&vin=${encodeURIComponent(vin)}&mcid=${encodeURIComponent(vehicle.mcid)}&num=${encodeURIComponent(num)}`);
  return cacheSet(key, parseSubgroups(payload?.data || [], payload?.imgs || {}));
}

export async function loadParts(vin, num, mid, { applicableOnly = false } = {}) {
  const vehicle = await resolveCatalogVehicle(vin);
  const filter = applicableOnly ? 1 : 0;
  const key = `parts:${vehicle.mcid}:${num}:${mid}:${filter}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const base = `/vins/cars/parts?brandCode=${encodeURIComponent(vehicle.brandCode)}&mcid=${encodeURIComponent(vehicle.mcid)}&vin=${encodeURIComponent(vin)}&num=${encodeURIComponent(num)}&mid=${encodeURIComponent(mid)}&filter=${filter}`;
  const payload = await hsPort(base);
  const parts = parseParts((payload?.data?.partDetail || []).flat());
  // 爆炸图上每个图号的热区（原生像素坐标，跟 image 一起缩放）
  const hotspots = (payload?.img?.imgPoints?.hotspots || []).map((spot) => ({
    key: String(spot.hsKey ?? ""),
    x: Number(spot.hsX),
    y: Number(spot.hsY),
    right: Number(spot.maxX),
    bottom: Number(spot.maxY),
  })).filter((spot) => spot.key && [spot.x, spot.y, spot.right, spot.bottom].every(Number.isFinite));
  // parts/tags 带参考价和替代标记（另一次免费调用，失败不影响零件列表）
  if (parts.length) {
    try {
      const pids = [...new Set(parts.map((part) => part.oe))].join(",");
      const tags = await hsPort(`/vins/cars/parts/tags?brandCode=${encodeURIComponent(vehicle.brandCode)}&mcid=${encodeURIComponent(vehicle.mcid)}&vin=${encodeURIComponent(vin)}&num=${encodeURIComponent(num)}&mid=${encodeURIComponent(mid)}&pid_list=${encodeURIComponent(pids)}`);
      for (const part of parts) {
        const tag = tags?.data?.[part.oe];
        if (!tag) continue;
        part.price = cleanLabel(tag.salePrice);
        if (String(tag.isReplace) === "1") part.replaced = true;
      }
    } catch {
      // 拿不到价格就留空
    }
  }
  return cacheSet(key, { parts, hotspots, image: String(payload?.img?.imagePath || "") });
}
