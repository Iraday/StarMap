/**
 * Spaceship system: construction, travel, FTL timing, movable asteroids,
 * and serializable runtime state for StarMap saves.
 */

export const shipCategories = {
  starbase: { label: "星港与巨构", order: 0 },
  military: { label: "军事舰队", order: 1 },
  civilian: { label: "民用舰船", order: 2 },
  support: { label: "辅助单位", order: 3 },
  asteroid: { label: "小行星/彗星", order: 4 },
};

export const shipClasses = {
  satellite: { label: "卫星", icon: "◇", category: "support", buildDays: 30, maxSpeed: 0.0001, ftl: false, crew: 0, mass: 0.5 },
  shuttle: { label: "穿梭机", icon: "△", category: "civilian", buildDays: 60, maxSpeed: 0.001, ftl: false, crew: 4, mass: 20 },
  construction: { label: "工程船", icon: "▣", category: "civilian", buildDays: 200, maxSpeed: 0.15, ftl: true, crew: 50, mass: 15000 },
  science: { label: "科研舰", icon: "✦", category: "civilian", buildDays: 350, maxSpeed: 0.40, ftl: true, crew: 40, mass: 4000 },
  corvette: { label: "护卫艇", icon: "▲", category: "military", buildDays: 180, maxSpeed: 0.05, ftl: false, crew: 15, mass: 800 },
  frigate: { label: "巡防舰", icon: "◆", category: "military", buildDays: 365, maxSpeed: 0.15, ftl: true, crew: 80, mass: 5000 },
  destroyer: { label: "驱逐舰", icon: "⬟", category: "military", buildDays: 540, maxSpeed: 0.25, ftl: true, crew: 200, mass: 12000 },
  cruiser: { label: "巡洋舰", icon: "⬢", category: "military", buildDays: 730, maxSpeed: 0.35, ftl: true, crew: 500, mass: 45000 },
  battleship: { label: "战列舰", icon: "✹", category: "military", buildDays: 1095, maxSpeed: 0.40, ftl: true, crew: 1200, mass: 120000 },
  carrier: { label: "航母", icon: "▰", category: "military", buildDays: 1460, maxSpeed: 0.30, ftl: true, crew: 3000, mass: 250000 },
  freighter: { label: "货船", icon: "▤", category: "civilian", buildDays: 300, maxSpeed: 0.20, ftl: true, crew: 25, mass: 80000 },
  explorer: { label: "探索舰", icon: "✧", category: "civilian", buildDays: 400, maxSpeed: 0.50, ftl: true, crew: 30, mass: 6000 },
  colony_ship: { label: "殖民船", icon: "◍", category: "civilian", buildDays: 1825, maxSpeed: 0.10, ftl: true, crew: 5000, mass: 500000 },
  shipyard: { label: "造船厂", icon: "▦", category: "starbase", buildDays: 1600, maxSpeed: 0, ftl: false, crew: 5000, mass: 1500000 },
  starbase: { label: "星港", icon: "◎", category: "starbase", buildDays: 2000, maxSpeed: 0, ftl: false, crew: 8000, mass: 2000000 },
  station: { label: "空间站", icon: "◉", category: "starbase", buildDays: 900, maxSpeed: 0, ftl: false, crew: 1200, mass: 380000 },
  defense_platform: { label: "防御平台", icon: "✚", category: "starbase", buildDays: 600, maxSpeed: 0, ftl: false, crew: 50, mass: 50000 },
  megastructure: { label: "巨构", icon: "◈", category: "starbase", buildDays: 5000, maxSpeed: 0, ftl: false, crew: 20000, mass: 10000000 },
  asteroid: { label: "小行星", icon: "☄", category: "asteroid", buildDays: 0, maxSpeed: 0.001, ftl: false, crew: 0, mass: 10000 },
};

let nextShipId = 1;
export const ships = [];

export function lorentz(v) {
  if (v <= 0) return 1;
  if (v >= 1) return Infinity;
  return 1 / Math.sqrt(1 - v * v);
}

