import { useEffect, useState } from "react";
import { X } from "@phosphor-icons/react";
import { api } from "../api.js";

export default function EpcLoginModal({ onClose, onSaved, onToast }) {
  const [status, setStatus] = useState(null);
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api("/epc/status")
      .then((data) => {
        setStatus(data);
        if (data.account) setAccount(data.account);
      })
      .catch(() => {});
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const data = await api("/epc/login", {
        method: "POST",
        body: JSON.stringify({ account: account.trim(), password }),
      });
      setStatus(data);
      setPassword("");
      onToast?.("已登录极联");
      onSaved?.(data);
      onClose();
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    setError("");
    try {
      const data = await api("/epc/logout", { method: "POST" });
      setStatus(data);
      setPassword("");
      onToast?.("已退出极联");
      onSaved?.(data);
    } catch (logoutError) {
      setError(logoutError.message);
    }
  };

  return <div className="overlay modal-overlay"><div className="batch-modal epc-login-modal" role="dialog" aria-modal="true" aria-label="极联登录">
    <header><div><h2>极联登录</h2></div><button type="button" className="icon-button" aria-label="关闭" onClick={onClose}><X /></button></header>
    <form onSubmit={submit}>
      <label>账号<input value={account} autoComplete="username" placeholder="极联账号" onChange={(event) => setAccount(event.target.value)} /></label>
      <label>密码<input type="password" value={password} autoComplete="current-password" placeholder="登录密码" onChange={(event) => setPassword(event.target.value)} /></label>
      {error ? <small className="field-error">{error}</small> : null}
      {status?.configured
        ? <div className="epc-login-meta">
          <span>{status.account || status.userName || "已登录"}</span>
          <span>{status.quota ? `余 ${status.quota.remaining} 次` : "次数未知"}</span>
          <button type="button" className="text-button is-danger" onClick={logout}>退出登录</button>
        </div>
        : null}
      <footer>
        <button className="secondary-button" type="button" onClick={onClose}>取消</button>
        <button className="primary-button" type="submit" disabled={saving || !account.trim() || !password}>{saving ? "登录中..." : "登录"}</button>
      </footer>
    </form>
  </div></div>;
}
