import Placeable from "./Placeable.js";

/**
 * A placeable vertical connection between adjacent altitude layers.
 */
export default class Ladder extends Placeable {
  static type = "ladder";

  constructor(options = {}) {
    super({ ...options, type: Ladder.type });
    this.direction = options.direction === "down" ? "down" : "up";
    this.pairId = options.pairId == null ? null : String(options.pairId);
  }

  get targetAltitude() {
    return this.altitude + (this.direction === "up" ? 1 : -1);
  }

  canPlace(world) {
    const base = super.canPlace(world);
    if (!base.ok) return base;
    if (this.targetAltitude < world.minAltitude || this.targetAltitude > world.maxAltitude) {
      return { ok: false, reason: "altitude-limit" };
    }
    const targetTile = world.collision.tileAt(this.x, this.y, this.targetAltitude);
    if (targetTile?.liquid) return { ok: false, reason: "water" };
    const canBuildLanding = this.direction === "up" &&
      world.materialAt(this.x, this.y, this.targetAltitude) === world.constructor.AIR;
    if (!world.collision.isWalkableAt(this.x, this.y, this.targetAltitude) && !canBuildLanding) {
      return { ok: false, reason: "no-destination-floor" };
    }
    const sourceOccupied = world.getPlaceablesAt(this.x, this.y, this.altitude)
      .some((item) => item.type === this.type && item.direction === this.direction);
    const pairedDirection = this.direction === "up" ? "down" : "up";
    const targetOccupied = world.getPlaceablesAt(this.x, this.y, this.targetAltitude)
      .some((item) => item.type === this.type && item.direction === pairedDirection);
    return sourceOccupied || targetOccupied
      ? { ok: false, reason: "occupied" }
      : { ok: true, reason: null };
  }

  place(world) {
    const validation = this.canPlace(world);
    if (!validation.ok) return validation;

    let createdLanding = false;
    if (!world.collision.isWalkableAt(this.x, this.y, this.targetAltitude)) {
      world.setMaterial(
        this.x,
        this.y,
        this.targetAltitude,
        world.constructor.DIRT_FLOOR,
        { operationId: `ladder-floor:${this.id}`, render: false },
      );
      createdLanding = true;
    }

    const counterpart = new Ladder({
      id: `${this.id}:pair`,
      pairId: this.id,
      x: this.x,
      y: this.y,
      altitude: this.targetAltitude,
      direction: this.direction === "up" ? "down" : "up",
    });
    this.pairId = counterpart.id;
    world.addPlaceable(this);
    world.addPlaceable(counterpart);
    return {
      ok: true,
      placeable: this,
      counterpart,
      createdLanding,
    };
  }

  remove() {
    const world = this.world;
    if (!world) return false;
    const pairId = this.pairId;
    const removed = world.removePlaceable(this.id);
    if (pairId) world.removePlaceable(pairId);
    return removed;
  }

  use(player) {
    if (!this.world || !player) return { ok: false, reason: "not-placed" };
    if (Math.hypot(player.x - this.x, player.y - this.y) > 1.6) {
      return { ok: false, reason: "too-far" };
    }
    if (!this.world.collision.isWalkableAt(this.x, this.y, this.targetAltitude)) {
      return { ok: false, reason: "no-destination-floor" };
    }
    player.teleport(this.x + 0.5, this.y + 0.5, this.targetAltitude);
    this.world.setAltitude(this.targetAltitude);
    return { ok: true, altitude: this.targetAltitude };
  }

  render(ctx = this.world?.ctx) {
    if (!ctx || !this.world || this.world.altitude !== this.altitude) return false;
    const viewport = this.world.getViewport();
    const cellWidth = this.world.canvas.width / viewport.width;
    const cellHeight = this.world.canvas.height / viewport.height;
    const left = (this.x - viewport.x) * cellWidth;
    const top = (this.y - viewport.y) * cellHeight;
    const insetX = cellWidth * 0.25;
    const insetY = cellHeight * 0.12;
    ctx.save();
    ctx.strokeStyle = this.direction === "up" ? "#ddec64" : "#56b8d2";
    ctx.lineWidth = Math.max(2, Math.min(cellWidth, cellHeight) * 0.12);
    ctx.beginPath();
    ctx.moveTo(left + insetX, top + insetY);
    ctx.lineTo(left + insetX, top + cellHeight - insetY);
    ctx.moveTo(left + cellWidth - insetX, top + insetY);
    ctx.lineTo(left + cellWidth - insetX, top + cellHeight - insetY);
    for (let rung = 0.3; rung <= 0.75; rung += 0.225) {
      ctx.moveTo(left + insetX, top + cellHeight * rung);
      ctx.lineTo(left + cellWidth - insetX, top + cellHeight * rung);
    }
    ctx.stroke();
    ctx.restore();
    return true;
  }

  serialize() {
    return { ...super.serialize(), direction: this.direction, pairId: this.pairId };
  }
}
