import { createServer } from "node:http";
import {
  addSkuRelation, createDictionaryItem, createGroup, createSku, createVehicle, deleteDictionaryItem, deleteDraft,
  deleteGroup, deleteSkuRelation,
  deleteVehicle, exportSkuRows, importSkuRows,
  listActivity, listBrands, listCatalog, listDictionaries, listGroups, listPartTypes, listSkuRelations, listVehicles,
  lookupVehicleParts, mergeGroups, openDatabase, previewGroupMerge, readSku,
  readVehicle, updateDictionaryItem, updateGroup, updateSku, updateStatus, updateVehicle,
} from "./db.mjs";

const json = (res, status, body) => {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(data);
};

const noContent = (res) => {
  res.writeHead(204, { "cache-control": "no-store" });
  res.end();
};

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2_000_000) {
      const error = new Error("请求内容过大");
      error.status = 413;
      throw error;
    }
  }
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("JSON 格式错误");
    error.status = 400;
    throw error;
  }
}

const apiPath = (pathname) => pathname.replace(/^\/hsx-sku/, "");

export function createApp({ db = openDatabase() } = {}) {
  return createServer(async (req, res) => {
    const requestUrl = new URL(req.url, "http://localhost");
    const pathname = apiPath(requestUrl.pathname);
    try {
      if (req.method === "GET" && pathname === "/api/health") {
        return json(res, 200, { ok: true, service: "hsx-sku-api" });
      }
      if (req.method === "GET" && pathname === "/api/catalog") {
        return json(res, 200, listCatalog(db, Object.fromEntries(requestUrl.searchParams)));
      }
      if (req.method === "GET" && pathname === "/api/groups") {
        return json(res, 200, { items: listGroups(db) });
      }
      if (req.method === "GET" && pathname === "/api/brands") {
        return json(res, 200, { items: listBrands(db) });
      }
      if (req.method === "GET" && pathname === "/api/dictionaries") {
        return json(res, 200, listDictionaries(db));
      }
      const dictionaryMatch = pathname.match(/^\/api\/dictionaries\/([^/]+)$/);
      const dictionaryItemMatch = pathname.match(/^\/api\/dictionaries\/([^/]+)\/([^/]+)$/);
      if (req.method === "POST" && dictionaryMatch) {
        return json(res, 201, createDictionaryItem(db, decodeURIComponent(dictionaryMatch[1]), await readJson(req)));
      }
      if (req.method === "PUT" && dictionaryItemMatch) {
        return json(res, 200, updateDictionaryItem(
          db,
          decodeURIComponent(dictionaryItemMatch[1]),
          decodeURIComponent(dictionaryItemMatch[2]),
          await readJson(req),
        ));
      }
      if (req.method === "DELETE" && dictionaryItemMatch) {
        deleteDictionaryItem(db, decodeURIComponent(dictionaryItemMatch[1]), decodeURIComponent(dictionaryItemMatch[2]));
        return noContent(res);
      }
      const groupMatch = pathname.match(/^\/api\/groups\/([^/]+)$/);
      if (req.method === "POST" && pathname === "/api/groups/merge/preview") {
        const body = await readJson(req);
        return json(res, 200, previewGroupMerge(db, body.sourceId, body.targetId));
      }
      if (req.method === "POST" && pathname === "/api/groups/merge") {
        const body = await readJson(req);
        return json(res, 200, mergeGroups(db, body.sourceId, body.targetId));
      }
      if (req.method === "POST" && pathname === "/api/groups") {
        return json(res, 201, createGroup(db, await readJson(req)));
      }
      if (req.method === "PUT" && groupMatch) {
        return json(res, 200, updateGroup(db, decodeURIComponent(groupMatch[1]), await readJson(req)));
      }
      if (req.method === "DELETE" && groupMatch) {
        const force = requestUrl.searchParams.get("force") === "1" || requestUrl.searchParams.get("force") === "true";
        deleteGroup(db, decodeURIComponent(groupMatch[1]), { force });
        return noContent(res);
      }
      if (req.method === "GET" && pathname === "/api/vehicles") {
        return json(res, 200, { items: listVehicles(db) });
      }
      if (req.method === "GET" && pathname === "/api/part-types") {
        return json(res, 200, listPartTypes(db));
      }
      if (req.method === "POST" && pathname === "/api/vehicles") {
        return json(res, 201, createVehicle(db, await readJson(req)));
      }
      const vehicleMatch = pathname.match(/^\/api\/vehicles\/([^/]+)$/);
      if (req.method === "GET" && vehicleMatch) {
        const vehicle = readVehicle(db, decodeURIComponent(vehicleMatch[1]));
        return vehicle ? json(res, 200, vehicle) : json(res, 404, { error: "车型不存在" });
      }
      if (req.method === "PUT" && vehicleMatch) {
        return json(res, 200, updateVehicle(db, decodeURIComponent(vehicleMatch[1]), await readJson(req)));
      }
      if (req.method === "DELETE" && vehicleMatch) {
        deleteVehicle(db, decodeURIComponent(vehicleMatch[1]));
        return noContent(res);
      }
      if (req.method === "GET" && pathname === "/api/vehicle-lookup") {
        return json(res, 200, lookupVehicleParts(db, requestUrl.searchParams.get("q") || ""));
      }
      if (req.method === "GET" && pathname === "/api/export") {
        return json(res, 200, { items: exportSkuRows(db) });
      }
      if (req.method === "POST" && pathname === "/api/import/preview") {
        const body = await readJson(req);
        return json(res, 200, importSkuRows(db, body.rows, { mode: body.mode, preview: true }));
      }
      if (req.method === "POST" && pathname === "/api/import") {
        const body = await readJson(req);
        const result = importSkuRows(db, body.rows, { mode: body.mode, preview: false });
        return json(res, result.errors.length ? 422 : 200, result);
      }
      const skuMatch = pathname.match(/^\/api\/skus\/([^/]+)$/);
      const statusMatch = pathname.match(/^\/api\/skus\/([^/]+)\/status$/);
      const activityMatch = pathname.match(/^\/api\/skus\/([^/]+)\/activity$/);
      const relationsMatch = pathname.match(/^\/api\/skus\/([^/]+)\/relations$/);
      const relationMatch = pathname.match(/^\/api\/relations\/(\d+)$/);
      if (req.method === "GET" && relationsMatch) {
        return json(res, 200, listSkuRelations(db, decodeURIComponent(relationsMatch[1])));
      }
      if (req.method === "POST" && relationsMatch) {
        return json(res, 201, addSkuRelation(db, decodeURIComponent(relationsMatch[1]), await readJson(req)));
      }
      if (req.method === "DELETE" && relationMatch) {
        deleteSkuRelation(db, relationMatch[1]);
        return noContent(res);
      }
      if (req.method === "GET" && skuMatch) {
        const sku = readSku(db, decodeURIComponent(skuMatch[1]));
        return sku ? json(res, 200, sku) : json(res, 404, { error: "SKU 不存在" });
      }
      if (req.method === "GET" && activityMatch) {
        return json(res, 200, { items: listActivity(db, decodeURIComponent(activityMatch[1])) });
      }
      if (req.method === "POST" && pathname === "/api/skus") {
        return json(res, 201, createSku(db, await readJson(req)));
      }
      if (req.method === "PUT" && skuMatch) {
        return json(res, 200, updateSku(db, decodeURIComponent(skuMatch[1]), await readJson(req)));
      }
      if (req.method === "PATCH" && statusMatch) {
        const body = await readJson(req);
        return json(res, 200, updateStatus(db, decodeURIComponent(statusMatch[1]), body.status, body.reason));
      }
      if (req.method === "DELETE" && skuMatch) {
        deleteDraft(db, decodeURIComponent(skuMatch[1]));
        return noContent(res);
      }
      return json(res, 404, { error: "接口不存在" });
    } catch (error) {
      if (!error.status || error.status >= 500) console.error(error);
      return json(res, error.status || 500, {
        error: error.status ? error.message : "服务器处理失败",
        details: error.details || undefined,
      });
    }
  });
}
