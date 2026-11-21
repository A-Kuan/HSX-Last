/**
 * 品牌件目录（只用本系统 SKU 数据，不依赖极联）。
 * 左侧品牌来自 brands 字典，右侧是该品牌下的 SKU：品牌件号、OE、名称、品类、价格、状态。
 */
import { oeKeyOf } from "./part-aliases.mjs";

const clean = (value) => String(value ?? "").trim();

export function listBrandCatalog(db) {
  return db.prepare(`
    SELECT b.name, b.alias, b.enabled, b.sort_order,
      (SELECT COUNT(*) FROM skus s WHERE s.brand = b.name AND s.status = 'enabled') AS sku_count
    FROM brands b
    ORDER BY b.sort_order, b.name COLLATE NOCASE
  `).all().map((row) => ({
    name: String(row.name || ""),
    alias: String(row.alias || ""),
    enabled: Number(row.enabled ?? 1) === 1,
    count: Number(row.sku_count || 0),
  }));
}

const FITMENT_SQL = `
  SELECT vp.group_id, v.brand, v.series, v.generation, v.platform, v.year_from, v.year_to
  FROM vehicle_products vp
  JOIN vehicles v ON v.id = vp.vehicle_id
  WHERE vp.group_id IN (SELECT value FROM json_each(?))
`;

function vehicleLabel(vehicle) {
  const name = [vehicle.brand, vehicle.series].filter(Boolean).join(" ");
  const extra = vehicle.generation || vehicle.platform || "";
  const years = vehicle.year_from ? `${vehicle.year_from}${vehicle.year_to ? `-${vehicle.year_to}` : ""}` : "";
  return [name, extra, years].filter(Boolean).join(" · ");
}

export function listBrandParts(db, { brand = "", q = "", page = 1, size = 20 } = {}) {
  const filters = ["s.status = 'enabled'"];
  const params = [];
  if (brand) {
    filters.push("s.brand = ?");
    params.push(brand);
  }
  const keyword = clean(q);
  if (keyword) {
    filters.push(`(
      s.part_no LIKE ? OR s.note LIKE ? OR s.oem_brand LIKE ?
      OR g.name LIKE ? OR g.category LIKE ?
      OR EXISTS (SELECT 1 FROM sku_oe_numbers o WHERE o.sku_id = s.id AND o.oe_no LIKE ?)
      OR EXISTS (SELECT 1 FROM group_oe_numbers o WHERE o.group_id = s.group_id AND o.oe_no LIKE ?)
    )`);
    const like = `%${keyword}%`;
    params.push(like, like, like, like, like, like, like);
  }
  const where = filters.join(" AND ");
  const total = Number(db.prepare(`SELECT COUNT(*) c FROM skus s JOIN product_groups g ON g.id = s.group_id WHERE ${where}`).get(...params).c || 0);
  const safeSize = Math.min(Math.max(Number(size) || 20, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const rows = db.prepare(`
    SELECT s.id, s.brand, s.part_no, s.price, s.status, s.image, s.note, s.oem_brand,
           g.id AS group_id, g.name AS group_name, g.category, g.position
    FROM skus s
    JOIN product_groups g ON g.id = s.group_id
    WHERE ${where}
    ORDER BY g.name COLLATE NOCASE, s.part_no COLLATE NOCASE
    LIMIT ? OFFSET ?
  `).all(...params, safeSize, (safePage - 1) * safeSize);
  const ids = [...new Set(rows.map((row) => row.group_id))];
  const fitments = new Map();
  if (ids.length) {
    for (const vehicle of db.prepare(FITMENT_SQL).all(JSON.stringify(ids))) {
      if (!fitments.has(vehicle.group_id)) fitments.set(vehicle.group_id, []);
      fitments.get(vehicle.group_id).push(vehicleLabel(vehicle));
    }
  }
  return {
    total,
    page: safePage,
    size: safeSize,
    items: rows.map((row) => ({
      id: String(row.id),
      brand: clean(row.brand),
      partNo: clean(row.part_no),
      oe: clean(db.prepare("SELECT oe_no FROM sku_oe_numbers WHERE sku_id = ? ORDER BY is_primary DESC, oe_no LIMIT 1").get(row.id)?.oe_no
        || db.prepare("SELECT oe_no FROM group_oe_numbers WHERE group_id = ? ORDER BY is_primary DESC, oe_no LIMIT 1").get(row.group_id)?.oe_no
        || ""),
      name: clean(row.group_name),
      category: clean(row.category),
      position: clean(row.position),
      price: Number(row.price || 0),
      note: clean(row.note),
      image: clean(row.image),
      hasImage: Boolean(row.image),
      vehicles: fitments.get(row.group_id) || [],
    })),
  };
}


/** 按 OE 找本店 SKU（用于 EPC 零件抽屉里展示实物图与售价）。 */
export function loadOeSkus(db, oe, limit = 6) {
  const key = oeKeyOf(oe);
  if (!key) return [];
  const rows = db.prepare(`
    SELECT DISTINCT s.id, s.brand, s.part_no, s.price, s.image, s.note, s.source_type, s.oem_brand, s.origin, s.channel, g.name, g.category
    FROM skus s
    JOIN product_groups g ON g.id = s.group_id
    WHERE s.status = 'enabled' AND (
      EXISTS (SELECT 1 FROM sku_oe_numbers o WHERE o.sku_id = s.id AND o.normalized_oe = ?)
      OR EXISTS (SELECT 1 FROM group_oe_numbers o WHERE o.group_id = s.group_id AND o.normalized_oe = ?)
    )
    ORDER BY s.price > 0 DESC, s.part_no
    LIMIT ?
  `).all(key, key, limit);
  return rows.map((row) => ({
    id: String(row.id),
    brand: clean(row.brand),
    partNo: clean(row.part_no),
    price: Number(row.price || 0),
    note: clean(row.note),
    name: clean(row.name),
    sourceType: clean(row.source_type),
    oemBrand: clean(row.oem_brand),
    origin: clean(row.origin),
    channel: clean(row.channel),
    category: clean(row.category),
    hasImage: Boolean(row.image),
  }));
}
