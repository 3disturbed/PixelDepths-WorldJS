/**
 * World-Collision.js
 * Deterministic terrain collision, surface movement, ledge detection,
 * falling simulation, raycasts, and structured reporting for World.js.
 */
export default class WorldCollision {
  constructor(world, options = {}) {
    if (!world || typeof world.materialAt !== "function" || !world.tileById) {
      throw new TypeError("WorldCollision requires a World instance.");
    }
    this.world = world;
    this.options = {
      radius: Math.max(0.1, Number(options.radius ?? 0.38)),
      maxStep: Math.max(0, Number(options.maxStep ?? 1)),
      maxDrop: Math.max(0, Number(options.maxDrop ?? 2)),
      dropThreshold: Math.max(0, Number(options.dropThreshold ?? 0.5)),
      lethalDrop: Math.max(0, Number(options.lethalDrop ?? 4)),
      gravity: Math.max(0.01, Number(options.gravity ?? 18)),
      terminalVelocity: Math.max(0.01, Number(options.terminalVelocity ?? 28)),
      skin: Math.max(0.001, Number(options.skin ?? 0.04)),
      maxReports: Math.max(0, Math.trunc(options.maxReports ?? 256)),
    };
    this.reports = [];
    this.sequence = 0;
    this.listeners = new Map();
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.world.width && y < this.world.height;
  }

  tileAt(x, y, altitude) {
    const material = this.world.materialAt(x, y, altitude);
    return this.world.tileById.get(material) ?? null;
  }

  isSolidAt(x, y, altitude) {
    if (!this.inBounds(x, y)) return true;
    return Boolean(this.tileAt(x, y, altitude)?.solid);
  }

  isLiquidAt(x, y, altitude) {
    if (!this.inBounds(x, y)) return false;
    return Boolean(this.tileAt(x, y, altitude)?.liquid);
  }

  isWalkableAt(x, y, altitude) {
    if (!this.inBounds(x, y)) return false;
    const tile = this.tileAt(x, y, altitude);
    return Boolean(tile && (tile.solid || tile.walkable) && !tile.liquid);
  }

  getSurfaceAltitude(x, y, options = {}) {
    if (!this.inBounds(x, y)) return null;
    const from = Math.min(
      this.world.maxAltitude,
      Math.floor(options.fromAltitude ?? this.world.maxAltitude),
    );
    const to = Math.max(
      this.world.minAltitude,
      Math.ceil(options.toAltitude ?? this.world.minAltitude),
    );
    for (let altitude = from; altitude >= to; altitude--) {
      if (this.isWalkableAt(x, y, altitude)) return altitude;
    }
    return null;
  }

  getSurfaceInfo(x, y, options = {}) {
    const altitude = this.getSurfaceAltitude(x, y, options);
    const seaLevel = this.world.generation?.terrain?.seaLevel ?? 0;
    const liquidAltitude = this.#highestLiquidAltitude(x, y);
    const material = altitude == null ? null : this.world.materialAt(x, y, altitude);
    const tile = material == null ? null : this.world.tileById.get(material);
    return {
      x,
      y,
      altitude,
      material,
      tile: tile?.key ?? null,
      solid: altitude != null,
      liquidAltitude,
      inWater: liquidAltitude != null && liquidAltitude >= (altitude ?? this.world.minAltitude - 1),
      submerged: liquidAltitude != null && liquidAltitude >= (options.entityAltitude ?? altitude ?? seaLevel),
      seaLevel,
      biome: this.world.getBiomeAt(x, y).key,
    };
  }

