import { MagnifyingGlass } from "@phosphor-icons/react";

export default function EpcLanding({ vin, onVin, onSubmit, loading, error, accountText, onLogin }) {
  return <div className="epc-landing">
    <div className="epc-landing-card">
      <form className="epc-landing-search" onSubmit={onSubmit}>
        <MagnifyingGlass />
        <span className="epc-landing-divider" />
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
        <img className="epc-hero-img" src={`${import.meta.env.BASE_URL}epc-hero.png`} alt="" />
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
