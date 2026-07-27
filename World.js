import WorldCollision from "./World-Collision.js?v=20260727-8";
import Player from "./Player.js?v=20260727-8";

/**
 * World.js
 * Chunked, deterministic, layered pixel terrain for browser games.
 * Native ES6, HTML5 Canvas, no dependencies.
 */
export default class World {
  static BIOMES = {
    meadows: { id: 0, name: "Spawn Meadows", start: 0, end: 0.22, heightBias: 0.08, ridgeStrength: 0.2, surface: "grass", shallow: "soil", beach: "sand", tint: [1.08, 1.08, 0.94], danger: 0, resourceSpawnNodes: [], caves: { enabled: false, density: 0, floodedChance: 0 } },
    greenwood: { id: 1, name: "Greenwood", start: 0.16, end: 0.43, heightBias: 0.05, ridgeStrength: 0.48, surface: "grass", shallow: "soil", beach: "sand", tint: [0.78, 1.02, 0.78], danger: 1, resourceSpawnNodes: [], caves: { enabled: true, density: 0.5, floodedChance: 0.08 } },
    mire: { id: 2, name: "Sunken Mire", start: 0.35, end: 0.62, heightBias: -0.12, ridgeStrength: 0.16, surface: "sand", shallow: "soil", beach: "sand", tint: [0.72, 0.86, 0.68], danger: 2, resourceSpawnNodes: [], caves: { enabled: true, density: 0.75, floodedChance: 0.65 } },
    highlands: { id: 3, name: "Frozen Highlands", start: 0.54, end: 0.82, heightBias: 0.15, ridgeStrength: 1.25, surface: "stone", shallow: "stone", beach: "stone", tint: [0.84, 1.05, 1.14], danger: 3, resourceSpawnNodes: [], caves: { enabled: true, density: 0.62, floodedChance: 0.02 } },
    ember_reach: { id: 4, name: "Ember Reach", start: 0.74, end: 1.2, heightBias: 0.06, ridgeStrength: 0.9, surface: "stone", shallow: "stone", beach: "stone", tint: [1.2, 0.76, 0.62], danger: 4, resourceSpawnNodes: [], caves: { enabled: true, density: 0.9, floodedChance: 0 } },
  };

  static GENERATION = {
    version: 1,
    terrain: { seaLevel: 0, continentScale: 1150, continentOctaves: 4, continentPersistence: 0.52, detailScale: 180, detailOctaves: 3, detailStrength: 0.24, domainWarpScale: 760, domainWarpStrength: 210, ridgeScale: 260, ridgeThreshold: 0.56, elevationAmplitude: 7.2, landBias: 0.5, islandFalloffStart: 0.82, islandFalloffStrength: 0.9, coastWidth: 0.12, deepMaterial: "stone" },
    spawn: { radius: 320, flatRadius: 92, blendRadius: 180, altitude: 1, clearCaves: true, clearResourcesRadius: 72 },
    caves: { enabled: true, noiseScale: 54, detailScale: 19, threshold: 0.72, minAltitude: -5, maxAltitude: -1, entranceSpacing: 192, entranceJitter: 0.72, entranceChance: 0.46, minRadius: 5, maxRadius: 13, minDepth: 2, maxDepth: 5 },
    resourceSpawnNodes: { enabled: true, spacing: 96, jitter: 0.76, maxPerChunk: 8, minimumSeparation: 18 },
    rendering: { tileSize: 16, tilemapUrl: "./Tiles.png", fallbackCellSize: 16 },
  };

  static TILES = {
    air: {
      id: 0,
      name: "Air",
      color: [9, 15, 21],
      solid: false,
      mineable: false,
      liquid: false,
      hardness: 0,
    },
    water: {
      id: 1,
      name: "Water",
      color: [26, 111, 145],
      solid: false,
      mineable: false,
      liquid: true,
      hardness: 0,
    },
    sand: {
      id: 2,
      name: "Sand",
      color: [216, 174, 91],
      solid: true,
      mineable: true,
      liquid: false,
      hardness: 1,
    },
    grass: {
      id: 3,
      name: "Grass",
      color: [74, 126, 71],
      solid: true,
      mineable: true,
      liquid: false,
      hardness: 1,
    },
    soil: {
      id: 4,
      name: "Soil",
      color: [112, 72, 48],
      solid: true,
      mineable: true,
      liquid: false,
      hardness: 2,
    },
    stone: {
      id: 5,
      name: "Stone",
      color: [91, 99, 101],
      solid: true,
      mineable: true,
      liquid: false,
      hardness: 4,
    },
    ore: {
      id: 6,
      name: "Ore",
      color: [190, 112, 47],
      solid: true,
      mineable: true,
      liquid: false,
      hardness: 6,
    },
    crystal: {
      id: 7,
      name: "Crystal",
      color: [86, 207, 190],
      solid: true,
      mineable: true,
      liquid: false,
      hardness: 8,
    },
    forest_floor: { id: 8, name: "Forest Floor", color: [48, 91, 56], solid: true, mineable: true, liquid: false, hardness: 1 },
    mud: { id: 9, name: "Mud", color: [82, 73, 51], solid: true, mineable: true, liquid: false, hardness: 1 },
    peat: { id: 10, name: "Peat", color: [66, 54, 42], solid: true, mineable: true, liquid: false, hardness: 2 },
    snow: { id: 11, name: "Snow", color: [194, 218, 218], solid: true, mineable: true, liquid: false, hardness: 1 },
    ash: { id: 12, name: "Ash", color: [75, 66, 64], solid: true, mineable: true, liquid: false, hardness: 2 },
    basalt: { id: 13, name: "Basalt", color: [55, 53, 59], solid: true, mineable: true, liquid: false, hardness: 7 },
    flint: { id: 14, name: "Flint", color: [137, 145, 139], solid: true, mineable: true, liquid: false, hardness: 3, resource: true },
    copper: { id: 15, name: "Copper", color: [181, 105, 61], solid: true, mineable: true, liquid: false, hardness: 6, resource: true },
    tin: { id: 16, name: "Tin", color: [165, 177, 178], solid: true, mineable: true, liquid: false, hardness: 5, resource: true },
    iron: { id: 17, name: "Iron", color: [119, 105, 91], solid: true, mineable: true, liquid: false, hardness: 7, resource: true },
    silver: { id: 18, name: "Silver", color: [190, 207, 212], solid: true, mineable: true, liquid: false, hardness: 8, resource: true },
    obsidian: { id: 19, name: "Obsidian", color: [45, 36, 58], solid: true, mineable: true, liquid: false, hardness: 9, resource: true },
    ember_crystal: { id: 20, name: "Ember Crystal", color: [234, 91, 49], solid: true, mineable: true, liquid: false, hardness: 10, resource: true },
    dirt_floor: { id: 21, name: "Dirt Floor", color: [91, 59, 40], solid: false, walkable: true, mineable: false, liquid: false, hardness: 0 },
  };

  static AIR = 0;
  static WATER = 1;
  static SAND = 2;
  static GRASS = 3;
  static SOIL = 4;
  static STONE = 5;
  static ORE = 6;
  static CRYSTAL = 7;
  static DIRT_FLOOR = 21;
  static PROTOCOL = 1;

