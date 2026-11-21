import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  addSkuRelation, createDictionaryItem, createGroup, createSku, createVehicle, deleteDictionaryItem, deleteGroup,
  deleteSku, deleteSkuRelation,
  deleteVehicle, exportSkuRows, importSkuRows,
  createVehicleGeneration, deleteVehicleGeneration,
  listActivity, listBrands, listCatalog, listDictionaries, listGroups, listPartTypes, listSkuRelations, listVehicles,
  listVehicleGenerations, lookupVehicleParts, mergeGroups, openDatabase, previewGroupMerge, readEpcVinCache, readSku,
  addSkuImages, deleteSkuImage, listSkuImages,
  readVehicle, updateDictionaryItem, updateGroup, updateSku, updateSkuImage, updateStatus, updateVehicle,
  updateVehicleGeneration, resolveVehicleGeneration,
  writeEpcVinCache,
} from "./db.mjs";
import { decodeVinViaEpc, EPC_CACHE_VERSION, loginEpc, logoutEpc, readEpcQuota, readEpcStatus } from "./epc.mjs";
import { loadCatalog, loadGroupCounts, loadParts, loadSubgroups } from "./epc-catalog.mjs";
import { aliasesForOes, aliasKeyOf, deletePartAlias, listPartAliases, oeKeyOf, upsertPartAlias } from "./part-aliases.mjs";
import { searchEpcWorld } from "./epc-search.mjs";
import { loadEpcRecords, loadMaintenance, loadMaintenanceParts, loadPartExtras } from "./epc-extras.mjs";
import { listBrandCatalog, listBrandParts, loadOeSkus } from "./brand-catalog.mjs";

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

const IMAGE_TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

