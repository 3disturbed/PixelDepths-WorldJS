/**
 * Phone-first analog movement and configurable RPG action buttons.
 */
export default class OSJoypad {
  constructor(options = {}) {
    this.root = options.root ?? document.body;
    this.radius = Math.max(32, Number(options.radius ?? 58));
    this.deadzone = Math.max(0, Math.min(0.9, Number(options.deadzone ?? 0.12)));
    this.moveX = 0;
    this.moveY = 0;
    this.actions = new Map();
    this.listeners = new Map();
    this.pointerId = null;
    this.detachPlayer = null;
    this.buttons = options.buttons ?? [
      { id: "attack", label: "A", className: "primary" },
      { id: "interact", label: "B" },
      { id: "dodge", label: "X" },
      { id: "menu", label: "Y" },
    ];
    this.#mount();
  }

  #mount() {
    this.element = document.createElement("div");
    this.element.className = "os-joypad";
    this.element.innerHTML = `<div class="os-joypad__stick" aria-label="Movement joystick"><div class="os-joypad__knob"></div></div><div class="os-joypad__buttons"></div>`;
    this.root.append(this.element);
    this.stick = this.element.querySelector(".os-joypad__stick");
    this.knob = this.element.querySelector(".os-joypad__knob");
    const group = this.element.querySelector(".os-joypad__buttons");
    for (const spec of this.buttons) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `os-joypad__button ${spec.className ?? ""}`;
      button.dataset.action = spec.id;
      button.textContent = spec.label ?? spec.id;
      button.setAttribute("aria-label", spec.ariaLabel ?? spec.id);
      group.append(button);
      const setPressed = (pressed) => (event) => {
        event.preventDefault();
        if (pressed) button.setPointerCapture?.(event.pointerId);
        this.actions.set(spec.id, pressed);
        this.emit("action", { action: spec.id, pressed });
      };
      button.addEventListener("pointerdown", setPressed(true));
      button.addEventListener("pointerup", setPressed(false));
      button.addEventListener("pointercancel", setPressed(false));
    }
    this.stick.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      this.pointerId = event.pointerId;
      this.stick.setPointerCapture?.(event.pointerId);
      this.#moveStick(event);
    });
    this.stick.addEventListener("pointermove", (event) => {
      if (event.pointerId === this.pointerId) this.#moveStick(event);
    });
    const release = (event) => {
      if (event.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.moveX = 0;
      this.moveY = 0;
      this.knob.style.transform = "translate(0px, 0px)";
    };
    this.stick.addEventListener("pointerup", release);
    this.stick.addEventListener("pointercancel", release);
  }

  #moveStick(event) {
    const rect = this.stick.getBoundingClientRect();
    let x = event.clientX - rect.left - rect.width / 2;
    let y = event.clientY - rect.top - rect.height / 2;
    const length = Math.hypot(x, y);
    if (length > this.radius) {
      x *= this.radius / length;
      y *= this.radius / length;
    }
    const nx = x / this.radius;
    const ny = y / this.radius;
    const magnitude = Math.hypot(nx, ny);
    const scaled = magnitude <= this.deadzone ? 0 : (magnitude - this.deadzone) / (1 - this.deadzone);
    this.moveX = magnitude ? nx / magnitude * Math.min(1, scaled) : 0;
    this.moveY = magnitude ? ny / magnitude * Math.min(1, scaled) : 0;
    this.knob.style.transform = `translate(${x}px, ${y}px)`;
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
    this.listeners.clear();
    this.element.remove();
  }
}