export function travelTimes(distanceLy, v) {
  if (v <= 0 || distanceLy <= 0) return { coordTimeDays: Infinity, properTimeDays: Infinity };
  const coordTimeYears = distanceLy / v;
  const gamma = lorentz(v);
  const properTimeYears = coordTimeYears / gamma;
  return {
    coordTimeDays: coordTimeYears * 365.25,
    properTimeDays: properTimeYears * 365.25,
  };
}

function clonePoint(point) {
  if (!point) return null;
  if (Array.isArray(point)) return point.slice(0, 3).map(Number);
  return [Number(point.x || 0), Number(point.y || 0), Number(point.z || 0)];
}

function distancePoints(a, b) {
  if (!a || !b) return 0;
  const pa = clonePoint(a);
  const pb = clonePoint(b);
  return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
}

function cloneOrbit(orbit) {
  if (!orbit) return null;
  return {
    centerPoint: clonePoint(orbit.centerPoint),
    radiusLy: Number(orbit.radiusLy || 0),
    periodDays: Number(orbit.periodDays || 1),
    startAngle: Number(orbit.startAngle || 0),
    startDay: Number(orbit.startDay || 0),
    direction: orbit.direction === -1 ? -1 : 1,
    targetLabel: orbit.targetLabel || "轨道中心",
    targetStarId: orbit.targetStarId || null,
    targetBodyId: orbit.targetBodyId || null,
  };
}

function cloneRouteWaypoint(waypoint) {
  if (!waypoint) return null;
  return {
    starId: waypoint.starId ?? waypoint.destinationStarId ?? null,
    bodyId: waypoint.bodyId ?? waypoint.destinationBodyId ?? null,
    point: clonePoint(waypoint.point ?? waypoint.destinationPoint),
    label: waypoint.label || waypoint.destinationLabel || waypoint.starId || waypoint.destinationStarId || "航点",
    keepPoint: Boolean(waypoint.keepPoint ?? waypoint.destinationKeepsPoint ?? true),
    speed: waypoint.speed !== undefined ? Number(waypoint.speed) : undefined,
  };
}

function makeOrbit(centerPoint, opts = {}) {
  const radiusLy = Math.max(Number(opts.radiusLy ?? opts.orbitRadiusLy ?? 0.0001), 0.000001);
  const periodDays = Math.max(Number(opts.periodDays ?? opts.orbitPeriodDays ?? 30), 0.000001);
  return {
    centerPoint: clonePoint(centerPoint),
    radiusLy,
    periodDays,
    startAngle: Number(opts.startAngle ?? 0),
    startDay: Number(opts.startDay ?? 0),
    direction: opts.direction === -1 ? -1 : 1,
    targetLabel: opts.targetLabel || opts.destinationLabel || "轨道中心",
    targetStarId: opts.targetStarId || opts.destinationStarId || null,
    targetBodyId: opts.targetBodyId || opts.destinationBodyId || null,
  };
}

function orbitPoint(orbit, currentSimDay) {
  const center = clonePoint(orbit.centerPoint);
  if (!center) return null;
  const elapsed = Math.max(0, Number(currentSimDay || 0) - Number(orbit.startDay || 0));
  const angle = Number(orbit.startAngle || 0)
    + orbit.direction * (Math.PI * 2) * (elapsed / Math.max(Number(orbit.periodDays || 1), 0.000001));
  return [
    center[0] + Math.cos(angle) * orbit.radiusLy,
    center[1],
    center[2] + Math.sin(angle) * orbit.radiusLy,
  ];
}

