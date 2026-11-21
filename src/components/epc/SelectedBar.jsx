import { ArrowRight, CaretDown, Copy, ListBullets, Package, Trash, X } from "@phosphor-icons/react";

export default function SelectedBar({ items, submitting, collapsed, onToggle, onQty, onRemove, onClear, onCopyList, onInquiry }) {
  return <section className={`epc-selected${collapsed ? " is-collapsed" : ""}`}>
    <header>
      <button type="button" className="epc-selected-toggle" aria-expanded={!collapsed} onClick={onToggle}>
        <ListBullets /><span>本次选件清单</span><em>{items.length} 个零件</em>
        <CaretDown className={`epc-selected-caret${collapsed ? "" : " is-open"}`} />
      </button>
      {collapsed ? null : <div className="epc-selected-actions">
        <button type="button" className="epc-ghost-btn" onClick={onClear} disabled={!items.length}><Trash />清空</button>
        <button type="button" className="epc-ghost-btn" onClick={onCopyList} disabled={!items.length}><Copy />复制清单</button>
        <button type="button" className="epc-primary-btn" onClick={onInquiry} disabled={!items.length || submitting}>{submitting ? "处理中..." : "加入询价清单"}<ArrowRight /></button>
      </div>}
    </header>
    {collapsed ? null : <div className="epc-selected-list">
      {items.length ? items.map((item) => <div className="epc-selected-item" key={item.key}>
        <span className="epc-selected-thumb" aria-hidden="true"><Package /></span>
        <div className="epc-selected-main">
          <strong>{item.oe}</strong>
          <span>{item.name}<em>×{item.qty}</em></span>
        </div>
        <div className="epc-qty" role="group" aria-label="数量">
          <button type="button" aria-label="减少数量" onClick={() => onQty(item.key, item.qty - 1)}>−</button>
          <span>{item.qty}</span>
          <button type="button" aria-label="增加数量" onClick={() => onQty(item.key, item.qty + 1)}>+</button>
        </div>
        <button type="button" className="epc-item-remove" aria-label="移除" onClick={() => onRemove(item.key)}><X /></button>
      </div>) : <p className="field-note">还没有选择零件</p>}
    </div>}
  </section>;
}
