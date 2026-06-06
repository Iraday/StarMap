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
- 标注八象限与 25 光年边界。
- 支持势力、天体类型、恒星类型、行星数量、势力类型、自由文本和年份筛选。
- 点击势力图例会 zoom 到该势力控制的恒星系并高亮。
- 点击恒星系查看 2350 归属、现实口径、设定统计。
- `Ctrl + 点击` 两个恒星系会绘制虚线并显示两者距离。
- 双击恒星系会展开内部结构视图，恒星、行星、卫星、小行星带和轨道设施都可点击。
- Agent 控制台支持 zoom、距离计算、最近邻、筛选和内部结构查询。

## Agent/API 接口

浏览器内可用：

```js
await StarMapAgent.zoomToStar("GJ 1002")
await StarMapAgent.distanceBetween("gj1002", "teegarden")
await StarMapAgent.nearestTo("李-哈特曼", 5)
StarMapAgent.searchStars("美丽花园")
StarMapAgent.filterStars({ objectType: "brown_dwarf" })
await StarMapAgent.openSystem("li-hartman")
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
```

新增或替换恒星系：

```http
POST /api/stars
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
  "reality": "待补充。",
  "setting": "待补充。",
  "habitable": 1,
  "status": "license"
}
```

## 数据库

SQLite 文件：

```text
data/stars.sqlite
```

初始化脚本：

```powershell
python scripts\init_db.py --force
```

当前数据库种子由 `app.js` 的核心 `fallbackStars` 加上 `scripts/seed_data.py` 中的扩展数据合并生成。后续可以直接编辑 SQLite，或通过 `POST /api/stars` 添加新恒星系，通过 `POST /api/system-bodies` 添加恒星系内部天体。

主要表：

- `stars`：恒星系、非恒星天体、势力归属和筛选字段。
- `aliases`：名称/简称检索别名。
- `system_bodies`：双击后显示的恒星、行星、卫星、小行星带、轨道设施和星际云内部节点。

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