  #highestLiquidAltitude(x, y) {
    if (!this.inBounds(x, y)) return null;
    for (let altitude = this.world.maxAltitude; altitude >= this.world.minAltitude; altitude--) {
      if (this.tileAt(x, y, altitude)?.liquid) return altitude;
    }
    return null;
  }

  sampleCircle(x, y, radius, callback, samples = null) {
    const r = Math.max(0, Number(radius));
    const count = Math.max(8, Math.trunc(samples ?? Math.ceil(r * 12)));
    if (callback(x, y, -1) === false) return false;
    for (let index = 0; index < count; index++) {
      const angle = index / count * Math.PI * 2;
      if (callback(x + Math.cos(angle) * r, y + Math.sin(angle) * r, index) === false) {
        return false;
      }
    }
    return true;
  }

  overlapsSolid(x, y, altitude, radius = this.options.radius) {
    let hit = null;
    this.sampleCircle(x, y, radius, (sampleX, sampleY) => {
      if (!this.isSolidAt(sampleX, sampleY, altitude)) return true;
      hit = {
        x: sampleX,
        y: sampleY,
        altitude,
        material: this.world.materialAt(sampleX, sampleY, altitude),
      };
      return false;
    });
    return hit;
  }

  sweepCircle(from, to, options = {}) {
    const radius = Math.max(0.01, Number(options.radius ?? this.options.radius));
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    const stepLength = Math.max(0.1, Number(options.stepLength ?? Math.max(radius * 0.45, 0.2)));
    const steps = Math.max(1, Math.ceil(distance / stepLength));
    let last = { x: from.x, y: from.y };

    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const point = { x: from.x + dx * t, y: from.y + dy * t };
      const hit = this.overlapsSolid(point.x, point.y, options.altitude ?? from.altitude, radius);
      if (hit) {
        const report = this.report("collision", {
          mode: "volume",
          from: { ...from },
          requested: { ...to },
          position: last,
          hit,
          fraction: (step - 1) / steps,
        });
        return { hit: true, position: last, collision: hit, report };
      }
      last = point;
    }
    return { hit: false, position: { x: to.x, y: to.y }, collision: null, report: null };
  }

  moveCircle(entity, dx, dy, options = {}) {
    const altitude = options.altitude ?? entity.altitude ?? this.world.altitude;
    const radius = options.radius ?? entity.radius ?? this.options.radius;
    const from = { x: entity.x, y: entity.y, altitude };
    const requested = { x: entity.x + dx, y: entity.y + dy, altitude };
    const direct = this.sweepCircle(from, requested, { ...options, radius, altitude });
    let position = direct.position;
    let blockedX = false;
    let blockedY = false;

    if (direct.hit && options.slide !== false) {
      const xMove = this.sweepCircle(from, { x: requested.x, y: from.y, altitude }, {
        ...options,
        radius,
        altitude,
      });
      if (!xMove.hit) position = xMove.position;
      else blockedX = true;
      const yStart = { x: position.x, y: position.y, altitude };
      const yMove = this.sweepCircle(yStart, { x: position.x, y: requested.y, altitude }, {
        ...options,
        radius,
        altitude,
      });
      if (!yMove.hit) position = yMove.position;
      else blockedY = true;
    }

    entity.x = position.x;
    entity.y = position.y;
    entity.altitude = altitude;
    return {
      x: position.x,
      y: position.y,
      altitude,
      moved: Math.hypot(position.x - from.x, position.y - from.y),
      blocked: direct.hit,
      blockedX,
      blockedY,
      report: direct.report,
    };
  }

  detectDrop(from, to, options = {}) {
    const fromSurface = this.getSurfaceInfo(from.x, from.y, { entityAltitude: from.altitude });
    const toSurface = this.getSurfaceInfo(to.x, to.y, { entityAltitude: from.altitude });
    const fromAltitude = Number(from.altitude ?? fromSurface.altitude ?? this.world.minAltitude);
    const landingAltitude = toSurface.altitude ?? this.world.minAltitude - 1;
    const dropHeight = Math.max(0, fromAltitude - landingAltitude);
    const threshold = Number(options.dropThreshold ?? this.options.dropThreshold);
    const maxDrop = Number(options.maxDrop ?? this.options.maxDrop);
    const lethalDrop = Number(options.lethalDrop ?? this.options.lethalDrop);
    return {
      isDrop: dropHeight > threshold,
      isVoid: toSurface.altitude == null,
      dropHeight,
      fromAltitude,
      landingAltitude,
      safe: dropHeight <= maxDrop,
      lethal: dropHeight >= lethalDrop,
      intoWater: toSurface.inWater,
      landingMaterial: toSurface.material,
      landingTile: toSurface.tile,
      biome: toSurface.biome,
      from: fromSurface,
      to: toSurface,
    };
  }

  moveOnSurface(entity, dx, dy, options = {}) {
    const radius = Number(options.radius ?? entity.radius ?? this.options.radius);
    const maxStep = Number(options.maxStep ?? this.options.maxStep);
    const maxDrop = Number(options.maxDrop ?? this.options.maxDrop);
    const allowDrop = options.allowDrop === true;
    const canSwim = options.canSwim !== false;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance / Math.max(0.2, radius * 0.5)));
    const from = { x: entity.x, y: entity.y, altitude: entity.altitude };
    let x = entity.x;
    let y = entity.y;
    let altitude = Number(entity.altitude ?? this.getSurfaceAltitude(x, y) ?? this.world.minAltitude);
    let drop = null;
    let blockedReason = null;

    for (let step = 1; step <= steps; step++) {
      const nextX = from.x + dx * (step / steps);
      const nextY = from.y + dy * (step / steps);
      const footprint = this.#surfaceFootprint(nextX, nextY, radius);
      if (footprint.outOfBounds) {
        blockedReason = "world-boundary";
        break;
      }
      if (footprint.maximum != null && footprint.maximum - altitude > maxStep) {
        blockedReason = "step-too-high";
        break;
      }

      const detected = this.detectDrop(
        { x, y, altitude },
        { x: nextX, y: nextY },
        { ...options, maxDrop },
      );
      if (detected.isDrop) {
        drop = detected;
        if (!allowDrop && !detected.safe) {
          blockedReason = "drop-too-far";
          break;
        }
      }
      if (!canSwim && detected.to.inWater) {
        blockedReason = "water";
        break;
      }
      x = nextX;
      y = nextY;
      if (footprint.maximum != null && (!detected.isDrop || detected.safe || allowDrop)) {
        altitude = footprint.maximum;
      }
    }

    entity.x = x;
    entity.y = y;
    entity.altitude = altitude;
    const blocked = blockedReason != null;
    let report = null;
    if (blocked) {
      report = this.report("collision", {
        mode: "surface",
        reason: blockedReason,
        from,
        requested: { x: from.x + dx, y: from.y + dy },
        position: { x, y, altitude },
        drop,
      });
    } else if (drop?.isDrop) {
      report = this.report("drop", {
        mode: "surface",
        from,
        position: { x, y, altitude },
        ...drop,
      });
    }
    return { x, y, altitude, blocked, reason: blockedReason, drop, report };
  }

  #surfaceFootprint(x, y, radius) {
    let minimum = Infinity;
    let maximum = -Infinity;
    let outOfBounds = false;
    this.sampleCircle(x, y, radius, (sampleX, sampleY) => {
      if (!this.inBounds(sampleX, sampleY)) {
        outOfBounds = true;
        return true;
      }
      const altitude = this.getSurfaceAltitude(sampleX, sampleY);
      if (altitude != null) {
        minimum = Math.min(minimum, altitude);
        maximum = Math.max(maximum, altitude);
      }
      return true;
    });
    return {
      minimum: Number.isFinite(minimum) ? minimum : null,
      maximum: Number.isFinite(maximum) ? maximum : null,
      outOfBounds,
    };
  }

  updateFalling(entity, deltaSeconds, options = {}) {
    const dt = Math.max(0, Math.min(Number(deltaSeconds), Number(options.maxDelta ?? 0.1)));
    const gravity = Number(options.gravity ?? this.options.gravity);
    const terminalVelocity = Number(options.terminalVelocity ?? this.options.terminalVelocity);
    const ground = this.getSurfaceInfo(entity.x, entity.y, { entityAltitude: entity.altitude });
    const landingAltitude = ground.altitude ?? this.world.minAltitude - 1;
    const startedAt = Number(entity.fallStartAltitude ?? entity.altitude);
    entity.fallStartAltitude ??= Number(entity.altitude);
    entity.verticalVelocity = Math.max(
      -terminalVelocity,
      Number(entity.verticalVelocity ?? 0) - gravity * dt,
    );
    entity.altitude += entity.verticalVelocity * dt;

    if (entity.altitude <= landingAltitude) {
      entity.altitude = landingAltitude;
      const dropHeight = Math.max(0, startedAt - landingAltitude);
      const report = this.report("landing", {
        position: { x: entity.x, y: entity.y, altitude: landingAltitude },
        dropHeight,
        impactVelocity: Math.abs(entity.verticalVelocity),
        lethal: dropHeight >= Number(options.lethalDrop ?? this.options.lethalDrop),
        intoWater: ground.inWater,
        landingMaterial: ground.material,
        landingTile: ground.tile,
      });
      entity.verticalVelocity = 0;
      delete entity.fallStartAltitude;
      return { falling: false, landed: true, report };
    }
    return { falling: true, landed: false, report: null };
  }

  raycast(from, to, options = {}) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = (to.altitude ?? from.altitude) - from.altitude;
    const distance = Math.hypot(dx, dy, dz);
    const stepLength = Math.max(0.05, Number(options.stepLength ?? 0.25));
    const steps = Math.max(1, Math.ceil(distance / stepLength));
    for (let step = 0; step <= steps; step++) {
      const fraction = step / steps;
      const point = {
        x: from.x + dx * fraction,
        y: from.y + dy * fraction,
        altitude: from.altitude + dz * fraction,
      };
      if (this.isSolidAt(point.x, point.y, Math.round(point.altitude))) {
        return {
          hit: true,
          point,
          fraction,
          distance: distance * fraction,
          material: this.world.materialAt(point.x, point.y, Math.round(point.altitude)),
        };
      }
    }
    return { hit: false, point: { ...to }, fraction: 1, distance, material: null };
  }

  report(type, detail = {}) {
    const report = {
      id: ++this.sequence,
      type,
      timestamp: globalThis.performance?.now?.() ?? Date.now(),
      ...detail,
    };
    if (this.options.maxReports > 0) {
      this.reports.push(report);
      if (this.reports.length > this.options.maxReports) {
        this.reports.splice(0, this.reports.length - this.options.maxReports);
      }
    }
    for (const listener of this.listeners.get(type) ?? []) listener(report, this);
    for (const listener of this.listeners.get("*") ?? []) listener(report, this);
    this.world.emit?.("collisionreport", report);
    return report;
  }

  getReports(options = {}) {
    const sinceId = Number(options.sinceId ?? 0);
    const type = options.type;
    return this.reports.filter((report) => report.id > sinceId && (!type || report.type === type));
  }

  clearReports() {
    this.reports.length = 0;
  }

  on(type, listener) {
    if (typeof listener !== "function") throw new TypeError("listener must be a function.");
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
    return () => this.listeners.get(type)?.delete(listener);
  }
}
