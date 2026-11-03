import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise, CaretDown, CaretLeft, CaretRight, Check, CheckCircle,
  DotsThree, FileText, MagnifyingGlass, Minus, PencilSimple, Plus, Prohibit,
  Trash, X,
} from "@phosphor-icons/react";

const ASSET_BASE = `${import.meta.env.BASE_URL}assets/`;
const API_BASE = `${import.meta.env.BASE_URL}api`;
const STATUS_LABELS = { draft: "草稿", enabled: "启用", disabled: "停用" };
const VERIFY_LABELS = { pending: "待核实", verified: "已核实", rejected: "不适配" };

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || "请求失败");
    error.status = response.status;
    error.details = body.details || {};
    throw error;
  }
  return body;
}

function Checkbox({ checked, indeterminate = false, onChange, label }) {
  return <button className={`checkbox ${checked || indeterminate ? "is-checked" : ""}`} type="button" role="checkbox" aria-checked={indeterminate ? "mixed" : checked} aria-label={label} onClick={(event) => { event.stopPropagation(); onChange?.(); }}>{indeterminate ? <Minus weight="bold" /> : checked ? <Check weight="bold" /> : null}</button>;
}

function IconButton({ children, label, onClick, disabled = false }) {
  return <button className="icon-button" aria-label={label} title={label} type="button" onClick={onClick} disabled={disabled}>{children}</button>;
}

function ProductImage({ group, small = false }) {
  const src = group.image ? `${ASSET_BASE}${group.image}` : `${ASSET_BASE}brake-pads.png`;
  return <img className={`product-image ${small ? "is-small" : ""}`} src={src} alt={group.name} />;
}

function AppHeader() {
  return <header className="app-header sku-only-header">
    <div className="brand-lockup"><strong>奥联</strong><span className="brand-divider" /><button className="plain-button" type="button">SKU商品库 <CaretDown /></button></div>
    <div className="header-mode"><FileText /> SKU 资料维护</div>
  </header>;
}

function FilterBar({ search, setSearch, category, setCategory, categories }) {
  return <div className="filter-area"><div className="filter-row">
    <label className="local-search"><MagnifyingGlass /><input value={search} aria-label="筛选商品" placeholder="搜索SKU、OE号、品牌件号或配件名称" onChange={(event) => setSearch(event.target.value)} />{search && <button type="button" aria-label="清除搜索" onClick={() => setSearch("")}><X /></button>}</label>
    <label className="select-filter">配件品类：<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">全部</option>{categories.map((item) => <option key={item.category} value={item.category}>{item.category}（{item.count}）</option>)}</select><CaretDown /></label>
  </div></div>;
}

function LoadingState() {
  return <div className="table-shell skeleton-shell"><div className="table-heading"><span className="skeleton sk-check" /><span className="skeleton sk-title" /></div>{[1, 2, 3].map((item) => <div className="skeleton-group-row" key={item}><span className="skeleton sk-check" /><span className="skeleton sk-image" /><span><i className="skeleton sk-name" /><i className="skeleton sk-line" /></span><i className="skeleton sk-meta" /></div>)}</div>;
}

function EmptyState({ onClear }) {
  return <div className="table-shell empty-shell"><div className="empty-state"><MagnifyingGlass /><h3>未找到匹配的 SKU</h3><p>请调整搜索词或筛选条件</p><button className="secondary-button" type="button" onClick={onClear}>清除筛选</button></div></div>;
}

function ErrorState({ message, onRetry }) {
  return <div className="table-shell empty-shell"><div className="empty-state error-state"><Prohibit weight="fill" /><h3>SKU 数据加载失败</h3><p>{message}</p><button className="primary-button" type="button" onClick={onRetry}>重新加载</button></div></div>;
}

function fitmentText(sku) {
  const item = sku.fitments?.[0];
  if (!item) return "未维护";
  const years = item.yearFrom || item.yearTo ? ` ${item.yearFrom || ""}–${item.yearTo || ""}` : "";
  return `${item.make} ${item.series}${years}`;
}

