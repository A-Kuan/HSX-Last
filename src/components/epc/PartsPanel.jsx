import { useEffect, useMemo, useRef } from "react";
import { CheckSquare, Square } from "@phosphor-icons/react";

const statusOf = (part) => {
  if (part.reference && !part.oe) return "reference";
  return part.discontinued || part.applicable === false ? "discontinued" : "normal";
};
const STATUS_LABEL = { normal: "正常", discontinued: "停用", reference: "参见" };

const figureOf = (mid) => (/^\d{6}$/.test(mid) ? `${mid.slice(0, 3)}-${mid.slice(3)}` : mid);

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
  onOpenReference,
  onCopyOe,
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
  }, { all: 0, normal: 0, discontinued: 0, reference: 0 }), [parts]);

  useEffect(() => {
    if (!selectedCallout) return;
    const row = rowRefs.current.get(selectedCallout);
    if (row) row.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selectedCallout, visible.length]);

  const allSelected = visible.length > 0 && visible.every((part) => selectedIds.includes(part.key));

  const chips = [["all", "全部"], ["normal", "正常"], ["discontinued", "停用"]];
  if (counts.reference) chips.push(["reference", "参见"]);

  return <section className="epc-card epc-parts-card">
    <div className="epc-parts-filters" role="group" aria-label="零件状态">
      {chips.map(([key, label]) => <button
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
            <th>备注</th>
            <th>数量</th>
            <th>状态</th>
            <th className="epc-col-price">价格</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((part) => {
            const status = statusOf(part);
            const reference = status === "reference";
            const checked = selectedIds.includes(part.key);
            const isCallout = selectedCallout && part.position === selectedCallout;
            const refLabel = part.reference ? `${figureOf(part.reference.mid)}${part.reference.position ? ` · ${part.reference.position}` : ""}` : "";
            return <tr
              key={part.key}
              ref={(element) => { if (element && !rowRefs.current.has(part.position)) rowRefs.current.set(part.position, element); }}
              className={`${checked ? "is-checked" : ""}${isCallout ? " is-callout" : ""}${reference ? " is-reference" : ""}`}
            >
              <td className="epc-col-check">
                {reference ? null : <button type="button" className={`epc-check${checked ? " is-on" : ""}`} aria-label={checked ? "取消选择" : "选择零件"} aria-pressed={checked} onClick={() => onToggle(part)}>{checked ? <CheckSquare weight="fill" /> : <Square />}</button>}
              </td>
              <td className="epc-cell-pos"><button type="button" className="epc-pos-btn" title="在爆炸图中定位图号" onClick={() => { if (part.position) onSelectCallout(part.position); }}>{part.position || "—"}</button></td>
              <td className="epc-cell-oe">{reference
                ? <button type="button" className="epc-ref-link" title={`打开图板 ${refLabel}`} onClick={() => onOpenReference(part.reference)}>参见 {refLabel}</button>
                : <button type="button" className="epc-oe" title="复制 OE 号" onClick={() => onCopyOe?.(part.oe)}>{part.oe}</button>}</td>
              <td className="epc-cell-name">{reference
                ? <span className="epc-ref-name" title={part.name}>{part.name || "参见图板"}</span>
                : <>
                  <button type="button" className="epc-name" title={part.name} onClick={() => onOpenPart(part)}>{part.name}</button>
                  {part.aliases?.length ? <span className="epc-name-alias" title={part.aliases.map((item) => item.alias).join("、")}>{part.aliases[0].alias}{part.aliases.length > 1 ? ` +${part.aliases.length - 1}` : ""}</span> : null}
                </>}</td>
              <td className="epc-cell-remark" title={reference ? `参见图板 ${refLabel}` : (part.remark || part.condition || part.saCode || "")}>{reference ? `参见图板 ${refLabel}` : (part.remark || part.condition || part.saCode || "")}</td>
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
