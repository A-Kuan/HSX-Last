import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowsClockwise, ArrowsIn, ArrowsOut, BookOpen, CornersOut, Cube, MagnifyingGlassMinus, MagnifyingGlassPlus } from "@phosphor-icons/react";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

/** 爆炸图面板：缩放（滚轮以光标为中心）、拖拽平移、图号热区、缩略导航、全屏。 */
export default function DiagramPanel({
  subgroup,
  diagrams,
  image,
  hotspots,
  partsCount,
  selectedCallout,
  onSelectCallout,
  onPickDiagram,
  onToast,
}) {
  const cardRef = useRef(null);
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [fitWidth, setFitWidth] = useState(0);
  const [viewport, setViewport] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [fullscreen, setFullscreen] = useState(false);

  const measure = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    setViewport({ left: box.scrollLeft, top: box.scrollTop, width: box.clientWidth, height: box.clientHeight });
    setCanvasSize({ width: box.scrollWidth, height: box.scrollHeight });
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    box.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => {
      box.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [measure, subgroup?.mid]);

  useEffect(() => {
    setZoom(1);
    setNatural({ w: 0, h: 0 });
    setFitWidth(0);
    const box = boxRef.current;
    if (box) box.scrollTo({ left: 0, top: 0 });
  }, [subgroup?.mid]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (cardRef.current) await cardRef.current.requestFullscreen();
    } catch {
      onToast("浏览器不允许全屏");
    }
  };

  const resetView = () => {
    const box = boxRef.current;
    setZoom(1);
    if (box) box.scrollTo({ left: 0, top: 0 });
    requestAnimationFrame(measure);
  };

  const zoomAt = (nextZoom, clientX, clientY) => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    const value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(nextZoom * 100) / 100));
    if (!box || !canvas) {
      setZoom(value);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      setZoom(value);
      return;
    }
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    const boxRect = box.getBoundingClientRect();
    const style = getComputedStyle(box);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padTop = parseFloat(style.paddingTop) || 0;
    const nextWidth = rect.width * (value / zoom);
    const nextHeight = rect.height * (value / zoom);
    setZoom(value);
    requestAnimationFrame(() => {
      box.scrollLeft = padLeft - (clientX - boxRect.left) + fx * nextWidth;
      box.scrollTop = padTop - (clientY - boxRect.top) + fy * nextHeight;
      measure();
    });
  };

  const stepZoom = (delta) => {
    const box = boxRef.current;
    const boxRect = box?.getBoundingClientRect();
    zoomAt(zoom + delta, boxRect ? boxRect.left + boxRect.width / 2 : 0, boxRect ? boxRect.top + boxRect.height / 2 : 0);
  };

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      zoomAt(zoom + (event.deltaY < 0 ? 0.15 : -0.15), event.clientX, event.clientY);
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [zoom, subgroup?.mid]);

  useEffect(() => {
    if (!selectedCallout) return;
    const box = boxRef.current;
    const canvas = canvasRef.current;
    if (!box || !canvas) return;
    const spot = hotspots.find((item) => item.key === selectedCallout);
    if (!spot || !natural.w) return;
    const rect = canvas.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    const cx = ((spot.x + spot.right) / 2 / natural.w) * rect.width;
    const cy = ((spot.y + spot.bottom) / 2 / natural.h) * rect.height;
    box.scrollTo({
      left: rect.left - boxRect.left + box.scrollLeft + cx - box.clientWidth / 2,
      top: rect.top - boxRect.top + box.scrollTop + cy - box.clientHeight / 2,
      behavior: "smooth",
    });
  }, [selectedCallout, hotspots, natural.w, natural.h]);

  const startDrag = (event) => {
    if (event.button !== 0) return;
    const box = boxRef.current;
    if (!box) return;
    dragRef.current = { x: event.clientX, y: event.clientY, left: box.scrollLeft, top: box.scrollTop, moved: false };
  };

  const moveDrag = (event) => {
    const drag = dragRef.current;
    const box = boxRef.current;
    if (!drag || !box) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    box.classList.add("is-dragging");
    box.scrollLeft = drag.left - dx;
    box.scrollTop = drag.top - dy;
  };

  const endDrag = () => {
    dragRef.current = null;
    boxRef.current?.classList.remove("is-dragging");
    measure();
  };

  const jumpTo = (event) => {
    const box = boxRef.current;
    if (!box) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const fx = (event.clientX - rect.left) / rect.width;
    const fy = (event.clientY - rect.top) / rect.height;
    box.scrollTo({ left: fx * box.scrollWidth - box.clientWidth / 2, top: fy * box.scrollHeight - box.clientHeight / 2, behavior: "smooth" });
  };

  const canMinimap = Boolean(image);
  const activeSpot = hotspots.find((spot) => spot.key === selectedCallout) || null;

  return <section className={`epc-card epc-diagram-card${fullscreen ? " is-fullscreen" : ""}`} ref={cardRef}>
    <header className="epc-card-head">
      <div className="epc-card-title"><Cube /><span>爆炸图</span></div>
      <div className="epc-head-actions">
        <button type="button" className="epc-icon-btn" aria-label={fullscreen ? "退出全屏" : "全屏"} onClick={toggleFullscreen}>{fullscreen ? <ArrowsIn /> : <CornersOut />}</button>
        <button type="button" className="epc-icon-btn" aria-label="适应屏幕" onClick={resetView}><ArrowsOut /></button>
      </div>
    </header>

    {subgroup ? <div className="epc-diagram-wrap">
      <div
        className="epc-diagram"
        ref={boxRef}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={(event) => { if (event.target.closest(".epc-hotspot")) return; zoomAt(zoom * 1.5, event.clientX, event.clientY); }}
      >
        {image ? <div className="epc-canvas" ref={canvasRef} style={fitWidth ? { width: Math.round(fitWidth * zoom) } : undefined}>
          <img
            src={image}
            alt={subgroup.name}
            onLoad={(event) => {
              const img = event.currentTarget;
              const box = boxRef.current;
              if (!box || !img.naturalWidth || !img.naturalHeight) return;
              setNatural({ w: img.naturalWidth, h: img.naturalHeight });
              const ratio = img.naturalWidth / img.naturalHeight;
              const width = Math.min(box.clientWidth - 48, (box.clientHeight - 48) * ratio);
              setFitWidth(Math.max(80, Math.round(width)));
              requestAnimationFrame(measure);
            }}
            onError={() => onToast("爆炸图加载失败")}
          />
          {natural.w ? hotspots.map((spot) => <button
            key={`${spot.key}-${spot.x}-${spot.y}`}
            type="button"
            className={`epc-hotspot${selectedCallout === spot.key ? " is-active" : ""}`}
            style={{
              left: `${(spot.x / natural.w) * 100}%`,
              top: `${(spot.y / natural.h) * 100}%`,
              width: `${((spot.right - spot.x) / natural.w) * 100}%`,
              height: `${((spot.bottom - spot.y) / natural.h) * 100}%`,
            }}
            onClick={() => onSelectCallout(spot.key)}
            aria-label={`图号 ${spot.key}`}
          >{spot.key}</button>) : null}
        </div> : <p className="field-note">这张图没有可用的爆炸图</p>}
      </div>

      {activeSpot && natural.w ? <span
        className={`epc-callout-tip${activeSpot.right / natural.w > 0.55 ? " is-left" : ""}`}
        style={{
          left: `${((activeSpot.right / natural.w) * 100)}%`,
          top: `${(((activeSpot.y + activeSpot.bottom) / 2 / natural.h) * 100)}%`,
        }}
      >图号：{activeSpot.key}</span> : null}

      <div className="epc-zoom-stack">
        <button type="button" aria-label="放大" onClick={() => stepZoom(0.25)}><MagnifyingGlassPlus /></button>
        <button type="button" aria-label="缩小" onClick={() => stepZoom(-0.25)}><MagnifyingGlassMinus /></button>
        <button type="button" aria-label="适应屏幕" onClick={resetView}><ArrowsOut /></button>
        <button type="button" aria-label="重置视图" onClick={resetView}><ArrowsClockwise /></button>
        <span className="epc-zoom-value">{Math.round(zoom * 100)}%</span>
      </div>

      {canMinimap ? <div className="epc-minimap" onClick={jumpTo} role="presentation">
        <img src={image} alt="" />
        <span
          className="epc-minimap-view"
          style={{
            left: `${(viewport.left / Math.max(canvasSize.width, 1)) * 100}%`,
            top: `${(viewport.top / Math.max(canvasSize.height, 1)) * 100}%`,
            width: `${(viewport.width / Math.max(canvasSize.width, 1)) * 100}%`,
            height: `${(viewport.height / Math.max(canvasSize.height, 1)) * 100}%`,
          }}
        />
      </div> : null}
    </div> : <div className="epc-diagram-picker">
      {diagrams.length ? diagrams.map((item) => <button key={item.mid} type="button" className="epc-pick" onClick={() => onPickDiagram(item)}>
        <span className="epc-pick-figure">{item.figure}</span>
        {item.thumbnail ? <img src={item.thumbnail} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} /> : <span className="epc-pick-empty"><BookOpen /></span>}
        <span className="epc-pick-name">{item.name}</span>
      </button>) : <p className="field-note">没有匹配项</p>}
    </div>}

  </section>;
}
