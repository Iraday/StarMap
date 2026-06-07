import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { fallbackStars, fallbackBodies } from "./star_data.js?v=2";
import { orbitPeriodByName, solPeriods, orbitPeriodBySma } from "./orbit_periods.js";
import { shipClasses, shipCategories, ships, createShip, createAsteroid, commandTravel, commandTravelToPoint, commandOrbitAroundPoint, tickShips, shipWorldPosition, shipInfo, listShips, removeShip, lorentz, travelTimes, getFleetSummary, serializeShips, loadShips } from "./ships.js?v=3";

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
const showHabitableScores = document.querySelector("#showHabitableScores");
const starScale = document.querySelector("#starScale");
const spinToggle = document.querySelector("#spinToggle");
const agentStar = document.querySelector("#agentStar");
const distanceFrom = document.querySelector("#distanceFrom");
const distanceTo = document.querySelector("#distanceTo");
const agentOutput = document.querySelector("#agentOutput");
const starNames = document.querySelector("#starNames");
const navObjectNames = document.querySelector("#navObjectNames");
const searchFilter = document.querySelector("#searchFilter");
const objectTypeFilter = document.querySelector("#objectTypeFilter");
const spectralFilter = document.querySelector("#spectralFilter");
const factionTypeFilter = document.querySelector("#factionTypeFilter");
const minPlanets = document.querySelector("#minPlanets");
const yearSlider = document.querySelector("#yearSlider");
const yearLabel = document.querySelector("#yearLabel");
const skyRadius = document.querySelector("#skyRadius");
const skyRadiusLabel = document.querySelector("#skyRadiusLabel");
const orbitSpeed = document.querySelector("#orbitSpeed");
const orbitSpeedLabel = document.querySelector("#orbitSpeedLabel");

const MAP_RADIUS = 50;
const INNER_RADIUS = 25;
const CAMERA_HOME = new THREE.Vector3(78, 58, 84);
const EARTHLIKE_VISUAL_SCORE = 0.8;
const TERRAFORMING_VISUAL_SCORE = 0.35;

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
const shipRouteLayer = new THREE.Group();
const systemLayer = new THREE.Group();
const quadrantBoundsLayer = new THREE.Group();
scene.add(root, octantLayer, territoryLayer, shipRouteLayer, starLayer, measurementLayer, systemLayer, labelLayer, quadrantBoundsLayer);

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
let currentDetailTarget = null;
let renderingFieldControls = false;
let systemViewStar = null;
let orbitSimDays = 0;               // cumulative simulation time in days
const orbitingBodies = [];           // [{mesh, label, scoreLabel, glowInner, glowOuter, saturnRing, controlSphere, orbitCenter, orbitRadius, periodDays, startAngle, parentMesh}]
// ── Time control ──
const SAVE_SCHEMA_VERSION = 1;
const APP_STATE_VERSION = "starmap-2350-v1";
const REALTIME_DAYS_PER_SEC = 1 / 86400;
let timeFlowDaysPerSec = REALTIME_DAYS_PER_SEC; // global time flow rate (days per real second)
let lastNonZeroTimeFlowDaysPerSec = REALTIME_DAYS_PER_SEC;
let totalSimDays = 0;                // total elapsed simulation days
let timeFlowPaused = false;
let followShipId = null;              // ship id to track with camera
let selectedShipId = null;            // currently selected ship for info panel
const selectedShipIds = new Set();     // multi-selection used by fleet commands
let selectedFleetId = null;
let fleetCycleIndex = 0;
let nextFleetId = 1;
let fleets = [];
let shipCommandMode = "move";
let orbitMouseAdjustEnabled = true;
let leftClickMode = "rotate";
let orbitAdjustState = null;
let orbitPreviewRoute = null;
let shipBulkMode = false;
let fleetBulkMode = false;
let shipInfoEditing = false;
let fleetPanelUpdateTimer = 0;        // throttle fleet panel updates
let rightClickCommandState = { time: 0, x: 0, y: 0 };
let labelScaleFactor = 1.0;           // global label/name size multiplier
const shipMeshes = new Map();         // shipId -> {mesh, label, trail, geo}
const shipRouteObjects = new Map();    // shipId -> planned route group
const factionCycleIndex = new Map();
const openFleetWindows = new Map();   // fleetId -> DOM element for fleet-specific ship windows
let fleetWindowDirty = false;         // flag to trigger fleet window refresh
const keyBindings = {
  forward: "w",
  backward: "s",
  left: "a",
  right: "d",
  up: "q",
  down: "e",
  deselectShip: "`",
  exitSystem: "escape",
  pauseTime: " ",
};
const uiPanelDefs = {
  controls: { label: "左侧控制", selector: ".panel-left" },
  details: { label: "恒星信息", selector: ".panel-right" },
  time: { label: "时间控制", selector: "#timeHud" },
  fleet: { label: "舰船控制", selector: "#fleetPanel" },
  shipCommand: { label: "舰船命令", selector: "#shipCommandPanel" },
  shipInfo: { label: "舰船信息", selector: "#shipInfoPanel" },
  saveLoad: { label: "保存读取", selector: ".save-control" },
  mouseMode: { label: "鼠标模式", selector: "#mouseModePanel" },
  keyboard: { label: "键位映射", selector: "#keyboardPanel" },
};
const uiVisibility = new Map(Object.keys(uiPanelDefs).map((id) => [id, !["saveLoad", "mouseMode", "keyboard"].includes(id)]));
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
    habitabilityScore: Number(star.habitabilityScore ?? star.habitability_score ?? 0),
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
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error || `${path} -> ${response.status}`);
    error.payload = data;
    throw error;
  }
  return data;
}

async function apiJsonBody(path, payload, method = "POST") {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error || `${path} -> ${response.status}`;
    const error = new Error(message);
    error.payload = data;
    throw error;
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function editorField(field) {
  const tag = field.multiline ? "textarea" : "input";
  const value = escapeHtml(field.value ?? "");
  const numeric = field.number ? " data-number=\"true\"" : "";
  const optional = field.optional ? " data-optional=\"true\"" : "";
  const attrs = `data-field="${escapeHtml(field.key)}"${numeric}${optional}`;
  const control = tag === "textarea"
    ? `<textarea ${attrs} spellcheck="false">${value}</textarea>`
    : `<input ${attrs} type="${field.number ? "number" : "text"}" value="${value}" spellcheck="false" />`;
  return `<label><span>${escapeHtml(field.label)}</span>${control}</label>`;
}

function collectEditorPayload(form) {
  const payload = {};
  form.querySelectorAll("[data-field]").forEach((input) => {
    const key = input.dataset.field;
    let value = input.value;
    if (input.dataset.number === "true") {
      if (String(value).trim() === "" && input.dataset.optional === "true") {
        value = null;
      } else {
        value = Number(value || 0);
      }
    }
    payload[key] = value;
  });
  return payload;
}

function renderInlineEditor(container, fields, onSave, onCancel) {
  if (!container) return;
  container.innerHTML = `
    <form class="info-editor">
      ${fields.map(editorField).join("")}
      <div class="info-editor-status" data-editor-status></div>
      <div class="info-editor-actions">
        <button type="button" data-editor-cancel>取消</button>
        <button type="submit">保存</button>
      </div>
    </form>
  `;
  const form = container.querySelector("form");
  const status = container.querySelector("[data-editor-status]");
  container.querySelector("[data-editor-cancel]")?.addEventListener("click", () => onCancel?.());
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (status) status.textContent = "保存中...";
    try {
      const result = await onSave(collectEditorPayload(form));
      if (status) status.textContent = "已保存";
      return result;
    } catch (error) {
      if (status) {
        status.textContent = `保存失败: ${error.message}`;
        status.style.color = "var(--danger)";
      }
      throw error;
    }
  });
}

async function editStarInfo(id, fields = {}) {
  const result = await apiJsonBody("/api/stars", { id, ...fields }, "PATCH");
  const star = starById.get(id) || findLocalStar(id);
  if (star) {
    Object.assign(star, fields);
    refreshStarDatalist();
    updateVisibility();
  }
  writeAgentOutput({ action: "editStarInfo", id, result });
  return result;
}

async function editBodyInfo(id, fields = {}) {
  const result = await apiJsonBody("/api/system-bodies", { id, ...fields }, "PATCH");
  if (selectedBody?.id === id) Object.assign(selectedBody, fields);
  for (const mesh of bodyMeshes) {
    if (mesh.userData.body?.id === id) Object.assign(mesh.userData.body, fields);
  }
  writeAgentOutput({ action: "editBodyInfo", id, result });
  return result;
}

async function editShipInfo(shipId, fields = {}) {
  const ship = findShip(shipId);
  const payload = { ...fields };
  if (Object.prototype.hasOwnProperty.call(payload, "faction")) {
    payload.faction = String(payload.faction || "").trim() || "无/无所属";
  }
  const result = await apiJsonBody("/api/ship-info", { shipId, ...payload }, "PATCH");
  if (ship) {
    if (Object.prototype.hasOwnProperty.call(payload, "name") && payload.name) ship.name = payload.name;
    if (Object.prototype.hasOwnProperty.call(payload, "faction")) ship.faction = payload.faction;
    if (Object.prototype.hasOwnProperty.call(payload, "notes")) ship.notes = payload.notes;
    updateFleetPanel();
    updateShipMeshes();
    if (selectedShipId === ship.id && !shipInfoEditing) updateShipInfoPanel(ship);
  }
  writeAgentOutput({ action: "editShipInfo", shipId, result });
  return result;
}

function vectorToArray(vector) {
  return [Number(vector.x), Number(vector.y), Number(vector.z)];
}

function pointDistance(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function shipCurrentPoint(ship) {
  const pos = shipWorldPosition(ship, getStarWorldPos);
  return pos ? [pos.x, pos.y, pos.z] : null;
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
  sprite.userData.baseScaleX = width / 24;
  sprite.userData.baseScaleY = height / 24;
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

    const systemScore = getSystemHabitabilityScore(star);
    if (systemScore > 0) {
      const scoreLabel = makeScoreLabel(systemScore, "", true, star.id === "sol" ? 18 : 15);
      scoreLabel.position.copy(mesh.position).add(new THREE.Vector3(0, -radius * 1.45 - 0.42, 0));
      scoreLabel.userData.starScoreLabel = true;
      star.scoreLabel = scoreLabel;
      labelLayer.add(scoreLabel);
    }
  });
}

function addTerritories() {
  const lines = [
    ["wolf359", "lalande", "无限未来", false],
    ["lalande", "gj273", "无限未来", false],
    ["gj273", "gj251", "无限未来", true],
    ["gj1061", "kapteyn", "人类群星", false],
    ["kapteyn", "hd20794", "人类群星", false],
    ["kapteyn", "40eridani", "人类群星", false],
    ["40eridani", "ltt1445", "人类群星", true],
    ["gj1002", "li-hartman", "星蓝元素", true],
    ["li-hartman", "trappist-1", "星蓝元素", true],
    ["gj1002", "lhs1140", "星蓝元素", true],
    ["groombridge34", "hd219134", "S&F", false],
    ["hd219134", "107piscium", "S&F", true],
    ["hd219134", "55cnc", "S&F", true],
    ["tau-ceti", "teegarden", "美丽花园巨企", false],
    ["teegarden", "gj357", "美丽花园巨企", true],
    ["alpha", "epsilon-indi", "半人马联合重工", true],
    ["barnard", "alpha", "半人马联合重工", true],
    ["gj682", "gj667c", "南爪边境开发集团", false],
    ["beta-hydri", "fomalhaut", "外环水蛇-北落师门采掘同盟", true],
    ["fomalhaut", "vega", "外环水蛇-北落师门采掘同盟", true]
  ];

  lines.forEach(([a, b, faction, dashed]) => {
    const starA = starById.get(a);
    const starB = starById.get(b);
    if (!starA || !starB) return;
    const color = factionColors[faction] || "#888888";
    const material = dashed
      ? new THREE.LineDashedMaterial({ color, dashSize: 0.7, gapSize: 0.45, transparent: true, opacity: 0.54 })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.66 });
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
  refreshNavObjectDatalist();
}

function refreshStarDatalist() {
  if (!starNames) return;
  starNames.innerHTML = "";
  stars.forEach((star) => {
    const option = document.createElement("option");
    option.value = star.id;
    option.label = star.name;
    starNames.appendChild(option);
  });
  refreshNavObjectDatalist();
}

function refreshNavObjectDatalist() {
  if (!navObjectNames) return;
  const options = [];
  const seen = new Set();
  const push = (value, label) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    options.push(`<option value="${escapeHtml(value)}" label="${escapeHtml(label || "")}"></option>`);
  };
  for (const star of stars) {
    push(star.id, `恒星系 · ${star.name}`);
    if (star.name && star.name !== star.id) push(star.name, `恒星系 · ${star.id}`);
    if (star.short && star.short !== star.id) push(star.short, `恒星系 · ${star.name}`);
  }
  for (const [starId, bodies] of Object.entries(fallbackBodies)) {
    const star = starById.get(starId);
    for (const body of bodies || []) {
      push(body.id, `天体 · ${body.name} · ${star?.short || starId}`);
      if (body.name && body.name !== body.id) push(body.name, `天体 · ${body.id} · ${star?.short || starId}`);
    }
  }
  for (const ship of ships) {
    push(ship.id, `舰船 · ${ship.name}`);
    if (ship.name && ship.name !== ship.id) push(ship.name, `舰船 · ${ship.id}`);
  }
  navObjectNames.innerHTML = options.join("");
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
  const showScoreLabels = scoreLabelsVisible();
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
    if (star.label) star.label.visible = visible && showLabels.checked;
    if (star.scoreLabel) star.scoreLabel.visible = visible && showScoreLabels;
    const highlight = activeFaction !== "all" && star.faction === activeFaction;
    const mutedByHighlight = activeFaction !== "all" && !highlight && star.id !== "sol";
    
    if (inSystemView && systemViewStar) {
      if (star.id === systemViewStar.id) {
        star.mesh.visible = false;
        star.halo.visible = false;
        if (star.label) star.label.visible = false;
        if (star.scoreLabel) star.scoreLabel.visible = false;
        if (star.controlSphere) star.controlSphere.visible = false;
      } else {
        const skyR = Number(skyRadius.value);
        const dist = localDistance(systemViewStar, star);
        const inSky = skyR > 0 && dist <= skyR;
        star.mesh.visible = visible && inSky;
        star.mesh.scale.setScalar(0.06);
        star.mesh.material.opacity = 0.5;
        star.mesh.material.transparent = true;
        star.halo.visible = visible && inSky;
        star.halo.material.opacity = 0.05; // faint background halos
        if (star.controlSphere) star.controlSphere.visible = false;
        if (star.label) {
          star.label.visible = visible && inSky && showLabels.checked;
          star.label.material.opacity = 0.4;
        }
        if (star.scoreLabel) {
          star.scoreLabel.visible = visible && inSky && showScoreLabels;
          star.scoreLabel.material.opacity = 0.45;
        }
      }
    } else {
      star.mesh.material.opacity = mutedByHighlight ? 0.18 : (star.objectType === "diffuse_cloud" ? 0.22 : 1);
      star.mesh.material.transparent = mutedByHighlight || star.objectType === "diffuse_cloud";
      star.halo.visible = visible;
      star.halo.material.opacity = highlight ? 0.55 : star.status === "outer" ? 0.16 : 0.28;
      if (star.controlSphere) star.controlSphere.material.opacity = highlight ? 0.075 : 0.04;
      if (star.label) star.label.material.opacity = 1;
      if (star.scoreLabel) star.scoreLabel.material.opacity = 1;
    }
  });

  labelLayer.visible = showLabels.checked || showScoreLabels;
  systemLayer.traverse((child) => {
    if (child.userData.habitabilityLabel) child.visible = showScoreLabels;
  });
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
    if (star.label) {
      star.label.position.copy(star.mesh.position).add(new THREE.Vector3(0, radius * 1.9 + 0.55, 0));
      const bx = star.label.userData.baseScaleX || star.label.scale.x;
      const by = star.label.userData.baseScaleY || star.label.scale.y;
      star.label.scale.set(bx * labelScaleFactor, by * labelScaleFactor, 1);
    }
    if (star.scoreLabel) star.scoreLabel.position.copy(star.mesh.position).add(new THREE.Vector3(0, -radius * 1.45 - 0.42, 0));
  });
}

function showDetails(star, bodies = null) {
  selectedStar = star;
  selectedBody = null;
  currentDetailTarget = { type: "star", id: star.id, item: star };
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
  
  if (bodies) {
    const habArray = [];
    bodies.forEach(body => {
      const habScore = getHabitabilityScore(body);
      if (habScore > 0) {
        const status = terraformStatusLabel(body.terraformStatus ?? body.terraform_status ?? "");
        habArray.push(`${body.name} (${habScore.toFixed(2)}${status ? ` · ${status}` : ""})`);
      }
    });
    const systemScore = getSystemHabitabilityScore(star, bodies);
    if (systemScore > 0) {
      rows.push(detailRow("天文", "宜居/地球化总分", systemScore.toFixed(2)));
    }
    if (habArray.length > 0) {
      rows.push(detailRow("天文", "宜居/地球化天体", habArray.join("<br>")));
    }
  } else {
    const systemScore = getSystemHabitabilityScore(star);
    if (systemScore > 0) rows.push(detailRow("天文", "宜居/地球化总分", systemScore.toFixed(2)));
  }

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
  currentDetailTarget = { type: "body", id: body.id, starId: star.id, item: body, star };
  const habScore = getHabitabilityScore(body);
  const rows = [
    detailRow("概览", "所属恒星系", formatMarkdown(star.name)),
    detailRow("概览", "天体类型", body.bodyType),
    detailRow("轨道", "轨道", `${Number(body.orbitAu).toFixed(3)} AU`),
    detailRow("物理", "尺度", body.radiusLabel || "-"),
    detailRow("物理", "质量", body.massLabel || "-"),
    detailRow("物理", "宜居", body.habitable ? "是/准宜居" : "否")
  ];
  if (habScore > 0) {
    rows.push(detailRow("天文", "宜居/地球化评分", habScore.toFixed(2)));
    const status = terraformStatusLabel(body.terraformStatus ?? body.terraform_status ?? "");
    if (status) rows.push(detailRow("天文", "地球化状态", status));
  }
  rows.push(detailRow("说明", "说明", formatMarkdown(body.summary || "-")));
  if (body.bodyType === "star" && star.hz_inner && star.hz_outer) {
    rows.push(detailRow("轨道", "恒星宜居带", `${Number(star.hz_inner).toFixed(3)}-${Number(star.hz_outer).toFixed(3)} AU`));
  }
  rows.push(...propagationRows(body));
  renderDetailPanel(formatMarkdown(`${star.short} / ${body.name}`), rows);
}

function openDetailEditor() {
  if (!currentDetailTarget) return;
  if (detailTabs) detailTabs.innerHTML = "";
  const target = currentDetailTarget;
  if (target.type === "star") {
    const star = target.item || selectedStar;
    if (!star) return;
    detailTitle.textContent = `编辑: ${star.short || star.name || star.id}`;
    renderInlineEditor(detailList, [
      { key: "name", label: "名称", value: star.name },
      { key: "short", label: "短名", value: star.short },
      { key: "className", label: "主星类型", value: star.className },
      { key: "planets", label: "行星统计 Markdown", value: star.planets, multiline: true },
      { key: "reality", label: "现实口径 Markdown", value: star.reality, multiline: true },
      { key: "setting", label: "2350设定 Markdown", value: star.setting, multiline: true },
      { key: "notes", label: "势力备注 Markdown", value: star.notes, multiline: true },
      { key: "age", label: "恒星年龄", value: star.age },
      { key: "lifespan", label: "恒星寿命", value: star.lifespan, multiline: true },
      { key: "disasters", label: "灾害特征", value: star.disasters, multiline: true },
      { key: "hz_inner", label: "宜居带内缘 AU", value: star.hz_inner, number: true, optional: true },
      { key: "hz_outer", label: "宜居带外缘 AU", value: star.hz_outer, number: true, optional: true },
      { key: "rule_info_time", label: "可容忍统治信息传播时间 年", value: star.rule_info_time, number: true },
      { key: "info_speed", label: "信息传播速度 ly/年", value: star.info_speed, number: true },
      { key: "ftl_speed", label: "FTL速度倍率", value: star.ftl_speed, number: true },
    ], async (payload) => {
      await editStarInfo(star.id, payload);
      Object.assign(star, payload);
      showDetails(star);
    }, () => showDetails(star));
    return;
  }

  if (target.type === "body") {
    const body = target.item || selectedBody;
    const star = target.star || selectedStar;
    if (!body || !star) return;
    detailTitle.textContent = `编辑: ${body.name || body.id}`;
    renderInlineEditor(detailList, [
      { key: "name", label: "名称", value: body.name },
      { key: "bodyType", label: "天体类型", value: body.bodyType },
      { key: "orbitAu", label: "半长轴/平均轨道 AU", value: body.orbitAu, number: true },
      { key: "orbitPerihelionAu", label: "近日点 AU", value: body.orbitPerihelionAu, number: true, optional: true },
      { key: "orbitAphelionAu", label: "远日点 AU", value: body.orbitAphelionAu, number: true, optional: true },
      { key: "eccentricity", label: "偏心率", value: body.eccentricity, number: true, optional: true },
      { key: "inclinationDeg", label: "轨道倾角 °", value: body.inclinationDeg, number: true, optional: true },
      { key: "longitudeAscendingNodeDeg", label: "升交点黄经 °", value: body.longitudeAscendingNodeDeg, number: true, optional: true },
      { key: "argumentPerihelionDeg", label: "近地点幅角 °", value: body.argumentPerihelionDeg, number: true, optional: true },
      { key: "orbitalPeriodDays", label: "公转周期 日", value: body.orbitalPeriodDays, number: true, optional: true },
      { key: "radiusLabel", label: "尺度 Markdown", value: body.radiusLabel },
      { key: "massLabel", label: "质量 Markdown", value: body.massLabel },
      { key: "terraformStatus", label: "地球化状态", value: body.terraformStatus },
      { key: "habitabilityScore", label: "宜居评分", value: body.habitabilityScore, number: true },
      { key: "summary", label: "说明 Markdown", value: body.summary, multiline: true },
      { key: "rule_info_time", label: "可容忍统治信息传播时间 年", value: body.rule_info_time, number: true },
      { key: "info_speed", label: "信息传播速度 ly/年", value: body.info_speed, number: true },
      { key: "ftl_speed", label: "FTL速度倍率", value: body.ftl_speed, number: true },
    ], async (payload) => {
      await editBodyInfo(body.id, payload);
      Object.assign(body, payload);
      showBodyDetails(body, star);
    }, () => showBodyDetails(body, star));
  }
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
    if (s.scoreLabel) s.scoreLabel.visible = scoreLabelsVisible();
    if (s.controlSphere) s.controlSphere.visible = true;
    systemViewStar = null;
  }
  stars.forEach((s) => {
    const radius = getStarRadius(s);
    s.mesh.scale.setScalar(radius * Number(starScale.value));
    s.mesh.material.opacity = s.objectType === "diffuse_cloud" ? 0.22 : 1;
    s.mesh.material.transparent = s.objectType === "diffuse_cloud";
    // Don't force-show halo/mesh here — updateVisibility() will set correct visibility
    if (s.label) s.label.material.opacity = 1;
    if (s.scoreLabel) {
      s.scoreLabel.material.opacity = 1;
      s.scoreLabel.visible = scoreLabelsVisible();
    }
  });
  bodyMeshes.length = 0;
  orbitingBodies.length = 0;
  orbitSimDays = 0;
  systemLayer.children.forEach((child) => disposeObject(child));
  systemLayer.clear();
  activeSystemScaleRoot = null;
  inSystemView = false;
  controls.minDistance = 0.5;
  document.querySelectorAll(".system-view-only").forEach((el) => { el.style.display = "none"; });
  starLayer.visible = true;
  labelLayer.visible = showLabels.checked || scoreLabelsVisible();
  territoryLayer.visible = showTerritories.checked;
}

