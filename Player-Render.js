/**
 * Player-Render.js
 * Sprite loading, animation, presentation smoothing, shadows, and fallback
 * drawing for Player.js. Rendering never mutates authoritative player state.
 */
export default class PlayerRender {
  constructor(player, options = {}) {
    this.player = player;
    this.spriteSize = 16;
    this.renderSize = Math.max(1, Number(options.renderSize ?? 16));
    this.spriteUrl = String(options.spriteUrl ?? "./player.png");
    this.sprite = null;
    this.ready = Promise.resolve(null);
    this.fallbackColor = String(options.fallbackColor ?? "#f3e56b");
    this.shadowColor = String(options.shadowColor ?? "rgba(3, 8, 10, 0.42)");
    this.animationRate = Math.max(1, Number(options.animationRate ?? 8));
    this.frame = 0;
    this.animationTime = 0;
    this.visualX = player.x;
    this.visualY = player.y;
    this.visualAltitude = player.altitude;
    this.positionSmoothing = Math.max(0, Number(options.positionSmoothing ?? 18));
    this.altitudeSmoothing = Math.max(0, Number(options.altitudeSmoothing ?? 14));
    this.bobStrength = Math.max(0, Number(options.bobStrength ?? 0.055));
    this.bob = 0;

    if (options.sprite && typeof options.sprite === "object") {
      this.setSprite(options.sprite);
    } else if (options.sprite !== false && typeof globalThis.Image === "function") {
      this.ready = this.loadSprite(this.spriteUrl);
    }
  }

  setSprite(image) {
    const width = Number(image?.naturalWidth ?? image?.width ?? 0);
    const height = Number(image?.naturalHeight ?? image?.height ?? 0);
    if (!image || width < 16 || height < 16) {
      this.sprite = null;
      this.player.emit("spriteerror", { url: this.spriteUrl, reason: "invalid-image" });
      return false;
    }
    this.sprite = image;
    this.player.emit("spriteload", { url: this.spriteUrl, width, height });
    return true;
  }

  loadSprite(url = this.spriteUrl, options = {}) {
    this.spriteUrl = String(url);
    if (typeof globalThis.Image !== "function") return Promise.resolve(null);
    this.ready = new Promise((resolve) => {
      const image = new Image();
      if (options.crossOrigin != null) image.crossOrigin = options.crossOrigin;
      image.decoding = "async";
      image.onload = () => {
        this.setSprite(image);
        resolve(image);
      };
      image.onerror = () => {
        this.sprite = null;
        this.player.emit("spriteerror", { url: this.spriteUrl, reason: "load-failed" });
        resolve(null);
      };
      image.src = this.spriteUrl;
    });
    return this.ready;
  }

  snap() {
    this.visualX = this.player.x;
    this.visualY = this.player.y;
    this.visualAltitude = this.player.altitude;
  }

  update(deltaSeconds) {
    const dt = Math.max(0, Math.min(Number(deltaSeconds), 0.1));
    const positionBlend = 1 - Math.exp(-this.positionSmoothing * dt);
    const altitudeBlend = 1 - Math.exp(-this.altitudeSmoothing * dt);
    this.visualX += (this.player.x - this.visualX) * positionBlend;
    this.visualY += (this.player.y - this.visualY) * positionBlend;
    this.visualAltitude += (this.player.altitude - this.visualAltitude) * altitudeBlend;

    if (!this.player.moving || this.player.falling) {
      this.frame = 0;
      this.animationTime = 0;
      this.bob += (0 - this.bob) * Math.min(1, dt * 14);
      return;
    }
    const speedRatio = Math.min(
      2,
      Math.hypot(this.player.velocityX, this.player.velocityY) / Math.max(0.01, this.player.speed),
    );
    this.animationTime += dt * this.animationRate * Math.max(0.45, speedRatio);
    this.frame = Math.floor(this.animationTime) % 4;
    this.bob = Math.sin(this.animationTime * Math.PI * 2) * this.bobStrength;
  }

  render(ctx = this.player.world.ctx, options = {}) {
    const world = this.player.world;
    const viewport = world.getViewport();
    if (this.visualX < viewport.x || this.visualY < viewport.y ||
        this.visualX >= viewport.x + viewport.width ||
        this.visualY >= viewport.y + viewport.height) return false;

    const cellWidth = world.canvas.width / viewport.width;
    const cellHeight = world.canvas.height / viewport.height;
    const size = Number(options.renderSize ?? this.renderSize) *
      Math.min(cellWidth, cellHeight) / world.tileSize;
    const screenX = (this.visualX - viewport.x) * cellWidth;
    const screenY = (this.visualY - viewport.y) * cellHeight - this.bob * size;
    const directionRow = { south: 0, west: 1, east: 2, north: 3 }[this.player.direction] ?? 0;
    const sourceX = (this.player.moving ? this.frame : 0) * 16;
    const sourceY = directionRow * 16;
    const spriteWidth = Number(this.sprite?.naturalWidth ?? this.sprite?.width ?? 0);
    const spriteHeight = Number(this.sprite?.naturalHeight ?? this.sprite?.height ?? 0);
    const renderContext = {
      ctx,
      options,
      viewport,
      screenX,
      screenY,
      size,
      renderer: this,
      cancelled: false,
    };
    this.player.runPluginHook("beforeRender", renderContext);
    if (renderContext.cancelled) return false;

    ctx.save();
    const shadowScale = this.player.falling
      ? Math.max(0.35, 1 - Math.max(0, this.player.altitude - this.visualAltitude) * 0.08)
      : 1;
    ctx.fillStyle = options.shadowColor ?? this.shadowColor;
    ctx.beginPath();
    ctx.ellipse?.(
      screenX,
      screenY + size * 0.22,
      size * 0.3 * shadowScale,
      size * 0.14 * shadowScale,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    if (this.sprite && sourceX + 16 <= spriteWidth && sourceY + 16 <= spriteHeight) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        this.sprite,
        sourceX,
        sourceY,
        16,
        16,
        screenX - size / 2,
        screenY - size * 0.72,
        size,
        size,
      );
    } else {
      ctx.fillStyle = options.fallbackColor ?? this.fallbackColor;
      ctx.strokeStyle = "#11191b";
      ctx.lineWidth = Math.max(1, size * 0.08);
      ctx.beginPath();
      ctx.arc(screenX, screenY, Math.max(2, size * 0.28), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(screenX, screenY);
      const facing = {
        north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0],
      }[this.player.direction];
      ctx.lineTo(screenX + facing[0] * size * 0.36, screenY + facing[1] * size * 0.36);
      ctx.stroke();
    }
    ctx.restore();
    this.player.runPluginHook("afterRender", renderContext);
    return true;
  }
}
