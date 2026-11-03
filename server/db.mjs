import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const now = () => new Date().toISOString();
const normalizeCode = (value = "") => value.trim().toUpperCase();
export const normalizeOe = (value = "") => normalizeCode(value).replace(/[^A-Z0-9]/g, "");

const seedGroups = [
  { id: "brake", name: "前制动片套装", reference: "DEMO-BP01", image: "brake-pads.png", note: "前轴制动片，按品牌与材质区分", category: "制动片" },
  { id: "filter", name: "机油滤清器", reference: "DEMO-OF01", image: "oil-filter.png", note: "旋装式与纸芯式分别管理", category: "滤清器" },
  { id: "arm", name: "前下摆臂", reference: "DEMO-CA01", image: "control-arm.png", note: "左/右安装位置分别管理", category: "底盘悬挂" },
];

const seedSkus = [
  ["DEMO-BP01-001", "brake", "BOSCH", "0986-AB1234", "套", 1, 368, "enabled", "04465-0E010", "丰田", "凯美瑞", 2018, 2022, "前轴"],
  ["DEMO-BP01-002", "brake", "ATE", "GDB1234", "套", 1, 285, "enabled", "04465-33160", "本田", "雅阁", 2018, 2022, "前轴"],
  ["DEMO-BP01-003", "brake", "TRW", "FDB4321", "套", 1, 326, "enabled", "04465-42160", "大众", "迈腾", 2017, 2021, "前轴"],
  ["DEMO-OF01-001", "filter", "MANN", "W 712/90", "个", 1, 68, "enabled", "90915-YZZJ1", "丰田", "卡罗拉", 2019, 2023, "发动机"],
  ["DEMO-OF01-002", "filter", "MAHLE", "OC 593/3", "个", 1, 72, "enabled", "90915-YZZJ2", "本田", "思域", 2020, 2023, "发动机"],
  ["DEMO-CA01-001", "arm", "TRW", "JTC1234", "个", 1, 320, "enabled", "3C0407151", "大众", "迈腾", 2017, 2021, "前轴左"],
  ["DEMO-CA01-002", "arm", "LEMFÖRDER", "RH-CA5678", "个", 1, 298, "enabled", "3C0407152", "大众", "迈腾", 2017, 2021, "前轴右"],
  ["DEMO-CA01-003", "arm", "DELPHI", "TC2590", "个", 1, 310, "disabled", "8K0407151", "奥迪", "A4L", 2017, 2020, "前轴左"],
  ["DEMO-CA01-004", "arm", "MOOG", "K620223", "个", 1, 288, "enabled", "8K0407152", "奥迪", "A4L", 2017, 2020, "前轴右"],
];

