import { loadCatalog, loadParts, loadSubgroups } from "./epc-catalog.mjs";
import { aliasKeyOf, bumpAliasHits, listPartAliases, oeKeyOf } from "./part-aliases.mjs";

const vinKeyOf = (vin) => String(vin || "").toUpperCase();
const builds = new Map();
const figureOf = (mid) => (/^\d{6}$/.test(String(mid || "")) ? `${String(mid).slice(0, 3)}-${String(mid).slice(3)}` : String(mid || ""));

export function epcIndexStatus(db, vin) {
  const key = vinKeyOf(vin);
  const row = db.prepare("SELECT parts, built_at FROM epc_search_index WHERE vin_key = ?").get(key);
  if (row) return { ready: true, parts: row.parts, builtAt: row.built_at };
  const build = builds.get(key);
  return { ready: false, progress: build?.progress || 0, total: build?.total || 0, error: build?.error || "" };
}

/** 首次搜索时后台建索引（逐图抓 parts），建好后写库，之后搜索不再请求极联。 */
export function ensureEpcIndex(db, vin) {
  const key = vinKeyOf(vin);
  const ready = db.prepare("SELECT vin_key FROM epc_search_index WHERE vin_key = ?").get(key);
  if (ready) return;
  if (builds.has(key)) return;
  const state = { progress: 0, total: 0, error: "" };
  builds.set(key, state);
  buildIndex(db, vin, state).catch((error) => { state.error = error.message; });
}

async function buildIndex(db, vin, state) {
  const key = vinKeyOf(vin);
  const catalog = await loadCatalog(vin);
  const tasks = [];
  for (const group of catalog.groups) {
    const subgroups = await loadSubgroups(vin, group.num);
    for (const sub of subgroups) tasks.push({ groupNum: String(group.num), mid: sub.mid, figure: sub.figure });
  }
  state.total = tasks.length;
  db.prepare("DELETE FROM epc_part_index WHERE vin_key = ?").run(key);
  const insert = db.prepare(`INSERT INTO epc_part_index (vin_key, group_num, mid, figure, position, oe_key, oe, name, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const now = new Date().toISOString();
  let inserted = 0;
  const queue = tasks.slice();
  const workers = Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const task = queue.shift();
      try {
        const payload = await loadParts(vin, task.groupNum, task.mid, { applicableOnly: true });
        for (const part of payload.parts) {
          if (!part.oe) continue;
          insert.run(key, task.groupNum, task.mid, task.figure, part.position, oeKeyOf(part.oe), part.oe, part.name, now);
          inserted += 1;
        }
      } catch { /* 单张图失败不影响整体索引 */ }
      state.progress += 1;
    }
  });
  await Promise.all(workers);
  db.prepare("INSERT OR REPLACE INTO epc_search_index (vin_key, parts, built_at) VALUES (?, ?, ?)").run(key, inserted, now);
  state.parts = inserted;
}

export function clearEpcIndex(db, vin) {
  const key = vinKeyOf(vin);
  db.prepare("DELETE FROM epc_part_index WHERE vin_key = ?").run(key);
  db.prepare("DELETE FROM epc_search_index WHERE vin_key = ?").run(key);
  builds.delete(key);
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
