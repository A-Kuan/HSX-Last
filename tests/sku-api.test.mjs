import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../server/app.mjs";
import { openDatabase } from "../server/db.mjs";

async function withApi(run) {
  const directory = mkdtempSync(join(tmpdir(), "hsx-sku-api-"));
  const db = openDatabase(join(directory, "test.sqlite"));
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

test("catalog returns persisted SKU groups without inventory fields", async () => {
  await withApi(async (base) => {
    const { response, body } = await request(base, "/api/catalog?search=04465-0E010");
    assert.equal(response.status, 200);
    assert.equal(body.groups.length, 1);
    assert.equal(body.groups[0].skus[0].id, "DEMO-BP01-001");
    assert.equal("inventory" in body.groups[0].skus[0], false);
    assert.equal("bin" in body.groups[0].skus[0], false);
    const groups = await request(base, "/api/groups");
    assert.equal(groups.response.status, 200);
    assert.equal(groups.body.items.length, 3);
  });
});

test("create, update and status changes persist", async () => {
  await withApi(async (base) => {
    const payload = {
      group: { name: "空气滤清器", reference: "DEMO-AF01", category: "滤清器", image: "oil-filter.png" },
      sku: { id: "DEMO-AF01-001", brand: "MANN", partNo: "C 27009", unit: "个", packQuantity: 1, price: 89, status: "draft", note: "首批资料" },
      oeNumbers: ["17801-0T020", "17801-0T030"],
      fitments: [{ make: "丰田", series: "卡罗拉", yearFrom: 2019, yearTo: 2023, position: "发动机", source: "供应商目录", verificationStatus: "pending" }],
    };
    const created = await request(base, "/api/skus", { method: "POST", body: JSON.stringify(payload) });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.id, "DEMO-AF01-001");
    assert.equal(created.body.oeNumbers.length, 2);

    payload.group = { id: created.body.group.id };
    payload.sku.price = 92;
    payload.sku.status = "enabled";
    const updated = await request(base, "/api/skus/DEMO-AF01-001", { method: "PUT", body: JSON.stringify(payload) });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.price, 92);
    assert.equal(updated.body.status, "enabled");

    const status = await request(base, "/api/skus/DEMO-AF01-001/status", { method: "PATCH", body: JSON.stringify({ status: "disabled", reason: "资料调整" }) });
    assert.equal(status.response.status, 200);
    assert.equal(status.body.status, "disabled");

    const activity = await request(base, "/api/skus/DEMO-AF01-001/activity");
    assert.equal(activity.response.status, 200);
    assert.equal(activity.body.items[0].action, "status");
  });
});

test("duplicate SKU codes and incomplete payloads are rejected", async () => {
  await withApi(async (base) => {
    const invalid = await request(base, "/api/skus", { method: "POST", body: JSON.stringify({ group: {}, sku: {}, oeNumbers: [] }) });
    assert.equal(invalid.response.status, 422);
    assert.equal(invalid.body.details.id, "请填写 SKU 编码");

    const duplicate = {
      group: { id: "brake" },
      sku: { id: "DEMO-BP01-001", brand: "NEW", partNo: "NEW-001", unit: "套", packQuantity: 1, price: 100, status: "draft" },
      oeNumbers: ["NEW-OE"],
      fitments: [],
    };
    const result = await request(base, "/api/skus", { method: "POST", body: JSON.stringify(duplicate) });
    assert.equal(result.response.status, 409);
    assert.equal(result.body.details.id, "SKU 编码已存在");
  });
});

test("only draft SKUs can be deleted", async () => {
  await withApi(async (base) => {
    const blocked = await request(base, "/api/skus/DEMO-BP01-001", { method: "DELETE" });
    assert.equal(blocked.response.status, 409);

    const draft = {
      group: { id: "brake" },
      sku: { id: "DRAFT-001", brand: "TEST", partNo: "DRAFT-PART", unit: "个", packQuantity: 1, price: 0, status: "draft" },
      oeNumbers: ["DRAFT-OE"],
      fitments: [],
    };
    assert.equal((await request(base, "/api/skus", { method: "POST", body: JSON.stringify(draft) })).response.status, 201);
    assert.equal((await request(base, "/api/skus/DRAFT-001", { method: "DELETE" })).response.status, 204);
    assert.equal((await request(base, "/api/skus/DRAFT-001")).response.status, 404);
  });
});

test("CSV-shaped import previews atomically and export returns SKU data", async () => {
  await withApi(async (base) => {
    const firstRow = {
      group: { name: "空气滤清器", reference: "DEMO-AF01", category: "滤清器", image: "brake-pads.png" },
      sku: { id: "IMPORT-001", brand: "MANN", partNo: "C 27009 IMPORT", unit: "个", packQuantity: 1, price: 89, status: "draft", note: "批量导入" },
      oeNumbers: ["17801-0T020"],
      fitments: [{ make: "丰田", series: "卡罗拉", yearFrom: 2019, yearTo: 2023, verificationStatus: "pending" }],
    };
    const rows = [firstRow, {
      ...firstRow,
      sku: { ...firstRow.sku, id: "IMPORT-002", partNo: "C 27009 IMPORT 2" },
      oeNumbers: ["17801-0T030"],
    }];
    const preview = await request(base, "/api/import/preview", { method: "POST", body: JSON.stringify({ rows, mode: "upsert" }) });
    assert.equal(preview.response.status, 200);
    assert.equal(preview.body.valid, 2);
    assert.equal(preview.body.committed, false);
    assert.equal((await request(base, "/api/skus/IMPORT-001")).response.status, 404);

    const imported = await request(base, "/api/import", { method: "POST", body: JSON.stringify({ rows, mode: "upsert" }) });
    assert.equal(imported.response.status, 200);
    assert.equal(imported.body.committed, true);
    assert.equal((await request(base, "/api/skus/IMPORT-001")).response.status, 200);
    assert.equal((await request(base, "/api/skus/IMPORT-002")).response.status, 200);

    const exported = await request(base, "/api/export");
    assert.equal(exported.response.status, 200);
    assert.equal(exported.body.items.some((item) => item.id === "IMPORT-001" && item.oeNumbers[0] === "17801-0T020"), true);

    const invalidRows = [{ ...firstRow, sku: { ...firstRow.sku, id: "IMPORT-003", partNo: "C 27009 IMPORT 3" } }, { ...firstRow, sku: { ...firstRow.sku, id: "IMPORT-004", partNo: "" } }];
    const rejected = await request(base, "/api/import", { method: "POST", body: JSON.stringify({ rows: invalidRows, mode: "insert" }) });
    assert.equal(rejected.response.status, 422);
    assert.equal(rejected.body.committed, false);
    assert.equal((await request(base, "/api/skus/IMPORT-003")).response.status, 404);
    assert.equal((await request(base, "/api/skus/IMPORT-004")).response.status, 404);
  });
});
