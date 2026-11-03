import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell, CaretDown, CaretLeft, CaretRight, CaretUp, Check, CheckCircle,
  DotsThree, DownloadSimple, FunnelSimple, GearSix, List, MagnifyingGlass,
  MapPin, Minus, PencilSimple, Plus, Prohibit, Trash, X, ArrowClockwise,
} from "@phosphor-icons/react";

const ASSET_BASE = `${import.meta.env.BASE_URL}assets/`;

const initialGroups = [
  {
    id: "brake", name: "前制动片套装", reference: "DEMO-BP01", image: `${ASSET_BASE}brake-pads.png`,
    note: "前轴制动片，按品牌与材质区分", category: "制动片",
    skus: [
      { id: "DEMO-BP01-001", brand: "BOSCH", partNo: "0986-AB1234", oe: "04465-0E010", unit: "套", bin: "A-01-01", inventory: 24, reserved: 6, price: 368, fitment: "丰田 凯美瑞 2018–2022", position: "前轴", active: true },
      { id: "DEMO-BP01-002", brand: "ATE", partNo: "GDB1234", oe: "04465-33160", unit: "套", bin: "A-01-02", inventory: 18, reserved: 2, price: 285, fitment: "本田 雅阁 2018–2022", position: "前轴", active: true },
      { id: "DEMO-BP01-003", brand: "TRW", partNo: "FDB4321", oe: "04465-42160", unit: "套", bin: "A-01-03", inventory: 0, reserved: 0, price: 326, fitment: "大众 迈腾 2017–2021", position: "前轴", active: true },
    ],
  },
  {
    id: "filter", name: "机油滤清器", reference: "DEMO-OF01", image: `${ASSET_BASE}oil-filter.png`,
    note: "旋装式与纸芯式分别管理", category: "滤清器",
    skus: [
      { id: "DEMO-OF01-001", brand: "MANN", partNo: "W 712/90", oe: "90915-YZZJ1", unit: "个", bin: "B-02-01", inventory: 32, reserved: 4, price: 68, fitment: "丰田 卡罗拉 2019–2023", position: "发动机", active: true },
      { id: "DEMO-OF01-002", brand: "MAHLE", partNo: "OC 593/3", oe: "90915-YZZJ2", unit: "个", bin: "B-02-02", inventory: 15, reserved: 1, price: 72, fitment: "本田 思域 2020–2023", position: "发动机", active: true },
    ],
  },
  {
    id: "arm", name: "前下摆臂", reference: "DEMO-CA01", image: `${ASSET_BASE}control-arm.png`,
    note: "左/右安装位置分别管理", category: "底盘悬挂",
    skus: [
      { id: "DEMO-CA01-001", brand: "TRW", partNo: "JTC1234", oe: "3C0407151", unit: "个", bin: "C-03-01", inventory: 6, reserved: 1, price: 320, fitment: "大众 迈腾 2017–2021", position: "前轴左", active: true },
      { id: "DEMO-CA01-002", brand: "LEMFÖRDER", partNo: "RH-CA5678", oe: "3C0407152", unit: "个", bin: "C-03-02", inventory: 3, reserved: 0, price: 298, fitment: "大众 迈腾 2017–2021", position: "前轴右", active: true },
      { id: "DEMO-CA01-003", brand: "DELPHI", partNo: "TC2590", oe: "8K0407151", unit: "个", bin: "C-03-03", inventory: 0, reserved: 0, price: 310, fitment: "奥迪 A4L 2017–2020", position: "前轴左", active: false },
      { id: "DEMO-CA01-004", brand: "MOOG", partNo: "K620223", oe: "8K0407152", unit: "个", bin: "C-03-04", inventory: 5, reserved: 0, price: 288, fitment: "奥迪 A4L 2017–2020", position: "前轴右", active: true },
    ],
  },
];

const allColumnOptions = [
  ["brand", "品牌"], ["partNo", "品牌件号"], ["unit", "包装单位"], ["bin", "仓位"],
  ["inventory", "可售库存"], ["price", "售价"], ["status", "状态"], ["supplier", "供应商"], ["updatedAt", "更新时间"],
];