  static async loadTiles(url = "./tiles.json", options = {}) {
    const response = await fetch(url, {
      cache: options.cache ?? "no-cache",
      signal: options.signal,
    });
    if (!response.ok) {
      throw new Error(`Unable to load tiles from "${url}" (${response.status} ${response.statusText}).`);
    }
    const tiles = await response.json();
    if (!tiles || typeof tiles !== "object" || Array.isArray(tiles)) {
      throw new TypeError(`Tile file "${url}" must contain a JSON object.`);
    }
    return tiles;
  }

  static async loadBiomes(url = "./Biomes.json", options = {}) {
    const response = await fetch(url, {
      cache: options.cache ?? "no-cache",
      signal: options.signal,
    });
    if (!response.ok) {
      throw new Error(`Unable to load biomes from "${url}" (${response.status} ${response.statusText}).`);
    }
    const biomes = await response.json();
    if (!biomes || typeof biomes !== "object" || Array.isArray(biomes)) {
      throw new TypeError(`Biome file "${url}" must contain a JSON object.`);
    }
    return biomes;
  }

  static async loadGeneration(url = "./generation.json", options = {}) {
    const response = await fetch(url, {
      cache: options.cache ?? "no-cache",
      signal: options.signal,
    });
    if (!response.ok) {
      throw new Error(`Unable to load generation settings from "${url}" (${response.status} ${response.statusText}).`);
    }
    const generation = await response.json();
    if (!generation || typeof generation !== "object" || Array.isArray(generation)) {
      throw new TypeError(`Generation file "${url}" must contain a JSON object.`);
    }
    return generation;
  }

  constructor(canvas, options = {}) {
    if (!canvas || typeof canvas.getContext !== "function" ||
        typeof canvas.getBoundingClientRect !== "function") {
      throw new TypeError("World requires an HTMLCanvasElement.");
    }

    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    if (!this.ctx) throw new Error("A 2D canvas context is required.");

    this.width = this.#positiveInteger(options.width ?? 16384, "width");
    this.height = this.#positiveInteger(options.height ?? 16384, "height");
    this.chunkSize = this.#positiveInteger(options.chunkSize ?? 64, "chunkSize");
    this.minAltitude = Math.trunc(options.minAltitude ?? -5);
    this.maxAltitude = Math.trunc(options.maxAltitude ?? 5);
    if (this.minAltitude > this.maxAltitude) throw new RangeError("minAltitude must not exceed maxAltitude.");

    this.altitude = this.#clampAltitude(options.altitude ?? 0);
    this.seed = Math.trunc(options.seed ?? 4182);
    this.worldId = String(options.worldId ?? `world-${this.seed}`);
    this.actorId = String(options.actorId ?? "client");
    this.brushRadius = Number(options.brushRadius ?? 7);
    this.zoom = Math.max(
      1,
      Number(options.zoom ?? options.generation?.rendering?.fallbackCellSize ??
        World.GENERATION.rendering.fallbackCellSize),
    );
    this.camera = {
      x: Number(options.cameraX ?? this.width / 2),
      y: Number(options.cameraY ?? this.height / 2),
    };
    this.maxLoadedChunks = Math.max(8, Math.trunc(options.maxLoadedChunks ?? 512));
    this.maxChangeLog = Math.max(0, Math.trunc(options.maxChangeLog ?? 10000));
    this.autoRender = options.autoRender !== false;

    this.chunks = new Map();
    this.dirtyChunks = new Set();
    this.changeLog = [];
    this.outgoingChanges = [];
    this.listeners = new Map();
    this.seenOperations = new Set();
    this.revision = 0;
    this.remoteRevision = 0;
    this.operationSequence = 0;
    this.accessClock = 0;
    this.pointer = { x: 0, y: 0, active: false };
    this.stats = { removed: 0, lastMaterial: "—", loadedChunks: 0 };

    this.tiles = this.#prepareTiles(options.tiles ?? World.TILES);
    this.tileSetId = String(options.tileSetId ?? "worldjs-default-v1");
    this.biomeSetId = String(options.biomeSetId ?? "worldjs-center-out-v1");
    this.generationSetId = String(options.generationSetId ?? "worldjs-generation-v1");
    this.generation = this.#prepareGeneration(options.generation ?? World.GENERATION);
    this.biomes = this.#prepareBiomes(options.biomes ?? World.BIOMES);
    this.biomeOrder = Object.entries(this.biomes).sort((a, b) => a[1].start - b[1].start);
    this.biomeCenter = {
      x: Number(options.biomeCenterX ?? this.width / 2),
      y: Number(options.biomeCenterY ?? this.height / 2),
    };
    this.spawnRadius = Math.max(8, Number(options.spawnRadius ?? this.generation.spawn.radius));
    this.biomeWarpStrength = Math.max(0, Number(options.biomeWarpStrength ?? 0.065));
    this.biomeWarpScale = Math.max(16, Number(options.biomeWarpScale ?? Math.min(this.width, this.height) / 11));
    this.biomeMaxRadius = Math.hypot(
      Math.max(this.biomeCenter.x, this.width - this.biomeCenter.x),
      Math.max(this.biomeCenter.y, this.height - this.biomeCenter.y),
    );
    this.resourceNodeCache = new Map();
    this.caveEntranceCache = new Map();
    this.tileById = new Map(Object.entries(this.tiles).map(([key, tile]) => [tile.id, { key, ...tile }]));
    this.palette = Object.fromEntries([...this.tileById].map(([id, tile]) => [id, tile.color]));
    this.materialNames = [];
    for (const [id, tile] of this.tileById) this.materialNames[id] = tile.key;
    this.tileSize = 16;
    this.tilemap = null;
    this.tilemapUrl = options.tilemapUrl ?? this.generation.rendering.tilemapUrl;
    this.tilemapReady = Promise.resolve(null);
    this.collision = new WorldCollision(this, options.collision);
    this.players = new Map();
    this.placeables = new Map();

    this.buffer = (canvas.ownerDocument ?? document).createElement("canvas");
    this.bufferCtx = this.buffer.getContext("2d", { alpha: false });
    if (options.tilemap && typeof options.tilemap === "object") {
      this.setTilemap(options.tilemap);
    } else if (options.tilemap !== false && this.tilemapUrl && typeof globalThis.Image === "function") {
      this.tilemapReady = this.loadTilemap(this.tilemapUrl);
    }
    this.resize();
  }

