/**
 * Spaceship system — construction, travel, FTL, relativistic effects
 * All state is held here; app.js calls into this module each frame.
 */

// ── Ship class definitions ──────────────────────────────────────────
export const shipClasses = {
  satellite:    { label: "卫星",     icon: "🛰", buildDays: 30,   maxSpeed: 0.0001, ftl: false, crew: 0,   mass: 0.5 },
  shuttle:      { label: "穿梭机",   icon: "🚀", buildDays: 60,   maxSpeed: 0.001,  ftl: false, crew: 4,   mass: 20 },
  corvette:     { label: "护卫舰",   icon: "⚔",  buildDays: 180,  maxSpeed: 0.05,   ftl: false, crew: 15,  mass: 800 },
  frigate:      { label: "巡防舰",   icon: "🛡",  buildDays: 365,  maxSpeed: 0.15,   ftl: true,  crew: 80,  mass: 5000 },
  destroyer:    { label: "驱逐舰",   icon: "💥", buildDays: 540,  maxSpeed: 0.25,   ftl: true,  crew: 200, mass: 12000 },
  cruiser:      { label: "巡洋舰",   icon: "🔱", buildDays: 730,  maxSpeed: 0.35,   ftl: true,  crew: 500, mass: 45000 },
  battleship:   { label: "战列舰",   icon: "⚓", buildDays: 1095, maxSpeed: 0.40,   ftl: true,  crew: 1200,mass: 120000 },
  carrier:      { label: "航母",     icon: "🏗", buildDays: 1460, maxSpeed: 0.30,   ftl: true,  crew: 3000,mass: 250000 },
  freighter:    { label: "货船",     icon: "📦", buildDays: 300,  maxSpeed: 0.20,   ftl: true,  crew: 25,  mass: 80000 },
  explorer:     { label: "探索舰",   icon: "🔭", buildDays: 400,  maxSpeed: 0.50,   ftl: true,  crew: 30,  mass: 6000 },
  colony_ship:  { label: "殖民船",   icon: "🌍", buildDays: 1825, maxSpeed: 0.10,   ftl: true,  crew: 5000,mass: 500000 },
};

let nextShipId = 1;

// All ships in the simulation
export const ships = [];

// ── Relativistic helpers ────────────────────────────────────────────

/** Lorentz factor γ for a given fraction of c */
export function lorentz(v) {
  if (v <= 0) return 1;
  if (v >= 1) return Infinity;
  return 1 / Math.sqrt(1 - v * v);
}

/**
 * For a journey at constant `v` (fraction of c),
 * return { coordTimeDays, properTimeDays } for a given distance in light-years.
 * coordTime = what stationary observers see.
 * properTime = what the crew experiences (time dilation).
 */
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

// ── Ship lifecycle ──────────────────────────────────────────────────

/**
 * Create a ship at a star system (construction begins immediately).
 * @param {object} opts
 * @param {string} opts.name - display name
 * @param {string} opts.shipClass - key into shipClasses
 * @param {string} opts.locationStarId - where to build
 * @param {number} [opts.travelSpeed] - override fraction-of-c cruise speed
 * @param {string} [opts.faction] - owning faction
 * @param {boolean} [opts.instant] - skip construction, deploy immediately
 * @returns {object} the new ship record
 */
export function createShip(opts) {
  const cls = shipClasses[opts.shipClass];
  if (!cls) throw new Error(`Unknown ship class: ${opts.shipClass}`);
  const id = `ship-${nextShipId++}`;
  const ship = {
    id,
    name: opts.name || `${cls.label}-${nextShipId}`,
    shipClass: opts.shipClass,
    classInfo: cls,
    faction: opts.faction || "",
    // Location
    locationStarId: opts.locationStarId,
    locationBodyId: opts.locationBodyId || null,
    // State: "building" | "idle" | "traveling" | "arrived"
    state: opts.instant ? "idle" : "building",
    // Construction
    buildStartDay: 0,     // will be set by caller to current sim day
    buildDurationDays: cls.buildDays,
    buildProgressFrac: opts.instant ? 1 : 0,
    // Travel
    travelSpeed: Math.min(opts.travelSpeed ?? cls.maxSpeed, cls.ftl ? 10 : cls.maxSpeed), // fraction of c (FTL ships can go >1)
    destinationStarId: null,
    travelStartDay: 0,
    travelDurationDays: 0,
    travelProgressFrac: 0,
    travelDistanceLy: 0,
    crewProperTimeDays: 0,   // crew experienced time for current journey
    crewTotalProperDays: 0,  // cumulative crew proper time across all journeys
    // 3D
    mesh: null,
    label: null,
    trail: null,
  };
  ships.push(ship);
  return ship;
}

/**
 * Command a ship to travel to another star.
 * @param {string} shipId
 * @param {string} destStarId
 * @param {function} distanceFn - (fromId, toId) => distanceLy
 * @param {number} currentSimDay
 * @param {object} [opts]
 * @param {number} [opts.speed] - override travel speed (fraction of c)
 */
