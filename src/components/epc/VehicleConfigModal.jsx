import { useMemo, useState } from "react";
import { CarProfile, MagnifyingGlass, X } from "@phosphor-icons/react";

export default function VehicleConfigModal({ vehicle, onClose }) {
  const [keyword, setKeyword] = useState("");
  const rows = vehicle?.config || [];
  const visible = useMemo(() => {
    const value = keyword.trim().toLowerCase();
    if (!value) return rows;
    return rows.filter((row) => `${row.label} ${row.value}`.toLowerCase().includes(value));
  }, [rows, keyword]);

  return <div className="overlay modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="epc-config-modal" role="dialog" aria-modal="true" aria-label="车型配置">
      <header>
        <div className="epc-card-title"><CarProfile /><span>车型配置</span></div>
        <span className="epc-count">{rows.length} 项</span>
        <button type="button" className="epc-icon-btn" aria-label="关闭" onClick={onClose}><X /></button>
      </header>
      <div className="epc-config-head">
        <div className="epc-config-title">{vehicle?.modelName || vehicle?.vin}</div>
        <span className="epc-config-vin">{vehicle?.vin}</span>
      </div>
      <div className="epc-config-search">
        <label className="local-search">
          <MagnifyingGlass />
          <input aria-label="搜索配置" placeholder="输入配置信息" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
        </label>
      </div>
      <div className="epc-config-list">
        {visible.length ? visible.map((row) => <div className="epc-config-row" key={row.label}>
          <span>{row.label}</span>
          <strong title={row.value}>{row.value}</strong>
        </div>) : <p className="field-note">{rows.length ? "没有匹配项" : "这台车没有配置信息"}</p>}
      </div>
    </section>
  </div>;
}