function numericIdSuffix(id) {
  const match = String(id || "").match(/ship-(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function stripRuntimeFields(ship) {
  const { classInfo, mesh, label, trail, ...rest } = ship;
  return rest;
}

function hydrateShip(record) {
  const cls = shipClasses[record.shipClass] || shipClasses.shuttle;
  const id = record.id || `ship-${nextShipId++}`;
  return {
    id,
    name: record.name || `${cls.label}-${id}`,
    shipClass: record.shipClass in shipClasses ? record.shipClass : "shuttle",
    classInfo: cls,
    faction: record.faction || "无/无所属",
    locationStarId: record.locationStarId ?? null,
    locationBodyId: record.locationBodyId ?? null,
    locationPoint: clonePoint(record.locationPoint),
    state: record.state || (cls.buildDays <= 0 ? "idle" : "building"),
    buildStartDay: Number(record.buildStartDay || 0),
    buildDurationDays: Number(record.buildDurationDays ?? cls.buildDays),
    buildProgressFrac: Number(record.buildProgressFrac ?? (cls.buildDays <= 0 ? 1 : 0)),
    travelSpeed: Number(record.travelSpeed ?? cls.maxSpeed),
    destinationStarId: record.destinationStarId ?? null,
    destinationBodyId: record.destinationBodyId ?? null,
    destinationPoint: clonePoint(record.destinationPoint),
    destinationLabel: record.destinationLabel || "",
    destinationKeepsPoint: Boolean(record.destinationKeepsPoint),
    travelFromPoint: clonePoint(record.travelFromPoint),
    travelStartDay: Number(record.travelStartDay || 0),
    travelDurationDays: Number(record.travelDurationDays || 0),
    travelProgressFrac: Number(record.travelProgressFrac || 0),
    travelDistanceLy: Number(record.travelDistanceLy || 0),
    crewProperTimeDays: Number(record.crewProperTimeDays || 0),
    crewTotalProperDays: Number(record.crewTotalProperDays || 0),
    routeQueue: Array.isArray(record.routeQueue) ? record.routeQueue.map(cloneRouteWaypoint).filter(Boolean) : [],
    pendingOrbit: cloneOrbit(record.pendingOrbit),
    orbit: cloneOrbit(record.orbit),
    // ── Communication status (used by the signal-propagation command system) ──
    comm: hydrateComm(record.comm),
    // Priority of the command the ship is currently executing (null = none/idle).
    // UI / instant commands use a very high priority; propagated agent commands use their own.
    activePriority: record.activePriority === undefined || record.activePriority === null
      ? null
      : Number(record.activePriority),
    mesh: null,
    label: null,
    trail: null,
  };
}

/**
 * Normalise a ship communication descriptor.
 * - canBroadcast: may originate/relay commands to other units.
 * - canReceive:   may accept incoming commands at all.
 * - receiveThreshold: minimum *arriving* signal strength required to accept a command.
 * - broadcastStrength: default emitted strength when this ship is the transmitter.
 * - antennaGain: multiplies arriving strength before the threshold check (receiver sensitivity).
 */
function hydrateComm(comm = {}) {
  comm = comm || {};
  return {
    canBroadcast: comm.canBroadcast === undefined ? true : Boolean(comm.canBroadcast),
    canReceive: comm.canReceive === undefined ? true : Boolean(comm.canReceive),
    receiveThreshold: Number.isFinite(Number(comm.receiveThreshold)) ? Number(comm.receiveThreshold) : 0,
    broadcastStrength: Number.isFinite(Number(comm.broadcastStrength)) ? Number(comm.broadcastStrength) : 1,
    antennaGain: Number.isFinite(Number(comm.antennaGain)) ? Number(comm.antennaGain) : 1,
  };
}

/** Update a ship's communication status. Agent-callable. */
export function setShipComm(shipId, fields = {}) {
  const ship = ships.find((s) => s.id === shipId);
  if (!ship) throw new Error(`Ship not found: ${shipId}`);
  ship.comm = hydrateComm({ ...ship.comm, ...fields });
  return ship.comm;
}

export function createShip(opts) {
  const cls = shipClasses[opts.shipClass];
  if (!cls) throw new Error(`Unknown ship class: ${opts.shipClass}`);
  const id = opts.id || `ship-${nextShipId++}`;
  const ship = hydrateShip({
    id,
    name: opts.name || `${cls.label}-${nextShipId}`,
    shipClass: opts.shipClass,
    faction: opts.faction || "无/无所属",
    locationStarId: opts.locationStarId,
    locationBodyId: opts.locationBodyId || null,
    locationPoint: opts.locationPoint || null,
    state: opts.instant || cls.buildDays <= 0 ? "idle" : "building",
    buildStartDay: opts.buildStartDay || 0,
    buildDurationDays: cls.buildDays,
    buildProgressFrac: opts.instant || cls.buildDays <= 0 ? 1 : 0,
    travelSpeed: Number(opts.travelSpeed ?? cls.maxSpeed),
  });
  ships.push(ship);
  return ship;
}

export function createAsteroid(opts) {
  const ship = createShip({
    name: opts.name || `小行星-${nextShipId}`,
    shipClass: "asteroid",
    locationStarId: opts.locationStarId || null,
    locationPoint: opts.locationPoint || null,
    travelSpeed: opts.speed || 0.0001,
    faction: opts.faction || "无/无所属",
    instant: true,
  });
  if (opts.destinationStarId && opts.distanceFn && opts.currentSimDay !== undefined) {
    commandTravel(ship.id, opts.destinationStarId, opts.distanceFn, opts.currentSimDay, { speed: opts.speed || 0.0001 });
  } else if (opts.destinationPoint && opts.currentSimDay !== undefined) {
    commandTravelToPoint(ship.id, opts.destinationPoint, opts.currentSimDay, {
      speed: opts.speed || 0.0001,
      fromPoint: opts.fromPoint || opts.locationPoint,
      distanceLy: opts.distanceLy,
      destinationLabel: opts.destinationLabel,
    });
  }
  return ship;
}

function assertCanMove(ship) {
  if (ship.state === "building") throw new Error(`${ship.name} is still under construction`);
  if (ship.classInfo.maxSpeed <= 0) throw new Error(`${ship.name} cannot travel`);
}

function startTravel(ship, currentSimDay, destination, opts = {}) {
  assertCanMove(ship);
  const requestedSpeed = Number(opts.speed ?? ship.travelSpeed);
  const speedLimit = opts.ignoreSpeedLimit ? Infinity : (ship.classInfo.ftl ? Infinity : Math.max(ship.classInfo.maxSpeed, requestedSpeed));
  const speed = Math.min(requestedSpeed, speedLimit);
  if (speed <= 0) throw new Error(`${ship.name} has no valid travel speed`);

  const distanceLy = Number(opts.distanceLy ?? destination.distanceLy ?? 0);
  if (!(distanceLy > 0)) throw new Error(`Cannot compute travel distance for ${ship.name}`);
  const times = travelTimes(distanceLy, speed);

  ship.state = "traveling";
  ship.destinationStarId = destination.starId ?? null;
  ship.destinationBodyId = destination.bodyId ?? null;
  ship.destinationPoint = clonePoint(destination.point);
  ship.destinationLabel = destination.label || "";
  ship.destinationKeepsPoint = Boolean(destination.keepPoint);
  ship.travelFromPoint = clonePoint(opts.fromPoint);
  ship.travelStartDay = currentSimDay;
  ship.travelDurationDays = times.coordTimeDays;
  ship.travelDistanceLy = distanceLy;
  ship.travelProgressFrac = 0;
  ship.crewProperTimeDays = times.properTimeDays;
  ship.travelSpeed = speed;
  ship.orbit = null;
  ship.pendingOrbit = null;
  if (opts.clearQueue) ship.routeQueue = [];
  return ship;
}

function currentShipPoint(ship) {
  if (ship.state === "traveling") return clonePoint(ship.destinationPoint) || clonePoint(ship.locationPoint);
  return clonePoint(ship.locationPoint);
}

function startQueuedWaypoint(ship, waypoint, currentSimDay) {
  const wp = cloneRouteWaypoint(waypoint);
  if (!wp?.point) return null;
  const fromPoint = currentShipPoint(ship);
  const distanceLy = Math.max(distancePoints(fromPoint, wp.point), 0.000001);
  return startTravel(ship, currentSimDay, {
    starId: wp.starId,
    bodyId: wp.bodyId,
    point: wp.point,
    label: wp.label,
    keepPoint: wp.keepPoint,
    distanceLy,
  }, {
    fromPoint,
    distanceLy,
    speed: wp.speed ?? ship.travelSpeed,
    ignoreSpeedLimit: true,
  });
}

function appendPatrolReturn(ship, originPoint, opts = {}) {
  const point = clonePoint(originPoint);
  if (!point) return;
  ship.routeQueue.push({
    starId: opts.returnStarId || null,
    bodyId: opts.returnBodyId || null,
    point,
    label: opts.returnLabel || "巡逻返航点",
    keepPoint: true,
    speed: opts.speed !== undefined ? Number(opts.speed) : undefined,
  });
}

export function commandTravel(shipId, destStarId, distanceFn, currentSimDay, opts = {}) {
  const ship = ships.find((s) => s.id === shipId);
  if (!ship) throw new Error(`Ship not found: ${shipId}`);
  if (ship.locationStarId === destStarId && !ship.locationPoint && ship.state !== "traveling") {
    throw new Error(`${ship.name} is already at ${destStarId}`);
  }
  let distanceLy = Number(opts.distanceLy || 0);
  if (!(distanceLy > 0) && ship.locationStarId) {
    distanceLy = distanceFn(ship.locationStarId, destStarId);
  }
  const waypoint = cloneRouteWaypoint({
    starId: destStarId,
    bodyId: opts.destinationBodyId || null,
    point: opts.destinationPoint || null,
    label: opts.destinationLabel || destStarId,
    keepPoint: false,
    speed: opts.speed,
  });
  const originPoint = clonePoint(opts.routeOriginPoint || opts.fromPoint || ship.locationPoint);
  if (opts.appendRoute && (ship.state === "traveling" || ship.routeQueue.length > 0)) {
    ship.routeQueue.push(waypoint);
    if (opts.patrol) appendPatrolReturn(ship, originPoint, opts);
    return ship;
  }
  const moved = startTravel(ship, currentSimDay, {
    ...waypoint,
    distanceLy,
  }, { ...opts, distanceLy, clearQueue: !opts.appendRoute, ignoreSpeedLimit: true });
  if (opts.patrol) appendPatrolReturn(ship, originPoint, opts);
  return moved;
}

export function commandTravelToPoint(shipId, destinationPoint, currentSimDay, opts = {}) {
  const ship = ships.find((s) => s.id === shipId);
  if (!ship) throw new Error(`Ship not found: ${shipId}`);
  const fromPoint = clonePoint(opts.fromPoint || ship.locationPoint);
  const point = clonePoint(destinationPoint);
  const distanceLy = Number(opts.distanceLy || distancePoints(fromPoint, point));
  const waypoint = cloneRouteWaypoint({
    starId: opts.destinationStarId || null,
    bodyId: opts.destinationBodyId || null,
    point,
    label: opts.destinationLabel || "自由坐标",
    keepPoint: true,
    speed: opts.speed,
  });
  const originPoint = clonePoint(opts.routeOriginPoint || fromPoint);
  if (opts.appendRoute && (ship.state === "traveling" || ship.routeQueue.length > 0)) {
    ship.routeQueue.push(waypoint);
    if (opts.patrol) appendPatrolReturn(ship, originPoint, opts);
    return ship;
  }
  const moved = startTravel(ship, currentSimDay, {
    ...waypoint,
    distanceLy,
  }, { ...opts, fromPoint, distanceLy, clearQueue: !opts.appendRoute, ignoreSpeedLimit: true });
  if (opts.patrol) appendPatrolReturn(ship, originPoint, opts);
  return moved;
}

export function commandOrbitAroundPoint(shipId, centerPoint, currentSimDay, opts = {}) {
  const ship = ships.find((s) => s.id === shipId);
  if (!ship) throw new Error(`Ship not found: ${shipId}`);
  const orbit = makeOrbit(centerPoint, { ...opts, startDay: currentSimDay });
  const stagingPoint = orbitPoint({ ...orbit, startDay: currentSimDay }, currentSimDay);
  const fromPoint = clonePoint(opts.fromPoint || ship.locationPoint);
  const distanceLy = Math.max(Number(opts.distanceLy || distancePoints(fromPoint, stagingPoint)), 0.000001);
  const moved = commandTravelToPoint(shipId, stagingPoint, currentSimDay, {
    ...opts,
    fromPoint,
    distanceLy,
    destinationStarId: orbit.targetStarId,
    destinationBodyId: orbit.targetBodyId,
    destinationLabel: `${orbit.targetLabel} 轨道`,
  });
  moved.pendingOrbit = orbit;
  return moved;
}

export function tickShips(currentSimDay) {
  const events = [];
  for (const ship of ships) {
    if (ship.state === "building") {
      const elapsed = currentSimDay - ship.buildStartDay;
      ship.buildProgressFrac = ship.buildDurationDays > 0 ? Math.min(elapsed / ship.buildDurationDays, 1) : 1;
      if (ship.buildProgressFrac >= 1) {
        ship.state = "idle";
        ship.buildProgressFrac = 1;
        events.push({ type: "built", ship });
      }
    } else if (ship.state === "traveling") {
      const elapsed = currentSimDay - ship.travelStartDay;
      ship.travelProgressFrac = ship.travelDurationDays > 0 ? Math.min(elapsed / ship.travelDurationDays, 1) : 1;
      if (ship.travelProgressFrac >= 1) {
        const hasQueuedRoute = ship.routeQueue.length > 0;
        const arrivalPoint = clonePoint(ship.destinationPoint);
        ship.state = "idle";
        ship.travelProgressFrac = 1;
        ship.crewTotalProperDays += ship.crewProperTimeDays;
        ship.locationStarId = ship.destinationStarId;
        ship.locationBodyId = ship.destinationBodyId;
        ship.locationPoint = hasQueuedRoute ? arrivalPoint : (ship.destinationKeepsPoint || ship.destinationBodyId ? arrivalPoint : (ship.destinationStarId ? null : arrivalPoint));
        ship.destinationStarId = null;
        ship.destinationBodyId = null;
        ship.destinationPoint = null;
        ship.destinationLabel = "";
        ship.destinationKeepsPoint = false;
        ship.travelFromPoint = null;
        if (ship.pendingOrbit) {
          ship.orbit = { ...cloneOrbit(ship.pendingOrbit), startDay: currentSimDay };
          ship.pendingOrbit = null;
          ship.locationPoint = orbitPoint(ship.orbit, currentSimDay);
          events.push({ type: "orbit", ship });
        }
        if (!ship.pendingOrbit && ship.routeQueue.length > 0) {
          const next = ship.routeQueue.shift();
          startQueuedWaypoint(ship, next, currentSimDay);
          events.push({ type: "route", ship, waypoint: next });
        }
        events.push({ type: "arrived", ship });
      }
    } else if (ship.state === "idle" && ship.orbit) {
      ship.locationPoint = orbitPoint(ship.orbit, currentSimDay);
    }
  }
  return events;
}

export function shipWorldPosition(ship, starPosFn) {
  if (ship.state === "traveling") {
    const from = clonePoint(ship.travelFromPoint) || clonePoint(ship.locationPoint) || clonePoint(starPosFn(ship.locationStarId));
    const to = clonePoint(ship.destinationPoint) || clonePoint(starPosFn(ship.destinationStarId));
    if (!from || !to) return null;
    const t = ship.travelProgressFrac;
    return {
      x: from[0] + (to[0] - from[0]) * t,
      y: from[1] + (to[1] - from[1]) * t,
      z: from[2] + (to[2] - from[2]) * t,
    };
  }
  const parked = clonePoint(ship.locationPoint) || clonePoint(starPosFn(ship.locationStarId));
  return parked ? { x: parked[0], y: parked[1], z: parked[2] } : null;
}

export function removeShip(shipId) {
  const idx = ships.findIndex((s) => s.id === shipId);
  if (idx >= 0) ships.splice(idx, 1);
}

export function listShips(filter = {}) {
  return ships.filter((s) => {
    if (filter.state && s.state !== filter.state) return false;
    if (filter.locationStarId && s.locationStarId !== filter.locationStarId) return false;
    if (filter.faction && s.faction !== filter.faction) return false;
    if (filter.shipClass && s.shipClass !== filter.shipClass) return false;
    if (filter.category && s.classInfo.category !== filter.category) return false;
    return true;
  });
}

export function shipInfo(ship) {
  const cls = ship.classInfo;
  const location = ship.orbit?.targetLabel
    ? `环绕 ${ship.orbit.targetLabel}`
    : ship.locationStarId || (ship.locationPoint ? "自由坐标" : "未知");
  const destination = ship.destinationStarId || ship.destinationLabel || (ship.destinationPoint ? "自由坐标" : "");
  const info = {
    id: ship.id,
    name: ship.name,
    class: `${cls.icon} ${cls.label}`,
    shipClass: ship.shipClass,
    category: cls.category,
    faction: ship.faction,
    state: ship.state,
    location,
    locationStarId: ship.locationStarId,
    locationBodyId: ship.locationBodyId,
    locationPoint: clonePoint(ship.locationPoint),
    destination,
    destinationStarId: ship.destinationStarId,
    destinationPoint: clonePoint(ship.destinationPoint),
    routeQueue: ship.routeQueue.map(cloneRouteWaypoint),
    crew: cls.crew,
    maxSpeed: `${cls.maxSpeed} c`,
    ftl: cls.ftl,
    travelSpeed: `${ship.travelSpeed} c`,
    comm: ship.comm ? { ...ship.comm } : undefined,
    activePriority: ship.activePriority ?? null,
  };
  if (ship.pendingOrbit) {
    info.pendingOrbit = {
      targetLabel: ship.pendingOrbit.targetLabel,
      radiusLy: ship.pendingOrbit.radiusLy,
      periodDays: ship.pendingOrbit.periodDays,
    };
  }
  if (ship.orbit) {
    info.orbit = {
      targetLabel: ship.orbit.targetLabel,
      radiusLy: ship.orbit.radiusLy,
      periodDays: ship.orbit.periodDays,
    };
  }
  if (ship.state === "building") {
    info.buildProgress = `${(ship.buildProgressFrac * 100).toFixed(1)}%`;
    info.buildEtaDays = Math.max(0, ship.buildDurationDays * (1 - ship.buildProgressFrac));
  }
  if (ship.state === "traveling") {
    info.travelProgress = `${(ship.travelProgressFrac * 100).toFixed(1)}%`;
    info.travelEtaDays = Math.max(0, ship.travelDurationDays * (1 - ship.travelProgressFrac));
    info.distanceLy = ship.travelDistanceLy;
    const gamma = lorentz(ship.travelSpeed);
    const elapsedCoord = ship.travelDurationDays * ship.travelProgressFrac;
    const elapsedProper = gamma === Infinity ? 0 : elapsedCoord / gamma;
    info.crewElapsedDays = elapsedProper;
    info.crewTotalDays = ship.crewTotalProperDays + elapsedProper;
    info.timeDilation = gamma === Infinity ? "FTL" : `${gamma.toFixed(3)}x`;
  }
  return info;
}

export function getFleetSummary() {
  const summary = {};
  for (const [catId, catDef] of Object.entries(shipCategories)) {
    const catShips = ships.filter((s) => s.classInfo.category === catId);
    summary[catId] = {
      ...catDef,
      total: catShips.length,
      building: catShips.filter((s) => s.state === "building").length,
      traveling: catShips.filter((s) => s.state === "traveling").length,
      idle: catShips.filter((s) => s.state === "idle").length,
      ships: catShips,
    };
  }
  return summary;
}

export function serializeShips() {
  return ships.map(stripRuntimeFields);
}

export function loadShips(records = []) {
  ships.splice(0, ships.length);
  nextShipId = 1;
  for (const record of records) {
    const ship = hydrateShip(record);
    ships.push(ship);
    nextShipId = Math.max(nextShipId, numericIdSuffix(ship.id) + 1);
  }
  return ships;
}
