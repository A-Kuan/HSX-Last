# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## 开发规则

- 界面里不加解释性 / 引导性文案：不在空态、下拉面板、字段旁写「点下方『新建商品组』即可」这类教用户操作的句子，也不写功能用途说明。状态只表达状态本身（搜索无结果时最多一句「没有匹配项」），列表本来为空时不补文字，能靠结构说清的就不要加说明。设计稿里既有的空态文案保持不动。

## Design decisions

- 视觉语言（2026-11 改版，参照用户提供的「虎山行」后台稿）：`src/design.css` 在 `styles.css` 之后覆盖，统一 tokens —— 主色 `#2f6bff`、页面底色 `#f6f7f9`、卡片白底 + `1px #eaedf2` 边框 + 12px 圆角；文字 13px、页标题 24px。外壳为 60px 顶栏：胶囊导航（选中态浅蓝底）+ 全局搜索（Enter 跳到 SKU 商品库并带入筛选，位置不限）+ 配置中心齿轮，不要求品牌区；页面 = 标题行（右侧主按钮）+ 胶囊页签 + 筛选行 + 白色表格卡片 + 底部分页（页码按钮）。抽屉头 64px、底部按钮右对齐；弹窗 14px 圆角、Toast 右下角。新增界面一律用这套 tokens，不再写一次性配色。
- Density: desktop-first, one 1:1 pixel canvas at `100vw × 100vh`. Never reintroduce the old `width:111.11vw` + `transform:scale(.9)` fake-canvas trick — it made every metric oversized and pushed text onto fractional pixels. Base type is 13px, table body 13px, secondary 12px, page title 22px, controls 36px tall, SKU row 52px, group row 64px, thumbnail 46×36.
- 选择列统一用 `src/components/SearchSelect.jsx`（公用可搜索下拉）：触发器与选项行都按 flex 垂直居中，下拉面板 portal 到 body 用 fixed 定位、相对触发器水平居中，不会被抽屉/弹窗的 overflow 裁掉。商品组、品牌、件类、核实状态、资料状态、基础单位、配件品类筛选、导入方式全部改用它，不再写原生 `<select>`；商品组与品牌常驻搜索框，其余选项超过 5 条自动出现搜索框；「新建商品组」「新增品牌」用 `action: true` 固定落在面板底部；其中 SKU 抽屉里的「新增品牌」打开一个弹窗（名称、英文名/别名、状态、备注），保存后直接选中该品牌，不再用行内单输入框。
- 配置中心（header nav `配置中心`）维护基础字典：配件品类、件类、套餐、品牌、单位、产地、渠道，分别落在 `categories`、`part_types`/`part_sets`、`brands`、`units`、`origins`、`channels`，接口 `GET/POST /api/dictionaries[/:kind[/:id]]`；新增/编辑统一走右侧抽屉（品牌字段：名称、英文名/别名、状态、备注；品类带编码前缀；套餐带件类勾选）。品牌的 `enabled=0` 表示停用：配置中心列表显示「已停用」标签，SKU 抽屉的品牌下拉不再出现；`alias` 作为搜索关键字。改名会级联更新商品组/SKU 上的文字，仍被引用的值删除返回 409；新增 SKU 或商品组时自动把新品牌、单位、品类补进字典。前端不再硬编码品牌清单与单位清单，配件品类改为字典下拉（`SearchSelect`，带「新建品类」动作）。
- SKU 另有两个字典字段：`origin`（产地：进口/国产）与 `channel`（渠道：4S/服务站、平行进口、电商、批发），落在 `origins`/`channels` 表，配置中心同样可维护与级联改名；保存 SKU 时自动补录。二者只做展示与归类，不参与分组判定（分组只看 OE + 安装位置）。
- 件源与品牌分开建模：`skus.source_type` 取 `oem`（原厂件）/`brand`（品牌件）/`used`（拆车件），默认 `brand`；原厂件必须填 `skus.oem_brand`（整车品牌，字典 `oem_brands`，配置中心「整车品牌」页签维护、改名级联），`brand` 只表示实际制造商、可空；件源选「原厂件」时抽屉里隐藏「品牌」「品牌件号」两项，服务端也会把这两个字段清空存储（原厂件没有品牌件号）。「进口原厂」「服务站原厂」不建品牌，由已有的产地/渠道 + 原厂件组合表达。唯一键是 `(source_type, oem_brand, brand, part_no, origin)` 的部分索引（`WHERE part_no <> ''`），所以同品牌同件号的进口件与国产件可以并存。列表展示：原厂件显示「奥迪原厂」、拆车件显示「品牌（拆车）」；「资料待完善」= 品牌与整车品牌都为空 或 没有 OE。CSV 末尾新增「件源类型」「整车品牌」两列（旧文件不带这两列时按品牌件导入）。品牌件号与销售价都是可空的：原厂件没有品牌件号，价格未定时留空（存 0，界面显示「面议」）。
- 商品组（header nav `商品组`）是独立维护的实体：`GET/POST /api/groups`、`PUT/DELETE /api/groups/:id`，字段为名称、参考编码、品类（字典值）、安装位置、说明；新增/编辑走右侧抽屉，组级 OE 的录入、断点日期、设为主号、移除都在抽屉内完成；商品组不展示图片（`product_groups.image` 保留）。列表展示 SKU 数与车型引用数；删除时若有 SKU（`skus.group_id`）或车型映射（`vehicle_products`）引用则返回 409 并说明原因。SKU 抽屉里的「新建商品组」保留为快捷入口。
- SKU 图片：`skus.image` 存文件名，文件落盘在 `data/uploads`（`SKU_UPLOAD_DIR` 可改），通过 `GET/POST/DELETE /api/skus/:id/image` 读取/上传/删除；列表行有缩略图槽位（无图显示上传位，有图点开大图查看器），SKU 抽屉与详情抽屉都能上传/更换/移除；上传前在浏览器端压到最长边 900px。
- 商品组参考编码默认由系统生成：**品类前缀 + 4 位流水号**（如 `LX-0001`），前缀在配置中心「配件品类」页签维护（`categories.prefix`，默认 制动片 ZD / 滤清器 LX / 底盘悬挂 DP / 保养件 BY，没配前缀退回 `G`），逻辑在 `src/groupReference.js`，按前缀各自编号并跳过已占用的号。新建商品组或在 SKU 抽屉里选「新建商品组」时按当前品类自动填好，切换品类会跟着重算；字段仍可改——它同时是 CSV 导入匹配商品组、对接供应商目录的业务键，所以不做成不可见/不可改的内部 ID。
- 组级 OE 同步与编辑：保存 SKU 时把它的 OE **并入**组级列表（`mergeSkuOesIntoGroup`，只增不删，已有条目的断点日期/主号保持不变）；SKU 商品库展开商品组后，组级 OE 那一条可以直接「编辑」——芯片上 ★ 设/取消主号、× 移除，下方输入 OE 与断点日期后「添加」，保存走 `PUT /api/groups/:id`。
- 件类与按车找件：件类扩展到 机油/空气/空调/燃油滤清器 + 制动片、制动盘、制动线、变速箱滤网、密封垫、油液、火花塞、雨刮片；Macan 车型挂了 24 个商品组。车型查询没有件类关键词时，展示「该车已挂的件类 + 三滤」，未挂的件类标为未建档。
- 组级主 OE 必须显式设置：商品组抽屉里点 OE 芯片的 ★ 指定，再点一次取消；未设置时 `primaryOe` 为空，列表摘要与 OE 条都不显示「主」徽标，也**不再按 OE 号排序兜底**。OE 条里「现行 / 历史」按断点日期区分（无日期或 99999999=现行）。从 SKU 上卷的 OE 一律不带主号标记。
- 分组的判定依据是**组级 OE 号**（`group_oe_numbers`，启动时从各 SKU 的 OE 上卷，幂等）。「同一个件」的判定口径是 **OE 有交集 + 安装位置一致**（`product_groups.position`）：SKU 抽屉里 OE 命中别的组时给出提示，位置一致才提供「改归该组」；「合并商品组」先预览（移动 SKU 数 / 车型映射 / 重复映射 / OE 重叠与并集）再执行，位置不同直接 409。
- SKU rows are collapsed on first entry: the initial view lists product groups only. Any active filter (search term, category, status tab) auto-expands the returned groups so matching SKUs are visible; manual expand/collapse is preserved across quiet refreshes. The group's name is an expand toggle (in addition to the caret); the checkbox only selects.
- Group rows show whole-group totals, not the filtered list: `/api/catalog` returns `totalSkuCount` and `enabledSkuCount` per group, while `skus` stays narrowed by the search/status filter.
- Vehicle-first lookup is the second entry point (header nav `车型查询`): `vehicles` + `vehicle_aliases` (colloquial Chinese names and platform codes such as 卡宴/E3/9YA) + `part_sets` such as 三滤 + `vehicle_products` linking a vehicle to product groups by part type. The lookup page shows one card per part type, brands from enabled SKUs only, and marks part types with no catalogued product as 未建档. Only enabled SKUs are quoted.
- The vehicle library is maintained by hand (`车型库` nav): create/edit/delete a vehicle, add aliases, attach product groups per part type. `openDatabase` never seeds demo rows — the only automatic data is the reference dictionary (part types and part sets). Tests call `seedDemoData(db)` explicitly; do not wire it back into app startup.
- VIN 识别（`车型库 → VIN 识别录入`）改为本地解码：`GET /api/vin/decode` 由 WMI 映射品牌、第 10 位映射年款、第 11 位映射总装厂（只覆盖内置小表，不猜车型）；车型保存时自动把 VIN 前 8 位学成规则（`vehicle_vin_rules`），解码按最长前缀带出车系/代系/发动机，规则可在「VIN 规则」弹窗查看与删除。`vehicles.vin` 唯一（部分索引），车型抽屉有 VIN 字段；车型查询支持整串 VIN 或 ≥6 位尾号命中。
- SKU relations live in `sku_relations`: `interchange` rows are stored in a canonical order (both sides resolve), `supersedes` means `from` is the old part and `to` is the replacement. Chains resolve up to 10 hops; cycles and duplicates are rejected with 409.

## Current product scope

- Build for one desktop user; do not add mobile layouts or role/permission management.
- Maintain SKU information only. Exclude inventory, warehouses, bins, transfers, reservations, and stock quantities.
- Core records are product groups, SKUs, OE numbers, fitments, data status, and activity history.

- SKU creation uses the selected dual-column right drawer: product/SKU/OE on the left and compact fitment cards with one editor on the right; fixed footer. OE preserves original formatting and leading zeroes, supports batch preview, and deduplicates ignoring case/spaces/hyphens. Local incomplete drafts are explicitly labeled as saved to this device.

- User explicitly requires high fidelity to selected reference exec-339c26b6-fc64-4912-9d40-ce65058fcf08.png. Do not improvise styles, spacing, field order, drawer proportions or card anatomy. OE improvements must retain that visual language.

- User density adjustment: keep the selected dual-column layout, reduce drawer title to 24px, section titles 18px, fields/buttons 14px, controls 34px, footer 68px; reduce vertical whitespace so OE and notes appear sooner.
