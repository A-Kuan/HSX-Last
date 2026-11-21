// 本地界面连远端 API：node scripts/dev-remote.mjs
import { spawn } from "node:child_process";

const target = process.env.SKU_API_PROXY || "https://121.41.24.42";
spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "0.0.0.0", "--port", "5173"], {
  stdio: "inherit",
  env: { ...process.env, SKU_API_PROXY: target },
}).on("exit", (code) => process.exit(code ?? 0));
