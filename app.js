import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const canvas = document.querySelector("#map");
const detailTitle = document.querySelector("#detailTitle");
const detailList = document.querySelector("#detailList");
const factionFilter = document.querySelector("#factionFilter");
const legend = document.querySelector("#legend");
const showLabels = document.querySelector("#showLabels");
const showTerritories = document.querySelector("#showTerritories");
const showOctants = document.querySelector("#showOctants");
const showOuter = document.querySelector("#showOuter");
const habitableOnly = document.querySelector("#habitableOnly");
const starScale = document.querySelector("#starScale");
const spinToggle = document.querySelector("#spinToggle");
const agentStar = document.querySelector("#agentStar");
const distanceFrom = document.querySelector("#distanceFrom");
const distanceTo = document.querySelector("#distanceTo");
const agentOutput = document.querySelector("#agentOutput");
const starNames = document.querySelector("#starNames");
const searchFilter = document.querySelector("#searchFilter");
const objectTypeFilter = document.querySelector("#objectTypeFilter");
const spectralFilter = document.querySelector("#spectralFilter");
const factionTypeFilter = document.querySelector("#factionTypeFilter");
const minPlanets = document.querySelector("#minPlanets");
const yearSlider = document.querySelector("#yearSlider");
const yearLabel = document.querySelector("#yearLabel");

const factionColors = {
  "太阳系": "#f4f2de",
  "无限未来": "#ff6575",
  "人类群星联合": "#68a8ff",
  "明日晨曦": "#ffc857",
  "S&F": "#b28cff",
  "美丽花园巨企": "#78dd8a",
  "近邻三角军工托管区": "#e68a4e",
  "星蓝元素": "#2bd7ff",
  "巴纳德星际动力": "#b9bdc5",
  "拉卡伊冶金公会": "#d5eef2",
  "沃尔夫潮汐能源财团": "#6fd3c7",
  "Ross 128生态城邦": "#a3efb6",
  "远岭联营": "#e6b06f",
  "南爪边境开发集团": "#d070ff",
  "外环水蛇-北落师门采掘同盟": "#b9b86b",
  "许可/争议区": "#93a0ad",
  "自然天体/科研区": "#8ca6c8",
  "本地星际介质": "#74c0d8",
  "白矮星科研封存区": "#dfe8ff"
};

