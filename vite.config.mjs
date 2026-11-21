import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 本地开发默认连本机 API；设置 SKU_API_PROXY 可改连远端，例如：
//   SKU_API_PROXY=https://121.41.24.42  npm run dev:web
const apiProxyTarget = (process.env.SKU_API_PROXY || "http://127.0.0.1:4188").replace(/\/+$/, "");

export default defineConfig({
  base: "/hsx-sku/",
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    proxy: {
      "/hsx-sku/api": {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: false,
      },
    },
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
