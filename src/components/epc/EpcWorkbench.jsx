import { useEffect, useMemo, useState } from "react";
import { CarProfile, MagnifyingGlass, X } from "@phosphor-icons/react";
import { api } from "../../api.js";
import CategorySidebar from "./CategorySidebar.jsx";
import DiagramPanel from "./DiagramPanel.jsx";
import PartsPanel from "./PartsPanel.jsx";
import PartDrawer from "./PartDrawer.jsx";
import SelectedBar from "./SelectedBar.jsx";

const emptyPart = { parts: [], hotspots: [], image: "" };

const selectedToText = (items) => [
  ["OE号码", "零件名称", "数量"].join("\t"),
  ...items.map((item) => [item.oe, item.name, item.qty].join("\t")),
].join("\n");

export default function EpcWorkbench({ initialVin = "" }) {
  const [vin, setVin] = useState("");
  const [catalog, setCatalog] = useState(null);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [groupNum, setGroupNum] = useState("");
  const [subgroups, setSubgroups] = useState([]);
  const [groupLoading, setGroupLoading] = useState(false);
  const [diagram, setDiagram] = useState(null);
  const [parts, setParts] = useState([]);
  const [hotspots, setHotspots] = useState([]);
  const [image, setImage] = useState("");
  const [partsLoading, setPartsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedCallout, setSelectedCallout] = useState("");
  const [activePart, setActivePart] = useState(null);
  const [selected, setSelected] = useState([]);
  const [toast, setToast] = useState("");
  const [pendingVin, setPendingVin] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [inquiry, setInquiry] = useState(false);

  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
  };

  const loadGroup = async (num, vehicleVin) => {
    const data = await api(`/epc/group?vin=${encodeURIComponent(vehicleVin)}&num=${encodeURIComponent(num)}`);
    return (data.subgroups || []).filter((item) => item.applicable !== false);
  };

  const loadAllGroups = async (cat) => (await Promise.all(cat.groups.map((group) => loadGroup(group.num, cat.vehicle.vin).catch(() => [])))).flat();

  const applyVehicle = async (value) => {
    setError("");
    setLoading(true);
    setCatalog(null);
    setCounts(null);
    setSubgroups([]);
    setGroupNum("");
    setDiagram(null);
    setParts([]);
    setHotspots([]);
    setImage("");
    setSelectedCallout("");
    setSearch("");
    setStatusFilter("all");
    setActivePart(null);
    try {
      const data = await api(`/epc/catalog?vin=${encodeURIComponent(value)}`);
      setCatalog(data);
      setVin(data.vehicle.vin);
      api(`/epc/counts?vin=${encodeURIComponent(data.vehicle.vin)}`).then((result) => setCounts(result.counts || {})).catch(() => setCounts({}));
      setGroupLoading(true);
      const all = await loadAllGroups(data);
      setSubgroups(all);
      setGroupLoading(false);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  const submitVin = (event) => {
    event?.preventDefault();
    const value = String(vin || "").trim().toUpperCase().replace(/\s+/g, "");
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(value)) {
      setError("VIN 应为 17 位字母数字，且不含 I、O、Q");
      return;
    }
    if (selected.length && catalog && catalog.vehicle.vin !== value) {
      setPendingVin(value);
      return;
    }
    if (catalog?.vehicle.vin === value) return;
    applyVehicle(value);
  };

  useEffect(() => {
    if (initialVin) applyVehicle(String(initialVin).toUpperCase());
  }, [initialVin]);

  const selectCategory = async (num) => {
    if (!catalog) return;
    setGroupNum(num);
    setDiagram(null);
    setParts([]);
    setHotspots([]);
    setImage("");
    setSelectedCallout("");
    setSearch("");
    setStatusFilter("all");
    setGroupLoading(true);
    try {
      const list = num ? await loadGroup(num, catalog.vehicle.vin) : await loadAllGroups(catalog);
      setSubgroups(list);
    } catch (loadError) {
      setError(loadError.message);
      setSubgroups([]);
    } finally {
      setGroupLoading(false);
    }
  };

  const openDiagram = async (item) => {
    setDiagram(item);
    setSelectedCallout("");
    setParts([]);
    setHotspots([]);
    setImage("");
    setSearch("");
    setStatusFilter("all");
    setPartsLoading(true);
    try {
      const num = item.mainGroup || groupNum;
      const data = await api(`/epc/parts?vin=${encodeURIComponent(catalog.vehicle.vin)}&num=${encodeURIComponent(num)}&mid=${encodeURIComponent(item.mid)}&filter=1`);
      const rows = (data.parts || []).map((part) => ({ ...part, key: `${part.oe}:${part.position}` }));
      setParts(rows);
      setHotspots(data.hotspots || []);
      setImage(data.image || item.diagram || "");
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setPartsLoading(false);
    }
  };

  const copyText = async (text, message) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(message);
    } catch {
      notify("浏览器不允许写剪贴板");
    }
  };

  const togglePart = (part) => {
    setSelected((list) => (list.some((item) => item.key === part.key)
      ? list.filter((item) => item.key !== part.key)
      : [...list, { key: part.key, oe: part.oe, name: part.name, position: part.position, qty: 1, price: part.price || "" }]));
  };

  const toggleMany = (rows, checked) => {
    setSelected((list) => {
      const keys = new Set(rows.map((row) => row.key));
      if (!checked) return list.filter((item) => !keys.has(item.key));
      const existing = new Set(list.map((item) => item.key));
      return [...list, ...rows.filter((row) => !existing.has(row.key)).map((row) => ({ key: row.key, oe: row.oe, name: row.name, position: row.position, qty: 1, price: row.price || "" }))];
    });
  };

  const changeQty = (key, qty) => {
    setSelected((list) => list.map((item) => (item.key === key ? { ...item, qty: Math.max(1, Number(qty) || 1) } : item)));
  };

  const removeSelected = (key) => setSelected((list) => list.filter((item) => item.key !== key));

  const backToDiagrams = () => {
    setDiagram(null);
    setParts([]);
    setHotspots([]);
    setImage("");
    setSelectedCallout("");
  };

  const vehicleLabel = useMemo(() => {
    if (!catalog) return "";
    const { brand, series } = catalog.vehicle;
    return [brand, series].filter(Boolean).join(" · ") || catalog.vehicle.modelName;
  }, [catalog]);

  const confirmVehicleSwitch = (keep) => {
    const next = pendingVin;
    setPendingVin("");
    if (!keep) setSelected([]);
    if (next) applyVehicle(next);
  };

  const cancelVehicleSwitch = () => {
    setPendingVin("");
    if (catalog) setVin(catalog.vehicle.vin);
  };

  return <main className="workspace epc-workspace">
    <div className="epc-page-head">
      <h1>EPC 查询<span className="epc-subtitle">{catalog ? `${catalog.vehicle.brand} / ${catalog.vehicle.series} 零部件信息` : "输入 VIN 查询车型零部件"}</span></h1>
    </div>
    <form className="epc-vin-row" onSubmit={submitVin}>
      <label className="local-search epc-vin">
        <CarProfile />
        <input aria-label="VIN" placeholder="输入 17 位 VIN" maxLength={17} value={vin} onChange={(event) => { setVin(event.target.value.toUpperCase().replace(/\s+/g, "")); setError(""); }} />
        {vin ? <button type="button" className="epc-vin-clear" aria-label="清空 VIN" onClick={() => { setVin(""); setError(""); }}><X /></button> : null}
      </label>
      <button className="epc-primary-btn epc-vin-submit" type="submit" disabled={loading || !vin.trim()}>{loading ? "查询中..." : "查询"}</button>
      {catalog ? <div className="epc-vehicle-info">
        <span className="epc-vehicle-icon"><CarProfile /></span>
        <div><strong>{vehicleLabel}</strong><span>{catalog.vehicle.vin}</span></div>
      </div> : null}
    </form>
    {error ? <div className="form-error"><X weight="fill" />{error}</div> : null}

    {catalog ? <div className="epc-breadcrumb-row">
      <button type="button" className={`epc-pill${!diagram ? " is-active" : ""}`} onClick={() => selectCategory("")}>全部</button>
      {diagram ? <button type="button" className="epc-ghost-btn" onClick={backToDiagrams}>返回分组</button> : null}
      {diagram ? <span className="epc-crumb"><b>{diagram.figure}</b>{diagram.name}</span> : null}
    </div> : null}

    {catalog ? <div className="epc-main">
      <CategorySidebar groups={catalog.groups} activeNum={groupNum} counts={counts} loading={loading} onSelect={selectCategory} />
      <DiagramPanel
        subgroup={diagram}
        diagrams={subgroups}
        image={image}
        hotspots={hotspots}
        partsCount={parts.length}
        selectedCallout={selectedCallout}
        onSelectCallout={setSelectedCallout}
        onPickDiagram={openDiagram}
        onToast={notify}
      />
      <PartsPanel
        parts={parts}
        loading={partsLoading || groupLoading}
        search={search}
        onSearch={setSearch}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        selectedCallout={selectedCallout}
        onSelectCallout={setSelectedCallout}
        selectedIds={selected.map((item) => item.key)}
        onToggle={togglePart}
        onOpenPart={setActivePart}
        onCopyOe={(oe) => copyText(oe, "已复制 OE 号")}
        onCopySelected={() => copyText((selected.length ? selected.map((item) => item.oe) : parts.map((part) => part.oe)).join("\n"), "已复制 OE")}
        onCopyAll={() => copyText(parts.map((part) => part.oe).join("\n"), "已复制全部 OE")}
        onAddSelected={(rows) => { toggleMany(rows, true); notify("已加入选件清单"); }}
        onSelectAllVisible={toggleMany}
      />
    </div> : <div className="epc-empty">
      <p>输入 VIN 查询后选择零件分组</p>
    </div>}

    <SelectedBar
      items={selected}
      submitting={inquiry}
      onQty={changeQty}
      onRemove={removeSelected}
      onClear={() => setConfirmClear(true)}
      onCopyList={() => copyText(selectedToText(selected), "已复制清单，可直接粘贴")}
      onInquiry={async () => {
        setInquiry(true);
        try {
          // 询价接口尚未接入：先把清单按 TSV 复制好，不伪造提交成功
          await navigator.clipboard.writeText(selectedToText(selected));
          notify("询价接口未接入，清单已复制");
        } catch {
          notify("询价接口未接入，复制也未成功");
        } finally {
          setInquiry(false);
        }
      }}
    />

    {activePart ? <div className="overlay drawer-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setActivePart(null); }}>
      <PartDrawer
        part={activePart}
        vehicleName={vehicleLabel}
        inList={selected.some((item) => item.key === activePart.key)}
        onClose={() => setActivePart(null)}
        onAdd={(part) => { if (!selected.some((item) => item.key === part.key)) togglePart(part); notify("已加入选件清单"); }}
        onCopyOe={(oe) => copyText(oe, "已复制 OE 号")}
      />
    </div> : null}

    {pendingVin ? <div className="overlay modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingVin(""); }}>
      <div className="epc-confirm" role="dialog" aria-modal="true" aria-label="切换车型">
        <h2>切换车型</h2>
        <p>当前选件清单里有 {selected.length} 个零件，切换车型后原有零件可能不适用。</p>
        <footer>
          <button type="button" className="secondary-button" onClick={cancelVehicleSwitch}>取消</button>
          <button type="button" className="secondary-button" onClick={() => confirmVehicleSwitch(false)}>清空清单并查询</button>
          <button type="button" className="primary-button" onClick={() => confirmVehicleSwitch(true)}>保留清单并查询</button>
        </footer>
      </div>
    </div> : null}

    {confirmClear ? <div className="overlay modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmClear(false); }}>
      <div className="epc-confirm" role="dialog" aria-modal="true" aria-label="清空清单">
        <h2>清空选件清单</h2>
        <p>已选 {selected.length} 个零件，清空后需要重新选择。</p>
        <footer>
          <button type="button" className="secondary-button" onClick={() => setConfirmClear(false)}>取消</button>
          <button type="button" className="danger-button" onClick={() => { setSelected([]); setConfirmClear(false); }}>清空</button>
        </footer>
      </div>
    </div> : null}

    {toast ? <div className="epc-toast">{toast}</div> : null}
  </main>;
}
