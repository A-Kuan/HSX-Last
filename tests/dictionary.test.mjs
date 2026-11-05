import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../server/app.mjs";
import { openDatabase, seedDemoData } from "../server/db.mjs";

async function withApi(run) {
  const directory = mkdtempSync(join(tmpdir(), "hsx-sku-dict-"));
  const db = openDatabase(join(directory, "test.sqlite"));
  seedDemoData(db);
  const app = createApp({ db });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  const { port } = app.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => app.close(resolve));
    db.close();
  }
}

const request = async (base, path, options = {}) => {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
};

const dictPath = (kind, id) => `/api/dictionaries/${kind}/${encodeURIComponent(id)}`;

test("dictionaries expose the seeded reference values", async () => {
  await withApi(async (base) => {
    const { response, body } = await request(base, "/api/dictionaries");
    assert.equal(response.status, 200);
    for (const brand of ["BOSCH", "MANN", "MAHLE"]) {
      assert.ok(body.brands.some((item) => item.name === brand), `expected brand ${brand}`);
    }
    assert.ok(body.categories.some((item) => item.name === "滤清器"));
    assert.ok(body.units.some((item) => item.name === "个"));
    assert.equal(body.partTypes.length, 4);
    const sanlv = body.partSets.find((item) => item.name === "三滤");
    assert.deepEqual(sanlv.partTypeIds, ["oil-filter", "air-filter", "cabin-filter"]);
  });
});

test("category rename reaches product groups and used values cannot be removed", async () => {
  await withApi(async (base) => {
    const created = await request(base, "/api/dictionaries/categories", { method: "POST", body: JSON.stringify({ name: "试验品类" }) });
    assert.equal(created.response.status, 201);

    const duplicate = await request(base, "/api/dictionaries/categories", { method: "POST", body: JSON.stringify({ name: "试验品类" }) });
    assert.equal(duplicate.response.status, 409);

    await request(base, "/api/skus", {
      method: "POST",
      body: JSON.stringify({
        group: { name: "试验商品", reference: "TMP-01", category: "试验品类" },
        sku: { id: "TMP-01-001", brand: "BOSCH", partNo: "T-001", unit: "个", packQuantity: 1, price: 10, status: "draft" },
        oeNumbers: ["T-0001"],
        fitments: [],
      }),
    });

    const renamed = await request(base, dictPath("categories", "试验品类"), { method: "PUT", body: JSON.stringify({ name: "试验品类改" }) });
    assert.equal(renamed.response.status, 200);
    const groups = await request(base, "/api/groups");
    assert.equal(groups.body.items.find((item) => item.reference === "TMP-01").category, "试验品类改");

    const blocked = await request(base, dictPath("categories", "试验品类改"), { method: "DELETE" });
    assert.equal(blocked.response.status, 409);

    await request(base, "/api/dictionaries/categories", { method: "POST", body: JSON.stringify({ name: "空品类" }) });
    const removed = await request(base, dictPath("categories", "空品类"), { method: "DELETE" });
    assert.equal(removed.response.status, 204);
    const after = await request(base, "/api/dictionaries");
    assert.equal(after.body.categories.some((item) => item.name === "空品类"), false);
  });
});

test("part types and part sets can be maintained", async () => {
  await withApi(async (base) => {
    const partType = await request(base, "/api/dictionaries/part-types", {
      method: "POST", body: JSON.stringify({ name: "火花塞", system: "点火" }),
    });
    assert.equal(partType.response.status, 201);

    const partSet = await request(base, "/api/dictionaries/part-sets", {
      method: "POST", body: JSON.stringify({ name: "试验套餐", note: "", partTypeIds: ["oil-filter", partType.body.id] }),
    });
    assert.equal(partSet.response.status, 201);
    assert.deepEqual(partSet.body.partTypeIds, ["oil-filter", partType.body.id]);

    const blocked = await request(base, dictPath("part-types", partType.body.id), { method: "DELETE" });
    assert.equal(blocked.response.status, 409);

    const narrowed = await request(base, dictPath("part-sets", partSet.body.id), {
      method: "PUT", body: JSON.stringify({ name: "试验套餐改", note: "", partTypeIds: ["oil-filter"] }),
    });
    assert.equal(narrowed.body.name, "试验套餐改");
    assert.deepEqual(narrowed.body.partTypeIds, ["oil-filter"]);

    const removedPartType = await request(base, dictPath("part-types", partType.body.id), { method: "DELETE" });
    assert.equal(removedPartType.response.status, 204);

    const removedSet = await request(base, dictPath("part-sets", partSet.body.id), { method: "DELETE" });
    assert.equal(removedSet.response.status, 204);
    const after = await request(base, "/api/dictionaries");
    assert.equal(after.body.partSets.some((item) => item.id === partSet.body.id), false);
  });
});

test("brands and units accept new values and reject duplicates", async () => {
  await withApi(async (base) => {
    const brand = await request(base, "/api/dictionaries/brands", { method: "POST", body: JSON.stringify({ name: "XYZ" }) });
    assert.equal(brand.response.status, 201);
    const duplicate = await request(base, "/api/dictionaries/brands", { method: "POST", body: JSON.stringify({ name: "xyz" }) });
    assert.equal(duplicate.response.status, 409);

    const unit = await request(base, "/api/dictionaries/units", { method: "POST", body: JSON.stringify({ name: "箱" }) });
    assert.equal(unit.response.status, 201);
    const removedUnit = await request(base, dictPath("units", "箱"), { method: "DELETE" });
    assert.equal(removedUnit.response.status, 204);
    const removedBrand = await request(base, dictPath("brands", "XYZ"), { method: "DELETE" });
    assert.equal(removedBrand.response.status, 204);
  });
});

test("saving a SKU registers new brand, unit and category values", async () => {
  await withApi(async (base) => {
    await request(base, "/api/skus", {
      method: "POST",
      body: JSON.stringify({
        group: { name: "自动登记商品", reference: "AUTO-01", category: "自动品类" },
        sku: { id: "AUTO-01-001", brand: "自动品牌", partNo: "AUTO-001", unit: "桶", packQuantity: 1, price: 10, status: "draft" },
        oeNumbers: ["AUTO-0001"],
        fitments: [],
      }),
    });
    const { body } = await request(base, "/api/dictionaries");
    assert.ok(body.categories.some((item) => item.name === "自动品类"));
    assert.ok(body.brands.some((item) => item.name === "自动品牌"));
    assert.ok(body.units.some((item) => item.name === "桶"));
  });
});
