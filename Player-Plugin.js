/**
 * Player-Plugin.js
 * Base contract for deterministic, server-authoritative Player extensions.
 */
export default class PlayerPlugin {
  constructor(options = {}) {
    const id = String(options.id ?? this.constructor.pluginId ?? "").trim();
    if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
      throw new Error("Player plugin id must start with a letter and contain only lowercase letters, numbers, _ or -.");
    }
    this.id = id;
    this.version = String(options.version ?? this.constructor.version ?? "1");
    this.priority = Number(options.priority ?? this.constructor.priority ?? 0);
    this.dependencies = [...(options.dependencies ?? this.constructor.dependencies ?? [])].map(String);
    this.networked = options.networked ?? this.constructor.networked ?? true;
    this.enabled = options.enabled !== false;
    this.state = structuredCloneSafe(options.state ?? {});
    this.player = null;
    this.config = null;
  }

  install(player, config = {}) {
    if (this.player && this.player !== player) throw new Error(`Plugin "${this.id}" is already installed.`);
    this.player = player;
    this.config = structuredCloneSafe(config);
  }

  uninstall() {
    this.player = null;
    this.config = null;
  }

  serialize() {
    return structuredCloneSafe(this.state);
  }

  deserialize(state) {
    this.state = structuredCloneSafe(state ?? {});
  }
}

function structuredCloneSafe(value) {
  if (typeof globalThis.structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