const fallbackStars = [
  {
    id: "sol",
    name: "太阳 / Sol",
    short: "Sol",
    octant: "原点",
    order: 0,
    distance: 0,
    arrival: 2278,
    xyz: [0, 0, 0],
    faction: "太阳系",
    rank: "-",
    className: "G2V",
    planets: "地球、月球、火星、金星、外太阳系卫星群",
    reality: "人类母星系；2278 内战源点。",
    setting: "2350 年仍是文明法理源头，但被禁运和内战掏空。",
    habitable: 1,
    status: "core"
  },
  {
    id: "barnard",
    name: "Barnard's Star / 巴纳德星",
    short: "Barnard",
    octant: "+++",
    order: 1,
    distance: 5.96,
    arrival: 2283.96,
    xyz: [5.0, 3.0, 1.5],
    faction: "巴纳德星际动力",
    rank: 8,
    className: "M4V",
    planets: "0 宜居；2-4 近轨热岩石/自动工厂靶场。",
    reality: "现实最新口径偏近轨热小行星/低质量岩石行星，无稳健宜居带世界。",
    setting: "近邻工业星，太阳系军需外包、自动化母机、义体零件核心。",
    habitable: 0,
    status: "core"
  },
  {
    id: "wolf1061",
    name: "Wolf 1061",
    short: "Wolf 1061",
    octant: "+++",
    order: 2,
    distance: 14.05,
    arrival: 2292.05,
    xyz: [12.9, 0.8, 5.6],
    faction: "沃尔夫潮汐能源财团",
    rank: 10,
    className: "M3.5V",
    planets: "1 临界宜居；2 工业行星。",
    reality: "Wolf 1061 c 常列内侧宜居带/临界候选。",
    setting: "潮汐热、地热、电池、冷却与风险地产财团。",
    habitable: 1,
    status: "core"
  },
  {
    id: "gj625",
    name: "GJ 625",
    short: "GJ 625",
    octant: "+++",
    order: 3,
    distance: 21.1,
    arrival: 2299.1,
    xyz: [1.8, 15.4, 14.3],
    faction: "许可/争议区",
    rank: "-",
    className: "M1.5V",
    planets: "0-1 临界宜居；强温室边界世界。",
    reality: "GJ 625 b 为内侧宜居带边缘超级地球，可能偏热。",
    setting: "沃尔夫财团远端投资许可，本地采矿公社保留自治。",
    habitable: 1,
    status: "license"
  },
  {
    id: "vega",
    name: "Vega / 织女星",
    short: "Vega",
    octant: "+++",
    order: 4,
    distance: 25.04,
    arrival: 2303.04,
    xyz: [9.1, 21.8, 8.3],
    faction: "外环水蛇-北落师门采掘同盟",
    rank: 14,
    className: "A0V",
    planets: "边界外附录；0 宜居。",
    reality: "无确认宜居行星；尘埃/碎屑盘显著。",
    setting: "外环采矿、观测和文化宣传边界。",
    habitable: 0,
    status: "outer"
  },
  {
    id: "gj887",
    name: "GJ 887 / Lacaille 9352 / 拉卡伊9352",
    short: "GJ 887",
    octant: "++-",
    order: 1,
    distance: 10.74,
    arrival: 2288.74,
    xyz: [4.4, 0.4, -9.8],
    faction: "拉卡伊冶金公会",
    rank: 9,
    className: "M0.5V",
    planets: "1 宜居带超级地球；2-3 近轨热超级地球。",
    reality: "已知多行星；GJ 887 d 为宜居带超级地球，偏大。",
    setting: "材料上游、中立供应商、军工原料核心。",
    habitable: 1,
    status: "core"
  },
  {
    id: "fomalhaut",
    name: "Fomalhaut / 北落师门",
    short: "Fomalhaut",
    octant: "++-",
    order: 2,
    distance: 25.13,
    arrival: 2303.13,
    xyz: [10.0, 3.7, -22.8],
    faction: "外环水蛇-北落师门采掘同盟",
    rank: 14,
    className: "A3V",
    planets: "边界外附录；0 宜居。",
    reality: "无稳健类地宜居确认；著名碎屑盘。",
    setting: "碎屑盘采掘、冰尘、观测站与外环合同。",
    habitable: 0,
    status: "outer"
  },
  {
    id: "ross128",
    name: "Ross 128",
    short: "Ross 128",
    octant: "+-+",
    order: 1,
    distance: 11.01,
    arrival: 2289.01,
    xyz: [0.0, -5.6, 9.5],
    faction: "Ross 128生态城邦",
    rank: 11,
    className: "M4V",
    planets: "1 稳健宜居；轨道环与生态农业价值高。",
    reality: "Ross 128 b 为近邻温和岩石/超级地球候选，主星较安静。",
    setting: "独立生态城邦；美丽花园只有医疗、疗养许可证。",
    habitable: 1,
    status: "core"
  },
  {
    id: "gj667c",
    name: "GJ 667 C / Gliese 667 C",
    short: "GJ 667 C",
    octant: "+-+",
    order: 2,
    distance: 23.62,
    arrival: 2301.62,
    xyz: [23.4, -3.4, 0.6],
    faction: "南爪边境开发集团",
    rank: 13,
    className: "M1.5V 三合星C",
    planets: "1 宜居/临界宜居；1-2 争议可改造。",
    reality: "GJ 667 Cc 为著名宜居带超级地球；其他多行星解争议大。",
    setting: "边境主殖民行星、三体资源、多方股权与走私。",
    habitable: 1,
    status: "core"
  },
  {
    id: "alpha",
    name: "Alpha Centauri AB + Proxima / 半人马座α三合星",
    short: "Alpha Cen",
    octant: "+--",
    order: 1,
    distance: 4.37,
    arrival: 2282.37,
    xyz: [3.1, -3.1, -0.1],
    faction: "近邻三角军工托管区",
    rank: 6,
    className: "G2V+K1V+M5.5Ve",
    planets: "1 极端宜居带行星；AB 可设定 1 可改造类地或大型轨道居住带。",
    reality: "Proxima b 位于宜居带但受耀斑/潮汐锁定风险；AB 未有稳健宜居确认。",
    setting: "太阳系内战外延战区、殖民正统符号和军工试验场。",
    habitable: 1,
    status: "core"
  },
  {
    id: "epsilon-indi",
    name: "Epsilon Indi / 印第安座ε",
    short: "Epsilon Indi",
    octant: "+--",
    order: 2,
    distance: 11.87,
    arrival: 2289.87,
    xyz: [7.3, -3.2, -8.8],
    faction: "近邻三角军工托管区",
    rank: 6,
    className: "K5V + 褐矮星伴星",
    planets: "0 宜居；冷资源、褐矮星科研价值高。",
    reality: "巨行星/褐矮星系统资源突出，无强宜居背书。",
    setting: "近邻托管区外围燃料与船坞许可。",
    habitable: 0,
    status: "license"
  },
  {
    id: "gj682",
    name: "GJ 682",
    short: "GJ 682",
    octant: "+--",
    order: 3,
    distance: 16.33,
    arrival: 2294.33,
    xyz: [15.7, -3.9, -1.9],
    faction: "南爪边境开发集团",
    rank: 13,
    className: "M3.5V",
    planets: "0-1 争议宜居；1 边境地球化靶场。",
    reality: "行星候选存在争议，宜居性不稳。",
    setting: "失败殖民、走私与边境承包。",
    habitable: 1,
    status: "core"
  },
  {
    id: "beta-hydri",
    name: "Beta Hydri / 水蛇座β",
    short: "Beta Hydri",
    octant: "+--",
    order: 4,
    distance: 24.33,
    arrival: 2302.33,
    xyz: [10.7, -15.4, -15.6],
    faction: "外环水蛇-北落师门采掘同盟",
    rank: 14,
    className: "G2IV",
    planets: "0 宜居；老恒星科研、边缘燃料站。",
    reality: "无确认宜居行星；主星演化阶段不适合长期新殖民核心。",
    setting: "老恒星边境和采掘同盟背景。",
    habitable: 0,
    status: "license"
  },
  {
    id: "luyten726",
    name: "Luyten 726-8 / UV Ceti",
    short: "UV Ceti",
    octant: "-+-",
    order: 1,
    distance: 8.73,
    arrival: 2286.73,
    xyz: [-2.2, 0.2, -8.5],
    faction: "许可/争议区",
    rank: "-",
    className: "M5.5V+M6V",
    planets: "0 宜居；防辐射、失败殖民、封闭舱生态试验。",
    reality: "耀星双星，无强宜居背书。",
    setting: "S&F 与美丽花园早期保险争议区。",
    habitable: 0,
    status: "license"
  },
  {
    id: "groombridge34",
    name: "Groombridge 34 / 格鲁姆布里奇34",
    short: "Groombridge 34",
    octant: "-+-",
    order: 2,
    distance: 11.62,
    arrival: 2289.62,
    xyz: [-5.0, 9.9, -3.7],
    faction: "S&F",
    rank: 4,
    className: "M1V+M3V",
    planets: "0 宜居；寒冷矿业、数据中继、保险清算站。",
    reality: "近轨/冷行星候选，无稳健宜居带地表。",
    setting: "S&F 数据金融走廊内节点。",
    habitable: 0,
    status: "core"
  },
  {
    id: "tau-ceti",
    name: "Tau Ceti / 天仓五",
    short: "Tau Ceti",
    octant: "-+-",
    order: 3,
    distance: 11.91,
    arrival: 2289.91,
    xyz: [-3.4, 0.4, -11.4],
    faction: "美丽花园巨企",
    rank: 5,
    className: "G8.5V",
    planets: "设定确认 1 可改造温和世界 + 大型生态轨道群。",
    reality: "e/f 等宜居讨论在 2026 口径下已明显削弱或视为伪信号。",
    setting: "美丽花园的文化首都、生态金融母盘之一。",
    habitable: 1,
    status: "core"
  },
  {
    id: "teegarden",
    name: "Teegarden's Star / 提加登星",
    short: "Teegarden",
    octant: "-+-",
    order: 4,
    distance: 12.5,
    arrival: 2290.5,
    xyz: [-9.4, 3.4, -7.5],
    faction: "美丽花园巨企",
    rank: 5,
    className: "M7V",
    planets: "2 宜居/准宜居；b 主生态世界，c 冷生态世界。",
    reality: "Teegarden b/c 为近邻地球质量级宜居带候选。",
    setting: "美丽花园最合理直属核心，人工花园技术展示地。",
    habitable: 2,
    status: "core"
  },
  {
    id: "gj1002",
    name: "GJ 1002",
    short: "GJ 1002",
    octant: "-+-",
    order: 5,
    distance: 15.81,
    arrival: 2293.81,
    xyz: [-0.3, 6.0, -14.6],
    faction: "星蓝元素",
    rank: 7,
    className: "M5.5V",
    planets: "2 宜居；b 温暖居住与生物改造，c 冷生态与自治实验。",
    reality: "GJ 1002 b/c 为两颗地球质量级宜居带行星。",
    setting: "星蓝元素双宜居核心，兼爱、包容、新人类技术路线。",
    habitable: 2,
    status: "core"
  },
  {
    id: "hd219134",
    name: "HD 219134",
    short: "HD 219134",
    octant: "-+-",
    order: 6,
    distance: 21.25,
    arrival: 2299.25,
    xyz: [-7.2, 20.0, -1.2],
    faction: "S&F",
    rank: 4,
    className: "K3V",
    planets: "0 宜居；热岩石行星、金融避难站、数据保险机房。",
    reality: "多颗近轨超级地球/热岩石行星，部分凌星。",
    setting: "S&F 核心数据仓与清算节点。",
    habitable: 0,
    status: "core"
  },
  {
    id: "107piscium",
    name: "107 Piscium / HD 10476",
    short: "107 Piscium",
    octant: "-+-",
    order: 7,
    distance: 24.4,
    arrival: 2302.4,
    xyz: [-13.9, 12.1, -16.0],
    faction: "S&F",
    rank: 4,
    className: "K1V",
    planets: "0 宜居；边缘矿业、金融许可、航线补给。",
    reality: "无稳健确认宜居行星。",
    setting: "S&F 外围金融/采掘许可，不算直属本土。",
    habitable: 0,
    status: "license"
  },
  {
    id: "wolf359",
    name: "Wolf 359",
    short: "Wolf 359",
    octant: "--+",
    order: 1,
    distance: 7.86,
    arrival: 2285.86,
    xyz: [-1.9, -3.9, 6.5],
    faction: "无限未来",
    rank: 1,
    className: "M6V",
    planets: "0 宜居；军用协议、防辐射、封闭地下/轨道城。",
    reality: "行星候选不宜居；耀发环境极端。",
    setting: "无限未来近邻硬科技核心，实验禁区。",
    habitable: 0,
    status: "core"
  },
  {
    id: "lalande",
    name: "Lalande 21185 / 拉兰德21185",
    short: "Lalande 21185",
    octant: "--+",
    order: 2,
    distance: 8.31,
    arrival: 2286.31,
    xyz: [-3.4, -0.3, 7.6],
    faction: "无限未来",
    rank: 1,
    className: "M2V",
    planets: "0-1 封闭生态可居；地下农业与义体工厂。",
    reality: "已知/候选近轨超级地球，无稳健开放地表宜居。",
    setting: "无限未来消费电子、娱乐终端和人口盘核心。",
    habitable: 1,
    status: "core"
  },
  {
    id: "gj273",
    name: "GJ 273 / Luyten's Star / 鲁坦星",
    short: "GJ 273",
    octant: "--+",
    order: 3,
    distance: 12.35,
    arrival: 2290.35,
    xyz: [-10.3, -6.5, 2.2],
    faction: "无限未来",
    rank: 1,
    className: "M3.5V",
    planets: "1 宜居；1 主居住行星；1 近轨工业行星。",
    reality: "GJ 273 b 为经典宜居带超级地球候选。",
    setting: "无限未来外缘主居住区，最大民用人口盘。",
    habitable: 1,
    status: "core"
  },
  {
    id: "gj251",
    name: "GJ 251",
    short: "GJ 251",
    octant: "--+",
    order: 4,
    distance: 18.22,
    arrival: 2296.22,
    xyz: [-17.6, -0.9, 4.8],
    faction: "无限未来",
    rank: 1,
    className: "M3V",
    planets: "0-1 候选宜居；外缘冷备份与技术投机区。",
    reality: "GJ 251 c 为 2025 宜居带候选；仍需确认。",
    setting: "无限未来外围影响/专利锁定，可被战争切走。",
    habitable: 1,
    status: "license"
  },
  {
    id: "epsilon-eridani",
    name: "Epsilon Eridani / 天苑四",
    short: "Epsilon Eri",
    octant: "---",
    order: 1,
    distance: 10.47,
    arrival: 2288.47,
    xyz: [-6.7, -1.9, -7.8],
    faction: "明日晨曦",
    rank: 3,
    className: "K2V",
    planets: "0 宜居；巨行星卫星群、碎屑盘、船坞、聚变燃料极强。",
    reality: "巨行星与碎屑盘资源强，无确认宜居类地。",
    setting: "天苑四造船联合体，明日晨曦舰队、债券和违禁武器来源。",
    habitable: 0,
    status: "core"
  },
  {
    id: "gj1061",
    name: "GJ 1061",
    short: "GJ 1061",
    octant: "---",
    order: 2,
    distance: 11.98,
    arrival: 2289.98,
    xyz: [-2.3, -6.9, -9.6],
    faction: "人类群星联合",
    rank: 2,
    className: "M5.5V",
    planets: "2 宜居/准宜居；c 温暖世界，d 冷世界。",
    reality: "GJ 1061 c/d 为双宜居带候选。",
    setting: "人类群星联合南方民生署生态核心。",
    habitable: 2,
    status: "core"
  },
  {
    id: "kapteyn",
    name: "Kapteyn's Star / 卡普坦星",
    short: "Kapteyn",
    octant: "---",
    order: 3,
    distance: 12.83,
    arrival: 2290.83,
    xyz: [-3.5, -9.8, -7.5],
    faction: "人类群星联合",
    rank: 2,
    className: "sdM1",
    planets: "0 可靠宜居；老殖民地、军政保守派和失败项目遗产。",
    reality: "Kapteyn b 等早期宜居候选争议较大。",
    setting: "群星联合老军政节点和退役舰队基地。",
    habitable: 0,
    status: "core"
  },
  {
    id: "40eridani",
    name: "40 Eridani A / 波江座40A",
    short: "40 Eridani",
    octant: "---",
    order: 4,
    distance: 16.26,
    arrival: 2294.26,
    xyz: [-12.0, -4.5, -10.0],
    faction: "人类群星联合",
    rank: 2,
    className: "K1V + 伴星",
    planets: "0-1 可改造类地；白矮星伴星带来工业与科研价值。",
    reality: "早期行星候选争议/可能被排除；无稳健宜居确认。",
    setting: "群星联合行政-船坞节点。",
    habitable: 1,
    status: "core"
  },
  {
    id: "hd20794",
    name: "HD 20794 / 82 Eridani / 波江座82",
    short: "HD 20794",
    octant: "---",
    order: 5,
    distance: 19.7,
    arrival: 2297.7,
    xyz: [-3.6, -10.4, -16.4],
    faction: "人类群星联合",
    rank: 2,
    className: "G6V",
    planets: "1 类太阳旗舰宜居候选；1-2 内侧工业行星。",
    reality: "近年确认/强化一颗偏心宜居带超级地球。",
    setting: "人类群星联合正统旗舰与中央殖民信托。",
    habitable: 1,
    status: "core"
  },
  {
    id: "li-hartman",
    name: "*李-哈特曼* / *Li-Hartman*",
    short: "*Li-Hartman*",
    octant: "---",
    order: 6,
    distance: 22.3,
    arrival: 2300.3,
    xyz: [-7.3, -11.8, -17.5],
    faction: "远岭联营",
    rank: 12,
    className: "设定 K3V",
    planets: "4 主级宜居/准宜居；原野、草原、釉海、匣；阙穹 76 卫星。",
    reality: "架空锚点，置于 HD 20794 与 LTT 1445 A 邻近外缘。",
    setting: "边境黄金压力锅，远岭联营经营权，母星方保留法理和黄金股。",
    habitable: 4,
    status: "core"
  },
  {
    id: "ltt1445",
    name: "LTT 1445 A",
    short: "LTT 1445 A",
    octant: "---",
    order: 7,
    distance: 22.39,
    arrival: 2300.39,
    xyz: [-11.1, -4.1, -19.0],
    faction: "人类群星联合",
    rank: 2,
    className: "M2.5V 三合星主星",
    planets: "0-1 低置信宜居候选；科研特许地与三合星导航站。",
    reality: "b/c 为近轨热行星；Ad 为宜居带候选但置信偏低。",
    setting: "群星联合科研许可区，明日晨曦船坞派也有合同。",
    habitable: 1,
    status: "license"
  }
];

