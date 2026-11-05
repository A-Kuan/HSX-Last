import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaretDown, Check, MagnifyingGlass, Plus } from "@phosphor-icons/react";

/**
 * 公用选择列：支持搜索的下拉选择器。
 * - options: [{ value, label, meta?, keywords?, action? }]，action 项（如「新建商品组」）固定排在面板底部
 * - 面板挂到 body 并用 fixed 定位，不会被抽屉/弹窗的 overflow 裁掉，且相对触发控件水平居中
 * - 只在「搜索无结果」时给一句状态文案；列表本来就为空时不写解释性/引导性文字
 * - 触发器与选项行都按 flex 垂直居中，文字不会被字体度量带偏
 */
const asOption = (option) => (typeof option === "string" ? { value: option, label: option } : option);

const GAP = 6;
const MIN_WIDTH = 280;
const EDGE = 8;

export function SearchSelect({
  value = "",
  onChange,
  options = [],
  placeholder = "请选择",
  ariaLabel,
  disabled = false,
  className = "",
  searchable,
  searchPlaceholder = "搜索…",
  emptyText = "没有匹配项",
}) {
  const items = useMemo(() => options.map(asOption), [options]);
  const actions = useMemo(() => items.filter((item) => item.action), [items]);
  const choices = useMemo(() => items.filter((item) => !item.action), [items]);
  const selected = items.find((item) => item.value === value) || null;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [box, setBox] = useState(null);
  const [layout, setLayout] = useState(null);
  const [fontSize, setFontSize] = useState(null);

  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  const withSearch = searchable ?? choices.length > 5;

  const matched = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return choices;
    return choices.filter((item) =>
      `${item.label} ${item.meta || ""} ${item.keywords || ""}`.toLowerCase().includes(keyword),
    );
  }, [choices, query]);

  const flat = useMemo(() => [...matched, ...actions], [matched, actions]);

  // 面板定位：优先贴在下方，空间不足时向上翻；水平方向对齐触发控件中心。
  useLayoutEffect(() => {
    if (!open || !box) return;
    const width = Math.min(Math.max(box.width, MIN_WIDTH), window.innerWidth - EDGE * 2);
    const centered = box.left + box.width / 2 - width / 2;
    const left = Math.min(Math.max(EDGE, centered), window.innerWidth - width - EDGE);
    const below = window.innerHeight - box.bottom - EDGE - GAP;
    const above = box.top - EDGE - GAP;
    const openUp = below < 220 && above > below;
    setLayout({
      left,
      width,
      maxHeight: Math.max(160, Math.min(340, openUp ? above : below)),
      ...(openUp ? { bottom: window.innerHeight - box.top + GAP } : { top: box.bottom + GAP }),
    });
  }, [open, box]);

  const syncBox = () => {
    const node = triggerRef.current;
    if (node) setBox(node.getBoundingClientRect());
  };

  useEffect(() => {
    if (!open) return;
    syncBox();
    const onScroll = () => syncBox();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      if (triggerRef.current?.contains(event.target)) return;
      if (panelRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      if (withSearch) searchRef.current?.focus();
      else panelRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, withSearch]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector(".search-select-option.is-active")?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const closePanel = (restoreFocus = true) => {
    setOpen(false);
    setQuery("");
    if (restoreFocus) triggerRef.current?.focus();
  };

  const openPanel = () => {
    const node = triggerRef.current;
    if (disabled || !node) return;
    setBox(node.getBoundingClientRect());
    setFontSize(getComputedStyle(node).fontSize);
    setQuery("");
    const index = flat.findIndex((item) => item.value === value);
    setActive(index >= 0 ? index : 0);
    setOpen(true);
  };

  const choose = (item) => {
    onChange?.(item.value);
    closePanel();
  };

  const onTriggerKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) openPanel();
    }
  };

  const onPanelKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closePanel();
      return;
    }
    if (event.key === "Tab") {
      closePanel(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!flat.length) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => (current + step + flat.length) % flat.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = flat[active];
      if (item) choose(item);
    }
  };

  const renderOption = (item, index) => {
    const isSelected = item.value === value;
    return (
      <button
        key={`${item.value}-${index}`}
        type="button"
        role="option"
        aria-selected={isSelected}
        tabIndex={-1}
        className={[
          "search-select-option",
          item.action ? "is-action" : "",
          isSelected ? "is-selected" : "",
          index === active ? "is-active" : "",
        ].filter(Boolean).join(" ")}
        onMouseEnter={() => setActive(index)}
        onClick={() => choose(item)}
      >
        <span className="search-select-option-main">
          <span>{item.label}</span>
          {item.meta ? <small>{item.meta}</small> : null}
        </span>
        {isSelected ? <Check weight="bold" /> : item.action ? <Plus weight="bold" /> : null}
      </button>
    );
  };

  return (
    <div className={`search-select${open ? " is-open" : ""}${className ? ` ${className}` : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className={`search-select-trigger${open ? " is-open" : ""}${selected ? "" : " is-placeholder"}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => (open ? closePanel() : openPanel())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="search-select-value">
          {selected ? (
            <>
              {selected.label}
              {selected.meta ? <small>{selected.meta}</small> : null}
            </>
          ) : placeholder}
        </span>
        <CaretDown className="search-select-caret" />
      </button>
      {open && box && layout
        ? createPortal(
          <div
            ref={panelRef}
            className="search-select-panel"
            style={{ ...layout, fontSize: fontSize || undefined }}
            tabIndex={-1}
            onKeyDown={onPanelKeyDown}
          >
            {withSearch && (
              <div className="search-select-search">
                <MagnifyingGlass />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(0);
                  }}
                  placeholder={searchPlaceholder}
                  aria-label="搜索选项"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            )}
            <div className="search-select-list" role="listbox" aria-label={ariaLabel} ref={listRef}>
              {matched.map((item, index) => renderOption(item, index))}
              {!matched.length && query.trim() ? <p className="search-select-empty">{emptyText}</p> : null}
            </div>
            {actions.length > 0 && (
              <div className="search-select-actions" role="group">
                {actions.map((item, index) => renderOption(item, matched.length + index))}
              </div>
            )}
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}
