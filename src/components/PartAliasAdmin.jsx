import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import { api } from "../api.js";

const SOURCE_LABEL = { manual: "手动", import: "导入", learned: "学习" };

export function PartAliasAdmin({ onToast }) {
  const [items, setItems] = useState([]);
  const [term, setTerm] = useState("");
  const [editor, setEditor] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async (keyword) => {
    try {
      const query = keyword === undefined ? term : keyword;
      const data = await api(`/part-aliases?q=${encodeURIComponent(query.trim())}`);
      setItems(data.items || []);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(""); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => load(term), 260);
    return () => window.clearTimeout(timer);
  }, [term]);

  const startCreate = () => {
    setError("");
    setEditor({ oe: "", alias: "", officialName: "" });
  };

  const closeEditor = () => {
    setEditor(null);
    setError("");
  };

  const save = async (event) => {
    event.preventDefault();
    if (!editor || saving) return;
    setSaving(true);
    try {
      await api("/part-aliases", {
        method: "POST",
        body: JSON.stringify({ oe: editor.oe, alias: editor.alias, officialName: editor.officialName }),
      });
      onToast?.("已添加别名");
      closeEditor();
      await load();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    try {
      await api(`/part-aliases/${removing.id}`, { method: "DELETE" });
      onToast?.("已删除别名");
      setRemoving(null);
      await load();
    } catch (removeError) {
      setError(removeError.message);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      if (!map.has(item.oeKey)) map.set(item.oeKey, { oeKey: item.oeKey, oe: item.oe, officialName: item.officialName, aliases: [] });
      const entry = map.get(item.oeKey);
      if (!entry.officialName && item.officialName) entry.officialName = item.officialName;
      entry.aliases.push(item);
    }
    return [...map.values()];
  }, [items]);

  return <div className="workspace dict-workspace">
    <div className="page-title-row">
      <div><h1>零件别名</h1></div>
      <div className="page-actions">
        <button className="primary-button" type="button" onClick={startCreate}><Plus /> 新增别名</button>
      </div>
    </div>
    <div className="filter-area"><div className="filter-row">
      <label className="local-search"><MagnifyingGlass /><input value={term} aria-label="搜索零件别名" placeholder="搜索 OE、官方名称或别名" onChange={(event) => setTerm(event.target.value)} /></label>
    </div></div>
    <div className="content-area">
      {error && !editor ? <p className="dict-error">{error}</p> : null}
      <div className="dict-panel">
        <div className="dict-head"><span>OE / 别名</span><span>使用次数</span></div>
        {loading ? null : grouped.length ? grouped.map((group) => <div className="dict-row" key={group.oeKey}>
          <div className="dict-main">
            <strong>{group.oe}</strong>
            <small>{[group.officialName, `${group.aliases.length} 个别名`].filter(Boolean).join(" · ")}</small>
            <div className="pa-alias-chips">{group.aliases.map((item) => <span className="pa-alias-chip" key={item.id}>
              {item.alias}
              <em>{SOURCE_LABEL[item.source] || item.source}</em>
              <button type="button" aria-label={`删除别名 ${item.alias}`} onClick={() => setRemoving(item)}><X /></button>
            </span>)}</div>
          </div>
          <div className="dict-actions"><span className="pa-hits">{group.aliases.reduce((sum, item) => sum + (item.hits || 0), 0)} 次</span></div>
        </div>) : <p className="field-note">{term.trim() ? "没有匹配项" : ""}</p>}
      </div>
    </div>

    {editor ? <div className="overlay drawer-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
      <aside className="edit-drawer dict-drawer" role="dialog" aria-modal="true" aria-label="新增零件别名">
        <header>
          <h2>新增零件别名</h2>
          <button className="icon-button" type="button" aria-label="关闭" onClick={closeEditor}><X /></button>
        </header>
        <form onSubmit={save}>
          <div className="dict-form">
            <label className="required">OE 号
              <input autoFocus value={editor.oe} maxLength={40} placeholder="如 958 147 151 40" onChange={(event) => setEditor({ ...editor, oe: event.target.value.toUpperCase() })} />
            </label>
            <label className="required">别名
              <input value={editor.alias} maxLength={40} placeholder="如 机油格座" onChange={(event) => setEditor({ ...editor, alias: event.target.value })} />
            </label>
            <label>官方名称
              <input value={editor.officialName} maxLength={120} placeholder="选填，从 EPC 带出" onChange={(event) => setEditor({ ...editor, officialName: event.target.value })} />
            </label>
            {error ? <p className="dict-error">{error}</p> : null}
          </div>
          <footer>
            <button className="secondary-button" type="button" onClick={closeEditor}>取消</button>
            <button className="primary-button" type="submit" disabled={saving || !editor.oe.trim() || !editor.alias.trim()}>{saving ? "保存中" : "保存"}</button>
          </footer>
        </form>
      </aside>
    </div> : null}

    {removing ? <div className="overlay modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setRemoving(null); }}>
      <div className="batch-modal" role="dialog" aria-modal="true" aria-label="删除零件别名">
        <h2>删除别名</h2>
        <p>删除「{removing.alias}」后，搜索这个叫法就找不到 {removing.oe} 了。</p>
        <footer>
          <button className="secondary-button" type="button" onClick={() => setRemoving(null)}>取消</button>
          <button className="danger-button" type="button" onClick={remove}>删除</button>
        </footer>
      </div>
    </div> : null}
  </div>;
}
