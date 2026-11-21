import { useEffect, useRef, useState } from "react";
import { ArrowsIn, ArrowsOut, BookOpen, CornersOut, MagnifyingGlassMinus, MagnifyingGlassPlus } from "@phosphor-icons/react";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.15;
const clampZoom = (value) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));

/** 爆炸图面板：缩放（滚轮以光标为中心）、拖拽平移、图号热区、缩略导航、全屏。 */
export default function DiagramPanel({
  subgroup,
  diagrams,
  categoryPicked = true,
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
  const imgRef = useRef(null);
  const labelRef = useRef(null);
  const dragRef = useRef(null);
  const zoomRef = useRef(1);
  const fitRef = useRef(0);
  const frameRef = useRef(0);
  const pendingRef = useRef(null);
  const naturalRef = useRef({ w: 0, h: 0 });
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [fullscreen, setFullscreen] = useState(false);

  // 缩放直接写 DOM（width + 百分比文字），不进 React state：滚轮连续触发时不再整块重渲染
  const paintZoom = (value) => {
    const canvas = canvasRef.current;
    const fit = fitRef.current;
    zoomRef.current = value;
    if (canvas && fit) canvas.style.width = `${Math.round(fit * value)}px`;
    if (labelRef.current) labelRef.current.textContent = `${Math.round(value * 100)}%`;
  };

  const measureFit = () => {
    const box = boxRef.current;
    const img = imgRef.current;
    if (!box || !img || !img.naturalWidth) return 1;
    const ratio = img.naturalWidth / img.naturalHeight;
    const width = Math.min(box.clientWidth - 48, (box.clientHeight - 48) * ratio);
    fitRef.current = Math.max(80, Math.round(width));
    return 1;
  };

  const refit = () => {
    const zoomValue = measureFit();
    paintZoom(zoomValue);
    const box = boxRef.current;
    if (box) box.scrollTo({ left: 0, top: 0 });
  };

  const zoomAt = (nextZoom, clientX, clientY) => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    const value = clampZoom(nextZoom);
    if (!box || !canvas || !fitRef.current) {
      paintZoom(value);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      paintZoom(value);
      return;
    }
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    const boxRect = box.getBoundingClientRect();
    const style = getComputedStyle(box);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padTop = parseFloat(style.paddingTop) || 0;
    const nextWidth = fitRef.current * value;
    const nextHeight = (nextWidth * naturalRef.current.h) / Math.max(1, naturalRef.current.w);
    paintZoom(value);
    box.scrollLeft = padLeft - (clientX - boxRect.left) + fx * nextWidth;
    box.scrollTop = padTop - (clientY - boxRect.top) + fy * nextHeight;
  };

  // 滚轮按帧合并：一帧最多应用一次缩放，避免每个 wheel 事件都触发一轮布局
  const scheduleZoom = (nextZoom, clientX, clientY) => {
    pendingRef.current = { value: nextZoom, x: clientX, y: clientY };
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) zoomAt(pending.value, pending.x, pending.y);
    });
  };

  useEffect(() => () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); }, []);

  useEffect(() => {
    setNatural({ w: 0, h: 0 });
    naturalRef.current = { w: 0, h: 0 };
    zoomRef.current = 1;
    fitRef.current = 0;
    const box = boxRef.current;
    if (box) box.scrollTo({ left: 0, top: 0 });
  }, [subgroup?.mid]);

  useEffect(() => {
    const onChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));
      requestAnimationFrame(() => { measureFit(); paintZoom(zoomRef.current); });
    };
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
    refit();
  };

  const stepZoom = (delta) => {
    const box = boxRef.current;
    const boxRect = box?.getBoundingClientRect();
    zoomAt(zoomRef.current + delta, boxRect ? boxRect.left + boxRect.width / 2 : 0, boxRect ? boxRect.top + boxRect.height / 2 : 0);
  };

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      scheduleZoom(zoomRef.current + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), event.clientX, event.clientY);
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [subgroup?.mid]);

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
  };


  return <section className={`epc-card epc-diagram-card${fullscreen ? " is-fullscreen" : ""}`} ref={cardRef}>
    {subgroup ? <div className="epc-diagram-wrap">
      <div
        className="epc-diagram"
        ref={boxRef}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={(event) => { if (event.target.closest(".epc-hotspot")) return; zoomAt(zoomRef.current * 1.5, event.clientX, event.clientY); }}
      >
        {image ? <div className="epc-canvas" ref={canvasRef}>
          <img
            ref={imgRef}
            src={image}
            alt={subgroup.name}
            onLoad={(event) => {
              const img = event.currentTarget;
              if (!img.naturalWidth || !img.naturalHeight) return;
              naturalRef.current = { w: img.naturalWidth, h: img.naturalHeight };
              setNatural(naturalRef.current);
              measureFit();
              paintZoom(1);
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

      <div className="epc-zoom-stack">
        <button type="button" aria-label="放大" onClick={() => stepZoom(0.25)}><MagnifyingGlassPlus /></button>
        <button type="button" aria-label="缩小" onClick={() => stepZoom(-0.25)}><MagnifyingGlassMinus /></button>
        <button type="button" aria-label="适应屏幕" onClick={resetView}><ArrowsOut /></button>
        <button type="button" aria-label={fullscreen ? "退出全屏" : "全屏"} onClick={toggleFullscreen}>{fullscreen ? <ArrowsIn /> : <CornersOut />}</button>
        <span className="epc-zoom-value" ref={labelRef}>100%</span>
      </div>

    </div> : <div className="epc-diagram-picker">
      {diagrams.length ? diagrams.map((item) => <button key={item.mid} type="button" className="epc-pick" onClick={() => onPickDiagram(item)}>
        <span className="epc-pick-figure">{item.figure}</span>
        {item.thumbnail ? <img src={item.thumbnail} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} /> : <span className="epc-pick-empty"><BookOpen /></span>}
        <span className="epc-pick-name">{item.name}</span>
      </button>) : <p className="field-note">{categoryPicked ? "没有匹配项" : "选择左侧主组查看分解图"}</p>}
    </div>}

  </section>;
}
