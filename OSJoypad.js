/**
 * Phone-first canvas joypad. Drawing and hit testing stay in one non-selectable
 * surface so iOS cannot select labels or zoom individual DOM buttons.
 */
export default class OSJoypad {
  constructor(options = {}) {
    this.root = options.root ?? document.body;
    this.maximumStickRadius = Math.max(48, Number(options.radius ?? 114));
    this.deadzone = Math.max(0, Math.min(0.9, Number(options.deadzone ?? 0.12)));
    this.moveX = 0;
    this.moveY = 0;
    this.actions = new Map();
    this.actionPointers = new Map();
    this.listeners = new Map();
    this.pointerId = null;
    this.detachPlayer = null;
    this.buttons = options.buttons ?? [
      { id: "attack", label: "A", className: "primary" },
      { id: "interact", label: "B" },
      { id: "dodge", label: "X" },
      { id: "menu", label: "Y" },
    ];
    this.layout = null;
    this.#mount();
  }

  #mount() {
    this.element = document.createElement("canvas");
    this.element.className = "os-joypad";
    this.element.setAttribute("aria-label", "Touch movement and action controls");
    this.element.setAttribute("role", "application");
    this.root.append(this.element);
    this.ctx = this.element.getContext("2d");
    this.resizeHandler = () => this.#resize();
    globalThis.addEventListener?.("resize", this.resizeHandler);
    this.element.addEventListener("pointerdown", (event) => this.#pointerDown(event));
    this.element.addEventListener("pointermove", (event) => this.#pointerMove(event));
    this.element.addEventListener("pointerup", (event) => this.#release(event));
    this.element.addEventListener("pointercancel", (event) => this.#release(event));
    this.element.addEventListener("contextmenu", (event) => event.preventDefault());
    this.#resize();
  }

  #resize() {
    const rect = this.element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
    this.element.width = Math.max(1, Math.floor(rect.width * ratio));
    this.element.height = Math.max(1, Math.floor(rect.height * ratio));
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const landscape = rect.width > rect.height;
    const safeInset = landscape ? 40 : 28;
    const bottomInset = landscape ? 16 : 24;
    const stickRadius = Math.min(
      this.maximumStickRadius,
      rect.width * (landscape ? 0.135 : 0.21),
      rect.height * (landscape ? 0.275 : 0.16),
    );
    const buttonRadius = stickRadius * 0.41;
    const actionX = rect.width - safeInset - buttonRadius;
    const actionY = rect.height - bottomInset - stickRadius;
    const centers = [
      [actionX, actionY],
      [actionX - buttonRadius * 1.65, actionY - buttonRadius * 1.2],
      [actionX - buttonRadius * 1.65, actionY + buttonRadius * 1.2],
      [actionX - buttonRadius * 3.3, actionY],
    ];
    this.layout = {
      width: rect.width,
      height: rect.height,
      stick: {
        x: safeInset + stickRadius,
        y: rect.height - bottomInset - stickRadius,
        radius: stickRadius,
        knobRadius: stickRadius * 0.4,
      },
      buttons: this.buttons.map((button, index) => ({
        ...button,
        x: centers[index]?.[0] ?? actionX,
        y: centers[index]?.[1] ?? actionY,
        radius: index === 0 ? buttonRadius * 1.18 : buttonRadius,
      })),
    };
    this.#draw();
  }

  #pointerDown(event) {
    event.preventDefault();
    const point = this.#eventPoint(event);
    const stick = this.layout?.stick;
    if (stick && this.pointerId == null &&
        Math.hypot(point.x - stick.x, point.y - stick.y) <= stick.radius * 1.15) {
      this.pointerId = event.pointerId;
      this.element.setPointerCapture?.(event.pointerId);
      this.#moveStick(point);
      return;
    }
    const button = this.layout?.buttons.find((candidate) =>
      Math.hypot(point.x - candidate.x, point.y - candidate.y) <= candidate.radius * 1.12);
    if (!button) return;
    this.element.setPointerCapture?.(event.pointerId);
    this.actionPointers.set(event.pointerId, button.id);
    this.#setAction(button.id, true);
  }

  #pointerMove(event) {
    if (event.pointerId !== this.pointerId) return;
    event.preventDefault();
    this.#moveStick(this.#eventPoint(event));
  }

