/**
 * 按 OE 查本店 SKU（供 EPC 零件抽屉读取，不依赖极联）。
 */
import { oeKeyOf } from "./part-aliases.mjs";

const clean = (value) => String(value ?? "").trim();

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
