import PlayerPlugin from "./Player-Plugin.js?v=20260727-7";
import PlayerRender from "./Player-Render.js?v=20260727-7";

/**
 * Player.js
 * Server-authoritative top-down player state with client prediction,
 * reconciliation, controls, collision-driven movement, and sprite rendering.
 */
export default class Player {
  static pluginRegistry = new Map();

  static registerPlugin(id, factory) {
    const key = String(id);
    if (!/^[a-z][a-z0-9_-]*$/.test(key)) throw new Error(`Invalid player plugin id: "${key}".`);
    if (typeof factory !== "function") throw new TypeError("Player plugin factory must be a function or class.");
    Player.pluginRegistry.set(key, factory);
  }

  static unregisterPlugin(id) {
    return Player.pluginRegistry.delete(String(id));
  }

  constructor(world, options = {}) {
    if (!world?.collision || typeof world.moveEntity !== "function") {
      throw new TypeError("Player requires a World with WorldCollision.");
    }
    this.world = world;
    this.id = String(options.id ?? `player-${Math.random().toString(36).slice(2)}`);
    this.role = options.role === "server" ? "server" : "client";
    const spawn = world.getSpawn();
    this.x = Number(options.x ?? spawn.x);
    this.y = Number(options.y ?? spawn.y);
    this.altitude = Number(
      options.altitude ?? world.getSurfaceAltitude(this.x, this.y) ?? world.minAltitude,
    );
    this.radius = Math.max(0.1, Number(options.radius ?? 0.38));
    this.speed = Math.max(0, Number(options.speed ?? 5));
    this.sprintMultiplier = Math.max(1, Number(options.sprintMultiplier ?? 1.65));
    this.acceleration = Math.max(0.01, Number(options.acceleration ?? 28));
    this.deceleration = Math.max(0.01, Number(options.deceleration ?? 36));
    this.airControl = Math.max(0, Math.min(1, Number(options.airControl ?? 0.35)));
    this.controlDeadzone = Math.max(0, Math.min(0.95, Number(options.controlDeadzone ?? 0.16)));
    this.gamepadIndex = Math.max(0, Math.trunc(options.gamepadIndex ?? 0));
    this.maxStep = Math.max(0, Number(options.maxStep ?? 1));
    this.maxDrop = Math.max(0, Number(options.maxDrop ?? 2));
    this.canSwim = options.canSwim !== false;
    this.allowDrop = options.allowDrop === true;
    this.maxInputDelta = Math.max(1 / 120, Number(options.maxInputDelta ?? 0.1));
    this.teleportThreshold = Math.max(0, Number(options.teleportThreshold ?? 3));
    this.reconcileThreshold = Math.max(0, Number(options.reconcileThreshold ?? 0.03));
    this.interpolation = Math.max(0, Math.min(1, Number(options.interpolation ?? 0.35)));

    this.direction = "south";
    this.moving = false;
    this.sprinting = false;
    this.falling = false;
    this.verticalVelocity = 0;
    this.velocityX = 0;
    this.velocityY = 0;
    this.inputSequence = 0;
    this.lastProcessedInput = 0;
    this.serverTick = 0;
    this.pendingInputs = [];
    this.serverInputQueue = [];
    this.controls = { up: false, down: false, left: false, right: false, sprint: false };
    this.controlTarget = null;
    this.controlHandlers = null;
    this.controlSources = new Set();
    this.onSendInput = typeof options.onSendInput === "function" ? options.onSendInput : null;
    this.onSendSnapshot = typeof options.onSendSnapshot === "function" ? options.onSendSnapshot : null;
    this.listeners = new Map();
    this.plugins = new Map();
    this.installingPlugins = new Set();

    const rendering = options.rendering ?? {};
    this.renderer = new PlayerRender(this, {
      ...rendering,
      sprite: options.sprite ?? rendering.sprite,
      spriteUrl: options.spriteUrl ?? rendering.spriteUrl,
      renderSize: options.renderSize ?? rendering.renderSize,
      fallbackColor: options.fallbackColor ?? rendering.fallbackColor,
      animationRate: options.animationRate ?? rendering.animationRate,
    });
    this.spriteReady = this.renderer.ready;
    for (const entry of options.plugins ?? []) {
      if (typeof entry === "string" || entry instanceof PlayerPlugin) this.usePlugin(entry);
      else this.usePlugin(entry.plugin ?? entry.id, entry.config ?? {});
    }
  }

