import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../server/db.mjs";
import { aliasesForOes, aliasKeyOf, deletePartAlias, listPartAliases, oeKeyOf, upsertPartAlias } from "../server/part-aliases.mjs";
import { searchEpcParts } from "../server/epc-index.mjs";

const seedIndex = (db, vin, rows) => {
  const key = vin.toUpperCase();
  const insert = db.prepare(`INSERT INTO epc_part_index (vin_key, group_num, mid, figure, position, oe_key, oe, name, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const row of rows) insert.run(key, row.groupNum, row.mid, row.figure, row.position, oeKeyOf(row.oe), row.oe, row.name, new Date().toISOString());
  db.prepare("INSERT OR REPLACE INTO epc_search_index (vin_key, parts, built_at) VALUES (?, ?, ?)").run(key, rows.length, new Date().toISOString());
};

test("别名归一化：忽略空格、连字符、大小写与全角", () => {
  assert.equal(oeKeyOf("958 147 151 40"), "95814715140");
  assert.equal(oeKeyOf("n910-45502"), "N91045502");
  assert.equal(aliasKeyOf("机油格座"), "机油格座");
  assert.equal(aliasKeyOf("ＯＩＬ  Filter"), "oilfilter");
});

test("别名 CRUD：同一 OE 同一别名只保留一条，重复录入更新不新增", () => {
  const db = openDatabase(":memory:");
  const first = upsertPartAlias(db, { oe: "958 147 151 40", alias: "机油格座", officialName: "支架" });
  const again = upsertPartAlias(db, { oe: "95814715140", alias: "机油格座" });
  assert.equal(first.id, again.id);
  assert.equal(listPartAliases(db, {}).length, 1);

  const second = upsertPartAlias(db, { oe: "958 147 151 40", alias: "机滤座" });
  const items = listPartAliases(db, { q: "机滤" });
  assert.equal(items.length, 1);
  assert.equal(items[0].alias, "机滤座");

  assert.deepEqual(aliasesForOes(db, ["95814715140"]).get("95814715140").map((item) => item.alias).sort(), ["机油格座", "机滤座"]);
  assert.equal(deletePartAlias(db, second.id), true);
  assert.equal(deletePartAlias(db, second.id), false);
  assert.equal(listPartAliases(db, {}).length, 1);
});

test("别名接口兜底：没有 OE / 空别名时返回 422", () => {
  const db = openDatabase(":memory:");
  assert.throws(() => upsertPartAlias(db, { alias: "机油格座" }), (error) => error.status === 422);
  assert.throws(() => upsertPartAlias(db, { oe: "95814715140", alias: "   " }), (error) => error.status === 422);
});

test("跨图搜索：别名命中排最前，OE / 名称也能命中，并带出图号与位置", () => {
  const db = openDatabase(":memory:");
  const vin = "WP1AA2951HLB19468";
  seedIndex(db, vin, [
    { groupNum: "1", mid: "102080", figure: "102-080", position: "1", oe: "95814715140", name: "支架，用于三相交流发电机" },
    { groupNum: "1", mid: "104050", figure: "104-050", position: "8", oe: "95811546600", name: "机油滤清器 配合使用" },
    { groupNum: "9", mid: "902005", figure: "902-005", position: "7", oe: "06H903018X", name: "三相交流发电机" },
  ]);
  upsertPartAlias(db, { oe: "958 147 151 40", alias: "机油格座", officialName: "支架" });

  const byAlias = searchEpcParts(db, vin, "机油格座");
  assert.equal(byAlias.results[0].oe, "95814715140");
  assert.equal(byAlias.results[0].kind, "alias");
  assert.equal(byAlias.results[0].position, "1");
  assert.equal(byAlias.results[0].figure, "102-080");
  assert.deepEqual(byAlias.results[0].aliases, ["机油格座"]);

  const byOe = searchEpcParts(db, vin, "9581154");
  assert.equal(byOe.results[0].oe, "95811546600");

  const byName = searchEpcParts(db, vin, "三相交流发电机");
  assert.ok(byName.results.some((item) => item.oe === "06H903018X"));

  const miss = searchEpcParts(db, vin, "不存在的零件名");
  assert.equal(miss.results.length, 0);
});

test("跨图搜索：别名记录里的图号可在这台车没有该 OE 时兜底", () => {
  const db = openDatabase(":memory:");
  const vin = "WP1AA2951HLB19468";
  seedIndex(db, vin, [
    { groupNum: "1", mid: "102080", figure: "102-080", position: "1", oe: "95814715140", name: "支架" },
  ]);
  upsertPartAlias(db, { oe: "PAB911021A", alias: "启动机", mid: "902005", figure: "902-005", position: "2" });
  const result = searchEpcParts(db, vin, "启动机");
  assert.ok(result.results.some((item) => item.mid === "902005" && item.position === "2"));
});
