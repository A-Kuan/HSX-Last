import { useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { api } from "../api.js";

export default function MaintenancePage({ onToast }) {
  const [vin, setVin] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [openItem, setOpenItem] = useState("");
  const [parts, setParts] = useState({});
  const [partsLoading, setPartsLoading] = useState("");

  const query = async (event) => {
    event?.preventDefault();
    const value = vin.trim().toUpperCase().replace(/\s+/g, "");
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(value)) {
      setError("VIN 应为 17 位字母数字，且不含 I、O、Q");
      return;
    }
    setError("");
    setLoading(true);
    setItems(null);
    setParts({});
    setOpenItem("");
    try {
      const data = await api(`/epc/maintenance?vin=${encodeURIComponent(value)}`);
      setItems(data.items || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleItem = async (item) => {
    if (openItem === item.mcid) {
      setOpenItem("");
      return;
    }
    setOpenItem(item.mcid);
    if (parts[item.mcid]) return;
    setPartsLoading(item.mcid);
    try {
      const data = await api(`/epc/maintenance/parts?vin=${encodeURIComponent(vin.trim().toUpperCase())}&mcid=${encodeURIComponent(item.mcid)}`);
      setParts((current) => ({ ...current, [item.mcid]: data.items || [] }));
    } catch (loadError) {
      onToast?.(loadError.message);
    } finally {
      setPartsLoading("");
    }
  };

  return <main className="workspace">
    <div className="page-title-row"><div><h1>保养件</h1></div></div>
    <form className="filter-area" onSubmit={query}><div className="filter-row">
      <label className="local-search"><MagnifyingGlass />
        <input aria-label="VIN" placeholder="输入 17 位 VIN 查询保养件" maxLength={17} value={vin} onChange={(event) => setVin(event.target.value.toUpperCase().replace(/\s+/g, ""))} />
      </label>
      <button className="primary-button" type="submit" disabled={loading}>{loading ? "查询中" : "查询"}</button>
    </div></form>
    {error ? <p className="dict-error">{error}</p> : null}
    <div className="content-area">
      <div className="dict-panel">
        <div className="dict-head"><span>保养项目</span><span>周期</span></div>
        {items ? (items.length ? items.map((item) => <div key={item.mcid}>
          <button type="button" className="dict-row maintenance-row" onClick={() => toggleItem(item)}>
            <span className="dict-main"><strong>{item.sequence}. {item.name}</strong><small>{item.manHours || "—"}</small></span>
            <span className="maintenance-freq">{item.freq || "—"}</span>
          </button>
          {openItem === item.mcid ? <div className="maintenance-parts">
            {partsLoading === item.mcid ? <p className="field-note">加载中…</p> : (parts[item.mcid] || []).length ? <table>
              <thead><tr><th>OE 号</th><th>名称</th><th>数量</th></tr></thead>
              <tbody>{(parts[item.mcid] || []).map((part) => <tr key={`${part.oe}-${part.name}`}>
                <td className="maintenance-oe">{part.oe}</td>
                <td>{part.name}</td>
                <td>{part.quantity || "—"}</td>
              </tr>)}</tbody>
            </table> : <p className="field-note">暂无零件明细</p>}
          </div> : null}
        </div>) : <p className="field-note">该车型暂无保养数据</p>) : <p className="field-note">输入 VIN 查询保养项目</p>}
      </div>
    </div>
  </main>;
}
