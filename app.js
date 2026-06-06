import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { fallbackStars, fallbackBodies } from "./star_data.js";

const canvas = document.querySelector("#map");
const detailTitle = document.querySelector("#detailTitle");
const detailList = document.querySelector("#detailList");
const detailTabs = document.querySelector("#detailTabs");
const detailFieldControls = document.querySelector("#detailFieldControls");
const detailSelectAll = document.querySelector("#detailSelectAll");
const detailSelectNone = document.querySelector("#detailSelectNone");
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

const MAP_RADIUS = 50;
const INNER_RADIUS = 25;
const CAMERA_HOME = new THREE.Vector3(78, 58, 84);

const factionColors = {
  "太阳系": "#f4f2de",
  "无限未来": "#ff6575",
  "人类群星": "#68a8ff",
  "明日晨曦": "#ffc857",
  "S&F": "#b28cff",
  "美丽花园巨企": "#78dd8a",
  "半人马联合重工": "#e68a4e",
  "星蓝元素": "#2bd7ff",
  "巴纳德星际动力": "#b9bdc5",
  "拉卡伊冶金公会": "#d5eef2",
  "沃尔夫潮汐能源财团": "#6fd3c7",
  "Ross 128生态城邦": "#a3efb6",
  "远岭联营": "#e6b06f",
  "南爪边境开发集团": "#d070ff",
  "格利泽远星物流网络": "#c8b87a",
  "大衮远洋探索集团": "#5ba8c4",
  "安第斯大气工程公司": "#7ecba1",
  "外环水蛇-北落师门采掘同盟": "#b9b86b",
  "许可/争议区": "#93a0ad",
  "无/无所属": "#8ca6c8",
  "白矮星科研封存区": "#dfe8ff"
};


let stars = [];

const scene = new THREE.Scene();
scene.background = new THREE.Color("#07090d");
scene.fog = new THREE.Fog("#07090d", 95, 175);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 320);
camera.position.copy(CAMERA_HOME);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.rotateSpeed = 0.65;
controls.zoomSpeed = 0.9;
controls.minDistance = 0.5;
controls.maxDistance = 180;
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
let activeSystemScaleRoot = null;
let inSystemView = false;
let savedCameraPos = null;
let savedCameraTarget = null;
let currentYear = 2350;
let lastFrameTime = performance.now();
const pressedKeys = new Set();
let currentDetailTitleHtml = "";
let currentDetailRows = [];
let renderingFieldControls = false;
let systemViewStar = null;
const factionCycleIndex = new Map();
const detailGroupVisibility = new Map(
  JSON.parse(localStorage.getItem("starmap-detail-groups") || "[]")
);

function saveDetailGroupVisibility() {
  localStorage.setItem("starmap-detail-groups", JSON.stringify(Array.from(detailGroupVisibility.entries())));
}

function detailRow(group, key, value) {
  return { group, key, value };
}

function groupVisible(group) {
  return !detailGroupVisibility.has(group) || detailGroupVisibility.get(group);
}

function setAllDetailGroups(visible) {
  const groups = Array.from(new Set(currentDetailRows.map((row) => row.group)));
  groups.forEach((group) => detailGroupVisibility.set(group, visible));
  saveDetailGroupVisibility();
  renderGroupControls();
  renderDetailPanel(currentDetailTitleHtml, currentDetailRows);
}

function renderGroupControls() {
  if (!detailFieldControls) return;
  renderingFieldControls = true;
  const groups = Array.from(new Set(currentDetailRows.map((row) => row.group)));
  detailFieldControls.innerHTML = groups.map((group) => {
    const checked = groupVisible(group) ? " checked" : "";
    return `<label><input type="checkbox" value="${group}"${checked} /> ${group}</label>`;
  }).join("");
  detailFieldControls.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.addEventListener("change", () => {
      if (renderingFieldControls) return;
      detailGroupVisibility.set(input.value, input.checked);
      saveDetailGroupVisibility();
      renderDetailPanel(currentDetailTitleHtml, currentDetailRows);
    });
  });
  renderingFieldControls = false;
}