function exitSystemView() {
  if (!inSystemView) return;
  stars.forEach((s) => {
    if (s.savedLabelSprite) {
      labelLayer.remove(s.label);
      s.label = s.savedLabelSprite;
      labelLayer.add(s.label);
      s.savedLabelSprite = null;
    }
  });
  clearSystemView();
  if (savedCameraPos && savedCameraTarget) {
    camera.position.copy(savedCameraPos);
    controls.target.copy(savedCameraTarget);
  } else {
    camera.position.copy(CAMERA_HOME);
    controls.target.set(0, 0, 0);
  }
  // Re-apply all filters so mesh/halo visibility matches current filter state
  updateVisibility();
  writeAgentOutput({ action: "exitSystem" });
}

function makeOrbit(radius, color = 0x8ca6c8) {
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.58 });
  return makeCircle(radius, 160, material);
}

function cometOrbitParams(body, fallbackRadius) {
  const peri = Number(body.orbitPerihelionAu ?? body.perihelionAu ?? 0);
  const aph = Number(body.orbitAphelionAu ?? body.aphelionAu ?? 0);
  if (body.bodyType !== "comet" || !(peri > 0) || !(aph > peri)) return null;
  const periScaled = scaledOrbitAu(peri);
  const aphScaled = scaledOrbitAu(aph);
  const semiMajor = (aphScaled + periScaled) / 2;
  const centerOffset = (aphScaled - periScaled) / 2;
  const eccentricity = Math.min(Number(body.eccentricity ?? ((aph - peri) / (aph + peri))), 0.995);
  const semiMinor = Math.max(semiMajor * Math.sqrt(Math.max(1 - eccentricity * eccentricity, 0.02)), fallbackRadius * 0.18);
  return { semiMajor, semiMinor, centerOffset };
}

function makeBodyOrbit(body, fallbackRadius, color = 0x8ca6c8) {
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.58 });
  const comet = cometOrbitParams(body, fallbackRadius);
  if (!comet) return makeOrbit(fallbackRadius, color);
  const points = [];
  for (let i = 0; i <= 192; i++) {
    const angle = (i / 192) * Math.PI * 2;
    points.push(new THREE.Vector3(
      comet.centerOffset + Math.cos(angle) * comet.semiMajor,
      0,
      Math.sin(angle) * comet.semiMinor
    ));
  }
  const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), material);
  line.userData.cometOrbit = comet;
  return line;
}

function bodyOrbitPosition(body, fallbackRadius, angle) {
  const comet = cometOrbitParams(body, fallbackRadius);
  if (!comet) return new THREE.Vector3(Math.cos(angle) * fallbackRadius, 0, Math.sin(angle) * fallbackRadius);
  return new THREE.Vector3(
    comet.centerOffset + Math.cos(angle) * comet.semiMajor,
    0,
    Math.sin(angle) * comet.semiMinor
  );
}

function starColorFromSpec(specOrLabel) {
  const s = String(specOrLabel || "").toUpperCase();
  if (s.includes("O")) return 0x9db8ff;
  if (s.includes("B")) return 0xbbccff;
  if (s.includes("A")) return 0xe8e8ff;
  if (s.includes("F")) return 0xfff4e8;
  if (s.includes("G")) return 0xffed82;
  if (s.includes("K")) return 0xffb347;
  if (s.includes("M")) return 0xff6a4d;
  if (s.includes("L") || s.includes("T") || s.includes("Y")) return 0x8b3a3a;
  if (s.includes("D")) return 0xd0d8ff;
  return 0xfff0a8;
}

function parseRadius(label) {
  const clean = String(label || "").replace(/[_*~]/g, "");
  const m = clean.match(/([\d.]+)\s*R([⊕♃☉])/);
  if (!m) return null;
  const val = parseFloat(m[1]);
  const unit = m[2];
  if (unit === "☉") return val * 109.2;
  if (unit === "♃") return val * 11.2;
  return val;
}

function parseMass(label) {
  const clean = String(label || "").replace(/[_*~]/g, "");
  const m = clean.match(/([\d.]+)\s*M([⊕♃☉])/);
  if (!m) return null;
  const val = parseFloat(m[1]);
  const unit = m[2];
  if (unit === "☉") return val * 332946;
  if (unit === "♃") return val * 317.8;
  return val;
}

function classifyPlanet(body) {
  const re = parseRadius(body.radiusLabel);
  const me = parseMass(body.massLabel);
  const name = String(body.name || "").replace(/[_*~]/g, "").toLowerCase();
  const summary = String(body.summary || "").replace(/[_*~]/g, "").toLowerCase();
  const id = String(body.id || "").toLowerCase();

  if (re !== null && re > 6) return "gas_giant";
  if (me !== null && me > 80) return "gas_giant";
  if (summary.includes("气态巨行星") || summary.includes("类木") || summary.includes("超级木星")) return "gas_giant";

  if (re !== null && re > 3) return "ice_giant";
  if (me !== null && me > 12 && (re === null || re < 6)) return "ice_giant";
  if (summary.includes("冰巨") || summary.includes("海王星") || summary.includes("甲烷")) return "ice_giant";

  if ((re !== null && re > 1.6) || (me !== null && me > 5)) return "mini_neptune";
  if (summary.includes("迷你海王星") || summary.includes("亚巨")) return "mini_neptune";

  if (summary.includes("熔岩") || summary.includes("2700") || summary.includes("460")) return "lava";
  if (name.includes("venus") || name.includes("金星") || summary.includes("co₂ 大气") || summary.includes("金星")) return "venus";
  if (name.includes("mars") || name.includes("火星") || summary.includes("稀薄") || summary.includes("干燥")) return "mars";
  if (name.includes("mercury") || name.includes("水星") || summary.includes("铁核") || summary.includes("无大气")) return "mercury";

  if (summary.includes("地球化") || summary.includes("改造")) return "terraforming";
  if (body.habitable || summary.includes("宜居") || summary.includes("液态水") || summary.includes("生态")) return "earth_like";
  if (summary.includes("冰") || summary.includes("冷") || summary.includes("冻")) return "ice";

  return "rocky";
}

function classifyMoon(body) {
  const summary = String(body.summary || "").replace(/[_*~]/g, "").toLowerCase();
  const name = String(body.name || "").replace(/[_*~]/g, "").toLowerCase();
  if (summary.includes("冰壳") || summary.includes("冰下") || name.includes("europa") || name.includes("欧罗巴") || name.includes("盖尼米得") || name.includes("ganymede")) return "icy_moon";
  if (summary.includes("大气层") || summary.includes("甲烷湖") || name.includes("titan") || name.includes("泰坦")) return "atmo_moon";
  if (summary.includes("火山") || summary.includes("活跃")) return "volcanic_moon";
  return "rocky_moon";
}

function bodyVisualClass(body, fallbackClass) {
  const score = getHabitabilityScore(body);
  if (score >= EARTHLIKE_VISUAL_SCORE) return "earth_like";
  if (score >= TERRAFORMING_VISUAL_SCORE) return "terraforming";
  return fallbackClass;
}

function bodyColorRich(body) {
  if (body.bodyType === "star") {
    const clean = String(body.summary || "").replace(/[_*~]/g, "");
    const specMatch = clean.match(/([OBAFGKMLTY]\d)/i);
    return starColorFromSpec(specMatch ? specMatch[1] : clean || body.radiusLabel);
  }
  if (body.bodyType === "brown_dwarf") return 0x8b3a3a;
  if (body.bodyType === "belt") return 0xa8a090;
  if (body.bodyType === "comet") return 0xd0e8ff;
  if (body.bodyType === "station") return 0x72d6c9;
  if (body.bodyType === "cloud") return 0x74c0d8;
  if (body.bodyType === "moon") {
    const mc = bodyVisualClass(body, classifyMoon(body));
    if (mc === "earth_like") return 0x4898d0;
    if (mc === "terraforming") return 0x5f9f6f;
    return { icy_moon: 0xb8d4e8, atmo_moon: 0xd4a862, volcanic_moon: 0xe86040, rocky_moon: 0xc8c0b4 }[mc];
  }
  const pc = bodyVisualClass(body, classifyPlanet(body));
  return {
    gas_giant: 0xd4a050,
    ice_giant: 0x5888c8,
    mini_neptune: 0x6ea8b8,
    lava: 0xff4820,
    venus: 0xe8c060,
    mars: 0xc86030,
    mercury: 0x988888,
    earth_like: 0x4898d0,
    terraforming: 0x8b6b4a,
    ice: 0xa8c8e0,
    rocky: 0xb0a898
  }[pc] ?? 0xcbd5e1;
}

function bodyRadiusRich(body) {
  if (body.bodyType === "belt") return 0.08;
  if (body.bodyType === "comet") return 0.07;
  if (body.bodyType === "station") return 0.14;
  if (body.bodyType === "cloud") return 0.22;
  if (body.bodyType === "brown_dwarf") return 0.36;

  const re = parseRadius(body.radiusLabel);
  if (body.bodyType === "star") {
    const base = 0.28;
    if (re !== null) return base + Math.min(re / 109.2, 1) * 0.32;
    return 0.38;
  }
  if (body.bodyType === "moon") {
    const base = 0.09;
    if (re !== null) return base + Math.min(re / 2, 1) * 0.06;
    return getHabitabilityScore(body) >= TERRAFORMING_VISUAL_SCORE ? 0.135 : 0.11;
  }
  const pc = classifyPlanet(body);
  const mins = { gas_giant: 0.26, ice_giant: 0.22, mini_neptune: 0.19, lava: 0.13, venus: 0.16, mars: 0.14, mercury: 0.12, earth_like: 0.17, terraforming: 0.16, ice: 0.14, rocky: 0.14 };
  const base = mins[pc] ?? 0.15;
  if (re !== null) {
    if (pc === "gas_giant") return base + Math.min(re / 15, 1) * 0.16;
    if (pc === "ice_giant") return base + Math.min(re / 8, 1) * 0.10;
    return base + Math.min(re / 3, 1) * 0.06;
  }
  return base;
}

function bodyColor(bodyType) {
  return {
    star: 0xfff0a8,
    brown_dwarf: 0xb87945,
    planet: 0x7bd7ff,
    moon: 0xd5dce8,
    belt: 0xa8a090,
    comet: 0xd0e8ff,
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

/**
 * Look up the real orbital period (days) for a body.
 * Tries: solPeriods by body.id, orbitPeriodByName by body.name,
 * orbitPeriodBySma by star id + closest semi-major axis,
 * and finally Kepler estimate from orbitAu.
 */
function lookupOrbitalPeriod(star, body) {
  const explicitPeriod = Number(body.orbitalPeriodDays ?? body.orbitPeriodDays ?? 0);
  if (explicitPeriod > 0) return explicitPeriod;
  // 1) Sol system direct lookup by body ID
  if (star.id === "sol" || star.short === "Sol") {
    const solP = solPeriods[body.id];
    if (solP) return solP;
  }
  // 2) Exact planet name match (covers "Proxima Cen b", "GJ 887 c", etc.)
  if (orbitPeriodByName[body.name]) return orbitPeriodByName[body.name];
  // Strip Chinese / markdown from body name and try
  const cleanName = String(body.name || "").replace(/[_*~]/g, "").trim();
  if (orbitPeriodByName[cleanName]) return orbitPeriodByName[cleanName];

  // 3) SMA-based lookup: find system in orbitPeriodBySma, then match closest AU
  const au = Number(body.orbitAu);
  if (au > 0) {
    const tryKeys = [
      star.id, star.short, star.name,
      String(star.name || "").split("/").pop().trim(),
      String(star.name || "").split("/")[0].trim()
    ].map((k) => String(k || "").toLowerCase().trim()).filter(Boolean);
    for (const key of tryKeys) {
      const entries = orbitPeriodBySma[key];
      if (entries) {
        let best = null;
        let bestDist = Infinity;
        for (const e of entries) {
          const dist = Math.abs(e.sma - au) / Math.max(au, 0.001);
          if (dist < bestDist) { bestDist = dist; best = e; }
        }
        if (best && bestDist < 0.25) return best.period;
      }
    }
  }

  // 4) Kepler estimate: P(years) = a^1.5 for Sun-like star, P(days) = a^1.5 * 365.25
  if (au > 0) {
    return Math.pow(au, 1.5) * 365.25;
  }
  return 0;
}

function hasCuratedSystemDetails(star, bodies = []) {
  return bodies.some((body) => {
    const id = String(body.id || "");
    if (id === `${star.id}-primary` || id === `${star.id}-cloud` || id === `${star.id}-resource-belt`) return false;
    if (id.startsWith(`${star.id}-planet-`) && String(body.summary || "").includes("自动生成")) return false;
    return true;
  });
}

function normalizeScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, score);
}

function explicitHabitabilityScore(item) {
  if (!item) return null;
  const raw = item.habitabilityScore ?? item.habitability_score;
  return raw === undefined || raw === null || raw === "" ? null : normalizeScore(raw);
}

function cleanBodyText(body) {
  return [body?.name, body?.radiusLabel, body?.massLabel, body?.summary]
    .map((value) => String(value || "").replace(/[_*~]/g, ""))
    .join(" ")
    .toLocaleLowerCase();
}

function isNonTerrestrialPlanet(body) {
  if (body?.bodyType !== "planet") return false;
  const text = cleanBodyText(body);
  const identityText = [body?.name, body?.radiusLabel, body?.massLabel]
    .map((value) => String(value || "").replace(/[_*~]/g, ""))
    .join(" ")
    .toLocaleLowerCase();
  const blocked = ["迷你海王星", "海王星", "冰巨", "气巨", "气态", "巨行星", "木星", "土星", "天王星", "gas giant", "ice giant", "mini-neptune", "sub-neptune", "neptune", "jupiter", "saturn", "uranus"];
  const override = ["类地", "地球", "岩石", "岩质", "超级地球", "浮空文明"];
  if (blocked.some((term) => identityText.includes(term))) {
    return !override.some((term) => identityText.includes(term));
  }
  return blocked.some((term) => text.includes(term)) && !override.some((term) => text.includes(term));
}

function getHabitabilityScore(body) {
  const explicit = explicitHabitabilityScore(body);
  if (explicit !== null) return explicit;
  return 0;
}

function getSystemHabitabilityScore(star, bodies = null) {
  if (bodies) {
    return bodies.reduce((sum, body) => sum + getHabitabilityScore(body), 0);
  }
  return normalizeScore(star?.habitabilityScore ?? star?.habitability_score ?? 0);
}

function terraformStatusLabel(status) {
  const labels = {
    natural_habitable: "天然宜居",
    terraformed: "已地球化",
    terraforming: "地球化中",
    terraformable: "可地球化",
    habitable: "宜居/准宜居"
  };
  return labels[status] || "";
}

function scoreLabelsVisible() {
  return showHabitableScores ? showHabitableScores.checked : true;
}

function scoreText(score, status = "", total = false) {
  const label = terraformStatusLabel(status);
  const prefix = total ? "ΣH" : "H";
  return `${prefix} ${score.toFixed(2)}${label ? ` · ${label}` : ""}`;
}

function makeScoreLabel(score, status = "", total = false, fontSize = 16) {
  const label = makeTextSprite(scoreText(score, status, total), total ? "#9cf7b0" : "#b4ffce", fontSize);
  label.userData.habitabilityLabel = true;
  return label;
}

function seededRandom(seedText) {
  let state = 2166136261;
  const text = String(seedText || "starmap");
  for (let i = 0; i < text.length; i += 1) {
    state ^= text.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createBodyTexture(type, hexColor, seedKey = "") {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const rand = seededRandom(`${type}:${hexColor}:${seedKey}`);
  
  const baseColor = new THREE.Color(hexColor);
  
  // Fake 3D spherical shadow
  const gradient = ctx.createRadialGradient(100, 100, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255,255,255,0.1)");
  gradient.addColorStop(0.6, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.7)");

  ctx.fillStyle = "#" + baseColor.getHexString();
  ctx.fillRect(0, 0, 256, 256);

  // Add noise/stripes
  ctx.globalAlpha = 0.4;
  for (let i = 0; i < 8000; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const size = rand() * 2 + 1;
    if (type === "gas_giant" || type === "mini_neptune") {
      ctx.fillStyle = rand() > 0.5 ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)";
      ctx.fillRect(0, y, 256, size * 2);
    } else {
      ctx.fillStyle = rand() > 0.5 ? "#ffffff" : "#000000";
      ctx.fillRect(x, y, size, size);
    }
  }

  // Earth-like / Terraforming continents & clouds
  if (type === "earth_like" || type === "terraforming") {
    ctx.globalAlpha = type === "terraforming" ? 0.35 : 0.6;
    ctx.fillStyle = "#228b22"; // green patches
    for (let i = 0; i < 20; i++) {
      ctx.beginPath();
      ctx.arc(rand() * 256, rand() * 256, rand() * 30 + 10, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = type === "terraforming" ? 0.4 : 0.8;
    ctx.fillStyle = "#ffffff"; // clouds
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.ellipse(rand() * 256, rand() * 256, rand() * 20 + 5, rand() * 8 + 2, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === "lava") {
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "#ffaa00"; // cracks
    for (let i = 0; i < 15; i++) {
      ctx.fillRect(rand() * 256, rand() * 256, rand() * 40, 2);
    }
  }

  // Apply shadow
  ctx.globalAlpha = 1.0;
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

async function openSystemView(value = selectedStar?.id) {
  const star = typeof value === "object" ? value : findLocalStar(value);
  if (!star) throw new Error(`Star not found: ${value}`);
  let payload = null;
  try {
    payload = await apiJson(`/api/system?id=${encodeURIComponent(star.id)}`);
  } catch {
    payload = null;
  }
  // Use fallback if it has more bodies (e.g. newly added moons/comets)
  const curatedBodies = fallbackBodies[star.id];
  if (curatedBodies && (!payload || curatedBodies.length > (payload.bodies?.length || 0))) {
    payload = { star, bodies: curatedBodies };
  }
  if (!payload) {
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
  document.querySelectorAll(".system-view-only").forEach((el) => { el.style.display = ""; });

  star.mesh.visible = false;
  if (star.halo) star.halo.visible = false;
  if (star.label) star.label.visible = false;
  if (star.scoreLabel) star.scoreLabel.visible = false;
  if (star.controlSphere) star.controlSphere.visible = false;

  // Background stars labels
  stars.forEach((s) => {
    if (s.id !== star.id && s.label) {
      s.savedLabelSprite = s.label;
      labelLayer.remove(s.label);
      const newLabel = makeTextSprite(s.short + " (系外)", "#9eaebe", 22);
      newLabel.position.copy(s.mesh.position).add(new THREE.Vector3(0, getStarRadius(s) * 0.8 + 0.15, 0));
      newLabel.userData.starLabel = true;
      s.label = newLabel;
      labelLayer.add(newLabel);
    }
  });

  const starRadius = getStarRadius(star) * Number(starScale.value);
  const maxOrbit = Math.max(1, ...payload.bodies.map((b, i) => scaledOrbit(b, i)));
  const systemScale = Math.min(0.15, (starRadius * 1.8) / maxOrbit);
  scaleRoot.scale.setScalar(systemScale);
  const labelInvScale = 0.06 / systemScale;

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
    hzLabel.scale.multiplyScalar(labelInvScale);
    hzLabel.position.set(outer, 0.22, 0);
    scaleRoot.add(hzLabel);
  }

  const bodyMeshById = new Map();
  const nonMoons = payload.bodies.filter((b) => b.bodyType !== "moon");
  const moons = payload.bodies.filter((b) => b.bodyType === "moon");

  nonMoons.forEach((body, index) => {
    const orbitRadius = scaledOrbit(body, index);
    if (orbitRadius > 0 && body.bodyType !== "belt") {
      const orbit = makeBodyOrbit(body, orbitRadius, body.habitable ? 0x78dd8a : 0x8ca6c8);
      orbit.userData.body = body;
      orbit.userData.star = star;
      orbit.userData.isBodyOrbit = true;
      scaleRoot.add(orbit);
      bodyMeshes.push(orbit);
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
    const color = bodyColorRich(body);
    const radius = bodyRadiusRich(body);
    const baseClass = body.bodyType === "planet" ? classifyPlanet(body) : (body.bodyType === "moon" ? classifyMoon(body) : body.bodyType);
    const pc = bodyVisualClass(body, baseClass);
    const texture = createBodyTexture(pc, color, body.id || body.name);

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, map: texture, transparent: true, opacity: body.bodyType === "cloud" ? 0.45 : 1 })
    );
    mesh.position.copy(bodyOrbitPosition(body, orbitRadius, angle));
    mesh.userData.body = body;
    mesh.userData.star = star;
    scaleRoot.add(mesh);
    bodyMeshes.push(mesh);
    bodyMeshById.set(body.id, mesh);

    let innerGlow = null;
    let outerGlow = null;
    if (body.bodyType === "star") {
      const glowColor = new THREE.Color(color);
      innerGlow = new THREE.Mesh(
        new THREE.SphereGeometry(radius * 1.35, 32, 24),
        new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.25, depthWrite: false })
      );
      innerGlow.position.copy(mesh.position);
      scaleRoot.add(innerGlow);
      outerGlow = new THREE.Mesh(
        new THREE.RingGeometry(radius * 1.1, radius * 2.8, 48),
        new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false })
      );
      outerGlow.position.copy(mesh.position);
      outerGlow.userData.followCamera = true;
      scaleRoot.add(outerGlow);
    }

    let saturnRing = null;
    if (pc === "gas_giant" && radius > 0.28) {
      const ringInner = radius * 1.4;
      const ringOuter = radius * 2.2;
      saturnRing = new THREE.Mesh(
        new THREE.RingGeometry(ringInner, ringOuter, 64),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.3), transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
      );
      saturnRing.position.copy(mesh.position);
      saturnRing.rotation.x = -Math.PI * 0.38;
      saturnRing.rotation.z = Math.PI * 0.08;
      scaleRoot.add(saturnRing);
    }

    let controlSphere = null;
    const infoRadius = controlRadius(body);
    if (infoRadius > 0) {
      const csGeometry = new THREE.SphereGeometry(infoRadius, 32, 24);
      const csMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05, depthWrite: false });
      controlSphere = new THREE.Mesh(csGeometry, csMat);
      controlSphere.position.copy(mesh.position);
      scaleRoot.add(controlSphere);
    }

    const labelColor = body.bodyType === "star" ? "#" + new THREE.Color(color).getHexString() : "#edf3f8";
    const habScore = getHabitabilityScore(body);
    const label = makeTextSprite(body.name, labelColor, 19);
    label.scale.multiplyScalar(labelInvScale);
    label.position.copy(mesh.position).add(new THREE.Vector3(0, radius + 0.34, 0));
    scaleRoot.add(label);
    let scoreLabel = null;
    if (habScore > 0) {
      scoreLabel = makeScoreLabel(habScore, body.terraformStatus ?? body.terraform_status ?? "", false, 14);
      scoreLabel.scale.multiplyScalar(labelInvScale);
      scoreLabel.visible = scoreLabelsVisible();
      scoreLabel.position.copy(mesh.position).add(new THREE.Vector3(0, -radius - 0.22, 0));
      scaleRoot.add(scoreLabel);
    }

    // Comet tail
    let cometTail = null;
    if (body.bodyType === "comet" && orbitRadius > 0) {
      // Create a line that acts as a comet tail (pointing away from center/star)
      const tailLen = 0.8;
      const tailPoints = [];
      for (let t = 0; t <= 8; t++) tailPoints.push(new THREE.Vector3(0, 0, 0));
      const tailGeo = new THREE.BufferGeometry().setFromPoints(tailPoints);
      cometTail = new THREE.Line(tailGeo, new THREE.LineBasicMaterial({
        color: 0xd0e8ff, transparent: true, opacity: 0.45
      }));
      cometTail.userData.tailLength = tailLen;
      scaleRoot.add(cometTail);
    }

    // Register for orbit animation (skip star at center with orbitRadius===0)
    const periodDays = lookupOrbitalPeriod(star, body);
    if (orbitRadius > 0 && periodDays > 0) {
      orbitingBodies.push({
        mesh, label, scoreLabel, innerGlow, outerGlow, saturnRing, controlSphere,
        orbitCenter: new THREE.Vector3(0, 0, 0),   // planets orbit system center
        orbitRadius,
        orbitEllipse: cometOrbitParams(body, orbitRadius),
        periodDays,
        startAngle: angle,
        bodyRadius: radius,
        labelOffsetY: radius + 0.34,
        scoreLabelOffsetY: -(radius + 0.22),
        parentMesh: null,
        cometTail,
        isComet: body.bodyType === "comet",
      });
    }
  });

  moons.forEach((moon, moonIdx) => {
    const parentMesh = moon.parentId ? bodyMeshById.get(moon.parentId) : null;
    const moonOrbitRadius = 0.35 + moonIdx * 0.22 + Math.log10(Number(moon.orbitAu || 0.01) * 9 + 1) * 0.6;
    const moonAngle = moonIdx * 2.4 + 0.5;
    const radius = bodyRadiusRich(moon);
    const moonColor = bodyColorRich(moon);
    const moonPeriod = lookupOrbitalPeriod(star, moon);

    if (parentMesh) {
      const orbit = makeOrbit(moonOrbitRadius, 0xd5dce8);
      orbit.position.copy(parentMesh.position);
      orbit.userData.orbitOf = moon.id;    // tag so we can move it with parent
      orbit.userData.body = moon;
      orbit.userData.star = star;
      orbit.userData.isBodyOrbit = true;
      scaleRoot.add(orbit);
      bodyMeshes.push(orbit);
      const mc = bodyVisualClass(moon, classifyMoon(moon));
      const moonTex = createBodyTexture(mc, moonColor, moon.id || moon.name);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 24, 16),
        new THREE.MeshBasicMaterial({ color: 0xffffff, map: moonTex })
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
      const habScore = getHabitabilityScore(moon);
      const label = makeTextSprite(moon.name, "#d5dce8", 16);
      label.scale.multiplyScalar(labelInvScale);
      label.position.copy(mesh.position).add(new THREE.Vector3(0, radius + 0.25, 0));
      scaleRoot.add(label);
      let scoreLabel = null;
      if (habScore > 0) {
        scoreLabel = makeScoreLabel(habScore, moon.terraformStatus ?? moon.terraform_status ?? "", false, 13);
        scoreLabel.scale.multiplyScalar(labelInvScale);
        scoreLabel.visible = scoreLabelsVisible();
        scoreLabel.position.copy(mesh.position).add(new THREE.Vector3(0, -radius - 0.20, 0));
        scaleRoot.add(scoreLabel);
      }
      // Register moon for orbit animation around parent
      if (moonPeriod > 0) {
        orbitingBodies.push({
          mesh, label, scoreLabel,
          innerGlow: null, outerGlow: null, saturnRing: null, controlSphere: null,
          orbitRing: orbit,
          orbitCenter: parentMesh.position.clone(),
          orbitRadius: moonOrbitRadius,
          periodDays: moonPeriod,
          startAngle: moonAngle,
          bodyRadius: radius,
          labelOffsetY: radius + 0.25,
          scoreLabelOffsetY: -(radius + 0.20),
          parentMesh
        });
      }
    } else {
      const globalIdx = nonMoons.length + moonIdx;
      const orbitRadius = scaledOrbit(moon, globalIdx);
      if (orbitRadius > 0) {
        const orbit = makeOrbit(orbitRadius, 0xd5dce8);
        orbit.userData.body = moon;
        orbit.userData.star = star;
        orbit.userData.isBodyOrbit = true;
        scaleRoot.add(orbit);
        bodyMeshes.push(orbit);
      }
      const angle = globalIdx * 1.78 + (star.id.length % 7);
      const mc = bodyVisualClass(moon, classifyMoon(moon));
      const moonTex = createBodyTexture(mc, moonColor, moon.id || moon.name);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 24, 16),
        new THREE.MeshBasicMaterial({ color: 0xffffff, map: moonTex })
      );
      mesh.position.set(Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius);
      mesh.userData.body = moon;
      mesh.userData.star = star;
      scaleRoot.add(mesh);
      bodyMeshes.push(mesh);
      bodyMeshById.set(moon.id, mesh);
      const label = makeTextSprite(moon.name, "#d5dce8", 16);
      label.scale.multiplyScalar(labelInvScale);
      label.position.copy(mesh.position).add(new THREE.Vector3(0, radius + 0.25, 0));
      scaleRoot.add(label);
      const habScore = getHabitabilityScore(moon);
      let scoreLabel = null;
      if (habScore > 0) {
        scoreLabel = makeScoreLabel(habScore, moon.terraformStatus ?? moon.terraform_status ?? "", false, 13);
        scoreLabel.scale.multiplyScalar(labelInvScale);
        scoreLabel.visible = scoreLabelsVisible();
        scoreLabel.position.copy(mesh.position).add(new THREE.Vector3(0, -radius - 0.20, 0));
        scaleRoot.add(scoreLabel);
      }
      // Register orphan moon for orbit animation
      if (orbitRadius > 0 && moonPeriod > 0) {
        orbitingBodies.push({
          mesh, label, scoreLabel,
          innerGlow: null, outerGlow: null, saturnRing: null, controlSphere: null,
          orbitRing: null,
          orbitCenter: new THREE.Vector3(0, 0, 0),
          orbitRadius,
          periodDays: moonPeriod,
          startAngle: angle,
          bodyRadius: radius,
          labelOffsetY: radius + 0.25,
          scoreLabelOffsetY: -(radius + 0.20),
          parentMesh: null
        });
      }
    }
  });

  controls.target.copy(center);
  const systemExtent = maxOrbit * systemScale;
  const zoomDist = systemExtent * 2.8;
  camera.position.set(center.x, center.y + zoomDist * 0.92, center.z + zoomDist * 0.4);
  const skyR = Number(skyRadius.value);
  stars.forEach((s) => {
    if (s.id === star.id) return;
    const dist = localDistance(star, s);
    const inSky = skyR > 0 && dist <= skyR;
    const backgroundVisible = inSky && s.mesh.visible;
    s.mesh.visible = backgroundVisible;
    s.mesh.scale.setScalar(0.06);
    s.mesh.material.opacity = 0.5;
    s.mesh.material.transparent = true;
    if (s.halo) {
      s.halo.visible = backgroundVisible;
      s.halo.material.opacity = 0.05;
    }
    if (s.controlSphere) s.controlSphere.visible = false;
    if (s.label) {
      s.label.visible = backgroundVisible && showLabels.checked;
      s.label.material.opacity = 0.4;
    }
    if (s.scoreLabel) {
      s.scoreLabel.visible = backgroundVisible && scoreLabelsVisible();
      s.scoreLabel.material.opacity = 0.45;
    }
  });
  territoryLayer.visible = false;
  showDetails(star, payload.bodies);
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
  if (pressedKeys.has(keyBindings.forward)) move.add(forward);
  if (pressedKeys.has(keyBindings.backward)) move.sub(forward);
  if (pressedKeys.has(keyBindings.right)) move.add(right);
  if (pressedKeys.has(keyBindings.left)) move.sub(right);
  if (pressedKeys.has(keyBindings.up)) move.add(up);
  if (pressedKeys.has(keyBindings.down)) move.sub(up);
  if (move.lengthSq() === 0) return;
  move.normalize().multiplyScalar(speed);
  camera.position.add(move);
  controls.target.add(move);
}