export function createApp({ db = openDatabase(), uploadDir = process.env.SKU_UPLOAD_DIR || resolve("data/uploads") } = {}) {
  const storeImage = (skuId, dataUrl) => {
    const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
    if (!match) {
      const error = new Error("图片格式不支持");
      error.status = 422;
      throw error;
    }
    const extension = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length > 4 * 1024 * 1024) {
      const error = new Error("图片不能超过 4MB");
      error.status = 413;
      throw error;
    }
    mkdirSync(uploadDir, { recursive: true });
    const base = String(skuId).replace(/[^a-zA-Z0-9_-]+/g, "_");
    const filename = `sku-${base}-${Date.now().toString(36)}.${extension}`;
    writeFileSync(join(uploadDir, filename), buffer);
    return filename;
  };
  const applyImage = (skuId, previous, dataUrl) => {
    const filename = storeImage(skuId, dataUrl);
    const saved = updateSkuImage(db, skuId, filename);
    if (previous && previous !== filename) {
      try { unlinkSync(join(uploadDir, previous)); } catch { /* 旧图已不存在 */ }
    }
    return saved;
  };

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
      if (req.method === "GET" && pathname === "/api/vin/epc/status") {
        return json(res, 200, await readEpcStatus());
      }
      if (req.method === "GET" && pathname === "/api/epc/status") {
        return json(res, 200, await readEpcStatus());
      }
      if (req.method === "POST" && pathname === "/api/epc/login") {
        const body = await readJson(req);
        return json(res, 200, await loginEpc(body.account, body.password));
      }
      if (req.method === "POST" && pathname === "/api/epc/logout") {
        logoutEpc();
        return json(res, 200, await readEpcStatus());
      }
      if (req.method === "GET" && pathname === "/api/vin/epc") {
        const vin = String(requestUrl.searchParams.get("vin") || "").trim().toUpperCase();
        if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
          return json(res, 422, { error: "VIN 应为 17 位字母数字，且不含 I、O、Q" });
        }
        const fresh = requestUrl.searchParams.get("fresh") === "1";
        const cached = fresh ? null : readEpcVinCache(db, vin);
        if (cached && cached.version === EPC_CACHE_VERSION) {
          const resolved = resolveVehicleGeneration(db, cached.series, cached.chassisCode);
          return json(res, 200, { ...cached, ...resolved, cached: true });
        }
        const decoded = await decodeVinViaEpc(vin, (series, chassis) => resolveVehicleGeneration(db, series, chassis));
        writeEpcVinCache(db, vin, decoded);
        let quota = null;
        try { quota = await readEpcQuota(); } catch { /* 配额不影响解析结果 */ }
        return json(res, 200, { ...decoded, cached: false, quota });
      }
      const epcVin = () => String(requestUrl.searchParams.get("vin") || "").trim().toUpperCase();
      const validEpcVin = (vin) => /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
      if (req.method === "GET" && pathname === "/api/epc/catalog") {
        const vin = epcVin();
        if (!validEpcVin(vin)) return json(res, 422, { error: "VIN 应为 17 位字母数字，且不含 I、O、Q" });
        return json(res, 200, await loadCatalog(vin));
      }
      if (req.method === "GET" && pathname === "/api/epc/group") {
        const vin = epcVin();
        const num = String(requestUrl.searchParams.get("num") || "").trim();
        if (!validEpcVin(vin) || !num) return json(res, 422, { error: "需要 VIN 与主组编号" });
        return json(res, 200, { subgroups: await loadSubgroups(vin, num) });
      }
      if (req.method === "GET" && pathname === "/api/epc/counts") {
        const vin = epcVin();
        if (!validEpcVin(vin)) return json(res, 422, { error: "VIN 应为 17 位字母数字，且不含 I、O、Q" });
        return json(res, 200, { counts: await loadGroupCounts(vin) });
      }
      if (req.method === "GET" && pathname === "/api/epc/parts") {
        const vin = epcVin();
        const num = String(requestUrl.searchParams.get("num") || "").trim();
        const mid = String(requestUrl.searchParams.get("mid") || "").trim();
        if (!validEpcVin(vin) || !num || !mid) return json(res, 422, { error: "需要 VIN、主组编号与图号" });
        const applicableOnly = requestUrl.searchParams.get("filter") === "1";
        const payload = await loadParts(vin, num, mid, { applicableOnly });
        const aliasMap = aliasesForOes(db, payload.parts.map((part) => part.oe).filter(Boolean));
        payload.parts = payload.parts.map((part) => ({ ...part, aliases: part.oe ? aliasMap.get(oeKeyOf(part.oe)) || [] : [] }));
        return json(res, 200, payload);
      }
      if (req.method === "GET" && pathname === "/api/part-aliases") {
        return json(res, 200, {
          items: listPartAliases(db, {
            q: String(requestUrl.searchParams.get("q") || ""),
            oe: String(requestUrl.searchParams.get("oe") || ""),
          }),
        });
      }
      if (req.method === "POST" && pathname === "/api/part-aliases") {
        return json(res, 201, upsertPartAlias(db, await readJson(req)));
      }
      const partAliasMatch = pathname.match(/^\/api\/part-aliases\/(\d+)$/);
      if (req.method === "DELETE" && partAliasMatch) {
        if (!deletePartAlias(db, partAliasMatch[1])) return json(res, 404, { error: "别名不存在" });
        return json(res, 200, { ok: true });
      }
      if (req.method === "GET" && pathname === "/api/brand-catalog/brands") {
        return json(res, 200, { items: listBrandCatalog(db) });
      }
      if (req.method === "GET" && pathname === "/api/brand-catalog/items") {
        return json(res, 200, listBrandParts(db, {
          brand: String(requestUrl.searchParams.get("brand") || ""),
          q: String(requestUrl.searchParams.get("q") || ""),
          page: Number(requestUrl.searchParams.get("page") || 1),
          size: Number(requestUrl.searchParams.get("size") || 20),
        }));
      }
      if (req.method === "GET" && pathname === "/api/epc/part-extras") {
        const vin = epcVin();
        const oe = String(requestUrl.searchParams.get("oe") || "").trim();
        if (!validEpcVin(vin) || !oe) return json(res, 422, { error: "需要 VIN 与 OE 号" });
        try {
          const extras = await loadPartExtras(vin, oe);
          return json(res, 200, { ...extras, products: loadOeSkus(db, oe) });
        } catch (error) {
          return json(res, error.status || 502, { error: error.message });
        }
      }
      if (req.method === "GET" && pathname === "/api/epc/records") {
        try {
          return json(res, 200, await loadEpcRecords(Number(requestUrl.searchParams.get("page") || 1), Number(requestUrl.searchParams.get("size") || 20)));
        } catch (error) {
          return json(res, error.status || 502, { error: error.message });
        }
      }
      if (req.method === "GET" && pathname === "/api/epc/maintenance") {
        const vin = epcVin();
        if (!validEpcVin(vin)) return json(res, 422, { error: "VIN 应为 17 位字母数字，且不含 I、O、Q" });
        try {
          return json(res, 200, await loadMaintenance(vin));
        } catch (error) {
          return json(res, error.status || 502, { error: error.message });
        }
      }
      if (req.method === "GET" && pathname === "/api/epc/maintenance/parts") {
        const vin = epcVin();
        const mcid = String(requestUrl.searchParams.get("mcid") || "");
        if (!validEpcVin(vin) || !mcid) return json(res, 422, { error: "需要 VIN 与保养项目 mcid" });
        try {
          return json(res, 200, { items: await loadMaintenanceParts(vin, mcid) });
        } catch (error) {
          return json(res, error.status || 502, { error: error.message });
        }
      }
      if (req.method === "GET" && pathname === "/api/epc/search") {
        const vin = epcVin();
        if (!validEpcVin(vin)) return json(res, 422, { error: "VIN 应为 17 位字母数字，且不含 I、O、Q" });
        const q = String(requestUrl.searchParams.get("q") || "").trim();
        if (!q) return json(res, 200, { status: "ready", results: [], total: 0 });
        let base;
        try {
          base = await searchEpcWorld(vin, q);
        } catch (searchError) {
          return json(res, searchError.status || 502, { error: searchError.message });
        }
        const results = [...base.results];
        const seen = new Set(results.map((item) => `${item.mid}|${item.position}|${item.oe}`));
        // 别名叫法：命中别名后用它对应的 OE 再查一次，把该图号上的零件带出来
        const keyword = aliasKeyOf(q);
        const aliases = keyword ? listPartAliases(db, { q, limit: 30 }).filter((item) => aliasKeyOf(item.alias).includes(keyword)) : [];
        for (const alias of aliases.slice(0, 3)) {
          try {
            const extra = await searchEpcWorld(vin, alias.oe);
            for (const item of extra.results) {
              const id = `${item.mid}|${item.position}|${item.oe}`;
              if (seen.has(id)) continue;
              seen.add(id);
              results.unshift({ ...item, kind: "alias", aliases: [alias.alias] });
            }
          } catch { /* 单个别名查询失败不影响主结果 */ }
        }
        return json(res, 200, { status: "ready", results, total: results.length });
      }
      if (req.method === "GET" && pathname === "/api/generations") {
        return json(res, 200, { items: listVehicleGenerations(db) });
      }
      if (req.method === "POST" && pathname === "/api/generations") {
        return json(res, 201, createVehicleGeneration(db, await readJson(req)));
      }
      const generationMatch = pathname.match(/^\/api\/generations\/([^/]+)$/);
      if (req.method === "PUT" && generationMatch) {
        return json(res, 200, updateVehicleGeneration(db, decodeURIComponent(generationMatch[1]), await readJson(req)));
      }
      if (req.method === "DELETE" && generationMatch) {
        deleteVehicleGeneration(db, decodeURIComponent(generationMatch[1]));
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
      const skuImageMatch = pathname.match(/^\/api\/skus\/([^/]+)\/image$/);
      const skuImagesMatch = pathname.match(/^\/api\/skus\/([^/]+)\/images$/);
      const skuImageItemMatch = pathname.match(/^\/api\/skus\/([^/]+)\/images\/(\d+)$/);
      const statusMatch = pathname.match(/^\/api\/skus\/([^/]+)\/status$/);
      const activityMatch = pathname.match(/^\/api\/skus\/([^/]+)\/activity$/);
      const relationsMatch = pathname.match(/^\/api\/skus\/([^/]+)\/relations$/);
      const relationMatch = pathname.match(/^\/api\/relations\/(\d+)$/);
      if (skuImagesMatch && req.method === "GET") {
        const skuId = decodeURIComponent(skuImagesMatch[1]);
        return json(res, 200, { images: listSkuImages(db, skuId) });
      }
      if (skuImagesMatch && req.method === "POST") {
        const skuId = decodeURIComponent(skuImagesMatch[1]);
        const body = await readJson(req);
        const dataUrls = Array.isArray(body.dataUrls) ? body.dataUrls.filter((item) => typeof item === "string").slice(0, 12) : [];
        if (!dataUrls.length) return json(res, 422, { error: "请选择图片" });
        const filenames = dataUrls.map((dataUrl) => storeImage(skuId, dataUrl));
        return json(res, 200, { images: addSkuImages(db, skuId, filenames) });
      }
      if (skuImageItemMatch && req.method === "GET") {
        const skuId = decodeURIComponent(skuImageItemMatch[1]);
        const imageId = Number(skuImageItemMatch[2]);
        const row = listSkuImages(db, skuId).find((item) => Number(item.id) === imageId);
        if (!row) return json(res, 404, { error: "图片不存在" });
        const file = join(uploadDir, row.filename);
        if (!existsSync(file)) return json(res, 404, { error: "图片文件不存在" });
        const extension = String(row.filename).split(".").pop().toLowerCase();
        res.writeHead(200, {
          "content-type": IMAGE_TYPES[extension] || "application/octet-stream",
          "cache-control": "private, max-age=60",
          "x-content-type-options": "nosniff",
        });
        res.end(readFileSync(file));
        return;
      }
      if (skuImageItemMatch && req.method === "DELETE") {
        const skuId = decodeURIComponent(skuImageItemMatch[1]);
        const imageId = Number(skuImageItemMatch[2]);
        const filename = deleteSkuImage(db, skuId, imageId);
        if (!filename) return json(res, 404, { error: "图片不存在" });
        try { unlinkSync(join(uploadDir, filename)); } catch { /* 忽略缺失文件 */ }
        return json(res, 200, { images: listSkuImages(db, skuId) });
      }
      if (skuImageMatch && req.method === "GET") {
        const sku = readSku(db, decodeURIComponent(skuImageMatch[1]));
        if (!sku || !sku.image) return json(res, 404, { error: "没有商品图" });
        const file = join(uploadDir, sku.image);
        if (!existsSync(file)) return json(res, 404, { error: "图片文件不存在" });
        const extension = sku.image.split(".").pop().toLowerCase();
        res.writeHead(200, {
          "content-type": IMAGE_TYPES[extension] || "application/octet-stream",
          "cache-control": "private, max-age=60",
          "x-content-type-options": "nosniff",
        });
        res.end(readFileSync(file));
        return;
      }
      if (skuImageMatch && req.method === "POST") {
        const skuId = decodeURIComponent(skuImageMatch[1]);
        const body = await readJson(req);
        const previous = readSku(db, skuId)?.image || "";
        return json(res, 200, applyImage(skuId, previous, body.dataUrl));
      }
      if (skuImageMatch && req.method === "DELETE") {
        const skuId = decodeURIComponent(skuImageMatch[1]);
        const previous = readSku(db, skuId)?.image || "";
        if (previous) {
          try { unlinkSync(join(uploadDir, previous)); } catch { /* 忽略缺失文件 */ }
        }
        updateSkuImage(db, skuId, "");
        return noContent(res);
      }
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
        const body = await readJson(req);
        const created = createSku(db, body);
        if (body.imageDataUrl) return json(res, 201, applyImage(created.id, "", body.imageDataUrl));
        return json(res, 201, created);
      }
      if (req.method === "PUT" && skuMatch) {
        const skuId = decodeURIComponent(skuMatch[1]);
        const body = await readJson(req);
        const updated = updateSku(db, skuId, body);
        if (body.imageDataUrl) return json(res, 200, applyImage(skuId, updated.image, body.imageDataUrl));
        if (body.removeImage) return json(res, 200, updateSkuImage(db, skuId, ""));
        return json(res, 200, updated);
      }
      if (req.method === "PATCH" && statusMatch) {
        const body = await readJson(req);
        return json(res, 200, updateStatus(db, decodeURIComponent(statusMatch[1]), body.status, body.reason));
      }
      if (req.method === "DELETE" && skuMatch) {
        const deleted = deleteSku(db, decodeURIComponent(skuMatch[1]));
        if (deleted?.image) {
          try { unlinkSync(join(uploadDir, deleted.image)); } catch { /* 图片文件可能已不存在 */ }
        }
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
