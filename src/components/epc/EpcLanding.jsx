import { MagnifyingGlass } from "@phosphor-icons/react";
import { Cylinder, Disc, Drop, Lightning } from "@phosphor-icons/react";

function HeroCar() {
  return <svg className="epc-hero-car" viewBox="0 0 300 150" aria-hidden="true">
    <ellipse cx="150" cy="134" rx="112" ry="7" fill="#eef1f6" />
    <path d="M36 108 L40 88 Q44 66 72 59 L112 46 Q130 40 152 40 L188 40 Q208 40 222 53 L248 75 Q264 81 270 89 L272 101 Q272 109 264 111 L48 111 Q38 111 36 108 Z" fill="#f9fbfd" stroke="#c9d3e0" strokeWidth="2" strokeLinejoin="round" />
    <path d="M92 52 Q104 45 124 42 L150 41 L150 74 L84 74 Q86 60 92 52 Z" fill="#eef3fa" stroke="#c9d3e0" strokeWidth="1.6" />
    <path d="M158 41 L186 41 Q200 42 210 51 L226 68 L158 68 Z" fill="#eef3fa" stroke="#c9d3e0" strokeWidth="1.6" />
    <circle cx="98" cy="111" r="22" fill="#f4f7fb" stroke="#c9d3e0" strokeWidth="2" />
    <circle cx="98" cy="111" r="9" fill="#fff" stroke="#c9d3e0" strokeWidth="2" />
    <circle cx="230" cy="111" r="22" fill="#f4f7fb" stroke="#c9d3e0" strokeWidth="2" />
    <circle cx="230" cy="111" r="9" fill="#fff" stroke="#c9d3e0" strokeWidth="2" />
    <path d="M262 84 L274 87 L274 94 L262 96" fill="#fff" stroke="#c9d3e0" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M44 92 L58 92" stroke="#d7dfea" strokeWidth="2" strokeLinecap="round" />
    <path d="M168 78 L200 78" stroke="#d7dfea" strokeWidth="1.6" strokeLinecap="round" />
  </svg>;
}

function HeroNode({ className, children }) {
  return <span className={`epc-hero-node ${className}`}>{children}</span>;
}

export default function EpcLanding({ vin, onVin, onSubmit, loading, error, accountText, onLogin }) {
  return <div className="epc-landing">
    <div className="epc-landing-card">
      <form className="epc-landing-search" onSubmit={onSubmit}>
        <MagnifyingGlass />
        <input
          autoFocus
          aria-label="VIN"
          placeholder="输入 17 位 VIN（车架号）"
          maxLength={17}
          value={vin}
          onChange={(event) => onVin(event.target.value.toUpperCase().replace(/\s+/g, ""))}
        />
        <span className="epc-landing-count">{vin.length}/17</span>
        <kbd>Enter</kbd>
        <button type="submit" className="epc-landing-submit" disabled={loading}>{loading ? "查询中" : "查询"}</button>
      </form>

      <div className="epc-landing-body">
        <div className="epc-hero">
          <HeroNode className="is-oil"><Cylinder /></HeroNode>
          <HeroNode className="is-plug"><Lightning /></HeroNode>
          <HeroNode className="is-drop"><Drop /></HeroNode>
          <HeroNode className="is-disc"><Disc /></HeroNode>
          <svg className="epc-hero-links" viewBox="0 0 620 250" aria-hidden="true">
            <path d="M100 52 Q150 96 232 108" />
            <path d="M520 52 Q470 96 388 108" />
            <path d="M100 200 Q150 156 232 144" />
            <path d="M520 200 Q470 156 388 144" />
          </svg>
          <HeroCar />
        </div>
        <h2>输入车架号，查询车辆配件</h2>
        <p>查询后可浏览车型对应的零件图谱</p>
        {error ? <p className="epc-landing-error">{error}</p> : null}
      </div>

      <footer className="epc-landing-foot">
        <button type="button" className="epc-landing-account" onClick={onLogin}>{accountText}</button>
      </footer>
    </div>
  </div>;
}