export function commandTravel(shipId, destStarId, distanceFn, currentSimDay, opts = {}) {
  const ship = ships.find((s) => s.id === shipId);
  if (!ship) throw new Error(`Ship not found: ${shipId}`);
  if (ship.state === "building") throw new Error(`Ship ${ship.name} is still under construction`);
  if (ship.locationStarId === destStarId) throw new Error(`Ship ${ship.name} is already at ${destStarId}`);

  const dist = distanceFn(ship.locationStarId, destStarId);
  if (dist <= 0) throw new Error(`Cannot compute distance from ${ship.locationStarId} to ${destStarId}`);

  const speed = Math.min(opts.speed ?? ship.travelSpeed, ship.classInfo.ftl ? 999 : ship.classInfo.maxSpeed);
  const times = travelTimes(dist, speed);

  ship.state = "traveling";
  ship.destinationStarId = destStarId;
  ship.travelStartDay = currentSimDay;
  ship.travelDurationDays = times.coordTimeDays;
  ship.travelDistanceLy = dist;
  ship.travelProgressFrac = 0;
  ship.crewProperTimeDays = times.properTimeDays;
  ship.travelSpeed = speed;
  return ship;
}

/**
 * Tick all ships forward by deltaDays of coordinate time.
 * @param {number} currentSimDay - total sim days elapsed
 * @returns {object[]} events - list of { type, ship } for newly completed actions
 */
export function tickShips(currentSimDay) {
  const events = [];
  for (const ship of ships) {
    if (ship.state === "building") {
      const elapsed = currentSimDay - ship.buildStartDay;
      ship.buildProgressFrac = Math.min(elapsed / ship.buildDurationDays, 1);
      if (ship.buildProgressFrac >= 1) {
        ship.state = "idle";
        ship.buildProgressFrac = 1;
        events.push({ type: "built", ship });
      }
    } else if (ship.state === "traveling") {
      const elapsed = currentSimDay - ship.travelStartDay;
      ship.travelProgressFrac = Math.min(elapsed / ship.travelDurationDays, 1);
      if (ship.travelProgressFrac >= 1) {
        ship.state = "idle";
        ship.travelProgressFrac = 1;
        ship.crewTotalProperDays += ship.crewProperTimeDays;
        ship.locationStarId = ship.destinationStarId;
        ship.destinationStarId = null;
        events.push({ type: "arrived", ship });
      }
    }
  }
  return events;
}

/**
 * Get current interpolated 3D position for a traveling ship.
 * @param {object} ship
 * @param {function} starPosFn - (starId) => THREE.Vector3
 * @returns {THREE.Vector3|null}
 */
export function shipWorldPosition(ship, starPosFn) {
  if (ship.state !== "traveling" || !ship.destinationStarId) return null;
  const from = starPosFn(ship.locationStarId);
  const to = starPosFn(ship.destinationStarId);
  if (!from || !to) return null;
  const t = ship.travelProgressFrac;
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    z: from.z + (to.z - from.z) * t,
  };
}

/** Remove a ship by id */
export function removeShip(shipId) {
  const idx = ships.findIndex((s) => s.id === shipId);
  if (idx >= 0) ships.splice(idx, 1);
}

/** List all ships, optionally filtered */
export function listShips(filter = {}) {
  return ships.filter((s) => {
    if (filter.state && s.state !== filter.state) return false;
    if (filter.locationStarId && s.locationStarId !== filter.locationStarId) return false;
    if (filter.faction && s.faction !== filter.faction) return false;
    if (filter.shipClass && s.shipClass !== filter.shipClass) return false;
    return true;
  });
}

/** Get formatted info for a ship */
export function shipInfo(ship) {
  const cls = ship.classInfo;
  const info = {
    id: ship.id,
    name: ship.name,
    class: `${cls.icon} ${cls.label}`,
    shipClass: ship.shipClass,
    faction: ship.faction,
    state: ship.state,
    location: ship.locationStarId,
    crew: cls.crew,
    maxSpeed: cls.maxSpeed + " c",
    ftl: cls.ftl,
    travelSpeed: ship.travelSpeed + " c",
  };
  if (ship.state === "building") {
    info.buildProgress = (ship.buildProgressFrac * 100).toFixed(1) + "%";
    info.buildEtaDays = Math.max(0, ship.buildDurationDays * (1 - ship.buildProgressFrac));
  }
  if (ship.state === "traveling") {
    info.destination = ship.destinationStarId;
    info.travelProgress = (ship.travelProgressFrac * 100).toFixed(1) + "%";
    info.travelEtaDays = Math.max(0, ship.travelDurationDays * (1 - ship.travelProgressFrac));
    info.distanceLy = ship.travelDistanceLy;
    // Crew proper time
    const gamma = lorentz(ship.travelSpeed);
    const elapsedCoord = ship.travelDurationDays * ship.travelProgressFrac;
    const elapsedProper = elapsedCoord / gamma;
    info.crewElapsedDays = elapsedProper;
    info.crewTotalDays = ship.crewTotalProperDays + elapsedProper;
    info.timeDilation = gamma.toFixed(3) + "×";
  }
  return info;
}