function starDistanceFn(from, to) {
  const a = starById.get(from);
  const b = starById.get(to);
  if (!a || !b) return 0;
  return localDistance(a, b);
}

const _shipByIdCache = new Map();
let _shipCacheGeneration = 0;
let _lastShipCount = 0;
function findShip(shipId) {
  // Rebuild cache when ship list changes
  if (ships.length !== _lastShipCount) {
    _shipByIdCache.clear();
    ships.forEach((s) => _shipByIdCache.set(s.id, s));
    _lastShipCount = ships.length;
  }
  return _shipByIdCache.get(shipId) || ships.find((s) => s.id === shipId) || null;
}

function findShipByValue(value) {
  const key = normalizeSearch(value);
  if (!key) return null;
  return ships.find((ship) => normalizeSearch(ship.id) === key || normalizeSearch(ship.name) === key) || null;
}

function findBodyByValue(value) {
  const key = normalizeSearch(value);
  if (!key) return null;
  for (const [starId, bodies] of Object.entries(fallbackBodies)) {
    for (const body of bodies || []) {
      if ([body.id, body.name].some((item) => normalizeSearch(item) === key)) {
        return { star: starById.get(starId) || findLocalStar(starId), body };
      }
    }
  }
  return null;
}

function bodyWorldPoint(starId, bodyId) {
  const mesh = bodyMeshes.find((item) => item.userData?.body?.id === bodyId && item.userData?.star?.id === starId);
  if (mesh?.visible) {
    const point = new THREE.Vector3();
    mesh.getWorldPosition(point);
    return vectorToArray(point);
  }
  const star = starById.get(starId) || findLocalStar(starId);
  const starPoint = star ? vectorToArray(toWorld(star.xyz)) : null;
  if (!starPoint) return null;
  const body = (fallbackBodies[starId] || []).find((item) => item.id === bodyId);
  const radius = Number(body?.orbitAu ?? body?.semiMajorAxisAu ?? body?.semi_major_axis_au ?? 0);
  if (radius > 0 && inSystemView && systemViewStar?.id === starId) {
    const scaled = Math.min(Math.sqrt(radius) * 0.55 + 0.45, 9);
    return [starPoint[0] + scaled, starPoint[1], starPoint[2]];
  }
  return starPoint;
}

function resolveNavTarget(value) {
  if (Array.isArray(value)) {
    return { type: "point", id: "", label: "自由坐标", starId: null, bodyId: null, point: value.slice(0, 3).map(Number), faction: "" };
  }
  if (typeof value === "object" && value !== null) {
    const point = value.point || value.destinationPoint || value.xyz;
    if (point) return {
      type: "point",
      id: value.id || "",
      label: value.label || value.name || "自由坐标",
      starId: value.starId || value.destinationStarId || null,
      bodyId: value.bodyId || value.destinationBodyId || null,
      point: Array.isArray(point) ? point.slice(0, 3).map(Number) : [Number(point.x || 0), Number(point.y || 0), Number(point.z || 0)],
      faction: value.faction || "",
    };
  }
  const ship = findShipByValue(value);
  if (ship) {
    const point = shipCurrentPoint(ship);
    return {
      type: "ship",
      id: ship.id,
      label: ship.name,
      starId: ship.locationStarId || ship.destinationStarId || null,
      bodyId: ship.locationBodyId || ship.destinationBodyId || null,
      point,
      faction: ship.faction || "",
      ship,
    };
  }
  const bodyMatch = findBodyByValue(value);
  if (bodyMatch?.body && bodyMatch.star) {
    return {
      type: "body",
      id: bodyMatch.body.id,
      label: bodyMatch.body.name,
      starId: bodyMatch.star.id,
      bodyId: bodyMatch.body.id,
      point: bodyWorldPoint(bodyMatch.star.id, bodyMatch.body.id),
      faction: bodyMatch.star.faction || "",
      body: bodyMatch.body,
      star: bodyMatch.star,
    };
  }
  const star = findLocalStar(value);
  if (star) {
    return {
      type: "star",
      id: star.id,
      label: star.short || star.name || star.id,
      starId: star.id,
      bodyId: null,
      point: vectorToArray(toWorld(star.xyz)),
      faction: star.faction || "",
      star,
    };
  }
  return null;
}

function selectedShips() {
  return Array.from(selectedShipIds).map(findShip).filter(Boolean);
}

function closestStarToPoint(point) {
  if (!point) return null;
  let best = null;
  for (const star of stars) {
    const pos = toWorld(star.xyz);
    const dist = pointDistance(point, vectorToArray(pos));
    if (!best || dist < best.distanceLy) best = { star, distanceLy: dist };
  }
  return best;
}

function closestVisibleBodyToPoint(point) {
  if (!point || !bodyMeshes.length) return null;
  let best = null;
  for (const mesh of bodyMeshes) {
    if (!mesh.visible || !mesh.userData.body) continue;
    const pos = new THREE.Vector3();
    mesh.getWorldPosition(pos);
    const dist = pointDistance(point, vectorToArray(pos));
    if (!best || dist < best.distanceLy) best = { body: mesh.userData.body, star: mesh.userData.star, distanceLy: dist };
  }
  return best;
}

function describeShipLocation(ship) {
  const point = shipCurrentPoint(ship);
  if (!point) return "未知";
  if (inSystemView && systemViewStar && (ship.locationStarId === systemViewStar.id || ship.destinationStarId === systemViewStar.id)) {
    const closeBody = closestVisibleBodyToPoint(point);
    if (closeBody) return `${(closeBody.distanceLy * 8766).toFixed(1)} lh 到 ${closeBody.body.name}`;
  }
  if (ship.locationStarId && !ship.locationPoint && ship.state !== "traveling") {
    const star = starById.get(ship.locationStarId);
    return star ? (star.short || star.name || star.id) : ship.locationStarId;
  }
  const closeStar = closestStarToPoint(point);
  if (!closeStar) return "自由坐标";
  const name = closeStar.star.short || closeStar.star.name || closeStar.star.id;
  return `${closeStar.distanceLy.toFixed(2)} ly 到 ${name}`;
}

function normalizeFleets() {
  const known = new Set(ships.map((ship) => ship.id));
  fleets = fleets
    .map((fleet) => ({ ...fleet, shipIds: (fleet.shipIds || []).filter((id) => known.has(id)) }))
    .filter((fleet) => fleet.shipIds.length > 0);
}

function createFleet(shipIds, name = "") {
  const uniqueIds = Array.from(new Set(shipIds)).filter((id) => findShip(id));
  if (uniqueIds.length === 0) return null;
  const fleet = {
    id: `fleet-${nextFleetId++}`,
    name: name || `舰队-${nextFleetId - 1}`,
    shipIds: uniqueIds,
    createdDay: totalSimDays,
  };
  fleets.push(fleet);
  selectedFleetId = fleet.id;
  return fleet;
}

function serializeFleets() {
  normalizeFleets();
  return fleets.map((fleet) => ({
    id: fleet.id,
    name: fleet.name,
    shipIds: fleet.shipIds.slice(),
    createdDay: fleet.createdDay || 0,
  }));
}

function loadFleets(records = []) {
  fleets = records.map((record) => ({
    id: record.id || `fleet-${nextFleetId++}`,
    name: record.name || `舰队-${nextFleetId}`,
    shipIds: Array.isArray(record.shipIds) ? record.shipIds.slice() : [],
    createdDay: Number(record.createdDay || 0),
  }));
  nextFleetId = 1;
  for (const fleet of fleets) {
    const suffix = Number(String(fleet.id).match(/fleet-(\d+)$/)?.[1] || 0);
    nextFleetId = Math.max(nextFleetId, suffix + 1);
  }
  normalizeFleets();
}

function setSelectedShips(shipIds, opts = {}) {
  selectedShipIds.clear();
  shipIds.filter(Boolean).forEach((id) => {
    if (findShip(id)) selectedShipIds.add(id);
  });
  selectedShipId = opts.primaryId && selectedShipIds.has(opts.primaryId)
    ? opts.primaryId
    : (selectedShipIds.values().next().value || null);
  if (!opts.keepFleet) selectedFleetId = null;
  if (selectedShipId) showShipInfoPanel(findShip(selectedShipId));
  else hideShipInfoPanel();
  updateShipMeshes();
  updateShipRoutes();
  updateFleetPanel();
  updateShipCommandPanel();
}

function selectFleet(fleetId) {
  normalizeFleets();
  const fleet = fleets.find((item) => item.id === fleetId);
  if (!fleet) return;
  selectedFleetId = fleet.id;
  setSelectedShips(fleet.shipIds, { primaryId: fleet.shipIds[0], keepFleet: true });
  showFleetInfoPanel(fleet);
}

function selectedFleet() {
  return fleets.find((fleet) => fleet.id === selectedFleetId) || null;
}

function selectShipsByFaction(faction) {
  if (!faction || faction === "all") return;
  const ids = ships.filter((ship) => ship.faction === faction).map((ship) => ship.id);
  setSelectedShips(ids);
  if (ids.length) writeAgentOutput({ action: "selectFactionShips", faction, count: ids.length });
}

function updateShipCommandPanel() {
  const panel = document.querySelector("#shipCommandPanel");
  const count = document.querySelector("#shipCommandCount");
  if (!panel) return;
  const hasSelection = selectedShipIds.size > 0;
  panel.classList.toggle("disabled", !hasSelection);
  if (count) count.textContent = `${selectedShipIds.size}`;
  if (hasSelection && uiVisibility.get("shipCommand") !== false) {
    panel.style.display = "";
  } else {
    panel.style.display = "none";
  }
}

function commandShipToStar(ship, destStarId, opts = {}) {
  const dest = starById.get(destStarId) || findLocalStar(destStarId);
  if (!ship || !dest) throw new Error(`Destination star not found: ${destStarId}`);
  const destinationPoint = vectorToArray(toWorld(dest.xyz));
  const fromPoint = shipCurrentPoint(ship);
  const distanceLy = fromPoint ? pointDistance(fromPoint, destinationPoint) : starDistanceFn(ship.locationStarId, dest.id);
  const moved = commandTravel(ship.id, dest.id, starDistanceFn, totalSimDays, {
    ...opts,
    fromPoint,
    routeOriginPoint: opts.routeOriginPoint || fromPoint,
    destinationPoint,
    destinationLabel: dest.short || dest.name,
    distanceLy,
  });
  writeAgentOutput({ action: "moveShip", ship: shipInfo(moved) });
  updateShipMeshes();
  updateShipRoutes();
  updateFleetPanel();
  updateShipInfoPanel(moved);
  return moved;
}

function commandShipToPoint(ship, point, label = "自由坐标", opts = {}) {
  if (!ship) throw new Error("No selected ship");
  const fromPoint = shipCurrentPoint(ship);
  const destinationPoint = Array.isArray(point) ? point : [point.x, point.y, point.z];
  const distanceLy = Math.max(pointDistance(fromPoint, destinationPoint), 0.000001);
  const moved = commandTravelToPoint(ship.id, destinationPoint, totalSimDays, {
    ...opts,
    fromPoint,
    routeOriginPoint: opts.routeOriginPoint || fromPoint,
    distanceLy,
    destinationLabel: label,
  });
  writeAgentOutput({ action: "moveShipToPoint", label, ship: shipInfo(moved) });
  updateShipMeshes();
  updateShipRoutes();
  updateFleetPanel();
  updateShipInfoPanel(moved);
  return moved;
}

function commandShipOrbitPoint(ship, centerPoint, label = "轨道中心", opts = {}) {
  if (!ship) throw new Error("No selected ship");
  const fromPoint = shipCurrentPoint(ship);
  const center = Array.isArray(centerPoint) ? centerPoint : [centerPoint.x, centerPoint.y, centerPoint.z];
  const radiusLy = Math.max(Number(opts.radiusLy ?? getOrbitCommandRadiusLy()), 0.000001);
  const periodDays = Math.max(Number(opts.periodDays ?? getOrbitCommandPeriodDays()), 0.000001);
  const stagingPoint = [
    center[0] + radiusLy * Math.cos(Number(opts.startAngle || 0)),
    center[1],
    center[2] + radiusLy * Math.sin(Number(opts.startAngle || 0)),
  ];
  const moved = commandOrbitAroundPoint(ship.id, center, totalSimDays, {
    ...opts,
    fromPoint,
    routeOriginPoint: opts.routeOriginPoint || fromPoint,
    distanceLy: Math.max(pointDistance(fromPoint, stagingPoint), 0.000001),
    radiusLy,
    periodDays,
    targetLabel: label,
  });
  writeAgentOutput({ action: "orbitShip", label, radiusLy, periodDays, ship: shipInfo(moved) });
  updateShipMeshes();
  updateShipRoutes();
  updateFleetPanel();
  updateShipInfoPanel(moved);
  return moved;
}

function commandShipsToStar(shipList, destStarId, opts = {}) {
  const moved = [];
  for (const ship of shipList) {
    try {
      moved.push(commandShipToStar(ship, destStarId, opts));
    } catch (error) {
      writeAgentOutput(`${ship.name}: ${error.message}`);
    }
  }
  return moved;
}

function commandShipsToPoint(shipList, point, label = "自由坐标", opts = {}) {
  const moved = [];
  for (const ship of shipList) {
    try {
      moved.push(commandShipToPoint(ship, point, label, opts));
    } catch (error) {
      writeAgentOutput(`${ship.name}: ${error.message}`);
    }
  }
  return moved;
}

function commandShipsOrbitPoint(shipList, point, label = "轨道中心", opts = {}) {
  const moved = [];
  for (const ship of shipList) {
    try {
      moved.push(commandShipOrbitPoint(ship, point, label, opts));
    } catch (error) {
      writeAgentOutput(`${ship.name}: ${error.message}`);
    }
  }
  return moved;
}

function commandShipToNavTarget(ship, target, opts = {}) {
  if (!target?.point) throw new Error(`Target not found: ${target?.label || ""}`);
  if (target.type === "star") return commandShipToStar(ship, target.starId, opts);
  return commandShipToPoint(ship, target.point, target.label, {
    ...opts,
    destinationStarId: target.starId,
    destinationBodyId: target.bodyId,
  });
}

function routeShipsToTargets(shipList, destinations, opts = {}) {
  const targets = (Array.isArray(destinations) ? destinations : [destinations]).map(resolveNavTarget);
  if (!targets.length || targets.some((target) => !target?.point)) throw new Error("Route target not found");
  const moved = [];
  for (const ship of shipList) {
    const routeOriginPoint = shipCurrentPoint(ship);
    targets.forEach((target, idx) => {
      const segmentOpts = {
        ...opts,
        appendRoute: Boolean(opts.appendRoute || idx > 0),
        patrol: Boolean(opts.patrol && idx === targets.length - 1),
        routeOriginPoint,
      };
      moved.push(commandShipToNavTarget(ship, target, segmentOpts));
    });
  }
  return moved;
}

function getOrbitCommandRadiusLy() {
  const raw = Number(document.querySelector("#shipOrbitRadiusInput")?.value || 0.001);
  return Math.max(raw, 0.000001);
}