let stars = [];

const scene = new THREE.Scene();
scene.background = new THREE.Color("#07090d");
scene.fog = new THREE.Fog("#07090d", 58, 105);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
camera.position.set(43, 34, 47);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.rotateSpeed = 0.65;
controls.zoomSpeed = 0.9;
controls.minDistance = 14;
controls.maxDistance = 105;
controls.target.set(0, 0, 0);

const root = new THREE.Group();
const labelLayer = new THREE.Group();
const octantLayer = new THREE.Group();
const territoryLayer = new THREE.Group();
const starLayer = new THREE.Group();
const measurementLayer = new THREE.Group();
const systemLayer = new THREE.Group();
const quadrantBoundsLayer = new THREE.Group();
scene.add(root, octantLayer, territoryLayer, starLayer, measurementLayer, systemLayer, labelLayer, quadrantBoundsLayer);

const starMeshes = [];
const bodyMeshes = [];
const starById = new Map();
const baseRadius = 0.34;
let selectedStar = null;
let selectedBody = null;
let lastMeasureStar = null;
let activeFaction = "all";
let currentYear = 2350;
let lastFrameTime = performance.now();
const pressedKeys = new Set();

function formatMarkdown(text) {
  if (!text) return "";
  return String(text)
    .replace(/\*([^*]+)\*/g, "<i>$1</i>")
    .replace(/_([^_]+)_/g, "<i>$1</i>");
}

