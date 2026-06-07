# StarMap

2350 年人类文明太阳周边 50 光年 3D 星图。当前 SQLite 种子包含核心设定恒星系、补充非宜居近邻恒星系、褐矮星/亚恒星天体、白矮星科研点，以及 25-50 光年内的关键真实行星系统。

## 打开方式

Windows 下双击：

```powershell
Start-StarMap.bat
```

或在 PowerShell 中运行：

```powershell
.\Start-StarMap.ps1
```

脚本会自动：

- 检查 Python 3。
- 创建隔离的 Python 虚拟环境（.venv）。
- 自动安装 `requirements.txt` 中的依赖（如果有）。
- 尝试停止当前 StarMap 目录下的旧 `server.py` 服务，并清理目标端口的旧监听进程。
- 初始化 `data/stars.sqlite`。
- 选择可用端口，默认从 `8765` 开始。
- 启动本地 Web 服务。
- 打开浏览器。

启动后访问脚本输出的地址，例如：

```text
http://127.0.0.1:8765/
```

停止服务：回到启动窗口按 `Ctrl+C`。

## 页面能力

- Three.js 3D 星图，支持拖拽旋转、滚轮缩放，`W/A/S/D/Q/E` 按当前镜头方向飞行。
- 标注 `X+ 银心`、`Y+ 银河自旋方向`、`Z+ 北银极`。
- 标注八象限、25 光年内圈与 50 光年边界。UI 开关可显示固定颜色、轻微错位的**八象限边界 Box**。
- 支持势力、天体类型、恒星类型、行星数量、势力类型、自由文本和年份筛选。
- 点击势力图例会高亮该势力控制的恒星系，按实力顺序排列。
- 恒星点大小会根据其光谱类型和类别自动调整。
- 可显示/隐藏宜居评分标签：星图主视图在恒星系下方显示系统内天体评分总和，内部结构视图在行星/卫星名称下方单独显示天体评分。
- 恒星和星系天体会渲染**控制范围球体**（基于 `可容忍统治信息传播时间 × 信息传播速度 × ftl速度` 计算）。
- 点击恒星系查看 2350 归属、现实口径、设定统计等详细信息。支持 Markdown 粗体/斜体语法自动渲染，**3D 场景中的名字也会自动应用斜体**（用来标注虚拟天体）。
- 详情面板支持横向章节导航、侧边章节导航和字段显示开关；默认全选，可快速全选/全不选。
- `Ctrl + 点击` 两个恒星系会绘制虚线并显示两者距离；双击虚线或距离标签可删除该测距线。
- 双击恒星系会展开内部结构视图，恒星、行星、卫星、小行星带和轨道设施都可点击。
- 如果某恒星拥有宜居带设定 (`hz_inner`, `hz_outer`)，进入内部结构后会渲染发光的**宜居带环**。
- 如果双击恒星后只有自动生成的占位天体，镜头只会拉近主星；有正式内部结构种子的恒星系会展开缩小主星、行星轨道、卫星和小行星带。双击内部行星/卫星会保持或打开内部结构并选中该天体。
- Agent 控制台通过下拉菜单选择显示，支持 zoom、距离计算、最近邻、筛选和内部结构查询。
- 时间默认 `1秒/秒`，空格键暂停/继续；时间面板可用预设或自定义 `年/月/日/时/分/秒` 组合流速。
- 舰队面板支持舰级选择、部署/建造、选中舰船、跟随、定位和进入相关星系；不同舰级使用不同 3D 形状和短码图标。
- 选中舰船或小行星后，在星图或星系内部视图中双击右键可下达航行命令；点恒星飞向恒星，点内部天体飞向该天体，点空处飞向当前视平面坐标。
- 保存/读取面板可保存镜头、筛选项、时间流、当前选中对象、星系视图和舰船状态；保存文件写入 `saves/`，实际 JSON 保存档被 git 忽略。

## 数据口径

