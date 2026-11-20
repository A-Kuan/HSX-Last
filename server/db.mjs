import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const now = () => new Date().toISOString();
const normalizeCode = (value = "") => value.trim().toUpperCase();
export const normalizeOe = (value = "") => normalizeCode(value).replace(/[^A-Z0-9]/g, "");
const normalizeText = (value = "") => String(value).toLowerCase().replace(/[\s\-_/.·,，。()（）+]+/g, "");

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
    CREATE TABLE IF NOT EXISTS group_oe_numbers (
      group_id TEXT NOT NULL REFERENCES product_groups(id) ON DELETE CASCADE,
      oe_no TEXT NOT NULL,
      normalized_oe TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
      PRIMARY KEY (group_id, normalized_oe)
    );
    CREATE INDEX IF NOT EXISTS idx_group_oe_normalized ON group_oe_numbers(normalized_oe);
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
    CREATE TABLE IF NOT EXISTS part_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      system TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS part_sets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS part_set_items (
      set_id TEXT NOT NULL REFERENCES part_sets(id) ON DELETE CASCADE,
      part_type_id TEXT NOT NULL REFERENCES part_types(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (set_id, part_type_id)
    );
    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      brand TEXT NOT NULL,
      series TEXT NOT NULL,
      generation TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL DEFAULT '',
      year_from INTEGER,
      year_to INTEGER,
      engine TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      drive TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    -- 旧版本地 VIN 规则表，随极联解码移除
    DROP TABLE IF EXISTS vehicle_vin_rules;

    CREATE TABLE IF NOT EXISTS epc_vin_cache (
      vin TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vehicle_generations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      series TEXT NOT NULL,
      chassis_code TEXT NOT NULL,
      generation TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_generations_key ON vehicle_generations(series, chassis_code);
    CREATE TABLE IF NOT EXISTS vehicle_aliases (
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      alias TEXT NOT NULL,
      normalized TEXT NOT NULL,
      PRIMARY KEY (vehicle_id, normalized)
    );
    CREATE INDEX IF NOT EXISTS idx_vehicle_aliases_normalized ON vehicle_aliases(normalized);
    CREATE TABLE IF NOT EXISTS vehicle_products (
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      group_id TEXT NOT NULL REFERENCES product_groups(id) ON DELETE CASCADE,
      part_type_id TEXT NOT NULL REFERENCES part_types(id),
      position TEXT NOT NULL DEFAULT '',
      verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
      source TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (vehicle_id, group_id)
    );
    CREATE INDEX IF NOT EXISTS idx_vehicle_products_group ON vehicle_products(group_id);
    CREATE TABLE IF NOT EXISTS sku_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_sku_id TEXT NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
      to_sku_id TEXT NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
      relation_type TEXT NOT NULL CHECK (relation_type IN ('interchange', 'supersedes')),
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      CHECK (from_sku_id <> to_sku_id),
      UNIQUE (from_sku_id, to_sku_id, relation_type)
    );
    CREATE INDEX IF NOT EXISTS idx_sku_relations_from ON sku_relations(from_sku_id);
    CREATE INDEX IF NOT EXISTS idx_sku_relations_to ON sku_relations(to_sku_id);
    CREATE TABLE IF NOT EXISTS categories (
      name TEXT PRIMARY KEY,
      prefix TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS brands (
      name TEXT PRIMARY KEY COLLATE NOCASE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS units (
      name TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS oem_brands (
      name TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS origins (
      name TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS channels (
      name TEXT PRIMARY KEY,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
  ensureColumn(db, "product_groups", "position", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "skus", "origin", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "skus", "channel", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "group_oe_numbers", "breakpoint_date", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "categories", "prefix", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "brands", "alias", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "brands", "note", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "brands", "enabled", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn(db, "brands", "updated_at", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "skus", "source_type", "TEXT NOT NULL DEFAULT 'brand'");
  ensureColumn(db, "skus", "oem_brand", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "skus", "image", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "vehicles", "vin", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "vehicles", "displacement", "TEXT NOT NULL DEFAULT ''");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_vin ON vehicles(vin) WHERE vin <> ''");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_skus_part_key ON skus(source_type, oem_brand, brand, part_no COLLATE NOCASE, origin) WHERE part_no <> ''");
  db.exec("DROP INDEX IF EXISTS idx_skus_brand_part_no");
  db.exec("CREATE INDEX IF NOT EXISTS idx_skus_oem_brand ON skus(oem_brand)");
}

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.some((item) => item.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

const seedPartTypes = [
  ["oil-filter", "机油滤清器", "保养件", 1],
  ["air-filter", "空气滤清器", "保养件", 2],
  ["cabin-filter", "空调滤清器", "保养件", 3],
  ["fuel-filter", "燃油滤清器", "保养件", 4],
];

const seedPartSets = [
  ["sanlv", "三滤", "机油滤清器、空气滤清器、空调滤清器", [["oil-filter", 1], ["air-filter", 2], ["cabin-filter", 3]]],
  ["silv", "四滤", "三滤再加燃油滤清器", [["oil-filter", 1], ["air-filter", 2], ["cabin-filter", 3], ["fuel-filter", 4]]],
];

const seedCategories = [["制动片", "ZD"], ["滤清器", "LX"], ["底盘悬挂", "DP"], ["保养件", "BY"]];
const seedBrands = ["BOSCH", "MANN", "MAHLE", "TRW", "DELPHI", "MOOG", "ATE", "LEMFÖRDER", "SACHS", "SKF", "VALEO", "DENSO", "NGK", "FEBI", "SWAG"];
const seedUnits = ["个", "件", "套", "盒"];
const seedOemBrands = ["奥迪", "保时捷", "大众", "宝马", "奔驰", "丰田", "本田", "日产", "别克", "福特"];
const seedOrigins = ["进口", "国产"];
const seedChannels = ["4S/服务站", "平行进口", "电商", "批发"];

const seedVehicleGroups = [
  { id: "of-ea839", name: "机油滤清器（纸芯）", reference: "DEMO-FL01", image: "oil-filter.png", category: "滤清器", note: "纸芯式，适配 EA839 3.0T" },
  { id: "af-ea839", name: "空气滤清器（方型）", reference: "DEMO-FL02", image: "oil-filter.png", category: "滤清器", note: "方型滤芯" },
  { id: "cf-ea839", name: "空调滤清器（活性炭）", reference: "DEMO-FL03", image: "oil-filter.png", category: "滤清器", note: "带活性炭层" },
];

const seedVehicleSkus = [
  ["DEMO-FL01-001", "of-ea839", "MANN", "HU 7029 Z", "个", 1, 96, "enabled", "059 115 562"],
  ["DEMO-FL01-002", "of-ea839", "MAHLE", "OX 1044D", "个", 1, 88, "enabled", "059 115 562"],
  ["DEMO-FL01-003", "of-ea839", "BOSCH", "F 026 407 024", "个", 1, 82, "enabled", "059 115 562"],
  ["DEMO-FL02-001", "af-ea839", "MANN", "C 30015", "个", 1, 168, "enabled", "9Y0 129 620"],
  ["DEMO-FL02-002", "af-ea839", "MAHLE", "LX 2734", "个", 1, 152, "enabled", "9Y0 129 620"],
  ["DEMO-FL02-003", "af-ea839", "BOSCH", "F 026 400 495", "个", 1, 145, "enabled", "9Y0 129 620"],
  ["DEMO-FL03-001", "cf-ea839", "MANN", "CU 26017", "个", 1, 118, "enabled", "9Y0 819 439"],
  ["DEMO-FL03-002", "cf-ea839", "MAHLE", "LAK 445", "个", 1, 132, "enabled", "9Y0 819 439"],
  ["DEMO-FL03-003", "cf-ea839", "BOSCH", "R 2405", "个", 1, 109, "disabled", "9Y0 819 439"],
];

const seedVehicles = [
  {
    id: "veh-cayenne-e3", brand: "保时捷", series: "Cayenne", generation: "E3", platform: "9YA",
    yearFrom: 2018, yearTo: 2023, engine: "3.0T / 2.9T", body: "SUV", drive: "四驱",
    aliases: ["卡宴", "凯宴", "Cayenne", "卡宴E3", "E3", "9YA", "保时捷卡宴", "卡宴9YA"],
  },
  {
    id: "veh-touareg-cr7", brand: "大众", series: "途锐", generation: "CR7", platform: "CR",
    yearFrom: 2018, yearTo: 2023, engine: "3.0T", body: "SUV", drive: "四驱",
    aliases: ["途锐", "Touareg", "途锐CR7", "CR7", "途锐3.0T"],
  },
];

const vehicleProductLinks = [
  ["veh-cayenne-e3", "of-ea839", "oil-filter"],
  ["veh-cayenne-e3", "af-ea839", "air-filter"],
  ["veh-cayenne-e3", "cf-ea839", "cabin-filter"],
  ["veh-touareg-cr7", "of-ea839", "oil-filter"],
  ["veh-touareg-cr7", "af-ea839", "air-filter"],
  ["veh-touareg-cr7", "cf-ea839", "cabin-filter"],
];

function ensureReferenceData(db) {
  const insertPartType = db.prepare("INSERT OR IGNORE INTO part_types (id, name, system, sort_order) VALUES (?, ?, ?, ?)");
  for (const [id, name, system, sortOrder] of seedPartTypes) insertPartType.run(id, name, system, sortOrder);
  const insertSet = db.prepare("INSERT OR IGNORE INTO part_sets (id, name, note) VALUES (?, ?, ?)");
  const insertSetItem = db.prepare("INSERT OR IGNORE INTO part_set_items (set_id, part_type_id, sort_order) VALUES (?, ?, ?)");
  for (const [id, name, note, items] of seedPartSets) {
    insertSet.run(id, name, note);
    for (const [partTypeId, sortOrder] of items) insertSetItem.run(id, partTypeId, sortOrder);
  }
  ensureDictionarySeeds(db);
  ensureVehicleGenerations(db);
}

/** 极联只返回底盘代号；代系（第几代）与平台代号由这张对照表补齐，配置中心可维护。 */
const seedVehicleGenerations = [
  ["凯宴", "9PA", "第一代", "9PA"],
  ["凯宴", "E1", "第一代", "9PA"],
  ["凯宴", "92A", "第二代", "92A"],
  ["凯宴", "E2", "第二代", "92A"],
  ["凯宴", "E3", "第三代", "9YA"],
  ["凯宴", "9YA", "第三代", "9YA"],
  ["迈凯", "95B", "第一代", "95B"],
  ["帕拉梅拉", "970", "第一代", "970"],
  ["帕拉梅拉", "971", "第二代", "971"],
  ["Taycan", "9J1", "第一代", "9J1"],
];

function ensureVehicleGenerations(db) {
  const insert = db.prepare(`INSERT OR IGNORE INTO vehicle_generations
    (series, chassis_code, generation, platform, updated_at) VALUES (?, ?, ?, ?, ?)`);
  const timestamp = now();
  for (const [series, chassisCode, generation, platform] of seedVehicleGenerations) {
    insert.run(series, chassisCode, generation, platform, timestamp);
  }
}

function seedVehicleCatalog(db) {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM vehicles").get();
  if (count) return;
  const timestamp = now();
  db.exec("BEGIN");
  try {
    const insertGroup = db.prepare(`INSERT OR IGNORE INTO product_groups
      (id, name, reference, image, note, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const group of seedVehicleGroups) {
      insertGroup.run(group.id, group.name, group.reference, group.image, group.note, group.category, timestamp, timestamp);
    }
    const insertSku = db.prepare(`INSERT OR IGNORE INTO skus
      (id, group_id, brand, part_no, unit, pack_quantity, price, status, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`);
    const insertOe = db.prepare("INSERT OR IGNORE INTO sku_oe_numbers (sku_id, oe_no, normalized_oe, is_primary) VALUES (?, ?, ?, 1)");
    for (const [id, groupId, brand, partNo, unit, packQuantity, price, status, oe] of seedVehicleSkus) {
      insertSku.run(id, groupId, brand, partNo, unit, packQuantity, price, status, timestamp, timestamp);
      insertOe.run(id, oe, normalizeOe(oe));
    }
    const insertVehicle = db.prepare(`INSERT OR IGNORE INTO vehicles
      (id, brand, series, generation, platform, year_from, year_to, engine, body, drive, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`);
    const insertAlias = db.prepare("INSERT OR IGNORE INTO vehicle_aliases (vehicle_id, alias, normalized) VALUES (?, ?, ?)");
    for (const vehicle of seedVehicles) {
      insertVehicle.run(vehicle.id, vehicle.brand, vehicle.series, vehicle.generation, vehicle.platform,
        vehicle.yearFrom, vehicle.yearTo, vehicle.engine, vehicle.body, vehicle.drive, timestamp, timestamp);
      for (const alias of vehicle.aliases) insertAlias.run(vehicle.id, alias, normalizeText(alias));
    }
    const insertLink = db.prepare(`INSERT OR IGNORE INTO vehicle_products
      (vehicle_id, group_id, part_type_id, source, verification_status, note) VALUES (?, ?, ?, '演示数据', 'pending', '')`);
    for (const [vehicleId, groupId, partTypeId] of vehicleProductLinks) insertLink.run(vehicleId, groupId, partTypeId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
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
  ensureReferenceData(db);
  ensureGroupOeSeeds(db);
  backfillVehicleDisplacement(db);
  return db;
}

/** 排量字段后加，老车型留空时用极联缓存里的解析结果补一次（幂等，只填空值）。 */
function backfillVehicleDisplacement(db) {
  const rows = db.prepare("SELECT id, vin FROM vehicles WHERE vin <> '' AND TRIM(COALESCE(displacement, '')) = ''").all();
  if (!rows.length) return;
  const update = db.prepare("UPDATE vehicles SET displacement = ? WHERE id = ?");
  for (const row of rows) {
    const cached = db.prepare("SELECT payload FROM epc_vin_cache WHERE vin = ?").get(row.vin.toUpperCase());
    if (!cached) continue;
    try {
      const displacement = String(JSON.parse(cached.payload).displacement || "").trim();
      if (displacement) update.run(displacement, row.id);
    } catch { /* 缓存坏了就跳过 */ }
  }
}

/** 把 SKU 上已有的 OE 号上卷到商品组，作为组级 OE 的初始值（幂等）。 */
function ensureGroupOeSeeds(db) {
  db.prepare(`INSERT OR IGNORE INTO group_oe_numbers (group_id, oe_no, normalized_oe, is_primary)
    SELECT s.group_id, o.oe_no, o.normalized_oe, 0
    FROM sku_oe_numbers o JOIN skus s ON s.id = o.sku_id`).run();
}

/** 保存 SKU 时把它的 OE 并入组级 OE：只增不删，已存在的组级条目（含断点日期/主号）保持不变。 */
function mergeSkuOesIntoGroup(db, groupId, oeNumbers = []) {
  const insert = db.prepare(`INSERT OR IGNORE INTO group_oe_numbers
    (group_id, oe_no, normalized_oe, is_primary) VALUES (?, ?, ?, 0)`);
  for (const raw of oeNumbers) {
    const display = String(raw ?? "").trim();
    const normalized = normalizeOe(display);
    if (normalized) insert.run(groupId, display, normalized);
  }
}

/** Demo fixtures for tests and local walkthroughs. Never called by openDatabase. */
export function seedDemoData(db) {
  ensureReferenceData(db);
  seed(db);
  seedVehicleCatalog(db);
  ensureGroupOeSeeds(db);
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
    origin: sku.origin,
    channel: sku.channel,
    sourceType: sku.source_type || "brand",
    oemBrand: sku.oem_brand || "",
    image: sku.image || "",
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
  const rows = db.prepare(`SELECT g.id, g.name, g.reference, g.image, g.note, g.category, g.position,
      (SELECT COUNT(*) FROM skus s WHERE s.group_id = g.id) AS skuCount,
      (SELECT COUNT(*) FROM skus s WHERE s.group_id = g.id AND s.status = 'enabled') AS enabledSkuCount,
      (SELECT COUNT(*) FROM vehicle_products vp WHERE vp.group_id = g.id) AS vehicleCount
    FROM product_groups g ORDER BY g.name COLLATE NOCASE`).all();
  return rows.map((row) => ({ ...row, ...groupOeFields(db, row.id) }));
}

const normalizeBreakpoint = (value) => {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  return digits.length >= 8 ? digits.slice(0, 8) : digits;
};

function groupOeFields(db, groupId) {
  const items = db.prepare(`SELECT oe_no AS oeNo, breakpoint_date AS breakpointDate, is_primary AS isPrimary
    FROM group_oe_numbers WHERE group_id = ?`).all(groupId).map((row) => ({
    oeNo: row.oeNo,
    breakpointDate: row.breakpointDate || "",
    isPrimary: Boolean(row.isPrimary),
  }));
  const weight = (item) => (item.isPrimary ? Number.MAX_SAFE_INTEGER : (Number(item.breakpointDate) || 0));
  items.sort((left, right) => weight(right) - weight(left) || left.oeNo.localeCompare(right.oeNo));
  return { oeItems: items, oeNumbers: items.map((item) => item.oeNo), primaryOe: items.find((item) => item.isPrimary)?.oeNo || "" };
}

function groupOeNumbers(db, groupId) {
  return groupOeFields(db, groupId).oeNumbers;
}

function groupPrimaryOe(db, groupId) {
  return groupOeFields(db, groupId).primaryOe;
}

function replaceGroupOeNumbers(db, groupId, list, primaryOe = "") {
  db.prepare("DELETE FROM group_oe_numbers WHERE group_id = ?").run(groupId);
  const insert = db.prepare("INSERT OR IGNORE INTO group_oe_numbers (group_id, oe_no, normalized_oe, is_primary, breakpoint_date) VALUES (?, ?, ?, ?, ?)");
  const rows = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const display = String((raw && typeof raw === "object" ? raw.oeNo : raw) || "").trim();
    const normalized = normalizeOe(display);
    if (!normalized) continue;
    rows.push({ display, normalized, breakpointDate: normalizeBreakpoint(raw && typeof raw === "object" ? raw.breakpointDate : "") });
  }
  const primaryKey = normalizeOe(primaryOe);
  for (const { display, normalized, breakpointDate } of rows) {
    insert.run(groupId, display, normalized, normalized === primaryKey ? 1 : 0, breakpointDate || "");
  }
}

function normalizeGroupInput(payload = {}) {
  const name = String(payload.name || "").trim();
  const reference = normalizeCode(payload.reference);
  const category = String(payload.category || "").trim();
  const details = {};
  if (!name) details.name = "请填写商品组名称";
  if (!reference) details.reference = "请填写参考编码";
  if (!category) details.category = "请选择配件品类";
  if (Object.keys(details).length) throw httpError(422, "商品组资料不完整", details);
  return {
    name,
    reference,
    category,
    position: String(payload.position || "").trim(),
    note: String(payload.note || "").trim(),
    image: String(payload.image || "").trim(),
  };
}

function uniqueGroupId(db, reference) {
  const base = normalizeCode(reference).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `group-${Date.now()}`;
  let id = base;
  let suffix = 2;
  while (db.prepare("SELECT 1 FROM product_groups WHERE id = ?").get(id)) id = `${base}-${suffix++}`;
  return id;
}

export function readGroup(db, groupId) {
  const row = db.prepare(`SELECT g.id, g.name, g.reference, g.image, g.note, g.category, g.position,
      (SELECT COUNT(*) FROM skus s WHERE s.group_id = g.id) AS skuCount,
      (SELECT COUNT(*) FROM skus s WHERE s.group_id = g.id AND s.status = 'enabled') AS enabledSkuCount,
      (SELECT COUNT(*) FROM vehicle_products vp WHERE vp.group_id = g.id) AS vehicleCount
    FROM product_groups g WHERE g.id = ?`).get(groupId);
  return row ? { ...row, ...groupOeFields(db, row.id) } : null;
}

export function createGroup(db, payload) {
  const input = normalizeGroupInput(payload);
  if (db.prepare("SELECT 1 FROM product_groups WHERE reference = ?").get(input.reference)) {
    throw httpError(409, "参考编码已存在", { reference: "参考编码已存在" });
  }
  const id = uniqueGroupId(db, input.reference);
  const timestamp = now();
  db.exec("BEGIN");
  try {
    db.prepare(`INSERT INTO product_groups (id, name, reference, image, note, category, position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, input.name, input.reference, input.image || "brake-pads.png", input.note, input.category, input.position, timestamp, timestamp,
    );
    replaceGroupOeNumbers(db, id, payload.oeNumbers, payload.primaryOe);
    registerDictionaryValue(db, "categories", input.category);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return readGroup(db, id);
}

export function deleteGroup(db, groupId, { force = false } = {}) {
  const existing = readGroup(db, groupId);
  if (!existing) return false;
  if (!force) {
    if (existing.skuCount > 0) throw httpError(409, `该商品组下还有 ${existing.skuCount} 个 SKU，确认后可连同 SKU 一起删除`, { skuCount: existing.skuCount });
    if (existing.vehicleCount > 0) throw httpError(409, `该商品组被 ${existing.vehicleCount} 台车型引用，确认后可一并解除`, { vehicleCount: existing.vehicleCount });
  }
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM skus WHERE group_id = ?").run(groupId);
    db.prepare("DELETE FROM vehicle_products WHERE group_id = ?").run(groupId);
    db.prepare("DELETE FROM product_groups WHERE id = ?").run(groupId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return true;
}

export function listBrands(db) {
  return db.prepare("SELECT name FROM brands ORDER BY sort_order, name COLLATE NOCASE").all().map((row) => row.name);
}

const DICTIONARY_KINDS = {
  categories: { table: "categories", label: "配件品类", refTable: "product_groups", refColumn: "category" },
  brands: { table: "brands", label: "品牌", refTable: "skus", refColumn: "brand" },
  units: { table: "units", label: "单位", refTable: "skus", refColumn: "unit" },
  origins: { table: "origins", label: "产地", refTable: "skus", refColumn: "origin" },
  channels: { table: "channels", label: "渠道", refTable: "skus", refColumn: "channel" },
  "oem-brands": { table: "oem_brands", label: "整车品牌", refTable: "skus", refColumn: "oem_brand" },
};

function normalizePrefix(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}

function httpError(status, message, details) {
  const error = new Error(message);
  error.status = status;
  if (details) error.details = details;
  return error;
}

function ensureDictionarySeeds(db) {
  const timestamp = now();
  const addCategory = db.prepare("INSERT OR IGNORE INTO categories (name, prefix, sort_order, created_at) VALUES (?, ?, ?, ?)");
  seedCategories.forEach(([name, prefix], index) => addCategory.run(name, prefix, (index + 1) * 10, timestamp));
  db.prepare(`INSERT OR IGNORE INTO categories (name, sort_order, created_at)
    SELECT DISTINCT TRIM(category), 500, ? FROM product_groups WHERE TRIM(category) <> ''`).run(timestamp);
  const backfillPrefix = db.prepare("UPDATE categories SET prefix = ? WHERE name = ? AND prefix = ''");
  for (const [name, prefix] of seedCategories) backfillPrefix.run(prefix, name);
  const addBrand = db.prepare("INSERT OR IGNORE INTO brands (name, sort_order, created_at) VALUES (?, ?, ?)");
  seedBrands.forEach((name, index) => addBrand.run(name, (index + 1) * 10, timestamp));
  db.prepare(`INSERT OR IGNORE INTO brands (name, sort_order, created_at)
    SELECT DISTINCT TRIM(brand), 500, ? FROM skus WHERE TRIM(brand) <> ''`).run(timestamp);
  const addUnit = db.prepare("INSERT OR IGNORE INTO units (name, sort_order, created_at) VALUES (?, ?, ?)");
  seedUnits.forEach((name, index) => addUnit.run(name, (index + 1) * 10, timestamp));
  const addOemBrand = db.prepare("INSERT OR IGNORE INTO oem_brands (name, sort_order, created_at) VALUES (?, ?, ?)");
  seedOemBrands.forEach((name, index) => addOemBrand.run(name, (index + 1) * 10, timestamp));
  db.prepare(`INSERT OR IGNORE INTO oem_brands (name, sort_order, created_at)
    SELECT DISTINCT TRIM(brand), 500, ? FROM vehicles WHERE TRIM(brand) <> ''`).run(timestamp);
  db.prepare(`INSERT OR IGNORE INTO units (name, sort_order, created_at)
    SELECT DISTINCT TRIM(unit), 500, ? FROM skus WHERE TRIM(unit) <> ''`).run(timestamp);
  const addOrigin = db.prepare("INSERT OR IGNORE INTO origins (name, sort_order, created_at) VALUES (?, ?, ?)");
  seedOrigins.forEach((name, index) => addOrigin.run(name, (index + 1) * 10, timestamp));
  db.prepare(`INSERT OR IGNORE INTO origins (name, sort_order, created_at)
    SELECT DISTINCT TRIM(origin), 500, ? FROM skus WHERE TRIM(origin) <> ''`).run(timestamp);
  const addChannel = db.prepare("INSERT OR IGNORE INTO channels (name, sort_order, created_at) VALUES (?, ?, ?)");
  seedChannels.forEach((name, index) => addChannel.run(name, (index + 1) * 10, timestamp));
  db.prepare(`INSERT OR IGNORE INTO channels (name, sort_order, created_at)
    SELECT DISTINCT TRIM(channel), 500, ? FROM skus WHERE TRIM(channel) <> ''`).run(timestamp);
}

/** 新增 SKU / 商品组时把没登记过的品牌、单位、品类补进字典，配置中心里就能看到。 */
function registerDictionaryValue(db, kind, value) {
  const config = DICTIONARY_KINDS[kind];
  const name = String(value ?? "").trim();
  if (!config || !name) return;
  db.prepare(`INSERT OR IGNORE INTO ${config.table} (name, sort_order, created_at) VALUES (?, 500, ?)`).run(name, now());
}

function countDictionaryUsage(db, config, name) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${config.refTable} WHERE ${config.refColumn} = ? COLLATE NOCASE`).get(name).count;
}

export function listDictionaries(db) {
  const list = (table, refTable, refColumn, collate = "") => db.prepare(`SELECT d.name, d.sort_order AS sortOrder,
      (SELECT COUNT(*) FROM ${refTable} r WHERE r.${refColumn} = d.name${collate ? " COLLATE NOCASE" : ""}) AS usageCount
    FROM ${table} d ORDER BY d.sort_order, d.name${collate ? " COLLATE NOCASE" : ""}`).all();
  const { items: partTypes, sets: partSets } = listPartTypes(db);
  return {
    categories: db.prepare(`SELECT c.name, c.prefix, c.sort_order AS sortOrder,
        (SELECT COUNT(*) FROM product_groups g WHERE g.category = c.name) AS usageCount
      FROM categories c ORDER BY c.sort_order, c.name`).all(),
    brands: db.prepare(`SELECT b.name, b.alias, b.note, b.enabled, b.sort_order AS sortOrder,
        (SELECT COUNT(*) FROM skus s WHERE s.brand = b.name COLLATE NOCASE) AS usageCount
      FROM brands b ORDER BY b.sort_order, b.name COLLATE NOCASE`).all(),
    units: list("units", "skus", "unit"),
    oemBrands: list("oem_brands", "skus", "oem_brand"),
    origins: list("origins", "skus", "origin"),
    channels: list("channels", "skus", "channel"),
    partTypes: partTypes.map((partType) => ({
      ...partType,
      usageCount: db.prepare(`SELECT
          (SELECT COUNT(*) FROM vehicle_products WHERE part_type_id = ?) +
          (SELECT COUNT(*) FROM part_set_items WHERE part_type_id = ?) AS count`).get(partType.id, partType.id).count,
    })),
    partSets,
  };
}

export function createDictionaryItem(db, kind, payload = {}) {
  if (kind === "part-types") return createPartTypeItem(db, payload);
  if (kind === "part-sets") return createPartSetItem(db, payload);
  const config = DICTIONARY_KINDS[kind];
  if (!config) throw httpError(404, "未知的字典类型");
  const name = String(payload.name ?? "").trim();
  if (!name) throw httpError(422, "请填写名称", { name: "请填写名称" });
  if (name.length > 40) throw httpError(422, "名称最多 40 个字符", { name: "名称最多 40 个字符" });
  if (db.prepare(`SELECT 1 FROM ${config.table} WHERE name = ? COLLATE NOCASE`).get(name)) {
    throw httpError(409, `${config.label}已存在`, { name: `${config.label}已存在` });
  }
  const sortOrder = db.prepare(`SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM ${config.table}`).get().next;
  if (kind === "categories") {
    const prefix = normalizePrefix(payload.prefix);
    db.prepare("INSERT INTO categories (name, prefix, sort_order, created_at) VALUES (?, ?, ?, ?)").run(name, prefix, sortOrder, now());
    return { name, prefix, sortOrder, usageCount: 0 };
  }
  if (kind === "brands") {
    const alias = String(payload.alias ?? "").trim();
    const note = String(payload.note ?? "").trim();
    const enabled = payload.enabled === undefined || payload.enabled ? 1 : 0;
    db.prepare(`INSERT INTO brands (name, alias, note, enabled, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(name, alias, note, enabled, sortOrder, now(), now());
    return { name, alias, note, enabled, sortOrder, usageCount: 0 };
  }
  db.prepare(`INSERT INTO ${config.table} (name, sort_order, created_at) VALUES (?, ?, ?)`).run(name, sortOrder, now());
  return { name, sortOrder, usageCount: 0 };
}

export function updateDictionaryItem(db, kind, id, payload = {}) {
  if (kind === "part-types") return updatePartTypeItem(db, id, payload);
  if (kind === "part-sets") return updatePartSetItem(db, id, payload);
  const config = DICTIONARY_KINDS[kind];
  if (!config) throw httpError(404, "未知的字典类型");
  const current = db.prepare(`SELECT * FROM ${config.table} WHERE name = ?`).get(id);
  if (!current) throw httpError(404, `${config.label}不存在`);
  const name = String(payload.name ?? current.name).trim();
  if (!name) throw httpError(422, "请填写名称", { name: "请填写名称" });
  if (name === current.name) {
    if (kind === "categories" && payload.prefix !== undefined) {
      const prefix = normalizePrefix(payload.prefix);
      db.prepare("UPDATE categories SET prefix = ? WHERE name = ?").run(prefix, name);
      return { name, prefix, sortOrder: current.sort_order, usageCount: countDictionaryUsage(db, config, name) };
    }
    if (kind === "brands") {
      const alias = payload.alias === undefined ? current.alias : String(payload.alias).trim();
      const note = payload.note === undefined ? current.note : String(payload.note).trim();
      const enabled = payload.enabled === undefined ? current.enabled : (payload.enabled ? 1 : 0);
      db.prepare("UPDATE brands SET alias = ?, note = ?, enabled = ?, updated_at = ? WHERE name = ?")
        .run(alias, note, enabled, now(), name);
      return { name, alias, note, enabled, sortOrder: current.sort_order, usageCount: countDictionaryUsage(db, config, name) };
    }
    return { name, sortOrder: current.sort_order, usageCount: countDictionaryUsage(db, config, name) };
  }
  if (db.prepare(`SELECT 1 FROM ${config.table} WHERE name = ? COLLATE NOCASE`).get(name)) {
    throw httpError(409, `${config.label}已存在`, { name: `${config.label}已存在` });
  }
  db.exec("BEGIN");
  try {
    if (kind === "categories") {
      db.prepare("INSERT INTO categories (name, prefix, sort_order, created_at) VALUES (?, ?, ?, ?)")
        .run(name, normalizePrefix(payload.prefix ?? current.prefix), current.sort_order, current.created_at);
    } else if (kind === "brands") {
      db.prepare(`INSERT INTO brands (name, alias, note, enabled, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
        name,
        payload.alias === undefined ? current.alias : String(payload.alias).trim(),
        payload.note === undefined ? current.note : String(payload.note).trim(),
        payload.enabled === undefined ? current.enabled : (payload.enabled ? 1 : 0),
        current.sort_order,
        current.created_at,
        now(),
      );
    } else {
      db.prepare(`INSERT INTO ${config.table} (name, sort_order, created_at) VALUES (?, ?, ?)`).run(name, current.sort_order, current.created_at);
    }
    db.prepare(`UPDATE ${config.refTable} SET ${config.refColumn} = ? WHERE ${config.refColumn} = ? COLLATE NOCASE`).run(name, current.name);
    db.prepare(`DELETE FROM ${config.table} WHERE name = ?`).run(current.name);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  if (kind === "categories") {
    return {
      name,
      prefix: normalizePrefix(payload.prefix ?? current.prefix),
      sortOrder: current.sort_order,
      usageCount: countDictionaryUsage(db, config, name),
    };
  }
  if (kind === "brands") {
    return {
      name,
      alias: payload.alias === undefined ? current.alias : String(payload.alias).trim(),
      note: payload.note === undefined ? current.note : String(payload.note).trim(),
      enabled: payload.enabled === undefined ? current.enabled : (payload.enabled ? 1 : 0),
      sortOrder: current.sort_order,
      usageCount: countDictionaryUsage(db, config, name),
    };
  }
  return { name, sortOrder: current.sort_order, usageCount: countDictionaryUsage(db, config, name) };
}

export function deleteDictionaryItem(db, kind, id) {
  if (kind === "part-types") return deletePartTypeItem(db, id);
  if (kind === "part-sets") return deletePartSetItem(db, id);
  const config = DICTIONARY_KINDS[kind];
  if (!config) throw httpError(404, "未知的字典类型");
  const current = db.prepare(`SELECT * FROM ${config.table} WHERE name = ?`).get(id);
  if (!current) throw httpError(404, `${config.label}不存在`);
  const count = countDictionaryUsage(db, config, current.name);
  if (count) {
    throw httpError(409, `${config.label}「${current.name}」仍被 ${count} 条资料使用`, { name: `仍被 ${count} 条资料使用` });
  }
  db.prepare(`DELETE FROM ${config.table} WHERE name = ?`).run(current.name);
}

function uniquePartTypeId(db, name) {
  const base = `pt-${Date.now().toString(36)}`;
  let id = base;
  let suffix = 2;
  while (db.prepare("SELECT 1 FROM part_types WHERE id = ?").get(id)) id = `${base}-${suffix++}`;
  return id;
}

function createPartTypeItem(db, payload) {
  const name = String(payload.name ?? "").trim();
  if (!name) throw httpError(422, "请填写名称", { name: "请填写名称" });
  if (db.prepare("SELECT 1 FROM part_types WHERE name = ?").get(name)) throw httpError(409, "件类已存在", { name: "件类已存在" });
  const system = String(payload.system ?? "").trim();
  const sortOrder = db.prepare("SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM part_types").get().next;
  const id = uniquePartTypeId(db, name);
  db.prepare("INSERT INTO part_types (id, name, system, sort_order) VALUES (?, ?, ?, ?)").run(id, name, system, sortOrder);
  return { id, name, system, sortOrder, usageCount: 0 };
}

function updatePartTypeItem(db, id, payload) {
  const current = db.prepare("SELECT * FROM part_types WHERE id = ?").get(id);
  if (!current) throw httpError(404, "件类不存在");
  const name = String(payload.name ?? current.name).trim();
  if (!name) throw httpError(422, "请填写名称", { name: "请填写名称" });
  const clash = db.prepare("SELECT id FROM part_types WHERE name = ? AND id <> ?").get(name, id);
  if (clash) throw httpError(409, "件类已存在", { name: "件类已存在" });
  const system = String(payload.system ?? current.system).trim();
  db.prepare("UPDATE part_types SET name = ?, system = ? WHERE id = ?").run(name, system, id);
  const usageCount = db.prepare(`SELECT
      (SELECT COUNT(*) FROM vehicle_products WHERE part_type_id = ?) +
      (SELECT COUNT(*) FROM part_set_items WHERE part_type_id = ?) AS count`).get(id, id).count;
  return { id, name, system, sortOrder: current.sort_order, usageCount };
}

function deletePartTypeItem(db, id) {
  const current = db.prepare("SELECT * FROM part_types WHERE id = ?").get(id);
  if (!current) throw httpError(404, "件类不存在");
  const usageCount = db.prepare(`SELECT
      (SELECT COUNT(*) FROM vehicle_products WHERE part_type_id = ?) +
      (SELECT COUNT(*) FROM part_set_items WHERE part_type_id = ?) AS count`).get(id, id).count;
  if (usageCount) throw httpError(409, `件类「${current.name}」仍被 ${usageCount} 处引用`, { name: `仍被 ${usageCount} 处引用` });
  db.prepare("DELETE FROM part_types WHERE id = ?").run(id);
}

function normalizePartTypeIds(db, list) {
  const ids = Array.from(new Set(Array.isArray(list) ? list.map((item) => String(item ?? "").trim()).filter(Boolean) : []));
  return ids.filter((id) => db.prepare("SELECT 1 FROM part_types WHERE id = ?").get(id));
}

function replacePartSetItems(db, setId, partTypeIds) {
  const ids = normalizePartTypeIds(db, partTypeIds);
  db.prepare("DELETE FROM part_set_items WHERE set_id = ?").run(setId);
  const insert = db.prepare("INSERT INTO part_set_items (set_id, part_type_id, sort_order) VALUES (?, ?, ?)");
  ids.forEach((partTypeId, index) => insert.run(setId, partTypeId, index + 1));
  return ids;
}

function uniquePartSetId(db) {
  const base = `set-${Date.now().toString(36)}`;
  let id = base;
  let suffix = 2;
  while (db.prepare("SELECT 1 FROM part_sets WHERE id = ?").get(id)) id = `${base}-${suffix++}`;
  return id;
}

function createPartSetItem(db, payload) {
  const name = String(payload.name ?? "").trim();
  if (!name) throw httpError(422, "请填写名称", { name: "请填写名称" });
  if (db.prepare("SELECT 1 FROM part_sets WHERE name = ?").get(name)) throw httpError(409, "套餐已存在", { name: "套餐已存在" });
  const id = uniquePartSetId(db);
  const note = String(payload.note ?? "").trim();
  db.prepare("INSERT INTO part_sets (id, name, note) VALUES (?, ?, ?)").run(id, name, note);
  const partTypeIds = replacePartSetItems(db, id, payload.partTypeIds);
  return { id, name, note, partTypeIds };
}

function updatePartSetItem(db, id, payload) {
  const current = db.prepare("SELECT * FROM part_sets WHERE id = ?").get(id);
  if (!current) throw httpError(404, "套餐不存在");
  const name = String(payload.name ?? current.name).trim();
  if (!name) throw httpError(422, "请填写名称", { name: "请填写名称" });
  const clash = db.prepare("SELECT id FROM part_sets WHERE name = ? AND id <> ?").get(name, id);
  if (clash) throw httpError(409, "套餐已存在", { name: "套餐已存在" });
  const note = String(payload.note ?? current.note).trim();
  db.prepare("UPDATE part_sets SET name = ?, note = ? WHERE id = ?").run(name, note, id);
  const partTypeIds = payload.partTypeIds === undefined
    ? db.prepare("SELECT part_type_id FROM part_set_items WHERE set_id = ? ORDER BY sort_order").all(id).map((row) => row.part_type_id)
    : replacePartSetItems(db, id, payload.partTypeIds);
  return { id, name, note, partTypeIds };
}

function deletePartSetItem(db, id) {
  const current = db.prepare("SELECT * FROM part_sets WHERE id = ?").get(id);
  if (!current) throw httpError(404, "套餐不存在");
  db.prepare("DELETE FROM part_sets WHERE id = ?").run(id);
}

export function updateGroup(db, groupId, payload = {}) {
  const existing = db.prepare("SELECT * FROM product_groups WHERE id = ?").get(groupId);
  if (!existing) {
    const error = new Error("商品组不存在");
    error.status = 404;
    throw error;
  }
  const name = String(payload.name ?? existing.name).trim();
  const reference = normalizeCode(payload.reference ?? existing.reference);
  const category = String(payload.category ?? existing.category).trim();
  const position = payload.position === undefined ? existing.position || "" : String(payload.position).trim();
  const note = payload.note === undefined ? existing.note : String(payload.note).trim();
  const image = payload.image === undefined ? existing.image : String(payload.image).trim();
  const details = {};
  if (!name) details.name = "请填写商品组名称";
  if (!reference) details.reference = "请填写参考编码";
  if (!category) details.category = "请填写配件品类";
  if (Object.keys(details).length) {
    const error = new Error("商品组资料不完整");
    error.status = 422;
    error.details = details;
    throw error;
  }
  const clash = db.prepare("SELECT id FROM product_groups WHERE reference = ? AND id <> ?").get(reference, groupId);
  if (clash) {
    const error = new Error("参考编码已被其他商品组使用");
    error.status = 409;
    error.details = { groupReference: "参考编码已被其他商品组使用" };
    throw error;
  }
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE product_groups SET name = ?, reference = ?, category = ?, position = ?, note = ?, image = ?, updated_at = ? WHERE id = ?")
      .run(name, reference, category, position, note, image, now(), groupId);
    if (payload.oeNumbers !== undefined) replaceGroupOeNumbers(db, groupId, payload.oeNumbers, payload.primaryOe);
    else if (payload.primaryOe !== undefined) db.prepare("UPDATE group_oe_numbers SET is_primary = CASE WHEN normalized_oe = ? THEN 1 ELSE 0 END WHERE group_id = ?").run(normalizeOe(payload.primaryOe), groupId);
    registerDictionaryValue(db, "categories", category);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return readGroup(db, groupId);
}

function groupMergeImpact(db, sourceId, targetId) {
  const source = readGroup(db, sourceId);
  const target = readGroup(db, targetId);
  if (!source) throw httpError(404, "源商品组不存在");
  if (!target) throw httpError(404, "目标商品组不存在");
  if (sourceId === targetId) throw httpError(422, "不能合并到自己");
  const positionMismatch = Boolean(source.position && target.position && source.position !== target.position);
  const skuCount = db.prepare("SELECT COUNT(*) AS count FROM skus WHERE group_id = ?").get(sourceId).count;
  const vehicleLinks = db.prepare("SELECT COUNT(*) AS count FROM vehicle_products WHERE group_id = ?").get(sourceId).count;
  const duplicateLinks = db.prepare(`SELECT COUNT(*) AS count FROM vehicle_products a
    WHERE a.group_id = ? AND EXISTS (SELECT 1 FROM vehicle_products b WHERE b.group_id = ? AND b.vehicle_id = a.vehicle_id)`)
    .get(sourceId, targetId).count;
  const sourceOes = new Set(source.oeNumbers.map((oe) => normalizeOe(oe)));
  const targetOes = new Set(target.oeNumbers.map((oe) => normalizeOe(oe)));
  const overlap = [...sourceOes].filter((oe) => targetOes.has(oe)).length;
  return {
    source,
    target,
    positionMismatch,
    skuCount,
    vehicleLinks,
    duplicateLinks,
    oeOverlap: overlap,
    oeUnionCount: new Set([...sourceOes, ...targetOes]).size,
    canMerge: !positionMismatch,
  };
}

export function previewGroupMerge(db, sourceId, targetId) {
  const { source, target, ...impact } = groupMergeImpact(db, sourceId, targetId);
  return { source, target, ...impact };
}

export function mergeGroups(db, sourceId, targetId) {
  const impact = groupMergeImpact(db, sourceId, targetId);
  if (!impact.canMerge) {
    throw httpError(409, `两个组的安装位置不同（${impact.source.position} / ${impact.target.position}），不能合并`, { positionMismatch: true });
  }
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE skus SET group_id = ?, updated_at = ? WHERE group_id = ?").run(targetId, now(), sourceId);
    db.prepare(`DELETE FROM vehicle_products WHERE group_id = ? AND vehicle_id IN
      (SELECT vehicle_id FROM vehicle_products WHERE group_id = ?)`).run(sourceId, targetId);
    db.prepare("UPDATE vehicle_products SET group_id = ? WHERE group_id = ?").run(targetId, sourceId);
    db.prepare(`INSERT OR IGNORE INTO group_oe_numbers (group_id, oe_no, normalized_oe, is_primary)
      SELECT ?, oe_no, normalized_oe, 0 FROM group_oe_numbers WHERE group_id = ?`).run(targetId, sourceId);
    db.prepare("DELETE FROM product_groups WHERE id = ?").run(sourceId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return readGroup(db, targetId);
}

export function exportSkuRows(db) {
  const rows = db.prepare(`SELECT s.id, s.brand, s.oem_brand, s.source_type, s.part_no, s.unit, s.pack_quantity, s.price, s.status, s.note,
    g.id AS group_id, g.name AS group_name, g.reference AS group_reference, g.category AS group_category
    FROM skus s JOIN product_groups g ON g.id = s.group_id ORDER BY g.name COLLATE NOCASE, s.id`).all();
  const oeStmt = db.prepare("SELECT oe_no FROM sku_oe_numbers WHERE sku_id = ? ORDER BY is_primary DESC, oe_no");
  const fitmentStmt = db.prepare(`SELECT make, series, year_from, year_to, variant, engine, position, source, verification_status, note
    FROM sku_fitments WHERE sku_id = ? ORDER BY id`);
  return rows.map((row) => ({
    groupReference: row.group_reference,
    groupName: row.group_name,
    category: row.group_category,
    id: row.id,
    brand: row.brand,
    oemBrand: row.oem_brand,
    sourceType: row.source_type,
    partNo: row.part_no,
    unit: row.unit,
    packQuantity: row.pack_quantity,
    price: row.price,
    status: row.status,
    oeNumbers: oeStmt.all(row.id).map((item) => item.oe_no),
    fitments: fitmentStmt.all(row.id).map((item) => ({
      make: item.make,
      series: item.series,
      yearFrom: item.year_from,
      yearTo: item.year_to,
      variant: item.variant,
      engine: item.engine,
      position: item.position,
      source: item.source,
      verificationStatus: item.verification_status,
      note: item.note,
    })),
    note: row.note,
  }));
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
  const compactSearch = search.replace(/[^a-z0-9]/g, "");
  const matchesOe = (list) => Boolean(compactSearch) && list.some((oe) => normalizeOe(oe).toLowerCase().includes(compactSearch));

  const groupRows = db.prepare("SELECT * FROM product_groups ORDER BY name COLLATE NOCASE").all();
  const skuRows = db.prepare(`SELECT s.*, GROUP_CONCAT(o.oe_no, '||') AS oe_numbers
    FROM skus s LEFT JOIN sku_oe_numbers o ON o.sku_id = s.id
    GROUP BY s.id ORDER BY s.id`).all();
  const byGroup = new Map();
  for (const sku of skuRows) {
    const oeNumbers = sku.oe_numbers ? sku.oe_numbers.split("||") : [];
    const sourceName = sku.source_type === "oem" ? `${sku.oem_brand || ""}原厂 原厂件` : sku.source_type === "used" ? "拆车件" : "品牌件";
    const matchText = `${sku.id} ${sku.brand} ${sku.oem_brand || ""} ${sourceName} ${sku.part_no} ${oeNumbers.join(" ")}`.toLowerCase();
    const item = { ...sku, oeNumbers, matchesSearch: !search || matchText.includes(search) || matchesOe(oeNumbers) };
    if (!byGroup.has(sku.group_id)) byGroup.set(sku.group_id, []);
    byGroup.get(sku.group_id).push(item);
  }

  const matchingGroups = groupRows.flatMap((group) => {
    if (category && group.category !== category) return [];
    const allSkus = byGroup.get(group.id) || [];
    const groupOes = groupOeNumbers(db, group.id);
    const groupMatches = !search
      || `${group.name} ${group.reference} ${group.category} ${group.position} ${groupOes.join(" ")}`.toLowerCase().includes(search)
      || matchesOe(groupOes);
    const skus = allSkus.filter((sku) => {
      const incomplete = !(sku.brand || sku.oem_brand) || !sku.oeNumbers.length;
      const statusMatches = !status || (status === "incomplete" ? incomplete : sku.status === status);
      return statusMatches && (groupMatches || sku.matchesSearch);
    });
    return skus.length ? [{
      group,
      skus,
      totalSkuCount: allSkus.length,
      enabledSkuCount: allSkus.filter((sku) => sku.status === "enabled").length,
    }] : [];
  });

  const totalGroups = matchingGroups.length;
  const pageGroups = matchingGroups.slice((page - 1) * pageSize, page * pageSize);
  const fitmentStmt = db.prepare(`SELECT make, series, year_from AS yearFrom, year_to AS yearTo, variant, engine, position,
    source, verification_status AS verificationStatus, note FROM sku_fitments WHERE sku_id = ? ORDER BY id`);
  const groups = pageGroups.map(({ group, skus, totalSkuCount, enabledSkuCount }) => ({
    id: group.id,
    name: group.name,
    reference: group.reference,
    image: group.image,
    note: group.note,
    category: group.category,
    position: group.position || "",
    ...groupOeFields(db, group.id),
    primaryOe: groupPrimaryOe(db, group.id),
    totalSkuCount,
    enabledSkuCount,
    skus: skus.map((sku) => ({
      id: sku.id,
      brand: sku.brand,
      partNo: sku.part_no,
      unit: sku.unit,
      origin: sku.origin,
      channel: sku.channel,
      sourceType: sku.source_type || "brand",
      oemBrand: sku.oem_brand || "",
      image: sku.image || "",
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
    SUM(((brand = '' AND oem_brand = '') OR NOT EXISTS (SELECT 1 FROM sku_oe_numbers o WHERE o.sku_id = skus.id))) AS incompleteCount
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

const SKU_SOURCES = ["oem", "brand", "used"];
const normalizeSourceType = (value) => (SKU_SOURCES.includes(value) ? value : "brand");

function validatePayload(payload, { creating }) {
  const errors = {};
  const sku = payload?.sku || {};
  const group = payload?.group || {};
  if (creating && !normalizeCode(sku.id)) errors.id = "请填写 SKU 编码";
  if (!group.id && !String(group.name || "").trim()) errors.groupName = "请选择商品组或填写商品组名称";
  if (!group.id && !String(group.reference || "").trim()) errors.groupReference = "请填写商品组参考编码";
  if (!group.id && !String(group.category || "").trim()) errors.category = "请选择配件品类";
  if (!String(sku.unit || "").trim()) errors.unit = "请选择基础单位";
  if (normalizeSourceType(sku.sourceType) === "oem" && !String(sku.oemBrand || "").trim()) {
    errors.oemBrand = "请选择整车品牌";
  }
  if (!Number.isInteger(Number(sku.packQuantity)) || Number(sku.packQuantity) < 1) errors.packQuantity = "包装数量必须为正整数";
  if (String(sku.price ?? "").trim() !== "" && (!Number.isFinite(Number(sku.price)) || Number(sku.price) < 0)) errors.price = "销售价不能小于 0";
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
  const reference = normalizeCode(group.reference);
  const existingByReference = db.prepare("SELECT * FROM product_groups WHERE reference = ?").get(reference);
  if (existingByReference) return existingByReference.id;
  const idBase = normalizeCode(group.reference).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `group-${Date.now()}`;
  let id = idBase;
  let suffix = 2;
  while (db.prepare("SELECT 1 FROM product_groups WHERE id = ?").get(id)) id = `${idBase}-${suffix++}`;
  const timestamp = now();
  db.prepare(`INSERT INTO product_groups (id, name, reference, image, note, category, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id,
    String(group.name).trim(),
    reference,
    String(group.image || "").trim(),
    String(group.note || "").trim(),
    String(group.category).trim(),
    timestamp,
    timestamp,
  );
  registerDictionaryValue(db, "categories", group.category);
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
  db.exec("SAVEPOINT create_sku");
  try {
    const groupId = resolveGroup(db, payload.group);
    const timestamp = now();
    const sourceType = normalizeSourceType(payload.sku.sourceType);
    const oemBrand = sourceType === "oem" ? String(payload.sku.oemBrand || "").trim() : "";
    db.prepare(`INSERT INTO skus (id, group_id, brand, part_no, unit, origin, channel, source_type, oem_brand, pack_quantity, price, status, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      skuId,
      groupId,
      sourceType === "oem" ? "" : String(payload.sku.brand || "").trim(),
      sourceType === "oem" ? "" : String(payload.sku.partNo).trim(),
      String(payload.sku.unit).trim(),
      String(payload.sku.origin || "").trim(),
      String(payload.sku.channel || "").trim(),
      sourceType,
      oemBrand,
      Number(payload.sku.packQuantity),
      payload.sku.price === "" || payload.sku.price === undefined || payload.sku.price === null ? 0 : Number(payload.sku.price),
      ["draft", "enabled", "disabled"].includes(payload.sku.status) ? payload.sku.status : "draft",
      String(payload.sku.note || "").trim(),
      timestamp,
      timestamp,
    );
    registerDictionaryValue(db, "brands", payload.sku.brand);
    registerDictionaryValue(db, "units", payload.sku.unit);
    registerDictionaryValue(db, "origins", payload.sku.origin);
    registerDictionaryValue(db, "channels", payload.sku.channel);
    registerDictionaryValue(db, "oem-brands", oemBrand);
    replaceRelations(db, skuId, payload.oeNumbers, payload.fitments);
    mergeSkuOesIntoGroup(db, groupId, payload.oeNumbers);
    const created = readSku(db, skuId);
    logActivity(db, { skuId, action: "create", summary: "创建 SKU", after: created });
    db.exec("RELEASE SAVEPOINT create_sku");
    return created;
  } catch (error) {
    db.exec("ROLLBACK TO SAVEPOINT create_sku");
    db.exec("RELEASE SAVEPOINT create_sku");
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
  db.exec("SAVEPOINT update_sku");
  try {
    const groupId = resolveGroup(db, payload.group);
    const sourceType = normalizeSourceType(payload.sku.sourceType);
    const oemBrand = sourceType === "oem" ? String(payload.sku.oemBrand || "").trim() : "";
    db.prepare(`UPDATE skus SET group_id = ?, brand = ?, part_no = ?, unit = ?, origin = ?, channel = ?, source_type = ?, oem_brand = ?, pack_quantity = ?, price = ?, status = ?, note = ?, updated_at = ?
      WHERE id = ?`).run(
      groupId,
      sourceType === "oem" ? "" : String(payload.sku.brand || "").trim(),
      sourceType === "oem" ? "" : String(payload.sku.partNo).trim(),
      String(payload.sku.unit).trim(),
      String(payload.sku.origin || "").trim(),
      String(payload.sku.channel || "").trim(),
      sourceType,
      oemBrand,
      Number(payload.sku.packQuantity),
      payload.sku.price === "" || payload.sku.price === undefined || payload.sku.price === null ? 0 : Number(payload.sku.price),
      ["draft", "enabled", "disabled"].includes(payload.sku.status) ? payload.sku.status : existing.status,
      String(payload.sku.note || "").trim(),
      now(),
      skuId,
    );
    registerDictionaryValue(db, "brands", payload.sku.brand);
    registerDictionaryValue(db, "units", payload.sku.unit);
    registerDictionaryValue(db, "origins", payload.sku.origin);
    registerDictionaryValue(db, "channels", payload.sku.channel);
    registerDictionaryValue(db, "oem-brands", oemBrand);
    replaceRelations(db, skuId, payload.oeNumbers, payload.fitments);
    mergeSkuOesIntoGroup(db, groupId, payload.oeNumbers);
    const updated = readSku(db, skuId);
    logActivity(db, { skuId, action: "update", summary: "更新 SKU 资料", before: existing, after: updated });
    db.exec("RELEASE SAVEPOINT update_sku");
    return updated;
  } catch (error) {
    db.exec("ROLLBACK TO SAVEPOINT update_sku");
    db.exec("RELEASE SAVEPOINT update_sku");
    throw convertSqliteError(error);
  }
}

export function importSkuRows(db, rows, { mode = "upsert", preview = false } = {}) {
  if (!Array.isArray(rows) || !rows.length) {
    const error = new Error("导入文件中没有 SKU 数据");
    error.status = 422;
    throw error;
  }
  if (rows.length > 5000) {
    const error = new Error("单次最多导入 5000 个 SKU");
    error.status = 422;
    throw error;
  }
  const errors = [];
  const results = [];
  db.exec("BEGIN");
  try {
    rows.forEach((payload, index) => {
      db.exec(`SAVEPOINT import_row_${index}`);
      try {
        const skuId = normalizeCode(payload?.sku?.id || "");
        const existing = skuId ? readSku(db, skuId) : null;
        if (existing && mode === "insert") {
          const duplicate = new Error("SKU 编码已存在");
          duplicate.status = 409;
          duplicate.details = { id: "SKU 编码已存在" };
          throw duplicate;
        }
        const saved = existing ? updateSku(db, skuId, payload) : createSku(db, payload);
        results.push({ row: index + 2, id: saved.id, action: existing ? "update" : "create" });
        db.exec(`RELEASE SAVEPOINT import_row_${index}`);
      } catch (error) {
        db.exec(`ROLLBACK TO SAVEPOINT import_row_${index}`);
        db.exec(`RELEASE SAVEPOINT import_row_${index}`);
        errors.push({ row: index + 2, id: payload?.sku?.id || "", message: error.message, details: error.details || {} });
      }
    });
    if (preview || errors.length) db.exec("ROLLBACK");
    else db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { total: rows.length, valid: rows.length - errors.length, errors, results: errors.length ? [] : results, committed: !preview && errors.length === 0 };
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
  const label = status === "enabled" ? "启用" : status === "disabled" ? "停用" : "转为草稿";
  logActivity(db, { skuId, action: "status", summary: reason ? `${label}：${reason}` : label, before: existing, after: updated });
  return updated;
}

export function updateSkuImage(db, skuId, filename) {
  const existing = readSku(db, skuId);
  if (!existing) {
    const error = new Error("SKU 不存在");
    error.status = 404;
    throw error;
  }
  db.prepare("UPDATE skus SET image = ?, updated_at = ? WHERE id = ?").run(filename || "", now(), skuId);
  logActivity(db, {
    skuId,
    action: "image",
    summary: filename ? "更新商品图" : "移除商品图",
    before: { image: existing.image },
    after: { image: filename || "" },
  });
  return readSku(db, skuId);
}

/** 删除 SKU：OE 号、车型适配与替代关系由外键级联清理，组级 OE 保持不变。返回被删除的记录。 */
export function deleteSku(db, skuId) {
  const existing = readSku(db, skuId);
  if (!existing) return null;
  db.prepare("DELETE FROM skus WHERE id = ?").run(skuId);
  logActivity(db, { skuId, action: "delete", summary: "删除 SKU", before: existing });
  return existing;
}

const setKeywords = { "三滤": "sanlv", "四滤": "silv" };
const partTypeKeywords = [
  ["空调滤", "cabin-filter"],
  ["空气滤", "air-filter"],
  ["空滤", "air-filter"],
  ["燃油滤", "fuel-filter"],
  ["汽滤", "fuel-filter"],
  ["机油滤", "oil-filter"],
  ["机滤", "oil-filter"],
];

function readPartTypes(db, ids) {
  const statement = db.prepare("SELECT id, name FROM part_types WHERE id = ?");
  return ids.map((id) => statement.get(id)).filter(Boolean);
}

function detectPartScope(db, query) {
  const text = normalizeText(query);
  for (const [keyword, setId] of Object.entries(setKeywords)) {
    if (!text.includes(keyword)) continue;
    const set = db.prepare("SELECT id, name, note FROM part_sets WHERE id = ?").get(setId);
    if (!set) continue;
    const ids = db.prepare("SELECT part_type_id FROM part_set_items WHERE set_id = ? ORDER BY sort_order").all(setId).map((row) => row.part_type_id);
    return { set, partTypes: readPartTypes(db, ids), remainder: text.replace(keyword, "") };
  }
  for (const [keyword, partTypeId] of partTypeKeywords) {
    if (!text.includes(keyword)) continue;
    return { set: null, partTypes: readPartTypes(db, [partTypeId]), remainder: text.replace(keyword, "") };
  }
  return { set: null, fallback: true, partTypes: [], remainder: text };
}

function scoreVehicle(vehicle, aliases, needle) {
  if (!needle) return 0;
  let best = 0;
  for (const { normalized } of aliases) {
    if (!normalized) continue;
    if (normalized === needle) best = Math.max(best, 100);
    else if (needle.includes(normalized)) best = Math.max(best, 80 + Math.min(normalized.length, 10));
    else if (normalized.includes(needle) && needle.length >= 2) best = Math.max(best, 60 + Math.min(needle.length, 10));
  }
  const vin = normalizeText(vehicle.vin);
  if (vin && needle && (vin === needle || (needle.length >= 6 && vin.endsWith(needle)))) best = Math.max(best, 100);
  const fields = [vehicle.brand, vehicle.series, vehicle.generation, vehicle.platform, `${vehicle.brand}${vehicle.series}`].map(normalizeText).filter(Boolean);
  for (const field of fields) {
    if (field === needle) best = Math.max(best, 95);
    else if (needle.includes(field) || field.includes(needle)) best = Math.max(best, 55 + Math.min(field.length, 10));
  }
  return best;
}

const vehicleLabel = (vehicle) => [vehicle.brand, vehicle.series, vehicle.generation].filter(Boolean).join(" ");

function presentVehicle(db, vehicle, score = null) {
  return {
    id: vehicle.id,
    vin: vehicle.vin || "",
    brand: vehicle.brand,
    series: vehicle.series,
    generation: vehicle.generation,
    platform: vehicle.platform,
    yearFrom: vehicle.year_from,
    yearTo: vehicle.year_to,
    engine: vehicle.engine,
    displacement: vehicle.displacement || "",
    body: vehicle.body,
    drive: vehicle.drive,
    label: vehicleLabel(vehicle),
    aliases: db.prepare("SELECT alias FROM vehicle_aliases WHERE vehicle_id = ?").all(vehicle.id).map((row) => row.alias),
    score,
  };
}

function groupSkus(db, groupId) {
  return db.prepare(`SELECT s.id, s.brand, s.oem_brand, s.source_type, s.part_no, s.unit, s.origin, s.channel, s.pack_quantity, s.price, s.status,
      (SELECT GROUP_CONCAT(o.oe_no, '||') FROM sku_oe_numbers o WHERE o.sku_id = s.id) AS oe_numbers
    FROM skus s WHERE s.group_id = ? ORDER BY s.brand COLLATE NOCASE, s.id`).all(groupId).map((sku) => ({
    id: sku.id,
    brand: sku.brand,
    partNo: sku.part_no,
    unit: sku.unit,
    origin: sku.origin,
    channel: sku.channel,
    sourceType: sku.source_type || "brand",
    oemBrand: sku.oem_brand || "",
    image: sku.image || "",
    packQuantity: sku.pack_quantity,
    price: sku.price,
    status: sku.status,
    oeNumbers: sku.oe_numbers ? sku.oe_numbers.split("||") : [],
  }));
}

export function listVehicles(db) {
  return db.prepare("SELECT * FROM vehicles ORDER BY brand COLLATE NOCASE, series COLLATE NOCASE").all().map((vehicle) => ({
    ...presentVehicle(db, vehicle),
    score: undefined,
    productCount: db.prepare("SELECT COUNT(*) AS count FROM vehicle_products WHERE vehicle_id = ?").get(vehicle.id).count,
  }));
}

export function listPartTypes(db) {
  return {
    items: db.prepare("SELECT id, name, system, sort_order FROM part_types ORDER BY sort_order, name").all()
      .map((row) => ({ id: row.id, name: row.name, system: row.system, sortOrder: row.sort_order })),
    sets: db.prepare("SELECT id, name, note FROM part_sets ORDER BY id").all().map((row) => ({
      id: row.id,
      name: row.name,
      note: row.note,
      partTypeIds: db.prepare("SELECT part_type_id FROM part_set_items WHERE set_id = ? ORDER BY sort_order").all(row.id).map((item) => item.part_type_id),
    })),
  };
}

function normalizeAliases(list) {
  const seen = new Set();
  const aliases = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const alias = String(raw || "").trim();
    const normalized = normalizeText(alias);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    aliases.push(alias);
    if (aliases.length >= 30) break;
  }
  return aliases;
}

function normalizeVehicleProducts(db, list) {
  const rows = [];
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    const groupId = String(item?.groupId || "").trim();
    if (!groupId || seen.has(groupId)) continue;
    if (!db.prepare("SELECT 1 FROM product_groups WHERE id = ?").get(groupId)) {
      const error = new Error("商品组不存在");
      error.status = 422;
      error.details = { products: "适配的商品组已不存在，请刷新后重试" };
      throw error;
    }
    const partTypeId = String(item?.partTypeId || "").trim();
    if (!db.prepare("SELECT 1 FROM part_types WHERE id = ?").get(partTypeId)) {
      const error = new Error("件类不存在");
      error.status = 422;
      error.details = { products: "请为适配件选择件类" };
      throw error;
    }
    seen.add(groupId);
    rows.push({
      groupId,
      partTypeId,
      position: String(item?.position || "").trim(),
      verificationStatus: ["pending", "verified", "rejected"].includes(item?.verificationStatus) ? item.verificationStatus : "pending",
    });
  }
  return rows;
}

export function readEpcVinCache(db, rawVin = "") {
  const row = db.prepare("SELECT payload, fetched_at AS fetchedAt FROM epc_vin_cache WHERE vin = ?").get(String(rawVin || "").trim().toUpperCase());
  if (!row) return null;
  try {
    return { ...JSON.parse(row.payload), fetchedAt: row.fetchedAt };
  } catch {
    return null;
  }
}

export function writeEpcVinCache(db, rawVin = "", payload = {}) {
  db.prepare(`INSERT INTO epc_vin_cache (vin, payload, fetched_at) VALUES (?, ?, ?)
    ON CONFLICT(vin) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`)
    .run(String(rawVin || "").trim().toUpperCase(), JSON.stringify(payload), now());
}

const generationRow = (row) => row && {
  id: row.id,
  series: row.series,
  chassisCode: row.chassis_code,
  generation: row.generation,
  platform: row.platform,
  updatedAt: row.updated_at,
};

export function listVehicleGenerations(db) {
  return db.prepare("SELECT * FROM vehicle_generations ORDER BY series, chassis_code").all().map(generationRow);
}

function normalizeGenerationInput(payload = {}) {
  const series = String(payload.series || "").trim();
  const chassisCode = String(payload.chassisCode || "").trim().toUpperCase();
  const generation = String(payload.generation || "").trim();
  const platform = String(payload.platform || "").trim();
  const details = {};
  if (!series) details.series = "请填写车系";
  if (!chassisCode) details.chassisCode = "请填写底盘代号";
  if (!generation && !platform) details.generation = "代系与平台代号至少填一个";
  if (Object.keys(details).length) {
    const error = new Error("代系对照不完整");
    error.status = 422;
    error.details = details;
    throw error;
  }
  return { series, chassisCode, generation, platform };
}

export function createVehicleGeneration(db, payload = {}) {
  const input = normalizeGenerationInput(payload);
  const clash = db.prepare("SELECT 1 FROM vehicle_generations WHERE series = ? AND chassis_code = ?").get(input.series, input.chassisCode);
  if (clash) {
    const error = new Error("该车系与底盘代号的对照已存在");
    error.status = 409;
    error.details = { chassisCode: "已存在相同对照" };
    throw error;
  }
  const result = db.prepare(`INSERT INTO vehicle_generations (series, chassis_code, generation, platform, updated_at)
    VALUES (?, ?, ?, ?, ?)`).run(input.series, input.chassisCode, input.generation, input.platform, now());
  return generationRow(db.prepare("SELECT * FROM vehicle_generations WHERE id = ?").get(result.lastInsertRowid));
}

export function updateVehicleGeneration(db, id, payload = {}) {
  const current = db.prepare("SELECT * FROM vehicle_generations WHERE id = ?").get(Number(id));
  if (!current) {
    const error = new Error("代系对照不存在");
    error.status = 404;
    throw error;
  }
  const input = normalizeGenerationInput({ ...generationRow(current), ...payload });
  const clash = db.prepare("SELECT 1 FROM vehicle_generations WHERE series = ? AND chassis_code = ? AND id <> ?")
    .get(input.series, input.chassisCode, Number(id));
  if (clash) {
    const error = new Error("该车系与底盘代号的对照已存在");
    error.status = 409;
    error.details = { chassisCode: "已存在相同对照" };
    throw error;
  }
  db.prepare("UPDATE vehicle_generations SET series = ?, chassis_code = ?, generation = ?, platform = ?, updated_at = ? WHERE id = ?")
    .run(input.series, input.chassisCode, input.generation, input.platform, now(), Number(id));
  return generationRow(db.prepare("SELECT * FROM vehicle_generations WHERE id = ?").get(Number(id)));
}

export function deleteVehicleGeneration(db, id) {
  return db.prepare("DELETE FROM vehicle_generations WHERE id = ?").run(Number(id)).changes > 0;
}

export function resolveVehicleGeneration(db, series, chassisCode) {
  const code = String(chassisCode || "").trim();
  const row = db.prepare("SELECT generation, platform FROM vehicle_generations WHERE series = ? AND chassis_code = ?")
    .get(String(series || "").trim(), code.toUpperCase());
  if (row) return { generation: row.generation || "", platform: row.platform || code };
  return { generation: "", platform: code };
}

function normalizeVehicleInput(db, payload = {}) {
  const brand = String(payload.brand || "").trim();
  const series = String(payload.series || "").trim();
  const details = {};
  if (!brand) details.brand = "请填写品牌";
  if (!series) details.series = "请填写车系";
  const yearFrom = payload.yearFrom === "" || payload.yearFrom === undefined || payload.yearFrom === null ? null : Number(payload.yearFrom);
  const yearTo = payload.yearTo === "" || payload.yearTo === undefined || payload.yearTo === null ? null : Number(payload.yearTo);
  if (yearFrom !== null && !Number.isFinite(yearFrom)) details.yearFrom = "起始年款应为数字";
  if (yearTo !== null && !Number.isFinite(yearTo)) details.yearTo = "结束年款应为数字";
  if (yearFrom !== null && yearTo !== null && Number.isFinite(yearFrom) && Number.isFinite(yearTo) && yearFrom > yearTo) {
    details.yearTo = "结束年款不能早于起始年款";
  }
  const vin = String(payload.vin || "").trim().toUpperCase();
  if (vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) details.vin = "VIN 需为 17 位且不含 I/O/Q";
  if (Object.keys(details).length) {
    const error = new Error("车型资料不完整");
    error.status = 422;
    error.details = details;
    throw error;
  }
  return {
    vin,
    brand,
    series,
    generation: String(payload.generation || "").trim(),
    platform: String(payload.platform || "").trim(),
    yearFrom,
    yearTo,
    engine: String(payload.engine || "").trim(),
    displacement: String(payload.displacement || "").trim(),
    body: String(payload.body || "").trim(),
    drive: String(payload.drive || "").trim(),
    note: String(payload.note || "").trim(),
    aliases: normalizeAliases(payload.aliases),
    products: normalizeVehicleProducts(db, payload.products),
  };
}

function vehicleIdBase(input) {
  const slug = normalizeText(`${input.series}${input.generation}`).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return slug ? `veh-${slug}` : `veh-${Date.now().toString(36)}`;
}

function uniqueVehicleId(db, base) {
  let id = base;
  let suffix = 2;
  while (db.prepare("SELECT 1 FROM vehicles WHERE id = ?").get(id)) id = `${base}-${suffix++}`;
  return id;
}

function replaceVehicleAliases(db, vehicleId, aliases) {
  db.prepare("DELETE FROM vehicle_aliases WHERE vehicle_id = ?").run(vehicleId);
  const insert = db.prepare("INSERT INTO vehicle_aliases (vehicle_id, alias, normalized) VALUES (?, ?, ?)");
  for (const alias of aliases) insert.run(vehicleId, alias, normalizeText(alias));
}

function replaceVehicleProducts(db, vehicleId, products) {
  db.prepare("DELETE FROM vehicle_products WHERE vehicle_id = ?").run(vehicleId);
  const insert = db.prepare(`INSERT INTO vehicle_products
    (vehicle_id, group_id, part_type_id, position, verification_status, source, note)
    VALUES (?, ?, ?, ?, ?, '手工维护', '')`);
  for (const product of products) insert.run(vehicleId, product.groupId, product.partTypeId, product.position, product.verificationStatus);
}

export function readVehicle(db, vehicleId) {
  const vehicle = db.prepare("SELECT * FROM vehicles WHERE id = ?").get(vehicleId);
  if (!vehicle) return null;
  const products = db.prepare(`SELECT vp.group_id, vp.part_type_id, vp.position, vp.verification_status, g.name, g.reference
    FROM vehicle_products vp JOIN product_groups g ON g.id = vp.group_id WHERE vp.vehicle_id = ? ORDER BY vp.part_type_id`)
    .all(vehicleId)
    .map((row) => ({
      groupId: row.group_id,
      partTypeId: row.part_type_id,
      position: row.position,
      verificationStatus: row.verification_status,
      groupName: row.name,
      groupReference: row.reference,
    }));
  return {
    ...presentVehicle(db, vehicle),
    score: undefined,
    note: vehicle.note,
    products,
    productCount: products.length,
  };
}

export function createVehicle(db, payload) {
  const input = normalizeVehicleInput(db, payload);
  if (input.vin && db.prepare("SELECT 1 FROM vehicles WHERE vin = ?").get(input.vin)) {
    const error = new Error("VIN 已存在");
    error.status = 409;
    error.details = { vin: "该 VIN 已存在" };
    throw error;
  }
  const timestamp = now();
  db.exec("BEGIN");
  try {
    const id = uniqueVehicleId(db, vehicleIdBase(input));
    db.prepare(`INSERT INTO vehicles (id, vin, brand, series, generation, platform, year_from, year_to, engine, displacement, body, drive, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, input.vin, input.brand, input.series, input.generation, input.platform, input.yearFrom, input.yearTo,
      input.engine, input.displacement, input.body, input.drive, input.note, timestamp, timestamp,
    );
    replaceVehicleAliases(db, id, input.aliases);
    replaceVehicleProducts(db, id, input.products);
    db.exec("COMMIT");
    return readVehicle(db, id);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function updateVehicle(db, vehicleId, payload) {
  const existing = db.prepare("SELECT id FROM vehicles WHERE id = ?").get(vehicleId);
  if (!existing) {
    const error = new Error("车型不存在");
    error.status = 404;
    throw error;
  }
  const input = normalizeVehicleInput(db, payload);
  if (input.vin) {
    const clash = db.prepare("SELECT 1 FROM vehicles WHERE vin = ? AND id <> ?").get(input.vin, vehicleId);
    if (clash) {
      const error = new Error("VIN 已存在");
      error.status = 409;
      error.details = { vin: "该 VIN 已存在" };
      throw error;
    }
  }
  db.exec("BEGIN");
  try {
    db.prepare(`UPDATE vehicles SET vin = ?, brand = ?, series = ?, generation = ?, platform = ?, year_from = ?, year_to = ?,
      engine = ?, displacement = ?, body = ?, drive = ?, note = ?, updated_at = ? WHERE id = ?`).run(
      input.vin, input.brand, input.series, input.generation, input.platform, input.yearFrom, input.yearTo,
      input.engine, input.displacement, input.body, input.drive, input.note, now(), vehicleId,
    );
    replaceVehicleAliases(db, vehicleId, input.aliases);
    replaceVehicleProducts(db, vehicleId, input.products);
    db.exec("COMMIT");
    return readVehicle(db, vehicleId);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function deleteVehicle(db, vehicleId) {
  const removed = db.prepare("DELETE FROM vehicles WHERE id = ?").run(vehicleId);
  return removed.changes > 0;
}

function describeRelationSku(db, skuId) {
  const sku = db.prepare(`SELECT s.id, s.brand, s.oem_brand, s.source_type, s.part_no, s.price, s.status, g.name AS group_name
    FROM skus s JOIN product_groups g ON g.id = s.group_id WHERE s.id = ?`).get(skuId);
  return sku ? { id: sku.id, brand: sku.brand, oemBrand: sku.oem_brand, sourceType: sku.source_type, partNo: sku.part_no, price: sku.price, status: sku.status, groupName: sku.group_name } : null;
}

function supersedeChain(db, skuId) {
  const chain = [];
  const seen = new Set([skuId]);
  let current = skuId;
  for (let hop = 0; hop < 10; hop += 1) {
    const next = db.prepare("SELECT to_sku_id FROM sku_relations WHERE from_sku_id = ? AND relation_type = 'supersedes'").get(current);
    if (!next || seen.has(next.to_sku_id)) break;
    const sku = describeRelationSku(db, next.to_sku_id);
    if (!sku) break;
    chain.push(sku);
    seen.add(next.to_sku_id);
    current = next.to_sku_id;
  }
  return chain;
}

export function listSkuRelations(db, skuId) {
  if (!db.prepare("SELECT 1 FROM skus WHERE id = ?").get(skuId)) {
    const error = new Error("SKU 不存在");
    error.status = 404;
    throw error;
  }
  const rows = db.prepare(`SELECT id, relation_type, note, from_sku_id, to_sku_id FROM sku_relations
    WHERE from_sku_id = ? OR to_sku_id = ? ORDER BY id`).all(skuId, skuId);
  const interchanges = [];
  const replacedBy = [];
  const replaces = [];
  for (const row of rows) {
    if (row.relation_type === "interchange") {
      const other = describeRelationSku(db, row.from_sku_id === skuId ? row.to_sku_id : row.from_sku_id);
      if (other) interchanges.push({ relationId: row.id, note: row.note, sku: other });
    } else if (row.from_sku_id === skuId) {
      const other = describeRelationSku(db, row.to_sku_id);
      if (other) replacedBy.push({ relationId: row.id, note: row.note, sku: other });
    } else {
      const other = describeRelationSku(db, row.from_sku_id);
      if (other) replaces.push({ relationId: row.id, note: row.note, sku: other });
    }
  }
  return { skuId, interchanges, replacedBy, replaces, chain: supersedeChain(db, skuId) };
}

export function addSkuRelation(db, skuId, payload = {}) {
  const type = payload.type === "interchange" || payload.type === "supersedes" ? payload.type : null;
  if (!type) {
    const error = new Error("关系类型无效");
    error.status = 422;
    throw error;
  }
  const targetId = String(payload.targetId || "").trim();
  if (!db.prepare("SELECT 1 FROM skus WHERE id = ?").get(skuId)) {
    const error = new Error("SKU 不存在");
    error.status = 404;
    throw error;
  }
  if (!targetId || !db.prepare("SELECT 1 FROM skus WHERE id = ?").get(targetId)) {
    const error = new Error("目标 SKU 不存在");
    error.status = 422;
    throw error;
  }
  if (targetId === skuId) {
    const error = new Error("不能和自己建立关系");
    error.status = 422;
    throw error;
  }
  const [from, to] = type === "interchange" && targetId < skuId ? [targetId, skuId] : [skuId, targetId];
  if (type === "supersedes" && supersedeChain(db, targetId).some((sku) => sku.id === skuId)) {
    const error = new Error("会形成循环替代");
    error.status = 409;
    throw error;
  }
  try {
    db.prepare("INSERT INTO sku_relations (from_sku_id, to_sku_id, relation_type, note, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(from, to, type, String(payload.note || "").trim(), now());
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      const conflict = new Error("这条关系已经存在");
      conflict.status = 409;
      throw conflict;
    }
    throw error;
  }
  return listSkuRelations(db, skuId);
}

export function deleteSkuRelation(db, relationId) {
  const removed = db.prepare("DELETE FROM sku_relations WHERE id = ?").run(Number(relationId));
  return removed.changes > 0;
}

export function lookupVehicleParts(db, rawQuery = "") {
  const query = String(rawQuery || "").trim();
  const scope = detectPartScope(db, query);
  const aliasesStmt = db.prepare("SELECT alias, normalized FROM vehicle_aliases WHERE vehicle_id = ?");
  const scored = db.prepare("SELECT * FROM vehicles").all()
    .map((vehicle) => ({ vehicle, score: scoreVehicle(vehicle, aliasesStmt.all(vehicle.id), scope.remainder) }))
    .sort((left, right) => right.score - left.score);
  const best = scored[0];
  const scopeInfo = {
    set: scope.set ? { id: scope.set.id, name: scope.set.name } : null,
    partTypes: scope.partTypes,
  };
  if (!best || best.score < 55) {
    return {
      query,
      ...scopeInfo,
      vehicle: null,
      categories: [],
      missing: scope.partTypes.map((partType) => partType.name),
      candidates: scored.filter((entry) => entry.score > 0).slice(0, 5)
        .map((entry) => presentVehicle(db, entry.vehicle, entry.score)),
    };
  }
  const links = db.prepare(`SELECT vp.group_id, vp.part_type_id, vp.verification_status, vp.source, vp.position,
      g.name, g.reference, g.category, g.image
    FROM vehicle_products vp JOIN product_groups g ON g.id = vp.group_id
    WHERE vp.vehicle_id = ?`).all(best.vehicle.id);
  if (scope.fallback) {
    const linked = new Set(links.map((link) => link.part_type_id));
    const sanlv = db.prepare("SELECT part_type_id FROM part_set_items WHERE set_id = 'sanlv'").all().map((row) => row.part_type_id);
    const ids = db.prepare("SELECT id FROM part_types ORDER BY sort_order, name").all()
      .map((row) => row.id)
      .filter((id) => linked.has(id) || sanlv.includes(id));
    scope.partTypes = readPartTypes(db, ids);
    scopeInfo.partTypes = scope.partTypes;
  }
  const categories = scope.partTypes.map((partType) => ({
    partType,
    items: links.filter((link) => link.part_type_id === partType.id).map((link) => ({
      group: {
        id: link.group_id,
        name: link.name,
        reference: link.reference,
        category: link.category,
        image: link.image,
        position: link.position,
        verificationStatus: link.verification_status,
        source: link.source,
      },
      skus: groupSkus(db, link.group_id),
    })),
  }));
  return {
    query,
    ...scopeInfo,
    vehicle: presentVehicle(db, best.vehicle),
    categories,
    missing: categories.filter((category) => !category.items.length).map((category) => category.partType.name),
    candidates: [],
  };
}