function toWorld([x, y, z]) {
  return new THREE.Vector3(x, z, y);
}

async function loadStars() {
  try {
    const response = await fetch("/api/stars?includeOuter=1&year=2350", { cache: "no-store" });
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const apiStars = await response.json();
    if (Array.isArray(apiStars) && apiStars.length) return apiStars.map(normalizeStar);
  } catch (error) {
    console.warn("Using embedded star fallback:", error);
  }
  return fallbackStars.map(normalizeStar);
}

function normalizeStar(star) {
  const className = star.className ?? star.class_name ?? "unknown";
  return {
    objectType: "star_system",
    spectralClass: className.slice(0, 1),
    starCount: 1,
    planetCount: Number(star.habitable ?? 0),
    confirmedPlanets: 0,
    candidatePlanets: 0,
    factionType: star.rank === "-" ? "许可/争议" : "巨企/类巨企",
    displayAfter: 0,
    displayUntil: null,
    controlStart: 2350,
    controlEnd: null,
    notes: "",
    ...star,
    className
  };
}

function normalizeSearch(value) {
  return String(value ?? "")
    .replace(/[^0-9a-zA-Z\u4e00-\u9fff]+/g, "")
    .toLocaleLowerCase();
}

function findLocalStar(value) {
  const key = normalizeSearch(value);
  if (!key) return null;
  return stars.find((star) => {
    const aliases = [star.id, star.name, star.short, star.name.split("/")[0]];
    return aliases.some((alias) => normalizeSearch(alias).includes(key) || key.includes(normalizeSearch(alias)));
  }) ?? null;
}

function localDistance(a, b) {
  return Math.hypot(a.xyz[0] - b.xyz[0], a.xyz[1] - b.xyz[1], a.xyz[2] - b.xyz[2]);
}

function moveCameraToStar(star, cameraDistance = 24) {
  const target = toWorld(star.xyz);
  controls.target.copy(target);
  camera.position.set(target.x + cameraDistance, target.y + cameraDistance * 0.62, target.z + cameraDistance);
  showDetails(star);
  updateVisibility();
  return star;
}

function writeAgentOutput(payload) {
  if (!agentOutput) return;
  agentOutput.textContent = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}