function getOrbitCommandPeriodDays() {
  const speedC = Number(document.querySelector("#shipOrbitSpeedInput")?.value || 0);
  if (speedC > 0) {
    const radiusLy = getOrbitCommandRadiusLy();
    return Math.max((Math.PI * 2 * radiusLy / speedC) * 365.25, 0.000001);
  }
  const years = Number(document.querySelector("#shipOrbitYears")?.value || 0);
  const months = Number(document.querySelector("#shipOrbitMonths")?.value || 0);
  const days = Number(document.querySelector("#shipOrbitDays")?.value || 0);
  const hours = Number(document.querySelector("#shipOrbitHours")?.value || 0);
  const minutes = Number(document.querySelector("#shipOrbitMinutes")?.value || 0);
  const seconds = Number(document.querySelector("#shipOrbitSeconds")?.value || 0);
  const total = timePartsToDays({ years, months, days, hours, minutes, seconds });
  return Math.max(total || 30, 0.000001);
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

  function getShipMeshTargets() {
    const targets = [];
    for (const [, entry] of shipMeshes) {
      if (entry.mesh.visible) targets.push(entry.mesh);
    }
    return targets;
  }

  function getShipRouteTargets() {
    const targets = [];
    shipRouteLayer.traverse((child) => {
      if (child.userData.shipRouteId) targets.push(child);
    });
    return targets;
  }

  function pickShipRoute() {
    const hits = raycaster.intersectObjects(getShipRouteTargets(), true);
    if (!hits.length) return null;
    const shipId = hits[0].object.userData.shipRouteId;
    return shipId ? findShip(shipId) : null;
  }

  function pick(event) {
    if (event.button === 2) return;
    setPointer(event);
    const measurement = pickMeasurement();
    if (measurement) return;
    const routeShip = pickShipRoute();
    if (routeShip) {
      selectShip(routeShip);
      return;
    }
    // Check ship meshes first
    const shipHits = raycaster.intersectObjects(getShipMeshTargets(), false);
    if (shipHits.length) {
      const ship = shipHits[0].object.userData.ship;
      if (ship) {
        if (event.shiftKey) {
          const ids = new Set(selectedShipIds);
          if (ids.has(ship.id)) ids.delete(ship.id);
          else ids.add(ship.id);
          setSelectedShips(Array.from(ids), { primaryId: ship.id });
        } else {
          selectShip(ship);
        }
        return;
      }
    }
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

  function isDoubleRightClick(event) {
    const now = performance.now();
    const dx = event.clientX - rightClickCommandState.x;
    const dy = event.clientY - rightClickCommandState.y;
    const closeEnough = Math.hypot(dx, dy) < 10;
    const fastEnough = now - rightClickCommandState.time < 520;
    rightClickCommandState = { time: now, x: event.clientX, y: event.clientY };
    return closeEnough && fastEnough;
  }

  function commandSelectedShipsFromPointer(event) {
    const targets = selectedShips();
    if (!targets.length) {
      writeAgentOutput("先选择一艘或多艘舰船/小行星，再用右键命令。");
      return;
    }
    const routeOpts = { appendRoute: event.ctrlKey, patrol: event.shiftKey };
    setPointer(event);
    const bodyHits = raycaster.intersectObjects(bodyMeshes.filter((mesh) => mesh.visible), false);
    if (bodyHits.length) {
      const body = bodyHits[0].object.userData.body;
      const star = bodyHits[0].object.userData.star;
      const point = new THREE.Vector3();
      bodyHits[0].object.getWorldPosition(point);
      const opts = { ...routeOpts, destinationStarId: star?.id || null, destinationBodyId: body?.id || null, targetStarId: star?.id || null, targetBodyId: body?.id || null };
      if (shipCommandMode === "orbit") commandShipsOrbitPoint(targets, vectorToArray(point), body.name, opts);
      else commandShipsToPoint(targets, vectorToArray(point), body.name, opts);
      return;
    }
    const starHits = raycaster.intersectObjects(starMeshes.filter((mesh) => mesh.visible), false);
    if (starHits.length) {
      const star = starHits[0].object.userData.star;
      if (shipCommandMode === "orbit") {
        const point = vectorToArray(starHits[0].object.position);
        commandShipsOrbitPoint(targets, point, star.short || star.name || star.id, { ...routeOpts, targetStarId: star.id, destinationStarId: star.id });
      } else {
        commandShipsToStar(targets, star.id, routeOpts);
      }
      return;
    }
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -controls.target.y);
    const point = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, point)) {
      const label = `坐标 ${point.x.toFixed(1)}, ${point.z.toFixed(1)}`;
      const opts = { ...routeOpts, destinationStarId: systemViewStar?.id || null, targetStarId: systemViewStar?.id || null };
      if (shipCommandMode === "orbit") commandShipsOrbitPoint(targets, vectorToArray(point), label, opts);
      else commandShipsToPoint(targets, vectorToArray(point), label, opts);
    }
  }

  let dragState = null;
  const selectionBox = document.createElement("div");
  selectionBox.className = "selection-box";
  document.querySelector("#app")?.appendChild(selectionBox);

  function updateSelectionBox(event) {
    if (!dragState) return;
    const left = Math.min(dragState.x, event.clientX);
    const top = Math.min(dragState.y, event.clientY);
    const width = Math.abs(event.clientX - dragState.x);
    const height = Math.abs(event.clientY - dragState.y);
    selectionBox.style.left = `${left}px`;
    selectionBox.style.top = `${top}px`;
    selectionBox.style.width = `${width}px`;
    selectionBox.style.height = `${height}px`;
    if (width > 6 || height > 6) selectionBox.style.display = "block";
  }

  function shipsInScreenBox(a, b) {
    const rect = canvas.getBoundingClientRect();
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    const ids = [];
    for (const [id, entry] of shipMeshes) {
      if (!entry.mesh.visible) continue;
      const projected = entry.mesh.position.clone().project(camera);
      const x = rect.left + (projected.x + 1) * rect.width / 2;
      const y = rect.top + (-projected.y + 1) * rect.height / 2;
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) ids.push(id);
    }
    return ids;
  }

  function clearOrbitPreview() {
    if (orbitPreviewRoute) {
      shipRouteLayer.remove(orbitPreviewRoute);
      disposeObject(orbitPreviewRoute);
      orbitPreviewRoute = null;
    }
  }

  function updateOrbitPreview() {
    clearOrbitPreview();
    if (!orbitAdjustState?.centerPoint || !(orbitAdjustState.radiusLy > 0)) return;
    const ring = createOrbitRouteRing({
      centerPoint: orbitAdjustState.centerPoint,
      radiusLy: orbitAdjustState.radiusLy,
      periodDays: orbitAdjustState.periodDays || getOrbitCommandPeriodDays(),
    }, 0xffffff, true);
    if (!ring) return;
    orbitPreviewRoute = new THREE.Group();
    orbitPreviewRoute.add(ring);
    shipRouteLayer.add(orbitPreviewRoute);
  }

  function orbitTargetFromPointer(event) {
    setPointer(event);
    const routeShip = pickShipRoute();
    if (routeShip) {
      setSelectedShips([routeShip.id], { primaryId: routeShip.id });
      const orbit = routeShip.pendingOrbit || routeShip.orbit;
      if (orbit?.centerPoint) {
        return {
          point: orbit.centerPoint,
          label: orbit.targetLabel || routeShip.name,
          starId: orbit.targetStarId || routeShip.locationStarId || routeShip.destinationStarId || null,
          bodyId: orbit.targetBodyId || null,
          radiusLy: orbit.radiusLy,
          periodDays: orbit.periodDays,
        };
      }
    }
    const bodyHits = raycaster.intersectObjects(bodyMeshes.filter((mesh) => mesh.visible), false);
    if (bodyHits.length) {
      const body = bodyHits[0].object.userData.body;
      const star = bodyHits[0].object.userData.star;
      const point = new THREE.Vector3();
      bodyHits[0].object.getWorldPosition(point);
      return { point: vectorToArray(point), label: body.name, starId: star?.id || null, bodyId: body?.id || null };
    }
    const starHits = raycaster.intersectObjects(starMeshes.filter((mesh) => mesh.visible), false);
    if (starHits.length) {
      const star = starHits[0].object.userData.star;
      return { point: vectorToArray(starHits[0].object.position), label: star.short || star.name || star.id, starId: star.id, bodyId: null };
    }
    return null;
  }

  function startOrbitRadiusAdjust(event) {
    const targets = selectedShips();
    if (shipCommandMode !== "orbit" || !orbitMouseAdjustEnabled || !targets.length) return false;
    const target = orbitTargetFromPointer(event);
    if (!target?.point) return false;
    orbitAdjustState = {
      stage: "radius",
      pointerId: event.pointerId,
      startY: event.clientY,
      centerPoint: target.point,
      label: target.label,
      starId: target.starId || null,
      bodyId: target.bodyId || null,
      baseRadiusLy: Number(target.radiusLy || getOrbitCommandRadiusLy()),
      radiusLy: Number(target.radiusLy || getOrbitCommandRadiusLy()),
      basePeriodDays: Number(target.periodDays || getOrbitCommandPeriodDays()),
      periodDays: Number(target.periodDays || getOrbitCommandPeriodDays()),
    };
    controls.enabled = false;
    canvas.setPointerCapture?.(event.pointerId);
    updateOrbitPreview();
    return true;
  }

  function startOrbitSpeedAdjust(event) {
    if (orbitAdjustState?.stage !== "awaitSpeed") return false;
    orbitAdjustState.stage = "speed";
    orbitAdjustState.pointerId = event.pointerId;
    orbitAdjustState.startY = event.clientY;
    orbitAdjustState.basePeriodDays = orbitAdjustState.periodDays || getOrbitCommandPeriodDays();
    controls.enabled = false;
    canvas.setPointerCapture?.(event.pointerId);
    return true;
  }

  function updateOrbitAdjustFromPointer(event) {
    if (!orbitAdjustState || !["radius", "speed"].includes(orbitAdjustState.stage)) return false;
    const dy = event.clientY - orbitAdjustState.startY;
    if (orbitAdjustState.stage === "radius") {
      orbitAdjustState.radiusLy = Math.max(0.000001, Math.min(2, orbitAdjustState.baseRadiusLy * Math.exp(-dy / 220)));
      const input = document.querySelector("#shipOrbitRadiusInput");
      if (input) input.value = orbitAdjustState.radiusLy.toFixed(6);
    } else {
      orbitAdjustState.periodDays = Math.max(0.0001, Math.min(365250, orbitAdjustState.basePeriodDays * Math.exp(dy / 210)));
      const speedInput = document.querySelector("#shipOrbitSpeedInput");
      if (speedInput) {
        const speedC = (Math.PI * 2 * orbitAdjustState.radiusLy) / (orbitAdjustState.periodDays / 365.25);
        speedInput.value = speedC.toFixed(6);
      }
    }
    updateOrbitPreview();
    return true;
  }

  function finishOrbitAdjust(event) {
    if (!orbitAdjustState || orbitAdjustState.pointerId !== event.pointerId) return false;
    canvas.releasePointerCapture?.(event.pointerId);
    controls.enabled = true;
    if (orbitAdjustState.stage === "radius") {
      orbitAdjustState.stage = "awaitSpeed";
      writeAgentOutput(`轨道半径已设为 ${orbitAdjustState.radiusLy.toFixed(6)} ly；再次左键拖动调整速度。`);
      return true;
    }
    if (orbitAdjustState.stage === "speed") {
      const targets = selectedShips();
      commandShipsOrbitPoint(targets, orbitAdjustState.centerPoint, orbitAdjustState.label, {
        radiusLy: orbitAdjustState.radiusLy,
        periodDays: orbitAdjustState.periodDays,
        targetStarId: orbitAdjustState.starId,
        targetBodyId: orbitAdjustState.bodyId,
        destinationStarId: orbitAdjustState.starId,
        destinationBodyId: orbitAdjustState.bodyId,
      });
      clearOrbitPreview();
      orbitAdjustState = null;
      return true;
    }
    return false;
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (startOrbitSpeedAdjust(event) || startOrbitRadiusAdjust(event)) return;
    dragState = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, moved: false, kind: leftClickMode === "box" ? "box" : "click" };
    selectionBox.style.display = "none";
    if (dragState.kind === "box") canvas.setPointerCapture?.(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (updateOrbitAdjustFromPointer(event)) return;
    if (!dragState) return;
    const distance = Math.hypot(event.clientX - dragState.x, event.clientY - dragState.y);
    if (dragState.kind === "box" && distance > 6) {
      dragState.moved = true;
      controls.enabled = false;
      updateSelectionBox(event);
    } else if (dragState.kind === "click" && distance > 6) {
      dragState.moved = true;
    }
  });

  canvas.addEventListener("pointerup", (event) => {
    if (finishOrbitAdjust(event)) return;
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    if (dragState.kind === "box") canvas.releasePointerCapture?.(event.pointerId);
    selectionBox.style.display = "none";
    controls.enabled = true;
    const wasDrag = dragState.moved;
    const wasBox = dragState.kind === "box";
    const start = { x: dragState.x, y: dragState.y };
    dragState = null;
    if (wasDrag && wasBox) {
      const ids = shipsInScreenBox(start, { x: event.clientX, y: event.clientY });
      setSelectedShips(ids);
      if (ids.length > 1) {
        const fleet = createFleet(ids);
        writeAgentOutput({ action: "createFleetFromBox", fleet, count: ids.length });
        updateFleetPanel();
        if (fleet) showFleetInfoPanel(fleet);
      }
      return;
    }
    if (!wasDrag) pick(event);
  });

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    if (shipCommandMode === "move") {
      if (isDoubleRightClick(event)) commandSelectedShipsFromPointer(event);
    } else if (orbitMouseAdjustEnabled) {
      writeAgentOutput("当前为鼠标调整入轨：左键点击目标并上下拖动设置半径，再拖动一次设置速度。");
    } else {
      commandSelectedShipsFromPointer(event);
    }
  });
  canvas.addEventListener("dblclick", async (event) => {
    setPointer(event);
    const routeShip = pickShipRoute();
    if (routeShip) {
      zoomToShip(routeShip);
      return;
    }
    // Ship double-click → zoom to ship
    const shipHits = raycaster.intersectObjects(getShipMeshTargets(), false);
    if (shipHits.length) {
      const ship = shipHits[0].object.userData.ship;
      if (ship) {
        zoomToShip(ship);
        return;
      }
    }
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
      ...raycaster.intersectObjects(getShipRouteTargets(), true),
      ...raycaster.intersectObjects(getShipMeshTargets(), false),
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
  if (filters.minHabitabilityScore !== undefined && getSystemHabitabilityScore(star) < Number(filters.minHabitabilityScore)) return false;
  if (filters.terraformStatus) {
    const wanted = String(filters.terraformStatus);
    const bodies = fallbackBodies[star.id] || [];
    if (!bodies.some((body) => String(body.terraformStatus ?? body.terraform_status ?? "") === wanted)) return false;
  }
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
    habitabilityScore: getSystemHabitabilityScore(star),
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

function captureControlState() {
  return {
    faction: factionFilter?.value ?? "all",
    activeFaction,
    search: searchFilter?.value ?? "",
    objectType: objectTypeFilter?.value ?? "all",
    spectral: spectralFilter?.value ?? "all",
    factionType: factionTypeFilter?.value ?? "all",
    minPlanets: minPlanets?.value ?? "0",
    year: currentYear,
    starScale: starScale?.value ?? "1.1",
    skyRadius: skyRadius?.value ?? "15",
    orbitSpeed: orbitSpeed?.value ?? "1",
    showLabels: Boolean(showLabels?.checked),
    showTerritories: Boolean(showTerritories?.checked),
    showOctants: Boolean(showOctants?.checked),
    showOuter: Boolean(showOuter?.checked),
    habitableOnly: Boolean(habitableOnly?.checked),
    showHabitabilityScores: scoreLabelsVisible(),
    showQuadrantBounds: Boolean(document.querySelector("#showQuadrantBounds")?.checked),
  };
}

function applyControlState(state = {}) {
  const showQuadrantBounds = document.querySelector("#showQuadrantBounds");
  if (factionFilter && state.faction !== undefined) factionFilter.value = state.faction;
  activeFaction = state.activeFaction ?? "all";
  if (searchFilter && state.search !== undefined) searchFilter.value = state.search;
  if (objectTypeFilter && state.objectType !== undefined) objectTypeFilter.value = state.objectType;
  if (spectralFilter && state.spectral !== undefined) spectralFilter.value = state.spectral;
  if (factionTypeFilter && state.factionType !== undefined) factionTypeFilter.value = state.factionType;
  if (minPlanets && state.minPlanets !== undefined) minPlanets.value = state.minPlanets;
  if (yearSlider && state.year !== undefined) yearSlider.value = state.year;
  if (starScale && state.starScale !== undefined) starScale.value = state.starScale;
  if (skyRadius && state.skyRadius !== undefined) {
    skyRadius.value = state.skyRadius;
    if (skyRadiusLabel) skyRadiusLabel.textContent = skyRadius.value;
  }
  if (orbitSpeed && state.orbitSpeed !== undefined) orbitSpeed.value = state.orbitSpeed;
  if (showLabels && state.showLabels !== undefined) showLabels.checked = Boolean(state.showLabels);
  if (showTerritories && state.showTerritories !== undefined) showTerritories.checked = Boolean(state.showTerritories);
  if (showOctants && state.showOctants !== undefined) showOctants.checked = Boolean(state.showOctants);
  if (showOuter && state.showOuter !== undefined) showOuter.checked = Boolean(state.showOuter);
  if (habitableOnly && state.habitableOnly !== undefined) habitableOnly.checked = Boolean(state.habitableOnly);
  if (showHabitableScores && state.showHabitabilityScores !== undefined) showHabitableScores.checked = Boolean(state.showHabitabilityScores);
  if (showQuadrantBounds && state.showQuadrantBounds !== undefined) showQuadrantBounds.checked = Boolean(state.showQuadrantBounds);
  currentYear = Number(yearSlider?.value || state.year || currentYear);
  if (yearLabel) yearLabel.textContent = String(currentYear);
}

function captureAppState(name = "") {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    appVersion: APP_STATE_VERSION,
    name: name || "starmap-save",
    savedAt: new Date().toISOString(),
    state: {
      camera: {
        position: camera.position.toArray(),
        target: controls.target.toArray(),
      },
      controls: captureControlState(),
      panels: {
        leftCollapsed: document.querySelector(".panel-left")?.classList.contains("collapsed") || false,
        rightCollapsed: document.querySelector(".panel-right")?.classList.contains("collapsed") || false,
        timeCollapsed: document.querySelector("#timeHud")?.classList.contains("collapsed") || false,
        fleetCollapsed: document.querySelector("#fleetPanel")?.classList.contains("collapsed") || false,
        visibility: Array.from(uiVisibility.entries()),
        locations: capturePanelLocations(),
      },
      input: {
        keyBindings: { ...keyBindings },
        leftClickMode,
        shipCommandMode,
        orbitMouseAdjustEnabled,
      },
      detailGroups: Array.from(detailGroupVisibility.entries()),
      selection: {
        starId: selectedStar?.id || null,
        bodyId: selectedBody?.id || null,
        systemViewStarId: systemViewStar?.id || null,
        inSystemView,
      },
      time: {
        totalSimDays,
        orbitSimDays,
        timeFlowDaysPerSec,
        lastNonZeroTimeFlowDaysPerSec,
        paused: timeFlowPaused,
      },
      ships: serializeShips(),
      fleets: serializeFleets(),
      selectedShipId,
      selectedShipIds: Array.from(selectedShipIds),
      selectedFleetId,
      followShipId,
      shipCommandMode,
    },
  };
}

function assertSaveCompatible(payload) {
  const actual = Number(payload?.schemaVersion ?? 0);
  if (actual !== SAVE_SCHEMA_VERSION) {
    throw new Error(`Save version incompatible: expected ${SAVE_SCHEMA_VERSION}, got ${actual || "unknown"}`);
  }
}

function disposeShipVisuals() {
  for (const [, entry] of shipMeshes) {
    starLayer.remove(entry.mesh);
    labelLayer.remove(entry.label);
    if (entry.trail) starLayer.remove(entry.trail);
    entry.mesh?.geometry?.dispose?.();
    entry.mesh?.material?.dispose?.();
    entry.trail?.geometry?.dispose?.();
    entry.trail?.material?.dispose?.();
  }
  shipMeshes.clear();
  for (const [, route] of shipRouteObjects) disposeShipRoute(route);
  shipRouteObjects.clear();
}

async function restoreAppState(payload) {
  assertSaveCompatible(payload);
  const state = payload.state || {};
  applyControlState(state.controls || {});
  detailGroupVisibility.clear();
  for (const [group, visible] of state.detailGroups || []) detailGroupVisibility.set(group, visible);
  saveDetailGroupVisibility();

  totalSimDays = Number(state.time?.totalSimDays || 0);
  orbitSimDays = Number(state.time?.orbitSimDays || 0);
  timeFlowDaysPerSec = Number(state.time?.timeFlowDaysPerSec ?? REALTIME_DAYS_PER_SEC);
  lastNonZeroTimeFlowDaysPerSec = Number(state.time?.lastNonZeroTimeFlowDaysPerSec || timeFlowDaysPerSec || REALTIME_DAYS_PER_SEC);
  timeFlowPaused = Boolean(state.time?.paused || timeFlowDaysPerSec <= 0);

  disposeShipVisuals();
  loadShips(state.ships || []);
  loadFleets(state.fleets || []);
  selectedShipId = state.selectedShipId || null;
  selectedShipIds.clear();
  (state.selectedShipIds || (state.selectedShipId ? [state.selectedShipId] : [])).forEach((id) => {
    if (findShip(id)) selectedShipIds.add(id);
  });
  selectedFleetId = state.selectedFleetId || null;
  followShipId = state.followShipId || null;
  shipCommandMode = state.shipCommandMode || "move";
  document.querySelectorAll(".command-mode").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.commandMode === shipCommandMode);
  });

  if (state.panels) {
    document.querySelector(".panel-left")?.classList.toggle("collapsed", Boolean(state.panels.leftCollapsed));
    document.querySelector(".panel-right")?.classList.toggle("collapsed", Boolean(state.panels.rightCollapsed));
    document.querySelector("#timeHud")?.classList.toggle("collapsed", Boolean(state.panels.timeCollapsed));
    document.querySelector("#fleetPanel")?.classList.toggle("collapsed", Boolean(state.panels.fleetCollapsed));
    if (state.panels.visibility) {
      uiVisibility.clear();
      for (const [id, visible] of state.panels.visibility) uiVisibility.set(id, Boolean(visible));
      applyUiVisibility();
    }
    applyPanelLocations(state.panels.locations || {});
  }

  if (state.input) {
    Object.assign(keyBindings, state.input.keyBindings || {});
    leftClickMode = state.input.leftClickMode || leftClickMode;
    shipCommandMode = state.input.shipCommandMode || shipCommandMode;
    orbitMouseAdjustEnabled = state.input.orbitMouseAdjustEnabled !== undefined
      ? Boolean(state.input.orbitMouseAdjustEnabled)
      : orbitMouseAdjustEnabled;
    renderKeyboardBindings();
    syncInputPanels();
  }

  if (state.selection?.inSystemView && state.selection.systemViewStarId) {
    await openSystemView(state.selection.systemViewStarId);
  } else if (inSystemView) {
    exitSystemView();
  }

  const selected = state.selection?.starId ? findLocalStar(state.selection.starId) : null;
  if (selected) {
    selectedStar = selected;
    showDetails(selected);
  }
  if (state.camera?.target) controls.target.fromArray(state.camera.target);
  if (state.camera?.position) camera.position.fromArray(state.camera.position);

  updateVisibility();
  updateScale();
  updateTimeHud();
  updateShipMeshes();
  updateShipRoutes();
  updateFleetPanel();
  updateShipCommandPanel();
  if (selectedFleetId && selectedFleet()) {
    showFleetInfoPanel(selectedFleet());
  } else if (selectedShipId) {
    const ship = ships.find((s) => s.id === selectedShipId);
    if (ship) selectShip(ship);
    else deselectShip();
  }
  writeAgentOutput({ action: "loadState", name: payload.name || "", shipCount: ships.length });
  return payload;
}

async function saveCurrentState(name) {
  const payload = captureAppState(name);
  const result = await apiJsonBody("/api/saves", payload);
  await refreshSaveList(result.name);
  setSaveStatus(`已保存: ${result.name}`);
  writeAgentOutput({ action: "saveState", save: result });
  return result;
}

async function listSaves() {
  return apiJson("/api/saves");
}

async function loadNamedState(name) {
  const payload = await apiJson(`/api/saves?name=${encodeURIComponent(name)}`);
  await restoreAppState(payload);
  setSaveStatus(`已读取: ${payload.name || name}`);
  return payload;
}

function setSaveStatus(text, isError = false) {
  const status = document.querySelector("#saveStatus");
  if (!status) return;
  status.textContent = text;
  status.style.color = isError ? "var(--danger)" : "var(--muted)";
}

async function refreshSaveList(preferredName = "") {
  const select = document.querySelector("#saveSelect");
  if (!select) return [];
  try {
    const saves = await listSaves();
    select.innerHTML = saves.map((save) => `<option value="${escapeHtml(save.name)}">${escapeHtml(save.name)} · ${escapeHtml(save.savedAt || "")}</option>`).join("");
    if (preferredName) select.value = preferredName;
    return saves;
  } catch (error) {
    setSaveStatus(`保存列表失败: ${error.message}`, true);
    return [];
  }
}

