/**
 * Base class for deterministic objects placed into a World.
 */
export default class Placeable {
  constructor(options = {}) {
    this.type = String(options.type ?? this.constructor.type ?? "placeable");
    this.id = String(options.id ?? `${this.type}:${cryptoId()}`);
    this.x = Math.floor(Number(options.x ?? 0));
    this.y = Math.floor(Number(options.y ?? 0));
    this.altitude = Math.round(Number(options.altitude ?? 0));
    this.world = null;
  }

  canPlace(world) {
    if (!world?.collision?.inBounds(this.x, this.y)) {
      return { ok: false, reason: "out-of-bounds" };
    }
    const tile = world.collision.tileAt(this.x, this.y, this.altitude);
    if (!tile || tile.liquid || (!tile.solid && !tile.walkable)) {
      return { ok: false, reason: tile?.liquid ? "water" : "no-floor" };
    }
    return { ok: true, reason: null };
  }

  place(world) {
    const validation = this.canPlace(world);
    if (!validation.ok) return validation;
    world.addPlaceable(this);
    return { ok: true, placeable: this };
  }

  remove() {
    return this.world?.removePlaceable(this.id) ?? false;
  }

  render() {
    return false;
  }

  serialize() {
    return {
      id: this.id,
      type: this.type,
      x: this.x,
      y: this.y,
      altitude: this.altitude,
    };
  }
}

function cryptoId() {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