async function apiJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} -> ${response.status}`);
  return response.json();
}

function makeTextSprite(text, color = "#edf3f8", size = 34, align = "center") {
  const pad = 18;
  const parts = String(text).split(/([*_].*?[*_])/g);
  const tokens = [];
  parts.forEach((part) => {
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) {
      if (part.length > 2) tokens.push({ text: part.slice(1, -1), italic: true });
    } else if (part.length > 0) {
      tokens.push({ text: part, italic: false });
    }
  });

  const canvasText = document.createElement("canvas");
  const context = canvasText.getContext("2d");
  
  let totalWidth = 0;
  tokens.forEach((token) => {
    context.font = `${token.italic ? "italic " : ""}700 ${size}px Inter, Segoe UI, sans-serif`;
    totalWidth += context.measureText(token.text).width;
  });

  const width = Math.ceil(totalWidth + pad * 2);
  const height = Math.ceil(size + pad * 2);
  canvasText.width = width;
  canvasText.height = height;

  context.textBaseline = "middle";
  context.fillStyle = "rgba(7, 9, 13, 0.58)";
  roundRect(context, 1, 1, width - 2, height - 2, 12);
  context.fill();

  context.fillStyle = color;
  let currentX = align === "left" ? pad : (width - totalWidth) / 2;
  const currentY = height / 2;

  tokens.forEach((token) => {
    context.font = `${token.italic ? "italic " : ""}700 ${size}px Inter, Segoe UI, sans-serif`;
    context.fillText(token.text, currentX, currentY);
    currentX += context.measureText(token.text).width;
  });

  const texture = new THREE.CanvasTexture(canvasText);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(width / 24, height / 24, 1);
  sprite.userData.kind = "label";
  return sprite;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function addAxes() {
  const axisLen = 31;
  const arrowX = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), axisLen, 0xff6f61, 2.7, 1.25);
  const arrowY = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), axisLen, 0xe6d36a, 2.7, 1.25);
  const arrowZ = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), axisLen, 0x8fa8ff, 2.7, 1.25);
  root.add(arrowX, arrowY, arrowZ);

  const labels = [
    ["X+ 银心", [33.2, 0, 0], "#ff9389"],
    ["Y+ 银河自旋", [0, 0, 33.2], "#f0df82"],
    ["Z+ 北银极", [0, 33.2, 0], "#b4c4ff"],
    ["25 ly 边界", [0, -28.5, 0], "#9eaebe"]
  ];
  labels.forEach(([text, position, color]) => {
    const sprite = makeTextSprite(text, color, 30);
    sprite.position.set(...position);
    labelLayer.add(sprite);
  });
}

function addReferenceGeometry() {
  const ringMaterial = new THREE.LineBasicMaterial({ color: 0x7f8b99, transparent: true, opacity: 0.26 });
  const circleXY = makeCircle(25, 128, ringMaterial);
  circleXY.rotation.x = Math.PI / 2;
  const circleXZ = makeCircle(25, 128, ringMaterial);
  const circleYZ = makeCircle(25, 128, ringMaterial);
  circleYZ.rotation.y = Math.PI / 2;
  root.add(circleXY, circleXZ, circleYZ);

  const grid = new THREE.GridHelper(60, 12, 0x2d3b48, 0x18212b);
  grid.material.transparent = true;
  grid.material.opacity = 0.42;
  root.add(grid);

  const planeMat = new THREE.LineBasicMaterial({ color: 0x344252, transparent: true, opacity: 0.32 });
  root.add(makePlaneSquare("xy", planeMat), makePlaneSquare("xz", planeMat), makePlaneSquare("yz", planeMat));

  ["+++", "++-", "+-+", "+--", "-++", "-+-", "--+", "---"].forEach((octant) => {
    const x = octant[0] === "+" ? 29 : -29;
    const y = octant[2] === "+" ? 29 : -29;
    const z = octant[1] === "+" ? 29 : -29;
    const sprite = makeTextSprite(octant, "#d8e2ec", 32);
    sprite.position.set(x, y, z);
    octantLayer.add(sprite);
  });

  ["+++", "++-", "+-+", "+--", "-++", "-+-", "--+", "---"].forEach((octant) => {
    const xDir = octant[0] === "+" ? 1 : -1;
    const yDir = octant[2] === "+" ? 1 : -1;
    const zDir = octant[1] === "+" ? 1 : -1;
    const geometry = new THREE.BoxGeometry(25, 25, 25);
    const edges = new THREE.EdgesGeometry(geometry);
    const color = new THREE.Color().setHSL(Math.random(), 0.6, 0.5);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3 }));
    line.position.set(xDir * 12.5, yDir * 12.5, zDir * 12.5);
    quadrantBoundsLayer.add(line);
  });
}

function makeCircle(radius, segments, material) {
  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(t) * radius, 0, Math.sin(t) * radius));
  }
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
}

function makePlaneSquare(kind, material) {
  const s = 25;
  const points = kind === "xy"
    ? [new THREE.Vector3(-s, -s, 0), new THREE.Vector3(s, -s, 0), new THREE.Vector3(s, s, 0), new THREE.Vector3(-s, s, 0), new THREE.Vector3(-s, -s, 0)]
    : kind === "xz"
      ? [new THREE.Vector3(-s, 0, -s), new THREE.Vector3(s, 0, -s), new THREE.Vector3(s, 0, s), new THREE.Vector3(-s, 0, s), new THREE.Vector3(-s, 0, -s)]
      : [new THREE.Vector3(0, -s, -s), new THREE.Vector3(0, s, -s), new THREE.Vector3(0, s, s), new THREE.Vector3(0, -s, s), new THREE.Vector3(0, -s, -s)];
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
}

function addStarfield() {
  const count = 900;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const radius = 62 + Math.random() * 36;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0x9fb4c8, size: 0.08, transparent: true, opacity: 0.48, depthWrite: false });
  scene.add(new THREE.Points(geometry, material));
}

function getStarRadius(star) {
  if (star.objectType === "diffuse_cloud") return 1.15;
  if (star.objectType === "brown_dwarf" || star.objectType === "substellar_object") return 0.24;
  if (star.id === "sol") return 0.82;
  const spec = String(star.spectralClass || "").toUpperCase();
  let size = baseRadius;
  if (spec.includes("O") || spec.includes("B")) size = 0.9;
  else if (spec.includes("A")) size = 0.7;
  else if (spec.includes("F")) size = 0.6;
  else if (spec.includes("G")) size = 0.5;
  else if (spec.includes("K")) size = 0.4;
  else if (spec.includes("M")) size = 0.3;
  else if (spec.includes("D")) size = 0.15;
  else size = 0.4;
  return size + Math.min(star.habitable || 0, 4) * 0.05 + (star.status === "core" ? 0.05 : 0);
}

function addStars() {
  const sphere = new THREE.SphereGeometry(1, 24, 16);
  stars.forEach((star) => {
    const color = factionColors[star.faction] || factionColors["许可/争议区"];
    const radius = getStarRadius(star);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: star.objectType === "diffuse_cloud",
      opacity: star.objectType === "diffuse_cloud" ? 0.22 : 1
    });
    const mesh = new THREE.Mesh(sphere, material);
    mesh.scale.setScalar(radius * Number(starScale.value));
    mesh.position.copy(toWorld(star.xyz));
    mesh.userData.star = star;
    star.mesh = mesh;
    starLayer.add(mesh);
    starMeshes.push(mesh);
    starById.set(star.id, star);

    const haloGeometry = new THREE.RingGeometry(radius * 1.65, radius * 2.35, 40);
    const haloMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: star.objectType === "diffuse_cloud" ? 0.12 : star.status === "outer" ? 0.16 : 0.28,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    halo.position.copy(mesh.position);
    halo.userData.followCamera = true;
    star.halo = halo;
    starLayer.add(halo);

    const infoRadius = (star.rule_info_time || 0) * (star.info_speed || 0) * (star.ftl_speed || 1);
    if (infoRadius > 0) {
      const csGeometry = new THREE.SphereGeometry(infoRadius, 32, 24);
      const csMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.04, depthWrite: false });
      const controlSphere = new THREE.Mesh(csGeometry, csMat);
      controlSphere.position.copy(mesh.position);
      starLayer.add(controlSphere);
      star.controlSphere = controlSphere;
    }

    const label = makeTextSprite(star.short, color, star.id === "sol" ? 32 : 25);
    label.position.copy(mesh.position).add(new THREE.Vector3(0, radius * 1.9 + 0.55, 0));
    label.userData.starLabel = true;
    star.label = label;
    labelLayer.add(label);
  });
}

function addTerritories() {
  const lines = [
    ["wolf359", "lalande", "无限未来", false],
    ["lalande", "gj273", "无限未来", false],
    ["gj273", "gj251", "无限未来", true],
    ["gj1061", "kapteyn", "人类群星联合", false],
    ["kapteyn", "hd20794", "人类群星联合", false],
    ["kapteyn", "40eridani", "人类群星联合", false],
    ["40eridani", "ltt1445", "人类群星联合", true],
    ["hd20794", "li-hartman", "人类群星联合", true],
    ["groombridge34", "hd219134", "S&F", false],
    ["hd219134", "107piscium", "S&F", true],
    ["tau-ceti", "teegarden", "美丽花园巨企", false],
    ["alpha", "epsilon-indi", "近邻三角军工托管区", true],
    ["barnard", "alpha", "近邻三角军工托管区", true],
    ["gj682", "gj667c", "南爪边境开发集团", false],
    ["beta-hydri", "fomalhaut", "外环水蛇-北落师门采掘同盟", true],
    ["fomalhaut", "vega", "外环水蛇-北落师门采掘同盟", true]
  ];

  lines.forEach(([a, b, faction, dashed]) => {
    const starA = starById.get(a);
    const starB = starById.get(b);
    if (!starA || !starB) return;
    const material = dashed
      ? new THREE.LineDashedMaterial({ color: factionColors[faction], dashSize: 0.7, gapSize: 0.45, transparent: true, opacity: 0.54 })
      : new THREE.LineBasicMaterial({ color: factionColors[faction], transparent: true, opacity: 0.66 });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([toWorld(starA.xyz), toWorld(starB.xyz)]), material);
    if (dashed) line.computeLineDistances();
    line.userData.link = [a, b];
    territoryLayer.add(line);
  });
}

function buildControls() {
  factionFilter.querySelectorAll("option:not([value='all'])").forEach((option) => option.remove());
  legend.innerHTML = "";
  starNames.innerHTML = "";
  objectTypeFilter.querySelectorAll("option:not([value='all'])").forEach((option) => option.remove());
  spectralFilter.querySelectorAll("option:not([value='all'])").forEach((option) => option.remove());
  factionTypeFilter.querySelectorAll("option:not([value='all'])").forEach((option) => option.remove());

  const factionRanks = new Map();
  stars.forEach((s) => {
    let r = parseInt(s.rank);
    if (isNaN(r)) r = 999;
    if (!factionRanks.has(s.faction) || r < factionRanks.get(s.faction)) {
      factionRanks.set(s.faction, r);
    }
  });
  
  const factions = Array.from(factionRanks.keys())
    .filter((faction) => faction !== "太阳系")
    .sort((a, b) => factionRanks.get(a) - factionRanks.get(b));
    
  factions.forEach((faction) => {
    const option = document.createElement("option");
    option.value = faction;
    option.textContent = faction;
    factionFilter.appendChild(option);

    const row = document.createElement("button");
    row.type = "button";
    row.className = "legend-item";
    row.innerHTML = `<span class="swatch" style="background:${factionColors[faction]}"></span><span>${faction}</span><span>${stars.filter((star) => star.faction === faction).length}</span>`;
    row.addEventListener("click", () => {
      activeFaction = activeFaction === faction ? "all" : faction;
      updateVisibility();
    });
    legend.appendChild(row);
  });

  const optionSets = [
    [objectTypeFilter, "objectType"],
    [spectralFilter, "spectralClass"],
    [factionTypeFilter, "factionType"]
  ];
  optionSets.forEach(([select, key]) => {
    Array.from(new Set(stars.map((star) => star[key]).filter(Boolean))).sort().forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });
  });

  stars.forEach((star) => {
    const option = document.createElement("option");
    option.value = star.id;
    option.label = star.name;
    starNames.appendChild(option);
  });
}

function updateVisibility() {
  const faction = activeFaction === "all" ? factionFilter.value : activeFaction;
  const text = normalizeSearch(searchFilter.value);
  const objectType = objectTypeFilter.value;
  const spectral = spectralFilter.value;
  const factionType = factionTypeFilter.value;
  const minPlanetCount = Number(minPlanets.value || 0);
  currentYear = Number(yearSlider.value || 2350);
  yearLabel.textContent = String(currentYear);
  stars.forEach((star) => {
    let visible = faction === "all" || star.faction === faction || star.id === "sol";
    if (text) {
      visible = visible && [star.id, star.name, star.short, star.faction, star.factionType, star.className, star.planets, star.setting]
        .some((value) => normalizeSearch(value).includes(text));
    }
    if (objectType !== "all") visible = visible && star.objectType === objectType;
    if (spectral !== "all") visible = visible && String(star.spectralClass).includes(spectral);
    if (factionType !== "all") visible = visible && star.factionType === factionType;
    if (star.planetCount < minPlanetCount) visible = false;
    if (star.displayAfter > currentYear) visible = false;
    if (star.displayUntil !== null && star.displayUntil !== undefined && star.displayUntil < currentYear) visible = false;
    if (!showOuter.checked && star.status === "outer") visible = false;
    if (habitableOnly.checked && star.id !== "sol" && star.habitable < 1) visible = false;
    star.mesh.visible = visible;
    star.halo.visible = visible;
    if (star.controlSphere) star.controlSphere.visible = visible;
    if (star.label) star.label.visible = visible;
    const highlight = activeFaction !== "all" && star.faction === activeFaction;
    const isFilteredByFaction = faction !== "all" && star.faction !== faction && star.id !== "sol";
    const highlightOpacity = (activeFaction === "all" || highlight || star.id === "sol") ? 1 : 0.15;
    
    star.mesh.material.opacity = visible && !isFilteredByFaction ? highlightOpacity : 0.26;
    star.mesh.material.transparent = isFilteredByFaction || activeFaction !== "all";
    star.halo.material.opacity = highlight ? 0.55 : star.status === "outer" ? 0.16 : 0.28;
  });

  labelLayer.visible = showLabels.checked;
  territoryLayer.visible = showTerritories.checked;
  territoryLayer.children.forEach((line) => {
    const [a, b] = line.userData.link;
    const starA = starById.get(a);
    const starB = starById.get(b);
    line.visible = Boolean(starA?.mesh.visible && starB?.mesh.visible);
  });
  octantLayer.visible = showOctants.checked;
  quadrantBoundsLayer.visible = showQuadrantBounds.checked;
  legend.querySelectorAll(".legend-item").forEach((row) => {
    const label = row.textContent ?? "";
    row.classList.toggle("active", activeFaction !== "all" && label.includes(activeFaction));
  });
}

function updateScale() {
  stars.forEach((star) => {
    const radius = getStarRadius(star);
    star.mesh.scale.setScalar(radius * Number(starScale.value));
  });
}

function showDetails(star) {
  selectedStar = star;
  selectedBody = null;
  detailTitle.innerHTML = formatMarkdown(star.name);
  const rows = [
    ["势力", star.faction],
    ["实力序", String(star.rank)],
    ["八象限", star.octant],
    ["距离", `${star.distance.toFixed(2)} ly`],
    ["消息到达", `AD ${star.arrival.toFixed(2)}`],
    ["银河坐标", `(${star.xyz.map((n) => n.toFixed(1)).join(", ")}) ly`],
    ["主星", star.className],
    ["天体类型", star.objectType],
    ["光谱类型", star.spectralClass],
    ["恒星数", String(star.starCount)],
    ["行星数", `${star.planetCount}（确认 ${star.confirmedPlanets} / 候选 ${star.candidatePlanets}）`],
    ["势力类型", star.factionType],
    ["行星统计", star.planets],
    ["现实口径", formatMarkdown(star.reality)],
    ["2350设定", formatMarkdown(star.setting)]
  ];
  if (star.age) rows.push(["恒星年龄", star.age]);
  if (star.lifespan) rows.push(["恒星寿命", star.lifespan]);
  if (star.disasters) rows.push(["灾害特征", star.disasters]);
  detailList.innerHTML = rows.map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`).join("");
}

