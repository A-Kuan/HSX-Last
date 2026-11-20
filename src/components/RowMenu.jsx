import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DotsThree } from "@phosphor-icons/react";

/**
 * 列表行尾「…」操作菜单。
 * - items: [{ key, label, icon?, danger?, disabled?, onSelect }]
 * - 面板挂到 body 并用 fixed 定位，右边缘对齐触发按钮，不会被表格的 overflow 裁掉
 * - 下方空间不足时向上翻；点击外部、Esc、滚动或窗口尺寸变化都关闭
 */
const GAP = 6;
const EDGE = 8;
const WIDTH = 168;

export function RowMenu({ label, items = [], triggerClassName = "icon-button" }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [layout, setLayout] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) return;
    const node = triggerRef.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    const width = Math.min(WIDTH, window.innerWidth - EDGE * 2);
    const left = Math.min(Math.max(EDGE, box.right - width), window.innerWidth - width - EDGE);
    const estimated = items.length * 34 + 14;
    const below = window.innerHeight - box.bottom - EDGE - GAP;
    const above = box.top - EDGE - GAP;
    const openUp = below < estimated && above > below;
    setLayout({
      left,
      width,
      ...(openUp ? { bottom: window.innerHeight - box.top + GAP } : { top: box.bottom + GAP }),
    });
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const onPointerDown = (event) => {
      if (triggerRef.current?.contains(event.target)) return;
      if (panelRef.current?.contains(event.target)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const frame = requestAnimationFrame(() => panelRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const openMenu = (initialActive = 0) => {
    setActive(initialActive);
    setOpen(true);
  };

  const choose = (item) => {
    if (item.disabled) return;
    close();
    item.onSelect?.();
  };

  const onPanelKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Tab") {
      close(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!items.length) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => current < 0 ? (step > 0 ? 0 : items.length - 1) : (current + step + items.length) % items.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = items[active];
      if (item) choose(item);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${triggerClassName} row-menu-trigger${open ? " is-open" : ""}`}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : openMenu(-1))}
        onKeyDown={(event) => {
          if ((event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") && !open) {
            event.preventDefault();
            openMenu(0);
          }
        }}
      >
        <DotsThree />
      </button>
      {open && layout
        ? createPortal(
          <div
            ref={panelRef}
            className="row-menu"
            style={layout}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            onKeyDown={onPanelKeyDown}
          >
            {items.map((item, index) => (
              <Fragment key={item.key}>
                {item.danger && !items[index - 1]?.danger ? <i className="row-menu-sep" role="separator" /> : null}
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  disabled={item.disabled}
                  className={[
                    item.danger ? "is-danger" : "",
                    index === active ? "is-active" : "",
                  ].filter(Boolean).join(" ")}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(item)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              </Fragment>
            ))}
          </div>,
          document.body,
        )
        : null}
    </>
  );
}