function resolveShipLocation(opts) {
  // If locationStarId is actually a body name (e.g. "Earth"), resolve it
  const loc = opts?.locationStarId || opts?.location;
  if (!loc) return {};
  const target = resolveNavTarget(loc);
  if (!target) return {};
  if (target.type === "body") {
    return {
      locationStarId: target.starId,
      locationBodyId: target.bodyId,
      locationPoint: target.point,
    };
  }
  if (target.type === "ship") {
    return {
      locationStarId: target.starId,
      locationBodyId: target.bodyId,
      locationPoint: target.point,
    };
  }
  return { locationStarId: target.starId };
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
    editStarInfo: (id, fields = {}) => editStarInfo(id, fields),
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
    editBodyInfo: (id, fields = {}) => editBodyInfo(id, fields),
    setHabitabilityLabels: (visible) => {
      if (showHabitableScores) showHabitableScores.checked = Boolean(visible);
      updateVisibility();
      return { showHabitabilityScores: scoreLabelsVisible() };
    },
    toggleHabitabilityLabels: () => {
      if (showHabitableScores) showHabitableScores.checked = !showHabitableScores.checked;
      updateVisibility();
      return { showHabitabilityScores: scoreLabelsVisible() };
    },
    clearSystem: () => {
      clearSystemView();
      writeAgentOutput({ action: "clearSystem" });
    },
    // ── Time control API ──
    setTimeFlow: (rate) => {
      const result = setTimeFlow(rate);
      writeAgentOutput({ action: "setTimeFlow", ...result });
      return result;
    },
    pauseTime: () => setTimeFlow(0),
    resumeTime: (rate) => setTimeFlow(rate || lastNonZeroTimeFlowDaysPerSec || REALTIME_DAYS_PER_SEC),
    resetTime: () => { resetSimTime(); writeAgentOutput({ action: "resetTime" }); },
    getElapsed: () => ({
      totalDays: totalSimDays,
      display: formatElapsedTime(totalSimDays),
      flowRate: timeFlowDaysPerSec,
      flowDisplay: formatTimeFlow(timeFlowDaysPerSec)
    }),
    exportState: (name) => captureAppState(name),
    applyState: restoreAppState,
    saveState: saveCurrentState,
    listSaves,
    loadState: loadNamedState,
    setUiVisibility: (visibility = {}) => {
      for (const [id, visible] of Object.entries(visibility)) {
        if (uiPanelDefs[id]) uiVisibility.set(id, Boolean(visible));
      }
      applyUiVisibility();
      return Object.fromEntries(uiVisibility);
    },
    getPanelLocations: capturePanelLocations,
    applyPanelLocations,
    setLeftClickMode: (mode) => {
      leftClickMode = mode === "box" ? "box" : "rotate";
      syncInputPanels();
      return { leftClickMode };
    },
    setKeyboardMapping: (mapping = {}) => {
      Object.keys(keyBindings).forEach((key) => {
        if (mapping[key]) keyBindings[key] = String(mapping[key]).toLowerCase();
      });
      localStorage.setItem("starmap-keybindings", JSON.stringify(keyBindings));
      renderKeyboardBindings();
      return { ...keyBindings };
    },
    setOrbitMouseAdjust: (enabled) => {
      orbitMouseAdjustEnabled = Boolean(enabled);
      syncInputPanels();
      return { orbitMouseAdjustEnabled };
    },
    // ── Ship API ──
    buildShip: (opts) => {
      const resolved = resolveShipLocation(opts);
      const ship = createShip({ ...opts, ...resolved, faction: opts?.faction || "无/无所属", travelSpeed: parseShipSpeedSpec(opts?.travelSpeed, undefined), instant: false });
      ship.buildStartDay = totalSimDays;
      writeAgentOutput({ action: "buildShip", ship: shipInfo(ship) });
      return ship;
    },
    deployShip: (opts) => {
      const resolved = resolveShipLocation(opts);
      const ship = createShip({ ...opts, ...resolved, faction: opts?.faction || "无/无所属", travelSpeed: parseShipSpeedSpec(opts?.travelSpeed, undefined), instant: true });
      ship.buildStartDay = totalSimDays;
      writeAgentOutput({ action: "deployShip", ship: shipInfo(ship) });
      return ship;
    },
    moveShip: (shipId, destStarId, opts) => {
      const ship = ships.find((s) => s.id === shipId);
      if (!ship) throw new Error(`Ship not found: ${shipId}`);
      return commandShipToStar(ship, destStarId, opts);
    },
    moveShipToPoint: (shipId, point, opts = {}) => {
      const ship = ships.find((s) => s.id === shipId);
      if (!ship) throw new Error(`Ship not found: ${shipId}`);
      return commandShipToPoint(ship, point, opts.label || "自由坐标", opts);
    },
    shipInfo: (shipId) => {
      const ship = ships.find((s) => s.id === shipId);
      if (!ship) throw new Error(`Ship not found: ${shipId}`);
      const info = showShipInfo(ship);
      return info;
    },
    editShipInfo: (shipId, fields = {}) => editShipInfo(shipId, fields),
    listShips: (filter) => {
      const result = listShips(filter);
      writeAgentOutput(result.map((s) => shipInfo(s)));
      return result;
    },
    removeShip: (shipId) => {
      removeShip(shipId);
      writeAgentOutput({ action: "removeShip", shipId });
    },
    shipClasses: () => {
      writeAgentOutput(Object.entries(shipClasses).map(([k, v]) => ({ id: k, ...v })));
      return shipClasses;
    },
    shipCategories: () => {
      writeAgentOutput(shipCategories);
      return shipCategories;
    },
    followShip: (shipId) => {
      followShipId = shipId || null;
      if (shipId) {
        const ship = ships.find((s) => s.id === shipId);
        if (ship) selectShip(ship);
      }
      writeAgentOutput({ action: "followShip", shipId: followShipId });
    },
    unfollowShip: () => {
      followShipId = null;
      writeAgentOutput({ action: "unfollowShip" });
    },
    selectShip: (shipId) => {
      const ship = ships.find((s) => s.id === shipId);
      if (!ship) throw new Error(`Ship not found: ${shipId}`);
      selectShip(ship);
      return shipInfo(ship);
    },
    deselectShip: () => {
      deselectShip();
      writeAgentOutput({ action: "deselectShip" });
    },
    zoomToShip: (shipId) => {
      const ship = ships.find((s) => s.id === shipId);
      if (!ship) throw new Error(`Ship not found: ${shipId}`);
      zoomToShip(ship);
      return shipInfo(ship);
    },
    selectShips: (shipIds) => {
      setSelectedShips(Array.isArray(shipIds) ? shipIds : [shipIds]);
      const result = selectedShips().map((ship) => shipInfo(ship));
      writeAgentOutput({ action: "selectShips", count: result.length, ships: result });
      return result;
    },
    selectShipsByFaction,
    createFleet: (shipIds, name) => {
      const fleet = createFleet(shipIds, name);
      updateFleetPanel();
      if (fleet) showFleetInfoPanel(fleet);
      writeAgentOutput({ action: "createFleet", fleet });
      return fleet;
    },
    listFleets: () => {
      normalizeFleets();
      writeAgentOutput(fleets);
      return fleets;
    },
    selectFleet: (fleetId) => {
      selectFleet(fleetId);
      return selectedFleet();
    },
    moveShips: (shipIds, destStarId, opts = {}) => {
      const targets = (Array.isArray(shipIds) ? shipIds : [shipIds]).map(findShip).filter(Boolean);
      return commandShipsToStar(targets, destStarId, opts).map((ship) => shipInfo(ship));
    },
    setShipRoute: (shipIds, destinations, opts = {}) => {
      const targets = (Array.isArray(shipIds) ? shipIds : [shipIds]).map(findShip).filter(Boolean);
      return routeShipsToTargets(targets, destinations, { ...opts, appendRoute: false }).map((ship) => shipInfo(ship));
    },
    appendShipRoute: (shipIds, destinations, opts = {}) => {
      const targets = (Array.isArray(shipIds) ? shipIds : [shipIds]).map(findShip).filter(Boolean);
      return routeShipsToTargets(targets, destinations, { ...opts, appendRoute: true }).map((ship) => shipInfo(ship));
    },
    setShipSpeed: (shipIds, speedSpec) => {
      const speed = parseShipSpeedSpec(speedSpec, null);
      if (!(speed > 0)) throw new Error(`Invalid ship speed: ${speedSpec}`);
      const targets = (Array.isArray(shipIds) ? shipIds : [shipIds]).map(findShip).filter(Boolean);
      targets.forEach((ship) => { ship.travelSpeed = speed; });
      updateFleetPanel();
      writeAgentOutput({ action: "setShipSpeed", speedC: speed, count: targets.length });
      return targets.map((ship) => shipInfo(ship));
    },
    moveFleet: (fleetId, destStarId, opts = {}) => {
      const fleet = fleets.find((item) => item.id === fleetId);
      if (!fleet) throw new Error(`Fleet not found: ${fleetId}`);
      return commandShipsToStar(fleet.shipIds.map(findShip).filter(Boolean), destStarId, opts).map((ship) => shipInfo(ship));
    },
    orbitShip: (shipId, centerPoint, opts = {}) => {
      const ship = findShip(shipId);
      if (!ship) throw new Error(`Ship not found: ${shipId}`);
      return shipInfo(commandShipOrbitPoint(ship, centerPoint, opts.label || opts.targetLabel || "轨道中心", opts));
    },
    orbitShips: (shipIds, centerPoint, opts = {}) => {
      const targets = (Array.isArray(shipIds) ? shipIds : [shipIds]).map(findShip).filter(Boolean);
      return commandShipsOrbitPoint(targets, centerPoint, opts.label || opts.targetLabel || "轨道中心", opts).map((ship) => shipInfo(ship));
    },
    fleetSummary: () => {
      const summary = getFleetSummary();
      writeAgentOutput(summary);
      return summary;
    },
    // ── Asteroid API ──
    addAsteroid: (opts) => {
      const locationVec = opts.locationStarId ? getStarWorldPos(opts.locationStarId) : null;
      const destinationVec = opts.destinationStarId ? getStarWorldPos(opts.destinationStarId) : null;
      const locationPoint = opts.locationPoint || (locationVec ? vectorToArray(locationVec) : null);
      const destinationPoint = opts.destinationPoint || (destinationVec ? vectorToArray(destinationVec) : null);
      const asteroid = createAsteroid({
        ...opts,
        locationPoint,
        destinationPoint,
        distanceFn: starDistanceFn,
        currentSimDay: totalSimDays,
      });
      writeAgentOutput({ action: "addAsteroid", ship: shipInfo(asteroid) });
      return asteroid;
    },
    moveAsteroid: (asteroidId, destStarId, opts) => {
      const asteroid = ships.find((s) => s.id === asteroidId);
      if (!asteroid) throw new Error(`Asteroid not found: ${asteroidId}`);
      return commandShipToStar(asteroid, destStarId, opts);
    },
    // ── UI Visibility API ──
    getUiVisibility: () => Object.fromEntries(uiVisibility),
    showPanel: (panelId) => {
      if (uiPanelDefs[panelId]) { uiVisibility.set(panelId, true); applyUiVisibility(); }
      return Object.fromEntries(uiVisibility);
    },
    hidePanel: (panelId) => {
      if (uiPanelDefs[panelId]) { uiVisibility.set(panelId, false); applyUiVisibility(); }
      return Object.fromEntries(uiVisibility);
    },
    togglePanel: (panelId) => {
      if (uiPanelDefs[panelId]) { uiVisibility.set(panelId, !uiVisibility.get(panelId)); applyUiVisibility(); }
      return Object.fromEntries(uiVisibility);
    },
    listPanels: () => Object.entries(uiPanelDefs).map(([id, def]) => ({ id, label: def.label, visible: uiVisibility.get(id) !== false })),
    // ── Label scale API ──
    setLabelScale: (factor) => {
      labelScaleFactor = Math.max(0.1, Math.min(3, Number(factor) || 1));
      const slider = document.querySelector("#labelScale");
      if (slider) slider.value = labelScaleFactor;
      updateScale();
      return { labelScaleFactor };
    },
    getLabelScale: () => ({ labelScaleFactor }),
    // ── Fleet window API ──
    openFleetWindow: (fleetId) => { openFleetShipWindow(fleetId); return { opened: fleetId }; },
    closeFleetWindow: (fleetId) => { closeFleetShipWindow(fleetId); return { closed: fleetId }; },
    removeFleet: (fleetId) => {
      const idx = fleets.findIndex((f) => f.id === fleetId);
      if (idx >= 0) fleets.splice(idx, 1);
      closeFleetShipWindow(fleetId);
      normalizeFleets();
      updateFleetPanel();
      refreshFleetWindows();
      return { removed: fleetId };
    },
    renameFleet: (fleetId, newName) => {
      const fleet = fleets.find((f) => f.id === fleetId);
      if (!fleet) throw new Error(`Fleet not found: ${fleetId}`);
      fleet.name = newName;
      updateFleetPanel();
      refreshFleetWindows();
      return fleet;
    },
    addShipToFleet: (shipId, fleetId) => {
      const fleet = fleets.find((f) => f.id === fleetId);
      if (!fleet) throw new Error(`Fleet not found: ${fleetId}`);
      if (!fleet.shipIds.includes(shipId)) fleet.shipIds.push(shipId);
      updateFleetPanel();
      refreshFleetWindows();
      return fleet;
    },
    removeShipFromFleet: (shipId, fleetId) => {
      const fleet = fleets.find((f) => f.id === fleetId);
      if (!fleet) throw new Error(`Fleet not found: ${fleetId}`);
      fleet.shipIds = fleet.shipIds.filter((id) => id !== shipId);
      normalizeFleets();
      updateFleetPanel();
      refreshFleetWindows();
      return fleet;
    },
    // ── Keyboard binding API ──
    getKeyBindings: () => ({ ...keyBindings }),
    setKeyBinding: (action, key) => {
      if (keyBindings.hasOwnProperty(action)) {
        keyBindings[action] = String(key).toLowerCase();
        localStorage.setItem("starmap-keybindings", JSON.stringify(keyBindings));
        renderKeyboardBindings();
      }
      return { ...keyBindings };
    },
    getState: () => ({
      selected: selectedStar,
      selectedBody,
      currentYear,
      showHabitabilityScores: scoreLabelsVisible(),
      starCount: stars.length,
      visibleStarCount: stars.filter((star) => star.mesh?.visible).length,
      camera: camera.position.toArray(),
      target: controls.target.toArray(),
      totalSimDays,
      timeFlowDaysPerSec,
      shipCount: ships.length,
      selectedShipIds: Array.from(selectedShipIds),
      selectedFleetId,
      fleetCount: fleets.length,
      shipCommandMode,
      labelScaleFactor,
      uiVisibility: Object.fromEntries(uiVisibility),
      keyBindings: { ...keyBindings }
    })
  };
  window.StarMapAgent = api;
  globalThis.StarMapAgent = api;
  document.StarMapAgent = api;
  document.querySelector("#app").StarMapAgent = api;
  document.documentElement.dataset.agentReady = "true";
  document.dispatchEvent(new CustomEvent("starmap-agent-ready", { detail: { starCount: stars.length } }));
}

