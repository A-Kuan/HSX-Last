import { normalizeOe } from "./db.mjs";

/** OE 归一化键：与 SKU 的 OE 去重口径一致（忽略大小写、空格、连字符）。 */
export const oeKeyOf = (oe) => normalizeOe(oe);

/** 别名归一化键：全角转半角、小写、去空白与常见标点。 */
export const aliasKeyOf = (alias) => String(alias || "")
  .normalize("NFKC")
  .toLowerCase()
  .replace(/[\s\-_.,，。、;；:：!！?？'"“”‘’()（）[\]【】]/g, "");

const now = () => new Date().toISOString();

export function listPartAliases(db, { q = "", oe = "", limit = 300 } = {}) {
  const keyword = String(q || "").trim();
  const oeValue = String(oe || "").trim();
  const where = [];
  const params = [];
  if (oeValue) {
    where.push("oe_key = ?");
    params.push(oeKeyOf(oeValue));
  }
  if (keyword) {
    const key = aliasKeyOf(keyword);
    where.push("(alias LIKE ? OR alias_key LIKE ? OR oe LIKE ? OR official_name LIKE ?)");
    params.push(`%${keyword}%`, `%${key}%`, `%${keyword}%`, `%${keyword}%`);
  }
  const sql = `SELECT id, oe, oe_key, official_name, alias, alias_key, source, mid, figure, position, hits, created_at, updated_at
    FROM part_aliases ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY hits DESC, updated_at DESC LIMIT ?`;
  return db.prepare(sql).all(...params, limit).map((row) => ({
    id: row.id,
    oe: row.oe,
    oeKey: row.oe_key,
    officialName: row.official_name,
    alias: row.alias,
    source: row.source,
    mid: row.mid,
    figure: row.figure,
    position: row.position,
    hits: row.hits,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function upsertPartAlias(db, payload = {}) {
  const oe = String(payload.oe || "").trim();
  const alias = String(payload.alias || "").trim();
  if (!oe) {
    const error = new Error("需要 OE 号");
    error.status = 422;
    throw error;
  }
  if (!alias) {
    const error = new Error("需要别名");
    error.status = 422;
    throw error;
  }
  const oeKey = oeKeyOf(oe);
  const aliasKey = aliasKeyOf(alias);
  if (!aliasKey) {
    const error = new Error("别名不能只有符号");
    error.status = 422;
    throw error;
  }
  const officialName = String(payload.officialName || "").trim();
  const timestamp = now();
  db.prepare(`INSERT INTO part_aliases (oe_key, oe, official_name, alias, alias_key, source, mid, figure, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(oe_key, alias_key) DO UPDATE SET
      official_name = CASE WHEN excluded.official_name <> '' THEN excluded.official_name ELSE part_aliases.official_name END,
      mid = CASE WHEN excluded.mid <> '' THEN excluded.mid ELSE part_aliases.mid END,
      figure = CASE WHEN excluded.figure <> '' THEN excluded.figure ELSE part_aliases.figure END,
      position = CASE WHEN excluded.position <> '' THEN excluded.position ELSE part_aliases.position END,
      updated_at = excluded.updated_at
  `).run(
    oeKey,
    oe,
    officialName,
    alias,
    aliasKey,
    String(payload.source || "manual"),
    String(payload.mid || ""),
    String(payload.figure || ""),
    String(payload.position || ""),
    timestamp,
    timestamp,
  );
  const row = db.prepare("SELECT * FROM part_aliases WHERE oe_key = ? AND alias_key = ?").get(oeKey, aliasKey);
  return {
    id: row.id,
    oe: row.oe,
    oeKey: row.oe_key,
    officialName: row.official_name,
    alias: row.alias,
    source: row.source,
    mid: row.mid,
    figure: row.figure,
    position: row.position,
    hits: row.hits,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function deletePartAlias(db, id) {
  const result = db.prepare("DELETE FROM part_aliases WHERE id = ?").run(Number(id));
  return result.changes > 0;
}

/** 一次查出多个 OE 的别名，返回 Map<oeKey, {id, alias, source}[]>。 */
export function aliasesForOes(db, oes = []) {
  const keys = [...new Set(oes.map(oeKeyOf).filter(Boolean))];
  const map = new Map();
  if (!keys.length) return map;
  const placeholders = keys.map(() => "?").join(",");
  const rows = db.prepare(`SELECT id, oe_key, alias, source FROM part_aliases WHERE oe_key IN (${placeholders}) ORDER BY id`).all(...keys);
  for (const row of rows) {
    if (!map.has(row.oe_key)) map.set(row.oe_key, []);
    map.get(row.oe_key).push({ id: row.id, alias: row.alias, source: row.source });
  }
  return map;
}

/** 搜索命中的别名直接加一次使用计数，用于排序。 */
export function bumpAliasHits(db, ids = []) {
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`UPDATE part_aliases SET hits = hits + 1 WHERE id IN (${placeholders})`).run(...ids);
}

