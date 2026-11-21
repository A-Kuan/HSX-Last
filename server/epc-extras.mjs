import { readEpcSession } from "./epc.mjs";
import { resolveCatalogVehicle } from "./epc-catalog.mjs";

/**
 * EPC 零件扩展信息（替换件 / 渠道价格 / 品牌件反查）与账号侧记录。
 * 这些接口必须带 mcid（目录接口里已经 URL 编码过一次），缺参会返回「处理发生异常」。
 */
const HSCP = "https://mbd.cloud.harsonserver.com/hscp/llq";
const apiBase = () => String(process.env.EPC_API_BASE || "https://epcapi.g-part.cn").replace(/\/+$/, "");
const requestTimeout = 15_000;
const HEADERS = {
  accept: "application/json, text/plain, */*",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/157.0 Safari/537.36",
  origin: "https://epc.g-part.cn",
  referer: "https://epc.g-part.cn/",
};

const clean = (value) => String(value ?? "")
  .replace(/<br\s*\/?>/gi, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/\s+/g, " ")
  .trim();

const fail = (message, status = 502) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

async function hs(path) {
  const { token, userId, userName } = readEpcSession();
  if (!token) throw fail("极联登录已失效，需要换 token", 401);
  const params = new URLSearchParams({ url: `${HSCP}${path}`, userId, userName });
  let response;
  try {
    response = await fetch(`${apiBase()}/api/lql/hsPort?${params.toString()}`, {
      headers: { ...HEADERS, token },
      signal: AbortSignal.timeout(requestTimeout),
    });
  } catch {
    throw fail("极联接口连不上");
  }
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw fail("极联接口返回了无法解析的内容");
  }
  // 目录类接口成功时 code 可能是 1，零件详情/保养接口是 0
  if (payload?.code !== 1 && payload?.code !== 0) throw fail(String(payload?.msg || "极联查询失败"));
  return payload;
}

const vehicleQuery = async (vin) => {
  const vehicle = await resolveCatalogVehicle(vin);
  return {
    vehicle,
    base: `vin=${encodeURIComponent(vin)}&mcid=${vehicle.mcid}&brandCode=${encodeURIComponent(vehicle.brandCode)}`,
  };
};

/** 替换件：把 parent → child 的边整理成一条从最早（root）到最新的时间轴，另附通用替代。 */
const normalizeReplace = (rows = []) => {
  const seen = new Set();
  const edges = [];
  for (const group of rows) {
    const parent = String(group.parentNum || "").trim();
    for (const item of group.pid || []) {
      const oe = String(item.pid || "").trim();
      if (!parent || !oe) continue;
      const key = parent + "|" + oe;
      if (seen.has(key)) continue; // 同一条替换关系会在多个车型/配置里重复出现
      seen.add(key);
      edges.push({
        parent,
        oe,
        label: clean(item.lable),
        brand: clean(item.brandcn),
        price: Number(item.prices || item.hsPrice || 0) || 0,
        available: item.available !== false,
        remark: clean(item.remark),
        primary: String(group.isRe || "") === "1",
      });
    }
  }
  if (!edges.length) return { chain: [], alternatives: [] };
  const byParent = new Map();
  const incomingMeta = new Map();
  for (const edge of edges) {
    if (!byParent.has(edge.parent)) byParent.set(edge.parent, []);
    byParent.get(edge.parent).push(edge);
    if (!incomingMeta.has(edge.oe)) incomingMeta.set(edge.oe, edge);
  }
  // 起点：root 的第一个后继；没有 root 时取只做父节点、不做子节点的 OE
  const childOes = new Set(edges.map((edge) => edge.oe));
  const start = (byParent.get("root") || [])[0]?.oe
    || edges.find((edge) => !childOes.has(edge.parent) && edge.parent !== "root")?.parent
    || edges[0].oe;
  const chain = [];
  const used = new Set();
  let current = start;
  while (current && !used.has(current)) {
    used.add(current);
    const meta = incomingMeta.get(current) || {};
    chain.push({
      oe: current,
      label: meta.label || "",
      brand: meta.brand || "",
      price: meta.price || 0,
      available: meta.available !== false,
    });
    const outEdges = byParent.get(current) || [];
    const nextEdge = outEdges.find((edge) => edge.primary) || outEdges[0];
    current = nextEdge?.oe;
  }
  const usedOes = new Set(chain.map((node) => node.oe));
  const alternatives = edges.filter((edge) => !edge.primary && !usedOes.has(edge.oe));
  return { chain, alternatives };
};

