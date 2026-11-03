# HSX SKU 商品库

单人使用的汽配 SKU 资料维护工具。当前范围只包含商品组、SKU、OE 号、车型适配、资料状态和操作记录，不包含库存、仓位、调拨或权限管理。

## 数据结构

- 商品组：商品名称、参考编码、配件品类、图片和说明
- SKU：SKU 编码、品牌、品牌件号、单位、包装数量、销售价、资料状态和备注
- OE：一个 SKU 可维护多个 OE 号
- 车型适配：品牌、车系、年款、版本、发动机/配置、安装位置、来源和核实状态
- 操作记录：记录新增、编辑和状态变化

数据使用 SQLite 持久化，默认路径为 `data/sku-library.sqlite`。可通过 `SKU_DB_PATH` 修改。

## 本地开发

```bash
npm install
npm run dev
```

`npm run dev` 会同时启动：

- 页面：`http://127.0.0.1:5173/hsx-sku/`
- API：`http://127.0.0.1:4188`

## 构建与测试

```bash
npm run build
npm test
```

## 数据备份

```bash
npm run backup
```

默认备份到 `data/backups/`，生产环境可通过 `SKU_BACKUP_DIR` 指定目录。

生产访问路径：`/hsx-sku/`
