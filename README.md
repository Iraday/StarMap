# StarMap

2350 年人类文明太阳周边 25 光年 3D 星图。当前 SQLite 种子包含核心设定恒星系、补充非宜居近邻恒星系、褐矮星/亚恒星天体、白矮星科研点和本地星际云层。

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
- 标注八象限与 25 光年边界。UI 开关可显示带颜色的**八象限边界 Box**。
- 支持势力、天体类型、恒星类型、行星数量、势力类型、自由文本和年份筛选。
- 点击势力图例会高亮该势力控制的恒星系，按实力顺序排列。
- 恒星点大小会根据其光谱类型和类别自动调整。
- 恒星和星系天体会渲染**控制范围球体**（基于 `可容忍统治信息传播时间 × 信息传播速度 × ftl速度` 计算）。
- 点击恒星系查看 2350 归属、现实口径、设定统计等详细信息。支持 Markdown 粗体/斜体语法自动渲染，**3D 场景中的名字也会自动应用斜体**（用来标注虚拟天体）。
- `Ctrl + 点击` 两个恒星系会绘制虚线并显示两者距离；双击虚线或距离标签可删除该测距线。
- 双击恒星系会展开内部结构视图，恒星、行星、卫星、小行星带和轨道设施都可点击。
- 如果某恒星拥有宜居带设定 (`hz_inner`, `hz_outer`)，进入内部结构后会渲染发光的**宜居带环**。
- 如果双击恒星后只有自动生成的占位天体，镜头只会拉近主星；有正式内部结构种子的恒星系会展开缩小主星、行星轨道、卫星和小行星带。
- Agent 控制台通过下拉菜单选择显示，支持 zoom、距离计算、最近邻、筛选和内部结构查询。

## 数据口径

- 虚构恒星系、虚构天体和纯设定设施名在数据源中用 `_名字_` 标记，页面会渲染为斜体。例：`_李-哈特曼_ / _Li-Hartman_`、`_草原星_`、`_S&F 数据穹顶_`。
- 真实天体名称保持普通文本；如果说明中有设定推演，会用 `_设定_` 标记该段。
- 太阳系已补充八大行星平均轨道、月球、木星主要伽利略卫星、泰坦、主小行星带与柯伊伯带。
- Li-Hartman 内部结构参考 `设定/李-哈特曼恒星系完整设定.md`，包含主星、宜居链、主要卫星、小行星带和外缘冰小天体带。
- 每个恒星系和内部天体都有 `rule_info_time`、`info_speed`、`ftl_speed`；控制范围球半径按 `rule_info_time × info_speed × ftl_speed` 计算。无 FTL 时 `ftl_speed = 1`。

## Agent/API 接口

浏览器内可用：

```js
await StarMapAgent.zoomToStar("GJ 1002")
await StarMapAgent.distanceBetween("gj1002", "teegarden")
await StarMapAgent.nearestTo("李-哈特曼", 5)
StarMapAgent.searchStars("美丽花园")
StarMapAgent.filterStars({ objectType: "brown_dwarf" })
await StarMapAgent.openSystem("li-hartman")
await StarMapAgent.addStar({ id: "test", name: "Test" }) // 调用后端创建恒星
await StarMapAgent.updateStar({ id: "test", habitable: 1 }) // 调用后端更新恒星
await StarMapAgent.addBody({ id: "test-b", starId: "test", name: "_Test b_", bodyType: "planet", orbitAu: 0.8 })
await StarMapAgent.updateBody({ id: "test-b", habitable: 1, rule_info_time: 0.12 })
StarMapAgent.getState()
```

HTTP API：

```text
GET /api/stars
GET /api/stars?class=M&minPlanets=3&includeOuter=1
GET /api/search?q=褐矮星&objectType=brown_dwarf
GET /api/star?id=gj1002
GET /api/factions
GET /api/filter-options
GET /api/timeline
GET /api/system?id=li-hartman
GET /api/distance?from=gj1002&to=teegarden
GET /api/nearest?from=li-hartman&limit=5
GET /api/zoom-target?star=gj1002
GET /api/docs
POST|PUT|PATCH /api/stars
POST|PUT|PATCH /api/system-bodies
```

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
  "summary": "_设定_新增行星。",
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

当前数据库种子由 `app.js` 的核心 `fallbackStars` 加上 `scripts/seed_data.py` 中的扩展数据合并生成。后续可以直接编辑 SQLite，或通过 `POST|PUT|PATCH /api/stars` 添加/修改恒星系，通过 `POST|PUT|PATCH /api/system-bodies` 添加/修改恒星系内部天体。已有记录支持局部更新，只需要传 `id` 和变化字段；新记录仍需要完整必填字段。

主要表：

- `stars`：恒星系、非恒星天体、势力归属和筛选字段。
- `aliases`：名称/简称检索别名。
- `system_bodies`：双击后显示的恒星、行星、卫星、小行星带、轨道设施和星际云内部节点。

## 文件结构

```text
app.js                    Three.js 星图、交互、Agent 浏览器 API
server.py                 本地 HTTP/API 服务
styles.css                页面布局与控件样式
index.html                单页入口
data/stars.sqlite         SQLite 数据库
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