function ProductTable({ groups, expanded, setExpanded, selected, setSelected, onDetail, onEdit }) {
  const visibleIds = groups.flatMap((group) => group.skus.map((sku) => sku.id));
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const toggleMany = (ids, value) => setSelected((current) => { const next = new Set(current); ids.forEach((id) => value ? next.add(id) : next.delete(id)); return next; });
  return <div className="table-shell"><div className="table-heading"><Checkbox checked={allSelected} indeterminate={selected.size > 0 && !allSelected} onChange={() => toggleMany(visibleIds, !allSelected)} label="全选当前结果" /><span>商品组 / SKU</span></div>
    {groups.map((group) => {
      const open = expanded.has(group.id);
      const ids = group.skus.map((sku) => sku.id);
      const selectedCount = ids.filter((id) => selected.has(id)).length;
      return <section className={`product-group ${open ? "is-expanded" : ""}`} key={group.id}>
        <div className="group-row"><IconButton label={open ? "收起商品组" : "展开商品组"} onClick={() => setExpanded((current) => { const next = new Set(current); open ? next.delete(group.id) : next.add(group.id); return next; })}>{open ? <CaretDown /> : <CaretRight />}</IconButton><Checkbox checked={selectedCount === ids.length} indeterminate={selectedCount > 0 && selectedCount < ids.length} onChange={() => toggleMany(ids, selectedCount !== ids.length)} label={`选择${group.name}`} /><ProductImage group={group} /><div className="group-copy"><strong>{group.name}</strong><span>参考编码　{group.reference}　|　{group.category}　|　共 {group.skus.length} 个 SKU</span></div><div className="group-summary">{group.skus.filter((sku) => sku.status === "enabled").length} 个已启用</div><span /></div>
        {open && <div className="sku-table"><div className="sku-header"><span /><span /><span>SKU / 配件名称</span><span>品牌 / 品牌件号</span><span>OE 号</span><span>适配车型</span><span>售价</span><span>资料状态</span><span /></div>
          {group.skus.map((sku) => <div className="sku-row" key={sku.id}><span /><Checkbox checked={selected.has(sku.id)} onChange={() => setSelected((current) => { const next = new Set(current); next.has(sku.id) ? next.delete(sku.id) : next.add(sku.id); return next; })} label={`选择${sku.id}`} /><button className="sku-identity" type="button" onClick={() => onDetail(sku, group)}><ProductImage group={group} small /><span><strong>{sku.id}</strong><small>{group.name} · {sku.packQuantity}{sku.unit}/包装</small></span></button><span><b>{sku.brand || "未填写品牌"}</b><small>{sku.partNo}</small></span><span>{sku.oeNumbers?.join(" / ") || "未维护"}</span><span>{fitmentText(sku)}</span><span>¥{Number(sku.price).toFixed(2)}</span><span className={`status sku-status status-${sku.status}`}><i />{STATUS_LABELS[sku.status]}</span><IconButton label="编辑SKU" onClick={() => onEdit(sku, group)}><DotsThree /></IconButton></div>)}
        </div>}
      </section>;
    })}
  </div>;
}

