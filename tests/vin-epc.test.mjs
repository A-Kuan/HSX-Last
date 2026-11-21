import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../server/app.mjs";
import { listVehicleGenerations, openDatabase, readEpcVinCache, resolveVehicleGeneration, writeEpcVinCache } from "../server/db.mjs";
import { EPC_CACHE_VERSION, normalizeEpcVinPayload } from "../server/epc.mjs";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/epc-vin-wp1ag2927cla71617.json", import.meta.url), "utf8"));
const datedFixture = JSON.parse(readFileSync(new URL("./fixtures/epc-vin-dates.json", import.meta.url), "utf8"));
const VIN = "WP1AG2927CLA71617";

async function withApi(run) {
  const directory = mkdtempSync(join(tmpdir(), "hsx-vin-epc-"));
  const db = openDatabase(join(directory, "test.sqlite"));
  const app = createApp({ db });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  const { port } = app.address();
  try {
    await run(`http://127.0.0.1:${port}`, db);
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

test("EPC payload normalizes into the vehicle fields HSX stores", () => {
  const db = openDatabase(":memory:");
  const decoded = normalizeEpcVinPayload(fixture, (series, chassis) => resolveVehicleGeneration(db, series, chassis));
  db.close();
  assert.equal(decoded.source, "epc");
  assert.equal(decoded.matched, true);
  assert.equal(decoded.vin, VIN);
  assert.equal(decoded.brand, "保时捷");
  assert.equal(decoded.series, "凯宴");
  assert.equal(decoded.model, "Cayenne");
  assert.equal(decoded.year, "2012");
  assert.equal(decoded.yearFrom, "2012");
  assert.equal(decoded.yearTo, "2012");
  assert.equal(decoded.engine, "CJT");
  assert.equal(decoded.displacement, "3.0T");
  assert.equal(decoded.transmission, "手自一体变速器(AT)");
  assert.equal(decoded.drive, "前置四驱");
  assert.equal(decoded.body, "SUV");
  assert.equal(decoded.chassisCode, "E2");
  assert.equal(decoded.generation, "第二代");
  assert.equal(decoded.platform, "92A");
  assert.equal(decoded.madeIn, "德国");
  assert.equal(decoded.candidates.length, 2);
  assert.equal(decoded.candidates[1].salesVersion, "四驱 高配型");
});

test("EPC dates collapse to the year that the vehicle form stores", () => {
  const db = openDatabase(":memory:");
  const decoded = normalizeEpcVinPayload(datedFixture, (series, chassis) => resolveVehicleGeneration(db, series, chassis));
  db.close();
  assert.equal(decoded.yearFrom, "2015");
  assert.equal(decoded.yearTo, "2018");
  assert.equal(decoded.dateBegin, "2015-12-01");
  assert.equal(decoded.dateEnd, "2018-07-25");
  assert.equal(decoded.year, "2017");
  assert.equal(decoded.generation, "第一代");
  assert.equal(decoded.platform, "95B");
  assert.equal(decoded.candidates[0].yearFrom, "2015");
  assert.equal(decoded.candidates[0].yearTo, "2018");
});

test("EPC payload without model rows reports no match", () => {
  const decoded = normalizeEpcVinPayload({ code: "0", success: true, data: { msg: "success", data: { full_vin: VIN, model_list: [] } } });
  assert.equal(decoded.matched, false);
  assert.deepEqual(decoded.candidates, []);
  assert.equal(decoded.vin, VIN);
});

test("EPC login endpoint validates credentials and clears the session", async () => {
  const previousToken = process.env.EPC_TOKEN;
  const previousFile = process.env.EPC_TOKEN_FILE;
  delete process.env.EPC_TOKEN;
  process.env.EPC_TOKEN_FILE = join(mkdtempSync(join(tmpdir(), "hsx-epc-login-")), "token.json");
  try {
    await withApi(async (base) => {
      const missing = await request(base, "/api/epc/login", {
        method: "POST",
        body: JSON.stringify({}),
      });
      assert.equal(missing.response.status, 422);
      assert.match(missing.body.error, /账号/);

      const status = await request(base, "/api/epc/status");
      assert.equal(status.body.configured, false);
      assert.equal(status.body.account, "");

      const logout = await request(base, "/api/epc/logout", { method: "POST" });
      assert.equal(logout.response.status, 200);
      assert.equal(logout.body.configured, false);
    });
  } finally {
    if (previousToken === undefined) delete process.env.EPC_TOKEN;
    else process.env.EPC_TOKEN = previousToken;
    if (previousFile === undefined) delete process.env.EPC_TOKEN_FILE;
    else process.env.EPC_TOKEN_FILE = previousFile;
  }
});

test("VIN EPC endpoints validate the VIN, require a token and serve the cache", async () => {
  const previousToken = process.env.EPC_TOKEN;
  const previousFile = process.env.EPC_TOKEN_FILE;
  delete process.env.EPC_TOKEN;
  process.env.EPC_TOKEN_FILE = join(mkdtempSync(join(tmpdir(), "hsx-epc-token-")), "missing.json");
  try {
    await withApi(async (base, db) => {
      const status = await request(base, "/api/vin/epc/status");
      assert.equal(status.response.status, 200);
      assert.equal(status.body.configured, false);

      const invalid = await request(base, "/api/vin/epc?vin=SHORT");
      assert.equal(invalid.response.status, 422);

      const unconfigured = await request(base, `/api/vin/epc?vin=${VIN}`);
      assert.equal(unconfigured.response.status, 409);
      assert.match(unconfigured.body.error, /token/);

      assert.equal(readEpcVinCache(db, VIN), null);
      const decoded = { ...normalizeEpcVinPayload(fixture), version: EPC_CACHE_VERSION };
      writeEpcVinCache(db, VIN.toLowerCase(), decoded);
      assert.equal(readEpcVinCache(db, VIN).brand, "保时捷");

      const cached = await request(base, `/api/vin/epc?vin=${VIN}`);
      assert.equal(cached.response.status, 200);
      assert.equal(cached.body.cached, true);
      assert.equal(cached.body.series, "凯宴");
      assert.equal(cached.body.generation, "第二代");
      assert.equal(cached.body.platform, "92A");
    });
  } finally {
    if (previousToken === undefined) delete process.env.EPC_TOKEN;
    else process.env.EPC_TOKEN = previousToken;
    if (previousFile === undefined) delete process.env.EPC_TOKEN_FILE;
    else process.env.EPC_TOKEN_FILE = previousFile;
  }
});

test("generation table is seeded, editable and resolves VIN rows", async () => {
  await withApi(async (base, db) => {
    const seeded = await request(base, "/api/generations");
    assert.equal(seeded.response.status, 200);
    assert.ok(seeded.body.items.some((item) => item.series === "迈凯" && item.chassisCode === "95B"));
    assert.equal(listVehicleGenerations(db).length, seeded.body.items.length);

    const created = await request(base, "/api/generations", {
      method: "POST",
      body: JSON.stringify({ series: "911", chassisCode: "992", generation: "第八代", platform: "992" }),
    });
    assert.equal(created.response.status, 201);
    assert.deepEqual(resolveVehicleGeneration(db, "911", "992"), { generation: "第八代", platform: "992" });

    const duplicate = await request(base, "/api/generations", {
      method: "POST",
      body: JSON.stringify({ series: "911", chassisCode: "992", generation: "第八代" }),
    });
    assert.equal(duplicate.response.status, 409);

    const incomplete = await request(base, "/api/generations", {
      method: "POST",
      body: JSON.stringify({ series: "", chassisCode: "" }),
    });
    assert.equal(incomplete.response.status, 422);

    const updated = await request(base, `/api/generations/${created.body.id}`, {
      method: "PUT",
      body: JSON.stringify({ series: "911", chassisCode: "992", generation: "第八代", platform: "992.2" }),
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.platform, "992.2");

    const removed = await request(base, `/api/generations/${created.body.id}`, { method: "DELETE" });
    assert.equal(removed.response.status, 204);
    assert.deepEqual(resolveVehicleGeneration(db, "911", "992"), { generation: "", platform: "992" });
  });
});