function showBodyDetails(body, star) {
  selectedBody = body;
  detailTitle.innerHTML = formatMarkdown(`${star.short} / ${body.name}`);
  const rows = [
    ["所属恒星系", formatMarkdown(star.name)],
    ["天体类型", body.bodyType],
    ["轨道", `${Number(body.orbitAu).toFixed(3)} AU`],
    ["尺度", body.radiusLabel || "-"],
    ["质量", body.massLabel || "-"],
    ["宜居", body.habitable ? "是/准宜居" : "否"],
    ["说明", formatMarkdown(body.summary || "-")]
  ];
  detailList.innerHTML = rows.map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`).join("");
}

function drawMeasurement(fromStar, toStar) {
  const material = new THREE.LineDashedMaterial({
    color: 0xffffff,
    dashSize: 0.42,
    gapSize: 0.28,
    transparent: true,
    opacity: 0.86
  });
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([toWorld(fromStar.xyz), toWorld(toStar.xyz)]),
    material
  );
  line.computeLineDistances();
  measurementLayer.add(line);
  while (measurementLayer.children.length > 6) {
    const old = measurementLayer.children[0];
    measurementLayer.remove(old);
    old.geometry?.dispose();
    old.material?.dispose();
  }
  const distance = localDistance(fromStar, toStar);
  writeAgentOutput({
    action: "ctrlClickDistance",
    from: fromStar.short,
    to: toStar.short,
    distanceLy: Number(distance.toFixed(3)),
    messageDelayYears: Number(distance.toFixed(3))
  });
}

function zoomFaction(faction) {
  activeFaction = faction;
  factionFilter.value = faction;
  const targets = stars.filter((star) => star.faction === faction);
  if (!targets.length) {
    updateVisibility();
    return [];
  }
  const box = new THREE.Box3();
  targets.forEach((star) => box.expandByPoint(toWorld(star.xyz)));
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);
  const span = Math.max(size.x, size.y, size.z, 10);
  controls.target.copy(center);
  camera.position.set(center.x + span * 1.8, center.y + span * 1.05, center.z + span * 1.55);
  updateVisibility();
  writeAgentOutput({
    action: "zoomFaction",
    faction,
    count: targets.length,
    center: center.toArray().map((n) => Number(n.toFixed(2)))
  });
  return targets;
}

function clearSystemView() {
  bodyMeshes.length = 0;
  systemLayer.children.forEach((child) => {
    child.geometry?.dispose?.();
    child.material?.dispose?.();
  });
  systemLayer.clear();
}

function makeOrbit(radius, color = 0x8ca6c8) {
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.42 });
  return makeCircle(radius, 160, material);
}

function bodyColor(bodyType) {
  return {
    star: 0xfff0a8,
    brown_dwarf: 0xb87945,
    planet: 0x7bd7ff,
    moon: 0xd5dce8,
    belt: 0xa8a090,
    station: 0x72d6c9,
    cloud: 0x74c0d8
  }[bodyType] ?? 0xcbd5e1;
}

function bodyRadius(bodyType, habitable = 0) {
  if (bodyType === "star") return 0.48;
  if (bodyType === "brown_dwarf") return 0.38;
  if (bodyType === "belt") return 0.08;
  if (bodyType === "station") return 0.14;
  if (bodyType === "moon") return 0.13;
  return habitable ? 0.24 : 0.19;
}

function scaledOrbit(body, index) {
  if (!body.orbitAu) return 0;
  return 1.2 + Math.log10(Number(body.orbitAu) * 9 + 1) * 5.2 + index * 0.08;
}

async function openSystemView(value = selectedStar?.id) {
  const star = typeof value === "object" ? value : findLocalStar(value);
  if (!star) throw new Error(`Star not found: ${value}`);
  let payload = null;
  try {
    payload = await apiJson(`/api/system?id=${encodeURIComponent(star.id)}`);
  } catch {
    payload = {
      star,
      bodies: [
        {
          id: `${star.id}-primary`,
          name: star.short,
          bodyType: star.objectType === "diffuse_cloud" ? "cloud" : "star",
          orbitAu: 0,
          radiusLabel: star.className,
          habitable: 0,
          summary: star.setting,
          sortOrder: 0
        }
      ]
    };
  }
  clearSystemView();
  const center = toWorld(star.xyz);
  const scaleRoot = new THREE.Group();
  scaleRoot.position.copy(center);
  systemLayer.add(scaleRoot);

  payload.bodies.forEach((body, index) => {
    const orbitRadius = scaledOrbit(body, index);
    if (orbitRadius > 0 && body.bodyType !== "belt") {
      const orbit = makeOrbit(orbitRadius, body.habitable ? 0x78dd8a : 0x8ca6c8);
      scaleRoot.add(orbit);
    }
    if (body.bodyType === "belt") {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(orbitRadius - 0.12, 0.8), orbitRadius + 0.12, 96),
        new THREE.MeshBasicMaterial({ color: 0xa8a090, transparent: true, opacity: 0.22, side: THREE.DoubleSide })
      );
      ring.userData.body = body;
      ring.userData.star = star;
      scaleRoot.add(ring);
      bodyMeshes.push(ring);
      return;
    }
    const angle = index * 1.78 + (star.id.length % 7);
    const radius = body.bodyType === "star" ? 0.08 : bodyRadius(body.bodyType, body.habitable);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 24, 16),
      new THREE.MeshBasicMaterial({ color: bodyColor(body.bodyType), transparent: true, opacity: body.bodyType === "cloud" ? 0.45 : 1 })
    );
    mesh.position.set(Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius);
    mesh.userData.body = body;
    mesh.userData.star = star;
    scaleRoot.add(mesh);
    bodyMeshes.push(mesh);

    const infoRadius = (body.rule_info_time || 0) * (body.info_speed || 0) * (body.ftl_speed || 1);
    if (infoRadius > 0) {
      const csGeometry = new THREE.SphereGeometry(infoRadius, 32, 24);
      const csMat = new THREE.MeshBasicMaterial({ color: bodyColor(body.bodyType), transparent: true, opacity: 0.05, depthWrite: false });
      const controlSphere = new THREE.Mesh(csGeometry, csMat);
      controlSphere.position.copy(mesh.position);
      scaleRoot.add(controlSphere);
    }

    const label = makeTextSprite(formatMarkdown(body.name), "#edf3f8", 19);
    label.position.copy(mesh.position).add(new THREE.Vector3(0, radius + 0.34, 0));
    scaleRoot.add(label);
  });

  if (star.hz_inner && star.hz_outer && star.hz_outer > star.hz_inner) {
    const inner = Math.log10(Number(star.hz_inner) * 9 + 1) * 5.2 + 1.2;
    const outer = Math.log10(Number(star.hz_outer) * 9 + 1) * 5.2 + 1.2;
    const hzGeometry = new THREE.RingGeometry(inner, outer, 128);
    const hzMaterial = new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.1, side: THREE.DoubleSide });
    const hzMesh = new THREE.Mesh(hzGeometry, hzMaterial);
    hzMesh.rotation.x = -Math.PI / 2;
    scaleRoot.add(hzMesh);
  }

  controls.target.copy(center);
  if (payload.bodies.length <= 1) {
    camera.position.set(center.x + 2.5, center.y + 1.8, center.z + 2.5);
  } else {
    camera.position.set(center.x + 9.5, center.y + 7.2, center.z + 9.5);
  }
  showDetails(star);
  writeAgentOutput({ action: "openSystem", id: star.id, bodies: payload.bodies.length });
  return payload;
}

function updateFlyControls(deltaSeconds) {
  if (!pressedKeys.size) return;
  const active = document.activeElement;
  if (active && ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName)) return;

  const speed = (pressedKeys.has("shift") ? 34 : 17) * deltaSeconds;
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward).normalize();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
  const move = new THREE.Vector3();
  if (pressedKeys.has("w")) move.add(forward);
  if (pressedKeys.has("s")) move.sub(forward);
  if (pressedKeys.has("d")) move.add(right);
  if (pressedKeys.has("a")) move.sub(right);
  if (pressedKeys.has("q")) move.add(up);
  if (pressedKeys.has("e")) move.sub(up);
  if (move.lengthSq() === 0) return;
  move.normalize().multiplyScalar(speed);
  camera.position.add(move);
  controls.target.add(move);
}

function setupInteraction() {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function pick(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const bodyHits = raycaster.intersectObjects(bodyMeshes.filter((mesh) => mesh.visible), false);
    if (bodyHits.length) {
      const body = bodyHits[0].object.userData.body;
      const star = bodyHits[0].object.userData.star;
      showBodyDetails(body, star);
      return;
    }
    const hits = raycaster.intersectObjects(starMeshes.filter((mesh) => mesh.visible), false);
    if (hits.length) {
      const star = hits[0].object.userData.star;
      if (event.ctrlKey) {
        if (lastMeasureStar && lastMeasureStar.id !== star.id) {
          drawMeasurement(lastMeasureStar, star);
        }
        lastMeasureStar = star;
      }
      showDetails(star);
      controls.target.copy(hits[0].object.position);
    }
  }

  canvas.addEventListener("pointerdown", pick);
  canvas.addEventListener("dblclick", async (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(starMeshes.filter((mesh) => mesh.visible), false);
    if (hits.length) {
      try {
        await openSystemView(hits[0].object.userData.star);
      } catch (error) {
        writeAgentOutput(error.message);
      }
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = [
      ...raycaster.intersectObjects(bodyMeshes.filter((mesh) => mesh.visible), false),
      ...raycaster.intersectObjects(starMeshes.filter((mesh) => mesh.visible), false)
    ];
    canvas.style.cursor = hits.length ? "pointer" : "grab";
  });
}

async function zoomToStar(value, cameraDistance = 24) {
  let star = findLocalStar(value);
  try {
    const payload = await apiJson(`/api/zoom-target?star=${encodeURIComponent(value)}&distance=${encodeURIComponent(cameraDistance)}`);
    if (payload.star) star = payload.star;
  } catch {
    // Static-file fallback.
  }
  if (!star) throw new Error(`Star not found: ${value}`);
  moveCameraToStar(star, cameraDistance);
  writeAgentOutput({ action: "zoomToStar", id: star.id, name: star.name, xyz: star.xyz });
  return star;
}

async function distanceBetween(from, to) {
  try {
    const payload = await apiJson(`/api/distance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    writeAgentOutput(payload);
    return payload;
  } catch {
    const a = findLocalStar(from);
    const b = findLocalStar(to);
    if (!a || !b) throw new Error("Star not found");
    const payload = {
      from: a,
      to: b,
      distanceLy: Number(localDistance(a, b).toFixed(3)),
      messageDelayYears: Number(localDistance(a, b).toFixed(3))
    };
    writeAgentOutput(payload);
    return payload;
  }
}