- 虚构恒星系、虚构天体和纯设定设施名在数据源中用 `_名字_` 标记，页面会渲染为斜体。例：`_李-哈特曼_ / _Li-Hartman_`、`_草原星_`、`_S&F 数据穹顶_`。
- 真实天体名称保持普通文本；如果说明中有设定推演，会用 `_..._` 标记该段。纯设定字段会整句存为 `_..._`，例如 `_边境黄金压力锅：远岭联营经营权，母星方保留法理和黄金股。_`。
- 太阳系已补充八大行星平均轨道、月球、木星主要伽利略卫星、泰坦、主小行星带与柯伊伯带。
- Li-Hartman 内部结构参考 `设定/李-哈特曼恒星系完整设定.md`，包含主星、宜居链、主要卫星、小行星带和外缘冰小天体带；其地图坐标位于 GJ 1002 附近的 `-+-/++-` 交界带。
- 25-50 光年扩展包含 TRAPPIST-1、LHS 1140、GJ 357、55 Cancri、HD 40307、HD 85512、L 98-59、GJ 486、61 Vir、HD 69830、Upsilon Andromedae、47 UMa、GJ 433、GJ 180 等关键真实系统，并区分稳健/候选宜居与非宜居。
- 宜居/地球化评分使用 `habitabilityScore`。单个天体评分可以大于 1，因为地球不是宇宙尺度上必然最宜居的上限；恒星系评分是内部天体评分求和。评分必须手动写入数据，生成脚本和前端都不会再从“宜居带、可改造、地球化”等说明文字推断分数或状态。
- 内部天体可用 `terraformStatus` 标注状态：`natural_habitable`、`terraformed`、`terraforming`、`terraformable`、`habitable`、`none`。Li-Hartman 中 `_环匣_ / _Ringbox_` 本体为 `none` 且 0 分，主卫星 `_匣_ / _Xia_` 为 `terraforming` 且 0.62 分。
- 有排名势力会自动补足可点击的虚构地球化/可地球化卫星，而不是虚构行星；这些小型卫星更容易解释为当前现实观测暂未发现。补足后的 faction 级 `habitabilityScore` 总和按 rank 从高到低递减。
- 自动生成的虚构卫星名称均用 `_..._` 斜体标记；说明统一以 `_虚构天体：..._` 开头，作为过滤标签和设定口径，不为这些对象单独写现实口径。
- 每个恒星系和内部天体都有 `rule_info_time`、`info_speed`、`ftl_speed`；控制范围球半径按 `rule_info_time × info_speed × ftl_speed` 计算。无 FTL 时 `ftl_speed = 1`。

## Agent/API 接口

浏览器内可用：

```js
await StarMapAgent.zoomToStar("GJ 1002")
await StarMapAgent.distanceBetween("gj1002", "teegarden")
await StarMapAgent.nearestTo("李-哈特曼", 5)
StarMapAgent.searchStars("美丽花园")
StarMapAgent.filterStars({ objectType: "brown_dwarf" })
StarMapAgent.filterStars({ minHabitabilityScore: 1.2, terraformStatus: "terraforming" })
await StarMapAgent.openSystem("li-hartman")
StarMapAgent.setHabitabilityLabels(false)
await StarMapAgent.saveState("story-checkpoint")
await StarMapAgent.loadState("story-checkpoint")
StarMapAgent.listSaves()
const ship = StarMapAgent.deployShip({ name: "晨线-01", shipClass: "explorer", locationStarId: "sol" })
StarMapAgent.moveShip(ship.id, "gj1002")
StarMapAgent.moveShipToPoint(ship.id, [1, 0, 2], { label: "自由航点" })
StarMapAgent.addAsteroid({ name: "测试小行星", locationStarId: "sol", destinationStarId: "alpha" })
await StarMapAgent.addStar({ id: "test", name: "Test" }) // 调用后端创建恒星
await StarMapAgent.updateStar({ id: "test", habitable: 1 }) // 调用后端更新恒星
await StarMapAgent.addBody({ id: "test-b", starId: "test", name: "_Test b_", bodyType: "planet", orbitAu: 0.8 })
await StarMapAgent.updateBody({ id: "test-b", terraformStatus: "terraforming", habitabilityScore: 0.66, rule_info_time: 0.12 })
StarMapAgent.getState()
```

HTTP API：

```text
GET /api/stars
GET /api/stars?class=M&minPlanets=3&minHabitabilityScore=1.2&includeOuter=1
GET /api/search?q=褐矮星&objectType=brown_dwarf
GET /api/star?id=gj1002
GET /api/factions
GET /api/filter-options
GET /api/timeline
GET /api/system?id=li-hartman
GET /api/distance?from=gj1002&to=teegarden
GET /api/nearest?from=li-hartman&limit=5
GET /api/zoom-target?star=gj1002
GET /api/saves
GET /api/saves?name=story-checkpoint
GET /api/docs
POST /api/saves
POST|PUT|PATCH /api/stars
POST|PUT|PATCH /api/system-bodies
```