function DetailDrawer({ selected, onClose, onEdit }) {
  const [tab, setTab] = useState("基本资料");
  const [activity, setActivity] = useState([]);
  const { sku, group } = selected;
  useEffect(() => { if (tab === "操作记录") api(`/skus/${encodeURIComponent(sku.id)}/activity`).then((data) => setActivity(data.items)).catch(() => setActivity([])); }, [sku.id, tab]);
  return <div className="overlay drawer-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="detail-drawer" role="dialog" aria-modal="true" aria-label={`${sku.id} 商品详情`}><header><h2>SKU 详情</h2><IconButton label="关闭详情" onClick={onClose}><X /></IconButton></header><div className="detail-summary"><ProductImage group={group} /><div><h2>{group.name}</h2><button className="secondary-button edit-button" type="button" onClick={onEdit}><PencilSimple /> 编辑</button><dl><dt>品牌</dt><dd>{sku.brand || "-"}</dd><dt>SKU</dt><dd>{sku.id}</dd><dt>OE 号</dt><dd>{sku.oeNumbers?.join("、") || "-"}</dd><dt>状态</dt><dd><span className={`detail-status status-${sku.status}`} />{STATUS_LABELS[sku.status]}</dd></dl></div></div><nav className="detail-tabs" role="tablist">{["基本资料", "车型适配", "操作记录"].map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? "is-active" : ""} onClick={() => setTab(item)} type="button" key={item}>{item}</button>)}</nav>
    {tab === "基本资料" && <div className="detail-data-grid"><dl><dt>商品组参考编码</dt><dd>{group.reference}</dd><dt>配件品类</dt><dd>{group.category}</dd><dt>品牌件号</dt><dd>{sku.partNo}</dd><dt>包装</dt><dd>{sku.packQuantity}{sku.unit}/包装</dd><dt>销售价</dt><dd>¥{Number(sku.price).toFixed(2)}</dd><dt>内部备注</dt><dd>{sku.note || "-"}</dd><dt>最近更新</dt><dd>{new Date(sku.updatedAt).toLocaleString("zh-CN")}</dd></dl></div>}
    {tab === "车型适配" && <div className="fitment-panel">{sku.fitments?.length ? <div className="fitment-table"><div><b>车型</b><b>年款</b><b>配置条件</b><b>安装位置</b><b>核实状态</b><b>资料来源</b></div>{sku.fitments.map((item, index) => <div key={`${item.make}-${item.series}-${index}`}><span>{item.make} {item.series}</span><span>{item.yearFrom || "-"}–{item.yearTo || "-"}</span><span>{[item.variant, item.engine].filter(Boolean).join(" / ") || "-"}</span><span>{item.position || "-"}</span><span><em className={item.verificationStatus === "verified" ? "verified" : ""}>{VERIFY_LABELS[item.verificationStatus]}</em></span><span>{item.source || "-"}</span></div>)}</div> : <div className="detail-placeholder"><FileText /><h3>尚未维护车型适配</h3></div>}</div>}
    {tab === "操作记录" && <div className="activity-list">{activity.length ? activity.map((item) => <div key={item.id}><strong>{item.summary}</strong><small>{new Date(item.createdAt).toLocaleString("zh-CN")}</small></div>) : <div className="detail-placeholder"><FileText /><h3>暂无操作记录</h3></div>}</div>}
  </aside></div>;
}

const emptyFitment = () => ({ make: "", series: "", yearFrom: "", yearTo: "", variant: "", engine: "", position: "", source: "", verificationStatus: "pending", note: "" });