async function nearestTo(from, limit = 5, options = {}) {
  const query = new URLSearchParams({
    from,
    limit: String(limit),
    includeOuter: options.includeOuter === false ? "0" : "1",
    habitableOnly: options.habitableOnly ? "1" : "0"
  });
  try {
    const payload = await apiJson(`/api/nearest?${query.toString()}`);
    writeAgentOutput(payload);
    return payload;
  } catch {
    const origin = findLocalStar(from);
    if (!origin) throw new Error(`Star not found: ${from}`);
    const nearest = stars
      .filter((star) => star.id !== origin.id)
      .filter((star) => options.includeOuter !== false || star.status !== "outer")
      .filter((star) => !options.habitableOnly || star.habitable >= 1)
      .map((star) => ({ star, distanceLy: Number(localDistance(origin, star).toFixed(3)) }))
      .sort((a, b) => a.distanceLy - b.distanceLy)
      .slice(0, limit);
    const payload = { origin, nearest };
    writeAgentOutput(payload);
    return payload;
  }
}

function matchesAgentFilters(star, filters = {}) {
  const key = normalizeSearch(filters.q ?? filters.search ?? filters.text ?? "");
  if (key && ![star.id, star.name, star.short, star.faction, star.factionType, star.octant, star.className, star.planets, star.setting]
    .some((value) => normalizeSearch(value).includes(key))) return false;
  if (filters.faction && filters.faction !== "all" && star.faction !== filters.faction) return false;
  if (filters.objectType && filters.objectType !== "all" && star.objectType !== filters.objectType) return false;
  if (filters.spectralClass && filters.spectralClass !== "all" && !String(star.spectralClass).includes(filters.spectralClass)) return false;
  if (filters.factionType && filters.factionType !== "all" && star.factionType !== filters.factionType) return false;
  if (filters.minPlanets !== undefined && star.planetCount < Number(filters.minPlanets)) return false;
  if (filters.habitableOnly && star.habitable < 1) return false;
  const year = Number(filters.year ?? currentYear);
  return star.displayAfter <= year && (star.displayUntil === null || star.displayUntil === undefined || star.displayUntil >= year);
}

