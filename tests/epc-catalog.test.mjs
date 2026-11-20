import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../server/app.mjs";
import { openDatabase } from "../server/db.mjs";
import { figureOf, parseParts, parseSubgroups } from "../server/epc-catalog.mjs";

const VIN = "WP1AA2951HLB19468";
const fakeToken = `x.${Buffer.from(JSON.stringify({ sub: JSON.stringify({ userId: "1007", userName: "测试" }) })).toString("base64url")}.y`;

async function withApi(run) {
  const directory = mkdtempSync(join(tmpdir(), "hsx-epc-catalog-"));
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

const request = async (base, path) => {
  const response = await fetch(`${base}${path}`);
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
};

const hscpReply = (url) => {
  const target = decodeURIComponent(url);
  if (target.includes("/vins/cars/vin?")) return { code: 1, data: { vin: VIN, modelName: "保时捷-Macan R4 TFSI-2017年", brandCode: "porsches", mcid: "MCID%2B" } };
  if (target.includes("/vins/cars/group?")) {
    return {
      code: 1,
      data: [
        { num: "0", label: "配件，信息娱乐系统，其他", img: "https://structimgsnew.007vin.com/group/a.jpg" },
        { num: "1", label: "发动机", img: "" },
      ],
    };
  }
  if (target.includes("/vins/cars/subgroup?")) {
    return {
      code: 1,
      data: [
        { mid: "101000", name: "备用马达<br/>不带:<br/>从动盘", subGroup: "01", hasChild: "0", imageLarge: "x", colorValue: "1" },
        { mid: "101005", name: "短发动机 部分发动机", subGroup: "01", hasChild: "0", imageLarge: "", colorValue: "0" },
        { mid: "102000", name: "曲轴 连杆", subGroup: "01", hasChild: "0", imageLarge: "" },
        { mid: "", name: "空图号", subGroup: "01", hasChild: "0", imageLarge: "" },
      ],
    };
  }
  if (target.includes("/vins/cars/parts?")) {
    return {
      code: 1,
      img: { imagePath: "https://structimgs.007vin.com/struct/1000015/x.png", imgPoints: { hotspots: [{ hsX: 10, hsY: 20, maxX: 30, maxY: 40, hsKey: "1" }] } },
      data: {
        partDetail: [
          [
            { pid: "", pnum: "", label: "备用马达<br/>不带: 从动盘" },
            { pid: "94610093000", pnum: "1", quantity: "1", label: "备用马达<br/>未装配完成", saCode: "L0L" },
            { pid: "95872121100", pnum: "2", quantity: "1", label: "汽车千斤顶<br/>弃用零件", colorValue: "0", model: "CNCC,CNC", itid: "(2)" },
          ],
        ],
      },
    };
  }
  return { code: 1004, msg: "没有查询数据" };
};

test("EPC catalog helpers normalize labels, figures and parts", () => {
  assert.equal(figureOf("101020"), "101-020");
  assert.equal(figureOf("101"), "101");
  const subgroups = parseSubgroups(hscpReply("/vins/cars/subgroup?num=1").data);
  assert.equal(subgroups.length, 3);
  assert.equal(subgroups[0].figure, "101-000");
  assert.equal(subgroups[0].thumbnail, "https://structimgs.007vin.com/thumbnail/1000015/x.png");
  assert.equal(subgroups[0].diagram, "https://structimgs.007vin.com/struct/1000015/x.png");
  assert.equal(subgroups[1].thumbnail, "");
  assert.equal(subgroups[0].name, "备用马达 不带: 从动盘");
  assert.equal(subgroups[1].figure, "101-005");
  assert.equal(subgroups[0].applicable, true);
  assert.equal(subgroups[1].applicable, false);

  const parts = parseParts(hscpReply("/vins/cars/parts?num=1").data.partDetail.flat());
  assert.equal(parts.length, 2);
  assert.equal(parts[0].oe, "94610093000");
  assert.equal(parts[0].position, "1");
  assert.equal(parts[0].saCode, "L0L");
  assert.equal(parts[1].discontinued, true);
  assert.equal(parts[0].applicable, true);
  assert.equal(parts[1].applicable, false);
  assert.equal(parts[1].model, "CNCC,CNC");
  assert.equal(parts[1].alternate, "(2)");
});

test("EPC catalog endpoints expose vehicle, groups, subgroups and parts", async () => {
  const previousFetch = globalThis.fetch;
  const previousToken = process.env.EPC_TOKEN;
  const calls = [];
  process.env.EPC_TOKEN = fakeToken;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("http://127.0.0.1")) return previousFetch(input, init);
    calls.push(url);
    const payload = hscpReply(url);
    return { ok: true, status: 200, text: async () => JSON.stringify(payload), json: async () => payload };
  };
  try {
    await withApi(async (base) => {
      const invalid = await request(base, "/api/epc/catalog?vin=SHORT");
      assert.equal(invalid.response.status, 422);

      const catalog = await request(base, `/api/epc/catalog?vin=${VIN}`);
      assert.equal(catalog.response.status, 200);
      assert.equal(catalog.body.vehicle.modelName, "保时捷-Macan R4 TFSI-2017年");
      assert.equal(catalog.body.groups.length, 2);
      assert.equal(catalog.body.groups[0].label, "配件，信息娱乐系统，其他");

      const group = await request(base, `/api/epc/group?vin=${VIN}&num=0`);
      assert.equal(group.response.status, 200);
      assert.equal(group.body.subgroups.length, 3);
      assert.equal(group.body.subgroups[0].name, "备用马达 不带: 从动盘");

      const parts = await request(base, `/api/epc/parts?vin=${VIN}&num=0&mid=101000`);
      assert.equal(parts.response.status, 200);
      assert.equal(parts.body.parts.length, 2);
      assert.equal(parts.body.parts[0].oe, "94610093000");
  assert.equal(parts.body.hotspots.length, 1);
  assert.equal(parts.body.hotspots[0].key, "1");

      const filtered = await request(base, `/api/epc/parts?vin=${VIN}&num=0&mid=101000&filter=1`);
      assert.equal(filtered.response.status, 200);
      const partsCall = calls.map((url) => decodeURIComponent(url)).filter((url) => url.includes("/vins/cars/parts?"))
        .find((url) => url.includes("filter=1"));
      assert.ok(partsCall, "零件请求应带 filter=1");

      const before = calls.length;
      await request(base, `/api/epc/group?vin=${VIN}&num=0`);
      await request(base, `/api/epc/parts?vin=${VIN}&num=0&mid=101000`);
      assert.equal(calls.length, before, "重复请求应命中进程内缓存");

      const missingNum = await request(base, `/api/epc/group?vin=${VIN}`);
      assert.equal(missingNum.response.status, 422);
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.EPC_TOKEN;
    else process.env.EPC_TOKEN = previousToken;
  }
});