function makePanelDraggable(panel, handle, storageKey) {
  if (!panel || !handle) return;
  const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
  let locked = Boolean(saved.locked);
  panel.dataset.locked = locked ? "true" : "false";
  if (Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
    panel.style.left = `${saved.left}px`;
    panel.style.top = `${saved.top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }
  const lockBtn = document.createElement("button");
  lockBtn.type = "button";
  lockBtn.className = `panel-lock${locked ? " locked" : ""}`;
  lockBtn.title = locked ? "解锁拖拽" : "锁定位置";
  lockBtn.textContent = locked ? "●" : "○";
  const hideButton = handle.querySelector(".panel-hide, .ship-info-close, .panel-toggle, .fleet-panel-toggle, .time-hud-toggle");
  if (hideButton) handle.insertBefore(lockBtn, hideButton);
  else handle.appendChild(lockBtn);
  lockBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    locked = !locked;
    panel.dataset.locked = locked ? "true" : "false";
    lockBtn.classList.toggle("locked", locked);
    lockBtn.textContent = locked ? "●" : "○";
    lockBtn.title = locked ? "解锁拖拽" : "锁定位置";
    const rect = panel.getBoundingClientRect();
    localStorage.setItem(storageKey, JSON.stringify({ left: rect.left, top: rect.top, locked }));
  });

  let drag = null;
  handle.addEventListener("pointerdown", (event) => {
    if (locked || event.target.closest("button,input,select,textarea")) return;
    const rect = panel.getBoundingClientRect();
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
    };
    panel.classList.add("dragging");
    handle.setPointerCapture?.(event.pointerId);
  });
  handle.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const nextLeft = Math.max(4, Math.min(window.innerWidth - 64, drag.left + event.clientX - drag.startX));
    const nextTop = Math.max(4, Math.min(window.innerHeight - 40, drag.top + event.clientY - drag.startY));
    panel.style.left = `${nextLeft}px`;
    panel.style.top = `${nextTop}px`;
  });
  handle.addEventListener("pointerup", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    handle.releasePointerCapture?.(event.pointerId);
    panel.classList.remove("dragging");
    const rect = panel.getBoundingClientRect();
    localStorage.setItem(storageKey, JSON.stringify({ left: rect.left, top: rect.top, locked }));
    drag = null;
  });
}

function makeShipInfoMinimizable() {
  const panel = document.querySelector("#shipInfoPanel");
  const header = panel?.querySelector(".ship-info-header");
  if (!panel || !header || header.querySelector(".ship-info-minimize")) return;
  const minBtn = document.createElement("button");
  minBtn.type = "button";
  minBtn.className = "ship-info-close ship-info-minimize";
  minBtn.title = "缩小/展开";
  minBtn.textContent = "−";
  header.insertBefore(minBtn, document.querySelector("#shipInfoClose"));
  minBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    panel.classList.toggle("minimized");
    minBtn.textContent = panel.classList.contains("minimized") ? "+" : "−";
  });
}

function panelElement(id) {
  const selector = uiPanelDefs[id]?.selector;
  return selector ? document.querySelector(selector) : null;
}

function applyUiVisibility() {
  for (const id of Object.keys(uiPanelDefs)) {
    const el = panelElement(id);
    if (!el) continue;
    const visible = uiVisibility.get(id) !== false;
    if ((id === "shipInfo" && !selectedShipId && !selectedFleetId) || (id === "shipCommand" && selectedShipIds.size === 0)) {
      el.style.display = visible ? "none" : "none";
    } else {
      el.style.display = visible ? "" : "none";
    }
  }
  const select = document.querySelector("#uiDisplaySelect");
  if (select) {
    Array.from(select.options).forEach((option) => {
      option.selected = uiVisibility.get(option.value) !== false;
    });
  }
  localStorage.setItem("starmap-ui-visibility", JSON.stringify(Array.from(uiVisibility.entries())));
}

function loadUiVisibility() {
  try {
    const saved = new Map(JSON.parse(localStorage.getItem("starmap-ui-visibility") || "[]"));
    for (const id of Object.keys(uiPanelDefs)) {
      if (saved.has(id)) uiVisibility.set(id, Boolean(saved.get(id)));
    }
  } catch {
    // Ignore corrupt local UI prefs; saves can still restore explicit state.
  }
}

function capturePanelLocations() {
  const locations = {};
  for (const id of ["controls", "details", "time", "fleet", "shipCommand", "shipInfo", "mouseMode", "keyboard"]) {
    const el = panelElement(id);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    locations[id] = {
      left: Number(rect.left.toFixed(1)),
      top: Number(rect.top.toFixed(1)),
      width: Number(rect.width.toFixed(1)),
      height: Number(rect.height.toFixed(1)),
      locked: el.dataset.locked === "true",
      collapsed: el.classList.contains("collapsed"),
    };
  }
  return locations;
}

function applyPanelLocations(locations = {}) {
  for (const [id, loc] of Object.entries(locations || {})) {
    const el = panelElement(id);
    if (!el || !Number.isFinite(loc.left) || !Number.isFinite(loc.top)) continue;
    el.style.left = `${loc.left}px`;
    el.style.top = `${loc.top}px`;
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.dataset.locked = loc.locked ? "true" : "false";
    el.classList.toggle("collapsed", Boolean(loc.collapsed));
  }
}

function initUiManager() {
  loadUiVisibility();
  const cog = document.querySelector("#uiCogButton");
  const panel = document.querySelector("#uiManagerPanel");
  const select = document.querySelector("#uiDisplaySelect");
  if (select) {
    select.innerHTML = Object.entries(uiPanelDefs)
      .map(([id, def]) => `<option value="${escapeHtml(id)}">${escapeHtml(def.label)}</option>`)
      .join("");
    select.addEventListener("mousedown", (event) => {
      const option = event.target?.closest?.("option");
      if (!option) return;
      event.preventDefault();
      option.selected = !option.selected;
      uiVisibility.set(option.value, option.selected);
      applyUiVisibility();
      select.focus();
    });
    select.addEventListener("change", () => {
      const chosen = new Set(Array.from(select.selectedOptions).map((option) => option.value));
      for (const id of Object.keys(uiPanelDefs)) uiVisibility.set(id, chosen.has(id));
      applyUiVisibility();
    });
  }
  cog?.addEventListener("click", () => {
    if (!panel) return;
    panel.style.display = panel.style.display === "none" ? "" : "none";
  });
  document.querySelector("#uiManagerClose")?.addEventListener("click", () => {
    if (panel) panel.style.display = "none";
  });
  document.querySelectorAll("[data-hide-panel]").forEach((btn) => {
    btn.addEventListener("click", () => {
      uiVisibility.set(btn.dataset.hidePanel, false);
      applyUiVisibility();
    });
  });
  applyUiVisibility();
}

function renderKeyboardBindings() {
  const container = document.querySelector("#keyboardBindings");
  if (!container) return;
  const labels = {
    forward: "前进",
    backward: "后退",
    left: "向左",
    right: "向右",
    up: "向上",
    down: "向下",
    deselectShip: "取消选择",
    exitSystem: "退出星系",
    pauseTime: "暂停/继续",
  };
  const displayValue = (v) => v === " " ? "Space" : v === "`" ? "~(`)" : v;
  container.innerHTML = Object.entries(labels).map(([id, label]) => (
    `<label class="keybind-row"><span>${escapeHtml(label)}</span><input data-keybind="${escapeHtml(id)}" maxlength="12" value="${escapeHtml(displayValue(keyBindings[id]))}" /></label>`
  )).join("");
  container.querySelectorAll("[data-keybind]").forEach((input) => {
    // Use keydown capture so user can bind special keys like Escape, Space, ~
    input.addEventListener("keydown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = input.dataset.keybind;
      const newKey = event.key.toLowerCase();
      keyBindings[id] = newKey === "escape" ? "escape" : newKey;
      input.value = displayValue(keyBindings[id]);
      localStorage.setItem("starmap-keybindings", JSON.stringify(keyBindings));
    });
    input.addEventListener("change", () => {
      const id = input.dataset.keybind;
      const raw = String(input.value || "").toLowerCase().trim();
      const mapped = raw === "space" ? " " : raw === "~" || raw === "~(`)" ? "`" : raw;
      keyBindings[id] = mapped || keyBindings[id];
      input.value = displayValue(keyBindings[id]);
      localStorage.setItem("starmap-keybindings", JSON.stringify(keyBindings));
    });
  });
}

function loadKeyboardBindings() {
  try {
    const saved = JSON.parse(localStorage.getItem("starmap-keybindings") || "{}");
    Object.keys(keyBindings).forEach((key) => {
      if (saved[key]) keyBindings[key] = String(saved[key]).toLowerCase();
    });
  } catch {
    // Keep defaults.
  }
}

function syncInputPanels() {
  document.querySelectorAll(".left-mode").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.leftMode === leftClickMode);
  });
  document.querySelectorAll(".command-mode").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.commandMode === shipCommandMode);
  });
  const orbitToggle = document.querySelector("#orbitMouseAdjustToggle");
  if (orbitToggle) orbitToggle.checked = orbitMouseAdjustEnabled;
}

function bindUi() {
  const showQuadrantBounds = document.querySelector("#showQuadrantBounds");

  const panelLeft = document.querySelector(".panel-left");
  const panelRight = document.querySelector(".panel-right");
  const toggleLeft = document.querySelector("#toggleLeft");
  const toggleRight = document.querySelector("#toggleRight");
  loadKeyboardBindings();
  renderKeyboardBindings();
  makePanelDraggable(panelLeft, panelLeft?.querySelector(".mast"), "starmap-panel-left");
  makePanelDraggable(panelRight, panelRight?.querySelector(".detail-head"), "starmap-panel-right");
  makePanelDraggable(document.querySelector("#timeHud"), document.querySelector("#timeHud .time-hud-inner"), "starmap-panel-time");
  makePanelDraggable(document.querySelector("#fleetPanel"), document.querySelector("#fleetPanel .fleet-panel-header"), "starmap-panel-fleet");
  makePanelDraggable(document.querySelector("#shipCommandPanel"), document.querySelector("#shipCommandPanel .ship-command-header"), "starmap-panel-ship-command");
  makePanelDraggable(document.querySelector("#shipInfoPanel"), document.querySelector("#shipInfoPanel .ship-info-header"), "starmap-panel-ship-info");
  makePanelDraggable(document.querySelector("#mouseModePanel"), document.querySelector("#mouseModePanel .tiny-panel-header"), "starmap-panel-mouse");
  makePanelDraggable(document.querySelector("#keyboardPanel"), document.querySelector("#keyboardPanel .tiny-panel-header"), "starmap-panel-keyboard");
  makePanelDraggable(document.querySelector("#uiManagerPanel"), document.querySelector("#uiManagerPanel .ui-manager-header"), "starmap-panel-ui-manager");
  makeShipInfoMinimizable();
  initUiManager();
  document.querySelectorAll(".left-mode").forEach((btn) => {
    btn.addEventListener("click", () => {
      leftClickMode = btn.dataset.leftMode || "rotate";
      syncInputPanels();
    });
  });
  syncInputPanels();
  toggleLeft?.addEventListener("click", () => {
    panelLeft.classList.toggle("collapsed");
    toggleLeft.textContent = panelLeft.classList.contains("collapsed") ? "☰" : "×";
  });
  toggleRight?.addEventListener("click", () => {
    panelRight.classList.toggle("collapsed");
    toggleRight.textContent = panelRight.classList.contains("collapsed") ? "☰" : "×";
  });
  document.querySelector("#detailEditBtn")?.addEventListener("click", openDetailEditor);

  [showLabels, showTerritories, showOctants, showQuadrantBounds, showOuter, habitableOnly, showHabitableScores, objectTypeFilter, spectralFilter, factionTypeFilter].forEach((el) => {
    el?.addEventListener("change", updateVisibility);
  });
  factionFilter.addEventListener("change", () => {
    activeFaction = "all";
    updateVisibility();
  });
  searchFilter.addEventListener("input", updateVisibility);
  minPlanets.addEventListener("input", updateVisibility);
  yearSlider.addEventListener("input", updateVisibility);
  starScale.addEventListener("input", updateScale);
  const labelScaleSlider = document.querySelector("#labelScale");
  if (labelScaleSlider) {
    labelScaleSlider.addEventListener("input", () => {
      labelScaleFactor = Number(labelScaleSlider.value) || 1;
      const labelScaleLabel = document.querySelector("#labelScaleLabel");
      if (labelScaleLabel) labelScaleLabel.textContent = labelScaleFactor.toFixed(2);
      updateScale();
    });
  }
  skyRadius.addEventListener("input", () => {
    skyRadiusLabel.textContent = skyRadius.value;
    if (inSystemView) updateVisibility();
  });
  if (orbitSpeed) {
    orbitSpeed.addEventListener("input", () => {
      const dps = getOrbitSpeedDaysPerSec();
      timeFlowDaysPerSec = dps;
      timeFlowPaused = dps <= 0;
      if (dps > 0) lastNonZeroTimeFlowDaysPerSec = dps;
      if (orbitSpeedLabel) orbitSpeedLabel.textContent = formatTimeFlow(dps);
      updateTimeHud();
    });
  }
  // Time HUD controls
  const timeHudToggle = document.querySelector("#timeHudToggle");
  const timeHud = document.querySelector("#timeHud");
  if (timeHudToggle && timeHud) {
    timeHudToggle.addEventListener("click", () => {
      timeHud.classList.toggle("collapsed");
      timeHudToggle.textContent = timeHud.classList.contains("collapsed") ? "☰" : "×";
    });
  }
  const shipCommandToggle = document.querySelector("#shipCommandToggle");
  const shipCommandPanel = document.querySelector("#shipCommandPanel");
  shipCommandToggle?.addEventListener("click", () => {
    if (!shipCommandPanel) return;
    const hidden = shipCommandPanel.style.display !== "none";
    uiVisibility.set("shipCommand", !hidden);
    updateShipCommandPanel();
    applyUiVisibility();
  });
  const timePauseBtn = document.querySelector("#timePauseBtn");
  if (timePauseBtn) {
    timePauseBtn.addEventListener("click", () => {
      if (timeFlowPaused) setTimeFlow(lastNonZeroTimeFlowDaysPerSec || REALTIME_DAYS_PER_SEC);
      else setTimeFlow(0);
    });
  }
  const timeResetBtn = document.querySelector("#timeResetBtn");
  if (timeResetBtn) {
    timeResetBtn.addEventListener("click", resetSimTime);
  }
  const timeCustomToggle = document.querySelector("#timeCustomToggle");
  const timeCustomPanel = document.querySelector("#timeCustomPanel");
  timeCustomToggle?.addEventListener("click", () => {
    if (timeCustomPanel) timeCustomPanel.style.display = timeCustomPanel.style.display === "none" ? "grid" : "none";
  });
  document.querySelector("#timeCustomApply")?.addEventListener("click", () => {
    setTimeFlow({
      years: Number(document.querySelector("#timeYears")?.value || 0),
      months: Number(document.querySelector("#timeMonths")?.value || 0),
      days: Number(document.querySelector("#timeDays")?.value || 0),
      hours: Number(document.querySelector("#timeHours")?.value || 0),
      minutes: Number(document.querySelector("#timeMinutes")?.value || 0),
      seconds: Number(document.querySelector("#timeSeconds")?.value || 0),
    });
  });
  // Time speed preset buttons
  document.querySelectorAll("[data-time-rate]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setTimeFlow(btn.dataset.timeRate);
    });
  });
  document.querySelector("#saveStateBtn")?.addEventListener("click", async () => {
    const name = document.querySelector("#saveNameInput")?.value || `save-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
    try {
      await saveCurrentState(name);
    } catch (error) {
      setSaveStatus(`保存失败: ${error.message}`, true);
      writeAgentOutput(error.message);
    }
  });
  document.querySelector("#loadStateBtn")?.addEventListener("click", async () => {
    const name = document.querySelector("#saveSelect")?.value || document.querySelector("#saveNameInput")?.value;
    if (!name) {
      setSaveStatus("没有可读取的保存。", true);
      return;
    }
    try {
      await loadNamedState(name);
    } catch (error) {
      setSaveStatus(`读取失败: ${error.message}`, true);
      writeAgentOutput(error.message);
    }
  });
  document.querySelector("#refreshSavesBtn")?.addEventListener("click", () => refreshSaveList());
  // Show/hide system-view-only controls
  const systemOnlyControls = document.querySelectorAll(".system-view-only");
  const observer = new MutationObserver(() => {
    systemOnlyControls.forEach((el) => {
      el.style.display = inSystemView ? "" : "none";
    });
  });
  // Initial hide
  systemOnlyControls.forEach((el) => { el.style.display = "none"; });

  // Ship info panel controls
  const shipInfoClose = document.querySelector("#shipInfoClose");
  if (shipInfoClose) shipInfoClose.addEventListener("click", deselectShip);
  document.querySelector("#shipInfoEditBtn")?.addEventListener("click", openShipInfoEditor);

  const shipFollowBtn = document.querySelector("#shipFollowBtn");
  if (shipFollowBtn) {
    shipFollowBtn.addEventListener("click", () => {
      if (!selectedShipId) return;
      if (followShipId === selectedShipId) {
        followShipId = null;
        shipFollowBtn.textContent = "跟随";
      } else {
        followShipId = selectedShipId;
        shipFollowBtn.textContent = "取消跟随";
      }
    });
  }

  const shipZoomBtn = document.querySelector("#shipZoomBtn");
  if (shipZoomBtn) {
    shipZoomBtn.addEventListener("click", () => {
      if (!selectedShipId) return;
      const ship = ships.find((s) => s.id === selectedShipId);
      if (ship) zoomToShip(ship);
    });
  }

  const shipSystemBtn = document.querySelector("#shipSystemBtn");
  if (shipSystemBtn) {
    shipSystemBtn.addEventListener("click", async () => {
      if (!selectedShipId) return;
      const ship = ships.find((s) => s.id === selectedShipId);
      if (ship) {
        try {
          const systemId = ship.destinationStarId || ship.locationStarId;
          if (!systemId) throw new Error("该舰船当前不在具体恒星系内。");
          await openSystemView(systemId);
        } catch (e) {
          writeAgentOutput(e.message);
        }
      }
    });
  }
  document.querySelector("#shipCycleBtn")?.addEventListener("click", cycleSelectedFleetShip);

  // Fleet panel
  buildFleetPanel();

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
      const v = agentAction.value;
      agentOutput.style.display = v !== "none" ? "block" : "none";
      agentSingleTools.style.display = v === "single" ? "block" : "none";
      agentDistanceTools.style.display = v === "distance" ? "block" : "none";
      // Show API help for expanded categories
      const apiHelp = {
        "api-time": "StarMapAgent.pauseTime() / .resumeTime() / .setTimeFlow(rate) / .resetTime() / .getElapsed()",
        "api-ship": "StarMapAgent.deployShip({name,shipClass,locationStarId,travelSpeed,faction}) / .buildShip({...}) / .moveShip(id,destStarId) / .removeShip(id) / .listShips() / .shipInfo(id) / .editShipInfo(id,fields)",
        "api-ship-route": "StarMapAgent.setShipRoute(ids,dests) / .appendShipRoute(ids,dests) / .orbitShip(id,center,opts) / .orbitShips(ids,center,opts) / .setShipSpeed(ids,speed)",
        "api-fleet": "StarMapAgent.createFleet(shipIds,name) / .listFleets() / .selectFleet(id) / .moveFleet(id,dest) / .renameFleet(id,name) / .removeFleet(id) / .addShipToFleet(shipId,fleetId) / .removeShipFromFleet(shipId,fleetId)",
        "api-asteroid": "StarMapAgent.addAsteroid({name,locationStarId,destinationStarId,travelSpeed}) / .moveAsteroid(id,destStarId)",
        "api-ui": "StarMapAgent.showPanel(id) / .hidePanel(id) / .togglePanel(id) / .listPanels() / .setUiVisibility({...}) / .getUiVisibility() / .setKeyBinding(action,key) / .getKeyBindings()",
        "api-label": "StarMapAgent.setLabelScale(factor) / .getLabelScale()",
        "api-state": "StarMapAgent.saveState(name) / .loadState(name) / .listSaves() / .exportState() / .applyState(state) / .getState()"
      };
      if (apiHelp[v]) writeAgentOutput(apiHelp[v]);
    });
  }

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const active = document.activeElement;
    if (active && ["INPUT", "SELECT", "TEXTAREA"].includes(active.tagName)) return;
    // Customizable pause/resume
    if (key === keyBindings.pauseTime || event.code === "Space") {
      if (timeFlowPaused) setTimeFlow(lastNonZeroTimeFlowDaysPerSec || REALTIME_DAYS_PER_SEC);
      else setTimeFlow(0);
      event.preventDefault();
      return;
    }
    // Customizable deselect ship (default: ~ / backtick)
    if (key === keyBindings.deselectShip && selectedShipIds.size > 0) {
      deselectShip();
      event.preventDefault();
      return;
    }
    // Also support Escape for deselect if exitSystem is not bound to Escape, or if it's the default
    if (key === "escape" && keyBindings.deselectShip !== "escape" && selectedShipIds.size > 0) {
      deselectShip();
      event.preventDefault();
      return;
    }
    // Customizable exit system view
    if (key === keyBindings.exitSystem && inSystemView) {
      exitSystemView();
      event.preventDefault();
      return;
    }
    // Movement keys
    const movementKeys = ["forward", "backward", "left", "right", "up", "down"];
    for (const action of movementKeys) {
      if (key === keyBindings[action]) {
        pressedKeys.add(key);
        event.preventDefault();
        return;
      }
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

// ── Time control system ─────────────────────────────────────────────

function getOrbitSpeedDaysPerSec() {
  if (!orbitSpeed) return timeFlowDaysPerSec;
  const v = Number(orbitSpeed.value);
  if (v <= 0) return 0;
  return Math.pow(10, v * 0.356 - 0.356);
}

function formatTimeFlow(daysPerSec) {
  if (daysPerSec <= 0) return "暂停";
  if (daysPerSec < 1 / 1440) return `${(daysPerSec * 86400).toFixed(1)} 秒/秒`;
  if (daysPerSec < 1 / 24) return `${(daysPerSec * 24 * 60).toFixed(1)} 分/秒`;
  if (daysPerSec < 1) return `${(daysPerSec * 24).toFixed(1)} 时/秒`;
  if (daysPerSec < 1.5) return `${daysPerSec.toFixed(1)} 天/秒`;
  if (daysPerSec < 365) return `${Math.round(daysPerSec)} 天/秒`;
  const yps = daysPerSec / 365.25;
  if (yps < 100) return `${yps.toFixed(1)} 年/秒`;
  return `${Math.round(yps)} 年/秒`;
}

function formatElapsedTime(days) {
  if (days <= 0) return "0天";
  const years = Math.floor(days / 365.25);
  const rem = days - years * 365.25;
  const months = Math.floor(rem / 30.44);
  const d = Math.floor(rem - months * 30.44);
  const parts = [];
  if (years > 0) parts.push(`${years}年`);
  if (months > 0) parts.push(`${months}月`);
  if (d > 0 || parts.length === 0) parts.push(`${d}天`);
  return parts.join("");
}

function timePartsToDays(parts = {}) {
  return (
    Number(parts.years || 0) * 365.25
    + Number(parts.months || 0) * 30.44
    + Number(parts.days || 0)
    + Number(parts.hours || 0) / 24
    + Number(parts.minutes || 0) / 1440
    + Number(parts.seconds || 0) / 86400
  );
}

function parseShipSpeedSpec(value, fallback = null) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : fallback;
  const raw = String(value).trim().toLowerCase().replace(/\s+/g, "");
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const match = raw.match(/^([\d.]+)([a-z/]+)$/);
  if (!match) return fallback;
  const amount = Number(match[1]);
  const unit = match[2];
  if (!(amount > 0)) return fallback;
  const secondsPerYear = 365.25 * 86400;
  if (unit === "c") return amount;
  if (unit === "ly/sec" || unit === "ly/s") return amount * secondsPerYear;
  if (unit === "ly/min") return amount * 525960;
  if (unit === "ly/hour" || unit === "ly/hr" || unit === "ly/h") return amount * 8766;
  if (unit === "ly/day" || unit === "ly/d") return amount * 365.25;
  if (unit === "ly/year" || unit === "ly/yr" || unit === "ly/y") return amount;
  if (unit === "km/s" || unit === "km/sec") return amount / 299792.458;
  if (unit === "km/hour" || unit === "km/hr" || unit === "km/h") return amount / (299792.458 * 3600);
  return fallback;
}

function parseTimeFlowSpec(rateSpec) {
  if (typeof rateSpec === "number") return Math.max(0, rateSpec);
  if (typeof rateSpec === "object" && rateSpec !== null) return Math.max(0, timePartsToDays(rateSpec));
  const s = String(rateSpec).toLowerCase().trim();
  if (s === "pause" || s === "暂停" || s === "0") return 0;
  const unitMap = [
    { re: /^(y|yr|yrs|year|years|年)/, days: 365.25 },
    { re: /^(mon|month|months|月)/, days: 30.44 },
    { re: /^(w|week|weeks|周)/, days: 7 },
    { re: /^(d|day|days|天|日)/, days: 1 },
    { re: /^(h|hr|hour|hours|小时|时)/, days: 1 / 24 },
    { re: /^(min|minute|minutes|分钟|分)/, days: 1 / 1440 },
    { re: /^(s|sec|second|seconds|秒)/, days: 1 / 86400 },
  ];
  const matches = [...s.matchAll(/([\d.]+)\s*([a-zA-Z\u4e00-\u9fff]+)?/g)];
  if (!matches.length) return timeFlowDaysPerSec;
  let total = 0;
  for (const match of matches) {
    const value = Number(match[1]);
    const unit = match[2] || "day";
    const found = unitMap.find((entry) => entry.re.test(unit));
    total += value * (found?.days ?? 1);
  }
  return Math.max(0, total);
}

/**
 * Set time flow rate. Agent-callable.
 * Accepts flexible formats: "1 day/sec", "6 hours/sec", "1 month/sec", "10 years/sec", 30 (raw days/sec), etc.
 */
function setTimeFlow(rateSpec) {
  timeFlowDaysPerSec = parseTimeFlowSpec(rateSpec);
  timeFlowPaused = timeFlowDaysPerSec <= 0;
  if (timeFlowDaysPerSec > 0) lastNonZeroTimeFlowDaysPerSec = timeFlowDaysPerSec;
  updateTimeHud();
  // Sync orbit slider if present
  if (orbitSpeed && timeFlowDaysPerSec > 0) {
    const sliderVal = (Math.log10(timeFlowDaysPerSec) + 0.356) / 0.356;
    orbitSpeed.value = Math.max(0, Math.min(10, sliderVal));
    if (orbitSpeedLabel) orbitSpeedLabel.textContent = formatTimeFlow(timeFlowDaysPerSec);
  }
  return { timeFlowDaysPerSec, display: formatTimeFlow(timeFlowDaysPerSec) };
}

function resetSimTime() {
  totalSimDays = 0;
  orbitSimDays = 0;
  updateTimeHud();
}

function updateTimeHud() {
  const hudEl = document.querySelector("#timeHud");
  if (!hudEl) return;
  const elapsed = document.querySelector("#timeElapsed");
  const rate = document.querySelector("#timeRate");
  if (elapsed) elapsed.textContent = formatElapsedTime(totalSimDays);
  if (rate) rate.textContent = formatTimeFlow(timeFlowDaysPerSec);
  if (orbitSpeedLabel) orbitSpeedLabel.textContent = formatTimeFlow(timeFlowDaysPerSec);
  const pauseBtn = document.querySelector("#timePauseBtn");
  if (pauseBtn) pauseBtn.textContent = timeFlowPaused ? "继续" : "暂停";
}

function formatOrbitSpeed(daysPerSec) {
  return formatTimeFlow(daysPerSec);
}

function updateOrbitPositions() {
  if (orbitingBodies.length === 0) return;
  const TWO_PI = Math.PI * 2;

  // First pass: update planets (parentMesh === null)
  for (const ob of orbitingBodies) {
    if (ob.parentMesh) continue;
    const angularVel = (ob.periodDays > 0) ? TWO_PI / ob.periodDays : 0;
    const angle = ob.startAngle + angularVel * orbitSimDays;
    const cx = ob.orbitCenter.x;
    const cz = ob.orbitCenter.z;
    const x = ob.orbitEllipse
      ? cx + ob.orbitEllipse.centerOffset + Math.cos(angle) * ob.orbitEllipse.semiMajor
      : cx + Math.cos(angle) * ob.orbitRadius;
    const z = ob.orbitEllipse
      ? cz + Math.sin(angle) * ob.orbitEllipse.semiMinor
      : cz + Math.sin(angle) * ob.orbitRadius;
    ob.mesh.position.set(x, 0, z);
    if (ob.label) ob.label.position.set(x, ob.labelOffsetY, z);
    if (ob.scoreLabel) ob.scoreLabel.position.set(x, ob.scoreLabelOffsetY, z);
    if (ob.innerGlow) ob.innerGlow.position.set(x, 0, z);
    if (ob.outerGlow) ob.outerGlow.position.set(x, 0, z);
    if (ob.saturnRing) ob.saturnRing.position.set(x, 0, z);
    if (ob.controlSphere) ob.controlSphere.position.set(x, 0, z);
    // Comet tail — points radially away from center, fades out
    if (ob.cometTail) {
      const dx = x - cx;
      const dz = z - cz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const dirX = dist > 0 ? dx / dist : 1;
      const dirZ = dist > 0 ? dz / dist : 0;
      const tailLen = ob.cometTail.userData.tailLength;
      const pts = ob.cometTail.geometry.attributes.position;
      const segments = pts.count;
      for (let i = 0; i < segments; i++) {
        const t = i / (segments - 1);
        const spread = t * 0.15;
        pts.setXYZ(i,
          x + dirX * tailLen * t + (Math.sin(t * 7 + orbitSimDays * 0.1) * spread),
          (Math.sin(t * 5 + orbitSimDays * 0.2) * spread * 0.5),
          z + dirZ * tailLen * t + (Math.cos(t * 7 + orbitSimDays * 0.1) * spread)
        );
      }
      pts.needsUpdate = true;
    }
  }

  // Second pass: update moons (parentMesh !== null) — their center follows parent
  for (const ob of orbitingBodies) {
    if (!ob.parentMesh) continue;
    const parentPos = ob.parentMesh.position;
    const angularVel = (ob.periodDays > 0) ? TWO_PI / ob.periodDays : 0;
    const angle = ob.startAngle + angularVel * orbitSimDays;
    const x = parentPos.x + Math.cos(angle) * ob.orbitRadius;
    const z = parentPos.z + Math.sin(angle) * ob.orbitRadius;
    ob.mesh.position.set(x, parentPos.y, z);
    if (ob.label) ob.label.position.set(x, parentPos.y + ob.labelOffsetY, z);
    if (ob.scoreLabel) ob.scoreLabel.position.set(x, parentPos.y + ob.scoreLabelOffsetY, z);
    if (ob.orbitRing) ob.orbitRing.position.copy(parentPos);
  }
}

// ── Ship 3D rendering ───────────────────────────────────────────────

function getStarWorldPos(starId) {
  const s = starById.get(starId);
  if (!s) return null;
  return toWorld(s.xyz);
}

// ── Ship geometry factory ───────────────────────────────────────────

function createShipGeometry(shipClass) {
  switch (shipClass) {
    case "satellite":         return new THREE.OctahedronGeometry(0.10, 0);
    case "shuttle":           return new THREE.ConeGeometry(0.07, 0.22, 6);
    case "construction":      return new THREE.BoxGeometry(0.16, 0.10, 0.24);
    case "science":           return new THREE.ConeGeometry(0.09, 0.28, 6);
    case "corvette":          return new THREE.TetrahedronGeometry(0.12, 0);
    case "frigate":           return new THREE.BoxGeometry(0.14, 0.07, 0.30);
    case "destroyer":         return new THREE.ConeGeometry(0.11, 0.34, 5);
    case "cruiser":           return new THREE.DodecahedronGeometry(0.16, 0);
    case "battleship":        return new THREE.IcosahedronGeometry(0.20, 0);
    case "carrier":           return new THREE.BoxGeometry(0.28, 0.08, 0.40);
    case "freighter":         return new THREE.BoxGeometry(0.20, 0.14, 0.30);
    case "explorer":          return new THREE.ConeGeometry(0.09, 0.34, 6);
    case "colony_ship":       return new THREE.SphereGeometry(0.22, 12, 8);
    case "shipyard":          return new THREE.BoxGeometry(0.38, 0.12, 0.38);
    case "starbase":          return new THREE.OctahedronGeometry(0.26, 1);
    case "station":           return new THREE.TorusKnotGeometry(0.16, 0.04, 32, 6);
    case "defense_platform":  return new THREE.OctahedronGeometry(0.16, 0);
    case "megastructure":     return new THREE.TorusGeometry(0.32, 0.035, 8, 36);
    case "asteroid":          return new THREE.DodecahedronGeometry(0.12, 0);
    default:                  return new THREE.SphereGeometry(0.14, 12, 8);
  }
}

function getShipColor(shipClass) {
  const cls = shipClasses[shipClass];
  if (!cls) return 0x40e0d0;
  switch (cls.category) {
    case "military":  return 0xff6565;
    case "civilian":  return 0x68a8ff;
    case "support":   return 0xb9bdc5;
    case "starbase":  return 0x72d6c9;
    case "asteroid":  return 0xc8b070;
    default:          return 0x40e0d0;
  }
}

function getShipBuildingColor(shipClass) {
  const cls = shipClasses[shipClass];
  if (!cls) return 0x555555;
  switch (cls.category) {
    case "military":  return 0x803030;
    case "civilian":  return 0x304880;
    case "starbase":  return 0x306060;
    default:          return 0x555555;
  }
}

function shipVisualScale(ship, selected, base = 1.15) {
  const inCurrentSystem = inSystemView && systemViewStar
    && [ship.locationStarId, ship.destinationStarId].includes(systemViewStar.id);
  const systemFactor = inCurrentSystem ? 0.24 : 1;
  return base * (selected ? 1.25 : 1) * systemFactor;
}

function disposeShipRoute(group) {
  if (!group) return;
  shipRouteLayer.remove(group);
  disposeObject(group);
}

function shipDestinationWorldPoint(ship) {
  if (ship.destinationPoint) return ship.destinationPoint;
  if (ship.destinationStarId) {
    const pos = getStarWorldPos(ship.destinationStarId);
    return pos ? vectorToArray(pos) : null;
  }
  return null;
}

function createRouteArrow(from, to, color, selected) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  if (len <= 0.000001) return null;
  dir.normalize();
  const group = new THREE.Group();
  const material = new THREE.LineDashedMaterial({
    color,
    dashSize: selected ? 0.55 : 0.45,
    gapSize: selected ? 0.25 : 0.32,
    transparent: true,
    opacity: selected ? 0.95 : 0.62,
  });
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]), material);
  line.computeLineDistances();
  group.add(line);

  const arrowCount = Math.min(4, Math.max(1, Math.floor(len / 5)));
  const arrowGeometry = new THREE.ConeGeometry(selected ? 0.16 : 0.12, selected ? 0.42 : 0.32, 8);
  const arrowMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: selected ? 0.95 : 0.72 });
  for (let i = 1; i <= arrowCount; i++) {
    const t = Math.min(0.92, i / (arrowCount + 1));
    const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
    arrow.position.copy(from).lerp(to, t);
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    group.add(arrow);
  }
  return group;
}

