import Placeable from "./Placeable.js";

/**
 * A placeable vertical connection between adjacent altitude layers.
 */
export default class Ladder extends Placeable {
  static type = "ladder";

  constructor(options = {}) {
    super({ ...options, type: Ladder.type });
    this.direction = options.direction === "down" ? "down" : "up";
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
    if (!world.collision.isWalkableAt(this.x, this.y, this.targetAltitude)) {
      return { ok: false, reason: "no-destination-floor" };
    }
    const occupied = world.getPlaceablesAt(this.x, this.y, this.altitude)
      .some((item) => item.type === this.type && item.direction === this.direction);
    return occupied
      ? { ok: false, reason: "occupied" }
      : { ok: true, reason: null };
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
    return { ...super.serialize(), direction: this.direction };
  }
}