`POST /api/saves` 会检查 `schemaVersion`。版本不兼容时返回 `409` 和结构化错误，前端会在保存/读取面板中显示失败原因。

新增或替换恒星系：

```http
POST|PUT|PATCH /api/stars
Content-Type: application/json
```

JSON body 使用前端 star schema，例如：

```json
{
  "id": "new-system",
  "name": "New System / 新星系",
  "short": "New System",
  "octant": "---",
  "order": 8,
  "distance": 24.8,
  "arrival": 2302.8,
  "xyz": [-8.0, -12.0, -18.0],
  "faction": "许可/争议区",
  "rank": "-",
  "className": "K3V",
  "planets": "0-1 候选宜居。",
  "objectType": "star_system",
  "spectralClass": "K",
  "starCount": 1,
  "planetCount": 1,
  "confirmedPlanets": 0,
  "candidatePlanets": 1,
  "factionType": "许可/争议",
  "displayAfter": 2350,
  "reality": "待补充。如果是虚拟天体，请用 _星名_ 表示。",
  "setting": "待补充。",
  "habitable": 1,
  "habitabilityScore": 0.66,
  "status": "license",
  "age": "1.5 Gyr",
  "lifespan": "100 Gyr",
  "disasters": "耀斑爆发",
  "hz_inner": 0.1,
  "hz_outer": 0.2,
  "rule_info_time": 1.0,
  "info_speed": 1.0,
  "ftl_speed": 1.0
}
```

新增或修改恒星系内部天体：

```http
POST|PUT|PATCH /api/system-bodies
Content-Type: application/json
```

```json
{
  "id": "new-system-b",
  "starId": "new-system",
  "name": "_New System b_",
  "bodyType": "planet",
  "orbitAu": 0.8,
  "radiusLabel": "类地候选",
  "summary": "_新增行星。_",
  "terraformStatus": "terraformable",
  "habitabilityScore": 0.44,
  "sortOrder": 1,
  "rule_info_time": 0.12,
  "info_speed": 1.0,
  "ftl_speed": 1.0
}
```

## 数据库

SQLite 文件：

```text
data/stars.sqlite
```

初始化脚本：

```powershell
.\.venv\Scripts\python.exe scripts\init_db.py --force
```

当前数据库种子优先从已生成的 `star_data.js` 读取 50 光年全量恒星系，再叠加 `scripts/seed_data.py` 中的扩展数据和覆盖项；`scripts/init_db.py --force` 会重建 SQLite v5 schema，并重新推导/补足内部天体评分。后续可以直接编辑 SQLite，或通过 `POST|PUT|PATCH /api/stars` 添加/修改恒星系，通过 `POST|PUT|PATCH /api/system-bodies` 添加/修改恒星系内部天体。已有记录支持局部更新，只需要传 `id` 和变化字段；新记录仍需要完整必填字段。

主要表：

- `stars`：恒星系、非恒星天体、势力归属、筛选字段和系统级 `habitability_score`。
- `aliases`：名称/简称检索别名。
- `system_bodies`：双击后显示的恒星、行星、卫星、小行星带和轨道设施节点，包含 `terraform_status` 与单天体 `habitability_score`。

## 文件结构

```text
app.js                    Three.js 星图、交互、Agent 浏览器 API
server.py                 本地 HTTP/API 服务
styles.css                页面布局与控件样式
index.html                单页入口
data/stars.sqlite         SQLite 数据库
saves/                    本地状态保存目录；JSON 保存档被 git 忽略
scripts/init_db.py        从种子重建/迁移 SQLite
scripts/seed_data.py      现实恒星补充、设定覆盖、内部天体种子
Start-StarMap.ps1/.bat    一键安装依赖、初始化数据库并启动网页
update_reference.ps1/.bat 从外部整理数据刷新参考文件
```

## 坐标约定

数据库中的 `xyz` 是银河坐标：

- `X+` 指向银心。
- `Y+` 指向银河自旋方向。
- `Z+` 指向北银极。

Three.js 世界坐标映射为：

```text
world.x = X
world.y = Z
world.z = Y
```

这样页面竖直方向就是北银极。
