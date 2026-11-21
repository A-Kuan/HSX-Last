import { useEffect, useRef, useState } from "react";
import { ImageSquare, Plus, X } from "@phosphor-icons/react";
import { API_BASE, api } from "../api.js";
import { fileToDataUrl } from "../imageUtils.js";

export default function SkuImageGallery({ skuId, onChanged, onNotice }) {
  const [images, setImages] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setImages(null);
    if (!skuId) return undefined;
    api(`/skus/${encodeURIComponent(skuId)}/images`)
      .then((data) => { if (!cancelled) setImages(data.images || []); })
      .catch(() => { if (!cancelled) setImages([]); });
    return () => { cancelled = true; };
  }, [skuId]);

  const upload = async (event) => {
    const files = [...(event.target.files || [])];
    event.target.value = "";
    if (!files.length || busy) return;
    setBusy(true);
    try {
      const dataUrls = [];
      for (const file of files) dataUrls.push(await fileToDataUrl(file));
      const data = await api(`/skus/${encodeURIComponent(skuId)}/images`, { method: "POST", body: JSON.stringify({ dataUrls }) });
      setImages(data.images || []);
      onChanged?.();
      onNotice?.(`已上传 ${dataUrls.length} 张实物图`);
    } catch (error) {
      onNotice?.(error.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (imageId) => {
    if (busy) return;
    setBusy(true);
    try {
      const data = await api(`/skus/${encodeURIComponent(skuId)}/images/${imageId}`, { method: "DELETE" });
      setImages(data.images || []);
      onChanged?.();
      onNotice?.("实物图已移除");
    } catch (error) {
      onNotice?.(error.message);
    } finally {
      setBusy(false);
    }
  };

  return <div className="sku-image-gallery">
    {(images || []).map((image) => <div className="sku-image-item" key={image.id}>
      <img src={`${API_BASE}/skus/${encodeURIComponent(skuId)}/images/${image.id}`} alt="" />
      <button type="button" className="sku-image-remove" aria-label="移除这张图" onClick={() => remove(image.id)}><X /></button>
    </div>)}
    <button type="button" className="sku-image-add" onClick={() => inputRef.current?.click()} disabled={busy} aria-label="上传实物图">
      {busy ? <span>上传中</span> : <><Plus /><span>上传</span></>}
    </button>
    <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={upload} aria-label="上传实物图" />
    {images === null ? <span className="field-note">加载中…</span> : images.length ? null : <span className="field-note">暂无实物图</span>}
  </div>;
}
