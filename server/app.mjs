import { createServer } from "node:http";
import { createSku, deleteDraft, listActivity, listCatalog, listGroups, openDatabase, readSku, updateSku, updateStatus } from "./db.mjs";

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
      const skuMatch = pathname.match(/^\/api\/skus\/([^/]+)$/);
      const statusMatch = pathname.match(/^\/api\/skus\/([^/]+)\/status$/);
      const activityMatch = pathname.match(/^\/api\/skus\/([^/]+)\/activity$/);
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