  usePlugin(pluginOrId, config = {}) {
    let plugin = pluginOrId;
    let registryId = null;
    if (typeof pluginOrId === "string") {
      const id = pluginOrId;
      if (this.plugins.has(id)) return this.plugins.get(id);
      if (this.installingPlugins.has(id)) throw new Error(`Circular player plugin dependency at "${id}".`);
      const factory = Player.pluginRegistry.get(id);
      if (!factory) throw new Error(`Player plugin "${id}" is not registered.`);
      this.installingPlugins.add(id);
      registryId = id;
      plugin = factory.prototype instanceof PlayerPlugin
        ? new factory(config)
        : factory({ player: this, config });
    }
    try {
      if (!(plugin instanceof PlayerPlugin)) {
        throw new TypeError("Player plugins must extend PlayerPlugin.");
      }
      if (this.plugins.has(plugin.id)) return this.plugins.get(plugin.id);
      for (const dependency of plugin.dependencies) this.usePlugin(dependency);
      plugin.install(this, config);
      this.plugins.set(plugin.id, plugin);
      this.#sortPlugins();
      this.emit("plugininstall", { plugin });
      this.runPluginHook("installed", { plugin });
      return plugin;
    } finally {
      if (registryId) this.installingPlugins.delete(registryId);
    }
  }

  removePlugin(id, options = {}) {
    const key = String(id);
    const plugin = this.plugins.get(key);
    if (!plugin) return false;
    const dependents = [...this.plugins.values()].filter((candidate) => candidate.dependencies.includes(key));
    if (dependents.length && options.force !== true) {
      throw new Error(`Plugin "${key}" is required by: ${dependents.map((item) => item.id).join(", ")}.`);
    }
    if (options.force === true) {
      for (const dependent of dependents) this.removePlugin(dependent.id, { force: true });
    }
    this.runPluginHook("removing", { plugin });
    plugin.uninstall();
    this.plugins.delete(key);
    this.emit("pluginremove", { plugin });
    return true;
  }

  getPlugin(id) {
    return this.plugins.get(String(id)) ?? null;
  }

  getPluginManifest() {
    return [...this.plugins.values()]
      .filter((plugin) => plugin.networked)
      .map((plugin) => ({ id: plugin.id, version: plugin.version }));
  }