function renderDetailNav(groups) {
  const links = groups.map((group, index) => {
    const id = `detail-section-${index}`;
    return `<a href="#${id}" data-target="${id}">${group}</a>`;
  }).join("");
  if (detailTabs) detailTabs.innerHTML = links;
  detailTabs?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      document.querySelector(`#${link.dataset.target}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  });
}

function renderDetailPanel(titleHtml, rows) {
  currentDetailTitleHtml = titleHtml;
  currentDetailRows = rows;
  detailTitle.innerHTML = titleHtml;
  renderGroupControls();
  const visibleRows = rows.filter((row) => groupVisible(row.group));
  const groups = Array.from(new Set(visibleRows.map((row) => row.group)));
  renderDetailNav(groups);
  if (!visibleRows.length) {
    detailList.innerHTML = `<p class="empty-detail">所有字段已隐藏。</p>`;
    return;
  }
  detailList.innerHTML = groups.map((group, index) => {
    const groupRows = visibleRows.filter((row) => row.group === group);
    return `
      <section class="detail-section" id="detail-section-${index}">
        <h3>${group}</h3>
        <dl>
          ${groupRows.map((row) => `<dt>${row.key}</dt><dd>${row.value}</dd>`).join("")}
        </dl>
      </section>
    `;
  }).join("");
}

function formatMarkdown(text) {
  if (!text) return "";
  return String(text)
    .replace(/\*([^*]+)\*/g, "<i>$1</i>")
    .replace(/_([^_]+)_/g, "<i>$1</i>");
}

function ensureItalic(text) {
  const value = String(text || "").trim();
  if (!value) return value;
  return value.startsWith("_") && value.endsWith("_") ? value : `_${value.replace(/^_+|_+$/g, "")}_`;
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
  const setting = star.setting ? ensureItalic(star.setting) : "";
  const normalized = {
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
    className,
    setting
  };
  if (normalized.distance > 25) normalized.faction = "无/无所属";
  if (normalized.faction === "许可/争议区" || normalized.faction === "白矮星科研封存区") {
    normalized.faction = "无/无所属";
  }
  return normalized;
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

function controlRadius(source) {
  return Number(source?.rule_info_time || 0) * Number(source?.info_speed || 0) * Number(source?.ftl_speed || 1);
}

function propagationRows(source) {
  const radius = controlRadius(source);
  return [
    detailRow("控制", "可容忍统治信息传播时间", `${Number(source?.rule_info_time || 0).toFixed(3)} 年`),
    detailRow("控制", "信息传播速度", `${Number(source?.info_speed || 0).toFixed(3)} ly/年`),
    detailRow("控制", "FTL速度倍率", `${Number(source?.ftl_speed || 1).toFixed(3)}×`),
    detailRow("控制", "实际控制半径", `${radius.toFixed(3)} ly`)
  ];
}

function disposeObject(object) {
  object.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material?.dispose?.());
    } else {
      child.material?.dispose?.();
    }
  });
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
  const axisLen = MAP_RADIUS + 8;
  const arrowX = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), axisLen, 0xff6f61, 2.7, 1.25);
  const arrowY = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), axisLen, 0xe6d36a, 2.7, 1.25);
  const arrowZ = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), axisLen, 0x8fa8ff, 2.7, 1.25);
  root.add(arrowX, arrowY, arrowZ);

  const labels = [
    ["X+ 银心", [MAP_RADIUS + 10, 0, 0], "#ff9389"],
    ["Y+ 银河自旋", [0, 0, MAP_RADIUS + 10], "#f0df82"],
    ["Z+ 北银极", [0, MAP_RADIUS + 10, 0], "#b4c4ff"],
    ["50 ly 边界", [0, -MAP_RADIUS - 6, 0], "#9eaebe"]
  ];
  labels.forEach(([text, position, color]) => {
    const sprite = makeTextSprite(text, color, 30);
    sprite.position.set(...position);
    labelLayer.add(sprite);
  });
}

function addReferenceGeometry() {
  const ringMaterial = new THREE.LineBasicMaterial({ color: 0x7f8b99, transparent: true, opacity: 0.26 });
  const innerMaterial = new THREE.LineBasicMaterial({ color: 0x8fa8ff, transparent: true, opacity: 0.18 });
  const circleXY = makeCircle(MAP_RADIUS, 160, ringMaterial);
  circleXY.rotation.x = Math.PI / 2;
  const circleXZ = makeCircle(MAP_RADIUS, 160, ringMaterial);
  const circleYZ = makeCircle(MAP_RADIUS, 160, ringMaterial);
  circleYZ.rotation.y = Math.PI / 2;
  const innerXY = makeCircle(INNER_RADIUS, 128, innerMaterial);
  innerXY.rotation.x = Math.PI / 2;
  const innerXZ = makeCircle(INNER_RADIUS, 128, innerMaterial);
  const innerYZ = makeCircle(INNER_RADIUS, 128, innerMaterial);
  innerYZ.rotation.y = Math.PI / 2;
  root.add(circleXY, circleXZ, circleYZ, innerXY, innerXZ, innerYZ);

  const grid = new THREE.GridHelper(MAP_RADIUS * 2.2, 22, 0x2d3b48, 0x18212b);
  grid.material.transparent = true;
  grid.material.opacity = 0.42;
  root.add(grid);

  const planeMat = new THREE.LineBasicMaterial({ color: 0x344252, transparent: true, opacity: 0.32 });
  root.add(makePlaneSquare("xy", planeMat), makePlaneSquare("xz", planeMat), makePlaneSquare("yz", planeMat));

  ["+++", "++-", "+-+", "+--", "-++", "-+-", "--+", "---"].forEach((octant) => {
    const x = octant[0] === "+" ? MAP_RADIUS + 6 : -MAP_RADIUS - 6;
    const y = octant[2] === "+" ? MAP_RADIUS + 6 : -MAP_RADIUS - 6;
    const z = octant[1] === "+" ? MAP_RADIUS + 6 : -MAP_RADIUS - 6;
    const sprite = makeTextSprite(octant, "#d8e2ec", 32);
    sprite.position.set(x, y, z);
    octantLayer.add(sprite);
  });

  const octantColors = {
    "+++": 0xff6f61,
    "++-": 0x72d6c9,
    "+-+": 0xe6d36a,
    "+--": 0x8fa8ff,
    "-++": 0xd070ff,
    "-+-": 0x2bd7ff,
    "--+": 0xff9d6a,
    "---": 0xcbd5e1
  };
  ["+++", "++-", "+-+", "+--", "-++", "-+-", "--+", "---"].forEach((octant) => {
    const xDir = octant[0] === "+" ? 1 : -1;
    const yDir = octant[2] === "+" ? 1 : -1;
    const zDir = octant[1] === "+" ? 1 : -1;
    const geometry = new THREE.BoxGeometry(MAP_RADIUS, MAP_RADIUS, MAP_RADIUS);
    const edges = new THREE.EdgesGeometry(geometry);
    const color = octantColors[octant];
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.54 }));
    const offset = 0.12;
    line.position.set(
      xDir * MAP_RADIUS * 0.5 + xDir * offset,
      yDir * MAP_RADIUS * 0.5 + yDir * offset,
      zDir * MAP_RADIUS * 0.5 + zDir * offset
    );
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
  const s = MAP_RADIUS;
  const points = kind === "xy"
    ? [new THREE.Vector3(-s, -s, 0), new THREE.Vector3(s, -s, 0), new THREE.Vector3(s, s, 0), new THREE.Vector3(-s, s, 0), new THREE.Vector3(-s, -s, 0)]
    : kind === "xz"
      ? [new THREE.Vector3(-s, 0, -s), new THREE.Vector3(s, 0, -s), new THREE.Vector3(s, 0, s), new THREE.Vector3(-s, 0, s), new THREE.Vector3(-s, 0, -s)]
      : [new THREE.Vector3(0, -s, -s), new THREE.Vector3(0, s, -s), new THREE.Vector3(0, s, s), new THREE.Vector3(0, -s, s), new THREE.Vector3(0, -s, -s)];
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
}

function addStarfield() {
  const count = 1200;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const radius = MAP_RADIUS + 18 + Math.random() * 58;
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
  if (star.objectType === "rogue_planet") return 0.18;
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

    const infoRadius = controlRadius(star);
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
    ["gj1002", "li-hartman", "星蓝元素", true],
    ["li-hartman", "trappist-1", "星蓝元素", true],
    ["gj1002", "lhs1140", "星蓝元素", true],
    ["groombridge34", "hd219134", "S&F", false],
    ["hd219134", "107piscium", "S&F", true],
    ["hd219134", "55cnc", "S&F", true],
    ["tau-ceti", "teegarden", "美丽花园巨企", false],
    ["teegarden", "gj357", "美丽花园巨企", true],
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
    .sort((a, b) => {
      if (a === "无/无所属") return 1;
      if (b === "无/无所属") return -1;
      return factionRanks.get(a) - factionRanks.get(b);
    });

  factions.forEach((faction) => {
    const option = document.createElement("option");
    option.value = faction;
    option.textContent = faction;
    factionFilter.appendChild(option);

    // Initial count uses all stars for this faction; updateLegendCounts() will
    // correct it once filters are applied.
    const allFactionStars = stars.filter((star) => star.faction === faction);
    const count = allFactionStars.length;
    const row = document.createElement("button");
    row.type = "button";
    row.className = "legend-item";
    row.dataset.faction = faction;
    const cycleHtml = `<span class="legend-count">${count} <button class="cycle-btn" title="循环定位该势力恒星系">⟳</button></span>`;
    row.innerHTML = `<span class="swatch" style="background:${factionColors[faction]}"></span><span>${faction}</span>${cycleHtml}`;
    row.addEventListener("click", () => {
      zoomFaction(activeFaction === faction ? "all" : faction);
    });
    const cycleBtn = row.querySelector(".cycle-btn");
    if (cycleBtn) {
      cycleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (activeFaction !== faction) zoomFaction(faction);
        const fStars = stars.filter((s) => s.faction === faction && isGloballyVisible(s));
        if (!fStars.length) return;
        const idx = (factionCycleIndex.get(faction) || 0) % fStars.length;
        moveCameraToStar(fStars[idx], 8);
        factionCycleIndex.set(faction, idx + 1);
      });
    }
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

// Returns true if a star passes the two global-toggle filters (outer ring
// and habitable-only) plus the time-visibility gates. Used both by
// updateVisibility() and updateLegendCounts() so they stay in sync.
function isGloballyVisible(star) {
  if (star.displayAfter > currentYear) return false;
  if (star.displayUntil !== null && star.displayUntil !== undefined && star.displayUntil < currentYear) return false;
  if (!showOuter.checked && star.status === "outer" && star.distance > INNER_RADIUS) return false;
  if (habitableOnly.checked && star.id !== "sol" && star.habitable < 1) return false;
  return true;
}

// Re-counts visible stars per faction in the legend and refreshes the count
// badges + cycle lists so they respect the current filter state.
function updateLegendCounts() {
  legend.querySelectorAll(".legend-item").forEach((row) => {
    const faction = row.dataset.faction;
    if (!faction) return;
    const visStars = stars.filter((s) => s.faction === faction && isGloballyVisible(s));
    const count = visStars.length;
    const countEl = row.querySelector(".legend-count");
    const spanEl = row.querySelector("span:last-child:not(.swatch):not(.legend-count)");
    if (count > 1) {
      if (countEl) {
        countEl.firstChild.textContent = count + " ";
      } else {
        // was showing plain count — upgrade to cycle button
        const plain = spanEl;
        if (plain) plain.remove();
        const cycleSpan = document.createElement("span");
        cycleSpan.className = "legend-count";
        cycleSpan.innerHTML = `${count} <button class="cycle-btn" title="循环定位该势力恒星系">⟳</button>`;
        cycleSpan.querySelector(".cycle-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          if (activeFaction !== faction) zoomFaction(faction);
          const fStars = stars.filter((s) => s.faction === faction && isGloballyVisible(s));
          if (!fStars.length) return;
          const idx = (factionCycleIndex.get(faction) || 0) % fStars.length;
          moveCameraToStar(fStars[idx], 8);
          factionCycleIndex.set(faction, idx + 1);
        });
        row.appendChild(cycleSpan);
      }
    } else {
      // count <= 1: always keep cycle button, just update number
      if (countEl) {
        countEl.firstChild.textContent = count + " ";
      } else if (spanEl) {
        // convert plain span to cycle-button span
        const cycleSpan = document.createElement("span");
        cycleSpan.className = "legend-count";
        cycleSpan.innerHTML = `${count} <button class="cycle-btn" title="循环定位该势力恒星系">⟳</button>`;
        cycleSpan.querySelector(".cycle-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          if (activeFaction !== faction) zoomFaction(faction);
          const fStars = stars.filter((s) => s.faction === faction && isGloballyVisible(s));
          if (!fStars.length) return;
          const idx = (factionCycleIndex.get(faction) || 0) % fStars.length;
          moveCameraToStar(fStars[idx], 8);
          factionCycleIndex.set(faction, idx + 1);
        });
        spanEl.replaceWith(cycleSpan);
      }
    }
  });
}

function updateVisibility() {
  const faction = factionFilter.value;
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
      // Search highlights the matching star but does NOT hide other stars —
      // it only suppresses stars that fail ALL other (non-search) filters.
      const matches = [star.id, star.name, star.short, star.faction, star.factionType, star.className, star.planets, star.setting]
        .some((value) => normalizeSearch(value).includes(text));
      if (!matches) visible = false;
    }
    if (objectType !== "all") visible = visible && star.objectType === objectType;
    if (spectral !== "all") visible = visible && String(star.spectralClass).includes(spectral);
    if (factionType !== "all") visible = visible && star.factionType === factionType;
    if (star.planetCount < minPlanetCount) visible = false;
    if (!isGloballyVisible(star)) visible = false;
    star.mesh.visible = visible;
    star.halo.visible = visible;
    if (star.controlSphere) star.controlSphere.visible = visible;
    if (star.label) star.label.visible = visible;
    const highlight = activeFaction !== "all" && star.faction === activeFaction;
    const mutedByHighlight = activeFaction !== "all" && !highlight && star.id !== "sol";
    
    if (inSystemView && systemViewStar && star.id === systemViewStar.id) {
      star.mesh.visible = false;
      star.halo.visible = false;
      if (star.label) star.label.visible = false;
      if (star.controlSphere) star.controlSphere.visible = false;
    } else {
      star.mesh.material.opacity = mutedByHighlight ? 0.18 : (star.objectType === "diffuse_cloud" ? 0.22 : 1);
      star.mesh.material.transparent = mutedByHighlight || star.objectType === "diffuse_cloud";
      star.halo.material.opacity = highlight ? 0.55 : star.status === "outer" ? 0.16 : 0.28;
      if (star.controlSphere) star.controlSphere.material.opacity = highlight ? 0.075 : 0.04;
    }
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
    row.classList.toggle("active", activeFaction !== "all" && row.dataset.faction === activeFaction);
  });
  updateLegendCounts();
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
  const rows = [
    detailRow("概览", "势力", star.faction),
    detailRow("概览", "实力序", String(star.rank)),
    detailRow("概览", "八象限", star.octant),
    detailRow("概览", "到太阳系距离", `${star.distance.toFixed(2)} ly`),
    detailRow("概览", "太阳系内战消息到达", `AD ${(2278 + star.distance).toFixed(2)}`),
    detailRow("概览", "银河坐标", `(${star.xyz.map((n) => n.toFixed(1)).join(", ")}) ly`),
    detailRow("天文", "主星", formatMarkdown(star.className)),
    detailRow("天文", "天体类型", star.objectType),
    detailRow("天文", "光谱类型", star.spectralClass),
    detailRow("天文", "恒星数", String(star.starCount)),
    detailRow("天文", "行星数", `${star.planetCount}（确认 ${star.confirmedPlanets} / 候选 ${star.candidatePlanets}）`),
    detailRow("势力", "势力类型", star.factionType),
    detailRow("天文", "行星统计", formatMarkdown(star.planets)),
    ...(star.reality ? [detailRow("现实", "现实口径", formatMarkdown(star.reality))] : []),
    detailRow("设定", "2350设定", formatMarkdown(star.setting))
  ];
  if (star.notes) rows.push(detailRow("势力", "势力备注", formatMarkdown(star.notes)));
  if (star.age) rows.push(detailRow("天文", "恒星年龄", formatMarkdown(star.age)));
  if (star.lifespan) rows.push(detailRow("天文", "恒星寿命", formatMarkdown(star.lifespan)));
  if (star.disasters) rows.push(detailRow("天文", "灾害特征", formatMarkdown(star.disasters)));
  if (star.hz_inner && star.hz_outer) rows.push(detailRow("天文", "宜居带", `${Number(star.hz_inner).toFixed(3)}-${Number(star.hz_outer).toFixed(3)} AU`));
  rows.push(...propagationRows(star));
  renderDetailPanel(formatMarkdown(star.name), rows);
}

function showBodyDetails(body, star) {
  selectedStar = star;
  selectedBody = body;
  const rows = [
    detailRow("概览", "所属恒星系", formatMarkdown(star.name)),
    detailRow("概览", "天体类型", body.bodyType),
    detailRow("轨道", "轨道", `${Number(body.orbitAu).toFixed(3)} AU`),
    detailRow("物理", "尺度", body.radiusLabel || "-"),
    detailRow("物理", "质量", body.massLabel || "-"),
    detailRow("物理", "宜居", body.habitable ? "是/准宜居" : "否"),
    detailRow("说明", "说明", formatMarkdown(body.summary || "-"))
  ];
  if (body.bodyType === "star" && star.hz_inner && star.hz_outer) {
    rows.push(detailRow("轨道", "恒星宜居带", `${Number(star.hz_inner).toFixed(3)}-${Number(star.hz_outer).toFixed(3)} AU`));
  }
  rows.push(...propagationRows(body));
  renderDetailPanel(formatMarkdown(`${star.short} / ${body.name}`), rows);
}

function drawMeasurement(fromStar, toStar) {
  const distance = localDistance(fromStar, toStar);
  const from = toWorld(fromStar.xyz);
  const to = toWorld(toStar.xyz);
  const midpoint = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
  const group = new THREE.Group();
  group.userData.measurement = {
    from: fromStar.id,
    to: toStar.id,
    distanceLy: Number(distance.toFixed(3))
  };
  const material = new THREE.LineDashedMaterial({
    color: 0xffffff,
    dashSize: 0.42,
    gapSize: 0.28,
    transparent: true,
    opacity: 0.86
  });
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([from, to]),
    material
  );
  line.computeLineDistances();
  line.userData.measurementGroup = group;
  const label = makeTextSprite(`${distance.toFixed(2)} ly`, "#ffffff", 18);
  label.position.copy(midpoint).add(new THREE.Vector3(0, 0.58, 0));
  label.userData.measurementGroup = group;
  group.add(line, label);
  measurementLayer.add(group);
  while (measurementLayer.children.length > 6) {
    const old = measurementLayer.children[0];
    measurementLayer.remove(old);
    disposeObject(old);
  }
  writeAgentOutput({
    action: "ctrlClickDistance",
    from: fromStar.short,
    to: toStar.short,
    distanceLy: Number(distance.toFixed(3)),
    messageDelayYears: Number(distance.toFixed(3))
  });
}

function zoomFaction(faction) {
  activeFaction = faction || "all";
  if (activeFaction === "all") {
    updateVisibility();
    writeAgentOutput({ action: "clearFactionHighlight" });
    return [];
  }
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
  if (systemViewStar) {
    const s = systemViewStar;
    s.mesh.visible = true;
    if (s.halo) s.halo.visible = true;
    if (s.label) s.label.visible = showLabels.checked;
    if (s.controlSphere) s.controlSphere.visible = true;
    systemViewStar = null;
  }
  bodyMeshes.length = 0;
  systemLayer.children.forEach((child) => disposeObject(child));
  systemLayer.clear();
  activeSystemScaleRoot = null;
  inSystemView = false;
  controls.minDistance = 0.5;
  starLayer.visible = true;
  labelLayer.visible = showLabels.checked;
  territoryLayer.visible = showTerritories.checked;
}

function exitSystemView() {
  if (!inSystemView) return;
  clearSystemView();
  if (savedCameraPos && savedCameraTarget) {
    camera.position.copy(savedCameraPos);
    controls.target.copy(savedCameraTarget);
  } else {
    camera.position.copy(CAMERA_HOME);
    controls.target.set(0, 0, 0);
  }
  writeAgentOutput({ action: "exitSystem" });
}

function makeOrbit(radius, color = 0x8ca6c8) {
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.58 });
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

function scaledOrbitAu(orbitAu) {
  if (!orbitAu) return 0;
  return 1.2 + Math.log10(Number(orbitAu) * 9 + 1) * 5.2;
}

function hasCuratedSystemDetails(star, bodies = []) {
  return bodies.some((body) => {
    const id = String(body.id || "");
    if (id === `${star.id}-primary` || id === `${star.id}-cloud` || id === `${star.id}-resource-belt`) return false;
    if (id.startsWith(`${star.id}-planet-`) && String(body.summary || "").includes("自动生成")) return false;
    return true;
  });
}

async function openSystemView(value = selectedStar?.id) {
  const star = typeof value === "object" ? value : findLocalStar(value);
  if (!star) throw new Error(`Star not found: ${value}`);
  let payload = null;
  try {
    payload = await apiJson(`/api/system?id=${encodeURIComponent(star.id)}`);
  } catch {
    const curatedBodies = fallbackBodies[star.id];
    if (curatedBodies) {
      payload = { star, bodies: curatedBodies };
    } else {
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
  }
  // Save camera state before entering system view
  savedCameraPos = camera.position.clone();
  savedCameraTarget = controls.target.clone();
  clearSystemView();
  const center = toWorld(star.xyz);

  if (!hasCuratedSystemDetails(star, payload.bodies)) {
    moveCameraToStar(star, 5.5);
    writeAgentOutput({ action: "openSystemZoomOnly", id: star.id, reason: "no curated system bodies" });
    return payload;
  }

  const scaleRoot = new THREE.Group();
  scaleRoot.position.copy(center);
  systemLayer.add(scaleRoot);
  activeSystemScaleRoot = scaleRoot;
  inSystemView = true;
  systemViewStar = star;

  star.mesh.visible = false;
  if (star.halo) star.halo.visible = false;
  if (star.label) star.label.visible = false;
  if (star.controlSphere) star.controlSphere.visible = false;

  const starRadius = getStarRadius(star) * Number(starScale.value);
  const maxOrbit = Math.max(1, ...payload.bodies.map((b, i) => scaledOrbit(b, i)));
  const systemScale = Math.min(0.15, (starRadius * 1.8) / maxOrbit);
  scaleRoot.scale.setScalar(systemScale);

  controls.minDistance = 0.01;

  if (star.hz_inner && star.hz_outer && star.hz_outer > star.hz_inner) {
    const inner = scaledOrbitAu(star.hz_inner);
    const outer = scaledOrbitAu(star.hz_outer);
    const hzGeometry = new THREE.RingGeometry(inner, outer, 160);
    const hzMaterial = new THREE.MeshBasicMaterial({ color: 0x44ff88, transparent: true, opacity: 0.11, side: THREE.DoubleSide, depthWrite: false });
    const hzMesh = new THREE.Mesh(hzGeometry, hzMaterial);
    hzMesh.rotation.x = -Math.PI / 2;
    hzMesh.userData.kind = "habitableZone";
    scaleRoot.add(hzMesh);
    const hzLabel = makeTextSprite("宜居带", "#9cf7b0", 17);
    hzLabel.position.set(outer, 0.22, 0);
    scaleRoot.add(hzLabel);
  }

  const bodyMeshById = new Map();
  const nonMoons = payload.bodies.filter((b) => b.bodyType !== "moon");
  const moons = payload.bodies.filter((b) => b.bodyType === "moon");

  nonMoons.forEach((body, index) => {
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
    const radius = body.bodyType === "star" ? 0.18 : bodyRadius(body.bodyType, body.habitable);
    const color = body.bodyType === "star" ? bodyColor("star") : bodyColor(body.bodyType);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 24, 16),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: body.bodyType === "cloud" ? 0.45 : 1 })
    );
    mesh.position.set(Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius);
    mesh.userData.body = body;
    mesh.userData.star = star;
    scaleRoot.add(mesh);
    bodyMeshes.push(mesh);
    bodyMeshById.set(body.id, mesh);

    const infoRadius = controlRadius(body);
    if (infoRadius > 0) {
      const csGeometry = new THREE.SphereGeometry(infoRadius, 32, 24);
      const csMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05, depthWrite: false });
      const controlSphere = new THREE.Mesh(csGeometry, csMat);
      controlSphere.position.copy(mesh.position);
      scaleRoot.add(controlSphere);
    }

    const label = makeTextSprite(body.name, body.bodyType === "star" ? "#fff0a8" : "#edf3f8", 19);
    label.position.copy(mesh.position).add(new THREE.Vector3(0, radius + 0.34, 0));
    scaleRoot.add(label);
  });

  moons.forEach((moon, moonIdx) => {
    const parentMesh = moon.parentId ? bodyMeshById.get(moon.parentId) : null;
    const moonOrbitRadius = 0.35 + moonIdx * 0.22 + Math.log10(Number(moon.orbitAu || 0.01) * 9 + 1) * 0.6;
    const moonAngle = moonIdx * 2.4 + 0.5;
    const radius = bodyRadius("moon", moon.habitable);

    if (parentMesh) {
      const orbit = makeOrbit(moonOrbitRadius, 0xd5dce8);
      orbit.position.copy(parentMesh.position);
      scaleRoot.add(orbit);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 12),
        new THREE.MeshBasicMaterial({ color: bodyColor("moon") })
      );
      mesh.position.set(
        parentMesh.position.x + Math.cos(moonAngle) * moonOrbitRadius,
        parentMesh.position.y,
        parentMesh.position.z + Math.sin(moonAngle) * moonOrbitRadius
      );
      mesh.userData.body = moon;
      mesh.userData.star = star;
      scaleRoot.add(mesh);
      bodyMeshes.push(mesh);
      bodyMeshById.set(moon.id, mesh);
      const label = makeTextSprite(moon.name, "#d5dce8", 16);
      label.position.copy(mesh.position).add(new THREE.Vector3(0, radius + 0.25, 0));
      scaleRoot.add(label);
    } else {
      const globalIdx = nonMoons.length + moonIdx;
      const orbitRadius = scaledOrbit(moon, globalIdx);
      if (orbitRadius > 0) {
        const orbit = makeOrbit(orbitRadius, 0xd5dce8);
        scaleRoot.add(orbit);
      }
      const angle = globalIdx * 1.78 + (star.id.length % 7);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 12),
        new THREE.MeshBasicMaterial({ color: bodyColor("moon") })
      );
      mesh.position.set(Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius);
      mesh.userData.body = moon;
      mesh.userData.star = star;
      scaleRoot.add(mesh);
      bodyMeshes.push(mesh);
      bodyMeshById.set(moon.id, mesh);
      const label = makeTextSprite(moon.name, "#d5dce8", 16);
      label.position.copy(mesh.position).add(new THREE.Vector3(0, radius + 0.25, 0));
      scaleRoot.add(label);
    }
  });

  controls.target.copy(center);
  const systemExtent = maxOrbit * systemScale;
  const zoomDist = systemExtent * 2.8;
  camera.position.set(center.x, center.y + zoomDist * 0.92, center.z + zoomDist * 0.4);
  starLayer.visible = false;
  labelLayer.visible = false;
  territoryLayer.visible = false;
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
  raycaster.params.Line = raycaster.params.Line || {};
  raycaster.params.Line.threshold = 0.35;
  const pointer = new THREE.Vector2();

  function setPointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  }

  function measurementTargets() {
    const targets = [];
    measurementLayer.traverse((child) => {
      if (child.userData.measurementGroup) targets.push(child);
    });
    return targets;
  }

  function pickMeasurement() {
    const hits = raycaster.intersectObjects(measurementTargets(), false);
    return hits.length ? hits[0].object.userData.measurementGroup : null;
  }

  function pick(event) {
    setPointer(event);
    const measurement = pickMeasurement();
    if (measurement) return;
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
    setPointer(event);
    const measurement = pickMeasurement();
    if (measurement) {
      const removed = measurement.userData.measurement;
      measurementLayer.remove(measurement);
      disposeObject(measurement);
      writeAgentOutput({ action: "removeMeasurement", ...removed });
      return;
    }
    const bodyHits = raycaster.intersectObjects(bodyMeshes.filter((mesh) => mesh.visible), false);
    if (bodyHits.length) {
      const body = bodyHits[0].object.userData.body;
      const star = bodyHits[0].object.userData.star;
      try {
        if (inSystemView) {
          if (body.bodyType === "star") {
            exitSystemView();
            return;
          }
          const bodyWorldPos = new THREE.Vector3();
          bodyHits[0].object.getWorldPosition(bodyWorldPos);
          controls.target.copy(bodyWorldPos);
          const offset = 0.06;
          camera.position.set(bodyWorldPos.x + offset, bodyWorldPos.y + offset * 0.6, bodyWorldPos.z + offset);
          showBodyDetails(body, star);
          writeAgentOutput({ action: "zoomBody", star: star.id, body: body.id });
          return;
        }
        if (!activeSystemScaleRoot || selectedStar?.id !== star.id) {
          await openSystemView(star);
        }
        showBodyDetails(body, star);
        writeAgentOutput({ action: "openBody", star: star.id, body: body.id });
      } catch (error) {
        writeAgentOutput(error.message);
      }
      return;
    }
    const hits = raycaster.intersectObjects(starMeshes.filter((mesh) => mesh.visible), false);
    if (hits.length) {
      const clickedStar = hits[0].object.userData.star;
      // If double-clicking the same star while in system view, exit system view
      if (inSystemView && selectedStar?.id === clickedStar.id) {
        exitSystemView();
        return;
      }
      try {
        await openSystemView(clickedStar);
      } catch (error) {
        writeAgentOutput(error.message);
      }
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    setPointer(event);
    const hits = [
      ...raycaster.intersectObjects(measurementTargets(), false),
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
        method: payload?.id && payload?.partial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload?.partial ? Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "partial")) : payload)
      });
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      return response.json();
    },
    updateStar: async (payload) => api.addStar({ ...payload, partial: true }),
    upsertBody: async (payload) => {
      const response = await fetch("/api/system-bodies", {
        method: payload?.partial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload?.partial ? Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "partial")) : payload)
      });
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      return response.json();
    },
    addBody: async (payload) => api.upsertBody(payload),
    updateBody: async (payload) => api.upsertBody({ ...payload, partial: true }),
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

  const panelLeft = document.querySelector(".panel-left");
  const panelRight = document.querySelector(".panel-right");
  const toggleLeft = document.querySelector("#toggleLeft");
  const toggleRight = document.querySelector("#toggleRight");
  toggleLeft?.addEventListener("click", () => {
    panelLeft.classList.toggle("collapsed");
    toggleLeft.textContent = panelLeft.classList.contains("collapsed") ? "▶" : "◀";
  });
  toggleRight?.addEventListener("click", () => {
    panelRight.classList.toggle("collapsed");
    toggleRight.textContent = panelRight.classList.contains("collapsed") ? "☰" : "✕";
  });

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
  detailSelectAll?.addEventListener("click", () => setAllDetailGroups(true));
  detailSelectNone?.addEventListener("click", () => setAllDetailGroups(false));

  document.querySelector("#resetView").addEventListener("click", () => {
    controls.target.set(0, 0, 0);
    camera.position.copy(CAMERA_HOME);
  });
  document.querySelector("#topView").addEventListener("click", () => {
    controls.target.set(0, 0, 0);
    camera.position.set(0, 112, 0.1);
  });
  document.querySelector("#planeView").addEventListener("click", () => {
    controls.target.set(0, 0, 0);
    camera.position.set(88, 3.2, 0.1);
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
    if (event.key === "Escape" && inSystemView) {
      exitSystemView();
      event.preventDefault();
      return;
    }
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
