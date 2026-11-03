import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise, Car, CaretDown, CaretLeft, CaretRight, Check, CheckCircle,
  DotsThree, DownloadSimple, FileText, MagnifyingGlass, Minus, PencilSimple,
  Plus, Prohibit, Trash, UploadSimple, X,
} from "@phosphor-icons/react";

const ASSET_BASE = `${import.meta.env.BASE_URL}assets/`;
const API_BASE = `${import.meta.env.BASE_URL}api`;
const STATUS_LABELS = { draft: "草稿", enabled: "启用", disabled: "停用" };
const VERIFY_LABELS = { pending: "待核实", verified: "已核实", rejected: "不适配" };
const CSV_HEADERS = ["商品组参考编码", "商品名称", "配件品类", "SKU编码", "品牌", "品牌件号", "基础单位", "包装数量", "销售价", "资料状态", "OE号", "车型品牌", "车系", "起始年款", "结束年款", "车型版本", "发动机配置", "安装位置", "资料来源", "核实状态", "内部备注"];
const BRAND_PRESETS = ["BOSCH", "MANN", "MAHLE", "TRW", "DELPHI", "MOOG", "ATE", "LEMFÖRDER", "SACHS", "SKF", "VALEO", "DENSO", "NGK", "FEBI", "SWAG"];

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

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv(filename, rows) {
  const content = `\uFEFF${rows.map((row) => row.map(csvEscape).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted && char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); if (row.some((value) => value.trim())) rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  row.push(cell); if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function csvToPayloads(text, groups) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("CSV 文件中没有数据");
  const headers = rows[0].map((item) => item.replace(/^\uFEFF/, "").trim());
  const missing = CSV_HEADERS.slice(0, 11).filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`缺少字段：${missing.join("、")}`);
  const groupByReference = new Map(groups.map((group) => [group.reference.toUpperCase(), group]));
  const payloadBySku = new Map();
  rows.slice(1).forEach((values) => {
    const record = Object.fromEntries(headers.map((header, index) => [header, String(values[index] || "").trim()]));
    const skuId = record.SKU编码.toUpperCase();
    if (!skuId) return;
    let payload = payloadBySku.get(skuId);
    if (!payload) {
      const existingGroup = groupByReference.get(record.商品组参考编码.toUpperCase());
      payload = {
        group: existingGroup ? { id: existingGroup.id } : { name: record.商品名称, reference: record.商品组参考编码, category: record.配件品类, image: "brake-pads.png" },
        sku: {
          id: skuId, brand: record.品牌, partNo: record.品牌件号, unit: record.基础单位,
          packQuantity: Number(record.包装数量), price: Number(record.销售价),
          status: ({ 草稿: "draft", 启用: "enabled", 停用: "disabled" })[record.资料状态] || record.资料状态 || "draft",
          note: record.内部备注,
        },
        oeNumbers: [], fitments: [],
      };
      payloadBySku.set(skuId, payload);
    }
    payload.oeNumbers.push(...record.OE号.split(/[|/；;]+/).map((item) => item.trim()).filter(Boolean));
    if (record.车型品牌 || record.车系) payload.fitments.push({
      make: record.车型品牌, series: record.车系, yearFrom: record.起始年款, yearTo: record.结束年款,
      variant: record.车型版本, engine: record.发动机配置, position: record.安装位置, source: record.资料来源,
      verificationStatus: ({ 待核实: "pending", 已核实: "verified", 不适配: "rejected" })[record.核实状态] || record.核实状态 || "pending",
    });
  });
  return [...payloadBySku.values()];
}

function exportRows(items) {
  const dataRows = items.flatMap((item) => {
    const fitments = item.fitments.length ? item.fitments : [{}];
    return fitments.map((fitment, index) => [
      item.groupReference, item.groupName, item.category, item.id, item.brand, item.partNo, item.unit,
      item.packQuantity, item.price, STATUS_LABELS[item.status] || item.status, index === 0 ? item.oeNumbers.join("|") : "",
      fitment.make, fitment.series, fitment.yearFrom, fitment.yearTo, fitment.variant, fitment.engine, fitment.position,
      fitment.source, VERIFY_LABELS[fitment.verificationStatus] || fitment.verificationStatus, item.note,
    ]);
  });
  return [CSV_HEADERS, ...dataRows];
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

function AppHeader({ view, onView }) {
  return <header className="app-header sku-only-header">
    <div className="brand-lockup"><strong>奥联</strong><span className="brand-divider" /><nav className="app-nav" aria-label="主导航">
      <button type="button" className={view === "sku" ? "is-active" : ""} aria-current={view === "sku" ? "page" : undefined} onClick={() => onView("sku")}>SKU 商品库</button>
      <button type="button" className={view === "vehicle" ? "is-active" : ""} aria-current={view === "vehicle" ? "page" : undefined} onClick={() => onView("vehicle")}>车型查询</button>
      <button type="button" className={view === "vehicles" ? "is-active" : ""} aria-current={view === "vehicles" ? "page" : undefined} onClick={() => onView("vehicles")}>车型库</button>
    </nav></div>
    <div className="header-mode">{view === "sku" ? <FileText /> : <Car />} {view === "sku" ? "SKU 资料维护" : view === "vehicle" ? "按车找件" : "车型资料维护"}</div>
  </header>;
}

function VehicleLookup({ onView }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [vehicles, setVehicles] = useState([]);
  useEffect(() => { api("/vehicles").then((data) => setVehicles(data.items)).catch(() => setVehicles([])); }, []);
  const run = async (value) => {
    const text = value.trim();
    if (!text) { setResult(null); setError(""); return; }
    setLoading(true); setError("");
    try { setResult(await api(`/vehicle-lookup?q=${encodeURIComponent(text)}`)); }
    catch (lookupError) { setError(lookupError.message); setResult(null); }
    finally { setLoading(false); }
  };
  const pick = (text) => { setQuery(text); run(text); };
  const examples = vehicles.slice(0, 3).map((vehicle) => `${vehicle.series} ${vehicle.generation} 三滤`.trim());
  const brands = (items) => items.flatMap((item) => item.skus).filter((sku) => sku.status === "enabled").length;
  return <main className="workspace vehicle-workspace">
    <div className="page-title-row"><div><h1>车型查询</h1></div></div>
    <form className="vehicle-search" onSubmit={(event) => { event.preventDefault(); run(query); }}>
      <label className="local-search"><MagnifyingGlass /><input value={query} aria-label="搜索车型与类目" placeholder="输入车型和类目，如：卡宴 E3 三滤" onChange={(event) => setQuery(event.target.value)} /></label>
      <button className="primary-button" type="submit" disabled={loading}>{loading ? "查询中..." : "查询"}</button>
    </form>
    {!result && !error && (examples.length > 0
      ? <div className="vehicle-examples"><span>试试</span>{examples.map((example) => <button type="button" key={example} onClick={() => pick(example)}>{example}</button>)}</div>
      : <div className="vehicle-empty"><p>车型库里还没有车型，先添加车型和适配件。</p><button className="secondary-button" type="button" onClick={() => onView?.("vehicles")}>去车型库添加</button></div>)}
    {error && <div className="form-error"><Prohibit weight="fill" />{error}</div>}
    {result && (result.vehicle
      ? <div className="vehicle-result">
        <div className="vehicle-summary">
          <strong>{result.vehicle.label}</strong>
          <span>{[result.vehicle.platform, `${result.vehicle.yearFrom}–${result.vehicle.yearTo}`, result.vehicle.engine, result.vehicle.drive].filter(Boolean).join(" · ")}</span>
          <span className="vehicle-set">{result.set?.name || result.partTypes.map((partType) => partType.name).join(" / ")}</span>
        </div>
        <div className="part-grid">{result.categories.map((category) => <section className="part-card" key={category.partType.id}>
          <header><h3>{category.partType.name}</h3>{brands(category.items) ? <span>{brands(category.items)} 个品牌</span> : null}</header>
          {category.items.length ? category.items.map((item) => <div className="part-item" key={item.group.id}>
            <div className="part-item-head"><strong>{item.group.name}</strong><small>{item.group.reference}{item.group.position ? ` · ${item.group.position}` : ""}</small></div>
            <ul className="brand-list">{item.skus.filter((sku) => sku.status === "enabled").map((sku) => <li key={sku.id}>
              <span className="brand">{sku.brand}</span><span className="part-no">{sku.partNo}</span><span className="price">¥{Number(sku.price).toFixed(2)}</span>
            </li>)}</ul>
            {!item.skus.some((sku) => sku.status === "enabled") && <p className="part-empty">暂无在售品牌</p>}
          </div>) : <p className="part-empty">未建档</p>}
        </section>)}</div>
      </div>
      : <div className="vehicle-result">
        <div className="vehicle-empty"><p>没有匹配到车型。</p></div>
        {result.candidates.length > 0 && <div className="vehicle-candidates">{result.candidates.map((candidate) => <button type="button" key={candidate.id} onClick={() => pick(`${candidate.series} ${candidate.generation} ${result.set?.name || "三滤"}`)}>{candidate.label}</button>)}</div>}
        <div className="vehicle-examples"><span>试试</span>{examples.map((example) => <button type="button" key={example} onClick={() => pick(example)}>{example}</button>)}</div>
      </div>)}
  </main>;
}

const emptyVehicleForm = { brand: "", series: "", generation: "", platform: "", yearFrom: "", yearTo: "", engine: "", body: "", drive: "", note: "", aliases: [], products: [] };

const vehicleToForm = (vehicle) => ({
  brand: vehicle.brand, series: vehicle.series, generation: vehicle.generation, platform: vehicle.platform,
  yearFrom: vehicle.yearFrom ?? "", yearTo: vehicle.yearTo ?? "", engine: vehicle.engine, body: vehicle.body,
  drive: vehicle.drive, note: vehicle.note || "",
  aliases: [...(vehicle.aliases || [])],
  products: (vehicle.products || []).map((item) => ({
    groupId: item.groupId, partTypeId: item.partTypeId, position: item.position || "", verificationStatus: item.verificationStatus,
  })),
});

function VehicleAdmin({ onToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [term, setTerm] = useState("");
  const [drawer, setDrawer] = useState(null);
  const [vinOpen, setVinOpen] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [opening, setOpening] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try { const data = await api("/vehicles"); setItems(data.items); }
    catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openCreate = (vin = "") => setDrawer({ vehicleId: null, draft: { ...emptyVehicleForm }, vin });
  const openEdit = async (item) => {
    setOpening(item.id);
    try {
      const full = await api(`/vehicles/${encodeURIComponent(item.id)}`);
      setDrawer({ vehicleId: item.id, draft: vehicleToForm(full), vin: "" });
    } catch (openError) { setError(openError.message); }
    finally { setOpening(""); }
  };
  const removeVehicle = async (vehicle) => {
    try { await api(`/vehicles/${encodeURIComponent(vehicle.id)}`, { method: "DELETE" }); setRemoving(null); onToast?.(`已删除车型 ${vehicle.label}`); load(); }
    catch (removeError) { setError(removeError.message); setRemoving(null); }
  };

  const needle = term.trim().toLowerCase();
  const filtered = needle
    ? items.filter((vehicle) => [vehicle.label, vehicle.platform, vehicle.engine, ...(vehicle.aliases || [])].join(" ").toLowerCase().includes(needle))
    : items;

  return <main className="workspace vehicle-workspace">
    <div className="page-title-row">
      <div><h1>车型库</h1></div>
      <div className="page-actions">
        <button className="secondary-button" type="button" onClick={() => setVinOpen(true)}><Car /> VIN 识别录入</button>
        <button className="primary-button" type="button" onClick={() => openCreate()}><Plus /> 新增车型</button>
      </div>
    </div>
    <div className="filter-area"><div className="filter-row">
      <label className="local-search"><MagnifyingGlass /><input value={term} aria-label="筛选车型" placeholder="搜索品牌、车系、代系、平台或别名" onChange={(event) => setTerm(event.target.value)} />{term && <button type="button" aria-label="清除搜索" onClick={() => setTerm("")}><X /></button>}</label>
    </div></div>
    {error && <div className="form-error"><Prohibit weight="fill" />{error}</div>}
    {loading ? <div className="loading-note"><span />正在加载车型</div>
      : filtered.length ? <div className="vehicle-list">
        <div className="vehicle-list-head"><span>车型</span><span>平台</span><span>年款</span><span>发动机</span><span>适配件</span><span /></div>
        {filtered.map((vehicle) => <div className="vehicle-list-row" key={vehicle.id}>
          <div className="vehicle-identity"><strong>{vehicle.label}</strong><small>{(vehicle.aliases || []).slice(0, 4).join(" / ") || "无别名"}</small></div>
          <span>{vehicle.platform || "—"}</span>
          <span>{vehicle.yearFrom || "?"}–{vehicle.yearTo || "?"}</span>
          <span>{vehicle.engine || "—"}</span>
          <span>{vehicle.productCount} 个</span>
          <div className="row-actions">
            <button className="secondary-button" type="button" disabled={opening === vehicle.id} onClick={() => openEdit(vehicle)}>{opening === vehicle.id ? "打开中" : "编辑"}</button>
            <IconButton label={`删除车型 ${vehicle.label}`} onClick={() => setRemoving(vehicle)}><Trash /></IconButton>
          </div>
        </div>)}
      </div>
        : <div className="table-shell empty-shell"><div className="empty-state"><Car /><h3>{needle ? "没有匹配的车型" : "还没有维护车型"}</h3><p>{needle ? "换个关键词试试" : "手动新增车型，或粘贴 VIN 识别"}</p>{!needle && <button className="primary-button" type="button" onClick={() => openCreate()}><Plus /> 新增车型</button>}</div></div>}
    {drawer && <VehicleDrawer vehicleId={drawer.vehicleId} draft={drawer.draft} vin={drawer.vin} onClose={() => setDrawer(null)} onSaved={(saved) => { setDrawer(null); onToast?.(`车型 ${saved.label} 已保存`); load(); }} />}
    {vinOpen && <VinDialog onClose={() => setVinOpen(false)} onManual={(vin) => { setVinOpen(false); openCreate(vin); }} />}
    {removing && <div className="overlay modal-overlay"><div className="batch-modal" role="dialog" aria-modal="true" aria-label="删除车型">
      <header><div><h2>删除车型</h2><p>{removing.label}</p></div><IconButton label="关闭" onClick={() => setRemoving(null)}><X /></IconButton></header>
      <p className="modal-note">删除后该车型的别名与适配件映射一并移除，商品组和 SKU 不受影响。</p>
      <footer><button className="secondary-button" type="button" onClick={() => setRemoving(null)}>取消</button><button className="danger-button" type="button" onClick={() => removeVehicle(removing)}>确认删除</button></footer>
    </div></div>}
  </main>;
}

function VehicleDrawer({ vehicleId, draft, vin, onClose, onSaved }) {
  const [form, setForm] = useState(draft);
  const [groups, setGroups] = useState([]);
  const [partTypes, setPartTypes] = useState([]);
  const [alias, setAlias] = useState("");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    Promise.all([api("/groups"), api("/part-types")])
      .then(([groupData, typeData]) => { setGroups(groupData.items); setPartTypes(typeData.items); })
      .catch(() => {});
  }, []);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const addAlias = () => {
    const value = alias.trim();
    if (!value) return;
    if (form.aliases.some((item) => item.toLowerCase() === value.toLowerCase())) { setAlias(""); return; }
    set("aliases", [...form.aliases, value]);
    setAlias("");
  };
  const updateProduct = (index, key, value) => set("products", form.products.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setErrors({});
    const payload = {
      ...form,
      yearFrom: form.yearFrom === "" ? null : Number(form.yearFrom),
      yearTo: form.yearTo === "" ? null : Number(form.yearTo),
      products: form.products.filter((row) => row.groupId && row.partTypeId),
    };
    try {
      const saved = vehicleId
        ? await api(`/vehicles/${encodeURIComponent(vehicleId)}`, { method: "PUT", body: JSON.stringify(payload) })
        : await api("/vehicles", { method: "POST", body: JSON.stringify(payload) });
      onSaved(saved);
    } catch (saveError) {
      setErrors(saveError.details || { form: saveError.message });
    } finally { setSaving(false); }
  };
  return <div className="overlay drawer-overlay"><aside className="edit-drawer sku-edit-drawer vehicle-drawer" role="dialog" aria-modal="true" aria-label={vehicleId ? "编辑车型" : "新增车型"}>
    <header><h2>{vehicleId ? `编辑车型 · ${form.brand} ${form.series}`.trim() : "新增车型"}</h2><IconButton label="关闭编辑" onClick={onClose}><X /></IconButton></header>
    <form onSubmit={submit}>
      {vin && <p className="vin-hint"><Car />VIN {vin} · 识别服务尚未接入，请手动填写</p>}
      {errors.form && <div className="form-error"><Prohibit weight="fill" />{errors.form}</div>}
      <section>
        <h3>基本信息</h3>
        <div className="form-grid">
          <Field label="品牌" value={form.brand} onChange={(value) => set("brand", value)} error={errors.brand} required list="vehicle-brands" />
          <datalist id="vehicle-brands"><option value="奥迪" /><option value="保时捷" /><option value="大众" /><option value="宝马" /><option value="奔驰" /></datalist>
          <Field label="车系" value={form.series} onChange={(value) => set("series", value)} error={errors.series} required />
          <Field label="代系" value={form.generation} onChange={(value) => set("generation", value)} />
          <Field label="平台代号" value={form.platform} onChange={(value) => set("platform", value)} />
          <Field label="起始年款" type="number" value={form.yearFrom} onChange={(value) => set("yearFrom", value)} error={errors.yearFrom} />
          <Field label="结束年款" type="number" value={form.yearTo} onChange={(value) => set("yearTo", value)} error={errors.yearTo} />
          <Field label="发动机" value={form.engine} onChange={(value) => set("engine", value)} />
          <Field label="车身形式" value={form.body} onChange={(value) => set("body", value)} />
          <Field label="驱动形式" value={form.drive} onChange={(value) => set("drive", value)} />
        </div>
      </section>
      <section>
        <h3>别名</h3>
        <div className="alias-editor">
          <div className="alias-input">
            <input value={alias} aria-label="添加别名" placeholder="俗称或代号，如 卡宴 / 9YA" onChange={(event) => setAlias(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addAlias(); } }} />
            <button className="secondary-button" type="button" onClick={addAlias}><Plus /> 添加</button>
          </div>
          {form.aliases.length ? <div className="alias-chips">{form.aliases.map((item) => <span className="alias-chip" key={item}>{item}<button type="button" aria-label={`移除别名 ${item}`} onClick={() => set("aliases", form.aliases.filter((value) => value !== item))}><X /></button></span>)}</div>
            : <p className="field-note">客户口头说法、英文名或平台代号都加上，查询时才能命中。</p>}
        </div>
      </section>
      <section>
        <div className="section-title"><h3>适配商品组</h3><button className="text-button" type="button" onClick={() => set("products", [...form.products, { groupId: "", partTypeId: partTypes[0]?.id || "", position: "", verificationStatus: "pending" }])}><Plus /> 添加适配件</button></div>
        {form.products.length ? form.products.map((row, index) => <div className="product-row" key={index}>
          <select aria-label="件类" value={row.partTypeId} onChange={(event) => updateProduct(index, "partTypeId", event.target.value)}>{partTypes.map((partType) => <option key={partType.id} value={partType.id}>{partType.name}</option>)}</select>
          <select aria-label="商品组" value={row.groupId} onChange={(event) => updateProduct(index, "groupId", event.target.value)}><option value="">选择商品组</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name} · {group.reference}</option>)}</select>
          <select aria-label="核实状态" value={row.verificationStatus} onChange={(event) => updateProduct(index, "verificationStatus", event.target.value)}><option value="pending">待核实</option><option value="verified">已核实</option><option value="rejected">不适配</option></select>
          <input aria-label="安装位置" value={row.position} placeholder="位置" onChange={(event) => updateProduct(index, "position", event.target.value)} />
          <IconButton label="移除适配件" onClick={() => set("products", form.products.filter((_, rowIndex) => rowIndex !== index))}><Trash /></IconButton>
        </div>) : <p className="field-note">还没有适配商品组。添加后，按车型查询才能带出品牌件。</p>}
        {errors.products && <small className="field-error">{errors.products}</small>}
      </section>
      <footer><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "保存中..." : vehicleId ? "保存更改" : "创建车型"}</button></footer>
    </form>
  </aside></div>;
}

function VinDialog({ onClose, onManual }) {
  const [vin, setVin] = useState("");
  const [error, setError] = useState("");
  const [checked, setChecked] = useState(false);
  const submit = (event) => {
    event.preventDefault();
    const value = vin.trim().toUpperCase().replace(/\s+/g, "");
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(value)) { setError("VIN 应为 17 位字母数字，且不含 I、O、Q"); return; }
    setError(""); setChecked(true);
  };
  return <div className="overlay modal-overlay"><div className="batch-modal vin-modal" role="dialog" aria-modal="true" aria-label="VIN 识别车型">
    <header><div><h2>VIN 识别车型</h2><p>粘贴 17 位车架号</p></div><IconButton label="关闭" onClick={onClose}><X /></IconButton></header>
    <form onSubmit={submit}>
      <label>车架号（VIN）<input value={vin} maxLength={17} className={error ? "is-invalid" : ""} placeholder="例如 WAUZZZ4M0ND000000" onChange={(event) => { setVin(event.target.value.toUpperCase()); setChecked(false); setError(""); }} />{error && <small className="field-error">{error}</small>}</label>
      {checked
        ? <div className="vin-result"><p>VIN 解码服务尚未接入，暂时无法自动识别车型。</p><div className="vin-actions"><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="button" onClick={() => onManual(vin.trim().toUpperCase())}>手动录入这台车</button></div></div>
        : <footer><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={!vin.trim()}>识别车型</button></footer>}
    </form>
  </div></div>;
}

function SkuPicker({ onSelect, disabledIds = [] }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!term.trim()) { setResults([]); return undefined; }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api(`/catalog?search=${encodeURIComponent(term.trim())}&pageSize=20`);
        setResults(data.groups.flatMap((group) => group.skus.map((sku) => ({ ...sku, groupName: group.name }))));
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [term]);
  return <div className="sku-picker">
    <label className="local-search"><MagnifyingGlass /><input value={term} aria-label="搜索 SKU" placeholder="输入 SKU、品牌或件号" onChange={(event) => setTerm(event.target.value)} /></label>
    {loading && <p className="loading-note"><span />搜索中</p>}
    {!loading && term.trim() && !results.length && <p className="field-note">没有找到匹配的 SKU</p>}
    {results.length > 0 && <ul className="sku-picker-list">{results.map((sku) => <li key={sku.id}>
      <button type="button" disabled={disabledIds.includes(sku.id)} onClick={() => onSelect(sku)}>
        <strong>{sku.brand}</strong><span>{sku.partNo}</span><small>{sku.id} · {sku.groupName}</small>
      </button>
    </li>)}</ul>}
  </div>;
}

function SkuRelations({ sku }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("interchange");
  const [target, setTarget] = useState(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const load = async () => {
    try { setData(await api(`/skus/${encodeURIComponent(sku.id)}/relations`)); setError(""); }
    catch (loadError) { setError(loadError.message); }
  };
  useEffect(() => { load(); }, [sku.id]);
  const submit = async (event) => {
    event.preventDefault();
    if (!target) return;
    setSaving(true); setError("");
    try {
      if (mode === "replaces") await api(`/skus/${encodeURIComponent(target.id)}/relations`, { method: "POST", body: JSON.stringify({ type: "supersedes", targetId: sku.id, note }) });
      else await api(`/skus/${encodeURIComponent(sku.id)}/relations`, { method: "POST", body: JSON.stringify({ type: mode, targetId: target.id, note }) });
      setTarget(null); setNote("");
      await load();
    } catch (saveError) { setError(saveError.message); }
    finally { setSaving(false); }
  };
  const remove = async (relationId) => {
    try { await api(`/relations/${relationId}`, { method: "DELETE" }); await load(); }
    catch (removeError) { setError(removeError.message); }
  };
  const disabledIds = [sku.id, ...(data ? [
    ...data.interchanges.map((row) => row.sku.id),
    ...data.replacedBy.map((row) => row.sku.id),
    ...data.replaces.map((row) => row.sku.id),
  ] : [])];
  const rowSku = (skuInfo) => [skuInfo?.brand, skuInfo?.partNo].filter(Boolean).join(" ");
  return <div className="relation-panel">
    {error && <div className="form-error"><Prohibit weight="fill" />{error}</div>}
    {data ? <>
      <section className="relation-block">
        <h3>可互换（横向）<span>{data.interchanges.length}</span></h3>
        {data.interchanges.length ? data.interchanges.map((row) => <div className="relation-row" key={row.relationId}>
          <span className="relation-name">{rowSku(row.sku)}</span>
          <small>{row.sku.id}{row.note ? ` · ${row.note}` : ""}</small>
          <button className="text-button" type="button" onClick={() => remove(row.relationId)}>移除</button>
        </div>) : <p className="field-note">没有登记可互换的件</p>}
      </section>
      <section className="relation-block">
        <h3>替代（纵向）<span>{data.replacedBy.length + data.replaces.length}</span></h3>
        {data.replaces.map((row) => <div className="relation-row" key={row.relationId}>
          <span className="relation-tag">本件替代</span>
          <span className="relation-name">{rowSku(row.sku)}</span>
          <small>{row.sku.id}{row.note ? ` · ${row.note}` : ""}</small>
          <button className="text-button" type="button" onClick={() => remove(row.relationId)}>移除</button>
        </div>)}
        {data.replacedBy.map((row) => <div className="relation-row" key={row.relationId}>
          <span className="relation-tag">已被替代</span>
          <span className="relation-name">{rowSku(row.sku)}</span>
          <small>{row.sku.id}{row.note ? ` · ${row.note}` : ""}</small>
          <button className="text-button" type="button" onClick={() => remove(row.relationId)}>移除</button>
        </div>)}
        {!data.replaces.length && !data.replacedBy.length && <p className="field-note">没有登记替代关系</p>}
        {data.chain.length > 1 && <p className="relation-chain">顺着替代链最终使用：{rowSku(data.chain[data.chain.length - 1])}（{data.chain[data.chain.length - 1].id}）</p>}
      </section>
      <form className="relation-form" onSubmit={submit}>
        <div className="relation-form-head">
          <select aria-label="关系类型" value={mode} onChange={(event) => { setMode(event.target.value); setTarget(null); }}>
            <option value="interchange">可互换</option>
            <option value="replaces">本件替代了…</option>
            <option value="supersedes">本件已被替代…</option>
          </select>
          <input aria-label="关系备注" value={note} placeholder="备注（可选）" onChange={(event) => setNote(event.target.value)} />
        </div>
        {target ? <div className="relation-target"><span>已选 {rowSku(target)} · {target.id}</span><button className="text-button" type="button" onClick={() => setTarget(null)}>重选</button></div>
          : <SkuPicker onSelect={setTarget} disabledIds={disabledIds} />}
        <footer><button className="primary-button" type="submit" disabled={!target || saving}>{saving ? "添加中..." : "添加关系"}</button></footer>
      </form>
    </> : <p className="loading-note"><span />正在加载替代关系</p>}
  </div>;
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

function EmptyState({ onClear, onAdd, onImport, filtered }) {
  if (!filtered) return <div className="table-shell empty-shell"><div className="empty-state"><FileText /><h3>还没有 SKU 资料</h3><p>新建第一个 SKU，或从 CSV 批量导入已有资料</p><div><button className="primary-button" type="button" onClick={onAdd}><Plus /> 新增 SKU</button><button className="secondary-button" type="button" onClick={onImport}><UploadSimple /> 批量导入</button></div></div></div>;
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
      const toggleGroup = () => setExpanded((current) => { const next = new Set(current); open ? next.delete(group.id) : next.add(group.id); return next; });
      return <section className={`product-group ${open ? "is-expanded" : ""}`} key={group.id}>
        <div className="group-row"><IconButton label={open ? "收起商品组" : "展开商品组"} onClick={toggleGroup}>{open ? <CaretDown /> : <CaretRight />}</IconButton><Checkbox checked={selectedCount === ids.length} indeterminate={selectedCount > 0 && selectedCount < ids.length} onChange={() => toggleMany(ids, selectedCount !== ids.length)} label={`选择${group.name}`} /><button className="group-main" type="button" aria-expanded={open} onClick={toggleGroup}><ProductImage group={group} /><span className="group-copy"><strong>{group.name}</strong><span>参考编码　{group.reference}　|　{group.category}　|　共 {group.totalSkuCount} 个 SKU</span></span></button><div className="group-summary">{group.enabledSkuCount} 个已启用</div><span /></div>
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
  return <div className="overlay drawer-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="detail-drawer" role="dialog" aria-modal="true" aria-label={`${sku.id} 商品详情`}><header><h2>SKU 详情</h2><IconButton label="关闭详情" onClick={onClose}><X /></IconButton></header><div className="detail-summary"><ProductImage group={group} /><div><h2>{group.name}</h2><button className="secondary-button edit-button" type="button" onClick={onEdit}><PencilSimple /> 编辑</button><dl><dt>品牌</dt><dd>{sku.brand || "-"}</dd><dt>SKU</dt><dd>{sku.id}</dd><dt>OE 号</dt><dd>{sku.oeNumbers?.join("、") || "-"}</dd><dt>状态</dt><dd><span className={`detail-status status-${sku.status}`} />{STATUS_LABELS[sku.status]}</dd></dl></div></div><nav className="detail-tabs" role="tablist">{["基本资料", "车型适配", "替代关系", "操作记录"].map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? "is-active" : ""} onClick={() => setTab(item)} type="button" key={item}>{item}</button>)}</nav>
    {tab === "基本资料" && <div className="detail-data-grid"><dl><dt>商品组参考编码</dt><dd>{group.reference}</dd><dt>配件品类</dt><dd>{group.category}</dd><dt>品牌件号</dt><dd>{sku.partNo}</dd><dt>包装</dt><dd>{sku.packQuantity}{sku.unit}/包装</dd><dt>销售价</dt><dd>¥{Number(sku.price).toFixed(2)}</dd><dt>内部备注</dt><dd>{sku.note || "-"}</dd><dt>最近更新</dt><dd>{new Date(sku.updatedAt).toLocaleString("zh-CN")}</dd></dl></div>}
    {tab === "车型适配" && <div className="fitment-panel">{sku.fitments?.length ? <div className="fitment-table"><div><b>车型</b><b>年款</b><b>配置条件</b><b>安装位置</b><b>核实状态</b><b>资料来源</b></div>{sku.fitments.map((item, index) => <div key={`${item.make}-${item.series}-${index}`}><span>{item.make} {item.series}</span><span>{item.yearFrom || "-"}–{item.yearTo || "-"}</span><span>{[item.variant, item.engine].filter(Boolean).join(" / ") || "-"}</span><span>{item.position || "-"}</span><span><em className={item.verificationStatus === "verified" ? "verified" : ""}>{VERIFY_LABELS[item.verificationStatus]}</em></span><span>{item.source || "-"}</span></div>)}</div> : <div className="detail-placeholder"><FileText /><h3>尚未维护车型适配</h3></div>}</div>}
    {tab === "替代关系" && <div className="relation-wrap"><SkuRelations sku={sku} /></div>}
    {tab === "操作记录" && <div className="activity-list">{activity.length ? activity.map((item) => <div key={item.id}><strong>{item.summary}</strong><small>{new Date(item.createdAt).toLocaleString("zh-CN")}</small></div>) : <div className="detail-placeholder"><FileText /><h3>暂无操作记录</h3></div>}</div>}
  </aside></div>;
}

const emptyFitment = () => ({ make: "", series: "", yearFrom: "", yearTo: "", variant: "", engine: "", position: "", source: "", verificationStatus: "pending", note: "" });

function EditDrawer({ selected, groups, onClose, onSaved, onDeleted }) {
  const editing = Boolean(selected?.sku);
  const initialSku = selected?.sku;
  const initialGroup = selected?.group || groups[0] || null;
  const [form, setForm] = useState({
    groupId: initialGroup?.id || "__new__",
    groupName: initialGroup?.name || "", groupReference: initialGroup?.reference || "", category: initialGroup?.category || "",
    id: initialSku?.id || "", brand: initialSku?.brand || "",
    partNo: initialSku?.partNo || "", unit: initialSku?.unit || "个", packQuantity: initialSku?.packQuantity || 1,
    price: initialSku?.price ?? "", status: initialSku?.status || "draft", note: initialSku?.note || "",
    oeNumbers: initialSku?.oeNumbers?.map(x => typeof x === "string" ? x : x.oeNo).join("\n") || "",
  });
  const [brands, setBrands] = useState([]);
  const [brandNew, setBrandNew] = useState(false);
  useEffect(() => { api("/brands").then((data) => setBrands(data.items)).catch(() => setBrands([])); }, []);
  const [fitments, setFitments] = useState(initialSku?.fitments || []);
  const [vehicle, setVehicle] = useState(null), [vehicleIndex, setVehicleIndex] = useState(-1);
  const [notice, setNotice] = useState("");
  const [leave, setLeave] = useState(false), [dirty, setDirty] = useState(false);
  const [next, setNext] = useState(false), [success, setSuccess] = useState(false);
  const [oeInput, setOeInput] = useState(""), [batch, setBatch] = useState(null);
  const [removeIndex, setRemoveIndex] = useState(null);
  const oeList = form.oeNumbers.split("\n").filter(Boolean);
  const keyOf = value => value.toUpperCase().replace(/[\s-]/g, "");
  const parseOE = text => { const seen = new Set(oeList.map(keyOf)); let duplicate = 0; const values = []; text.split(/[\n\r,，;；\t|]+/).map(x => x.trim()).filter(Boolean).forEach(x => { if (seen.has(keyOf(x))) duplicate++; else {seen.add(keyOf(x)); values.push(x);} }); return {values, duplicate}; };
  const appendOE = text => {const result = parseOE(text); set("oeNumbers", [...oeList, ...result.values].join("\n")); setNotice(`已添加 ${result.values.length} 个 OE 号，忽略 ${result.duplicate} 个重复项`); setOeInput("");};
  const close = () => dirty || vehicle || oeInput.trim() ? setLeave(true) : onClose();
  const draft = () => {localStorage.setItem("hsx-sku-workbench-draft", JSON.stringify({form: {...form, oeNumbers: [...oeList,...parseOE(oeInput).values].join("\n")}, fitments, vehicle, vehicleIndex})); setDirty(false); setNotice("草稿已暂存到本机，可随时恢复继续填写");};
  const saveVehicle = continuous => { if (!vehicle.make.trim() || !vehicle.series.trim()) {setNotice("请填写车型品牌和车系"); return;} if (vehicle.yearFrom && vehicle.yearTo && Number(vehicle.yearFrom)>Number(vehicle.yearTo)) {setNotice("结束年款不能早于起始年款"); return;} setFitments(current => vehicleIndex < 0 ? [...current, vehicle] : current.map((x,i)=>i===vehicleIndex?vehicle:x)); setDirty(true); setVehicle(continuous ? {...emptyFitment(), make:vehicle.make, series:vehicle.series} : null); setVehicleIndex(-1); setNotice(continuous ? "车型已保存，可继续添加下一款" : "车型适配已保存"); };
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const set = (key, value) => { setDirty(true); setErrors(current => ({...current, [key]: undefined})); setForm((current) => ({ ...current, [key]: value })); };
  const chooseGroup = (groupId) => {
    const group = groups.find((item) => item.id === groupId);
    setDirty(true);
    setErrors((current) => ({ ...current, groupName: undefined, groupReference: undefined, category: undefined, name: undefined, reference: undefined }));
    setForm((current) => ({
      ...current,
      groupId,
      groupName: group?.name || "",
      groupReference: group?.reference || "",
      category: group?.category || "",
    }));
  };
  const brandOptions = [...new Set([...brands, ...BRAND_PRESETS, form.brand].filter(Boolean))].sort((left, right) => left.localeCompare(right));
  const updateFitment = (index, key, value) => setFitments((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  const submit = async (event) => {
    event.preventDefault();
    const validation = {};
    ["id", "partNo", "price"].forEach(k => {if (!String(form[k]).trim()) validation[k] = "请填写此项";});
    ["groupName", "groupReference", "category"].forEach(k => {if (!String(form[k]).trim()) validation[k] = "请填写此项";});
    if (Number(form.packQuantity)<1) validation.packQuantity="数量至少为 1";
    if (Number(form.price)<0) validation.price="价格不能小于 0";
    if (!oeList.length) validation.oeNumbers="至少添加一个 OE 号";
    if (vehicle) validation.form="请先保存或取消正在编辑的车型";
    if (oeInput.trim()) validation.form="还有未添加的 OE 号，请先点击添加";
    if (Object.keys(validation).length) {setErrors(validation); setNotice("请检查必填信息"); return;}
    setSaving(true); setErrors({});
    const currentGroup = groups.find((group) => group.id === form.groupId);
    const groupChanged = form.groupId !== "__new__" && Boolean(currentGroup) && (
      currentGroup.name !== form.groupName.trim()
      || currentGroup.reference !== form.groupReference.trim().toUpperCase()
      || currentGroup.category !== form.category.trim()
    );
    if (groupChanged) {
      try {
        await api(`/groups/${encodeURIComponent(form.groupId)}`, { method: "PUT", body: JSON.stringify({ name: form.groupName, reference: form.groupReference, category: form.category }) });
      } catch (error) {
        setErrors({
          ...(error.details || {}),
          groupName: error.details?.name,
          groupReference: error.details?.reference || error.details?.groupReference,
          category: error.details?.category,
          form: Object.values(error.details || {}).join("；") || error.message,
        });
        setSaving(false);
        return;
      }
    }
    const payload = {
      group: form.groupId === "__new__" ? { name: form.groupName, reference: form.groupReference, category: form.category, image: "brake-pads.png" } : { id: form.groupId },
      sku: { id: form.id, brand: form.brand, partNo: form.partNo, unit: form.unit, packQuantity: Number(form.packQuantity), price: Number(form.price), status: form.status, note: form.note },
      oeNumbers: form.oeNumbers.split(/[\n,，]+/).map((item) => item.trim()).filter(Boolean),
      fitments,
    };
    try {
      const saved = await api(editing ? `/skus/${encodeURIComponent(initialSku.id)}` : "/skus", { method: editing ? "PUT" : "POST", body: JSON.stringify(payload) });
      localStorage.removeItem("hsx-sku-workbench-draft"); setDirty(false);
      if (editing) onSaved(saved); else {setSuccess(true); if(next) {setForm(current=>({...current,id:"",partNo:"",oeNumbers:"",note:""})); setFitments([]); setSuccess(false); setNotice("SKU 已创建，请填写下一个 SKU");}}
    } catch (error) {
      setErrors({...error.details, form: Object.values(error.details || {}).join("；") || error.message});
    } finally { setSaving(false); }
  };
  return <div className="overlay drawer-overlay"><aside className="edit-drawer sku-edit-drawer workbench" role="dialog" aria-modal="true" aria-label={editing ? "编辑 SKU" : "新增 SKU"}><header><h2>{editing ? `编辑 SKU · ${initialSku.id}` : "新增 SKU"}</h2><IconButton label="关闭编辑" onClick={close}><X /></IconButton></header><form onSubmit={submit} noValidate>
    {notice && <div className="wb-notice" role="status">{notice}<button type="button" onClick={()=>setNotice("")} aria-label="关闭提示"><X /></button></div>}
    {!editing && localStorage.getItem("hsx-sku-workbench-draft") && <button className="text-button" type="button" onClick={()=>{try {const data=JSON.parse(localStorage.getItem("hsx-sku-workbench-draft"));setForm(data.form);setFitments(data.fitments);setVehicle(data.vehicle || null);setVehicleIndex(data.vehicleIndex ?? -1);setNotice("已恢复本机草稿");} catch {setNotice("草稿无法读取");}}}>恢复上次暂存的草稿</button>}
    <div className="wb-columns"><div className="wb-main">
    {errors.form && <div className="form-error"><Prohibit weight="fill" />{errors.form}</div>}
    <section className="wb-product"><h3>基础商品信息</h3><label>商品组<select value={form.groupId} onChange={(event) => chooseGroup(event.target.value)}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name} · {group.reference}</option>)}<option value="__new__">＋ 新建商品组</option></select></label><div className="form-grid"><Field label="商品名称" value={form.groupName} onChange={(value) => set("groupName", value)} error={errors.groupName || errors.name} required /><Field label="参考编码" value={form.groupReference} onChange={(value) => set("groupReference", value)} error={errors.groupReference || errors.reference} required /><Field label="配件品类" value={form.category} onChange={(value) => set("category", value)} error={errors.category} required /></div></section>
    <section className="wb-sku"><h3>SKU 信息</h3><div className="form-grid"><Field label="SKU 编码" value={form.id} onChange={(value) => set("id", value)} error={errors.id} required disabled={editing} /><label className="wb-brand">品牌<span className="wb-brand-control"><select aria-label="品牌" value={brandNew ? "__new__" : form.brand} onChange={(event) => { const value = event.target.value; if (value === "__new__") { setBrandNew(true); set("brand", ""); } else { setBrandNew(false); set("brand", value); } }}><option value="">未选择</option>{brandOptions.map((brand) => <option key={brand} value={brand}>{brand}</option>)}<option value="__new__">＋ 新增品牌</option></select>{brandNew && <input aria-label="新品牌名称" value={form.brand} placeholder="输入品牌名称" onChange={(event) => set("brand", event.target.value)} />}</span></label><Field label="品牌件号" value={form.partNo} onChange={(value) => set("partNo", value)} error={errors.partNo} required /><label>基础单位<select value={form.unit} onChange={(event) => set("unit", event.target.value)}><option>个</option><option>件</option><option>套</option><option>盒</option></select></label><Field label="包装内含数量" type="number" min="1" value={form.packQuantity} onChange={(value) => set("packQuantity", value)} error={errors.packQuantity} required /><Field label="销售价（元）" type="number" min="0" step="0.01" value={form.price} onChange={(value) => set("price", value)} error={errors.price} required /><label>资料状态<select value={form.status} onChange={(event) => set("status", event.target.value)}><option value="draft">草稿</option><option value="enabled">启用</option><option value="disabled">停用</option></select></label></div><div className="wb-oe"><div className="section-title"><h3>OE 号 <span>{oeList.length || ""}</span></h3><button className="text-button" type="button" onClick={()=>setBatch("")}><UploadSimple/> 批量录入</button></div><div className="wb-oe-input"><input aria-label="输入 OE 号" placeholder="输入 OE 号，按 Enter 添加" value={oeInput} onChange={e=>setOeInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();appendOE(oeInput);}}} onPaste={e=>{const text=e.clipboardData.getData("text");if(/[\n,，;；\t|]/.test(text)){e.preventDefault();setBatch(text);}}}/><button className="secondary-button" type="button" disabled={!oeInput.trim()} onClick={()=>appendOE(oeInput)}>添加</button></div><p className="wb-help">保留原始格式与前导零；忽略大小写、空格和连字符去重。</p>{errors.oeNumbers && <p className="field-error">{errors.oeNumbers}</p>}<div className="wb-chips">{oeList.map((oe,i)=><span key={i}>{oe}<button type="button" aria-label={`移除 OE ${oe}`} onClick={()=>{set("oeNumbers",oeList.filter((_,j)=>j!==i).join("\n"));setNotice("OE 号已移除");}}><X/></button></span>)}</div></div><label className="wb-note">内部备注<textarea value={form.note} maxLength={500} onChange={(event) => set("note", event.target.value)} /><span className="char-count">{form.note.length}/500</span></label></section>
    </div><section className="wb-vehicles"><div className="section-title"><h3>车型适配</h3><button className="text-button" type="button" disabled={!!vehicle} onClick={()=>{setVehicle(emptyFitment());setVehicleIndex(-1);}}><Plus /> 添加车型</button></div>
    <p className="wb-fitment-count">已添加 {fitments.length} 个车型</p>{!fitments.length && !vehicle && <div className="wb-empty"><Car size={32}/><h4>添加适配车型</h4><p>按车型维护年款、配置与安装位置</p></div>}
    {fitments.map((item,index)=><article className="wb-fitment" key={index}><div className="section-title"><strong>{item.make} {item.series}</strong><div><button className="text-button" type="button" disabled={!!vehicle} onClick={()=>{setVehicle({...item});setVehicleIndex(index);}}><PencilSimple/> 编辑</button><button className="text-button" type="button" onClick={()=>setRemoveIndex(index)}><Trash/> 删除</button></div></div><p>{item.yearFrom || "不限"} — {item.yearTo || "不限"} · {item.variant || "全部版本"}</p><p>{item.engine || "全部配置"} · {item.position || "位置未填写"}</p><div className="section-title"><span>{item.source || "来源未填写"}</span><span>{VERIFY_LABELS[item.verificationStatus]}</span></div></article>)}
    {vehicle && <div className="wb-vehicle-editor"><h3>{vehicleIndex<0 ? "新增适配车型" : "编辑适配车型"}</h3><div className="form-grid">{[["make","品牌"],["series","车系"],["yearFrom","起始年款"],["yearTo","结束年款"],["variant","车型版本"],["engine","发动机/配置"],["position","安装位置"],["source","资料来源"]].map(([key,label])=><Field key={key} label={label} required={key==="make"||key==="series"} type={key.startsWith("year")?"number":"text"} value={vehicle[key] || ""} onChange={value=>setVehicle(x=>({...x,[key]:value}))}/>)}<label>核实状态<select value={vehicle.verificationStatus} onChange={e=>setVehicle(x=>({...x,verificationStatus:e.target.value}))}>{Object.entries(VERIFY_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></div><div className="wb-actions"><button type="button" className="text-button" onClick={()=>setVehicle(null)}>取消编辑</button><button type="button" className="secondary-button" onClick={()=>saveVehicle(true)}>保存并继续添加</button><button type="button" className="primary-button" onClick={()=>saveVehicle(false)}>保存车型</button></div></div>}
    </section></div>
    {editing && initialSku.status === "draft" && <div className="draft-delete-row">{confirmingDelete ? <><span>草稿删除后不能恢复。</span><button className="danger-button" type="button" onClick={async () => { setSaving(true); try { await api(`/skus/${encodeURIComponent(initialSku.id)}`, { method: "DELETE" }); onDeleted(); } catch (error) { setErrors({ form: error.message }); setSaving(false); } }}>确认删除草稿</button><button className="secondary-button" type="button" onClick={() => setConfirmingDelete(false)}>取消</button></> : <button className="danger-text-button" type="button" onClick={() => setConfirmingDelete(true)}><Trash /> 删除草稿</button>}</div>}
    <footer><label className="wb-next"><input type="checkbox" checked={next} onChange={e=>setNext(e.target.checked)}/>创建后继续新增</label><button className="secondary-button" type="button" onClick={close}>取消</button><button className="secondary-button" type="button" onClick={draft}>暂存草稿</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "保存中…" : editing ? "保存更改" : "创建 SKU"}</button></footer>
  </form></aside>
  {batch !== null && <div className="wb-modal-shade"><div className="wb-modal" role="dialog" aria-label="批量录入 OE 号"><div className="section-title"><h2>批量录入 OE 号</h2><IconButton label="关闭批量录入" onClick={()=>setBatch(null)}><X/></IconButton></div><p>每行一个，或用逗号、分号、Tab 分隔。空格不会拆分编号。</p><textarea aria-label="批量 OE 内容" placeholder={"34 11 6 874 930\n34 11 6 888 895"} value={batch} onChange={e=>setBatch(e.target.value)}/><div className="wb-preview"><strong>解析预览 · 新增 {parseOE(batch).values.length} 个 · 重复 {parseOE(batch).duplicate} 个</strong><div className="wb-chips">{parseOE(batch).values.map(x=><span key={x}>{x}</span>)}</div></div><div className="wb-actions"><button className="secondary-button" type="button" onClick={()=>setBatch(null)}>取消</button><button className="primary-button" type="button" disabled={!parseOE(batch).values.length} onClick={()=>{appendOE(batch);setBatch(null);}}>确认添加 {parseOE(batch).values.length} 个</button></div></div></div>}
  {(leave || removeIndex!==null || success) && <div className="wb-modal-shade"><div className="wb-modal wb-small" role="dialog" aria-label={success?"创建成功":leave?"未保存提醒":"删除车型"}><h2>{success?"SKU 创建成功":leave?"有尚未保存的内容":"删除此适配车型？"}</h2><p>{success?"商品资料已保存，可以在商品库中查看。":leave?"可以暂存草稿后离开，下次继续填写。":"删除后可重新添加，其他车型不受影响。"}</p><div className="wb-actions">{success?<><button type="button" className="secondary-button" onClick={()=>onSaved()}>返回商品库</button><button type="button" className="primary-button" onClick={()=>{setSuccess(false);setForm(x=>({...x,id:"",partNo:"",oeNumbers:"",note:""}));setFitments([]);}}>继续新增</button></>:leave?<><button type="button" className="text-button" onClick={onClose}>放弃修改</button><button type="button" className="secondary-button" onClick={()=>setLeave(false)}>继续编辑</button><button type="button" className="primary-button" onClick={()=>{draft();onClose();}}>暂存并离开</button></>:<><button type="button" className="secondary-button" onClick={()=>setRemoveIndex(null)}>保留</button><button type="button" className="primary-button" onClick={()=>{setFitments(x=>x.filter((_,i)=>i!==removeIndex));setRemoveIndex(null);setDirty(true);setNotice("车型适配已删除");}}>确认删除</button></>}</div></div></div>}
  </div>;
}

function Field({ label, value, onChange, error, required = false, ...props }) {
  return <label className={required ? "required" : ""}>{label}<input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className={error ? "is-invalid" : ""} {...props} />{error && <small className="field-error">{error}</small>}</label>;
}

function BatchModal({ items, onClose, onConfirm }) {
  const [status, setStatus] = useState("disabled");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const groupCount = new Set(items.map((item) => item.group.id)).size;
  return <div className="overlay modal-overlay"><div className="batch-modal" role="dialog" aria-modal="true"><header><div><h2>批量设置资料状态</h2><p>{items.length} 个 SKU，来自 {groupCount} 个商品组</p></div><IconButton label="关闭" onClick={onClose}><X /></IconButton></header><label>目标状态<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="enabled">启用</option><option value="disabled">停用</option><option value="draft">转为草稿</option></select></label><label>变更原因<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={200} /><span className="char-count">{reason.length}/200</span></label><div className="batch-list">{items.map(({ sku, group }) => <div key={sku.id}><ProductImage group={group} small /><span><strong>{sku.id}</strong><small>{group.name} · 当前{STATUS_LABELS[sku.status]}</small></span></div>)}</div><footer><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="button" disabled={!reason.trim() || saving} onClick={async () => { setSaving(true); await onConfirm(status, reason); setSaving(false); }}>{saving ? "处理中..." : "确认修改"}</button></footer></div></div>;
}

function ImportModal({ groups, onClose, onImported }) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [mode, setMode] = useState("upsert");
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const previewFile = async (file) => {
    setFileName(file?.name || ""); setPreview(null); setError("");
    if (!file) return;
    try {
      const payloads = csvToPayloads(await file.text(), groups);
      setRows(payloads);
      setPreview(await api("/import/preview", { method: "POST", body: JSON.stringify({ rows: payloads, mode }) }));
    } catch (loadError) { setRows([]); setError(loadError.message); }
  };
  const refreshPreview = async (nextMode) => {
    setMode(nextMode); setError("");
    if (!rows.length) return;
    try { setPreview(await api("/import/preview", { method: "POST", body: JSON.stringify({ rows, mode: nextMode }) })); }
    catch (previewError) { setError(previewError.message); }
  };
  const template = [CSV_HEADERS, ["DEMO-AF01", "空气滤清器", "滤清器", "DEMO-AF01-001", "MANN", "C 27009", "个", "1", "89", "草稿", "17801-0T020", "丰田", "卡罗拉", "2019", "2023", "", "2ZR", "发动机", "供应商目录", "待核实", ""]];
  return <div className="overlay modal-overlay"><div className="batch-modal import-modal" role="dialog" aria-modal="true" aria-label="批量导入 SKU"><header><div><h2>批量导入 SKU</h2><p>先预览校验，整批无错误后才能写入</p></div><IconButton label="关闭" onClick={onClose}><X /></IconButton></header>
    <div className="import-toolbar"><button className="secondary-button" type="button" onClick={() => downloadCsv("SKU导入模板.csv", template)}><DownloadSimple /> 下载模板</button><label className="primary-button file-button"><UploadSimple /> 选择 CSV<input type="file" accept=".csv,text/csv" onChange={(event) => previewFile(event.target.files?.[0])} /></label></div>
    {fileName && <p className="selected-file"><FileText />{fileName}</p>}
    <label>导入方式<select value={mode} onChange={(event) => refreshPreview(event.target.value)}><option value="upsert">新增并更新已有 SKU</option><option value="insert">只新增，重复 SKU 报错</option></select></label>
    {error && <div className="form-error"><Prohibit weight="fill" />{error}</div>}
    {preview && <div className="import-preview"><div><strong>{preview.total}</strong><span>SKU 总数</span></div><div><strong>{preview.valid}</strong><span>校验通过</span></div><div className={preview.errors.length ? "has-error" : ""}><strong>{preview.errors.length}</strong><span>错误</span></div></div>}
    {preview?.errors?.length > 0 && <div className="import-errors">{preview.errors.slice(0, 20).map((item) => <div key={`${item.row}-${item.id}`}><b>第 {item.row} 行 {item.id}</b><span>{item.message} · {Object.values(item.details).join("、")}</span></div>)}</div>}
    <footer><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="button" disabled={!preview || preview.errors.length > 0 || saving} onClick={async () => { setSaving(true); setError(""); try { const result = await api("/import", { method: "POST", body: JSON.stringify({ rows, mode }) }); onImported(result); } catch (saveError) { setError(saveError.message); setSaving(false); } }}>{saving ? "导入中..." : `确认导入 ${preview?.valid || 0} 个 SKU`}</button></footer>
  </div></div>;
}

function BottomBar({ selectedItems, page, totalPages, pageSize, onPage, onBatch, onClear, onExport }) {
  return <footer className="bottom-bar"><div className="selection-summary">{selectedItems.length ? `已选 ${selectedItems.length} 个 SKU` : "未选择 SKU"}</div><div className="bottom-actions"><button className="secondary-button" type="button" onClick={onExport}><DownloadSimple />{selectedItems.length ? "导出所选" : "导出全部"}</button><button className="secondary-button" type="button" onClick={onBatch} disabled={!selectedItems.length}>设置状态</button><button className="secondary-button" type="button" onClick={onClear} disabled={!selectedItems.length}>清除选择</button></div><div className="pagination"><span>每页 {pageSize} 组</span><button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}><CaretLeft /></button><strong>{page} / {totalPages}</strong><button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}><CaretRight /></button></div></footer>;
}

export function App() {
  const [view, setView] = useState("sku");
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
  const [importOpen, setImportOpen] = useState(false);
  const [toast, setToast] = useState("");
  const requestId = useRef(0);
  const lastFilterKey = useRef(null);

  const load = async ({ quiet = false } = {}) => {
    const id = ++requestId.current;
    if (!quiet) setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ search, category, status, page: String(page), pageSize: "20" });
      const [data, allGroups] = await Promise.all([api(`/catalog?${params}`), api("/groups")]);
      if (id !== requestId.current) return;
      setCatalog(data); setGroups(allGroups.items);
      const filterKey = `${search.trim()}|${category}|${status}`;
      const filtered = filterKey !== "||";
      const filterChanged = lastFilterKey.current !== filterKey;
      lastFilterKey.current = filterKey;
      setExpanded((current) => {
        if (filtered) return new Set(data.groups.map((group) => group.id));
        return filterChanged ? new Set() : current;
      });
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

  return <div className={`app-shell ${view === "sku" ? "" : "is-vehicle"}`}><AppHeader view={view} onView={setView} />{view === "vehicles" ? <VehicleAdmin onToast={setToast} /> : view === "vehicle" ? <VehicleLookup onView={setView} /> : <main className="workspace"><div className="page-title-row"><div><h1>SKU商品库</h1><nav className="status-tabs" role="tablist">{tabs.map(([value, label]) => <button role="tab" aria-selected={status === value} className={status === value ? "is-active" : ""} type="button" key={value} onClick={() => setStatus(value)}>{label}</button>)}</nav></div><div className="page-actions"><button className="secondary-button" type="button" onClick={() => setImportOpen(true)}><UploadSimple /> 批量导入</button><button className="primary-button" type="button" onClick={() => setEdit({})}><Plus /> 新增SKU</button><IconButton label="刷新商品" onClick={() => load({ quiet: true })}><ArrowClockwise /></IconButton></div></div><FilterBar search={search} setSearch={setSearch} category={category} setCategory={setCategory} categories={catalog.categories} /><div className="content-area">{loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => load()} /> : catalog.groups.length ? <ProductTable groups={catalog.groups} expanded={expanded} setExpanded={setExpanded} selected={selected} setSelected={setSelected} onDetail={(sku, group) => setDetail({ sku, group })} onEdit={(sku, group) => setEdit({ sku, group })} /> : <EmptyState filtered={Boolean(search || category || status)} onClear={() => { setSearch(""); setCategory(""); setStatus(""); }} onAdd={() => setEdit({})} onImport={() => setImportOpen(true)} />}</div></main>}{view === "sku" && <BottomBar selectedItems={selectedItems} page={catalog.pagination.page} totalPages={catalog.pagination.totalPages} pageSize={catalog.pagination.pageSize} onPage={setPage} onBatch={() => setBatchOpen(true)} onClear={() => setSelected(new Set())} onExport={async () => { try { const data = await api("/export"); const ids = new Set(selectedItems.map(({ sku }) => sku.id)); const items = ids.size ? data.items.filter((item) => ids.has(item.id)) : data.items; downloadCsv(`SKU资料-${new Date().toISOString().slice(0, 10)}.csv`, exportRows(items)); setToast(`已导出 ${items.length} 个 SKU`); } catch (exportError) { setToast(exportError.message); } }} />}
    {detail && <DetailDrawer selected={detail} onClose={() => setDetail(null)} onEdit={() => { setEdit(detail); setDetail(null); }} />}
    {edit && <EditDrawer selected={edit} groups={groups} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); setToast(edit.sku ? "SKU 资料已更新" : "SKU 已创建"); load({ quiet: true }); }} onDeleted={() => { setEdit(null); setToast("草稿 SKU 已删除"); load({ quiet: true }); }} />}
    {batchOpen && <BatchModal items={selectedItems} onClose={() => setBatchOpen(false)} onConfirm={async (nextStatus, reason) => { await Promise.all(selectedItems.map(({ sku }) => api(`/skus/${encodeURIComponent(sku.id)}/status`, { method: "PATCH", body: JSON.stringify({ status: nextStatus, reason }) }))); setBatchOpen(false); setSelected(new Set()); setToast(`已更新 ${selectedItems.length} 个 SKU`); load({ quiet: true }); }} />}
    {importOpen && <ImportModal groups={groups} onClose={() => setImportOpen(false)} onImported={(result) => { setImportOpen(false); setToast(`已导入 ${result.valid} 个 SKU`); load({ quiet: true }); }} />}
    {toast && <div className="toast" role="status"><CheckCircle weight="fill" /><span><strong>操作成功</strong><small>{toast}</small></span><button type="button" aria-label="关闭提示" onClick={() => setToast("")}><X /></button></div>}
  </div>;
}