/** 渠道价格：4S/原厂件等报价。 */
const normalizePlace = (rows = []) => rows.map((row) => ({
  supplier: clean(row.supplier),
  name: clean(row.name),
  partType: clean(row.partType),
  salePrice: clean(row.salePrice),
  costPrice: clean(row.costPrice),
  available: Number(row.available || 0) === 1,
  remark: clean(row.remark),
}));

/** 品牌件反查：OE → 可替代的品牌件（供应商、件号、名称、图片）。 */
const normalizeArticles = (rows = []) => rows.map((row) => {
  const host = String(row.images?.[0] ? "" : "");
  const image = row.images?.[0] ? `https://phyimgs.007vin.com/${row.images[0]}` : "";
  return {
    supplier: clean(row.supplier),
    supplierCn: clean(row.supplierDetail?.nameCn),
    articleNumber: String(row.articleNumber || ""),
    label: clean(row.label),
    oe: String(row.oeNumber || ""),
    status: clean(row.status),
    image,
    host,
  };
});

export async function loadPartExtras(vin, oe) {
  const { base } = await vehicleQuery(vin);
  const query = `${base}&oe=${encodeURIComponent(oe)}`;
  const [place, replace, articles] = await Promise.allSettled([
    hs(`/parts/place/${encodeURIComponent(oe)}?${base}`),
    hs(`/parts/replace/${encodeURIComponent(oe)}?${base}`),
    hs(`/parts/article/${encodeURIComponent(oe)}?${base}`),
  ]);
  return {
    oe,
    place: place.status === "fulfilled" ? normalizePlace(place.value.data || []) : [],
    replace: replace.status === "fulfilled" ? normalizeReplace(replace.value.data || []) : [],
    articles: articles.status === "fulfilled" ? normalizeArticles(articles.value.data || []) : [],
    errors: {
      place: place.status === "rejected" ? place.reason.message : "",
      replace: replace.status === "rejected" ? replace.reason.message : "",
      articles: articles.status === "rejected" ? articles.reason.message : "",
    },
    query,
  };
}

/** 保养件：保养项目 + 每个项目下的零件（可选）。 */
export async function loadMaintenance(vin) {
  const { vehicle } = await vehicleQuery(vin);
  // 保养接口要求 mcid 再编码一次（%2B → %252B）
  const mcid = encodeURIComponent(vehicle.mcid);
  const base = `vin=${encodeURIComponent(vin)}&mcid=${mcid}&brandCode=${encodeURIComponent(vehicle.brandCode)}`;
  const list = await hs(`/maintenance/list?${base}`);
  const items = (list.data || []).map((row) => ({
    sequence: Number(row.sequence || 0),
    name: clean(row.name),
    freq: clean(row.freq),
    manHours: clean(row.manHours),
    mcid: String(row.mcid || ""),
    parts: [],
  }));
  return { items };
}

/** 保养项目下的零件明细。 */
export async function loadMaintenanceParts(vin, mcid) {
  const { vehicle } = await vehicleQuery(vin);
  const query = `vin=${encodeURIComponent(vin)}&mcid=${encodeURIComponent(mcid || "")}&brandCode=${encodeURIComponent(vehicle.brandCode)}`;
  const payload = await hs(`/maintenance/part/list?${query}`);
  const normalizeQuantity = (value) => {
    const values = clean(value).split(/\s+/).filter(Boolean);
    return values.length ? [...new Set(values)].join(" / ") : "";
  };
  return (payload.data || []).map((row) => ({
    oe: String(row.pid || ""),
    name: clean(row.label || row.name),
    quantity: normalizeQuantity(row.quantity || row.num),
    price: clean(row.price),
    discontinued: /弃用/.test(clean(row.label || row.name)),
  }));
}

async function epcGet(path) {
  const { token } = readEpcSession();
  if (!token) throw fail("极联登录已失效，需要换 token", 401);
  const response = await fetch(`${apiBase()}${path}`, { headers: { ...HEADERS, token }, signal: AbortSignal.timeout(requestTimeout) });
  const payload = await response.json().catch(() => null);
  if (!payload || String(payload.code) !== "0") throw fail(payload?.msg || "极联记录接口失败");
  return payload.data;
}

/** VIN 查询记录（扣次明细）。 */
export async function loadEpcRecords(page = 1, size = 20) {
  const data = await epcGet(`/epc/record/getEpcUseRecord?page=${page}&size=${size}`);
  return {
    total: Number(data?.total || data?.count || 0) || 0,
    items: (data?.list || []).map((row) => ({
      time: String(row.createTime || ""),
      type: clean(row.type?.name || ""),
      times: Number(row.times ?? 0),
      entId: row.entId,
    })),
  };
}