function EditDrawer({ selected, groups, onClose, onSaved, onDeleted }) {
  const editing = Boolean(selected?.sku);
  const initialSku = selected?.sku;
  const [form, setForm] = useState({
    groupId: selected?.group?.id || groups[0]?.id || "__new__",
    groupName: "", groupReference: "", category: "", id: initialSku?.id || "", brand: initialSku?.brand || "",
    partNo: initialSku?.partNo || "", unit: initialSku?.unit || "个", packQuantity: initialSku?.packQuantity || 1,
    price: initialSku?.price ?? "", status: initialSku?.status || "draft", note: initialSku?.note || "",
    oeNumbers: initialSku?.oeNumbers?.join("\n") || "",
  });
  const [fitments, setFitments] = useState(initialSku?.fitments?.length ? initialSku.fitments : [emptyFitment()]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const updateFitment = (index, key, value) => setFitments((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setErrors({});
    const payload = {
      group: form.groupId === "__new__" ? { name: form.groupName, reference: form.groupReference, category: form.category, image: "brake-pads.png" } : { id: form.groupId },
      sku: { id: form.id, brand: form.brand, partNo: form.partNo, unit: form.unit, packQuantity: Number(form.packQuantity), price: Number(form.price), status: form.status, note: form.note },
      oeNumbers: form.oeNumbers.split(/[\n,，]+/).map((item) => item.trim()).filter(Boolean),
      fitments,
    };
    try {
      const saved = await api(editing ? `/skus/${encodeURIComponent(initialSku.id)}` : "/skus", { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) });
      onSaved(saved, editing ? "SKU 资料已更新" : "SKU 已创建");
    } catch (error) {
      setErrors(error.details || { form: error.message });
    } finally { setSaving(false); }
  };
  return <div className="overlay drawer-overlay"><aside className="edit-drawer sku-edit-drawer" role="dialog" aria-modal="true" aria-label={editing ? "编辑 SKU" : "新增 SKU"}><header><h2>{editing ? `编辑 SKU · ${initialSku.id}` : "新增 SKU"}</h2><IconButton label="关闭编辑" onClick={onClose}><X /></IconButton></header><form onSubmit={submit}>
    {errors.form && <div className="form-error"><Prohibit weight="fill" />{errors.form}</div>}
    <section><h3>商品归属</h3><label>商品组<select value={form.groupId} onChange={(event) => set("groupId", event.target.value)}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name} · {group.reference}</option>)}<option value="__new__">＋ 新建商品组</option></select></label>{form.groupId === "__new__" && <div className="form-grid"><Field label="商品名称" value={form.groupName} onChange={(value) => set("groupName", value)} error={errors.groupName} required /><Field label="参考编码" value={form.groupReference} onChange={(value) => set("groupReference", value)} error={errors.groupReference} required /><Field label="配件品类" value={form.category} onChange={(value) => set("category", value)} error={errors.category} required /></div>}</section>
    <section><h3>SKU 基本资料</h3><div className="form-grid"><Field label="SKU 编码" value={form.id} onChange={(value) => set("id", value)} error={errors.id} required disabled={editing} /><Field label="品牌" value={form.brand} onChange={(value) => set("brand", value)} /><Field label="品牌件号" value={form.partNo} onChange={(value) => set("partNo", value)} error={errors.partNo} required /><label>基础单位<select value={form.unit} onChange={(event) => set("unit", event.target.value)}><option>个</option><option>件</option><option>套</option><option>盒</option></select></label><Field label="包装内含数量" type="number" min="1" value={form.packQuantity} onChange={(value) => set("packQuantity", value)} error={errors.packQuantity} required /><Field label="销售价（元）" type="number" min="0" step="0.01" value={form.price} onChange={(value) => set("price", value)} error={errors.price} required /><label>资料状态<select value={form.status} onChange={(event) => set("status", event.target.value)}><option value="draft">草稿</option><option value="enabled">启用</option><option value="disabled">停用</option></select></label></div><label>OE 号（每行一个）<textarea value={form.oeNumbers} onChange={(event) => set("oeNumbers", event.target.value)} />{errors.oeNumbers && <small className="field-error">{errors.oeNumbers}</small>}</label><label>内部备注<textarea value={form.note} maxLength={500} onChange={(event) => set("note", event.target.value)} /><span className="char-count">{form.note.length}/500</span></label></section>
    <section><div className="section-title"><h3>车型适配</h3><button className="text-button" type="button" onClick={() => setFitments((current) => [...current, emptyFitment()])}><Plus /> 添加车型</button></div>{fitments.map((item, index) => <div className="fitment-editor" key={index}><div className="form-grid"><Field label="品牌" value={item.make} onChange={(value) => updateFitment(index, "make", value)} /><Field label="车系" value={item.series} onChange={(value) => updateFitment(index, "series", value)} /><Field label="起始年款" type="number" value={item.yearFrom || ""} onChange={(value) => updateFitment(index, "yearFrom", value)} /><Field label="结束年款" type="number" value={item.yearTo || ""} onChange={(value) => updateFitment(index, "yearTo", value)} /><Field label="车型版本" value={item.variant || ""} onChange={(value) => updateFitment(index, "variant", value)} /><Field label="发动机/配置" value={item.engine || ""} onChange={(value) => updateFitment(index, "engine", value)} /><Field label="安装位置" value={item.position || ""} onChange={(value) => updateFitment(index, "position", value)} /><Field label="资料来源" value={item.source || ""} onChange={(value) => updateFitment(index, "source", value)} /><label>核实状态<select value={item.verificationStatus} onChange={(event) => updateFitment(index, "verificationStatus", event.target.value)}><option value="pending">待核实</option><option value="verified">已核实</option><option value="rejected">不适配</option></select></label></div>{fitments.length > 1 && <button className="danger-text-button" type="button" onClick={() => setFitments((current) => current.filter((_, rowIndex) => rowIndex !== index))}><Trash /> 删除此车型</button>}</div>)}</section>
    {editing && initialSku.status === "draft" && <div className="draft-delete-row">{confirmingDelete ? <><span>草稿删除后不能恢复。</span><button className="danger-button" type="button" onClick={async () => { setSaving(true); try { await api(`/skus/${encodeURIComponent(initialSku.id)}`, { method: "DELETE" }); onDeleted(); } catch (error) { setErrors({ form: error.message }); setSaving(false); } }}>确认删除草稿</button><button className="secondary-button" type="button" onClick={() => setConfirmingDelete(false)}>取消</button></> : <button className="danger-text-button" type="button" onClick={() => setConfirmingDelete(true)}><Trash /> 删除草稿</button>}</div>}
    <footer><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "保存中..." : editing ? "保存更改" : "创建 SKU"}</button></footer>
  </form></aside></div>;
}

