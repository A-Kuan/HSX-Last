import { useEffect, useMemo, useRef, useState } from "react";
import { CaretDown, CheckSquare, Copy, ListBullets, MagnifyingGlass, PlusSquare, Square, Trash } from "@phosphor-icons/react";

const statusOf = (part) => (part.discontinued || part.applicable === false ? "discontinued" : "normal");
const STATUS_LABEL = { normal: "正常", discontinued: "停用" };

const matchesSearch = (part, keyword) => {
  const value = keyword.trim().toLowerCase();
  if (!value) return true;
  return [part.oe, part.name, part.position, part.model, part.remark, part.condition, part.saCode]
    .some((field) => String(field || "").toLowerCase().includes(value));
};

export default function PartsPanel({
  parts,
  loading,
  search,
  onSearch,
  statusFilter,
  onStatusFilter,
  selectedCallout,
  onSelectCallout,
  selectedIds,
  onToggle,
  onOpenPart,
  onCopyOe,
  onCopySelected,
  onCopyAll,
  onAddSelected,
  onSelectAllVisible,
}) {
  const rowRefs = useRef(new Map());
  const [moreOpen, setMoreOpen] = useState(false);

  const visible = useMemo(() => parts.filter((part) => {
    if (!matchesSearch(part, search)) return false;
    if (statusFilter === "all") return true;
    return statusOf(part) === statusFilter;
  }), [parts, search, statusFilter]);

  const counts = useMemo(() => parts.reduce((acc, part) => {
    acc.all += 1;
    acc[statusOf(part)] += 1;
    return acc;
  }, { all: 0, normal: 0, discontinued: 0 }), [parts]);

  useEffect(() => {
    if (!selectedCallout) return;
    const row = rowRefs.current.get(selectedCallout);
    if (row) row.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selectedCallout, visible.length]);

  const allSelected = visible.length > 0 && visible.every((part) => selectedIds.includes(part.key));

  return <section className="epc-card epc-parts-card">
    <header className="epc-card-head">
      <div className="epc-card-title"><ListBullets /><span>零件列表</span></div>
      <span className="epc-count">共 {parts.length} 个零件</span>
    </header>

    <div className="epc-parts-search">
      <label className="local-search">
        <MagnifyingGlass />
        <input aria-label="搜索零件" placeholder="搜索 OE 号 / 零件名称..." value={search} onChange={(event) => onSearch(event.target.value)} />
      </label>
    </div>

    <div className="epc-parts-filters" role="group" aria-label="零件状态">
      {[["all", "全部"], ["normal", "正常"], ["discontinued", "停用"]].map(([key, label]) => <button
        key={key}
        type="button"
        className={`epc-filter-chip is-${key}${statusFilter === key ? " is-active" : ""}`}
        aria-pressed={statusFilter === key}
        onClick={() => onStatusFilter(key)}
      >{label}<em>{counts[key]}</em></button>)}
    </div>

    <div className="epc-parts-toolbar">
      <button type="button" className="epc-check" aria-label={allSelected ? "取消全选" : "全选"} onClick={() => onSelectAllVisible(visible, !allSelected)}>{allSelected ? <CheckSquare weight="fill" /> : <Square />}</button>
      <span className="epc-toolbar-count">已选择 {selectedIds.length} 项</span>
      <button type="button" className="epc-tool-btn" onClick={onCopySelected} disabled={!selectedIds.length && !visible.length}><Copy />复制 OE</button>
      <button type="button" className="epc-tool-btn" onClick={() => onAddSelected(visible)} disabled={!visible.length}><PlusSquare />加入选件清单</button>
      <div className="epc-more">
        <button type="button" className="epc-tool-btn" onClick={() => setMoreOpen((value) => !value)} aria-expanded={moreOpen}>更多<CaretDown /></button>
        {moreOpen ? <div className="epc-menu">
          <button type="button" onClick={() => { setMoreOpen(false); onCopyAll(); }}><Copy />复制全部 OE</button>
          <button type="button" onClick={() => { setMoreOpen(false); onSelectAllVisible(visible, true); }}><CheckSquare />全选当前结果</button>
          <button type="button" onClick={() => { setMoreOpen(false); onSelectAllVisible(visible, false); }}><Trash />取消选择</button>
        </div> : null}
      </div>
    </div>

    <div className="epc-parts-table">
      {loading ? <p className="loading-note"><span />加载中</p> : parts.length ? (visible.length ? <table>
        <thead>
          <tr>
            <th className="epc-col-check" />
            <th>图号</th>
            <th>OE 号</th>
            <th>名称</th>
            <th>数量</th>
            <th>状态</th>
            <th className="epc-col-price">价格</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((part) => {
            const status = statusOf(part);
            const checked = selectedIds.includes(part.key);
            const isCallout = selectedCallout && part.position === selectedCallout;
            return <tr
              key={part.key}
              ref={(element) => { if (element && !rowRefs.current.has(part.position)) rowRefs.current.set(part.position, element); }}
              className={`${checked ? "is-checked" : ""}${isCallout ? " is-callout" : ""}`}
            >
              <td className="epc-col-check">
                <button type="button" className={`epc-check${checked ? " is-on" : ""}`} aria-label={checked ? "取消选择" : "选择零件"} aria-pressed={checked} onClick={() => onToggle(part)}>{checked ? <CheckSquare weight="fill" /> : <Square />}</button>
              </td>
              <td className="epc-cell-pos">{part.position || "—"}</td>
              <td className="epc-cell-oe"><button type="button" className="epc-oe" title="点击复制 OE 号" onClick={() => onCopyOe(part.oe)}>{part.oe}</button></td>
              <td className="epc-cell-name"><button type="button" className="epc-name" onClick={() => onOpenPart(part)}>{part.name}</button></td>
              <td>{part.quantity || ""}</td>
              <td><span className={`epc-status is-${status}`}><i />{STATUS_LABEL[status]}</span></td>
              <td className="epc-col-price">{part.price || ""}</td>
            </tr>;
          })}
        </tbody>
      </table> : <p className="field-note">没有匹配项</p>) : <p className="field-note">{selectedCallout ? "没有零件" : "选择图号查看零件"}</p>}
    </div>
  </section>;
}
