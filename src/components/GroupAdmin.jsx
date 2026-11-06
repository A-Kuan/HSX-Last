import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import { api } from "../api.js";
import { SearchSelect } from "./SearchSelect.jsx";

const emptyEditor = () => ({ mode: "create", id: "", name: "", reference: "", category: "", position: "", note: "", oeItems: [], primaryOe: "" });

export function GroupAdmin({ onToast }) {
  const [groups, setGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editor, setEditor] = useState(null);
  const [oeInput, setOeInput] = useState("");
  const [oeDate, setOeDate] = useState("");
  const [merge, setMerge] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("");

  const load = async () => {
    try {
      const [groupData, dictionary] = await Promise.all([api("/groups"), api("/dictionaries")]);
      setGroups(groupData.items);
      setCategories(dictionary.categories || []);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const categoryOptions = useMemo(() => categories.map((item) => ({ value: item.name, label: item.name })), [categories]);
  const groupOptions = useMemo(() => groups.map((group) => ({ value: group.id, label: group.name, meta: group.reference })), [groups]);
  const filtered = useMemo(() => {
    const keyword = term.trim().toLowerCase();
    const compact = keyword.replace(/[^a-z0-9]/g, "");
    return groups.filter((group) => {
      if (category && group.category !== category) return false;
      if (!keyword) return true;
      const haystack = `${group.name} ${group.reference} ${group.category} ${group.position} ${group.note} ${(group.oeNumbers || []).join(" ")}`.toLowerCase();
      if (haystack.includes(keyword)) return true;
      return Boolean(compact) && (group.oeNumbers || []).some((oe) => oe.toUpperCase().replace(/[^A-Z0-9]/g, "").toLowerCase().includes(compact));
    });
  }, [groups, term, category]);

  const startCreate = () => { setError(""); setRemoving(null); setOeInput(""); setEditor(emptyEditor()); };
  const startEdit = (group) => {
    setError(""); setRemoving(null); setOeInput("");
    setEditor({
      mode: "edit", id: group.id, name: group.name, reference: group.reference, category: group.category,
      position: group.position || "", note: group.note || "",
      oeItems: (group.oeItems || (group.oeNumbers || []).map((oe) => ({ oeNo: oe, breakpointDate: "" }))).map((item) => ({ ...item })),
      primaryOe: group.primaryOe || (group.oeNumbers || [])[0] || "",
    });
  };

  const oeKey = (value) => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const dateValue = (value) => Number(String(value || "").replace(/[^0-9]/g, "")) || 0;
  const formatDate = (value) => {
    const digits = String(value || "").replace(/[^0-9]/g, "");
    if (!digits) return "";
    if (digits === "99999999") return "现行";
    return digits.length >= 8 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}` : digits;
  };
  const sortOeItems = (items, primary) => [...items].sort((left, right) => {
    const leftPrimary = oeKey(left.oeNo) === oeKey(primary) ? 1 : 0;
    const rightPrimary = oeKey(right.oeNo) === oeKey(primary) ? 1 : 0;
    if (leftPrimary !== rightPrimary) return rightPrimary - leftPrimary;
    return dateValue(right.breakpointDate) - dateValue(left.breakpointDate) || left.oeNo.localeCompare(right.oeNo);
  });
  const addOe = () => {
    const value = oeInput.trim();
    if (!value) return;
    const key = oeKey(value);
    setEditor((current) => {
      if (!current) return current;
      const exists = current.oeItems.some((item) => oeKey(item.oeNo) === key);
      const oeItems = exists ? current.oeItems : [...current.oeItems, { oeNo: value, breakpointDate: oeDate }];
      return { ...current, oeItems, primaryOe: current.primaryOe || value };
    });
    setOeInput("");
    setOeDate("");
  };
  const removeOe = (target) => setEditor((current) => {
    if (!current) return current;
    const oeItems = current.oeItems.filter((item) => oeKey(item.oeNo) !== oeKey(target));
    const primaryOe = oeKey(current.primaryOe) === oeKey(target) ? (oeItems[0]?.oeNo || "") : current.primaryOe;
    return { ...current, oeItems, primaryOe };
  });

  const save = async () => {
    if (!editor) return;
    setSaving(true); setError("");
    const body = { name: editor.name, reference: editor.reference, category: editor.category, position: editor.position, note: editor.note, oeNumbers: editor.oeItems, primaryOe: editor.primaryOe };
    try {
      if (editor.mode === "create") await api("/groups", { method: "POST", body: JSON.stringify(body) });
      else await api(`/groups/${encodeURIComponent(editor.id)}`, { method: "PUT", body: JSON.stringify(body) });
      setEditor(null);
      await load();
      onToast?.(editor.mode === "create" ? "商品组已新增" : "商品组已更新");
    } catch (saveError) {
      setError(saveError.message);
    } finally { setSaving(false); }
  };

  const remove = async (group) => {
    setError("");
    try {
      await api(`/groups/${encodeURIComponent(group.id)}?force=1`, { method: "DELETE" });
      setRemoving(null); await load(); onToast?.(`商品组「${group.name}」已删除`);
    } catch (removeError) { setError(removeError.message); setRemoving(null); }
  };

  const openMerge = () => { setError(""); setRemoving(null); setMerge({ sourceId: "", targetId: "", preview: null, error: "" }); };

  const runPreview = async () => {
    if (!merge?.sourceId || !merge?.targetId) return;
    try {
      const preview = await api("/groups/merge/preview", { method: "POST", body: JSON.stringify({ sourceId: merge.sourceId, targetId: merge.targetId }) });
      setMerge({ ...merge, preview, error: "" });
    } catch (previewError) {
      setMerge({ ...merge, preview: null, error: previewError.message });
    }
  };

  const runMerge = async () => {
    if (!merge?.sourceId || !merge?.targetId || !merge.preview?.canMerge) return;
    try {
      const result = await api("/groups/merge", { method: "POST", body: JSON.stringify({ sourceId: merge.sourceId, targetId: merge.targetId }) });
      setMerge(null);
      await load();
      onToast?.(`已并入「${result.name}」`);
    } catch (mergeError) {
      setMerge({ ...merge, error: mergeError.message });
    }
  };

  const usable = editor && editor.name.trim() && editor.reference.trim() && editor.category.trim();

  return <div className="workspace dict-workspace">
    <div className="page-title-row">
      <div><h1>商品组</h1></div>
      <div className="page-actions">
        <button className="secondary-button" type="button" onClick={openMerge}>合并商品组</button>
        <button className="primary-button" type="button" onClick={startCreate}><Plus /> 新增商品组</button>
      </div>
    </div>
    <div className="filter-area"><div className="filter-row">
      <label className="local-search"><MagnifyingGlass /><input value={term} aria-label="筛选商品组" placeholder="搜索名称、参考编码、品类或 OE 号" onChange={(event) => setTerm(event.target.value)} /></label>
      <div className="select-filter"><SearchSelect value={category} onChange={setCategory} options={[{ value: "", label: "全部品类" }, ...categoryOptions]} ariaLabel="按品类筛选" /></div>
    </div></div>
    <div className="content-area">
      {error ? <p className="dict-error">{error}</p> : null}
      <div className="dict-panel">
        {editor ? <div className="dict-editor">
          <div className="dict-editor-fields">
            <input autoFocus value={editor.name} placeholder="商品组名称" aria-label="商品组名称" onChange={(event) => setEditor({ ...editor, name: event.target.value })} />
            <input value={editor.reference} placeholder="参考编码" aria-label="参考编码" onChange={(event) => setEditor({ ...editor, reference: event.target.value })} />
            <SearchSelect value={editor.category} onChange={(value) => setEditor({ ...editor, category: value })} options={categoryOptions} placeholder="选择品类" ariaLabel="配件品类" />
            <input value={editor.position} placeholder="安装位置（左/右/前/后）" aria-label="安装位置" onChange={(event) => setEditor({ ...editor, position: event.target.value })} />
            <input value={editor.note} placeholder="说明" aria-label="说明" onChange={(event) => setEditor({ ...editor, note: event.target.value })} />
          </div>
          <div className="group-oe">
            <div className="group-oe-input">
              <input value={oeInput} placeholder="录入 OE 号，按 Enter 添加" aria-label="录入 OE 号" onChange={(event) => setOeInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addOe(); } }} />
              <input className="group-oe-date" value={oeDate} placeholder="断点日期 YYYYMMDD（可空）" aria-label="断点日期" onChange={(event) => setOeDate(event.target.value.replace(/[^0-9-]/g, ""))} />
              <button className="secondary-button" type="button" disabled={!oeInput.trim()} onClick={addOe}>添加</button>
            </div>
            {editor.oeItems.length > 0 && <div className="group-oe-chips">{sortOeItems(editor.oeItems, editor.primaryOe).map((item) => { const isPrimary = oeKey(editor.primaryOe) === oeKey(item.oeNo); return <span key={item.oeNo} className={isPrimary ? "is-primary" : ""}>{isPrimary ? <em>主</em> : null}{item.oeNo}{formatDate(item.breakpointDate) ? <small className="oe-year">{formatDate(item.breakpointDate)}</small> : null}{!isPrimary && <button type="button" className="group-oe-primary" title="设为主号" aria-label={`设为主号 ${item.oeNo}`} onClick={() => setEditor({ ...editor, primaryOe: item.oeNo })}>★</button>}<button type="button" aria-label={`移除 OE ${item.oeNo}`} onClick={() => removeOe(item.oeNo)}><X /></button></span>; })}</div>}
          </div>
          <div className="dict-editor-actions">
            <button className="secondary-button" type="button" onClick={() => { setEditor(null); setError(""); }}>取消</button>
            <button className="primary-button" type="button" disabled={saving || !usable} onClick={save}>{saving ? "保存中..." : "保存"}</button>
          </div>
        </div> : null}
        {loading ? null : filtered.map((group) => <div className="dict-row" key={group.id}>
          <div className="dict-main">
            <strong>{group.name}</strong>
            <small>{[group.reference, group.category, group.position, `${group.skuCount} 个 SKU`, group.vehicleCount ? `${group.vehicleCount} 台车型` : "", group.oeNumbers.length ? (group.oeNumbers.length > 1 ? `OE ${group.primaryOe} 等 ${group.oeNumbers.length} 个` : `OE ${group.primaryOe}`) : ""].filter(Boolean).join(" · ")}</small>
          </div>
          <div className="dict-actions">
            <button className="text-button" type="button" onClick={() => startEdit(group)}>编辑</button>
            <button className="text-button" type="button" onClick={() => { setError(""); setRemoving(group); }}>删除</button>
          </div>
        </div>)}
      </div>
    </div>
    {removing ? <div className="overlay modal-overlay"><div className="batch-modal" role="dialog" aria-modal="true" aria-label="删除商品组">
      <header><div><h2>删除商品组</h2><p>{removing.name} · {removing.reference}</p></div><button className="text-button" type="button" aria-label="关闭" onClick={() => setRemoving(null)}><X /></button></header>
      <ul className="group-delete-impact">
        {removing.skuCount > 0 ? <li>{removing.skuCount} 个 SKU 将一并删除（含其 OE 号、车型适配与替代关系）</li> : null}
        {removing.vehicleCount > 0 ? <li>{removing.vehicleCount} 台车型的适配件映射将解除</li> : null}
        {!removing.skuCount && !removing.vehicleCount ? <li>该商品组下没有关联数据</li> : null}
        <li>操作不可撤销</li>
      </ul>
      <footer>
        <button className="secondary-button" type="button" onClick={() => setRemoving(null)}>取消</button>
        <button className="danger-button" type="button" onClick={() => remove(removing)}>确认删除</button>
      </footer>
    </div></div> : null}    {merge ? <div className="overlay modal-overlay"><div className="batch-modal group-merge" role="dialog" aria-modal="true" aria-label="合并商品组">
      <header><div><h2>合并商品组</h2></div><button className="text-button" type="button" aria-label="关闭" onClick={() => setMerge(null)}><X /></button></header>
      <div className="group-merge-fields">
        <div><small>并入方</small><SearchSelect value={merge.sourceId} onChange={(value) => setMerge({ ...merge, sourceId: value, preview: null })} options={groupOptions.filter((option) => option.value !== merge.targetId)} placeholder="选择要并掉的组" ariaLabel="并入方" searchable /></div>
        <div><small>保留方</small><SearchSelect value={merge.targetId} onChange={(value) => setMerge({ ...merge, targetId: value, preview: null })} options={groupOptions.filter((option) => option.value !== merge.sourceId)} placeholder="选择保留的组" ariaLabel="保留方" searchable /></div>
      </div>
      {merge.error ? <p className="dict-error">{merge.error}</p> : null}
      {merge.preview ? <div className="group-merge-preview">
        <div><span>移动 SKU</span><strong>{merge.preview.skuCount}</strong></div>
        <div><span>车型映射</span><strong>{merge.preview.vehicleLinks}</strong></div>
        <div><span>重复映射</span><strong>{merge.preview.duplicateLinks}</strong></div>
        <div><span>OE 重叠 / 合并后</span><strong>{merge.preview.oeOverlap} / {merge.preview.oeUnionCount}</strong></div>
        {merge.preview.positionMismatch ? <p className="dict-error">位置不同（{merge.preview.source.position} / {merge.preview.target.position}），不能合并</p> : null}
      </div> : null}
      <footer>
        <button className="secondary-button" type="button" onClick={() => setMerge(null)}>取消</button>
        <button className="secondary-button" type="button" disabled={!merge.sourceId || !merge.targetId} onClick={runPreview}>预览影响</button>
        <button className="primary-button" type="button" disabled={!merge.preview?.canMerge} onClick={runMerge}>确认合并</button>
      </footer>
    </div></div> : null}
  </div>;
}