  #positiveInteger(value, name) {
    const number = Math.trunc(Number(value));
    if (!Number.isSafeInteger(number) || number <= 0) throw new RangeError(`${name} must be a positive safe integer.`);
    return number;
  }

  #prepareTiles(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new TypeError("tiles must be a JSON object keyed by tile name.");
    }
    const tiles = JSON.parse(JSON.stringify(source));
    const ids = new Set();
    for (const [key, tile] of Object.entries(tiles)) {
      if (!tile || typeof tile !== "object" || Array.isArray(tile)) {
        throw new TypeError(`Tile "${key}" must be an object.`);
      }
      if (!Number.isInteger(tile.id) || tile.id < 0 || tile.id > 255 || ids.has(tile.id)) {
        throw new RangeError(`Tile "${key}" requires a unique integer id from 0 to 255.`);
      }
      if (!Array.isArray(tile.color) || tile.color.length !== 3 ||
          tile.color.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
        throw new RangeError(`Tile "${key}" requires an RGB color array.`);
      }
      tile.name = String(tile.name ?? key);
      tile.solid = Boolean(tile.solid);
      tile.walkable = Boolean(tile.walkable);
      tile.mineable = Boolean(tile.mineable);
      tile.liquid = Boolean(tile.liquid);
      tile.hardness = Math.max(0, Number(tile.hardness ?? 0));
      ids.add(tile.id);
    }
    for (const required of ["air", "water", "sand", "grass", "soil", "stone", "ore", "crystal"]) {
      if (!tiles[required]) throw new Error(`Missing generator tile: "${required}".`);
      if (tiles[required].id !== World.TILES[required].id) {
        throw new Error(`Generator tile "${required}" must use id ${World.TILES[required].id}.`);
      }
    }
    return tiles;
  }

  #prepareBiomes(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new TypeError("biomes must be a JSON object keyed by biome name.");
    }
    const biomes = JSON.parse(JSON.stringify(source));
    const ids = new Set();
    for (const [key, biome] of Object.entries(biomes)) {
      if (!biome || typeof biome !== "object" || Array.isArray(biome)) {
        throw new TypeError(`Biome "${key}" must be an object.`);
      }
      if (!Number.isInteger(biome.id) || biome.id < 0 || ids.has(biome.id)) {
        throw new RangeError(`Biome "${key}" requires a unique non-negative integer id.`);
      }
      if (!Number.isFinite(biome.start) || !Number.isFinite(biome.end) ||
          biome.start < 0 || biome.end <= biome.start) {
        throw new RangeError(`Biome "${key}" requires a valid start/end radius.`);
      }
      if (!this.tiles[biome.surface] || !this.tiles[biome.shallow] || !this.tiles[biome.beach]) {
        throw new Error(`Biome "${key}" references an unknown surface, shallow, or beach tile.`);
      }
      if (!Array.isArray(biome.tint) || biome.tint.length !== 3 ||
          biome.tint.some((channel) => !Number.isFinite(channel) || channel < 0)) {
        throw new RangeError(`Biome "${key}" requires a three-channel tint.`);
      }
      biome.name = String(biome.name ?? key);
      biome.heightBias = Number(biome.heightBias ?? 0);
      biome.ridgeStrength = Math.max(0, Number(biome.ridgeStrength ?? 1));
      biome.caveThreshold = Number(biome.caveThreshold ?? 0.745);
      biome.oreThreshold = Number(biome.oreThreshold ?? 0.82);
      biome.danger = Math.max(0, Number(biome.danger ?? 0));
      biome.resourceSpawnNodes = Array.isArray(biome.resourceSpawnNodes) ? biome.resourceSpawnNodes : [];
      for (const node of biome.resourceSpawnNodes) {
        if (!node.type || !this.tiles[node.tile]) throw new Error(`Biome "${key}" has an invalid resource node.`);
        node.chance = this.#clamp(Number(node.chance ?? 0), 0, 1);
        node.minAmount = Math.max(1, Math.trunc(node.minAmount ?? 1));
        node.maxAmount = Math.max(node.minAmount, Math.trunc(node.maxAmount ?? node.minAmount));
        node.minAltitude = this.#clampAltitude(node.minAltitude ?? this.minAltitude);
        node.maxAltitude = this.#clampAltitude(node.maxAltitude ?? this.maxAltitude);
      }
      biome.caves = {
        enabled: Boolean(biome.caves?.enabled),
        density: this.#clamp(Number(biome.caves?.density ?? 0), 0, 1),
        floodedChance: this.#clamp(Number(biome.caves?.floodedChance ?? 0), 0, 1),
      };
      ids.add(biome.id);
    }
    if (!Object.keys(biomes).length) throw new Error("At least one biome is required.");
    return biomes;
  }

  #prepareGeneration(source) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw new TypeError("generation must be a JSON object.");
    }
    const input = JSON.parse(JSON.stringify(source));
    const generation = {
      ...World.GENERATION,
      ...input,
      terrain: { ...World.GENERATION.terrain, ...input.terrain },
      spawn: { ...World.GENERATION.spawn, ...input.spawn },
      caves: { ...World.GENERATION.caves, ...input.caves },
      resourceSpawnNodes: {
        ...World.GENERATION.resourceSpawnNodes,
        ...input.resourceSpawnNodes,
      },
      rendering: { ...World.GENERATION.rendering, ...input.rendering },
    };
    for (const section of ["terrain", "spawn", "caves", "resourceSpawnNodes", "rendering"]) {
      if (!generation[section] || typeof generation[section] !== "object") {
        throw new Error(`generation.${section} is required.`);
      }
    }
    if (!this.tiles[generation.terrain.deepMaterial]) {
      throw new Error("generation.terrain.deepMaterial references an unknown tile.");
    }
    generation.version = Math.max(1, Math.trunc(generation.version ?? 1));
    generation.terrain.seaLevel = this.#clampAltitude(generation.terrain.seaLevel ?? 0);
    generation.spawn.radius = Math.max(8, Number(generation.spawn.radius ?? 320));
    generation.spawn.flatRadius = Math.max(1, Number(generation.spawn.flatRadius ?? 92));
    generation.spawn.blendRadius = Math.max(generation.spawn.flatRadius, Number(generation.spawn.blendRadius ?? 180));
    generation.spawn.altitude = this.#clampAltitude(generation.spawn.altitude ?? 1);
    generation.caves.enabled = Boolean(generation.caves.enabled);
    generation.resourceSpawnNodes.enabled = Boolean(generation.resourceSpawnNodes.enabled);
    if (Number(generation.rendering.tileSize) !== 16) {
      throw new RangeError("generation.rendering.tileSize must be 16.");
    }
    generation.rendering.tilemapUrl = String(generation.rendering.tilemapUrl ?? "./Tiles.png");
    generation.rendering.fallbackCellSize = Math.max(
      1,
      Number(generation.rendering.fallbackCellSize ?? 16),
    );
    return generation;
  }

  #clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  #clampAltitude(value) {
    return this.#clamp(Math.round(Number(value)), this.minAltitude, this.maxAltitude);
  }

  #inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  #chunkKey(cx, cy, altitude) {
    return `${altitude}:${cx}:${cy}`;
  }

  #cellLocation(x, y, altitude) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const cx = Math.floor(ix / this.chunkSize);
    const cy = Math.floor(iy / this.chunkSize);
    const lx = ix - cx * this.chunkSize;
    const ly = iy - cy * this.chunkSize;
    return { ix, iy, cx, cy, lx, ly, altitude, index: ly * this.chunkSize + lx };
  }

  // Stable coordinate noise means every client can regenerate pristine chunks.
  hash(x, y, salt = 0) {
    let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) +
      Math.imul(this.seed, 69069) + Math.imul(salt, 1447)) | 0;
    n = Math.imul(n ^ (n >> 13), 1274126177);
    return ((n ^ (n >> 16)) >>> 0) / 4294967295;
  }

  noise(x, y, scale = 18, salt = 0) {
    const gx = Math.floor(x / scale);
    const gy = Math.floor(y / scale);
    const tx = x / scale - gx;
    const ty = y / scale - gy;
    const smooth = (t) => t * t * (3 - 2 * t);
    const a = this.hash(gx, gy, salt);
    const b = this.hash(gx + 1, gy, salt);
    const c = this.hash(gx, gy + 1, salt);
    const d = this.hash(gx + 1, gy + 1, salt);
    const ab = a + (b - a) * smooth(tx);
    const cd = c + (d - c) * smooth(tx);
    return ab + (cd - ab) * smooth(ty);
  }

  radialBiomeDistanceAt(x, y) {
    return Math.hypot(x - this.biomeCenter.x, y - this.biomeCenter.y) / this.biomeMaxRadius;
  }

  warpedBiomeDistanceAt(x, y) {
    const radial = this.radialBiomeDistanceAt(x, y);
    const edgeProtection = Math.min(1, radial / 0.08);
    const broad = this.noise(x, y, this.biomeWarpScale, 501) * 2 - 1;
    const detail = this.noise(x, y, this.biomeWarpScale * 0.38, 502) * 2 - 1;
    return Math.max(
      0,
      radial + (broad * 0.72 + detail * 0.28) * this.biomeWarpStrength * edgeProtection,
    );
  }

  getBiomeAt(x, y) {
    const spawnDistance = Math.hypot(x - this.biomeCenter.x, y - this.biomeCenter.y);
    const radialDistance = this.radialBiomeDistanceAt(x, y);
    const distance = spawnDistance <= this.spawnRadius ? 0 : this.warpedBiomeDistanceAt(x, y);
    let selected = this.biomeOrder[0];
    let bestScore = -Infinity;

    for (const entry of this.biomeOrder) {
      const biome = entry[1];
      const center = (biome.start + biome.end) / 2;
      const halfWidth = (biome.end - biome.start) / 2;
      const score = 1 - Math.abs(distance - center) / halfWidth;
      if (score > bestScore) {
        selected = entry;
        bestScore = score;
      }
    }

    return {
      ...selected[1],
      key: selected[0],
      radialDistance,
      warpedDistance: distance,
      isSpawn: spawnDistance <= this.spawnRadius,
    };
  }

  getSpawn() {
    return { x: this.biomeCenter.x, y: this.biomeCenter.y, radius: this.spawnRadius };
  }

  fractalNoise(x, y, options = {}, salt = 0) {
    const octaves = Math.max(1, Math.trunc(options.octaves ?? 4));
    const persistence = this.#clamp(Number(options.persistence ?? 0.5), 0.01, 0.99);
    const lacunarity = Math.max(1.01, Number(options.lacunarity ?? 2));
    let scale = Math.max(1, Number(options.scale ?? 256));
    let amplitude = 1;
    let total = 0;
    let weight = 0;
    for (let octave = 0; octave < octaves; octave++) {
      total += this.noise(x, y, scale, salt + octave * 37) * amplitude;
      weight += amplitude;
      amplitude *= persistence;
      scale /= lacunarity;
    }
    return total / weight;
  }

  getElevationAt(x, y) {
    const terrain = this.generation.terrain;
    const biome = this.getBiomeAt(x, y);
    const warpX = (this.noise(x, y, terrain.domainWarpScale, 701) * 2 - 1) * terrain.domainWarpStrength;
    const warpY = (this.noise(x, y, terrain.domainWarpScale, 702) * 2 - 1) * terrain.domainWarpStrength;
    const wx = x + warpX;
    const wy = y + warpY;

    const continent = this.fractalNoise(wx, wy, {
      scale: terrain.continentScale,
      octaves: terrain.continentOctaves,
      persistence: terrain.continentPersistence,
    }, 710);
    const detail = this.fractalNoise(wx, wy, {
      scale: terrain.detailScale,
      octaves: terrain.detailOctaves,
      persistence: 0.5,
    }, 760);
    const ridgeNoise = 1 - Math.abs(this.noise(wx, wy, terrain.ridgeScale, 790) * 2 - 1);
    const ridge = Math.max(0, ridgeNoise - terrain.ridgeThreshold) * biome.ridgeStrength;
    const radial = this.radialBiomeDistanceAt(x, y);
    const edge = Math.max(0, radial - terrain.islandFalloffStart) /
      Math.max(0.001, 1 - terrain.islandFalloffStart);
    const edgeFalloff = edge * edge * terrain.islandFalloffStrength;

    let heightValue = (continent - 0.5) * 1.35 +
      (detail - 0.5) * terrain.detailStrength +
      ridge +
      biome.heightBias -
      edgeFalloff +
      terrain.landBias;
    let altitude = Math.round(terrain.seaLevel + heightValue * terrain.elevationAmplitude);

    const spawnDistance = Math.hypot(x - this.biomeCenter.x, y - this.biomeCenter.y);
    if (spawnDistance <= this.generation.spawn.blendRadius) {
      const blend = this.#clamp(
        (spawnDistance - this.generation.spawn.flatRadius) /
        Math.max(1, this.generation.spawn.blendRadius - this.generation.spawn.flatRadius),
        0,
        1,
      );
      const smooth = blend * blend * (3 - 2 * blend);
      altitude = Math.round(this.generation.spawn.altitude * (1 - smooth) + altitude * smooth);
    }
    return this.#clamp(altitude, this.minAltitude, this.maxAltitude);
  }

  isCaveAt(x, y, altitude, biome = this.getBiomeAt(x, y)) {
    const caves = this.generation.caves;
    if (!caves.enabled || !biome.caves.enabled ||
        altitude < caves.minAltitude || altitude > caves.maxAltitude) return false;
    const spawnDistance = Math.hypot(x - this.biomeCenter.x, y - this.biomeCenter.y);
    if (this.generation.spawn.clearCaves && spawnDistance <= this.spawnRadius) return false;
    const broad = this.noise(x + altitude * 31, y - altitude * 17, caves.noiseScale, 820);
    const detail = this.noise(x - altitude * 11, y + altitude * 23, caves.detailScale, 821);
    const densityBoost = (biome.caves.density - 0.5) * 0.12;
    return broad * 0.7 + detail * 0.3 > caves.threshold - densityBoost;
  }

  generatedMaterialAt(x, y, altitude) {
    const biome = this.getBiomeAt(x, y);
    const top = this.getElevationAt(x, y);
    const seaLevel = this.generation.terrain.seaLevel;
    if (altitude > top) return altitude <= seaLevel ? World.WATER : World.AIR;
    const depth = top - altitude;
    const coastDistance = top - seaLevel;
    let material;
    if (depth === 0) {
      material = coastDistance <= 1 ? this.tiles[biome.beach].id : this.tiles[biome.surface].id;
    } else if (depth < 2) {
      material = this.tiles[biome.shallow].id;
    } else {
      material = this.tiles[this.generation.terrain.deepMaterial].id;
    }

    if (depth > 1 && this.isCaveAt(x, y, altitude, biome)) {
      const flooded = altitude < seaLevel &&
        this.hash(x, y, 846 + altitude) < biome.caves.floodedChance;
      return flooded ? World.WATER : World.AIR;
    }
    return material;
  }

  getResourceSpawnNodes(cx, cy) {
    const cacheKey = `${cx}:${cy}`;
    if (this.resourceNodeCache.has(cacheKey)) return this.resourceNodeCache.get(cacheKey);
    const settings = this.generation.resourceSpawnNodes;
    if (!settings.enabled) return [];
    const nodes = [];
    const spacing = Math.max(8, Number(settings.spacing));
    const startX = cx * this.chunkSize;
    const startY = cy * this.chunkSize;
    const endX = startX + this.chunkSize;
    const endY = startY + this.chunkSize;
    const gx0 = Math.floor(startX / spacing) - 1;
    const gy0 = Math.floor(startY / spacing) - 1;
    const gx1 = Math.ceil(endX / spacing) + 1;
    const gy1 = Math.ceil(endY / spacing) + 1;

    for (let gy = gy0; gy <= gy1 && nodes.length < settings.maxPerChunk; gy++) {
      for (let gx = gx0; gx <= gx1 && nodes.length < settings.maxPerChunk; gx++) {
        const jitter = spacing * Number(settings.jitter);
        const x = Math.floor((gx + 0.5) * spacing + (this.hash(gx, gy, 901) - 0.5) * jitter);
        const y = Math.floor((gy + 0.5) * spacing + (this.hash(gx, gy, 902) - 0.5) * jitter);
        if (x < startX || y < startY || x >= endX || y >= endY || !this.#inBounds(x, y)) continue;
        const spawnDistance = Math.hypot(x - this.biomeCenter.x, y - this.biomeCenter.y);
        if (spawnDistance < this.generation.spawn.clearResourcesRadius) continue;
        const surfaceAltitude = this.getElevationAt(x, y);
        if (surfaceAltitude < this.generation.terrain.seaLevel) continue;
        const biome = this.getBiomeAt(x, y);

        for (let index = 0; index < biome.resourceSpawnNodes.length; index++) {
          const definition = biome.resourceSpawnNodes[index];
          const maximumAltitude = Math.min(definition.maxAltitude, surfaceAltitude);
          if (maximumAltitude < definition.minAltitude) continue;
          if (this.hash(gx, gy, 920 + biome.id * 31 + index) > definition.chance) continue;
          const amount = definition.minAmount + Math.floor(
            this.hash(gx, gy, 960 + index) * (definition.maxAmount - definition.minAmount + 1),
          );
          const altitude = definition.minAltitude + Math.floor(
            this.hash(gx, gy, 980 + index) * (maximumAltitude - definition.minAltitude + 1),
          );
          if (nodes.some((node) =>
            Math.hypot(node.x - x, node.y - y) < Number(settings.minimumSeparation))) continue;
          nodes.push({
            id: `${this.seed}:resource:${gx}:${gy}:${definition.type}`,
            type: definition.type,
            tile: definition.tile,
            tileId: this.tiles[definition.tile].id,
            x,
            y,
            altitude,
            surfaceAltitude,
            amount,
            biome: biome.key,
          });
          break;
        }
      }
    }
    this.resourceNodeCache.set(cacheKey, nodes);
    return nodes;
  }

  getCavesInChunk(cx, cy) {
    const cacheKey = `${cx}:${cy}`;
    if (this.caveEntranceCache.has(cacheKey)) return this.caveEntranceCache.get(cacheKey);
    const settings = this.generation.caves;
    if (!settings.enabled) return [];
    const caves = [];
    const spacing = Math.max(this.chunkSize, Number(settings.entranceSpacing));
    const startX = cx * this.chunkSize;
    const startY = cy * this.chunkSize;
    const gx0 = Math.floor(startX / spacing) - 1;
    const gy0 = Math.floor(startY / spacing) - 1;
    const gx1 = Math.ceil((startX + this.chunkSize) / spacing) + 1;
    const gy1 = Math.ceil((startY + this.chunkSize) / spacing) + 1;

    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const jitter = spacing * Number(settings.entranceJitter);
        const x = Math.floor((gx + 0.5) * spacing + (this.hash(gx, gy, 1001) - 0.5) * jitter);
        const y = Math.floor((gy + 0.5) * spacing + (this.hash(gx, gy, 1002) - 0.5) * jitter);
        if (x < startX || y < startY || x >= startX + this.chunkSize || y >= startY + this.chunkSize) continue;
        if (!this.#inBounds(x, y) || this.hash(gx, gy, 1003) > settings.entranceChance) continue;
        const biome = this.getBiomeAt(x, y);
        if (!biome.caves.enabled || this.hash(gx, gy, 1004) > biome.caves.density) continue;
        const altitude = this.getElevationAt(x, y);
        if (altitude <= this.generation.terrain.seaLevel) continue;
        const radius = settings.minRadius + Math.floor(
          this.hash(gx, gy, 1005) * (settings.maxRadius - settings.minRadius + 1),
        );
        const depth = settings.minDepth + Math.floor(
          this.hash(gx, gy, 1006) * (settings.maxDepth - settings.minDepth + 1),
        );
        caves.push({
          id: `${this.seed}:cave:${gx}:${gy}`,
          x,
          y,
          altitude,
          radius,
          depth,
          flooded: this.hash(gx, gy, 1007) < biome.caves.floodedChance,
          biome: biome.key,
        });
      }
    }
    this.caveEntranceCache.set(cacheKey, caves);
    return caves;
  }

  getChunk(cx, cy, altitude = this.altitude, create = true) {
    altitude = this.#clampAltitude(altitude);
    const key = this.#chunkKey(cx, cy, altitude);
    let chunk = this.chunks.get(key);
    if (chunk || !create) {
      if (chunk) chunk.lastAccess = ++this.accessClock;
      return chunk ?? null;
    }

    const cells = new Uint8Array(this.chunkSize * this.chunkSize);
    const startX = cx * this.chunkSize;
    const startY = cy * this.chunkSize;
    for (let ly = 0; ly < this.chunkSize; ly++) {
      for (let lx = 0; lx < this.chunkSize; lx++) {
        const x = startX + lx;
        const y = startY + ly;
        cells[ly * this.chunkSize + lx] = this.#inBounds(x, y)
          ? this.generatedMaterialAt(x, y, altitude)
          : World.AIR;
      }
    }

    chunk = { cx, cy, altitude, cells, lastAccess: ++this.accessClock };
    this.chunks.set(key, chunk);
    this.stats.loadedChunks = this.chunks.size;
    this.evictChunks();
    this.emit("chunkload", { cx, cy, altitude });
    return chunk;
  }

  materialAt(x, y, altitude = this.altitude) {
    if (!this.#inBounds(x, y)) return World.AIR;
    const location = this.#cellLocation(x, y, this.#clampAltitude(altitude));
    return this.getChunk(location.cx, location.cy, location.altitude).cells[location.index];
  }

  setMaterial(x, y, altitude, material, options = {}) {
    if (!this.#inBounds(x, y)) return false;
    const z = this.#clampAltitude(altitude);
    const value = Math.trunc(Number(material));
    if (!this.tileById.has(value)) throw new RangeError(`Unknown material id: ${material}`);
    const location = this.#cellLocation(x, y, z);
    const chunk = this.getChunk(location.cx, location.cy, z);
    if (chunk.cells[location.index] === value) return false;

    chunk.cells[location.index] = value;
    this.dirtyChunks.add(this.#chunkKey(location.cx, location.cy, z));
    if (options.record !== false) {
      const change = { x: location.ix, y: location.iy, z, material: value };
      if (options.collector) options.collector.push(change);
      else {
        this.#commitLocalChanges([change], options.operationId);
        if (this.autoRender && options.render !== false) this.render();
      }
    }
    return true;
  }

  mine(worldX, worldY, radius = this.brushRadius, altitude = this.altitude, options = {}) {
    const z = this.#clampAltitude(altitude);
    const r = this.#clamp(Number(radius), 1, 256);
    const r2 = r * r;
    const changes = [];
    let removed = 0;
    let last = World.AIR;
    const x0 = Math.max(0, Math.floor(worldX - r));
    const x1 = Math.min(this.width - 1, Math.ceil(worldX + r));
    const y0 = Math.max(0, Math.floor(worldY - r));
    const y1 = Math.min(this.height - 1, Math.ceil(worldY + r));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - worldX;
        const dy = y - worldY;
        if (dx * dx + dy * dy > r2 + this.hash(x, y, z + 91) * r * 0.42) continue;
        const material = this.materialAt(x, y, z);
        if (!this.tileById.get(material)?.mineable) continue;
        last = material;
        const replacement = z < 0 && this.touchesWater(x, y, z)
          ? World.WATER
          : World.DIRT_FLOOR;
        if (this.setMaterial(x, y, z, replacement, { collector: changes })) removed++;
      }
    }

    if (changes.length) this.#commitLocalChanges(changes, options.operationId);
    this.stats.removed += removed;
    this.stats.lastMaterial = this.materialNames[last];
    if (this.autoRender && options.render !== false) this.render();
    return removed;
  }

  touchesWater(x, y, altitude = this.altitude) {
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nx = x + dx;
      const ny = y + dy;
      return !this.#inBounds(nx, ny) || this.materialAt(nx, ny, altitude) === World.WATER;
    });
  }

  #commitLocalChanges(changes, operationId) {
    this.revision++;
    const opId = String(operationId ?? `${this.actorId}:${++this.operationSequence}`);
    const stamped = changes.map((change) => ({ ...change, revision: this.revision, operationId: opId }));
    this.seenOperations.add(opId);
    this.outgoingChanges.push(...stamped);
    this.changeLog.push(...stamped);
    if (this.changeLog.length > this.maxChangeLog) {
      this.changeLog.splice(0, this.changeLog.length - this.maxChangeLog);
    }
    this.emit("change", { source: "local", revision: this.revision, operationId: opId, changes: stamped });
  }

  /**
   * Returns and clears locally authored changes as one JSON-safe packet.
   * Send this packet to an authoritative server; do not trust client packets blindly.
   */
  drainChanges() {
    const changes = this.outgoingChanges.splice(0);
    return {
      protocol: World.PROTOCOL,
      worldId: this.worldId,
      seed: this.seed,
      tileSetId: this.tileSetId,
      biomeSetId: this.biomeSetId,
      generationSetId: this.generationSetId,
      actorId: this.actorId,
      revision: this.revision,
      changes,
    };
  }

  /**
   * Applies an ordered packet from an authoritative server.
   * Duplicate operation ids are ignored. Set strictRevision=false for snapshots/recovery.
   */
  applyChanges(packet, options = {}) {
    if (!packet || packet.protocol !== World.PROTOCOL) throw new Error("Unsupported world change protocol.");
    if (packet.worldId !== this.worldId || packet.seed !== this.seed ||
        packet.tileSetId !== this.tileSetId || packet.biomeSetId !== this.biomeSetId ||
        packet.generationSetId !== this.generationSetId) {
      throw new Error("Change packet belongs to another world or generation schema.");
    }
    const strict = options.strictRevision !== false;
    const incomingRevision = Math.trunc(packet.revision ?? 0);
    if (strict && incomingRevision < this.remoteRevision) return 0;
    if (strict && packet.baseRevision != null && packet.baseRevision !== this.remoteRevision) {
      throw new Error(`Revision gap: expected base ${this.remoteRevision}, received ${packet.baseRevision}.`);
    }

    let applied = 0;
    const accepted = [];
    const acceptedOperations = new Set();
    for (const change of packet.changes ?? []) {
      const operationId = change.operationId == null ? null : String(change.operationId);
      if (operationId && this.seenOperations.has(operationId)) continue;
      if (this.setMaterial(change.x, change.y, change.z, change.material, { record: false })) {
        applied++;
        accepted.push(change);
      }
      if (operationId) acceptedOperations.add(operationId);
    }

    for (const operationId of acceptedOperations) this.seenOperations.add(operationId);
    this.remoteRevision = Math.max(this.remoteRevision, incomingRevision);
    this.#trimSeenOperations();
    if (accepted.length) this.emit("change", { source: "remote", revision: incomingRevision, changes: accepted });
    if (this.autoRender && options.render !== false && accepted.length) this.render();
    return applied;
  }

  #trimSeenOperations() {
    if (this.seenOperations.size <= 20000) return;
    const keep = [...this.seenOperations].slice(-10000);
    this.seenOperations = new Set(keep);
  }

  changesSince(revision) {
    return this.changeLog.filter((change) => change.revision > revision);
  }

  exportChunk(cx, cy, altitude = this.altitude) {
    const chunk = this.getChunk(cx, cy, altitude);
    return {
      protocol: World.PROTOCOL,
      worldId: this.worldId,
      seed: this.seed,
      tileSetId: this.tileSetId,
      biomeSetId: this.biomeSetId,
      generationSetId: this.generationSetId,
      cx,
      cy,
      z: chunk.altitude,
      revision: Math.max(this.revision, this.remoteRevision),
      cells: Array.from(chunk.cells),
    };
  }

  importChunk(snapshot, options = {}) {
    if (snapshot.worldId !== this.worldId || snapshot.seed !== this.seed ||
        snapshot.tileSetId !== this.tileSetId || snapshot.biomeSetId !== this.biomeSetId ||
        snapshot.generationSetId !== this.generationSetId) {
      throw new Error("Chunk belongs to another world or generation schema.");
    }
    if (!Array.isArray(snapshot.cells) || snapshot.cells.length !== this.chunkSize ** 2) {
      throw new Error("Invalid chunk cell data.");
    }
    const z = this.#clampAltitude(snapshot.z);
    const key = this.#chunkKey(snapshot.cx, snapshot.cy, z);
    this.chunks.set(key, {
      cx: snapshot.cx,
      cy: snapshot.cy,
      altitude: z,
      cells: Uint8Array.from(snapshot.cells),
      lastAccess: ++this.accessClock,
    });
    if (options.dirty !== false) this.dirtyChunks.add(key);
    this.remoteRevision = Math.max(this.remoteRevision, Math.trunc(snapshot.revision ?? 0));
    this.stats.loadedChunks = this.chunks.size;
    if (this.autoRender && options.render !== false) this.render();
  }

  evictChunks(limit = this.maxLoadedChunks) {
    if (this.chunks.size <= limit) return 0;
    const candidates = [...this.chunks.entries()]
      .filter(([key]) => !this.dirtyChunks.has(key))
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess);
    let removed = 0;
    while (this.chunks.size > limit && candidates.length) {
      const [key] = candidates.shift();
      this.chunks.delete(key);
      removed++;
    }
    this.stats.loadedChunks = this.chunks.size;
    return removed;
  }

  markChunkPersisted(cx, cy, altitude) {
    this.dirtyChunks.delete(this.#chunkKey(cx, cy, this.#clampAltitude(altitude)));
    this.evictChunks();
  }

  generate(seed = this.seed) {
    this.seed = Math.trunc(seed);
    for (const placeable of this.placeables.values()) placeable.world = null;
    this.placeables.clear();
    this.chunks.clear();
    this.dirtyChunks.clear();
    this.changeLog.length = 0;
    this.outgoingChanges.length = 0;
    this.seenOperations.clear();
    this.resourceNodeCache.clear();
    this.caveEntranceCache.clear();
    this.revision = 0;
    this.remoteRevision = 0;
    this.stats = { removed: 0, lastMaterial: "—", loadedChunks: 0 };
    this.emit("reset", { seed: this.seed });
    if (this.autoRender) this.render();
  }

  setAltitude(altitude) {
    this.altitude = this.#clampAltitude(altitude);
    if (this.autoRender) this.render();
  }

  setBrushRadius(radius) {
    this.brushRadius = this.#clamp(Number(radius), 1, 256);
    if (this.autoRender) this.render();
  }

  setCamera(x, y, zoom = this.zoom) {
    this.zoom = this.#clamp(Number(zoom), 1, 64);
    this.camera.x = this.#clamp(Number(x), 0, this.width - 1);
    this.camera.y = this.#clamp(Number(y), 0, this.height - 1);
    if (this.autoRender) this.render();
  }

  pan(dx, dy) {
    this.setCamera(this.camera.x + Number(dx), this.camera.y + Number(dy));
  }

  getSurfaceAltitude(x, y, options) {
    return this.collision.getSurfaceAltitude(x, y, options);
  }

  getSurfaceInfo(x, y, options) {
    return this.collision.getSurfaceInfo(x, y, options);
  }

  moveEntity(entity, dx, dy, options) {
    return options?.mode === "volume"
      ? this.collision.moveCircle(entity, dx, dy, options)
      : this.collision.moveOnSurface(entity, dx, dy, options);
  }

  detectDrop(from, to, options) {
    return this.collision.detectDrop(from, to, options);
  }

  updateFalling(entity, deltaSeconds, options) {
    return this.collision.updateFalling(entity, deltaSeconds, options);
  }

  raycastTerrain(from, to, options) {
    return this.collision.raycast(from, to, options);
  }

  getCollisionReports(options) {
    return this.collision.getReports(options);
  }

  addPlaceable(placeable) {
    if (!placeable || typeof placeable.id !== "string" || typeof placeable.render !== "function") {
      throw new TypeError("Placeable objects require a string id and render method.");
    }
    if (this.placeables.has(placeable.id)) {
      throw new Error(`Placeable "${placeable.id}" already exists.`);
    }
    placeable.world = this;
    this.placeables.set(placeable.id, placeable);
    this.emit("placeableadd", { placeable });
    if (this.autoRender) this.render();
    return placeable;
  }

  removePlaceable(id) {
    const key = String(id);
    const placeable = this.placeables.get(key);
    if (!placeable) return false;
    this.placeables.delete(key);
    placeable.world = null;
    this.emit("placeableremove", { placeable });
    if (this.autoRender) this.render();
    return true;
  }

  getPlaceablesAt(x, y, altitude = this.altitude) {
    const ix = Math.floor(Number(x));
    const iy = Math.floor(Number(y));
    const z = this.#clampAltitude(altitude);
    return [...this.placeables.values()].filter((placeable) =>
      placeable.x === ix && placeable.y === iy && placeable.altitude === z);
  }

  renderPlaceables(ctx = this.ctx) {
    let rendered = 0;
    for (const placeable of this.placeables.values()) {
      if (placeable.render(ctx)) rendered++;
    }
    return rendered;
  }

  createPlayer(options = {}) {
    const player = new Player(this, options);
    if (this.players.has(player.id)) throw new Error(`Player "${player.id}" already exists.`);
    this.players.set(player.id, player);
    this.emit("playerjoin", { player });
    return player;
  }

  getPlayer(id) {
    return this.players.get(String(id)) ?? null;
  }

  removePlayer(id, options = {}) {
    const key = String(id);
    const player = this.players.get(key);
    if (!player) return false;
    this.players.delete(key);
    if (options.destroy !== false) player.destroy();
    this.emit("playerleave", { player });
    return true;
  }

  renderPlayers(ctx = this.ctx, options = {}) {
    let rendered = 0;
    for (const player of this.players.values()) {
      if (player.render(ctx, options)) rendered++;
    }
    return rendered;
  }

  setTilemap(image) {
    const width = Number(image?.naturalWidth ?? image?.width ?? 0);
    const height = Number(image?.naturalHeight ?? image?.height ?? 0);
    if (!image || typeof image !== "object" || width < 16 || height < 16) {
      this.tilemap = null;
      this.emit("tilemaperror", { url: this.tilemapUrl, reason: "invalid-image" });
      if (this.autoRender) this.render();
      return false;
    }
    this.tilemap = image;
    this.emit("tilemapload", { url: this.tilemapUrl, width, height, tileSize: 16 });
    if (this.autoRender) this.render();
    return true;
  }

  loadTilemap(url = this.tilemapUrl, options = {}) {
    this.tilemapUrl = String(url);
    if (typeof globalThis.Image !== "function") return Promise.resolve(null);
    return new Promise((resolve) => {
      const image = new Image();
      if (options.crossOrigin != null) image.crossOrigin = options.crossOrigin;
      image.decoding = "async";
      image.onload = () => {
        this.setTilemap(image);
        resolve(image);
      };
      image.onerror = () => {
        this.tilemap = null;
        this.emit("tilemaperror", { url: this.tilemapUrl, reason: "load-failed" });
        if (this.autoRender) this.render();
        resolve(null);
      };
      image.src = this.tilemapUrl;
    });
  }

  getViewport() {
    const rect = this.canvas.getBoundingClientRect();
    const cellsWide = Math.max(1, rect.width / this.zoom);
    const cellsHigh = Math.max(1, rect.height / this.zoom);
    const x = this.#clamp(this.camera.x - cellsWide / 2, 0, Math.max(0, this.width - cellsWide));
    const y = this.#clamp(this.camera.y - cellsHigh / 2, 0, Math.max(0, this.height - cellsHigh));
    return { x, y, width: Math.min(cellsWide, this.width), height: Math.min(cellsHigh, this.height) };
  }

  eventToWorld(event) {
    const rect = this.canvas.getBoundingClientRect();
    const viewport = this.getViewport();
    return {
      x: viewport.x + (event.clientX - rect.left) / rect.width * viewport.width,
      y: viewport.y + (event.clientY - rect.top) / rect.height * viewport.height,
    };
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    this.canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    this.ctx.imageSmoothingEnabled = false;
    if (this.autoRender) this.render();
  }

  render() {
    const viewport = this.getViewport();
    if (this.tilemap) {
      this.#renderTilemap(viewport);
    } else {
    const startX = Math.floor(viewport.x);
    const startY = Math.floor(viewport.y);
    const endX = Math.ceil(viewport.x + viewport.width);
    const endY = Math.ceil(viewport.y + viewport.height);
    const sampleWidth = endX - startX;
    const sampleHeight = endY - startY;
    if (this.buffer.width !== sampleWidth || this.buffer.height !== sampleHeight) {
      this.buffer.width = sampleWidth;
      this.buffer.height = sampleHeight;
    }
    const image = this.bufferCtx.createImageData(sampleWidth, sampleHeight);
    const data = image.data;

    for (let sy = 0; sy < sampleHeight; sy++) {
      for (let sx = 0; sx < sampleWidth; sx++) {
        const x = startX + sx;
        const y = startY + sy;
        const material = this.materialAt(x, y, this.altitude);
        let color = this.palette[material];
        if (material === World.AIR && this.altitude > this.minAltitude) {
          const below = this.palette[this.materialAt(x, y, this.altitude - 1)];
          color = [below[0] * 0.46, below[1] * 0.46, below[2] * 0.46];
        }
        const tile = this.tileById.get(material);
        const biome = this.getBiomeAt(x, y);
        color = [
          color[0] * biome.tint[0],
          color[1] * biome.tint[1],
          color[2] * biome.tint[2],
        ];
        const grain = tile?.solid ? (this.hash(x, y, this.altitude) * 17 | 0) - 8 : 0;
        const i = (sy * sampleWidth + sx) * 4;
        data[i] = this.#clamp(color[0] + grain, 0, 255);
        data[i + 1] = this.#clamp(color[1] + grain, 0, 255);
        data[i + 2] = this.#clamp(color[2] + grain, 0, 255);
        data[i + 3] = 255;
      }
    }

    this.bufferCtx.putImageData(image, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    const destinationWidth = this.canvas.width / viewport.width;
    const destinationHeight = this.canvas.height / viewport.height;
    this.ctx.drawImage(
      this.buffer,
      (startX - viewport.x) * destinationWidth,
      (startY - viewport.y) * destinationHeight,
      sampleWidth * destinationWidth,
      sampleHeight * destinationHeight,
    );
    }

    this.renderPlaceables(this.ctx);
    this.renderPlayers(this.ctx);

    if (this.pointer.active) {
      const sx = this.canvas.width / viewport.width;
      const sy = this.canvas.height / viewport.height;
      this.ctx.save();
      this.ctx.strokeStyle = "#f4e9c9";
      this.ctx.lineWidth = Math.max(2, Math.min(sx, sy) * 0.65);
      this.ctx.setLineDash([4 * sx, 3 * sx]);
      this.ctx.beginPath();
      this.ctx.arc(
        (this.pointer.x - viewport.x) * sx,
        (this.pointer.y - viewport.y) * sy,
        this.brushRadius * (sx + sy) / 2,
        0,
        Math.PI * 2,
      );
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  #renderTilemap(viewport) {
    const tileSize = 16;
    const atlasWidth = Number(this.tilemap.naturalWidth ?? this.tilemap.width ?? 0);
    const atlasHeight = Number(this.tilemap.naturalHeight ?? this.tilemap.height ?? 0);
    const destinationWidth = this.canvas.width / viewport.width;
    const destinationHeight = this.canvas.height / viewport.height;
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.fillStyle = "#091015";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const startX = Math.floor(viewport.x);
    const startY = Math.floor(viewport.y);
    const endX = Math.ceil(viewport.x + viewport.width);
    const endY = Math.ceil(viewport.y + viewport.height);
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const biome = this.getBiomeAt(x, y);
        let material = this.materialAt(x, y, this.altitude);
        let dim = false;
        if (material === World.AIR && this.altitude > this.minAltitude) {
          material = this.materialAt(x, y, this.altitude - 1);
          dim = true;
        }
        const tile = this.tileById.get(material);
        const sourceX = 16 * tile.id;
        const sourceY = 16 * biome.id;
        const destinationX = (x - viewport.x) * destinationWidth;
        const destinationY = (y - viewport.y) * destinationHeight;
        const sourceExists = sourceX + tileSize <= atlasWidth && sourceY + tileSize <= atlasHeight;

        if (sourceExists) {
          this.ctx.drawImage(
            this.tilemap,
            sourceX,
            sourceY,
            tileSize,
            tileSize,
            destinationX,
            destinationY,
            destinationWidth + 0.5,
            destinationHeight + 0.5,
          );
          if (dim) {
            this.ctx.fillStyle = "rgba(3, 8, 10, 0.54)";
            this.ctx.fillRect(destinationX, destinationY, destinationWidth + 0.5, destinationHeight + 0.5);
          }
        } else {
          const base = this.palette[material] ?? this.palette[World.AIR];
          const shade = dim ? 0.46 : 1;
          const grain = tile?.solid ? (this.hash(x, y, this.altitude) * 17 | 0) - 8 : 0;
          const red = this.#clamp(base[0] * biome.tint[0] * shade + grain, 0, 255) | 0;
          const green = this.#clamp(base[1] * biome.tint[1] * shade + grain, 0, 255) | 0;
          const blue = this.#clamp(base[2] * biome.tint[2] * shade + grain, 0, 255) | 0;
          this.ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
          this.ctx.fillRect(destinationX, destinationY, destinationWidth + 0.5, destinationHeight + 0.5);
        }
      }
    }
  }

  on(type, listener) {
    if (typeof listener !== "function") throw new TypeError("listener must be a function.");
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
    return () => this.off(type, listener);
  }

  off(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type, detail) {
    for (const listener of this.listeners.get(type) ?? []) listener(detail, this);
  }

  serialize() {
    return {
      protocol: World.PROTOCOL,
      worldId: this.worldId,
      seed: this.seed,
      tileSetId: this.tileSetId,
      biomeSetId: this.biomeSetId,
      generationSetId: this.generationSetId,
      biomes: this.biomes,
      generation: this.generation,
      placeables: [...this.placeables.values()].map((placeable) => placeable.serialize()),
      biomeCenter: { ...this.biomeCenter },
      spawnRadius: this.spawnRadius,
      biomeWarpStrength: this.biomeWarpStrength,
      biomeWarpScale: this.biomeWarpScale,
      width: this.width,
      height: this.height,
      chunkSize: this.chunkSize,
      minAltitude: this.minAltitude,
      maxAltitude: this.maxAltitude,
      tiles: this.tiles,
      revision: Math.max(this.revision, this.remoteRevision),
      chunks: [...this.dirtyChunks].map((key) => {
        const chunk = this.chunks.get(key);
        return chunk ? this.exportChunk(chunk.cx, chunk.cy, chunk.altitude) : null;
      }).filter(Boolean),
    };
  }
}
