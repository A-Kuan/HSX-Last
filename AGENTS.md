# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## 开发规则

- 界面里不加解释性 / 引导性文案：不在空态、下拉面板、字段旁写「点下方『新建商品组』即可」这类教用户操作的句子，也不写功能用途说明。状态只表达状态本身（搜索无结果时最多一句「没有匹配项」），列表本来为空时不补文字，能靠结构说清的就不要加说明。设计稿里既有的空态文案保持不动。

## Design decisions

- Density: desktop-first, one 1:1 pixel canvas at `100vw × 100vh`. Never reintroduce the old `width:111.11vw` + `transform:scale(.9)` fake-canvas trick — it made every metric oversized and pushed text onto fractional pixels. Base type is 13px, table body 13px, secondary 12px, page title 22px, controls 36px tall, SKU row 52px, group row 64px, thumbnail 46×36.
- 选择列统一用 `src/components/SearchSelect.jsx`（公用可搜索下拉）：触发器与选项行都按 flex 垂直居中，下拉面板 portal 到 body 用 fixed 定位、相对触发器水平居中，不会被抽屉/弹窗的 overflow 裁掉。商品组、品牌、件类、核实状态、资料状态、基础单位、配件品类筛选、导入方式全部改用它，不再写原生 `<select>`；商品组与品牌常驻搜索框，其余选项超过 5 条自动出现搜索框；「新建商品组」「新增品牌」用 `action: true` 固定落在面板底部。
- 配置中心（header nav `配置中心`）维护五类基础字典：配件品类、件类、套餐、品牌、单位，分别落在 `categories`、`part_types`/`part_sets`、`brands`、`units`，接口 `GET/POST /api/dictionaries[/:kind[/:id]]`。改名会级联更新商品组/SKU 上的文字，仍被引用的值删除返回 409；新增 SKU 或商品组时自动把新品牌、单位、品类补进字典。前端不再硬编码品牌清单与单位清单，配件品类改为字典下拉（`SearchSelect`，带「新建品类」动作）。
- SKU rows are collapsed on first entry: the initial view lists product groups only. Any active filter (search term, category, status tab) auto-expands the returned groups so matching SKUs are visible; manual expand/collapse is preserved across quiet refreshes. The group's image and name are a single expand toggle (in addition to the caret); the checkbox only selects.
- Group rows show whole-group totals, not the filtered list: `/api/catalog` returns `totalSkuCount` and `enabledSkuCount` per group, while `skus` stays narrowed by the search/status filter.
- Vehicle-first lookup is the second entry point (header nav `车型查询`): `vehicles` + `vehicle_aliases` (colloquial Chinese names and platform codes such as 卡宴/E3/9YA) + `part_sets` such as 三滤 + `vehicle_products` linking a vehicle to product groups by part type. The lookup page shows one card per part type, brands from enabled SKUs only, and marks part types with no catalogued product as 未建档. Only enabled SKUs are quoted.
- The vehicle library is maintained by hand (`车型库` nav): create/edit/delete a vehicle, add aliases, attach product groups per part type. `openDatabase` never seeds demo rows — the only automatic data is the reference dictionary (part types and part sets). Tests call `seedDemoData(db)` explicitly; do not wire it back into app startup.
- The VIN entry (`VIN 识别录入`) is UI-only: it validates 17 characters (no I/O/Q), reports that the decoding service is not wired, and hands the VIN to the manual-create drawer. Do not fake a decode result.
- SKU relations live in `sku_relations`: `interchange` rows are stored in a canonical order (both sides resolve), `supersedes` means `from` is the old part and `to` is the replacement. Chains resolve up to 10 hops; cycles and duplicates are rejected with 409.

## Current product scope

- Build for one desktop user; do not add mobile layouts or role/permission management.
- Maintain SKU information only. Exclude inventory, warehouses, bins, transfers, reservations, and stock quantities.
- Core records are product groups, SKUs, OE numbers, fitments, data status, and activity history.

- SKU creation uses the selected dual-column right drawer: product/SKU/OE on the left and compact fitment cards with one editor on the right; fixed footer. OE preserves original formatting and leading zeroes, supports batch preview, and deduplicates ignoring case/spaces/hyphens. Local incomplete drafts are explicitly labeled as saved to this device.

- User explicitly requires high fidelity to selected reference exec-339c26b6-fc64-4912-9d40-ce65058fcf08.png. Do not improvise styles, spacing, field order, drawer proportions or card anatomy. OE improvements must retain that visual language.

- User density adjustment: keep the selected dual-column layout, reduce drawer title to 24px, section titles 18px, fields/buttons 14px, controls 34px, footer 68px; reduce vertical whitespace so OE and notes appear sooner.
