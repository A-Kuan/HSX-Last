import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../server/db.mjs";
import { listBrandCatalog, listBrandParts } from "../server/brand-catalog.mjs";

const seed = (db) => {
  const now = new Date().toISOString();
  db.prepare("INSERT OR REPLACE INTO brands (name, sort_order, created_at, alias, note, enabled) VALUES (?, ?, ?, '', '', 1)").run("TESTMANN", 10, now);
  db.prepare("INSERT OR REPLACE INTO brands (name, sort_order, created_at, alias, note, enabled) VALUES (?, ?, ?, '', '', 1)").run("TESTBOSCH", 20, now);
  db.prepare("INSERT INTO product_groups (id, name, reference, image, note, category, created_at, updated_at, position) VALUES ('g1', '机油滤清器', 'LX-1', '', '', '滤清器', ?, ?, '发动机')").run(now, now);
  db.prepare("INSERT INTO skus (id, group_id, brand, part_no, unit, pack_quantity, price, status, note, created_at, updated_at, source_type, origin, channel) VALUES ('s1', 'g1', 'TESTMANN', 'W 719/45', '个', 1, 96, 'enabled', '', ?, ?, 'brand', '进口', '批发')").run(now, now);
  db.prepare("INSERT INTO sku_oe_numbers (sku_id, oe_no, normalized_oe, is_primary) VALUES ('s1', '95811556200', '95811556200', 1)").run();
};

test("品牌目录：品牌计数只算启用 SKU", () => {
  const db = openDatabase(":memory:");
  seed(db);
  db.prepare("INSERT INTO skus (id, group_id, brand, part_no, unit, pack_quantity, price, status, note, created_at, updated_at, source_type, origin, channel) VALUES ('s2', 'g1', 'TESTMANN', 'W 719/46', '个', 1, 0, 'disabled', '', ?, ?, 'brand', '', '')").run(new Date().toISOString(), new Date().toISOString());
  const brands = listBrandCatalog(db);
  assert.equal(brands.find((brand) => brand.name === "TESTMANN").count, 1);
  assert.equal(brands.find((brand) => brand.name === "TESTBOSCH").count, 0);
  db.close();
});

test("品牌件：按品牌、OE、名称搜索并返回车型", () => {
  const db = openDatabase(":memory:");
  seed(db);
  const now = new Date().toISOString();
  db.prepare("INSERT INTO vehicles (id, brand, series, generation, platform, year_from, year_to, engine, body, drive, note, created_at, updated_at, vin, displacement) VALUES ('v1', '保时捷', 'Macan', '第一代', '95B', 2017, 2018, '', '', '', '', ?, ?, '', '2.0T')").run(now, now);
  db.prepare("INSERT INTO vehicle_products (vehicle_id, group_id, part_type_id, position, verification_status, source, note) VALUES ('v1', 'g1', (SELECT id FROM part_types LIMIT 1), '', 'verified', '', '')").run();
  const result = listBrandParts(db, { brand: "TESTMANN", q: "", page: 1, size: 10 });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].partNo, "W 719/45");
  assert.equal(result.items[0].oe, "95811556200");
  assert.equal(result.items[0].name, "机油滤清器");
  assert.equal(result.items[0].price, 96);
  assert.equal(result.items[0].vehicles.length, 1);
  assert.match(result.items[0].vehicles[0], /保时捷 Macan/);
  assert.equal(listBrandParts(db, { brand: "TESTMANN", q: "958115", page: 1, size: 10 }).total, 1);
  assert.equal(listBrandParts(db, { brand: "TESTMANN", q: "不存在", page: 1, size: 10 }).total, 0);
  db.close();
});