function createOrbitRouteRing(orbit, color, selected) {
  if (!orbit?.centerPoint || !(orbit.radiusLy > 0)) return null;
  const center = orbit.centerPoint;
  const points = [];
  const segments = 96;
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(
      center[0] + Math.cos(angle) * orbit.radiusLy,
      center[1],
      center[2] + Math.sin(angle) * orbit.radiusLy
    ));
  }
  const material = new THREE.LineDashedMaterial({
    color,
    dashSize: selected ? 0.18 : 0.14,
    gapSize: selected ? 0.10 : 0.12,
    transparent: true,
    opacity: selected ? 0.82 : 0.48,
  });
  const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
  ring.computeLineDistances();
  return ring;
}

function updateShipRoutes() {
  const liveIds = new Set();
  for (const ship of ships) {
    const destination = shipDestinationWorldPoint(ship);
    const start = shipCurrentPoint(ship);
    const shouldDrawTravel = ship.state === "traveling" && destination && start;
    const orbitPlan = ship.pendingOrbit || ship.orbit;
    const shouldDrawOrbit = orbitPlan?.centerPoint && orbitPlan.radiusLy > 0;
    liveIds.add(ship.id);
    const old = shipRouteObjects.get(ship.id);
    if (old) {
      disposeShipRoute(old);
      shipRouteObjects.delete(ship.id);
    }
    const selected = selectedShipIds.has(ship.id);
    const color = selected ? 0xffffff : getShipColor(ship.shipClass);
    const route = new THREE.Group();
    if (shouldDrawTravel) {
      const from = new THREE.Vector3(start[0], start[1], start[2]);
      const to = new THREE.Vector3(destination[0], destination[1], destination[2]);
      if (from.distanceTo(to) >= 0.00001) {
        const arrow = createRouteArrow(from, to, color, selected);
        if (arrow) route.add(arrow);
      }
    }
    let queueStart = destination || start;
    for (const waypoint of ship.routeQueue || []) {
      if (!queueStart || !waypoint?.point) continue;
      const from = new THREE.Vector3(queueStart[0], queueStart[1], queueStart[2]);
      const to = new THREE.Vector3(waypoint.point[0], waypoint.point[1], waypoint.point[2]);
      if (from.distanceTo(to) >= 0.00001) {
        const arrow = createRouteArrow(from, to, color, selected);
        if (arrow) route.add(arrow);
      }
      queueStart = waypoint.point;
    }
    if (shouldDrawOrbit) {
      const ring = createOrbitRouteRing(orbitPlan, color, selected);
      if (ring) route.add(ring);
    }
    if (!route.children.length) continue;
    route.userData.shipRouteId = ship.id;
    route.traverse((child) => {
      child.userData.shipRouteId = ship.id;
      child.userData.ship = ship;
    });
    shipRouteLayer.add(route);
    shipRouteObjects.set(ship.id, route);
  }
  for (const [id, group] of shipRouteObjects) {
    if (!liveIds.has(id) || !findShip(id)) {
      disposeShipRoute(group);
      shipRouteObjects.delete(id);
    }
  }
}

function updateShipMeshes() {
  for (const ship of ships) {
    let entry = shipMeshes.get(ship.id);
    // Create mesh if needed
    if (!entry) {
      const cls = ship.classInfo;
      const baseColor = ship.state === "building" ? getShipBuildingColor(ship.shipClass) : getShipColor(ship.shipClass);
      const geo = createShipGeometry(ship.shipClass);
      const mat = new THREE.MeshBasicMaterial({ color: baseColor, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.ship = ship;
      mesh.userData.isShipMesh = true;
      const labelColor = "#" + new THREE.Color(getShipColor(ship.shipClass)).getHexString();
      const labelText = `${cls.icon} ${ship.name}`;
      const label = makeTextSprite(labelText, labelColor, 18);
      label.position.set(0, 0.35, 0);
      starLayer.add(mesh);
      labelLayer.add(label);
      entry = { mesh, label, trail: null, lastPositions: [], labelText };
      shipMeshes.set(ship.id, entry);
    }
    const cls = ship.classInfo;
    const nextLabelText = `${cls.icon} ${ship.name}`;
    if (entry.labelText !== nextLabelText) {
      labelLayer.remove(entry.label);
      entry.label?.material?.map?.dispose?.();
      entry.label?.material?.dispose?.();
      const labelColor = "#" + new THREE.Color(getShipColor(ship.shipClass)).getHexString();
      entry.label = makeTextSprite(nextLabelText, labelColor, 18);
      labelLayer.add(entry.label);
      entry.labelText = nextLabelText;
    }
    const isSelected = selectedShipIds.has(ship.id);
    // Compute label scale: shrink in system view + respect global labelScaleFactor
    const inCurrentSystem = inSystemView && systemViewStar
      && [ship.locationStarId, ship.destinationStarId].includes(systemViewStar.id);
    const shipLabelFactor = (inCurrentSystem ? 0.28 : 1) * labelScaleFactor;
    const labelYOff = inCurrentSystem ? 0.12 : 0.35;
    // Update position
    if (ship.state === "traveling") {
      const pos = shipWorldPosition(ship, getStarWorldPos);
      if (pos) {
        entry.mesh.position.set(pos.x, pos.y, pos.z);
        entry.label.position.set(pos.x, pos.y + labelYOff, pos.z);
        entry.mesh.visible = true;
        entry.label.visible = true;
        entry.mesh.material.color.setHex(isSelected ? 0xffffff : getShipColor(ship.shipClass));
        entry.mesh.scale.setScalar(shipVisualScale(ship, isSelected, 1.15));
        // Scale label
        if (entry.label.userData.baseScaleX) entry.label.scale.set(entry.label.userData.baseScaleX * shipLabelFactor, entry.label.userData.baseScaleY * shipLabelFactor, 1);
        // Update trail (reuse pre-allocated buffer for perf)
        entry.lastPositions.push(new THREE.Vector3(pos.x, pos.y, pos.z));
        if (entry.lastPositions.length > 80) entry.lastPositions.shift();
        if (entry.lastPositions.length > 2) {
          if (!entry.trail) {
            const trailColor = getShipColor(ship.shipClass);
            const maxTrail = 80;
            const posArr = new Float32Array(maxTrail * 3);
            const tGeo = new THREE.BufferGeometry();
            tGeo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
            tGeo.setDrawRange(0, 0);
            entry.trail = new THREE.Line(tGeo, new THREE.LineBasicMaterial({ color: trailColor, transparent: true, opacity: 0.3 }));
            starLayer.add(entry.trail);
          }
          const posAttr = entry.trail.geometry.getAttribute("position");
          const n = entry.lastPositions.length;
          for (let i = 0; i < n; i++) {
            posAttr.array[i * 3] = entry.lastPositions[i].x;
            posAttr.array[i * 3 + 1] = entry.lastPositions[i].y;
            posAttr.array[i * 3 + 2] = entry.lastPositions[i].z;
          }
          posAttr.needsUpdate = true;
          entry.trail.geometry.setDrawRange(0, n);
        }
      }
    } else if (ship.state === "building") {
      const pos = getStarWorldPos(ship.locationStarId);
      if (pos) {
        const offset = (ships.indexOf(ship) % 5) * 0.5 + 0.6;
        entry.mesh.position.set(pos.x + offset, pos.y + 0.3, pos.z);
        entry.label.position.set(pos.x + offset, pos.y + 0.3 + labelYOff, pos.z);
      }
      entry.mesh.material.color.setHex(isSelected ? 0x888888 : getShipBuildingColor(ship.shipClass));
      entry.mesh.material.opacity = 0.4 + ship.buildProgressFrac * 0.5;
      entry.mesh.scale.setScalar(shipVisualScale(ship, isSelected, 1.05));
      entry.mesh.visible = true;
      entry.label.visible = true;
      if (entry.label.userData.baseScaleX) entry.label.scale.set(entry.label.userData.baseScaleX * shipLabelFactor, entry.label.userData.baseScaleY * shipLabelFactor, 1);
    } else {
      // idle — parked at location (starbase stays at star)
      const posObj = shipWorldPosition(ship, getStarWorldPos);
      if (posObj) {
        const anchoredToStar = Boolean(ship.locationStarId);
        const offset = anchoredToStar ? (ship.classInfo.category === "starbase" ? 0.8 : (ships.indexOf(ship) % 5) * 0.5 + 0.6) : 0;
        const yOff = ship.classInfo.category === "starbase" ? 0.5 : 0.3;
        entry.mesh.position.set(posObj.x + offset, posObj.y + yOff, posObj.z);
        entry.label.position.set(posObj.x + offset, posObj.y + yOff + labelYOff, posObj.z);
      }
      entry.mesh.material.color.setHex(isSelected ? 0xffffff : getShipColor(ship.shipClass));
      entry.mesh.material.opacity = 0.9;
      entry.mesh.scale.setScalar(shipVisualScale(ship, isSelected, 1.15));
      entry.mesh.visible = true;
      entry.label.visible = true;
      if (entry.label.userData.baseScaleX) entry.label.scale.set(entry.label.userData.baseScaleX * shipLabelFactor, entry.label.userData.baseScaleY * shipLabelFactor, 1);
    }
    // Rotate ship mesh slightly for visual interest
    entry.mesh.rotation.y += 0.005;
    if (ship.shipClass === "starbase" || ship.shipClass === "defense_platform") {
      entry.mesh.rotation.x += 0.003;
    }
  }
  // Remove meshes for deleted ships
  for (const [id, entry] of shipMeshes) {
    if (!findShip(id)) {
      starLayer.remove(entry.mesh);
      labelLayer.remove(entry.label);
      if (entry.trail) { starLayer.remove(entry.trail); entry.trail.geometry.dispose(); }
      entry.mesh.geometry.dispose();
      entry.mesh.material.dispose();
      const route = shipRouteObjects.get(id);
      if (route) {
        disposeShipRoute(route);
        shipRouteObjects.delete(id);
      }
      shipMeshes.delete(id);
    }
  }
  updateShipRoutes();
}

// ── Fleet panel ─────────────────────────────────────────────────────

function buildShipControlPanel() {
  const classSelect = document.querySelector("#shipClassSelect");
  const palette = document.querySelector("#shipClassPalette");
  const locationInput = document.querySelector("#shipLocationInput");
  const destinationInput = document.querySelector("#shipDestinationInput");
  const nameInput = document.querySelector("#shipNameInput");
  const factionInput = document.querySelector("#shipFactionInput");
  const speedInput = document.querySelector("#shipSpeedInput");
  const factionNames = document.querySelector("#shipFactionNames");
  const factionFilter = document.querySelector("#shipFactionFilter");
  const typeFilter = document.querySelector("#shipTypeFilter");
  const deployBtn = document.querySelector("#deployShipBtn");
  const buildBtn = document.querySelector("#buildShipBtn");
  const moveBtn = document.querySelector("#moveShipBtn");
  if (!classSelect) return;

  const classEntries = Object.entries(shipClasses)
    .sort((a, b) => (shipCategories[a[1].category]?.order ?? 99) - (shipCategories[b[1].category]?.order ?? 99));
  classSelect.innerHTML = classEntries
    .map(([id, cls]) => `<option value="${escapeHtml(id)}">${escapeHtml(cls.icon)} ${escapeHtml(cls.label)}</option>`)
    .join("");
  if (typeFilter) {
    typeFilter.querySelectorAll("option:not([value='all'])").forEach((option) => option.remove());
    classEntries.forEach(([id, cls]) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = `${cls.icon} ${cls.label}`;
      typeFilter.appendChild(option);
    });
    typeFilter.addEventListener("change", updateFleetPanel);
  }
  const factionOptions = Array.from(new Set([...Object.keys(factionColors), ...stars.map((star) => star.faction).filter(Boolean)]))
    .filter((faction) => faction !== "无/无所属")
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  if (factionNames) {
    factionNames.innerHTML = factionOptions.map((faction) => `<option value="${escapeHtml(faction)}"></option>`).join("");
  }
  if (factionFilter) {
    factionFilter.innerHTML = factionOptions.map((faction) => `<option value="${escapeHtml(faction)}">${escapeHtml(faction)}</option>`).join("");
    factionFilter.addEventListener("change", updateFleetPanel);
  }
  if (locationInput && !locationInput.value) locationInput.value = "sol";
  if (destinationInput && !destinationInput.value) destinationInput.value = "gj1002";

  if (palette) {
    palette.innerHTML = classEntries
      .map(([id, cls]) => `<button class="ship-class-chip" data-ship-class="${escapeHtml(id)}" type="button" title="${escapeHtml(cls.label)}">${escapeHtml(cls.icon)}</button>`)
      .join("");
    palette.querySelectorAll(".ship-class-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        classSelect.value = chip.dataset.shipClass;
        palette.querySelectorAll(".ship-class-chip").forEach((el) => el.classList.toggle("active", el === chip));
      });
    });
    palette.querySelector(".ship-class-chip")?.classList.add("active");
  }

  function createFromControls(instant) {
    const target = resolveNavTarget(locationInput?.value || selectedStar?.id || "sol");
    if (!target?.point && !target?.starId) {
      writeAgentOutput("起点未找到。可填写恒星系、内部天体或舰船名。");
      return null;
    }
    const typedFaction = factionInput?.value?.trim();
    const shipSpeed = parseShipSpeedSpec(speedInput?.value, undefined);
    const ship = createShip({
      name: nameInput?.value || undefined,
      shipClass: classSelect.value,
      locationStarId: target.starId,
      locationBodyId: target.bodyId,
      locationPoint: target.type === "star" ? null : target.point,
      faction: typedFaction || "无/无所属",
      travelSpeed: shipSpeed,
      instant,
      buildStartDay: totalSimDays,
    });
    ship.buildStartDay = totalSimDays;
    selectShip(ship);
    updateShipMeshes();
    updateFleetPanel();
    refreshNavObjectDatalist();
    writeAgentOutput({ action: instant ? "deployShip" : "buildShip", ship: shipInfo(ship) });
    return ship;
  }

  deployBtn?.addEventListener("click", () => createFromControls(true));
  buildBtn?.addEventListener("click", () => createFromControls(false));
  moveBtn?.addEventListener("click", (event) => {
    const targets = selectedShips();
    const dest = resolveNavTarget(destinationInput?.value || "");
    if (!targets.length || !dest?.point) {
      writeAgentOutput("先选择舰船并填写有效目的地。目的地可为恒星、天体或舰船。");
      return;
    }
    const routeOpts = { appendRoute: event.ctrlKey, patrol: event.shiftKey };
    if (dest.type === "star") commandShipsToStar(targets, dest.starId, routeOpts);
    else commandShipsToPoint(targets, dest.point, dest.label, { ...routeOpts, destinationStarId: dest.starId, destinationBodyId: dest.bodyId });
  });

  document.querySelectorAll(".fleet-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.fleetTab;
      document.querySelectorAll(".fleet-tab").forEach((el) => el.classList.toggle("active", el === tab));
      document.querySelectorAll(".fleet-tab-panel").forEach((panel) => {
        panel.classList.toggle("active", panel.id === `shipTab${target[0].toUpperCase()}${target.slice(1)}`);
      });
    });
  });

  document.querySelectorAll(".command-mode").forEach((btn) => {
    btn.addEventListener("click", () => {
      shipCommandMode = btn.dataset.commandMode || "move";
      syncInputPanels();
      updateFleetPanel();
    });
  });
  document.querySelector("#orbitMouseAdjustToggle")?.addEventListener("change", (event) => {
    orbitMouseAdjustEnabled = Boolean(event.target.checked);
    syncInputPanels();
  });

  document.querySelector("#createFleetBtn")?.addEventListener("click", () => {
    const ids = selectedShips().map((ship) => ship.id);
    if (ids.length < 2) {
      writeAgentOutput("至少选择两艘舰船才能编成舰队。");
      return;
    }
    const fleet = createFleet(ids);
    updateFleetPanel();
    if (fleet) showFleetInfoPanel(fleet);
    writeAgentOutput({ action: "createFleet", fleet });
  });

  document.querySelector("#cycleFleetShipBtn")?.addEventListener("click", cycleSelectedFleetShip);
  document.querySelector("#fleetBulkToggle")?.addEventListener("click", () => {
    fleetBulkMode = !fleetBulkMode;
    updateFleetPanel();
  });
  document.querySelector("#fleetBulkDeleteBtn")?.addEventListener("click", () => {
    const fleetList = document.querySelector("#fleetList");
    const selectedRows = fleetList ? Array.from(fleetList.querySelectorAll(".fleet-row.selected")) : [];
    const idsToDelete = selectedRows.map((row) => row.dataset.fleetId).filter(Boolean);
    if (idsToDelete.length === 0) return writeAgentOutput("先在舰队列表中点击选择要删除的舰队。");
    if (!confirm(`确认删除 ${idsToDelete.length} 支舰队？（舰船不会被删除）`)) return;
    for (const id of idsToDelete) {
      const idx = fleets.findIndex((f) => f.id === id);
      if (idx >= 0) fleets.splice(idx, 1);
      closeFleetShipWindow(id);
    }
    if (idsToDelete.includes(selectedFleetId)) selectedFleetId = null;
    normalizeFleets();
    updateFleetPanel();
    refreshFleetWindows();
  });
  document.querySelector("#shipBulkToggle")?.addEventListener("click", () => {
    shipBulkMode = !shipBulkMode;
    updateFleetPanel();
  });
  document.querySelector("#bulkFleetBtn")?.addEventListener("click", () => {
    const sel = selectedShips();
    if (sel.length === 0) return writeAgentOutput("先选择至少一艘舰船。");
    if (sel.length < 2) return writeAgentOutput("至少选择两艘舰船才能编成舰队。");
    const prefill = document.querySelector("#bulkFactionInput")?.value?.trim() || "";
    const name = prompt("舰队名称：", prefill || `舰队-${fleets.length + 1}`);
    if (name === null) return;
    const fleet = createFleet(sel.map((s) => s.id), name.trim() || undefined);
    updateFleetPanel();
    if (fleet) showFleetInfoPanel(fleet);
  });
  document.querySelector("#bulkFactionBtn")?.addEventListener("click", () => {
    const sel = selectedShips();
    if (sel.length === 0) return writeAgentOutput("先选择至少一艘舰船。");
    const prefill = document.querySelector("#bulkFactionInput")?.value?.trim() || "";
    const faction = prompt("设置势力名称：", prefill);
    if (faction === null) return;
    const finalFaction = faction.trim() || "无/无所属";
    sel.forEach((ship) => { ship.faction = finalFaction; });
    document.querySelector("#bulkFactionInput").value = finalFaction;
    updateFleetPanel();
    updateShipInfoPanel(findShip(selectedShipId));
    refreshFleetWindows();
  });
  document.querySelector("#bulkSpeedBtn")?.addEventListener("click", () => {
    const sel = selectedShips();
    if (sel.length === 0) return writeAgentOutput("先选择至少一艘舰船。");
    const prefill = document.querySelector("#bulkSpeedInput")?.value?.trim() || "";
    const input = prompt("设置速度（如 0.4c / 1ly/sec / 1000000km/hour）：", prefill);
    if (input === null) return;
    const speed = parseShipSpeedSpec(input, null);
    if (!(speed > 0)) return writeAgentOutput("速度格式无效，例如 0.4c、1ly/sec、1000000km/hour。");
    sel.forEach((ship) => { ship.travelSpeed = speed; });
    document.querySelector("#bulkSpeedInput").value = input;
    updateFleetPanel();
    updateShipInfoPanel(findShip(selectedShipId));
    refreshFleetWindows();
  });
  document.querySelector("#bulkDeleteBtn")?.addEventListener("click", () => {
    const sel = selectedShips();
    if (sel.length === 0) return writeAgentOutput("先选择至少一艘舰船。");
    if (!confirm(`确认删除 ${sel.length} 艘舰船？`)) return;
    sel.forEach((s) => removeShip(s.id));
    setSelectedShips([]);
    normalizeFleets();
    updateShipMeshes();
    updateFleetPanel();
    refreshFleetWindows();
  });
}

function buildFleetPanel() {
  const panel = document.querySelector("#fleetPanel");
  const toggle = document.querySelector("#fleetPanelToggle");
  if (!panel || !toggle) return;
  toggle.addEventListener("click", () => {
    panel.classList.toggle("collapsed");
    toggle.textContent = panel.classList.contains("collapsed") ? "☰" : "×";
  });
  panel.addEventListener("click", (event) => {
    const interactive = event.target.closest("button,input,select,.ship-row,.fleet-row");
    if (!interactive && activeFaction !== "all") selectShipsByFaction(activeFaction);
  });
  buildShipControlPanel();
  updateFleetPanel();
}

// ── Virtual scrolling for ship list ───────────────────────────────────
const SHIP_ROW_HEIGHT = 35; // 32px min-height + 3px gap
const SHIP_VIRTUAL_BUFFER = 8; // extra rows above/below viewport

let _vsFilteredShips = []; // cached reference for scroll handler
let _vsScrollHandler = null; // to avoid re-binding

function renderVirtualShipList(container, filteredShips) {
  _vsFilteredShips = filteredShips;
  const total = filteredShips.length;
  if (total === 0) {
    container.innerHTML = `<div style="color:var(--muted);font-size:12px;padding:4px 0;">暂无舰船</div>`;
    container.style.position = "";
    return;
  }
  // For small lists, skip virtualization overhead
  if (total <= 50) {
    container.style.position = "";
    container.innerHTML = filteredShips.map((ship) => _shipRowHtml(ship)).join("");
    _bindShipListEvents(container);
    return;
  }
  // Virtual scroll mode
  container.style.position = "relative";
  const totalHeight = total * SHIP_ROW_HEIGHT;
  // Use a sentinel to set scroll height
  container.innerHTML = `<div class="vs-sentinel" style="height:${totalHeight}px;pointer-events:none;"></div><div class="vs-viewport" style="position:absolute;top:0;left:0;right:0;"></div>`;
  const viewport = container.querySelector(".vs-viewport");

  function renderVisibleRows() {
    const scrollTop = container.scrollTop;
    const viewHeight = container.clientHeight;
    const startIdx = Math.max(0, Math.floor(scrollTop / SHIP_ROW_HEIGHT) - SHIP_VIRTUAL_BUFFER);
    const endIdx = Math.min(total, Math.ceil((scrollTop + viewHeight) / SHIP_ROW_HEIGHT) + SHIP_VIRTUAL_BUFFER);
    viewport.style.top = `${startIdx * SHIP_ROW_HEIGHT}px`;
    let html = "";
    for (let i = startIdx; i < endIdx; i++) {
      html += _shipRowHtml(_vsFilteredShips[i]);
    }
    viewport.innerHTML = html;
    _bindShipListEvents(viewport);
  }

  // Remove old scroll listener, add new one
  if (_vsScrollHandler) container.removeEventListener("scroll", _vsScrollHandler);
  _vsScrollHandler = renderVisibleRows;
  container.addEventListener("scroll", _vsScrollHandler, { passive: true });
  renderVisibleRows();
}

function _shipRowHtml(ship) {
  const cls = ship.classInfo;
  const selected = selectedShipIds.has(ship.id) ? " selected" : "";
  return `<div class="ship-row${selected}" data-ship-id="${escapeHtml(ship.id)}" title="${escapeHtml(cls.label)} · ${escapeHtml(ship.name)}">
    <span class="ship-row-icon">${escapeHtml(cls.icon)}</span>
    <span class="ship-row-name">${escapeHtml(ship.name)}</span>
    <span class="ship-row-faction">${escapeHtml(ship.faction || "无所属")}</span>
    <span class="ship-row-location">${escapeHtml(describeShipLocation(ship))}</span>
    <button class="ship-row-camera" data-camera-ship-id="${escapeHtml(ship.id)}" type="button" title="定位并跟随">⌕</button>
  </div>`;
}