function filterStars(filters = {}) {
  const result = stars.filter((star) => matchesAgentFilters(star, filters));
  writeAgentOutput(result.map((star) => ({
    id: star.id,
    name: star.name,
    faction: star.faction,
    objectType: star.objectType,
    spectralClass: star.spectralClass,
    planetCount: star.planetCount,
    xyz: star.xyz
  })));
  return result;
}

function searchStars(textOrFilters) {
  const filters = typeof textOrFilters === "object" && textOrFilters !== null ? textOrFilters : { q: textOrFilters };
  const result = filterStars(filters);
  writeAgentOutput(result.map((star) => ({ id: star.id, name: star.name, faction: star.faction, xyz: star.xyz })));
  return result;
}

function exposeAgentApi() {
  const api = {
    zoomToStar,
    zoomFaction,
    distanceBetween,
    nearestTo,
    searchStars,
    filterStars,
    openSystem: openSystemView,
    addStar: async (payload) => {
      const response = await fetch("/api/stars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      return response.json();
    },
    updateStar: async (payload) => api.addStar(payload),
    clearSystem: () => {
      clearSystemView();
      writeAgentOutput({ action: "clearSystem" });
    },
    getState: () => ({
      selected: selectedStar,
      selectedBody,
      currentYear,
      starCount: stars.length,
      visibleStarCount: stars.filter((star) => star.mesh?.visible).length,
      camera: camera.position.toArray(),
      target: controls.target.toArray()
    })
  };
  window.StarMapAgent = api;
  globalThis.StarMapAgent = api;
  document.StarMapAgent = api;
  document.querySelector("#app").StarMapAgent = api;
  document.documentElement.dataset.agentReady = "true";
  document.dispatchEvent(new CustomEvent("starmap-agent-ready", { detail: { starCount: stars.length } }));
}

function bindUi() {
  const showQuadrantBounds = document.querySelector("#showQuadrantBounds");
  
  [showLabels, showTerritories, showOctants, showQuadrantBounds, showOuter, habitableOnly, objectTypeFilter, spectralFilter, factionTypeFilter].forEach((el) => {
    el.addEventListener("change", updateVisibility);
  });
  factionFilter.addEventListener("change", () => {
    activeFaction = "all";
    updateVisibility();
  });
  searchFilter.addEventListener("input", updateVisibility);
  minPlanets.addEventListener("input", updateVisibility);
  yearSlider.addEventListener("input", updateVisibility);
  starScale.addEventListener("input", updateScale);

  document.querySelector("#resetView").addEventListener("click", () => {
    controls.target.set(0, 0, 0);
    camera.position.set(43, 34, 47);
  });
  document.querySelector("#topView").addEventListener("click", () => {
    controls.target.set(0, 0, 0);
    camera.position.set(0, 68, 0.1);
  });
  document.querySelector("#planeView").addEventListener("click", () => {
    controls.target.set(0, 0, 0);
    camera.position.set(48, 2.5, 0.1);
  });
  spinToggle.addEventListener("click", () => {
    controls.autoRotate = !controls.autoRotate;
    controls.autoRotateSpeed = 0.85;
    spinToggle.setAttribute("aria-pressed", String(controls.autoRotate));
  });

  document.querySelector("#zoomStar").addEventListener("click", async () => {
    try {
      await zoomToStar(agentStar.value);
    } catch (error) {
      writeAgentOutput(error.message);
    }
  });
  document.querySelector("#nearestStar").addEventListener("click", async () => {
    try {
      await nearestTo(agentStar.value || selectedStar?.id || "sol", 5);
    } catch (error) {
      writeAgentOutput(error.message);
    }
  });
  document.querySelector("#calcDistance").addEventListener("click", async () => {
    try {
      await distanceBetween(distanceFrom.value, distanceTo.value);
    } catch (error) {
      writeAgentOutput(error.message);
    }
  });
  document.querySelector("#openSystem").addEventListener("click", async () => {
    try {
      await openSystemView(agentStar.value || selectedStar?.id || "sol");
    } catch (error) {
      writeAgentOutput(error.message);
    }
  });

  const agentAction = document.querySelector("#agentAction");
  const agentSingleTools = document.querySelector("#agentSingleTools");
  const agentDistanceTools = document.querySelector("#agentDistanceTools");
  
  if (agentAction) {
    agentAction.addEventListener("change", () => {
      agentOutput.style.display = agentAction.value !== "none" ? "block" : "none";
      agentSingleTools.style.display = agentAction.value === "single" ? "block" : "none";
      agentDistanceTools.style.display = agentAction.value === "distance" ? "block" : "none";
    });
  }

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const active = document.activeElement;
    if (active && ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName)) return;
    if (["w", "a", "s", "d", "q", "e"].includes(key)) {
      pressedKeys.add(key);
      event.preventDefault();
    }
    if (key === "shift") pressedKeys.add("shift");
  });
  window.addEventListener("keyup", (event) => {
    pressedKeys.delete(event.key.toLowerCase());
    if (event.key === "Shift") pressedKeys.delete("shift");
  });
}

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const delta = Math.min((now - lastFrameTime) / 1000, 0.08);
  lastFrameTime = now;
  updateFlyControls(delta);
  controls.update();
  stars.forEach((star) => {
    if (star.halo) star.halo.quaternion.copy(camera.quaternion);
  });
  renderer.render(scene, camera);
}

async function init() {
  stars = await loadStars();
  selectedStar = stars[0];
  addStarfield();
  addAxes();
  addReferenceGeometry();
  addStars();
  addTerritories();
  buildControls();
  setupInteraction();
  bindUi();
  exposeAgentApi();
  showDetails(selectedStar);
  updateVisibility();
  resize();
  animate();

  const focus = new URLSearchParams(window.location.search).get("focus");
  if (focus) {
    zoomToStar(focus).catch((error) => writeAgentOutput(error.message));
  }
}

window.addEventListener("resize", resize);
init().catch((error) => {
  console.error(error);
  writeAgentOutput(`StarMap failed to start: ${error.message}`);
});
