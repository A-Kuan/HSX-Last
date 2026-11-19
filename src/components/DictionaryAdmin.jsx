import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "@phosphor-icons/react";
import { api } from "../api.js";
import { SearchSelect } from "./SearchSelect.jsx";

const TABS = [
  { key: "categories", label: "配件品类", path: "categories", noun: "品类" },
  { key: "partTypes", label: "件类", path: "part-types", noun: "件类" },
  { key: "partSets", label: "套餐", path: "part-sets", noun: "套餐" },
  { key: "brands", label: "品牌", path: "brands", noun: "品牌" },
  { key: "oemBrands", label: "整车品牌", path: "oem-brands", noun: "整车品牌" },
  { key: "units", label: "单位", path: "units", noun: "单位" },
  { key: "origins", label: "产地", path: "origins", noun: "产地" },
  { key: "channels", label: "渠道", path: "channels", noun: "渠道" },
];

const emptyEditor = () => ({
  mode: "create",
  id: "",
  name: "",
  prefix: "",
  system: "",
  note: "",
  alias: "",
  enabled: true,
  partTypeIds: [],
});

export function DictionaryAdmin({ onToast, initialTab = "categories" }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState(initialTab);
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

  const active = TABS.find((item) => item.key === tab) || TABS[0];
  const items = data?.[tab] || [];
  const partTypeNames = useMemo(() => new Map((data?.partTypes || []).map((item) => [item.id, item.name])), [data]);

  const switchTab = (key) => {
    setTab(key);
    setEditor(null);
    setConfirming("");
    setError("");
  };

  const openCreate = () => {
    setError("");
    setConfirming("");
    setEditor(emptyEditor());
  };

  const closeEditor = () => {
    setEditor(null);
    setError("");
  };

  const metaOf = (item) => {
    if (tab === "categories") {
      return [item.prefix ? `前缀 ${item.prefix}` : "", item.usageCount ? `${item.usageCount} 条资料` : ""].filter(Boolean).join(" · ");
    }
    if (tab === "partTypes") {
      return [item.system, item.usageCount ? `${item.usageCount} 处引用` : ""].filter(Boolean).join(" · ");
    }
    if (tab === "partSets") {
      return (item.partTypeIds || []).map((id) => partTypeNames.get(id) || id).join(" / ");
    }
    if (tab === "brands") {
      return [item.alias, item.usageCount ? `${item.usageCount} 条 SKU` : ""].filter(Boolean).join(" · ");
    }
    if (tab === "oemBrands") {
      return item.usageCount ? `${item.usageCount} 条原厂件` : "";
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
      prefix: item.prefix || "",
      system: item.system || "",
      note: item.note || "",
      alias: item.alias || "",
      enabled: item.enabled === undefined ? true : Boolean(item.enabled),
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
        : tab === "categories"
          ? { name: editor.name, prefix: editor.prefix }
          : tab === "brands"
            ? { name: editor.name, alias: editor.alias, note: editor.note, enabled: editor.enabled }
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

  const editing = editor ? (editor.mode === "create" ? `新增${active.noun}` : `编辑${active.noun}`) : "";

  return <div className="workspace dict-workspace">
    <div className="page-title-row">
      <div>
        <h1>配置中心</h1>
      </div>
      <div className="page-actions">
        <button className="primary-button" type="button" onClick={openCreate}><Plus /> 新增{active.noun}</button>
      </div>
    </div>
    <nav className="status-tabs" role="tablist">
      {TABS.map((item) => <button key={item.key} role="tab" type="button" aria-selected={tab === item.key} className={tab === item.key ? "is-active" : ""} onClick={() => switchTab(item.key)}>{item.label}</button>)}
    </nav>
    <div className="content-area">
      {error && !editor ? <p className="dict-error">{error}</p> : null}
      <div className="dict-panel">
        <div className="dict-head"><span>名称</span><span>操作</span></div>
        {loading ? null : items.map((item) => {
          const key = item.id || item.name;
          return <div className={`dict-row${confirming === key ? " is-confirming" : ""}`} key={key}>
            <div className="dict-main">
              <strong>{item.name}</strong>
              {tab === "brands" && item.enabled === 0 ? <span className="dict-tag">已停用</span> : null}
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

    {editor ? <div className="overlay drawer-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
      <aside className="edit-drawer dict-drawer" role="dialog" aria-modal="true" aria-label={editing}>
        <header>
          <h2>{editing}</h2>
          <button className="icon-button" type="button" aria-label="关闭" onClick={closeEditor}><X /></button>
        </header>
        <form onSubmit={(event) => { event.preventDefault(); save(); }}>
          <div className="dict-form">
            <label className="required">名称
              <input autoFocus value={editor.name} maxLength={40} placeholder={`${active.noun}名称`} onChange={(event) => setEditor({ ...editor, name: event.target.value })} />
              <span className="char-count">{editor.name.length}/40</span>
            </label>

            {tab === "categories" ? <label>编码前缀
              <input value={editor.prefix} maxLength={4} placeholder="如 LX" onChange={(event) => setEditor({ ...editor, prefix: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) })} />
            </label> : null}

            {tab === "partTypes" ? <label>系统
              <input value={editor.system} maxLength={20} placeholder="如 保养件" onChange={(event) => setEditor({ ...editor, system: event.target.value })} />
            </label> : null}

            {tab === "brands" ? <>
              <label>英文名 / 别名
                <input value={editor.alias} maxLength={40} placeholder="如 BOSCH / 博世" onChange={(event) => setEditor({ ...editor, alias: event.target.value })} />
                <span className="char-count">{editor.alias.length}/40</span>
              </label>
              <label>状态
                <SearchSelect
                  ariaLabel="状态"
                  value={editor.enabled ? "enabled" : "disabled"}
                  onChange={(value) => setEditor({ ...editor, enabled: value === "enabled" })}
                  options={[{ value: "enabled", label: "启用" }, { value: "disabled", label: "停用" }]}
                />
              </label>
              <label>备注
                <textarea value={editor.note} maxLength={200} placeholder="选填" onChange={(event) => setEditor({ ...editor, note: event.target.value })} />
                <span className="char-count">{editor.note.length}/200</span>
              </label>
            </> : null}

            {tab === "partSets" ? <>
              <label>备注
                <input value={editor.note} maxLength={100} placeholder="选填" onChange={(event) => setEditor({ ...editor, note: event.target.value })} />
              </label>
              <div className="dict-field">
                <span className="dict-field-label">包含件类</span>
                <div className="dict-checks">
                  {(data?.partTypes || []).map((partType) => <label key={partType.id} className="dict-check">
                    <input type="checkbox" checked={editor.partTypeIds.includes(partType.id)} onChange={() => togglePartType(partType.id)} />
                    {partType.name}
                  </label>)}
                </div>
              </div>
            </> : null}
          </div>

          {error ? <p className="dict-error">{error}</p> : null}

          <footer>
            <button className="secondary-button" type="button" onClick={closeEditor}>取消</button>
            <button className="primary-button" type="submit" disabled={saving || !editor.name.trim()}>{saving ? "保存中..." : "保存"}</button>
          </footer>
        </form>
      </aside>
    </div> : null}
  </div>;
}