function Checkbox({ checked, indeterminate = false, onChange, label }) {
  return <button className={`checkbox ${checked || indeterminate ? "is-checked" : ""}`} type="button" role="checkbox" aria-checked={indeterminate ? "mixed" : checked} aria-label={label} onClick={(event) => { event.stopPropagation(); onChange?.(); }}>{indeterminate ? <Minus weight="bold" /> : checked ? <Check weight="bold" /> : null}</button>;
}

function IconButton({ children, label, onClick, active = false, disabled = false }) {
  return <button className={`icon-button ${active ? "is-active" : ""}`} aria-label={label} title={label} type="button" onClick={onClick} disabled={disabled}>{children}</button>;
}

function ProductImage({ src, alt, large = false }) {
  return <img className={`product-image ${large ? "is-large" : ""}`} src={src} alt={alt} />;
}

function AppHeader() {
  return <header className="app-header">
    <div className="brand-lockup"><strong>奥联</strong><span className="brand-divider" /><button className="plain-button" type="button">SKU商品库 <CaretDown /></button></div>
    <div className="global-search"><MagnifyingGlass /><input aria-label="全局搜索" placeholder="搜索SKU、OE号或配件名称" /></div>
    <div className="header-actions"><button className="plain-button location-button" type="button"><MapPin /> 济南总仓 <CaretDown /></button><IconButton label="通知"><Bell /></IconButton><img className="avatar" src={`${ASSET_BASE}avatar.png`} alt="张三头像" /><button className="plain-button user-button" type="button">张三 <CaretDown /></button></div>
  </header>;
}

function FilterBar({ search, setSearch, onCategory, category, onClearCategory, onSearchFocus, searchFocused, hasResults }) {
  return <div className="filter-area">
    <div className="filter-row">
      <div className={`local-search ${searchFocused ? "is-focused" : ""}`}><MagnifyingGlass /><input value={search} aria-label="筛选商品" placeholder="搜索SKU、OE号或配件名称" onChange={(event) => setSearch(event.target.value)} onFocus={() => onSearchFocus(true)} />{search && <button type="button" aria-label="清除搜索" onMouseDown={(event) => event.preventDefault()} onClick={() => setSearch("")}><X /></button>}{searchFocused && search && hasResults && <SearchSuggestions search={search} onPick={(value) => { setSearch(value); onSearchFocus(false); }} />}</div>
      <button className="filter-button" type="button">品牌：全部 <CaretDown /></button>
      <button className={`filter-button ${category ? "is-active" : ""}`} type="button" onClick={onCategory}>配件品类：{category || "全部"} <CaretDown /></button>
      <button className="filter-button" type="button">仓库：济南总仓 <CaretDown /></button>
      <button className="filter-button" type="button"><FunnelSimple /> 更多筛选 <CaretDown /></button>
    </div>
    {category && <div className="filter-chips"><span>品类：{category}<button type="button" onClick={onClearCategory}><X /></button></span><span>仓库：济南总仓<button type="button"><X /></button></span><button type="button" onClick={onClearCategory}>清空</button></div>}
  </div>;
}

