import { useEffect, useRef, useState } from "react";
import { CaretDown, GearSix, MagnifyingGlass } from "@phosphor-icons/react";
import "../navbar.css";

/* 配置中心的字典页签，顺序与 DictionaryAdmin 的 TABS 一致 */
const DICT_TABS = [
  ["categories", "配件品类"],
  ["partTypes", "件类"],
  ["partSets", "套餐"],
  ["brands", "品牌"],
  ["oemBrands", "整车品牌"],
  ["units", "单位"],
  ["origins", "产地"],
  ["channels", "渠道"],
  ["generations", "代系"],
];

export function NavBar({
  view,
  counts,
  onView,
  onSearch,
  onStatus,
  onCreateSku,
  onImport,
  onRefresh,
  onConfigTab,
}) {
  const [openId, setOpenId] = useState(null);
  /* 切换面板时的滑入方向：+1 向右、-1 向左 */
  const [dir, setDir] = useState(1);
  const [tick, setTick] = useState(0);
  const [term, setTerm] = useState("");

  const shellRef = useRef(null);
  const layerRef = useRef(null);
  const triggerRefs = useRef({});
  const openTimer = useRef(0);
  const closeTimer = useRef(0);

  const modules = [
    {
      key: "sku",
      label: "SKU 商品库",
      groups: [
        {
          title: "状态",
          items: [
            { key: "all", label: "全部 SKU", count: counts?.all, run: () => onStatus("") },
            { key: "draft", label: "草稿", count: counts?.draft, run: () => onStatus("draft") },
            { key: "incomplete", label: "资料待完善", count: counts?.incomplete, run: () => onStatus("incomplete") },
            { key: "disabled", label: "已停用", count: counts?.disabled, run: () => onStatus("disabled") },
          ],
        },
        {
          title: "操作",
          items: [
            { key: "create", label: "新增 SKU", run: onCreateSku },
            { key: "import", label: "批量导入", run: onImport },
            { key: "refresh", label: "刷新列表", run: onRefresh },
          ],
        },
      ],
    },
    { key: "groups", label: "商品组", view: "groups" },
    { key: "vehicle", label: "车型查询", view: "vehicle" },
    { key: "epc", label: "EPC 查询", view: "epc" },
    { key: "vehicles", label: "车型库", view: "vehicles" },
    {
      key: "config",
      label: "配置中心",
      groups: [
        {
          title: "基础字典",
          items: DICT_TABS.slice(0, 4).map(([key, label]) => ({ key, label, run: () => onConfigTab(key) })),
        },
        {
          title: "其他字典",
          items: DICT_TABS.slice(4).map(([key, label]) => ({ key, label, run: () => onConfigTab(key) })),
        },
        {
          title: "零件",
          items: [{ key: "partAliases", label: "零件别名", run: () => onView("aliases") }],
        },
      ],
    },
  ];

  const panelModules = modules.filter((item) => item.groups);
  const active = panelModules.find((item) => item.key === openId) || null;

  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const cancelOpen = () => window.clearTimeout(openTimer.current);

  const close = () => {
    cancelOpen();
    setOpenId(null);
  };

  const open = (id, byHover) => {
    setOpenId((current) => {
      if (current === id) return current;
      const from = panelModules.findIndex((item) => item.key === current);
      const to = panelModules.findIndex((item) => item.key === id);
      setDir(from > -1 && to > -1 && to < from ? -1 : 1);
      setTick((value) => value + 1);
      return id;
    });
    if (byHover) cancelClose();
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpenId(null), 170);
  };

  /* 划过不算数：停留 120ms 才切换面板，避免横扫时一路闪过去 */
  const hoverOpen = (id) => {
    cancelClose();
    cancelOpen();
    openTimer.current = window.setTimeout(() => open(id, true), openId ? 120 : 90);
  };

  useEffect(() => () => {
    cancelOpen();
    cancelClose();
  }, []);

  /* 面板贴着当前触发项打开；贴到视口右侧时向内收 */
  useEffect(() => {
    if (!active || !layerRef.current || !shellRef.current) return;
    const trigger = triggerRefs.current[active.key];
    if (!trigger) return;
    const shellRect = shellRef.current.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    const layerWidth = layerRef.current.offsetWidth;
    let left = triggerRect.left - shellRect.left + 12;   // 对齐触发项文字，而不是按钮外框
    const overflow = shellRect.left + left + layerWidth + 24 - window.innerWidth;
    if (overflow > 0) left -= overflow;
    layerRef.current.style.left = `${left}px`;
  }, [active]);

  useEffect(() => {
    if (!openId) return undefined;
    const onPointerDown = (event) => {
      if (!shellRef.current?.contains(event.target)) setOpenId(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openId]);

  useEffect(() => {
    if (!openId) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        const trigger = triggerRefs.current[openId];
        setOpenId(null);
        trigger?.focus();
        return;
      }
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const order = panelModules.map((item) => item.key);
      const at = order.indexOf(openId);
      const next = order[(at + (event.key === "ArrowRight" ? 1 : -1) + order.length) % order.length];
      event.preventDefault();
      open(next);
      triggerRefs.current[next]?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openId]);

  const handleTriggerClick = (module) => {
    cancelOpen();
    if (!module.groups) {
      onView(module.view);
      setOpenId(null);
      return;
    }
    if (openId === module.key) setOpenId(null);
    else open(module.key);
  };

  const runItem = (run) => {
    run?.();
    setOpenId(null);
  };

  const submitSearch = () => {
    const value = term.trim();
    if (value) onSearch(value);
  };

  return (
    <header className="app-header nv-header">
      <div className="nv-shell" ref={shellRef}>
          <nav className="nv-nav" aria-label="主导航">
            {modules.map((module) => {
              const isOpen = openId === module.key;
              const isCurrent = !module.groups && view === module.view;
              return (
                <button
                  key={module.key}
                  ref={(node) => { triggerRefs.current[module.key] = node; }}
                  type="button"
                  className={`nv-trigger ${isCurrent ? "is-current" : ""}`}
                  aria-expanded={module.groups ? isOpen : undefined}
                  aria-haspopup={module.groups ? "true" : undefined}
                  aria-controls={module.groups ? `nv-panel-${module.key}` : undefined}
                  aria-current={isCurrent ? "page" : undefined}
                  onClick={() => handleTriggerClick(module)}
                  onMouseEnter={() => module.groups && hoverOpen(module.key)}
                  onMouseLeave={() => module.groups && scheduleClose()}
                >
                  {module.label}
                  {module.groups ? <CaretDown className="nv-caret" weight="bold" /> : null}
                </button>
              );
            })}
          </nav>

          <div
            ref={layerRef}
            className={`nv-layer ${active ? "is-open" : ""}`}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <div className="nv-surface">
              {active ? (
                <div
                  key={`${active.key}-${tick}`}
                  id={`nv-panel-${active.key}`}
                  className="nv-panel is-active is-entering"
                  style={{ "--nv-dx": `${dir * 10}px` }}
                  role="region"
                  aria-label={active.label}
                >
                  <div className="nv-grid">
                    {active.groups.map((group) => (
                      <div key={group.title}>
                        <p className="nv-group-title">{group.title}</p>
                        {group.items.map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            className="nv-item"
                            onClick={() => runItem(item.run)}
                          >
                            <span>{item.label}</span>
                            {typeof item.count === "number" ? <span className="nv-count">{item.count}</span> : null}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
        </div>
      </div>

      <label className="global-search">
        <MagnifyingGlass />
        <input
          value={term}
          aria-label="全局搜索"
          placeholder="全局搜索（SKU / OE 号）"
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") submitSearch(); }}
        />
        <kbd>Enter</kbd>
      </label>

      <div className="header-actions">
        <button
          className="icon-button"
          type="button"
          aria-label="配置中心"
          onClick={() => onView("config")}
        >
          <GearSix />
        </button>
      </div>
    </header>
  );
}