function Field({ label, value, onChange, error, required = false, ...props }) {
  return <label className={required ? "required" : ""}>{label}<input value={value} onChange={(event) => onChange(event.target.value)} className={error ? "is-invalid" : ""} {...props} />{error && <small className="field-error">{error}</small>}</label>;
}

function BatchModal({ items, onClose, onConfirm }) {
  const [status, setStatus] = useState("disabled");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const groupCount = new Set(items.map((item) => item.group.id)).size;
  return <div className="overlay modal-overlay"><div className="batch-modal" role="dialog" aria-modal="true"><header><div><h2>批量设置资料状态</h2><p>{items.length} 个 SKU，来自 {groupCount} 个商品组</p></div><IconButton label="关闭" onClick={onClose}><X /></IconButton></header><label>目标状态<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="enabled">启用</option><option value="disabled">停用</option><option value="draft">转为草稿</option></select></label><label>变更原因<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} /><span className="char-count">{reason.length}/200</span></label><div className="batch-list">{items.map(({ sku, group }) => <div key={sku.id}><ProductImage group={group} small /><span><strong>{sku.id}</strong><small>{group.name} · 当前{STATUS_LABELS[sku.status]}</small></span></div>)}</div><footer><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="button" disabled={!reason.trim() || saving} onClick={async () => { setSaving(true); await onConfirm(status, reason); setSaving(false); }}>{saving ? "处理中..." : "确认修改"}</button></footer></div></div>;
}

function BottomBar({ selectedItems, page, totalPages, pageSize, onPage, onBatch, onClear }) {
  return <footer className="bottom-bar"><div className="selection-summary">{selectedItems.length ? `已选 ${selectedItems.length} 个 SKU` : "未选择 SKU"}</div><div className="bottom-actions"><button className="secondary-button" type="button" onClick={onBatch} disabled={!selectedItems.length}>设置状态</button><button className="secondary-button" type="button" onClick={onClear} disabled={!selectedItems.length}>清除选择</button></div><div className="pagination"><span>每页 {pageSize} 组</span><button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}><CaretLeft /></button><strong>{page} / {totalPages}</strong><button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}><CaretRight /></button></div></footer>;
}

