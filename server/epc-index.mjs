import { loadCatalog, loadParts, loadSubgroups } from "./epc-catalog.mjs";
import { aliasKeyOf, bumpAliasHits, listPartAliases, oeKeyOf } from "./part-aliases.mjs";

const vinKeyOf = (vin) => String(vin || "").toUpperCase();
const builds = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const figureOf = (mid) => (/^\d{6}$/.test(String(mid || "")) ? `${String(mid).slice(0, 3)}-${String(mid).slice(3)}` : String(mid || ""));

export function epcIndexStatus(db, vin) {
  const key = vinKeyOf(vin);
  const row = db.prepare("SELECT parts, diagrams, failed, built_at FROM epc_search_index WHERE vin_key = ?").get(key);
  if (row) return { ready: true, parts: row.parts, diagrams: row.diagrams, failed: row.failed, builtAt: row.built_at };
  const build = builds.get(key);
  return { ready: false, building: Boolean(build), progress: build?.progress || 0, total: build?.total || 0, error: build?.error || "" };
}

/** 首次搜索时后台建索引（逐图抓 parts），建好后写库，之后搜索不再请求极联。 */
export function ensureEpcIndex(db, vin) {
  const key = vinKeyOf(vin);
  const meta = db.prepare("SELECT vin_key FROM epc_search_index WHERE vin_key = ?").get(key);
  if (meta) return;
  if (builds.has(key)) return;
  const state = { progress: 0, total: 0, error: "" };
  builds.set(key, state);
  buildIndex(db, vin, state).catch((error) => { state.error = error.message; builds.delete(key); });
}

async function buildIndex(db, vin, state) {
  const key = vinKeyOf(vin);
  const retry = async (fn, attempts = 4) => {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const throttled = /频繁|上限/.test(String(error.message || ""));
        await sleep(throttled ? 6000 * attempt : 500 * attempt);
      }
    }
    throw lastError;
  };
  const catalog = await retry(() => loadCatalog(vin));
  const tasks = [];
  for (const group of catalog.groups) {
    const subgroups = await retry(() => loadSubgroups(vin, group.num));
    for (const sub of subgroups) tasks.push({ groupNum: String(group.num), mid: sub.mid, figure: sub.figure });
  }
  state.total = tasks.length;
  db.prepare("DELETE FROM epc_part_index WHERE vin_key = ?").run(key);
  const insert = db.prepare(`INSERT INTO epc_part_index (vin_key, group_num, mid, figure, position, oe_key, oe, name, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const now = new Date().toISOString();
  let inserted = 0;
  let failed = 0;
  const queue = tasks.slice();
  const fetchParts = async (task) => {
    let lastError = null;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        return await loadParts(vin, task.groupNum, task.mid, { applicableOnly: true });
      } catch (error) {
        lastError = error;
        const throttled = /频繁|上限/.test(String(error.message || ""));
        await sleep(throttled ? 6000 * attempt : 500 * attempt);
      }
    }
    throw lastError;
  };
  // 串行 + 固定间隔：极联目录接口有频率上限（并发会直接 429）
  while (queue.length) {
    const task = queue.shift();
    try {
      const payload = await fetchParts(task);
      for (const part of payload.parts) {
        if (!part.oe) continue;
        insert.run(key, task.groupNum, task.mid, task.figure, part.position, oeKeyOf(part.oe), part.oe, part.name, now);
        inserted += 1;
      }
    } catch (error) {
      failed += 1;
      console.warn("epc index: 图号 " + task.mid + " 抓取失败：" + error.message);
    }
    state.progress += 1;
    await sleep(2500);
  }
  db.prepare("INSERT OR REPLACE INTO epc_search_index (vin_key, parts, diagrams, failed, built_at) VALUES (?, ?, ?, ?, ?)").run(key, inserted, tasks.length, failed, now);
  state.parts = inserted;
  state.failed = failed;
}

export function clearEpcIndex(db, vin) {
  const key = vinKeyOf(vin);
  db.prepare("DELETE FROM epc_part_index WHERE vin_key = ?").run(key);
  db.prepare("DELETE FROM epc_search_index WHERE vin_key = ?").run(key);
  builds.delete(key);
}

/** 手动重建索引：清空后在后台构建，接口立即返回，前端轮询进度。 */
export function startEpcIndexRebuild(db, vin) {
  const key = vinKeyOf(vin);
  clearEpcIndex(db, vin);
  const state = { progress: 0, total: 0, error: "" };
  builds.set(key, state);
  buildIndex(db, vin, state)
    .catch((error) => { state.error = error.message; })
    .finally(() => { builds.delete(key); });
  return { started: true };
}

/** 在已建好的索引上按 OE / 官方名称 / 别名搜索。 */
export function searchEpcParts(db, vin, query) {
  const key = vinKeyOf(vin);
  const text = String(query || "").trim();
  if (!text) return { results: [], total: 0 };
  const aliasKey = aliasKeyOf(text);
  const oeNeedle = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const rows = new Map();
  const add = (row, extra = {}) => {
    const id = `${row.mid}|${row.position}|${row.oe_key}`;
    const existing = rows.get(id);
    if (existing) {
      if (extra.alias && !existing.aliases.includes(extra.alias)) existing.aliases.push(extra.alias);
      if (extra.kind === "alias") existing.kind = "alias";
      return;
    }
    rows.set(id, {
      mid: row.mid,
      groupNum: String(row.group_num || String(row.mid).slice(0, 1)),
      figure: row.figure || figureOf(row.mid),
      position: row.position,
      oe: row.oe,
      oeKey: row.oe_key,
      name: row.name,
      aliases: extra.alias ? [extra.alias] : [],
      kind: extra.kind || "oe",
    });
  };

  if (oeNeedle) {
    const oeRows = db.prepare("SELECT * FROM epc_part_index WHERE vin_key = ? AND oe_key LIKE ? ORDER BY mid, position LIMIT 60").all(key, `%${oeNeedle}%`);
    for (const row of oeRows) add(row, { kind: "oe" });
  }
  const nameRows = db.prepare("SELECT * FROM epc_part_index WHERE vin_key = ? AND name LIKE ? LIMIT 60").all(key, `%${text}%`);
  for (const row of nameRows) add(row, { kind: "name" });

  const aliasIds = [];
  for (const alias of listPartAliases(db, { q: text, limit: 80 })) {
    if (!aliasKey || !aliasKeyOf(alias.alias).includes(aliasKey)) continue;
    aliasIds.push(alias.id);
    const aliasRows = db.prepare("SELECT * FROM epc_part_index WHERE vin_key = ? AND oe_key = ? LIMIT 20").all(key, alias.oeKey);
    if (aliasRows.length) {
      for (const row of aliasRows) add(row, { kind: "alias", alias: alias.alias });
    } else if (alias.mid) {
      add({
        mid: alias.mid,
        group_num: alias.mid.slice(0, 1),
        figure: alias.figure || figureOf(alias.mid),
        position: alias.position || "",
        oe: alias.oe,
        oe_key: alias.oeKey,
        name: alias.officialName || alias.alias,
      }, { kind: "alias", alias: alias.alias });
    }
  }
  if (aliasIds.length) bumpAliasHits(db, [...new Set(aliasIds)]);

  const results = [...rows.values()].sort((a, b) => (a.kind === "alias" ? 0 : a.kind === "oe" ? 1 : 2) - (b.kind === "alias" ? 0 : b.kind === "oe" ? 1 : 2));
  return { results: results.slice(0, 40), total: results.length };
}

export { figureOf };