function _bindShipListEvents(container) {
  container.querySelectorAll(".ship-row").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest(".ship-row-camera")) return;
      const ship = findShip(row.dataset.shipId);
      if (!ship) return;
      if (shipBulkMode || event.shiftKey || event.ctrlKey) {
        const ids = new Set(selectedShipIds);
        if (ids.has(ship.id)) ids.delete(ship.id);
        else ids.add(ship.id);
        setSelectedShips(Array.from(ids), { primaryId: ship.id });
      } else {
        selectShip(ship);
      }
    });
    row.addEventListener("dblclick", () => {
      const ship = findShip(row.dataset.shipId);
      if (ship) zoomToShip(ship);
    });
  });
  container.querySelectorAll(".ship-row-camera").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const ship = findShip(btn.dataset.cameraShipId);
      if (!ship) return;
      followShipId = ship.id;
      zoomToShip(ship);
    });
  });
}

function updateFleetPanel() {
  normalizeFleets();
  refreshNavObjectDatalist();
  const shipList = document.querySelector("#shipList");
  const fleetList = document.querySelector("#fleetList");
  const count = document.querySelector("#shipSelectionCount");
  const moveBtn = document.querySelector("#moveShipBtn");
  const typeFilter = document.querySelector("#shipTypeFilter");
  const factionFilter = document.querySelector("#shipFactionFilter");
  const selectedFactions = factionFilter
    ? Array.from(factionFilter.selectedOptions).map((option) => option.value)
    : [];
  const wantedClass = typeFilter?.value || "all";
  document.querySelector("#shipBulkPanel")?.style.setProperty("display", shipBulkMode ? "grid" : "none");
  document.querySelector("#shipBulkToggle")?.classList.toggle("active", shipBulkMode);
  const filteredShips = ships.filter((ship) => {
    if (selectedFactions.length && !selectedFactions.includes(ship.faction)) return false;
    if (wantedClass !== "all" && ship.shipClass !== wantedClass) return false;
    return true;
  });

  if (count) count.textContent = `${selectedShipIds.size}/${ships.length}`;
  if (moveBtn) moveBtn.disabled = selectedShipIds.size === 0;

  if (shipList) {
    renderVirtualShipList(shipList, filteredShips);
  }

  // Fleet bulk panel
  const fleetBulkPanel = document.querySelector("#fleetBulkPanel");
  if (fleetBulkPanel) fleetBulkPanel.style.display = fleetBulkMode ? "grid" : "none";
  document.querySelector("#fleetBulkToggle")?.classList.toggle("active", fleetBulkMode);

  if (fleetList) {
    const selectedFleetIds = new Set();
    fleetList.innerHTML = fleets.length ? fleets.map((fleet) => {
      const selected = selectedFleetId === fleet.id ? " selected" : "";
      return `<div class="fleet-row${selected}" data-fleet-id="${escapeHtml(fleet.id)}">
        <span class="fleet-row-icon" data-open-fleet-window="${escapeHtml(fleet.id)}" title="查看舰船列表">▥</span>
        <span class="fleet-row-name">${escapeHtml(fleet.name)}</span>
        <span class="fleet-row-count">${fleet.shipIds.length} 艘</span>
        <button class="fleet-row-camera" data-camera-fleet-id="${escapeHtml(fleet.id)}" type="button" title="定位舰队">⌕</button>
      </div>`;
    }).join("") : `<div style="color:var(--muted);font-size:12px;padding:4px 0;">暂无舰队</div>`;
    fleetList.querySelectorAll(".fleet-row").forEach((row) => {
      row.addEventListener("click", (event) => {
        if (event.target.closest(".fleet-row-camera") || event.target.closest("[data-open-fleet-window]")) return;
        if (fleetBulkMode) {
          row.classList.toggle("selected");
        } else {
          selectFleet(row.dataset.fleetId);
        }
      });
      row.addEventListener("dblclick", () => {
        selectFleet(row.dataset.fleetId);
        const first = selectedShips()[0];
        if (first) zoomToShip(first, { select: false });
      });
    });
    // Fleet icon click -> open fleet-specific ship window
    fleetList.querySelectorAll("[data-open-fleet-window]").forEach((icon) => {
      icon.style.cursor = "pointer";
      icon.addEventListener("click", (event) => {
        event.stopPropagation();
        openFleetShipWindow(icon.dataset.openFleetWindow);
      });
    });
    fleetList.querySelectorAll(".fleet-row-camera").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        selectFleet(btn.dataset.cameraFleetId);
        const first = selectedShips()[0];
        if (first) {
          followShipId = first.id;
          zoomToShip(first, { select: false });
        }
      });
    });
  }
}

// ── Fleet-specific ship windows ─────────────────────────────────────

function openFleetShipWindow(fleetId) {
  const fleet = fleets.find((f) => f.id === fleetId);
  if (!fleet) return;
  // If window already open, bring to front
  if (openFleetWindows.has(fleetId)) {
    const existing = openFleetWindows.get(fleetId);
    existing.style.zIndex = String(++fleetWindowZCounter);
    refreshSingleFleetWindow(fleetId);
    return;
  }
  const win = document.createElement("div");
  win.className = "fleet-ship-window";
  win.dataset.fleetId = fleetId;
  win.style.zIndex = String(++fleetWindowZCounter);
  // Position staggered
  const offset = openFleetWindows.size * 30;
  win.style.left = `${240 + offset}px`;
  win.style.top = `${120 + offset}px`;
  win.innerHTML = `
    <div class="fleet-ship-window-header">
      <span class="fleet-ship-window-title">${escapeHtml(fleet.name)}</span>
      <button class="panel-hide fleet-ship-window-close" type="button" title="隐藏">×</button>
    </div>
    <div class="fleet-ship-window-list" data-fleet-drop-target="${escapeHtml(fleetId)}"></div>
  `;
  document.querySelector("#app").appendChild(win);
  openFleetWindows.set(fleetId, win);
  // Make draggable
  makeFleetWindowDraggable(win, win.querySelector(".fleet-ship-window-header"));
  // Close button
  win.querySelector(".fleet-ship-window-close").addEventListener("click", () => {
    closeFleetShipWindow(fleetId);
  });
  // Enable drop target
  const dropZone = win.querySelector(".fleet-ship-window-list");
  dropZone.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; dropZone.classList.add("drag-over"); });
  dropZone.addEventListener("dragleave", () => { dropZone.classList.remove("drag-over"); });
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    const shipId = e.dataTransfer.getData("text/ship-id");
    const fromFleetId = e.dataTransfer.getData("text/from-fleet-id");
    if (!shipId) return;
    // Remove from old fleet
    if (fromFleetId) {
      const oldFleet = fleets.find((f) => f.id === fromFleetId);
      if (oldFleet) oldFleet.shipIds = oldFleet.shipIds.filter((id) => id !== shipId);
    }
    // Add to this fleet
    if (!fleet.shipIds.includes(shipId)) fleet.shipIds.push(shipId);
    normalizeFleets();
    updateFleetPanel();
    refreshFleetWindows();
  });
  refreshSingleFleetWindow(fleetId);
}

let fleetWindowZCounter = 50;

function closeFleetShipWindow(fleetId) {
  const win = openFleetWindows.get(fleetId);
  if (win) {
    win.remove();
    openFleetWindows.delete(fleetId);
  }
}

function refreshFleetWindows() {
  for (const [fleetId] of openFleetWindows) {
    refreshSingleFleetWindow(fleetId);
  }
}

function refreshSingleFleetWindow(fleetId) {
  const win = openFleetWindows.get(fleetId);
  if (!win) return;
  const fleet = fleets.find((f) => f.id === fleetId);
  if (!fleet) { closeFleetShipWindow(fleetId); return; }
  const title = win.querySelector(".fleet-ship-window-title");
  if (title) title.textContent = `${fleet.name} (${fleet.shipIds.length})`;
  const list = win.querySelector(".fleet-ship-window-list");
  if (!list) return;
  list.innerHTML = fleet.shipIds.map((id) => {
    const ship = findShip(id);
    if (!ship) return "";
    const cls = ship.classInfo;
    return `<div class="ship-row fleet-window-ship-row" draggable="true" data-ship-id="${escapeHtml(ship.id)}" data-from-fleet-id="${escapeHtml(fleetId)}" title="${escapeHtml(cls.label)} · ${escapeHtml(ship.name)}">
      <span class="ship-row-icon">${escapeHtml(cls.icon)}</span>
      <span class="ship-row-name">${escapeHtml(ship.name)}</span>
      <span class="ship-row-faction">${escapeHtml(ship.faction || "无所属")}</span>
      <span class="ship-row-location">${escapeHtml(describeShipLocation(ship))}</span>
      <button class="ship-row-camera" data-camera-ship-id="${escapeHtml(ship.id)}" type="button" title="定位并跟随">⌕</button>
    </div>`;
  }).join("") || `<div style="color:var(--muted);font-size:12px;padding:4px;">舰队为空</div>`;
  // Bind drag start
  list.querySelectorAll(".fleet-window-ship-row").forEach((row) => {
    row.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/ship-id", row.dataset.shipId);
      e.dataTransfer.setData("text/from-fleet-id", row.dataset.fromFleetId);
      e.dataTransfer.effectAllowed = "move";
      row.classList.add("dragging");
    });
    row.addEventListener("dragend", (e) => {
      row.classList.remove("dragging");
      // If dropped on star map (not on a fleet window), remove from fleet
      if (e.dataTransfer.dropEffect === "none") {
        const fromFleetId = row.dataset.fromFleetId;
        const shipId = row.dataset.shipId;
        const oldFleet = fleets.find((f) => f.id === fromFleetId);
        if (oldFleet) {
          oldFleet.shipIds = oldFleet.shipIds.filter((id) => id !== shipId);
          normalizeFleets();
          updateFleetPanel();
          refreshFleetWindows();
        }
      }
    });
    row.addEventListener("click", (e) => {
      if (e.target.closest(".ship-row-camera")) return;
      const ship = findShip(row.dataset.shipId);
      if (ship) selectShip(ship);
    });
    row.addEventListener("dblclick", () => {
      const ship = findShip(row.dataset.shipId);
      if (ship) zoomToShip(ship);
    });
  });
  list.querySelectorAll(".ship-row-camera").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const ship = findShip(btn.dataset.cameraShipId);
      if (!ship) return;
      followShipId = ship.id;
      zoomToShip(ship);
    });
  });
}

function makeFleetWindowDraggable(win, handle) {
  let drag = null;
  handle.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    const rect = win.getBoundingClientRect();
    drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, left: rect.left, top: rect.top };
    win.style.zIndex = String(++fleetWindowZCounter);
    handle.setPointerCapture?.(e.pointerId);
  });
  handle.addEventListener("pointermove", (e) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    win.style.left = `${Math.max(4, drag.left + e.clientX - drag.startX)}px`;
    win.style.top = `${Math.max(4, drag.top + e.clientY - drag.startY)}px`;
  });
  handle.addEventListener("pointerup", (e) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    handle.releasePointerCapture?.(e.pointerId);
    drag = null;
  });
}

// Enable star map as a drop target (remove from fleet)
function initStarMapDropTarget() {
  const mapEl = document.querySelector("#map");
  if (!mapEl) return;
  mapEl.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
  mapEl.addEventListener("drop", (e) => {
    e.preventDefault();
    const shipId = e.dataTransfer.getData("text/ship-id");
    const fromFleetId = e.dataTransfer.getData("text/from-fleet-id");
    if (!shipId || !fromFleetId) return;
    const oldFleet = fleets.find((f) => f.id === fromFleetId);
    if (oldFleet) {
      oldFleet.shipIds = oldFleet.shipIds.filter((id) => id !== shipId);
      normalizeFleets();
      updateFleetPanel();
      refreshFleetWindows();
    }
  });
}

// ── Ship info panel ─────────────────────────────────────────────────

function selectShip(ship) {
  setSelectedShips([ship.id], { primaryId: ship.id });
}

function deselectShip() {
  selectedShipIds.clear();
  selectedShipId = null;
  selectedFleetId = null;
  followShipId = null;
  hideShipInfoPanel();
  updateShipMeshes();
  updateShipRoutes();
  updateFleetPanel();
  updateShipCommandPanel();
}

function showShipInfoPanel(ship) {
  const panel = document.querySelector("#shipInfoPanel");
  if (!panel) return;
  if (uiVisibility.get("shipInfo") === false) return;
  if (selectedShipId && selectedShipId !== ship.id) shipInfoEditing = false;
  panel.style.display = "";
  selectedShipId = ship.id;
  selectedShipIds.add(ship.id);
  updateShipInfoPanel(ship);
}

function hideShipInfoPanel() {
  const panel = document.querySelector("#shipInfoPanel");
  if (panel) panel.style.display = "none";
  selectedShipId = null;
}

function showFleetInfoPanel(fleet) {
  const panel = document.querySelector("#shipInfoPanel");
  const title = document.querySelector("#shipInfoTitle");
  const content = document.querySelector("#shipInfoContent");
  const progressWrap = document.querySelector("#shipProgressWrap");
  if (!panel || !fleet) return;
  if (uiVisibility.get("shipInfo") === false) return;
  panel.style.display = "";
  if (title) title.textContent = `舰队 ${fleet.name}`;
  if (progressWrap) progressWrap.style.display = "none";
  const grouped = new Map();
  for (const id of fleet.shipIds) {
    const ship = findShip(id);
    if (!ship) continue;
    const key = ship.shipClass;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(ship);
  }
  if (content) {
    const rows = [];
    rows.push(`<div class="ship-info-row"><span class="si-key">舰船数</span><span class="si-val accent">${fleet.shipIds.length}</span></div>`);
    rows.push(`<div class="ship-info-row"><span class="si-key">当前命令</span><span class="si-val">${escapeHtml(shipCommandMode === "orbit" ? "右键入轨" : "右键移动")}</span></div>`);
    for (const [classId, groupShips] of grouped) {
      const cls = shipClasses[classId] || { label: classId, icon: "◆" };
      rows.push(`<div class="fleet-section"><div class="fleet-section-title">${escapeHtml(cls.icon)} ${escapeHtml(cls.label)} · ${groupShips.length}</div>`);
      rows.push(groupShips.map((ship) => `<button class="fleet-ship-link" data-ship-id="${escapeHtml(ship.id)}" type="button"><span>${escapeHtml(cls.icon)}</span><span>${escapeHtml(ship.name)}</span></button>`).join(""));
      rows.push(`</div>`);
    }
    content.innerHTML = rows.join("");
    content.querySelectorAll(".fleet-ship-link").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ship = findShip(btn.dataset.shipId);
        if (ship) selectShip(ship);
      });
    });
  }
}

function cycleSelectedFleetShip() {
  const fleet = selectedFleet();
  const pool = fleet ? fleet.shipIds.map(findShip).filter(Boolean) : selectedShips();
  if (!pool.length) return null;
  fleetCycleIndex = (fleetCycleIndex + 1) % pool.length;
  const ship = pool[fleetCycleIndex];
  setSelectedShips(pool.map((s) => s.id), { primaryId: ship.id, keepFleet: Boolean(fleet) });
  showShipInfoPanel(ship);
  zoomToShip(ship, { select: false });
  return ship;
}

function updateShipInfoPanel(ship) {
  if (!ship) return;
  const panel = document.querySelector("#shipInfoPanel");
  if (!panel || panel.style.display === "none") return;

  const cls = ship.classInfo;
  const info = shipInfo(ship);
  const title = document.querySelector("#shipInfoTitle");
  const content = document.querySelector("#shipInfoContent");
  const progressWrap = document.querySelector("#shipProgressWrap");
  const progressFill = document.querySelector("#shipProgressFill");
  const progressLabel = document.querySelector("#shipProgressLabel");

  if (title) title.textContent = `${cls.icon} ${ship.name}`;
  if (shipInfoEditing) return;

  const stateLabel = ship.state === "building" ? "建造中"
    : ship.state === "traveling" ? "航行中"
    : "停泊";

  const rows = [
    { k: "舰级", v: `${cls.icon} ${cls.label}`, accent: false },
    { k: "状态", v: stateLabel, accent: true },
    { k: "位置", v: info.location + (info.destination ? ` -> ${info.destination}` : ""), accent: false },
  ];

  if (ship.faction) rows.push({ k: "势力", v: ship.faction, accent: false });
  if (ship.notes) rows.push({ k: "备注", v: ship.notes, accent: false });
  if (ship.routeQueue?.length) rows.push({ k: "后续航段", v: `${ship.routeQueue.length} 段`, accent: true });
  rows.push({ k: "乘员", v: String(cls.crew), accent: false });
  rows.push({ k: "FTL", v: cls.ftl ? "是" : "否", accent: false });
  rows.push({ k: "最大速度", v: `${cls.maxSpeed}c`, accent: false });

  if (ship.state === "traveling") {
    rows.push({ k: "航速", v: `${ship.travelSpeed}c`, accent: true });
    rows.push({ k: "距离", v: `${info.distanceLy.toFixed(2)} ly`, accent: false });
    rows.push({ k: "ETA", v: formatElapsedTime(info.travelEtaDays), accent: true });
    rows.push({ k: "时间膨胀", v: info.timeDilation, accent: true });
    rows.push({ k: "船员经历时间", v: formatElapsedTime(info.crewElapsedDays), accent: true });
    if (ship.crewTotalProperDays > 0) {
      rows.push({ k: "累计固有时", v: formatElapsedTime(info.crewTotalDays), accent: false });
    }
  }

  if (ship.state === "building") {
    rows.push({ k: "剩余时间", v: formatElapsedTime(info.buildEtaDays), accent: true });
  }

  if (content) {
    content.innerHTML = rows.map((r) =>
      `<div class="ship-info-row"><span class="si-key">${escapeHtml(r.k)}</span><span class="si-val${r.accent ? " accent" : ""}">${escapeHtml(r.v)}</span></div>`
    ).join("");
  }

  // Progress bar
  if (progressWrap && progressFill && progressLabel) {
    if (ship.state === "building" || ship.state === "traveling") {
      progressWrap.style.display = "";
      const pct = ship.state === "building" ? ship.buildProgressFrac : ship.travelProgressFrac;
      progressFill.style.width = `${(pct * 100).toFixed(1)}%`;
      progressFill.style.background = ship.state === "building" ? "#ffc857" : "var(--accent)";
      progressLabel.textContent = `${(pct * 100).toFixed(1)}%`;
    } else {
      progressWrap.style.display = "none";
    }
  }
}

function openShipInfoEditor() {
  if (!selectedShipId) return;
  const ship = findShip(selectedShipId);
  if (!ship) return;
  const title = document.querySelector("#shipInfoTitle");
  const content = document.querySelector("#shipInfoContent");
  const progressWrap = document.querySelector("#shipProgressWrap");
  if (!content) return;
  shipInfoEditing = true;
  if (title) title.textContent = `编辑 ${ship.name}`;
  if (progressWrap) progressWrap.style.display = "none";
  renderInlineEditor(content, [
    { key: "name", label: "舰船名", value: ship.name },
    { key: "faction", label: "所属势力（留空为无所属）", value: ship.faction || "" },
    { key: "notes", label: "备注 Markdown", value: ship.notes || "", multiline: true },
  ], async (payload) => {
    if (!String(payload.faction || "").trim()) payload.faction = "无/无所属";
    await editShipInfo(ship.id, payload);
    Object.assign(ship, payload);
    shipInfoEditing = false;
    updateFleetPanel();
    updateShipMeshes();
    updateShipInfoPanel(ship);
  }, () => {
    shipInfoEditing = false;
    updateShipInfoPanel(ship);
  });
}

function zoomToShip(ship, opts = {}) {
  if (ship.state === "traveling") {
    const pos = shipWorldPosition(ship, getStarWorldPos);
    if (pos) {
      const target = new THREE.Vector3(pos.x, pos.y, pos.z);
      controls.target.copy(target);
      camera.position.set(target.x + 4, target.y + 3, target.z + 4);
    }
  } else {
    const pos = shipWorldPosition(ship, getStarWorldPos);
    if (pos) {
      const target = new THREE.Vector3(pos.x, pos.y, pos.z);
      controls.target.copy(target);
      camera.position.set(target.x + 4, target.y + 3, target.z + 4);
    }
  }
  if (opts.select !== false) selectShip(ship);
}

function showShipInfo(ship) {
  const info = shipInfo(ship);
  const cls = ship.classInfo;
  const rows = [];
  rows.push(`${cls.icon} <b>${ship.name}</b>  [${cls.label}]`);
  rows.push(`状态: ${ship.state === "building" ? "建造中" : ship.state === "traveling" ? "航行中" : "停泊"}`);
  rows.push(`位置: ${ship.locationStarId}${ship.destinationStarId ? " → " + ship.destinationStarId : ""}`);
  if (ship.state === "building") {
    rows.push(`建造进度: ${info.buildProgress}  剩余: ${formatElapsedTime(info.buildEtaDays)}`);
  }
  if (ship.state === "traveling") {
    rows.push(`航行进度: ${info.travelProgress}  距离: ${info.distanceLy.toFixed(2)} ly`);
    rows.push(`航速: ${ship.travelSpeed}c  ETA: ${formatElapsedTime(info.travelEtaDays)}`);
    rows.push(`时间膨胀: ${info.timeDilation}  船员经历: ${formatElapsedTime(info.crewElapsedDays)}`);
    rows.push(`船员累计固有时: ${formatElapsedTime(info.crewTotalDays)}`);
  }
  rows.push(`乘员: ${cls.crew}  FTL: ${cls.ftl ? "是" : "否"}  最大速度: ${cls.maxSpeed}c`);
  writeAgentOutput(rows.join("\n"));
  // Also show visual panel
  showShipInfoPanel(ship);
  return info;
}

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const delta = Math.min((now - lastFrameTime) / 1000, 0.08);
  lastFrameTime = now;
  updateFlyControls(delta);
  controls.update();

  // Global time advancement
  if (!timeFlowPaused && timeFlowDaysPerSec > 0) {
    const deltaDays = delta * timeFlowDaysPerSec;
    totalSimDays += deltaDays;

    // Orbit animation in system view
    if (activeSystemScaleRoot) {
      orbitSimDays += deltaDays;
      updateOrbitPositions();
    }

    // Ship ticks
    const events = tickShips(totalSimDays);
    for (const evt of events) {
      if (evt.type === "built") console.log(`🚀 ${evt.ship.name} 建造完成！`);
      if (evt.type === "arrived") console.log(`📍 ${evt.ship.name} 抵达 ${evt.ship.locationStarId}`);
    }
    updateShipMeshes();
    updateTimeHud();

    // Update fleet panel and ship info panel periodically (reduced frequency for large fleets)
    fleetPanelUpdateTimer += delta;
    const fleetUpdateInterval = ships.length > 50 ? 1.5 : ships.length > 20 ? 1.0 : 0.5;
    if (fleetPanelUpdateTimer > fleetUpdateInterval) {
      fleetPanelUpdateTimer = 0;
      if (ships.length > 0) updateFleetPanel();
      if (selectedFleetId && selectedFleet()) {
        showFleetInfoPanel(selectedFleet());
      } else if (selectedShipId) {
        const selShip = findShip(selectedShipId);
        if (selShip) updateShipInfoPanel(selShip);
        else deselectShip();
      }
      // Refresh fleet windows at same interval
      if (openFleetWindows.size > 0) refreshFleetWindows();
    }
  }

  // Camera-facing sprites (skip invisible halos for perf)
  const camQuat = camera.quaternion;
  for (let i = 0, len = stars.length; i < len; i++) {
    const halo = stars[i].halo;
    if (halo && halo.visible) halo.quaternion.copy(camQuat);
  }
  if (activeSystemScaleRoot) {
    activeSystemScaleRoot.traverse((child) => {
      if (child.userData.followCamera) child.quaternion.copy(camera.quaternion);
    });
  }

  // Camera follow ship
  if (followShipId) {
    const ship = ships.find((s) => s.id === followShipId);
    if (ship) {
      // Show ship info while following
      if (selectedShipId !== ship.id) selectShip(ship);
      let followPos = null;
      if (ship.state === "traveling") {
        const wpos = shipWorldPosition(ship, getStarWorldPos);
        if (wpos) followPos = new THREE.Vector3(wpos.x, wpos.y, wpos.z);
      } else {
        const spos = shipWorldPosition(ship, getStarWorldPos);
        if (spos) followPos = new THREE.Vector3(spos.x, spos.y, spos.z);
      }
      if (followPos) {
        controls.target.lerp(followPos, 0.05);
        const camOffset = new THREE.Vector3(3, 2, 3);
        camera.position.lerp(followPos.clone().add(camOffset), 0.03);
      }
    }
  }

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
  initStarMapDropTarget();
  exposeAgentApi();
  refreshSaveList();
  showDetails(selectedStar);
  updateVisibility();
  updateTimeHud();
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