function SearchSuggestions({ search, onPick }) {
  const matches = initialGroups[0].skus.filter((sku) => `${sku.id} ${sku.partNo} ${sku.oe}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="suggestion-popover"><h4>SKU编码匹配</h4>{(matches.length ? matches : initialGroups[0].skus).slice(0, 3).map((sku, index) => <button key={sku.id} className={index === 0 ? "is-current" : ""} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onPick(sku.id)}><ProductImage src={`${ASSET_BASE}brake-pads.png`} alt="前制动片" /><span><b>奥联　<mark>{sku.id}</mark></b><small>前制动片套装</small></span><em>SKU</em></button>)}<div className="suggestion-divider" /><h4>参考号匹配</h4><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => onPick("04465-0E010")}><ProductImage src={`${ASSET_BASE}brake-pads.png`} alt="前制动片" /><span><b>奥联　<mark>DEMO-BP01</mark></b><small>参考号：04465-0E010</small></span><em>SKU</em></button><footer><kbd>↑</kbd><kbd>↓</kbd> 选择　<kbd>Enter</kbd> 查看　<kbd>Esc</kbd> 关闭</footer></div>;
}

function CategoryPopover({ selected, setSelected, onApply, onReset }) {
  return <div className="category-popover"><div className="tree-row"><CaretDown /><Checkbox checked={selected === "制动片"} onChange={() => setSelected(selected === "制动片" ? "" : "制动片")} label="制动系统" /><strong>制动系统</strong></div><div className="tree-child"><Checkbox checked={selected === "制动片"} onChange={() => setSelected("制动片")} label="制动片" /><span>制动片</span></div><div className="tree-child"><Checkbox checked={false} label="制动盘" /><span>制动盘</span></div><div className="tree-row"><CaretRight /><Checkbox checked={selected === "滤清器"} onChange={() => setSelected("滤清器")} label="发动机系统" /><strong>发动机系统</strong></div><div className="tree-row"><CaretRight /><Checkbox checked={selected === "底盘悬挂"} onChange={() => setSelected("底盘悬挂")} label="底盘悬挂" /><strong>底盘悬挂</strong></div><footer><button className="secondary-button" type="button" onClick={onReset}>重置</button><button className="primary-button" type="button" onClick={onApply}>应用</button></footer></div>;
}

function SkeletonList() {
  return <div className="table-shell skeleton-shell"><div className="table-heading"><span className="skeleton sk-check" /><span className="skeleton sk-title" /></div>{[3, 2, 4].map((count, groupIndex) => <div className="skeleton-group" key={groupIndex}><div className="skeleton-group-row"><span className="skeleton sk-check" /><span className="skeleton sk-image" /><span><i className="skeleton sk-name" /><i className="skeleton sk-line" /></span><i className="skeleton sk-meta" /></div>{Array.from({ length: count }).map((_, index) => <div className="skeleton-item" key={index}><span className="skeleton sk-check" /><i className="skeleton sk-line" /><i className="skeleton sk-small" /><i className="skeleton sk-meta" /><DotsThree /></div>)}</div>)}<div className="loading-note"><span /> 正在加载商品...</div></div>;
}

function EmptyState({ onClear }) {
  return <div className="table-shell empty-shell"><div className="table-heading"><Checkbox label="全选" /><span>商品组</span></div><div className="empty-state"><MagnifyingGlass /><h3>未找到匹配的SKU</h3><p>试试其他编码，或清除筛选条件</p><div><button className="secondary-button" type="button" onClick={onClear}>清除筛选</button><button className="primary-button" type="button" onClick={onClear}>修改搜索</button></div><small>0 个匹配SKU</small></div></div>;
}

function InventoryPopover({ sku, onClose }) {
  const available = Math.max(sku.inventory - sku.reserved, 0);
  return <div className="inventory-popover" role="dialog" aria-label="多仓库存"><button className="popover-close" aria-label="关闭" onClick={onClose}><X /></button><h3>多仓库存</h3><div className="inventory-grid header"><span>仓库</span><span>在库</span><span>占用</span><span>可售</span></div><div className="inventory-grid"><span>济南总仓</span><span>{sku.inventory}</span><span>{sku.reserved}</span><span>{available}</span></div><div className="inventory-grid"><span>青岛分仓</span><span>12</span><span>2</span><span>10</span></div><footer><span>当前列表数量：济南总仓</span><button type="button">查看库存明细</button></footer></div>;
}

function ProductTable({ groups, expanded, setExpanded, selected, toggleSku, toggleGroup, inventorySku, setInventorySku, onDetail, onEdit }) {
  const allVisibleIds = groups.flatMap((group) => group.skus.map((sku) => sku.id));
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0 && !allSelected;
  return <div className="table-shell"><div className="table-heading"><Checkbox checked={allSelected} indeterminate={someSelected} onChange={() => allSelected ? toggleGroup(null, false, allVisibleIds) : toggleGroup(null, true, allVisibleIds)} label="全选当前结果" /><span>商品组</span></div>{groups.map((group) => {
    const isExpanded = expanded.has(group.id);
    const selectedCount = group.skus.filter((sku) => selected.has(sku.id)).length;
    const groupChecked = selectedCount === group.skus.length;
    const groupPartial = selectedCount > 0 && !groupChecked;
    const inStockCount = group.skus.filter((sku) => sku.inventory > 0).length;
    return <section className={`product-group ${isExpanded ? "is-expanded" : ""}`} key={group.id}><div className="group-row"><IconButton label={isExpanded ? "收起商品组" : "展开商品组"} onClick={() => setExpanded((current) => { const next = new Set(current); isExpanded ? next.delete(group.id) : next.add(group.id); return next; })}>{isExpanded ? <CaretDown /> : <CaretRight />}</IconButton><Checkbox checked={groupChecked} indeterminate={groupPartial} onChange={() => toggleGroup(group.id, !groupChecked, group.skus.map((sku) => sku.id))} label={`选择${group.name}`} /><ProductImage src={group.image} alt={group.name} /><div className="group-copy"><strong>{group.name}</strong><span>参考编码　{group.reference}　|　共 {group.skus.length} 个 SKU　|　<button type="button" onClick={() => onDetail(group.skus[0], group)}>查看适配条件</button></span></div><div className="group-summary">{inStockCount} 个 SKU 有货</div><IconButton label="更多操作" onClick={() => onEdit(group.skus[0], group)}><DotsThree /></IconButton></div>{isExpanded && <div className="sku-table"><div className="sku-header"><span /><span /><span>SKU / 配件名称</span><span>品牌 / 品牌件号</span><span>适配车型</span><span>仓位</span><span>可售库存</span><span>售价</span><span>状态</span><span /></div>{group.skus.map((sku, index) => <div className="sku-row" key={sku.id} onDoubleClick={() => onDetail(sku, group)}><span /><Checkbox checked={selected.has(sku.id)} onChange={() => toggleSku(sku.id)} label={`选择${sku.id}`} /><button className="sku-identity" type="button" onClick={() => onDetail(sku, group)}><ProductImage src={group.image} alt={group.name} /><span><strong>{sku.id}</strong><small>{group.name}（{index === 0 ? "陶瓷型" : index === 1 ? "半金属型" : "标准型"}）</small></span></button><span><b>{sku.brand}</b><small>{sku.partNo}</small></span><span><small className="column-label">适配车型</small>{sku.fitment}</span><span>{sku.bin}</span><span className="inventory-cell"><button type="button" onClick={() => setInventorySku(inventorySku?.id === sku.id ? null : { ...sku, group })}>{Math.max(sku.inventory - sku.reserved, 0)} {sku.unit}</button>{inventorySku?.id === sku.id && <InventoryPopover sku={sku} onClose={() => setInventorySku(null)} />}</span><span>¥{sku.price.toFixed(2)}</span><span className={`status ${sku.inventory > 0 ? "in-stock" : "out-stock"}`}><i />{sku.inventory > 0 ? "有货" : "缺货"}</span><IconButton label="编辑SKU" onClick={() => onEdit(sku, group)}><DotsThree /></IconButton></div>)}</div>}</section>;
  })}</div>;
}

function DetailDrawer({ selected, onClose, onEdit }) {
  const [tab, setTab] = useState("车型适配");
  const { sku, group } = selected;
  return <div className="overlay drawer-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="detail-drawer"><header><h2>商品详情</h2><IconButton label="关闭详情" onClick={onClose}><X /></IconButton></header><div className="detail-summary"><img src={`${ASSET_BASE}brake-detail.png`} alt={group.name} /><div><h2>{group.name}</h2><button className="secondary-button edit-button" type="button" onClick={onEdit}><PencilSimple /> 编辑</button><dl><dt>品牌</dt><dd>{sku.brand}</dd><dt>SKU</dt><dd>{sku.id}</dd><dt>OE 号</dt><dd>{sku.oe}</dd><dt>状态</dt><dd><span className="detail-status" />{sku.active ? "启用" : "停用"}</dd></dl></div></div><nav className="detail-tabs">{["基本资料", "车型适配", "库存仓位", "操作记录"].map((item) => <button className={tab === item ? "is-active" : ""} onClick={() => setTab(item)} type="button" key={item}>{item}</button>)}</nav>{tab === "车型适配" && <div className="fitment-panel"><div className="fitment-filters"><label><MagnifyingGlass /><input placeholder="搜索车系、年款或配置" /></label><button type="button">车系：全部 <CaretDown /></button><button type="button">核实状态：全部 <CaretDown /></button></div><div className="fitment-table"><div><b>车系</b><b>年款</b><b>适配位置</b><b>核实状态</b><b>资料来源</b><b>备注</b></div><div><span>丰田 凯美瑞</span><span>2018–2022</span><span>{sku.position}</span><span><em className="verified">已核实</em></span><span>供应商目录</span><span>-</span></div><div><span>本田 雅阁</span><span>2019–2022</span><span>{sku.position}</span><span><em>待核实</em></span><span>-</span><span>-</span></div></div><p>示例资料；适配需按具体配置核实。</p></div>}{tab === "基本资料" && <div className="detail-placeholder"><List /><h3>基础资料</h3><p>品牌件号 {sku.partNo}，包装单位 {sku.unit}，当前售价 ¥{sku.price.toFixed(2)}。</p></div>}{tab === "库存仓位" && <div className="detail-placeholder"><MapPin /><h3>济南总仓 · {sku.bin}</h3><p>在库 {sku.inventory}，占用 {sku.reserved}，可售 {Math.max(sku.inventory - sku.reserved, 0)}。</p></div>}{tab === "操作记录" && <div className="detail-placeholder"><ArrowClockwise /><h3>最近更新</h3><p>张三 · 2026-11-02 10:24 · 更新了商品资料。</p></div>}</aside></div>;
}

function EditDrawer({ selected, onClose, onSave }) {
  const isNew = !selected?.sku;
  const [form, setForm] = useState({ name: selected?.group?.name || "", brand: selected?.sku?.brand || "", partNo: selected?.sku?.partNo || "", unit: selected?.sku?.unit || "套", quantity: "", price: selected?.sku?.price || "", status: selected?.sku?.active === false ? "停用" : "启用", note: "" });
  const [touched, setTouched] = useState(false);
  const invalid = !form.name || !form.partNo || !form.quantity || Number(form.quantity) < 1 || !form.price;
  return <div className="overlay drawer-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="edit-drawer"><header><h2>{isNew ? "新增SKU" : `编辑SKU · ${selected.sku.id}`}</h2><IconButton label="关闭编辑" onClick={onClose}><X /></IconButton></header><form onSubmit={(event) => { event.preventDefault(); setTouched(true); if (!invalid) onSave(form); }}><label className="required">商品名称<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>品牌<input value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} placeholder="请选择品牌" /></label><label className="required">品牌件号<input value={form.partNo} onChange={(event) => setForm({ ...form, partNo: event.target.value })} /></label><label className="required">基础单位<select value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })}><option>套</option><option>个</option><option>件</option></select></label><label className="required">包装内含数量<input className={touched && !form.quantity ? "is-invalid" : ""} value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} inputMode="numeric" />{touched && !form.quantity && <small className="field-error"><Prohibit weight="fill" />请填写每套所含数量</small>}</label><label className="required">销售价（元）<input value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} inputMode="decimal" /></label><label className="required">状态<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option>启用</option><option>停用</option></select></label><label>内部备注<textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} maxLength={500} placeholder="请输入内部备注（选填）" /><span className="char-count">{form.note.length}/500</span></label><footer><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit">保存更改</button></footer></form></aside></div>;
}

function BatchModal({ selectedSkus, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  return <div className="overlay modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="batch-modal" role="dialog" aria-modal="true"><header><div><h2>设置商品状态</h2><p>将更新 {selectedSkus.length} 个 SKU，来自 1 个分组</p></div><IconButton label="关闭" onClick={onClose}><X /></IconButton></header><label>目标状态：<select><option>停用</option><option>启用</option></select></label><label>变更原因：<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="请输入变更原因（必填）" maxLength={200} /><span className="char-count">{reason.length}/200</span>{touched && !reason && <small className="field-error">请输入变更原因</small>}</label><h3>将更新的 SKU（{selectedSkus.length} 个）</h3><div className="batch-list">{selectedSkus.map(({ sku, group }) => <div key={sku.id}><ProductImage src={group.image} alt={group.name} /><span><strong>{sku.id}</strong><small>{group.name}　|　适配车型：{sku.fitment}</small></span></div>)}</div><p className="modal-note">停用后将不可新建销售引用；历史记录保留。</p><footer><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="button" onClick={() => { setTouched(true); if (reason) onConfirm(); }}>确认停用</button></footer></div></div>;
}

function ColumnPanel({ columns, setColumns, onClose }) {
  return <aside className="floating-panel column-panel"><header><h2>列设置</h2><IconButton label="关闭列设置" onClick={onClose}><X /></IconButton></header><div className="locked-column"><List /><Checkbox checked label="商品识别" /><span>商品识别</span><small>锁定</small></div>{allColumnOptions.map(([key, label]) => <div className="column-option" key={key}><List /><Checkbox checked={columns.has(key)} onChange={() => setColumns((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; })} label={label} /><span>{label}</span></div>)}<footer><button className="secondary-button" type="button" onClick={() => setColumns(new Set(allColumnOptions.slice(0, 7).map(([key]) => key)))}>重置默认</button><button className="primary-button" type="button" onClick={onClose}>应用</button></footer></aside>;
}

function SavedViewPanel({ mode, setMode, onClose, onSaved }) {
  const [name, setName] = useState("济南仓制动片");
  return <div className="saved-view-stack"><div className="saved-view-menu floating-panel"><button type="button">默认视图</button><button className="is-selected" type="button">济南仓低库存 <Check /></button><button type="button">待补图片</button><span /><button type="button" onClick={() => setMode("create")}>保存为新视图</button></div>{mode === "create" && <div className="save-view-form floating-panel"><label>视图名称<input value={name} onChange={(event) => setName(event.target.value)} /></label><label className="radio-line"><input type="radio" name="scope" defaultChecked /> 私人视图</label><label className="radio-line"><input type="radio" name="scope" /> 共享视图</label><footer><button className="primary-button" type="button" onClick={() => { onSaved(name); onClose(); }}>保存</button><button className="secondary-button" type="button" onClick={() => setMode("menu")}>取消</button></footer></div>}</div>;
}

function BottomBar({ selectedCount, onBatch, onClear }) {
  return <footer className="bottom-bar"><div className="selection-summary">{selectedCount ? <>已选 {selectedCount} 个 SKU，来自 1 个分组</> : "未选择 SKU"}</div><div className="bottom-actions"><button className="secondary-button" type="button"><DownloadSimple /> 导出</button><button className="secondary-button" type="button" onClick={onBatch} disabled={!selectedCount}><GearSix /> 设置状态</button><button className="secondary-button" type="button" onClick={onClear} disabled={!selectedCount}><Trash /> 清除选择</button></div><div className="pagination"><button type="button">每页 20 组 <CaretDown /></button><button type="button" disabled><CaretLeft /></button><button className="is-current" type="button">1</button><button type="button">2</button><button type="button">3</button><button type="button">4</button><span>…</span><button type="button">643</button><button type="button"><CaretRight /></button></div></footer>;
}

export function App() {
  const [groups, setGroups] = useState(initialGroups);
  const [expanded, setExpanded] = useState(new Set());
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [edit, setEdit] = useState(null);
  const [inventorySku, setInventorySku] = useState(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [columns, setColumns] = useState(new Set(allColumnOptions.slice(0, 7).map(([key]) => key)));
  const [savedView, setSavedView] = useState(null);
  const [savedViewMode, setSavedViewMode] = useState("menu");
  const [toast, setToast] = useState("");
  const searchAreaRef = useRef(null);

  useEffect(() => {
    const onPointer = (event) => { if (searchAreaRef.current && !searchAreaRef.current.contains(event.target)) setSearchFocused(false); };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, []);

  useEffect(() => {
    setSelected(new Set());
    setInventorySku(null);
  }, [search, category]);

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query === "demo-notfound") return [];
    return groups.filter((group) => {
      if (category && group.category !== category) return false;
      if (!query) return true;
      return `${group.name} ${group.reference} ${group.skus.map((sku) => `${sku.id} ${sku.oe} ${sku.partNo}`).join(" ")}`.toLowerCase().includes(query);
    });
  }, [groups, search, category]);

  const selectedSkus = groups.flatMap((group) => group.skus.filter((sku) => selected.has(sku.id)).map((sku) => ({ sku, group })));
  const toggleSku = (id) => setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleGroup = (_, value, ids) => setSelected((current) => { const next = new Set(current); ids.forEach((id) => value ? next.add(id) : next.delete(id)); return next; });
  const refresh = () => { setLoading(true); setInventorySku(null); window.setTimeout(() => setLoading(false), 950); };
  const clearFilters = () => { setSearch(""); setCategory(""); setCategoryDraft(""); };
  const showToast = (message) => { setToast(message); window.setTimeout(() => setToast(""), 3000); };

  return <div className="app-shell"><AppHeader /><main className="workspace"><div className="page-title-row"><div><h1>SKU商品库</h1><nav className="status-tabs"><button className="is-active" type="button">全部商品 (12,846)</button><button type="button">库存异常 (128)</button><button type="button">资料待完善 (86)</button><button type="button">待审核 (24)</button></nav></div><div className="page-actions"><div className="popover-anchor"><button className={`saved-view-trigger ${savedView ? "is-active" : ""}`} type="button" onClick={() => setSavedView(savedView ? null : "open")}>已保存视图 {savedView ? <CaretUp /> : <CaretDown />}</button>{savedView && <SavedViewPanel mode={savedViewMode} setMode={setSavedViewMode} onClose={() => setSavedView(null)} onSaved={(name) => showToast(`已保存视图：${name}`)} />}</div><div className="popover-anchor"><button className={`secondary-button ${columnsOpen ? "is-active" : ""}`} type="button" onClick={() => setColumnsOpen(!columnsOpen)}><GearSix /> 列设置</button>{columnsOpen && <ColumnPanel columns={columns} setColumns={setColumns} onClose={() => setColumnsOpen(false)} />}</div><button className="primary-button" type="button" onClick={() => setEdit({})}><Plus /> 新增SKU</button><IconButton label="刷新商品" onClick={refresh}><ArrowClockwise className={loading ? "spin" : ""} /></IconButton></div></div><div ref={searchAreaRef}><FilterBar search={search} setSearch={setSearch} category={category} onClearCategory={() => { setCategory(""); setCategoryDraft(""); }} onCategory={() => setCategoryOpen(!categoryOpen)} onSearchFocus={setSearchFocused} searchFocused={searchFocused} hasResults={filteredGroups.length > 0} />{categoryOpen && <CategoryPopover selected={categoryDraft} setSelected={setCategoryDraft} onReset={() => setCategoryDraft("")} onApply={() => { setCategory(categoryDraft); setCategoryOpen(false); }} />}</div><div className="content-area">{loading ? <SkeletonList /> : filteredGroups.length ? <ProductTable groups={filteredGroups} expanded={expanded} setExpanded={setExpanded} selected={selected} toggleSku={toggleSku} toggleGroup={toggleGroup} inventorySku={inventorySku} setInventorySku={setInventorySku} onDetail={(sku, group) => setDetail({ sku, group })} onEdit={(sku, group) => setEdit({ sku, group })} /> : <EmptyState onClear={clearFilters} />}</div></main><BottomBar selectedCount={selected.size} onBatch={() => setBatchOpen(true)} onClear={() => setSelected(new Set())} />{detail && <DetailDrawer selected={detail} onClose={() => setDetail(null)} onEdit={() => { setEdit(detail); setDetail(null); }} />}{edit && <EditDrawer selected={edit} onClose={() => setEdit(null)} onSave={(form) => { if (edit.sku) setGroups((current) => current.map((group) => ({ ...group, skus: group.skus.map((sku) => sku.id === edit.sku.id ? { ...sku, partNo: form.partNo, brand: form.brand || sku.brand, unit: form.unit, price: Number(form.price), active: form.status === "启用" } : sku) }))); setEdit(null); showToast(edit.sku ? `${edit.sku.id} · 商品资料已更新` : "新SKU已保存为草稿"); }} />}{batchOpen && <BatchModal selectedSkus={selectedSkus} onClose={() => setBatchOpen(false)} onConfirm={() => { setBatchOpen(false); setGroups((current) => current.map((group) => ({ ...group, skus: group.skus.map((sku) => selected.has(sku.id) ? { ...sku, active: false } : sku) }))); showToast(`已停用 ${selected.size} 个 SKU`); setSelected(new Set()); }} />}{toast && <div className="toast"><CheckCircle weight="fill" /><span><strong>已保存更改</strong><small>{toast}</small></span><button type="button" aria-label="关闭提示" onClick={() => setToast("")}><X /></button></div>}</div>;
}
