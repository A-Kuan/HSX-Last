import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { api } from "../api.js";

const money = (value) => Number(value || 0) > 0 ? `¥${Number(value).toFixed(2)}` : "面议";

export default function BrandCatalogPage() {
  const [brands, setBrands] = useState([]);
  const [brandQuery, setBrandQuery] = useState("");
  const [activeBrand, setActiveBrand] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/brand-catalog/brands")
      .then((payload) => {
        const items = payload.items || [];
        setBrands(items);
        const first = items.find((item) => item.count > 0) || items.find((item) => item.enabled) || items[0];
        if (first) setActiveBrand(first.name);
      })
      .catch((loadError) => setError(loadError.message));
  }, []);

  useEffect(() => {
    if (!activeBrand) return undefined;
    let cancelled = false;
    setLoading(true);
    setError("");
    api(`/brand-catalog/items?brand=${encodeURIComponent(activeBrand)}&q=${encodeURIComponent(q.trim())}&page=1&size=100`)
      .then((payload) => { if (!cancelled) setData(payload); })
      .catch((loadError) => { if (!cancelled) setError(loadError.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeBrand, q]);

  const visibleBrands = useMemo(() => {
    const keyword = brandQuery.trim().toLowerCase();
    if (!keyword) return brands;
    return brands.filter((brand) => brand.name.toLowerCase().includes(keyword) || (brand.alias || "").toLowerCase().includes(keyword));
  }, [brands, brandQuery]);

  return <main className="workspace">
    <div className="page-title-row"><div><h1>品牌件</h1></div></div>
    <div className="brand-catalog">
      <aside className="brand-catalog-side">
        <label className="local-search"><MagnifyingGlass />
          <input aria-label="搜索品牌" placeholder="搜索品牌" value={brandQuery} onChange={(event) => setBrandQuery(event.target.value)} />
        </label>
        <div className="brand-catalog-list">
          {visibleBrands.map((brand) => <button
            key={brand.name}
            type="button"
            className={`brand-catalog-item${brand.name === activeBrand ? " is-active" : ""}`}
            onClick={() => setActiveBrand(brand.name)}
          >
            <span>{brand.name}</span>
            <em>{brand.count}</em>
          </button>)}
        </div>
      </aside>
      <section className="brand-catalog-main">
        <div className="filter-row">
          <label className="local-search"><MagnifyingGlass />
            <input aria-label="搜索品牌件" placeholder="搜索品牌件号 / OE / 名称" value={q} onChange={(event) => setQ(event.target.value)} />
          </label>
        </div>
        {error ? <p className="dict-error">{error}</p> : null}
        <div className="brand-part-table-wrap">
          <table className="brand-part-table">
            <thead><tr><th>品牌件号</th><th>OE 号</th><th>名称</th><th>品类</th><th>安装位置</th><th>价格</th><th>车型</th></tr></thead>
            <tbody>
              {data ? (data.items.length ? data.items.map((item) => <tr key={item.id}>
                <td className="brand-part-no">{item.partNo}</td>
                <td>{item.oe || "—"}</td>
                <td title={item.name}>{item.name}</td>
                <td>{item.category || "—"}</td>
                <td>{item.position || "—"}</td>
                <td className="brand-part-price">{money(item.price)}</td>
                <td className="brand-part-vehicles" title={item.vehicles.join("；")}>{item.vehicles.length ? item.vehicles[0] + (item.vehicles.length > 1 ? ` +${item.vehicles.length - 1}` : "") : "—"}</td>
              </tr>) : <tr><td colSpan={7} className="brand-part-empty">{q.trim() ? "没有匹配项" : "暂无品牌件"}</td></tr>) : null}
            </tbody>
          </table>
          {loading ? <p className="field-note">加载中…</p> : null}
        </div>
      </section>
    </div>
  </main>;
}