  #release(event) {
    event.preventDefault();
    if (event.pointerId === this.pointerId) {
      this.pointerId = null;
      this.moveX = 0;
      this.moveY = 0;
    }
    const action = this.actionPointers.get(event.pointerId);
    if (action) {
      this.actionPointers.delete(event.pointerId);
      this.#setAction(action, false);
    }
    this.#draw();
  }

  #moveStick(point) {
    const stick = this.layout.stick;
    const travel = Math.max(1, stick.radius - stick.knobRadius);
    let x = point.x - stick.x;
    let y = point.y - stick.y;
    const length = Math.hypot(x, y);
    if (length > travel) {
      x *= travel / length;
      y *= travel / length;
    }
    const nx = x / travel;
    const ny = y / travel;
    const magnitude = Math.hypot(nx, ny);
    const scaled = magnitude <= this.deadzone
      ? 0
      : (magnitude - this.deadzone) / (1 - this.deadzone);
    this.moveX = magnitude ? nx / magnitude * Math.min(1, scaled) : 0;
    this.moveY = magnitude ? ny / magnitude * Math.min(1, scaled) : 0;
    this.#draw(x, y);
  }

  #setAction(action, pressed) {
    this.actions.set(action, pressed);
    this.emit("action", { action, pressed });
    this.#draw();
  }

  #draw(offsetX = this.moveX * (this.layout?.stick.radius - this.layout?.stick.knobRadius || 0),
        offsetY = this.moveY * (this.layout?.stick.radius - this.layout?.stick.knobRadius || 0)) {
    if (!this.layout) return;
    const { ctx } = this;
    const { width, height, stick, buttons } = this.layout;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "rgba(16, 26, 27, 0.76)";
    ctx.strokeStyle = "rgba(154, 171, 164, 0.58)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(stick.x, stick.y, stick.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(83, 97, 91, 0.9)";
    ctx.strokeStyle = "rgba(221, 236, 100, 0.72)";
    ctx.beginPath();
    ctx.arc(stick.x + offsetX, stick.y + offsetY, stick.knobRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${Math.max(16, stick.radius * 0.24)}px ui-monospace, monospace`;
    for (const button of buttons) {
      const pressed = this.isPressed(button.id);
      ctx.fillStyle = pressed ? "rgba(38, 53, 54, 0.96)" : "rgba(21, 32, 33, 0.9)";
      ctx.strokeStyle = button.className === "primary"
        ? "rgba(221, 236, 100, 0.78)"
        : "rgba(141, 155, 148, 0.7)";
      ctx.beginPath();
      ctx.arc(button.x, button.y, button.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = button.className === "primary" ? "#ddec64" : "#e8e2d1";
      ctx.fillText(button.label ?? button.id, button.x, button.y);
    }
  }

  #eventPoint(event) {
    const rect = this.element.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  bind(player) {
    this.detachPlayer?.();
    this.detachPlayer = player.addControlSource(this);
    return this;
  }

  sampleControls() {
    return { moveX: this.moveX, moveY: this.moveY, sprint: this.isPressed("dodge") };
  }

  isPressed(action) {
    return this.actions.get(String(action)) === true;
  }

  on(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
    return () => this.listeners.get(type)?.delete(listener);
  }

  emit(type, detail) {
    for (const listener of this.listeners.get(type) ?? []) listener(detail, this);
  }

  setVisible(visible) {
    this.element.hidden = !visible;
  }

  destroy() {
    this.detachPlayer?.();
    globalThis.removeEventListener?.("resize", this.resizeHandler);
    this.listeners.clear();
    this.element.remove();
  }
}
