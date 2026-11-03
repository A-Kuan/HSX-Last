import { createApp } from "./app.mjs";

const port = Number(process.env.PORT || 4188);
const host = process.env.HOST || "127.0.0.1";
const app = createApp();

app.listen(port, host, () => {
  console.log(`HSX SKU API listening on http://${host}:${port}`);
});

const shutdown = () => app.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
