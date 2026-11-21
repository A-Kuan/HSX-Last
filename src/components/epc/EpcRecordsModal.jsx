import { useEffect, useState } from "react";
import { ClockCounterClockwise, X } from "@phosphor-icons/react";
import { api } from "../../api.js";

export default function EpcRecordsModal({ onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api("/epc/records?page=1&size=40")
      .then((payload) => { if (!cancelled) setData(payload); })
      .catch((loadError) => { if (!cancelled) setError(loadError.message); });
    return () => { cancelled = true; };
  }, []);

  return <div className="overlay modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="epc-records-modal" role="dialog" aria-modal="true" aria-label="查询记录">
      <header>
        <div className="epc-card-title"><ClockCounterClockwise /><span>查询记录</span></div>
        <button type="button" className="epc-icon-btn" aria-label="关闭" onClick={onClose}><X /></button>
      </header>
      <div className="epc-records-list">
        {error ? <p className="field-note">{error}</p> : !data ? <p className="field-note">加载中…</p> : data.items.length ? data.items.map((item, index) => <div className="epc-record-row" key={`${item.time}-${index}`}>
          <span className="epc-record-time">{item.time}</span>
          <span className="epc-record-type">{item.type || "查询"}</span>
          <strong>{item.times < 0 ? "缓存" : item.times > 0 ? `-${item.times} 次` : "—"}</strong>
        </div>) : <p className="field-note">暂无记录</p>}
      </div>
    </section>
  </div>;
}
