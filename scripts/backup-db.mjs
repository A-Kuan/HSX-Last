import { mkdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { openDatabase } from "../server/db.mjs";

const source = resolve(process.env.SKU_DB_PATH || "data/sku-library.sqlite");
const backupDir = resolve(process.env.SKU_BACKUP_DIR || "data/backups");
mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = resolve(backupDir, `${basename(source, ".sqlite")}-${stamp}.sqlite`);
const db = openDatabase(source);
db.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
db.close();
console.log(target);
