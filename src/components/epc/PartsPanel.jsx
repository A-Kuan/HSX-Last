import { useEffect, useMemo, useRef } from "react";
import { CheckSquare, Square } from "@phosphor-icons/react";

const statusOf = (part) => (part.discontinued || part.applicable === false ? "discontinued" : "normal");
const STATUS_LABEL = { normal: "正常", discontinued: "停用" };

export default function PartsPanel({
  parts,
  loading,
  statusFilter,
  onStatusFilter,
  selectedCallout,
  onSelectCallout,
  selectedIds,
  onToggle,
  onOpenPart,
}) {
  const rowRefs = useRef(new Map());

  const visible = useMemo(() => parts.filter((part) => {
    if (statusFilter === "all") return true;
    return statusOf(part) === statusFilter;
  }), [parts, statusFilter]);

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
    <div className="epc-parts-filters" role="group" aria-label="零件状态">
      {[["all", "全部"], ["normal", "正常"], ["discontinued", "停用"]].map(([key, label]) => <button
        key={key}
        type="button"
        className={`epc-filter-chip is-${key}${statusFilter === key ? " is-active" : ""}`}
        aria-pressed={statusFilter === key}
        onClick={() => onStatusFilter(key)}
      >{label}<em>{counts[key]}</em></button>)}
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
              <td className="epc-cell-oe"><button type="button" className="epc-oe" title="在爆炸图中定位图号" onClick={() => { if (part.position) onSelectCallout(part.position); }}>{part.oe}</button></td>
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