export function App() {
  const [catalog, setCatalog] = useState({ groups: [], counts: { all: 0, draft: 0, incomplete: 0, disabled: 0 }, categories: [], pagination: { page: 1, pageSize: 20, totalPages: 1 } });
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(new Set());
  const [selected, setSelected] = useState(new Set());
  const [detail, setDetail] = useState(null);
  const [edit, setEdit] = useState(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [toast, setToast] = useState("");
  const requestId = useRef(0);

  const load = async ({ quiet = false } = {}) => {
    const id = ++requestId.current;
    if (!quiet) setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ search, category, status, page: String(page), pageSize: "20" });
      const [data, allGroups] = await Promise.all([api(`/catalog?${params}`), api("/groups")]);
      if (id !== requestId.current) return;
      setCatalog(data); setGroups(allGroups.items);
      setExpanded((current) => current.size ? current : new Set(data.groups.map((group) => group.id)));
    } catch (loadError) {
      if (id === requestId.current) setError(loadError.message);
    } finally { if (id === requestId.current) setLoading(false); }
  };

  useEffect(() => { const timer = window.setTimeout(() => load(), 220); return () => window.clearTimeout(timer); }, [search, category, status, page]);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [search, category, status]);
  useEffect(() => { if (!toast) return undefined; const timer = window.setTimeout(() => setToast(""), 3000); return () => window.clearTimeout(timer); }, [toast]);

  const selectedItems = useMemo(() => catalog.groups.flatMap((group) => group.skus.filter((sku) => selected.has(sku.id)).map((sku) => ({ sku, group }))), [catalog.groups, selected]);
  const tabs = [
    ["", `全部 SKU (${catalog.counts.all})`],
    ["draft", `草稿 (${catalog.counts.draft})`],
    ["incomplete", `资料待完善 (${catalog.counts.incomplete})`],
    ["disabled", `已停用 (${catalog.counts.disabled})`],
  ];

  return <div className="app-shell"><AppHeader /><main className="workspace"><div className="page-title-row"><div><h1>SKU商品库</h1><nav className="status-tabs" role="tablist">{tabs.map(([value, label]) => <button role="tab" aria-selected={status === value} className={status === value ? "is-active" : ""} type="button" key={value} onClick={() => setStatus(value)}>{label}</button>)}</nav></div><div className="page-actions"><button className="primary-button" type="button" onClick={() => setEdit({})}><Plus /> 新增SKU</button><IconButton label="刷新商品" onClick={() => load({ quiet: true })}><ArrowClockwise /></IconButton></div></div><FilterBar search={search} setSearch={setSearch} category={category} setCategory={setCategory} categories={catalog.categories} /><div className="content-area">{loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => load()} /> : catalog.groups.length ? <ProductTable groups={catalog.groups} expanded={expanded} setExpanded={setExpanded} selected={selected} setSelected={setSelected} onDetail={(sku, group) => setDetail({ sku, group })} onEdit={(sku, group) => setEdit({ sku, group })} /> : <EmptyState onClear={() => { setSearch(""); setCategory(""); setStatus(""); }} />}</div></main><BottomBar selectedItems={selectedItems} page={catalog.pagination.page} totalPages={catalog.pagination.totalPages} pageSize={catalog.pagination.pageSize} onPage={setPage} onBatch={() => setBatchOpen(true)} onClear={() => setSelected(new Set())} />
    {detail && <DetailDrawer selected={detail} onClose={() => setDetail(null)} onEdit={() => { setEdit(detail); setDetail(null); }} />}
    {edit && <EditDrawer selected={edit} groups={groups} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setToast(edit.sku ? "SKU 资料已更新" : "SKU 已创建"); load({ quiet: true }); }} onDeleted={() => { setEdit(null); setToast("草稿 SKU 已删除"); load({ quiet: true }); }} />}
    {batchOpen && <BatchModal items={selectedItems} onClose={() => setBatchOpen(false)} onConfirm={async (nextStatus, reason) => { await Promise.all(selectedItems.map(({ sku }) => api(`/skus/${encodeURIComponent(sku.id)}/status`, { method: "PATCH", body: JSON.stringify({ status: nextStatus, reason }) }))); setBatchOpen(false); setSelected(new Set()); setToast(`已更新 ${selectedItems.length} 个 SKU`); load({ quiet: true }); }} />}
    {toast && <div className="toast" role="status"><CheckCircle weight="fill" /><span><strong>操作成功</strong><small>{toast}</small></span><button type="button" aria-label="关闭提示" onClick={() => setToast("")}><X /></button></div>}
  </div>;
}