  #sortPlugins() {
    this.plugins = new Map([...this.plugins].sort((a, b) =>
      a[1].priority - b[1].priority || a[0].localeCompare(b[0])));
  }

  runPluginHook(name, context = {}) {
    const results = [];
    for (const plugin of this.plugins.values()) {
      if (!plugin.enabled) continue;
      const hook = plugin[name];
      if (typeof hook !== "function") continue;
      const result = hook.call(plugin, context, this);
      if (result && typeof result.then === "function") {
        throw new Error(`Player plugin hook "${plugin.id}.${name}" must be synchronous.`);
      }
      results.push({ plugin: plugin.id, result });
      if (result === false) context.cancelled = true;
    }
    return results;
  }

  setSprite(image) {
    return this.renderer.setSprite(image);
  }

  loadSprite(url = this.renderer.spriteUrl, options = {}) {
    this.spriteReady = this.renderer.loadSprite(url, options);
    return this.spriteReady;
  }

  attachControls(target = globalThis) {
    this.detachControls();
    if (!target?.addEventListener) throw new TypeError("Control target must support events.");
    const keyMap = {
      KeyW: "up", ArrowUp: "up",
      KeyS: "down", ArrowDown: "down",
      KeyA: "left", ArrowLeft: "left",
      KeyD: "right", ArrowRight: "right",
      ShiftLeft: "sprint", ShiftRight: "sprint",
    };
    const update = (pressed) => (event) => {
      const control = keyMap[event.code];
      if (!control) return;
      this.controls[control] = pressed;
      if (optionsPreventDefault(target, event)) event.preventDefault();
    };
    let lastTouchEnd = -Infinity;
    const consume = (event) => {
      if (!event.cancelable) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };
    const touchend = (event) => {
      const now = Number(event.timeStamp ?? globalThis.performance?.now?.() ?? Date.now());
      if (now - lastTouchEnd <= 350) consume(event);
      lastTouchEnd = now;
    };
    this.controlHandlers = {
      keydown: update(true),
      keyup: update(false),
      blur: () => this.clearControls(),
      touchend,
      dblclick: consume,
    };
    this.controlTarget = target;
    target.addEventListener("keydown", this.controlHandlers.keydown);
    target.addEventListener("keyup", this.controlHandlers.keyup);
    target.addEventListener("blur", this.controlHandlers.blur);
    target.addEventListener("touchend", this.controlHandlers.touchend, { passive: false });
    target.addEventListener("dblclick", this.controlHandlers.dblclick);
    return () => this.detachControls();

    function optionsPreventDefault(controlTarget, event) {
      return controlTarget !== globalThis || ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code);
    }
  }

  detachControls() {
    if (!this.controlTarget || !this.controlHandlers) return;
    this.controlTarget.removeEventListener("keydown", this.controlHandlers.keydown);
    this.controlTarget.removeEventListener("keyup", this.controlHandlers.keyup);
    this.controlTarget.removeEventListener("blur", this.controlHandlers.blur);
    this.controlTarget.removeEventListener("touchend", this.controlHandlers.touchend);
    this.controlTarget.removeEventListener("dblclick", this.controlHandlers.dblclick);
    this.controlTarget = null;
    this.controlHandlers = null;
    this.clearControls();
  }

  clearControls() {
    for (const key of Object.keys(this.controls)) this.controls[key] = false;
  }

  addControlSource(source) {
    if (!source || typeof source.sampleControls !== "function") {
      throw new TypeError("Control source must implement sampleControls().");
    }
    this.controlSources.add(source);
    return () => this.controlSources.delete(source);
  }

  sampleControls() {
    let moveX = Number(this.controls.right) - Number(this.controls.left);
    let moveY = Number(this.controls.down) - Number(this.controls.up);
    let sprint = Boolean(this.controls.sprint);
    const gamepad = globalThis.navigator?.getGamepads?.()?.[this.gamepadIndex];
    if (gamepad?.connected) {
      const axisX = applyDeadzone(Number(gamepad.axes[0] ?? 0), this.controlDeadzone);
      const axisY = applyDeadzone(Number(gamepad.axes[1] ?? 0), this.controlDeadzone);
      if (Math.hypot(axisX, axisY) > Math.hypot(moveX, moveY)) {
        moveX = axisX;
        moveY = axisY;
      }
      sprint ||= Boolean(gamepad.buttons[0]?.pressed || gamepad.buttons[10]?.pressed);
    }
    for (const source of this.controlSources) {
      const sampled = source.sampleControls() ?? {};
      const sourceX = Number(sampled.moveX ?? 0);
      const sourceY = Number(sampled.moveY ?? 0);
      if (Math.hypot(sourceX, sourceY) > Math.hypot(moveX, moveY)) {
        moveX = sourceX;
        moveY = sourceY;
      }
      sprint ||= Boolean(sampled.sprint);
    }
    const length = Math.hypot(moveX, moveY);
    if (length > 1) {
      moveX /= length;
      moveY /= length;
    }
    return { moveX, moveY, sprint };
  }

  createInput(controls = this.sampleControls(), deltaSeconds = 1 / 60) {
    const input = {
      playerId: this.id,
      sequence: ++this.inputSequence,
      moveX: Math.max(-1, Math.min(1, Number(controls.moveX ?? 0))),
      moveY: Math.max(-1, Math.min(1, Number(controls.moveY ?? 0))),
      sprint: Boolean(controls.sprint),
      delta: Math.max(0, Math.min(Number(deltaSeconds), this.maxInputDelta)),
      clientTime: globalThis.performance?.now?.() ?? Date.now(),
      plugins: {},
    };
    const context = { input, controls, cancelled: false };
    this.runPluginHook("augmentInput", context);
    return input;
  }

  update(deltaSeconds, controls = null) {
    const dt = Math.max(0, Math.min(Number(deltaSeconds), this.maxInputDelta));
    this.runPluginHook("update", { delta: dt, controls, cancelled: false });
    if (this.falling) {
      const fall = this.world.updateFalling(this, dt);
      this.falling = fall.falling;
      if (fall.landed) this.emit("landing", fall.report);
      this.#animate(dt);
      return { mode: "falling", ...fall };
    }
    if (this.role === "server") {
      const snapshots = this.processServerInputs();
      this.#animate(dt);
      return { mode: "server", snapshots };
    }

    const input = this.createInput(controls ?? this.sampleControls(), dt);
    const result = this.predictInput(input);
    this.onSendInput?.(input, this);
    this.#animate(dt);
    return { mode: "client", input, result };
  }

  predictInput(input) {
    if (this.role !== "client") throw new Error("Only client players predict input.");
    const result = this.#applyInput(input, { predicted: true });
    this.pendingInputs.push({ ...input });
    this.emit("prediction", { input, result });
    return result;
  }

  enqueueInput(input) {
    if (this.role !== "server") throw new Error("Only server players queue authoritative input.");
    if (!input || input.playerId !== this.id) return false;
    const sequence = Math.trunc(input.sequence);
    if (!Number.isSafeInteger(sequence) || sequence <= this.lastProcessedInput) return false;
    if (!Number.isFinite(input.moveX) || !Number.isFinite(input.moveY) || !Number.isFinite(input.delta)) return false;
    if (Object.keys(input.plugins ?? {}).some((id) => {
      const plugin = this.plugins.get(id);
      return !plugin || !plugin.networked;
    })) return false;
    const validatedInput = {
      playerId: this.id,
      sequence,
      moveX: Math.max(-1, Math.min(1, input.moveX)),
      moveY: Math.max(-1, Math.min(1, input.moveY)),
      sprint: Boolean(input.sprint),
      delta: Math.max(0, Math.min(input.delta, this.maxInputDelta)),
      clientTime: Number(input.clientTime ?? 0),
      plugins: cloneData(input.plugins ?? {}),
    };
    const validation = { input: validatedInput, cancelled: false };
    this.runPluginHook("validateInput", validation);
    if (validation.cancelled) return false;
    this.serverInputQueue.push(validatedInput);
    this.serverInputQueue.sort((a, b) => a.sequence - b.sequence);
    return true;
  }

  processServerInputs(limit = 32) {
    if (this.role !== "server") throw new Error("Only server players process authoritative input.");
    const snapshots = [];
    let processed = 0;
    while (this.serverInputQueue.length && processed < limit) {
      const input = this.serverInputQueue.shift();
      if (input.sequence <= this.lastProcessedInput) continue;
      const result = this.#applyInput(input, { authoritative: true });
      this.lastProcessedInput = input.sequence;
      this.serverTick++;
      const snapshot = this.createSnapshot();
      snapshots.push(snapshot);
      this.onSendSnapshot?.(snapshot, this);
      this.emit("authority", { input, result, snapshot });
      processed++;
    }
    return snapshots;
  }

  #applyInput(input, context = {}) {
    const inputContext = { input, ...context, cancelled: false };
    this.runPluginHook("beforeInput", inputContext);
    if (inputContext.cancelled) return { cancelled: true, blocked: true, reason: "plugin" };
    let moveX = Number(input.moveX ?? 0);
    let moveY = Number(input.moveY ?? 0);
    const length = Math.hypot(moveX, moveY);
    if (length > 1) {
      moveX /= length;
      moveY /= length;
    }
    const dt = Math.max(0, Math.min(Number(input.delta ?? 0), this.maxInputDelta));
    const sprinting = Boolean(input.sprint);
    const movement = {
      input,
      speed: this.speed,
      sprintMultiplier: this.sprintMultiplier,
      moveX,
      moveY,
      delta: dt,
      cancelled: false,
    };
    this.runPluginHook("beforeMove", movement);
    if (movement.cancelled) return { cancelled: true, blocked: true, reason: "plugin" };
    const targetSpeed = movement.speed * (sprinting ? movement.sprintMultiplier : 1);
    const hasInput = Math.hypot(movement.moveX, movement.moveY) > 0.001;
    const response = hasInput ? this.acceleration : this.deceleration;
    const control = this.falling ? this.airControl : 1;
    this.velocityX = approach(this.velocityX, movement.moveX * targetSpeed, response * control * dt);
    this.velocityY = approach(this.velocityY, movement.moveY * targetSpeed, response * control * dt);
    const dx = this.velocityX * dt;
    const dy = this.velocityY * dt;
    this.moving = Math.hypot(this.velocityX, this.velocityY) > 0.025;
    this.sprinting = sprinting && this.moving;
    if (this.moving) this.#updateDirection(this.velocityX, this.velocityY);

    const result = this.world.moveEntity(this, dx, dy, {
      radius: this.radius,
      maxStep: this.maxStep,
      maxDrop: this.maxDrop,
      allowDrop: this.allowDrop,
      canSwim: this.canSwim,
    });
    if (result.drop?.isDrop && this.allowDrop && !result.drop.safe) {
      this.falling = true;
      this.fallStartAltitude = result.drop.fromAltitude;
      this.altitude = result.drop.fromAltitude;
      this.verticalVelocity = 0;
    }
    if (result.blockedX || (result.blocked && !result.blockedY)) this.velocityX = 0;
    if (result.blockedY || (result.blocked && !result.blockedX)) this.velocityY = 0;
    this.runPluginHook("afterMove", { input, movement, result, ...context });
    this.runPluginHook("afterInput", { input, result, ...context });
    this.emit("move", { input, result, ...context });
    return result;
  }

  #updateDirection(x, y) {
    if (Math.abs(x) > Math.abs(y)) this.direction = x < 0 ? "west" : "east";
    else this.direction = y < 0 ? "north" : "south";
  }

  createSnapshot() {
    const plugins = {};
    for (const plugin of this.plugins.values()) {
      if (!plugin.networked) continue;
      plugins[plugin.id] = {
        version: plugin.version,
        state: plugin.serialize(),
      };
    }
    const snapshot = {
      protocol: 1,
      type: "player-state",
      worldId: this.world.worldId,
      playerId: this.id,
      serverTick: this.serverTick,
      lastProcessedInput: this.lastProcessedInput,
      x: this.x,
      y: this.y,
      altitude: this.altitude,
      direction: this.direction,
      moving: this.moving,
      sprinting: this.sprinting,
      falling: this.falling,
      verticalVelocity: this.verticalVelocity,
      velocityX: this.velocityX,
      velocityY: this.velocityY,
      plugins,
    };
    this.runPluginHook("beforeSnapshot", { snapshot, cancelled: false });
    return snapshot;
  }

  applySnapshot(snapshot) {
    if (this.role !== "client") throw new Error("Only client players reconcile snapshots.");
    if (!snapshot || snapshot.protocol !== 1 || snapshot.type !== "player-state" ||
        snapshot.worldId !== this.world.worldId || snapshot.playerId !== this.id) {
      throw new Error("Player snapshot belongs to another protocol, world, or player.");
    }
    const acknowledged = Math.trunc(snapshot.lastProcessedInput ?? 0);
    if (acknowledged < this.lastProcessedInput) return { ignored: true, corrected: false, replayed: 0 };
    this.lastProcessedInput = acknowledged;
    this.pendingInputs = this.pendingInputs.filter((input) => input.sequence > acknowledged);

    const snapshotPlugins = snapshot.plugins ?? {};
    for (const plugin of this.plugins.values()) {
      if (plugin.networked && !(plugin.id in snapshotPlugins)) {
        throw new Error(`Authoritative snapshot is missing player plugin "${plugin.id}".`);
      }
    }
    for (const [id, payload] of Object.entries(snapshotPlugins)) {
      const plugin = this.plugins.get(id);
      if (!plugin || !plugin.networked) throw new Error(`Missing required networked player plugin "${id}".`);
      if (plugin.version !== String(payload.version)) {
        throw new Error(`Player plugin version mismatch for "${id}".`);
      }
      plugin.deserialize(payload.state);
    }

    const error = Math.hypot(this.x - snapshot.x, this.y - snapshot.y);
    const altitudeError = Math.abs(this.altitude - snapshot.altitude);
    const velocityError = Math.hypot(
      this.velocityX - Number(snapshot.velocityX ?? 0),
      this.velocityY - Number(snapshot.velocityY ?? 0),
    );
    const corrected = error > this.reconcileThreshold ||
      altitudeError > this.reconcileThreshold ||
      velocityError > this.reconcileThreshold;
    let replayed = 0;
    if (corrected) {
      this.x = snapshot.x;
      this.y = snapshot.y;
      this.altitude = snapshot.altitude;
      this.velocityX = Number(snapshot.velocityX ?? 0);
      this.velocityY = Number(snapshot.velocityY ?? 0);
      const replay = this.pendingInputs.slice();
      for (const input of replay) this.#applyInput(input, { replayed: true });
      replayed = replay.length;
    }
    this.direction = snapshot.direction;
    this.falling = Boolean(snapshot.falling);
    this.verticalVelocity = Number(snapshot.verticalVelocity ?? 0);
    this.emit("reconcile", {
      snapshot,
      error,
      altitudeError,
      velocityError,
      corrected,
      replayed,
    });
    this.runPluginHook("afterSnapshot", { snapshot, corrected, replayed });
    return { ignored: false, corrected, error, altitudeError, velocityError, replayed };
  }

  #animate(deltaSeconds) {
    this.renderer.update(deltaSeconds);
  }

  render(ctx = this.world.ctx, options = {}) {
    return this.renderer.render(ctx, options);
  }

  teleport(x, y, altitude = null, options = {}) {
    if (!this.world.collision.inBounds(x, y)) throw new RangeError("Teleport target is outside the world.");
    this.x = Number(x);
    this.y = Number(y);
    this.altitude = Number(altitude ?? this.world.getSurfaceAltitude(x, y) ?? this.world.minAltitude);
    this.verticalVelocity = 0;
    this.velocityX = 0;
    this.velocityY = 0;
    this.falling = false;
    this.pendingInputs.length = 0;
    this.renderer.snap();
    if (options.report !== false) this.emit("teleport", this.createSnapshot());
  }

  on(type, listener) {
    if (typeof listener !== "function") throw new TypeError("listener must be a function.");
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
    return () => this.listeners.get(type)?.delete(listener);
  }

  emit(type, detail) {
    for (const listener of this.listeners.get(type) ?? []) listener(detail, this);
    for (const listener of this.listeners.get("*") ?? []) listener({ type, ...detail }, this);
  }

  destroy() {
    this.detachControls();
    for (const plugin of [...this.plugins.values()].reverse()) {
      this.removePlugin(plugin.id, { force: true });
    }
    this.pendingInputs.length = 0;
    this.serverInputQueue.length = 0;
    this.controlSources.clear();
    this.listeners.clear();
    this.world.removePlayer?.(this.id, { destroy: false });
  }
}

function cloneData(value) {
  if (typeof globalThis.structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function approach(current, target, amount) {
  if (current < target) return Math.min(target, current + amount);
  if (current > target) return Math.max(target, current - amount);
  return target;
}

function applyDeadzone(value, deadzone) {
  const magnitude = Math.abs(value);
  if (magnitude <= deadzone) return 0;
  return Math.sign(value) * ((magnitude - deadzone) / (1 - deadzone));
}
