import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const apiBase = () => String(process.env.EPC_API_BASE || "https://epcapi.g-part.cn").replace(/\/+$/, "");
const tokenFile = () => process.env.EPC_TOKEN_FILE || resolve("data/epc-token.json");
const requestTimeout = 15_000;

export function readEpcToken() {
  const fromEnv = String(process.env.EPC_TOKEN || "").trim();
  if (fromEnv) return fromEnv;
  const file = tokenFile();
  if (!existsSync(file)) return "";
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    return String(typeof raw === "string" ? raw : raw?.token || "").trim();
  } catch {
    return "";
  }
}

export const epcConfigured = () => Boolean(readEpcToken());

/** token 的 JWT 载荷里带着 userId / userName，目录接口（hsPort）要把它们作为参数带上。 */
export function readEpcSession() {
  const token = readEpcToken();
  try {
    const payload = JSON.parse(Buffer.from(String(token).split(".")[1] || "", "base64").toString("utf8"));
    const subject = JSON.parse(payload.sub || "{}");
    return { token, userId: String(subject.userId || ""), userName: String(subject.userName || "") };
  } catch {
    return { token, userId: "", userName: "" };
  }
}

const EPC_HEADERS = {
  accept: "application/json, text/plain, */*",
  origin: "https://epc.g-part.cn",
  referer: "https://epc.g-part.cn/",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36",
};

function epcError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function epcGet(path, params = {}) {
  const token = readEpcToken();
  if (!token) throw epcError("未配置极联 token", 409, "EPC_NO_TOKEN");
  const url = new URL(`${apiBase()}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  let response;
  try {
    response = await fetch(url, { headers: { ...EPC_HEADERS, token }, signal: AbortSignal.timeout(requestTimeout) });
  } catch {
    throw epcError("极联接口暂时连不上", 502, "EPC_UNREACHABLE");
  }
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw epcError("极联接口返回了无法解析的内容", 502, "EPC_BAD_PAYLOAD");
  }
  const code = String(payload?.code ?? "");
  if (code === "401" || /token/i.test(String(payload?.msg || ""))) {
    throw epcError("极联登录已失效，需要换 token", 401, "EPC_TOKEN_INVALID");
  }
  if (payload?.success === false) throw epcError(String(payload?.msg || "极联接口调用失败"), 502, "EPC_FAILED");
  return payload;
}

const text = (value) => String(value ?? "").trim();
const yearOf = (value) => {
  const match = /(?:19|20)\d{2}/.exec(text(value));
  return match ? match[0] : "";
};

// 极联只返回底盘代号；代系（第几代）与平台代号由 vehicle_generations 对照表补齐，
// 调用方传 resolve(series, chassisCode) 进来，表里没有时只填平台代号 = 底盘代号。
const fallbackChassis = (series, chassisCode) => ({ generation: "", platform: text(chassisCode) });

function normalizeCandidate(model = {}, resolve = fallbackChassis) {
  const chassis = resolve(model.Series, model.Chassis_code);
  return {
    id: model.Id ?? model.Js_id ?? null,
    model: text(model.Model),
    modelDetail: text(model.Model_detail),
    series: text(model.Series),
    seriesEn: text(model.Series_en),
    modelYear: text(model.Model_year),
    yearFrom: yearOf(model.Date_begin),
    yearTo: yearOf(model.Date_end),
    dateBegin: text(model.Date_begin),
    dateEnd: text(model.Date_end),
    engine: text(model.Engine_no),
    displacement: text(model.Cc),
    power: text(model.Kw),
    horsepower: text(model.Hp),
    transmission: text(model.Transmission_detail),
    gears: text(model.Gear_num),
    drive: text(model.Driving_mode),
    body: text(model.Body_type),
    fuel: text(model.Fuel_type),
    intake: text(model.Air_intake),
    emission: text(model.Effluent_standard),
    salesVersion: text(model.Sales_version),
    ...chassis,
    seats: text(model.Seat_num),
    price: text(model.Price),
  };
}

export function normalizeEpcVinPayload(payload, resolve = fallbackChassis) {
  const outer = payload?.data;
  const data = outer && typeof outer === "object" && outer.data && typeof outer.data === "object" ? outer.data : outer || {};
  const models = Array.isArray(data.model_list) ? data.model_list.filter(Boolean) : [];
  const [first] = models;
  if (!first) {
    return { source: "epc", vin: text(data.full_vin), matched: false, candidates: [] };
  }
  const chassis = resolve(first.Series, first.Chassis_code);
  return {
    source: "epc",
    matched: true,
    vin: text(data.full_vin),
    brand: text(data.brand || data.epc_cn || first.Brand),
    brandEn: text(first.Brand_en),
    series: text(first.Series),
    seriesEn: text(first.Series_en),
    model: text(first.Model),
    modelDetail: text(first.Model_detail),
    year: text(first.Model_year),
    yearFrom: yearOf(first.Date_begin) || yearOf(data.model_year_from_vin) || yearOf(first.Model_year),
    yearTo: yearOf(first.Date_end) || yearOf(first.Model_year),
    dateBegin: text(first.Date_begin),
    dateEnd: text(first.Date_end),
    engine: text(first.Engine_no),
    displacement: text(first.Cc),
    power: text(first.Kw),
    horsepower: text(first.Hp),
    transmission: text(first.Transmission_detail),
    gears: text(first.Gear_num),
    drive: text(first.Driving_mode),
    body: text(first.Body_type),
    fuel: text(first.Fuel_type),
    intake: text(first.Air_intake),
    emission: text(first.Effluent_standard),
    seats: text(first.Seat_num),
    chassisCode: text(first.Chassis_code),
    generation: chassis.generation || "",
    platform: chassis.platform || text(first.Chassis_code),
    salesVersion: text(first.Sales_version),
    modelYearFromVin: text(data.model_year_from_vin),
    buildDate: text(data.build_date),
    madeIn: text(data.made_in_cn),
    epc: text(data.epc),
    epcId: text(data.epc_id),
    matchingMode: text(data.matching_mode),
    candidates: models.map((model) => normalizeCandidate(model, resolve)),
  };
}

export const EPC_CACHE_VERSION = 5;

export async function decodeVinViaEpc(vin, resolve = fallbackChassis) {
  const payload = await epcGet("/api/oms/getVinAnalysisData", { vin });
  return { ...normalizeEpcVinPayload(payload, resolve), version: EPC_CACHE_VERSION };
}

export async function readEpcQuota() {
  const payload = await epcGet("/epc/record/getEpcTimes");
  const data = payload?.data || {};
  return {
    remaining: Number(data.epcTimes ?? 0) || 0,
    lever: Number(data.lever ?? 0) || 0,
    activity: Number(data.activityTimes ?? 0) || 0,
  };
}

export async function readEpcStatus() {
  if (!epcConfigured()) return { configured: false, quota: null };
  try {
    return { configured: true, quota: await readEpcQuota() };
  } catch (error) {
    return { configured: true, quota: null, error: error.message, code: error.code || "" };
  }
}
