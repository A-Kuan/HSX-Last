const FALLBACK_PREFIX = "G";

const normalizePrefix = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);

/**
 * 商品组参考编码的默认值：品类前缀 + 4 位流水号（如 LX-0001）。
 * 品类没配前缀时退回 G。只是默认值，用户仍可改成供应商目录里的编码。
 */
export function nextGroupReference(groups = [], categories = [], categoryName = "") {
  const category = categories.find((item) => item.name === categoryName);
  const prefix = normalizePrefix(category?.prefix) || FALLBACK_PREFIX;
  const sequence = new RegExp(`^${prefix}-(\\d+)$`);
  const used = new Set(groups.map((group) => String(group.reference || "").toUpperCase()));
  let highest = 0;
  for (const reference of used) {
    const match = sequence.exec(reference);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  let next = highest + 1;
  let candidate = `${prefix}-${String(next).padStart(4, "0")}`;
  while (used.has(candidate)) {
    next += 1;
    candidate = `${prefix}-${String(next).padStart(4, "0")}`;
  }
  return candidate;
}
