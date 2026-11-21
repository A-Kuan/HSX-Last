import { useEffect, useState } from "react";
import { Copy, ImageSquare, Package, PencilSimple, Plus, X } from "@phosphor-icons/react";
import { API_BASE, api } from "../../api.js";

const displayNameOf = (name) => String(name || "")
  .replace(/已包括/g, "· 含")
  .replace(/· 含\s+/g, "· 含")
  .replace(/配合使用[:：]?/g, "· ")
  .replace(/\s+/g, " ")
  .trim();

export default function PartDrawer({ part, vin, vehicleName, inList, onClose, onAdd, onCopyOe, onAddAlias, onRemoveAlias }) {
  const [aliasOpen, setAliasOpen] = useState(false);
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
  const products = extras?.products || [];

  const badgeOf = (node, index) => {
    if (node.oe === part.oe) return { text: "当前", className: "is-current" };
    if (index === 0) return { text: "最新", className: "is-latest" };
    if (index === replaceChain.length - 1) return { text: "起始", className: "" };
    return null;
  };

  return <aside className="epc-drawer epc-drawer--wide" role="dialog" aria-modal="true" aria-label="零件详情">
    <header>
      <div className="epc-card-title"><Package /><span>零件详情</span></div>
      <button type="button" className="epc-icon-btn" aria-label="关闭" onClick={onClose}><X /></button>
    </header>
    <div className="epc-drawer-body">
      <div className="epc-drawer-heading">
        <h2 className="epc-drawer-oe">{part.oe}</h2>
        <span className="epc-drawer-heading-sep" aria-hidden="true" />
        <p className="epc-drawer-name">{displayNameOf(part.name) || "—"}</p>
        <button type="button" className={`epc-edit-alias${aliasOpen ? " is-open" : ""}`} onClick={() => setAliasOpen((value) => !value)}>
          <PencilSimple />编辑别名
        </button>
      </div>

      {aliasOpen ? <div className="epc-alias-editor">
        {aliases.length ? <div className="epc-alias-chips">{aliases.map((item) => <span key={item.id} className="epc-alias-chip">
          {item.alias}
          <button type="button" aria-label={`删除别名 ${item.alias}`} onClick={() => onRemoveAlias?.(item.id)}><X /></button>
        </span>)}</div> : null}
        <form className="epc-alias-form" onSubmit={submitAlias}>
          <input aria-label="添加别名" placeholder="添加别名，如 机油格座" value={aliasDraft} onChange={(event) => setAliasDraft(event.target.value)} maxLength={40} />
          <button type="submit" className="epc-ghost-btn" disabled={!aliasDraft.trim() || saving}><Plus />{saving ? "保存中" : "添加"}</button>
        </form>
      </div> : null}

      <div className="epc-drawer-grid">
        <div className="epc-drawer-col">
          <section className="epc-part-section">
            <h3>替换件</h3>
            {!extras ? <p className="field-note">加载中…</p> : extrasError ? <p className="field-note">{extrasError}</p> : replaceChain.length ? <div className="epc-replace-timeline">
              {replaceChain.map((node, index) => {
                const badge = badgeOf(node, index);
                return <div className="epc-replace-step" key={node.oe}>
                  <span className="epc-replace-index">{index + 1}</span>
                  <div className="epc-replace-main">
                    <strong>{node.oe}</strong>
                    <em>{[node.label, node.price ? `¥${node.price}` : ""].filter(Boolean).join(" · ")}</em>
                  </div>
                  {badge ? <span className={`epc-replace-tag ${badge.className}`}>{badge.text}</span> : null}
                </div>;
              })}
            </div> : <p className="field-note">暂无替换件</p>}
          </section>

          {replaceAlternatives.length ? <section className="epc-part-section">
            <h3>通用替代</h3>
            <div className="epc-replace-alt">
              {replaceAlternatives.map((item) => <div key={item.oe}>
                <strong>{item.oe}</strong>
                <em>{[item.label, item.price ? `¥${item.price}` : ""].filter(Boolean).join(" · ")}</em>
              </div>)}
            </div>
          </section> : null}

          {products.length ? <section className="epc-part-section">
            <h3>本店商品</h3>
            <div className="epc-sku-list">
              {products.map((item) => <a
                className="epc-sku-row"
                key={item.id}
                href={`${API_BASE}/skus/${encodeURIComponent(item.id)}/image`}
                target="_blank"
                rel="noreferrer"
              >
                {item.hasImage
                  ? <img src={`${API_BASE}/skus/${encodeURIComponent(item.id)}/image`} alt="" loading="lazy" />
                  : <span className="epc-sku-noimg"><ImageSquare /></span>}
                <span className="epc-sku-main"><strong>{item.partNo || item.name}</strong><em>{[item.brand, item.name].filter(Boolean).join(" · ")}</em></span>
                <b>{item.price > 0 ? `¥${item.price.toFixed(2)}` : "面议"}</b>
              </a>)}
            </div>
          </section> : null}
        </div>

        <div className="epc-drawer-sep" aria-hidden="true" />

        <div className="epc-drawer-col">
          <section className="epc-part-section">
            <h3>品牌件</h3>
            {!extras ? <p className="field-note">加载中…</p> : articles.length ? <div className="epc-brand-table">
              <div className="epc-brand-table-head"><span>零件号</span><span>品牌</span></div>
              {articles.map((article) => <div className="epc-brand-table-row" key={`${article.supplier}-${article.articleNumber}`}>
                <strong>{article.articleNumber}</strong>
                <span>{[article.supplierCn ? `${article.supplierCn}` : article.supplier, article.label].filter(Boolean).join(" · ")}</span>
              </div>)}
            </div> : <p className="field-note">暂无品牌件</p>}
          </section>
        </div>
      </div>
    </div>

    <footer>
      <button type="button" className="epc-ghost-btn" onClick={() => onCopyOe(part.oe)}><Copy />复制 OE 号</button>
      <button type="button" className="epc-primary-btn" onClick={() => onAdd(part)} disabled={inList}>{inList ? "已在清单中" : "加入选件清单"}</button>
    </footer>
  </aside>;
}
