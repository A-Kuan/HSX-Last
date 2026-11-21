import { useState } from "react";
import { Copy, Package, Plus, X } from "@phosphor-icons/react";

export default function PartDrawer({ part, vehicleName, inList, onClose, onAdd, onCopyOe, onAddAlias, onRemoveAlias }) {
  const [aliasDraft, setAliasDraft] = useState("");
  const [saving, setSaving] = useState(false);
  if (!part) return null;
  const status = part.discontinued || part.applicable === false ? "discontinued" : "normal";
  const statusText = status === "discontinued" ? "已停用" : "正常";
  const replacements = part.replacements || [];
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

  return <aside className="epc-drawer" role="dialog" aria-modal="true" aria-label="零件详情">
    <header>
      <div className="epc-card-title"><Package /><span>零件详情</span></div>
      <button type="button" className="epc-icon-btn" aria-label="关闭" onClick={onClose}><X /></button>
    </header>
    <div className="epc-drawer-body">
      <div className="epc-part-photo"><Package /></div>
      <h2 className="epc-drawer-oe">{part.oe}</h2>
      <p className="epc-drawer-name">{part.name}</p>
      <span className={`epc-status is-${status}`}><i />{statusText}</span>
      <dl className="epc-detail-list">
        <div><dt>图号位置</dt><dd>{part.position || "—"}</dd></div>
        <div><dt>数量</dt><dd>{part.quantity || "—"}</dd></div>
        <div><dt>型号</dt><dd>{part.model || "—"}</dd></div>
        <div><dt>参考价格</dt><dd>{part.price || "—"}</dd></div>
        <div><dt>适用车型</dt><dd>{vehicleName || "—"}</dd></div>
      </dl>
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
      <section className="epc-replacement">
        <div className="epc-replacement-head">
          <h3>替代关系</h3>
          <span className={`epc-status is-${status}`}><i />{status === "discontinued" ? "已停用" : "正常"}</span>
        </div>
        {replacements.length ? <>
          <div className="epc-replacement-row"><span>原 OE 号</span><strong>{part.oe}</strong></div>
          <div className="epc-replacement-arrow">↓</div>
          {replacements.map((item) => <div key={item} className="epc-replacement-row is-valid"><span>替代 OE 号</span><strong>{item}</strong><em>当前有效</em></div>)}
        </> : <p className="field-note">暂未获取到该零件的替代信息</p>}
      </section>
    </div>
    <footer>
      <button type="button" className="epc-ghost-btn" onClick={() => onCopyOe(part.oe)}><Copy />复制 OE 号</button>
      <button type="button" className="epc-primary-btn" onClick={() => onAdd(part)} disabled={inList}>{inList ? "已在清单中" : "加入选件清单"}</button>
    </footer>
  </aside>;
}
