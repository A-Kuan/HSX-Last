import { useMemo, useState } from "react";
import { BookOpen, MagnifyingGlass } from "@phosphor-icons/react";

export default function CategorySidebar({ groups, activeNum, counts, loading, onSelect }) {
  const [keyword, setKeyword] = useState("");
  const visible = useMemo(() => {
    const value = keyword.trim().toLowerCase();
    if (!value) return groups;
    return groups.filter((group) => String(group.label).toLowerCase().includes(value) || String(group.num).includes(value));
  }, [groups, keyword]);

  return <aside className="epc-card epc-sidebar">
    <div className="epc-sidebar-search">
      <label className="local-search">
        <MagnifyingGlass />
        <input aria-label="搜索分类" placeholder="搜索分类..." value={keyword} onChange={(event) => setKeyword(event.target.value)} />
      </label>
    </div>
    <div className="epc-category-list">
      {loading ? <p className="loading-note"><span />加载中</p> : visible.length ? visible.map((group) => <button
        key={group.num}
        type="button"
        className={`epc-category${activeNum === group.num ? " is-active" : ""}`}
        title={group.label}
        onClick={() => onSelect(group.num)}
      >
        {group.image ? <img src={group.image} alt="" loading="lazy" /> : <BookOpen />}
        <span>{group.label}</span>
        {counts?.[group.num] != null ? <em>{counts[group.num]}</em> : null}
      </button>) : <p className="field-note">没有匹配项</p>}
    </div>
  </aside>;
}
