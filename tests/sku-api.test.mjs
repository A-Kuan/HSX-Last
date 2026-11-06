import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../server/app.mjs";
import { openDatabase, seedDemoData } from "../server/db.mjs";

async function withApi(run) {
  const directory = mkdtempSync(join(tmpdir(), "hsx-sku-api-"));
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

test("catalog returns persisted SKU groups without inventory fields", async () => {
  await withApi(async (base) => {
    const { response, body } = await request(base, "/api/catalog?search=04465-0E010");
    assert.equal(response.status, 200);
    assert.equal(body.groups.length, 1);
    assert.equal(body.groups[0].skus[0].id, "DEMO-BP01-001");
    assert.equal("inventory" in body.groups[0].skus[0], false);
    assert.equal("bin" in body.groups[0].skus[0], false);
    // OE 搜索命中整个商品组：同一个件的所有品牌都会列出来
    assert.equal(body.groups[0].skus.length, 3);
    assert.equal(body.groups[0].totalSkuCount, 3);
    assert.equal(body.groups[0].enabledSkuCount, 3);
    const groups = await request(base, "/api/groups");
    assert.equal(groups.response.status, 200);
    const references = groups.body.items.map((group) => group.reference);
    for (const reference of ["DEMO-BP01", "DEMO-OF01", "DEMO-CA01"]) {
      assert.ok(references.includes(reference), `expected seed group ${reference}`);
    }
  });
});

test("group totals count the whole group while a search filters its SKUs", async () => {
  await withApi(async (base) => {
    const { response, body } = await request(base, "/api/catalog?search=TRW");
    assert.equal(response.status, 200);
    const arm = body.groups.find((group) => group.reference === "DEMO-CA01");
    assert.ok(arm, "expected the control-arm group to match TRW");
    assert.equal(arm.skus.length, 1, "search still narrows the listed SKUs");
    assert.equal(arm.totalSkuCount, 4, "total stays the whole group");
    assert.equal(arm.enabledSkuCount, 3, "enabled total ignores the search filter");
    const disabledOnly = await request(base, "/api/catalog?status=disabled&search=TRW");
    assert.equal(disabledOnly.body.groups.length, 0, "TRW is not a disabled SKU");
    const disabled = await request(base, "/api/catalog?status=disabled");
    const disabledArm = disabled.body.groups.find((group) => group.reference === "DEMO-CA01");
    assert.equal(disabledArm.skus.length, 1);
    assert.equal(disabledArm.totalSkuCount, 4);
    assert.equal(disabledArm.enabledSkuCount, 3);
  });
});

test("vehicle lookup resolves a colloquial vehicle plus a part set", async () => {
  await withApi(async (base) => {
    const { response, body } = await request(base, `/api/vehicle-lookup?q=${encodeURIComponent("卡宴E3三滤")}`);
    assert.equal(response.status, 200);
    assert.equal(body.vehicle.brand, "保时捷");
    assert.equal(body.vehicle.series, "Cayenne");
    assert.equal(body.vehicle.platform, "9YA");
    assert.equal(body.set.name, "三滤");
    assert.deepEqual(body.categories.map((category) => category.partType.name), ["机油滤清器", "空气滤清器", "空调滤清器"]);
    for (const category of body.categories) {
      const skus = category.items.flatMap((item) => item.skus);
      assert.ok(skus.length >= 2, `${category.partType.name} should offer several brands`);
      assert.ok(skus.every((sku) => sku.partNo && typeof sku.price === "number"));
    }
    assert.deepEqual(body.missing, []);
    const byAlias = await request(base, `/api/vehicle-lookup?q=${encodeURIComponent("9YA 三滤")}`);
    assert.equal(byAlias.body.vehicle.id, body.vehicle.id);
    const shared = await request(base, `/api/vehicle-lookup?q=${encodeURIComponent("途锐 CR7 三滤")}`);
    assert.equal(shared.body.vehicle.brand, "大众");
    assert.deepEqual(shared.body.categories.map((category) => category.items[0].group.id), body.categories.map((category) => category.items[0].group.id));
  });
});

test("vehicle lookup flags part types that are not catalogued yet", async () => {
  await withApi(async (base) => {
    const { body } = await request(base, `/api/vehicle-lookup?q=${encodeURIComponent("卡宴 E3 四滤")}`);
    assert.equal(body.categories.length, 4);
    assert.deepEqual(body.missing, ["燃油滤清器"]);
    const unknown = await request(base, "/api/vehicle-lookup?q=%E6%B1%89%E5%85%B0%E8%BE%BE%20%E4%B8%89%E6%BB%A4");
    assert.equal(unknown.body.vehicle, null);
    assert.equal(unknown.body.categories.length, 0);
    assert.equal(unknown.body.set.name, "三滤");
  });
});

test("vehicles can be created, updated and deleted", async () => {
  await withApi(async (base) => {
    const created = await request(base, "/api/vehicles", {
      method: "POST",
      body: JSON.stringify({
        brand: "奥迪", series: "Q5L", generation: "FY", platform: "80A", yearFrom: 2018, yearTo: 2024, engine: "2.0T",
        aliases: ["Q5L", "奥迪Q5L", "80A"],
        products: [{ groupId: "of-ea839", partTypeId: "oil-filter" }],
      }),
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.aliases.length, 3);
    assert.equal(created.body.productCount, 1);

    const updated = await request(base, `/api/vehicles/${created.body.id}`, {
      method: "PUT",
      body: JSON.stringify({ ...created.body, aliases: ["Q5L"], products: [] }),
    });
    assert.equal(updated.body.aliases.length, 1);
    assert.equal(updated.body.productCount, 0);

    const invalid = await request(base, "/api/vehicles", { method: "POST", body: JSON.stringify({ brand: "", series: "A3" }) });
    assert.equal(invalid.response.status, 422);
    assert.ok(invalid.body.details.brand);

    const removed = await request(base, `/api/vehicles/${created.body.id}`, { method: "DELETE" });
    assert.equal(removed.response.status, 204);
    const list = await request(base, "/api/vehicles");
    assert.equal(list.body.items.some((vehicle) => vehicle.id === created.body.id), false);
  });
});

test("sku relations support interchange and supersede chains", async () => {
  await withApi(async (base) => {
    const interchange = await request(base, "/api/skus/DEMO-FL01-001/relations", {
      method: "POST", body: JSON.stringify({ type: "interchange", targetId: "DEMO-FL01-002" }),
    });
    assert.equal(interchange.response.status, 201);
    assert.equal(interchange.body.interchanges.length, 1);
    const mirror = await request(base, "/api/skus/DEMO-FL01-002/relations");
    assert.equal(mirror.body.interchanges[0].sku.id, "DEMO-FL01-001");

    await request(base, "/api/skus/DEMO-FL01-001/relations", { method: "POST", body: JSON.stringify({ type: "supersedes", targetId: "DEMO-FL01-002" }) });
    const chained = await request(base, "/api/skus/DEMO-FL01-002/relations", { method: "POST", body: JSON.stringify({ type: "supersedes", targetId: "DEMO-FL01-003" }) });
    assert.equal(chained.body.replacedBy[0].sku.id, "DEMO-FL01-003");

    const first = await request(base, "/api/skus/DEMO-FL01-001/relations");
    assert.deepEqual(first.body.chain.map((sku) => sku.id), ["DEMO-FL01-002", "DEMO-FL01-003"]);

    const cycle = await request(base, "/api/skus/DEMO-FL01-003/relations", { method: "POST", body: JSON.stringify({ type: "supersedes", targetId: "DEMO-FL01-001" }) });
    assert.equal(cycle.response.status, 409);
    const duplicate = await request(base, "/api/skus/DEMO-FL01-001/relations", { method: "POST", body: JSON.stringify({ type: "interchange", targetId: "DEMO-FL01-002" }) });
    assert.equal(duplicate.response.status, 409);

    const relationId = first.body.interchanges[0].relationId;
    const removed = await request(base, `/api/relations/${relationId}`, { method: "DELETE" });
    assert.equal(removed.response.status, 204);
    const after = await request(base, "/api/skus/DEMO-FL01-001/relations");
    assert.equal(after.body.interchanges.length, 0);
    assert.equal(after.body.replacedBy.length, 1);
  });
});

test("product group fields can be edited and brands are listed", async () => {
  await withApi(async (base) => {
    const renamed = await request(base, "/api/groups/filter", {
      method: "PUT",
      body: JSON.stringify({ name: "机油滤清器（新）", reference: "DEMO-OF01", category: "滤清器" }),
    });
    assert.equal(renamed.response.status, 200);
    assert.equal(renamed.body.name, "机油滤清器（新）");

    const catalog = await request(base, "/api/catalog");
    assert.ok(catalog.body.groups.some((group) => group.name === "机油滤清器（新）"));

    const duplicate = await request(base, "/api/groups/filter", {
      method: "PUT",
      body: JSON.stringify({ name: "重复编码", reference: "DEMO-BP01", category: "滤清器" }),
    });
    assert.equal(duplicate.response.status, 409);
    assert.ok(duplicate.body.details.groupReference);

    const invalid = await request(base, "/api/groups/filter", {
      method: "PUT",
      body: JSON.stringify({ name: "", reference: "DEMO-OF01", category: "滤清器" }),
    });
    assert.equal(invalid.response.status, 422);

    const brands = await request(base, "/api/brands");
    assert.equal(brands.response.status, 200);
    for (const brand of ["BOSCH", "MANN", "MAHLE"]) assert.ok(brands.body.items.includes(brand), `expected brand ${brand}`);
  });
});

test("groups can be created, updated and deleted when unused", async () => {
  await withApi(async (base) => {
    const created = await request(base, "/api/groups", {
      method: "POST",
      body: JSON.stringify({ name: "空气滤清器", reference: "DEMO-AF02", category: "滤清器", note: "方型滤芯" }),
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.skuCount, 0);
    assert.equal(created.body.vehicleCount, 0);
    assert.equal(created.body.note, "方型滤芯");

    const duplicate = await request(base, "/api/groups", {
      method: "POST",
      body: JSON.stringify({ name: "重复", reference: "DEMO-AF02", category: "滤清器" }),
    });
    assert.equal(duplicate.response.status, 409);

    const invalid = await request(base, "/api/groups", { method: "POST", body: JSON.stringify({ name: "", reference: "" }) });
    assert.equal(invalid.response.status, 422);
    assert.ok(invalid.body.details.name);
    assert.ok(invalid.body.details.category);

    const updated = await request(base, `/api/groups/${created.body.id}`, {
      method: "PUT",
      body: JSON.stringify({ name: "空气滤清器（方型）", reference: "DEMO-AF02", category: "滤清器", note: "已核实" }),
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.name, "空气滤清器（方型）");
    assert.equal(updated.body.note, "已核实");

    const removed = await request(base, `/api/groups/${created.body.id}`, { method: "DELETE" });
    assert.equal(removed.response.status, 204);

    const blocked = await request(base, "/api/groups/filter", { method: "DELETE" });
    assert.equal(blocked.response.status, 409);
    assert.match(blocked.body.error, /SKU/);
  });
});

test("group oe numbers drive merge previews and merging", async () => {
  await withApi(async (base) => {
    const left = await request(base, "/api/groups", {
      method: "POST",
      body: JSON.stringify({ name: "摆臂 A", reference: "G-A", category: "底盘悬挂", position: "左", oeNumbers: ["8K0 407 151"] }),
    });
    assert.equal(left.response.status, 201);
    assert.deepEqual(left.body.oeNumbers, ["8K0 407 151"]);
    const right = await request(base, "/api/groups", {
      method: "POST",
      body: JSON.stringify({ name: "摆臂 B", reference: "G-B", category: "底盘悬挂", position: "右", oeNumbers: ["8K0 407 152"] }),
    });

    await request(base, "/api/skus", {
      method: "POST",
      body: JSON.stringify({
        group: { id: left.body.id },
        sku: { id: "DEMO-MA-001", brand: "TRW", partNo: "JTC-1", unit: "个", packQuantity: 1, price: 100, status: "draft" },
        oeNumbers: ["8K0 407 151"],
        fitments: [],
      }),
    });

    const mismatch = await request(base, "/api/groups/merge/preview", {
      method: "POST", body: JSON.stringify({ sourceId: left.body.id, targetId: right.body.id }),
    });
    assert.equal(mismatch.body.positionMismatch, true);
    assert.equal(mismatch.body.canMerge, false);
    const blocked = await request(base, "/api/groups/merge", {
      method: "POST", body: JSON.stringify({ sourceId: left.body.id, targetId: right.body.id }),
    });
    assert.equal(blocked.response.status, 409);

    const extra = await request(base, "/api/groups", {
      method: "POST",
      body: JSON.stringify({ name: "摆臂 A2", reference: "G-A2", category: "底盘悬挂", position: "左", oeNumbers: ["8K0 407 151", "8K0 407 153"] }),
    });
    const preview = await request(base, "/api/groups/merge/preview", {
      method: "POST", body: JSON.stringify({ sourceId: extra.body.id, targetId: left.body.id }),
    });
    assert.equal(preview.body.canMerge, true);
    assert.equal(preview.body.oeOverlap, 1);

    const merged = await request(base, "/api/groups/merge", {
      method: "POST", body: JSON.stringify({ sourceId: extra.body.id, targetId: left.body.id }),
    });
    assert.equal(merged.response.status, 200);
    assert.deepEqual([...merged.body.oeNumbers].sort(), ["8K0 407 151", "8K0 407 153"]);
    const after = await request(base, "/api/groups");
    assert.equal(after.body.items.some((group) => group.reference === "G-A2"), false);
    assert.equal(after.body.items.find((group) => group.reference === "G-A").skuCount, 1);
  });
});

test("group oe numbers are searchable and one can be primary", async () => {
  await withApi(async (base) => {
    const created = await request(base, "/api/groups", {
      method: "POST",
      body: JSON.stringify({
        name: "机油滤清器 EA888", reference: "G-OE", category: "滤清器", position: "发动机",
        oeNumbers: ["06L 115 562 B", "06L 115 466 C", "06L 115 562 E"], primaryOe: "06L 115 562 E",
      }),
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.primaryOe, "06L 115 562 E");
    assert.equal(created.body.oeNumbers.length, 3);

    await request(base, "/api/skus", {
      method: "POST",
      body: JSON.stringify({
        group: { id: created.body.id },
        sku: { id: "DEMO-OE-001", brand: "MANN", partNo: "HU 6006 z", unit: "个", packQuantity: 1, price: 60, status: "draft" },
        oeNumbers: ["06L 115 562 B"],
        fitments: [],
      }),
    });

    const withoutSpaces = await request(base, "/api/catalog?search=06L115466C");
    assert.equal(withoutSpaces.body.groups.length, 1);
    assert.equal(withoutSpaces.body.groups[0].reference, "G-OE");
    const withSpaces = await request(base, "/api/catalog?search=06L%20115%20466%20C");
    assert.equal(withSpaces.body.groups.length, 1);

    const switched = await request(base, `/api/groups/${created.body.id}`, {
      method: "PUT",
      body: JSON.stringify({ primaryOe: "06L 115 562 B" }),
    });
    assert.equal(switched.body.primaryOe, "06L 115 562 B");
  });
});

test("sku origin and channel are stored and registered in the dictionary", async () => {
  await withApi(async (base) => {
    const created = await request(base, "/api/skus", {
      method: "POST",
      body: JSON.stringify({
        group: { name: "打气泵", reference: "DEMO-PUMP", category: "保养件" },
        sku: { id: "DEMO-PUMP-001", brand: "CONTINENTAL", partNo: "CONT-001", unit: "个", origin: "进口", channel: "4S/服务站", packQuantity: 1, price: 480, status: "draft" },
        oeNumbers: ["06L 115 562 E"],
        fitments: [],
      }),
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.origin, "进口");
    assert.equal(created.body.channel, "4S/服务站");

    const catalog = await request(base, "/api/catalog?search=CONT-001");
    const sku = catalog.body.groups[0].skus[0];
    assert.equal(sku.origin, "进口");
    assert.equal(sku.channel, "4S/服务站");

    const updated = await request(base, "/api/skus/DEMO-PUMP-001", {
      method: "PUT",
      body: JSON.stringify({
        group: { id: created.body.group.id },
        sku: { id: "DEMO-PUMP-001", brand: "CONTINENTAL", partNo: "CONT-001", unit: "个", origin: "国产", channel: "电商", packQuantity: 1, price: 480, status: "draft" },
        oeNumbers: ["06L 115 562 E"],
        fitments: [],
      }),
    });
    assert.equal(updated.body.origin, "国产");
    assert.equal(updated.body.channel, "电商");

    const dictionaries = await request(base, "/api/dictionaries");
    assert.ok(dictionaries.body.origins.some((item) => item.name === "国产"));
    assert.ok(dictionaries.body.channels.some((item) => item.name === "电商"));
  });
});
test("OEM skus may omit the brand part number and the price", async () => {
  await withApi(async (base) => {
    const payload = (id) => ({
      group: { name: "机油滤清器", reference: "DEMO-OEM", category: "滤清器" },
      sku: { id, brand: "原厂", partNo: "", unit: "个", origin: "进口", channel: "进口大众", packQuantity: 1, status: "draft" },
      oeNumbers: ["06L 115 562 B"],
      fitments: [],
    });
    const first = await request(base, "/api/skus", { method: "POST", body: JSON.stringify(payload("OEM-001")) });
    assert.equal(first.response.status, 201);
    assert.equal(first.body.partNo, "");
    assert.equal(first.body.price, 0);

    const second = await request(base, "/api/skus", { method: "POST", body: JSON.stringify(payload("OEM-002")) });
    assert.equal(second.response.status, 201);

    const catalog = await request(base, "/api/catalog?search=06L115562B");
    assert.equal(catalog.body.groups.length, 1);
    assert.equal(catalog.body.groups[0].skus.length, 2);
  });
});
test("group delete cascades only after explicit confirmation", async () => {
  await withApi(async (base) => {
    const blocked = await request(base, "/api/groups/brake", { method: "DELETE" });
    assert.equal(blocked.response.status, 409);
    assert.ok(blocked.body.details.skuCount > 0);

    const forced = await request(base, "/api/groups/brake?force=1", { method: "DELETE" });
    assert.equal(forced.response.status, 204);

    const catalog = await request(base, "/api/catalog");
    assert.equal(catalog.body.groups.some((group) => group.reference === "DEMO-BP01"), false);
    assert.equal((await request(base, "/api/skus/DEMO-BP01-001")).response.status, 404);
    const groups = await request(base, "/api/groups");
    assert.equal(groups.body.items.some((group) => group.reference === "DEMO-BP01"), false);
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

    const invalidRows = [{ ...firstRow, sku: { ...firstRow.sku, id: "IMPORT-003", partNo: "C 27009 IMPORT 3" } }, { ...firstRow, sku: { ...firstRow.sku, id: "IMPORT-004", partNo: "", unit: "" } }];
    const rejected = await request(base, "/api/import", { method: "POST", body: JSON.stringify({ rows: invalidRows, mode: "insert" }) });
    assert.equal(rejected.response.status, 422);
    assert.equal(rejected.body.committed, false);
    assert.equal((await request(base, "/api/skus/IMPORT-003")).response.status, 404);
    assert.equal((await request(base, "/api/skus/IMPORT-004")).response.status, 404);
  });
});
