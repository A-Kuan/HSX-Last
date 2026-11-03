import { spawn } from "node:child_process";

const children = [
  spawn(process.execPath, ["server/index.mjs"], { stdio: "inherit", env: { ...process.env, SKU_DB_PATH: process.env.SKU_DB_PATH || "data/sku-library.dev.sqlite" } }),
  spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev:web"], { stdio: "inherit" }),
];

const stop = () => children.forEach((child) => child.kill("SIGTERM"));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const child of children) child.on("exit", (code) => { if (code) { stop(); process.exitCode = code; } });