function migrate(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS product_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      reference TEXT NOT NULL UNIQUE,
      image TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS skus (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES product_groups(id) ON DELETE RESTRICT,
      brand TEXT NOT NULL DEFAULT '',
      part_no TEXT NOT NULL,
      unit TEXT NOT NULL,
      pack_quantity INTEGER NOT NULL DEFAULT 1 CHECK (pack_quantity > 0),
      price REAL NOT NULL DEFAULT 0 CHECK (price >= 0),
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'enabled', 'disabled')),
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_skus_brand_part_no ON skus(brand, part_no COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_skus_group ON skus(group_id);
    CREATE INDEX IF NOT EXISTS idx_skus_status ON skus(status);
    CREATE TABLE IF NOT EXISTS sku_oe_numbers (
      sku_id TEXT NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
      oe_no TEXT NOT NULL,
      normalized_oe TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
      PRIMARY KEY (sku_id, normalized_oe)
    );
    CREATE INDEX IF NOT EXISTS idx_sku_oe_normalized ON sku_oe_numbers(normalized_oe);
    CREATE TABLE IF NOT EXISTS sku_fitments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku_id TEXT NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
      make TEXT NOT NULL,
      series TEXT NOT NULL,
      year_from INTEGER,
      year_to INTEGER,
      variant TEXT NOT NULL DEFAULT '',
      engine TEXT NOT NULL DEFAULT '',
      position TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
      note TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_fitments_sku ON sku_fitments(sku_id);
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku_id TEXT,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      created_at TEXT NOT NULL
    );
  `);
}

function seed(db) {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM product_groups").get();
  if (count) return;
  const insertGroup = db.prepare(`INSERT INTO product_groups (id, name, reference, image, note, category, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertSku = db.prepare(`INSERT INTO skus (id, group_id, brand, part_no, unit, pack_quantity, price, status, note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`);
  const insertOe = db.prepare("INSERT INTO sku_oe_numbers (sku_id, oe_no, normalized_oe, is_primary) VALUES (?, ?, ?, 1)");
  const insertFitment = db.prepare(`INSERT INTO sku_fitments
    (sku_id, make, series, year_from, year_to, position, source, verification_status)
    VALUES (?, ?, ?, ?, ?, ?, '供应商目录', 'verified')`);
  const timestamp = now();
  db.exec("BEGIN");
  try {
    for (const group of seedGroups) insertGroup.run(group.id, group.name, group.reference, group.image, group.note, group.category, timestamp, timestamp);
    for (const [id, groupId, brand, partNo, unit, packQuantity, price, status, oe, make, series, yearFrom, yearTo, position] of seedSkus) {
      insertSku.run(id, groupId, brand, partNo, unit, packQuantity, price, status, timestamp, timestamp);
      insertOe.run(id, oe, normalizeOe(oe));
      insertFitment.run(id, make, series, yearFrom, yearTo, position);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function openDatabase(file = process.env.SKU_DB_PATH || resolve("data/sku-library.sqlite")) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  migrate(db);
  seed(db);
  return db;
}

export function readSku(db, skuId) {
  const sku = db.prepare(`SELECT s.*, g.name AS group_name, g.reference AS group_reference, g.image AS group_image,
    g.note AS group_note, g.category AS group_category
    FROM skus s JOIN product_groups g ON g.id = s.group_id WHERE s.id = ?`).get(skuId);
  if (!sku) return null;
  return {
    id: sku.id,
    groupId: sku.group_id,
    brand: sku.brand,
    partNo: sku.part_no,
    unit: sku.unit,
    packQuantity: sku.pack_quantity,
    price: sku.price,
    status: sku.status,
    note: sku.note,
    createdAt: sku.created_at,
    updatedAt: sku.updated_at,
    group: {
      id: sku.group_id,
      name: sku.group_name,
      reference: sku.group_reference,
      image: sku.group_image,
      note: sku.group_note,
      category: sku.group_category,
    },
    oeNumbers: db.prepare("SELECT oe_no AS oeNo, is_primary AS isPrimary FROM sku_oe_numbers WHERE sku_id = ? ORDER BY is_primary DESC, oe_no").all(skuId),
    fitments: db.prepare(`SELECT id, make, series, year_from AS yearFrom, year_to AS yearTo, variant, engine, position,
      source, verification_status AS verificationStatus, note FROM sku_fitments WHERE sku_id = ? ORDER BY id`).all(skuId),
  };
}

export function listActivity(db, skuId) {
  return db.prepare(`SELECT id, sku_id AS skuId, action, summary, created_at AS createdAt
    FROM activity_logs WHERE sku_id = ? ORDER BY id DESC LIMIT 50`).all(skuId);
}

export function listGroups(db) {
  return db.prepare(`SELECT id, name, reference, image, note, category
    FROM product_groups ORDER BY name COLLATE NOCASE`).all();
}

export function logActivity(db, { skuId, action, summary, before = null, after = null }) {
  db.prepare(`INSERT INTO activity_logs (sku_id, action, summary, before_json, after_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(skuId, action, summary, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, now());
}

export function listCatalog(db, filters = {}) {
  const search = String(filters.search || "").trim().toLowerCase();
  const category = String(filters.category || "").trim();
  const status = String(filters.status || "").trim();
  const page = Math.max(Number(filters.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(filters.pageSize) || 20, 1), 100);

  const groupRows = db.prepare("SELECT * FROM product_groups ORDER BY name COLLATE NOCASE").all();
  const skuRows = db.prepare(`SELECT s.*, GROUP_CONCAT(o.oe_no, '||') AS oe_numbers
    FROM skus s LEFT JOIN sku_oe_numbers o ON o.sku_id = s.id
    GROUP BY s.id ORDER BY s.id`).all();
  const byGroup = new Map();
  for (const sku of skuRows) {
    const oeNumbers = sku.oe_numbers ? sku.oe_numbers.split("||") : [];
    const matchText = `${sku.id} ${sku.brand} ${sku.part_no} ${oeNumbers.join(" ")}`.toLowerCase();
    const item = { ...sku, oeNumbers, matchesSearch: !search || matchText.includes(search) };
    if (!byGroup.has(sku.group_id)) byGroup.set(sku.group_id, []);
    byGroup.get(sku.group_id).push(item);
  }

  const matchingGroups = groupRows.flatMap((group) => {
    if (category && group.category !== category) return [];
    const allSkus = byGroup.get(group.id) || [];
    const groupMatches = !search || `${group.name} ${group.reference} ${group.category}`.toLowerCase().includes(search);
    const skus = allSkus.filter((sku) => {
      const incomplete = !sku.brand || !sku.part_no || !sku.oeNumbers.length;
      const statusMatches = !status || (status === "incomplete" ? incomplete : sku.status === status);
      return statusMatches && (groupMatches || sku.matchesSearch);
    });
    return skus.length ? [{ group, skus }] : [];
  });

  const totalGroups = matchingGroups.length;
  const pageGroups = matchingGroups.slice((page - 1) * pageSize, page * pageSize);
  const fitmentStmt = db.prepare(`SELECT make, series, year_from AS yearFrom, year_to AS yearTo, variant, engine, position,
    source, verification_status AS verificationStatus, note FROM sku_fitments WHERE sku_id = ? ORDER BY id`);
  const groups = pageGroups.map(({ group, skus }) => ({
    id: group.id,
    name: group.name,
    reference: group.reference,
    image: group.image,
    note: group.note,
    category: group.category,
    skus: skus.map((sku) => ({
      id: sku.id,
      brand: sku.brand,
      partNo: sku.part_no,
      unit: sku.unit,
      packQuantity: sku.pack_quantity,
      price: sku.price,
      status: sku.status,
      note: sku.note,
      oeNumbers: sku.oeNumbers,
      fitments: fitmentStmt.all(sku.id),
      updatedAt: sku.updated_at,
    })),
  }));

  const counts = db.prepare(`SELECT
    COUNT(*) AS allCount,
    SUM(status = 'draft') AS draftCount,
    SUM(status = 'disabled') AS disabledCount,
    SUM(brand = '' OR part_no = '' OR NOT EXISTS (SELECT 1 FROM sku_oe_numbers o WHERE o.sku_id = skus.id)) AS incompleteCount
    FROM skus`).get();

  return {
    groups,
    pagination: { page, pageSize, totalGroups, totalPages: Math.max(Math.ceil(totalGroups / pageSize), 1) },
    counts: {
      all: counts.allCount,
      draft: counts.draftCount || 0,
      disabled: counts.disabledCount || 0,
      incomplete: counts.incompleteCount || 0,
    },
    categories: db.prepare("SELECT category, COUNT(*) AS count FROM product_groups GROUP BY category ORDER BY category").all(),
  };
}

function validatePayload(payload, { creating }) {
  const errors = {};
  const sku = payload?.sku || {};
  const group = payload?.group || {};
  if (creating && !normalizeCode(sku.id)) errors.id = "请填写 SKU 编码";
  if (!group.id && !String(group.name || "").trim()) errors.groupName = "请选择商品组或填写商品名称";
  if (!group.id && !String(group.reference || "").trim()) errors.groupReference = "请填写商品组参考编码";
  if (!group.id && !String(group.category || "").trim()) errors.category = "请选择配件品类";
  if (!String(sku.partNo || "").trim()) errors.partNo = "请填写品牌件号";
  if (!String(sku.unit || "").trim()) errors.unit = "请选择基础单位";
  if (!Number.isInteger(Number(sku.packQuantity)) || Number(sku.packQuantity) < 1) errors.packQuantity = "包装数量必须为正整数";
  if (!Number.isFinite(Number(sku.price)) || Number(sku.price) < 0) errors.price = "销售价不能小于 0";
  const oeNumbers = (payload?.oeNumbers || []).map((item) => String(item).trim()).filter(Boolean);
  if (!oeNumbers.length) errors.oeNumbers = "至少填写一个 OE 号";
  if (Object.keys(errors).length) {
    const error = new Error("SKU 资料校验失败");
    error.status = 422;
    error.details = errors;
    throw error;
  }
}

function replaceRelations(db, skuId, oeNumbers, fitments) {
  db.prepare("DELETE FROM sku_oe_numbers WHERE sku_id = ?").run(skuId);
  const insertOe = db.prepare("INSERT INTO sku_oe_numbers (sku_id, oe_no, normalized_oe, is_primary) VALUES (?, ?, ?, ?)");
  const uniqueOes = [...new Map(oeNumbers.map((item) => [normalizeOe(item), String(item).trim()])).entries()].filter(([normalized]) => normalized);
  uniqueOes.forEach(([normalized, display], index) => insertOe.run(skuId, display, normalized, index === 0 ? 1 : 0));

  db.prepare("DELETE FROM sku_fitments WHERE sku_id = ?").run(skuId);
  const insertFitment = db.prepare(`INSERT INTO sku_fitments
    (sku_id, make, series, year_from, year_to, variant, engine, position, source, verification_status, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const fitment of fitments || []) {
    if (!String(fitment.make || "").trim() || !String(fitment.series || "").trim()) continue;
    insertFitment.run(
      skuId,
      String(fitment.make).trim(),
      String(fitment.series).trim(),
      fitment.yearFrom ? Number(fitment.yearFrom) : null,
      fitment.yearTo ? Number(fitment.yearTo) : null,
      String(fitment.variant || "").trim(),
      String(fitment.engine || "").trim(),
      String(fitment.position || "").trim(),
      String(fitment.source || "").trim(),
      ["pending", "verified", "rejected"].includes(fitment.verificationStatus) ? fitment.verificationStatus : "pending",
      String(fitment.note || "").trim(),
    );
  }
}

function resolveGroup(db, group) {
  if (group.id) {
    const existing = db.prepare("SELECT * FROM product_groups WHERE id = ?").get(group.id);
    if (!existing) {
      const error = new Error("商品组不存在");
      error.status = 404;
      throw error;
    }
    return existing.id;
  }
  const idBase = normalizeCode(group.reference).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `group-${Date.now()}`;
  let id = idBase;
  let suffix = 2;
  while (db.prepare("SELECT 1 FROM product_groups WHERE id = ?").get(id)) id = `${idBase}-${suffix++}`;
  const timestamp = now();
  db.prepare(`INSERT INTO product_groups (id, name, reference, image, note, category, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id,
    String(group.name).trim(),
    normalizeCode(group.reference),
    String(group.image || "").trim(),
    String(group.note || "").trim(),
    String(group.category).trim(),
    timestamp,
    timestamp,
  );
  return id;
}

function convertSqliteError(error) {
  if (String(error.message).includes("skus.id")) {
    error.status = 409;
    error.details = { id: "SKU 编码已存在" };
  } else if (String(error.message).includes("skus.brand, skus.part_no")) {
    error.status = 409;
    error.details = { partNo: "相同品牌和品牌件号已存在" };
  } else if (String(error.message).includes("product_groups.reference")) {
    error.status = 409;
    error.details = { groupReference: "商品组参考编码已存在" };
  }
  return error;
}

export function createSku(db, payload) {
  validatePayload(payload, { creating: true });
  const skuId = normalizeCode(payload.sku.id);
  db.exec("BEGIN");
  try {
    const groupId = resolveGroup(db, payload.group);
    const timestamp = now();
    db.prepare(`INSERT INTO skus (id, group_id, brand, part_no, unit, pack_quantity, price, status, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      skuId,
      groupId,
      String(payload.sku.brand || "").trim(),
      String(payload.sku.partNo).trim(),
      String(payload.sku.unit).trim(),
      Number(payload.sku.packQuantity),
      Number(payload.sku.price),
      ["draft", "enabled", "disabled"].includes(payload.sku.status) ? payload.sku.status : "draft",
      String(payload.sku.note || "").trim(),
      timestamp,
      timestamp,
    );
    replaceRelations(db, skuId, payload.oeNumbers, payload.fitments);
    const created = readSku(db, skuId);
    logActivity(db, { skuId, action: "create", summary: "创建 SKU", after: created });
    db.exec("COMMIT");
    return created;
  } catch (error) {
    db.exec("ROLLBACK");
    throw convertSqliteError(error);
  }
}

export function updateSku(db, skuId, payload) {
  validatePayload(payload, { creating: false });
  const existing = readSku(db, skuId);
  if (!existing) {
    const error = new Error("SKU 不存在");
    error.status = 404;
    throw error;
  }
  db.exec("BEGIN");
  try {
    const groupId = resolveGroup(db, payload.group);
    db.prepare(`UPDATE skus SET group_id = ?, brand = ?, part_no = ?, unit = ?, pack_quantity = ?, price = ?, status = ?, note = ?, updated_at = ?
      WHERE id = ?`).run(
      groupId,
      String(payload.sku.brand || "").trim(),
      String(payload.sku.partNo).trim(),
      String(payload.sku.unit).trim(),
      Number(payload.sku.packQuantity),
      Number(payload.sku.price),
      ["draft", "enabled", "disabled"].includes(payload.sku.status) ? payload.sku.status : existing.status,
      String(payload.sku.note || "").trim(),
      now(),
      skuId,
    );
    replaceRelations(db, skuId, payload.oeNumbers, payload.fitments);
    const updated = readSku(db, skuId);
    logActivity(db, { skuId, action: "update", summary: "更新 SKU 资料", before: existing, after: updated });
    db.exec("COMMIT");
    return updated;
  } catch (error) {
    db.exec("ROLLBACK");
    throw convertSqliteError(error);
  }
}

export function updateStatus(db, skuId, status, reason = "") {
  if (!["draft", "enabled", "disabled"].includes(status)) {
    const error = new Error("无效的 SKU 状态");
    error.status = 422;
    throw error;
  }
  const existing = readSku(db, skuId);
  if (!existing) {
    const error = new Error("SKU 不存在");
    error.status = 404;
    throw error;
  }
  db.prepare("UPDATE skus SET status = ?, updated_at = ? WHERE id = ?").run(status, now(), skuId);
  const updated = readSku(db, skuId);
  logActivity(db, { skuId, action: "status", summary: `${status === "enabled" ? "启用" : status === "disabled" ? "停用" : "转为草稿"}：${reason || "未填写原因"}`, before: existing, after: updated });
  return updated;
}

export function deleteDraft(db, skuId) {
  const existing = readSku(db, skuId);
  if (!existing) return false;
  if (existing.status !== "draft") {
    const error = new Error("只有草稿 SKU 可以删除");
    error.status = 409;
    throw error;
  }
  db.prepare("DELETE FROM skus WHERE id = ?").run(skuId);
  logActivity(db, { skuId, action: "delete", summary: "删除草稿 SKU", before: existing });
  return true;
}
