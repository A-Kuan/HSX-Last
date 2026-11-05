import { useEffect, useMemo, useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { api } from "../api.js";

const TABS = [
  { key: "categories", label: "配件品类", path: "categories", noun: "品类" },
  { key: "partTypes", label: "件类", path: "part-types", noun: "件类" },
  { key: "partSets", label: "套餐", path: "part-sets", noun: "套餐" },
  { key: "brands", label: "品牌", path: "brands", noun: "品牌" },
  { key: "units", label: "单位", path: "units", noun: "单位" },
];

const emptyEditor = () => ({ mode: "create", id: "", name: "", system: "", note: "", partTypeIds: [] });

export function DictionaryAdmin({ onToast }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("categories");
  const [editor, setEditor] = useState(null);
  const [confirming, setConfirming] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setData(await api("/dictionaries"));
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const active = TABS.find((item) => item.key === tab);
  const items = data?.[tab] || [];
  const partTypeNames = useMemo(() => new Map((data?.partTypes || []).map((item) => [item.id, item.name])), [data]);

  const switchTab = (key) => {
    setTab(key);
    setEditor(null);
    setConfirming("");
    setError("");
  };

  const metaOf = (item) => {
    if (tab === "partTypes") {
      return [item.system, item.usageCount ? `${item.usageCount} 处引用` : ""].filter(Boolean).join(" · ");
    }
    if (tab === "partSets") {
      return (item.partTypeIds || []).map((id) => partTypeNames.get(id) || id).join(" / ");
    }
    return item.usageCount ? `${item.usageCount} 条资料` : "";
  };

  const startEdit = (item) => {
    setError("");
    setConfirming("");
    setEditor({
      mode: "edit",
      id: item.id || item.name,
      name: item.name,
      system: item.system || "",
      note: item.note || "",
      partTypeIds: item.partTypeIds || [],
    });
  };

  const save = async () => {
    if (!editor) return;
    setSaving(true);
    setError("");
    const body = tab === "partTypes"
      ? { name: editor.name, system: editor.system }
      : tab === "partSets"
        ? { name: editor.name, note: editor.note, partTypeIds: editor.partTypeIds }
        : { name: editor.name };
    try {
      if (editor.mode === "create") {
        await api(`/dictionaries/${active.path}`, { method: "POST", body: JSON.stringify(body) });
      } else {
        await api(`/dictionaries/${active.path}/${encodeURIComponent(editor.id)}`, { method: "PUT", body: JSON.stringify(body) });
      }
      setEditor(null);
      await load();
      onToast?.(editor.mode === "create" ? `${active.noun}已新增` : `${active.noun}已更新`);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    setError("");
    try {
      await api(`/dictionaries/${active.path}/${encodeURIComponent(item.id || item.name)}`, { method: "DELETE" });
      setConfirming("");
      await load();
      onToast?.(`${active.noun}已删除`);
    } catch (removeError) {
      setError(removeError.message);
    }
  };

  const togglePartType = (id) => {
    setEditor((current) => current && ({
      ...current,
      partTypeIds: current.partTypeIds.includes(id)
        ? current.partTypeIds.filter((item) => item !== id)
        : [...current.partTypeIds, id],
    }));
  };

  return <div className="workspace dict-workspace">
    <div className="page-title-row">
      <div>
        <h1>配置中心</h1>
        <nav className="status-tabs" role="tablist">
          {TABS.map((item) => <button key={item.key} role="tab" type="button" aria-selected={tab === item.key} className={tab === item.key ? "is-active" : ""} onClick={() => switchTab(item.key)}>{item.label}</button>)}
        </nav>
      </div>
      <div className="page-actions">
        <button className="primary-button" type="button" onClick={() => { setError(""); setConfirming(""); setEditor(emptyEditor()); }}><Plus /> 新增{active.noun}</button>
      </div>
    </div>
    <div className="content-area">
      {error ? <p className="dict-error">{error}</p> : null}
      <div className="dict-panel">
        {editor ? <div className="dict-editor">
          <div className="dict-editor-fields">
            <input autoFocus value={editor.name} placeholder="名称" aria-label="名称" onChange={(event) => setEditor({ ...editor, name: event.target.value })} />
            {tab === "partTypes" ? <input value={editor.system} placeholder="系统" aria-label="系统" onChange={(event) => setEditor({ ...editor, system: event.target.value })} /> : null}
            {tab === "partSets" ? <input value={editor.note} placeholder="备注" aria-label="备注" onChange={(event) => setEditor({ ...editor, note: event.target.value })} /> : null}
          </div>
          {tab === "partSets" ? <div className="dict-checks">
            {(data?.partTypes || []).map((partType) => <label key={partType.id} className="dict-check">
              <input type="checkbox" checked={editor.partTypeIds.includes(partType.id)} onChange={() => togglePartType(partType.id)} />
              {partType.name}
            </label>)}
          </div> : null}
          <div className="dict-editor-actions">
            <button className="secondary-button" type="button" onClick={() => { setEditor(null); setError(""); }}>取消</button>
            <button className="primary-button" type="button" disabled={saving || !editor.name.trim()} onClick={save}>{saving ? "保存中..." : "保存"}</button>
          </div>
        </div> : null}
        {loading ? null : items.map((item) => {
          const key = item.id || item.name;
          return <div className={`dict-row${confirming === key ? " is-confirming" : ""}`} key={key}>
            <div className="dict-main">
              <strong>{item.name}</strong>
              {metaOf(item) ? <small>{metaOf(item)}</small> : null}
            </div>
            <div className="dict-actions">
              {confirming === key ? <>
                <button className="text-button is-danger" type="button" onClick={() => remove(item)}>删除</button>
                <button className="text-button" type="button" onClick={() => setConfirming("")}>取消</button>
              </> : <>
                <button className="text-button" type="button" onClick={() => startEdit(item)}>编辑</button>
                <button className="text-button" type="button" onClick={() => { setError(""); setConfirming(key); }}>删除</button>
              </>}
            </div>
          </div>;
        })}
      </div>
    </div>
  </div>;
}
