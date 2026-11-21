import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase, addSkuImages, deleteSkuImage, listSkuImages } from "../server/db.mjs";

const seedSku = (db) => {
  const now = new Date().toISOString();
  db.prepare("INSERT INTO product_groups (id, name, reference, image, note, category, created_at, updated_at, position) VALUES ('g1', '机油滤清器', 'LX-1', '', '', '滤清器', ?, ?, '')").run(now, now);
  db.prepare("INSERT INTO skus (id, group_id, brand, part_no, unit, pack_quantity, price, status, note, created_at, updated_at, source_type, origin, channel, image) VALUES ('s1', 'g1', 'MANN', 'HU6013Z', '个', 1, 0, 'enabled', '', ?, ?, 'brand', '', '', '')").run(now, now);
};

test("SKU 图集：新增图片后封面取第一张，删除后封面顺延", () => {
  const db = openDatabase(":memory:");
  seedSku(db);
  const images = addSkuImages(db, "s1", ["a.jpg", "b.jpg"]);
  assert.equal(images.length, 2);
  assert.equal(db.prepare("SELECT image FROM skus WHERE id = 's1'").get().image, "a.jpg");

  const removed = deleteSkuImage(db, "s1", images[0].id);
  assert.equal(removed, "a.jpg");
  assert.equal(db.prepare("SELECT image FROM skus WHERE id = 's1'").get().image, "b.jpg");
  assert.equal(listSkuImages(db, "s1").length, 1);

  deleteSkuImage(db, "s1", images[1].id);
  assert.equal(db.prepare("SELECT image FROM skus WHERE id = 's1'").get().image, "");
  db.close();
});

test("SKU 图集：重新打开数据库时把已有单图迁进图集", () => {
  const dir = mkdtempSync(join(tmpdir(), "hsx-sku-images-"));
  const file = join(dir, "test.sqlite");
  try {
    const first = openDatabase(file);
    seedSku(first);
    first.prepare("UPDATE skus SET image = 'old.jpg' WHERE id = 's1'").run();
    first.close();

    const db = openDatabase(file);
    const images = listSkuImages(db, "s1");
    assert.equal(images.length, 1);
    assert.equal(images[0].filename, "old.jpg");
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
