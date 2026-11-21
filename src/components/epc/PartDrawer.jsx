import { useEffect, useState } from "react";
import { Copy, Package, Plus, X } from "@phosphor-icons/react";
import { api } from "../../api.js";

export default function PartDrawer({ part, vin, vehicleName, inList, onClose, onAdd, onCopyOe, onAddAlias, onRemoveAlias }) {
  const [aliasDraft, setAliasDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [extras, setExtras] = useState(null);
  const [extrasError, setExtrasError] = useState("");
  const oe = part?.oe || "";

  useEffect(() => {
    setExtras(null);
    setExtrasError("");
    if (!vin || !oe) return undefined;
    let cancelled = false;
    api(`/epc/part-extras?vin=${encodeURIComponent(vin)}&oe=${encodeURIComponent(oe)}`)
      .then((data) => { if (!cancelled) setExtras(data); })
      .catch((error) => { if (!cancelled) setExtrasError(error.message); });
    return () => { cancelled = true; };
  }, [vin, oe]);

  if (!part) return null;
  const aliases = part.aliases || [];

  const submitAlias = async (event) => {
    event.preventDefault();
    const value = aliasDraft.trim();
    if (!value || saving) return;
    setSaving(true);
    try {
      await onAddAlias?.(value);
      setAliasDraft("");
    } finally {
      setSaving(false);
    }
  };

  const replaceChain = [...(extras?.replace?.chain || [])].reverse();
  const replaceAlternatives = extras?.replace?.alternatives || [];
  const articles = extras?.articles || [];
  const places = extras?.place || [];

  return <aside className="epc-drawer" role="dialog" aria-modal="true" aria-label="零件详情">
    <header>
      <div className="epc-card-title"><Package /><span>零件详情</span></div>
      <button type="button" className="epc-icon-btn" aria-label="关闭" onClick={onClose}><X /></button>
    </header>
    <div className="epc-drawer-body">
      <h2 className="epc-drawer-oe">{part.oe}</h2>
      <p className="epc-drawer-name">{part.name}</p>
      <section className="epc-part-alias">
        <h3>零件别名</h3>
        {aliases.length ? <div className="epc-alias-chips">{aliases.map((item) => <span key={item.id} className="epc-alias-chip">
          {item.alias}
          <button type="button" aria-label={`删除别名 ${item.alias}`} onClick={() => onRemoveAlias?.(item.id)}><X /></button>
        </span>)}</div> : null}
        <form className="epc-alias-form" onSubmit={submitAlias}>
          <input aria-label="添加别名" placeholder="添加别名，如 机油格座" value={aliasDraft} onChange={(event) => setAliasDraft(event.target.value)} maxLength={40} />
          <button type="submit" className="epc-ghost-btn" disabled={!aliasDraft.trim() || saving}><Plus />{saving ? "保存中" : "添加"}</button>
        </form>
      </section>

      <section className="epc-part-block">
        <h3>替换件</h3>
        {extrasError ? <p className="field-note">{extrasError}</p> : !extras ? <p className="field-note">加载中…</p> : replaceChain.length ? <div className="epc-replace-timeline">
          {replaceChain.map((node, index) => <div className="epc-replace-step" key={node.oe}>
            <span className="epc-replace-index">{index + 1}</span>
            <div className="epc-replace-main">
              <strong>{node.oe}</strong>
              <em>{[node.label, node.price ? `¥${node.price}` : ""].filter(Boolean).join(" · ")}</em>
            </div>
            {index === 0 ? <span className="epc-replace-tag is-latest">最新</span> : index === replaceChain.length - 1 ? <span className="epc-replace-tag">起始</span> : null}
          </div>)}
          {replaceAlternatives.length ? <div className="epc-replace-alt">
            <span>通用替代</span>
            {replaceAlternatives.map((item) => <div key={item.oe}>
              <strong>{item.oe}</strong>
              <em>{[item.label, item.price ? `¥${item.price}` : ""].filter(Boolean).join(" · ")}</em>
            </div>)}
          </div> : null}
        </div> : <p className="field-note">暂无替换件</p>}
      </section>

      <section className="epc-part-block">
        <h3>品牌件</h3>
        {!extras ? <p className="field-note">加载中…</p> : articles.length ? <div className="epc-article-list">{articles.map((article) => <div className="epc-article-row" key={`${article.supplier}-${article.articleNumber}`}>
          <div className="epc-article-main"><strong>{article.articleNumber}</strong><span>{[article.supplierCn || article.supplier, article.label].filter(Boolean).join(" · ")}</span></div>
          {article.image ? <img src={article.image} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} /> : null}
        </div>)}</div> : <p className="field-note">暂无品牌件</p>}
      </section>

      <section className="epc-part-block">
        <h3>渠道价格</h3>
        {!extras ? <p className="field-note">加载中…</p> : places.length ? <div className="epc-price-list">{places.map((place) => <div className="epc-price-row" key={`${place.supplier}-${place.name}`}>
          <span>{[place.name || place.supplier, place.partType].filter(Boolean).join(" · ")}</span>
          <strong>{place.salePrice ? `¥${place.salePrice}` : "—"}</strong>
          <em>{place.available ? "可售" : "不可售"}</em>
        </div>)}</div> : <p className="field-note">暂无渠道价格</p>}
      </section>
    </div>
    <footer>
      <button type="button" className="epc-ghost-btn" onClick={() => onCopyOe(part.oe)}><Copy />复制 OE 号</button>
      <button type="button" className="epc-primary-btn" onClick={() => onAdd(part)} disabled={inList}>{inList ? "已在清单中" : "加入选件清单"}</button>
    </footer>
  </aside>;
}
