# World.js

`World.js` is a browser-native ES6 class for large, layered, destructible top-down RPG terrain. It uses deterministic procedural generation, lazy chunks, viewport-only Canvas rendering, and JSON-safe change packets suitable for authoritative multiplayer.

It targets modern evergreen browsers with ES2022 class-field and private-method support. The canvas check is realm-safe, so canvases supplied by an iframe document are supported.

## Project files

| File | Responsibility |
| --- | --- |
| `World.js` | Generation, chunks, rendering, destruction, saves, and multiplayer deltas |
| `tiles.json` | Pixel materials and resource materials |
| `Biomes.json` | The five radial biomes and biome-specific content |
| `generation.json` | Terrain shape, sea level, spawn, caves, and resource placement |
| `TerrainTest.html` | Interactive two-client test harness |

## Why it scales

The default world is `16,384 × 16,384 × 11` altitude layers, but it is never allocated as one giant array. Terrain is generated in `64 × 64` chunks only when gameplay or rendering touches it.

- Pristine chunks are deterministic and need not be saved or sent.
- Only visible chunks are generated for rendering.
- Only changed chunks are retained as dirty state.
- Least-recently-used pristine chunks are evicted automatically.
- Mining emits cell deltas instead of full maps.
- Rendering cost follows viewport size, not world size.

With the defaults, one loaded altitude chunk uses 4 KiB for material cells. The default 512-chunk cache therefore holds roughly 2 MiB of cell data, excluding small JavaScript object overhead. Dirty chunks are not evicted until the application confirms persistence.

## Minimal browser setup

```html
<canvas id="world" style="width:100%; height:600px"></canvas>

<script type="module">
  import World from "./World.js?v=tilegrid-fallback-5";

  const canvas = document.querySelector("#world");
  const [tiles, biomes, generation] = await Promise.all([
    World.loadTiles("./tiles.json"),
    World.loadBiomes("./Biomes.json"),
    World.loadGeneration("./generation.json")
  ]);

  const world = new World(canvas, {
    worldId: "realm-01",
    actorId: crypto.randomUUID(),
    seed: 4182,
    tiles,
    biomes,
    generation,
    tileSetId: "realm-tiles-v1",
    biomeSetId: "realm-biomes-v1",
    generationSetId: "realm-generation-v1",
    width: 16384,
    height: 16384,
    chunkSize: 64,
    maxLoadedChunks: 512,
    cameraX: 8192,
    cameraY: 8192,
    zoom: 6
  });

  addEventListener("resize", () => world.resize());

  canvas.addEventListener("pointerdown", (event) => {
    const { x, y } = world.eventToWorld(event);
    world.mine(x, y);
  });
</script>
```

Serve ES modules over HTTP:

```sh
python3 -m http.server 3000
```

Then open `http://localhost:3000`.

Open `TerrainTest.html` for the included interactive test harness. It provides mining, altitude controls, camera movement, zoom, live chunk statistics, and two simulated clients connected through an ordered authoritative change stream.

## Constructor options

| Option | Default | Meaning |
| --- | ---: | --- |
| `width` | `16384` | Finite world width in cells |
| `height` | `16384` | Finite world height in cells |
| `chunkSize` | `64` | Width and height of each lazy chunk |
| `maxLoadedChunks` | `512` | Soft cache limit; dirty chunks are protected |
| `minAltitude` | `-5` | Lowest altitude |
| `maxAltitude` | `5` | Highest altitude |
| `altitude` | `0` | Initially viewed altitude |
| `seed` | `4182` | Deterministic terrain seed |
| `worldId` | `world-{seed}` | Multiplayer/save identity |
| `actorId` | `client` | Unique local peer identity |
| `tiles` | `World.TILES` | JSON-compatible tile definitions |
| `tileSetId` | `worldjs-default-v1` | Version identity for the tile schema |
| `biomes` | `World.BIOMES` | Center-out biome definitions from `Biomes.json` |
| `biomeSetId` | `worldjs-center-out-v1` | Multiplayer biome-schema version |
| `biomeCenterX`, `biomeCenterY` | world center | Spawn and radial-biome origin |
| `spawnRadius` | `generation.spawn.radius` | Guaranteed central spawn biome |
| `biomeWarpStrength` | `0.065` | Irregularity applied to circular boundaries |
| `biomeWarpScale` | world size ÷ 11 | Scale of biome-boundary noise |
| `generation` | `World.GENERATION` | Terrain, spawn, cave, and resource settings |
| `generationSetId` | `worldjs-generation-v1` | Multiplayer generation-schema version |
| `brushRadius` | `7` | Default mining radius |
| `cameraX`, `cameraY` | world center | Initial camera center |
| `zoom` | `generation.rendering.fallbackCellSize` | CSS pixels per terrain cell |
| `maxChangeLog` | `10000` | Locally retained cell changes |
| `autoRender` | `true` | Render after public mutations |

Keep `seed`, dimensions, chunk size, altitude range, and generator code identical across clients and servers. `worldId` must identify that exact world instance.

## JSON tile definitions

Every pixel type is defined in `tiles.json`. Load it before constructing a world:

```js
const tiles = await World.loadTiles("./tiles.json");

const world = new World(canvas, {
  tiles,
  tileSetId: "realm-tiles-v1"
});
```

`World.loadTiles(url, options?)` uses `fetch()`, checks the HTTP response, parses the JSON, and returns the tile object. Its optional `cache` and `signal` values are passed to `fetch()`:

```js
const controller = new AbortController();
const tiles = await World.loadTiles("/data/tiles.json", {
  cache: "reload",
  signal: controller.signal
});
```

`World.TILES` contains the same built-in definitions as a fallback for offline construction:

```js
console.log(JSON.stringify(World.TILES, null, 2));
```

Its shape is:

```json
{
  "stone": {
    "id": 5,
    "name": "Stone",
    "color": [91, 99, 101],
    "solid": true,
    "mineable": true,
    "liquid": false,
    "hardness": 4
  }
}
```

Each definition contains:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | integer `0–255` | Compact value stored in chunk arrays and network deltas |
| `name` | string | Display name |
| `color` | `[r, g, b]` | Canvas rendering color |
| `solid` | boolean | Whether the tile is treated as solid terrain |
| `mineable` | boolean | Whether `mine()` may remove it |
| `liquid` | boolean | Whether the tile represents a liquid |
| `hardness` | number | Game-facing hardness metadata |

Create a custom set by copying the JSON data and passing it to the constructor:

```js
const tiles = JSON.parse(JSON.stringify(World.TILES));
tiles.stone.color = [110, 116, 120];
tiles.stone.hardness = 5;

const world = new World(canvas, {
  tiles,
  tileSetId: "realm-tiles-v2"
});
```

The class clones and validates the object, so later changes to the source object do not silently mutate a running world. IDs must be unique. The eight base generator keys—`air`, `water`, `sand`, `grass`, `soil`, `stone`, `ore`, and `crystal`—must remain present with IDs `0–7`. Biome surface and resource keys must also resolve to valid tiles. Additional definitions may use any unused ID through `255`.

`tileSetId` is included in change packets, chunk snapshots, and saves. Multiplayer peers reject data from a different tile schema. Increase it whenever tile IDs or their gameplay meaning changes.

## 16×16 tilemap atlas

`World.js` automatically attempts to load `tilemap.png`. Every atlas cell is exactly `16 × 16` source pixels.

The source lookup is:

```js
const sourceX = 16 * TileID;
const sourceY = 16 * BiomeID;
```

In atlas form:

```text
                         TileID →
BiomeID 0    [0,0] [1,0] [2,0] [3,0] ...
BiomeID 1    [0,1] [1,1] [2,1] [3,1] ...
BiomeID 2    [0,2] [1,2] [2,2] [3,2] ...
BiomeID 3    [0,3] [1,3] [2,3] [3,3] ...
BiomeID 4    [0,4] [1,4] [2,4] [3,4] ...
```

For example, Tile ID `15` in Biome ID `3` uses:

```js
sourceX = 16 * 15; // 240
sourceY = 16 * 3;  // 48
```

With the supplied 21 tile IDs (`0–20`) and five biome IDs (`0–4`), a complete atlas is:

```text
width  = 21 * 16 = 336 pixels
height =  5 * 16 =  80 pixels
```

Configuration lives in `generation.json`:

```json
{
  "rendering": {
    "tileSize": 16,
    "tilemapUrl": "./tilemap.png",
    "fallbackCellSize": 16
  }
}
```

`tileSize` is validated as exactly `16`. `fallbackCellSize` defaults the display zoom to the same 16×16 grid when no atlas image is available. Atlas and fallback cells therefore retain identical world alignment, camera bounds, pointer hit testing, and destruction coordinates.

Override only the URL when constructing a world:

```js
const world = new World(canvas, {
  tiles,
  biomes,
  generation,
  tilemapUrl: "/art/world-tilemap.png"
});

await world.tilemapReady;
```

You can also load or replace an atlas later:

```js
await world.loadTilemap("./tilemap.png");
world.setTilemap(existingImageElement);
```

If `tilemap.png` fails to load, rendering continues with the biome-tinted solid color from `tiles.json`. If an individual atlas coordinate falls outside the image bounds, only that cell uses the solid-color fallback. An excavated air cell renders the lower altitude’s atlas tile with a dark overlay.

Tilemap events:

| Event | Meaning |
| --- | --- |
| `tilemapload` | Atlas loaded and passed basic dimension checks |
| `tilemaperror` | Image loading failed or the supplied image was invalid |

## Center-out biomes

Biome data lives in [Biomes.json](./Biomes.json). There is no separate biome class: `World.js` loads the JSON object and owns biome lookup, spawn placement, radial noise, terrain generation, rendering tints, saves, and multiplayer validation.

```js
const [tiles, biomes, generation] = await Promise.all([
  World.loadTiles("./tiles.json"),
  World.loadBiomes("./Biomes.json"),
  World.loadGeneration("./generation.json")
]);

const world = new World(canvas, {
  tiles,
  biomes,
  generation,
  worldId: "realm-01",
  biomeSetId: "realm-biomes-v1"
});
```

The exact center of the world is the spawn point:

```js
const spawn = world.getSpawn();
// { x, y, radius }
```

Biomes progress outward in overlapping radius bands. Large, low-frequency noise warps their boundaries so they form natural regions instead of perfect circles. The protected center always selects the first biome and suppresses caves while forcing the surface above sea level.

```js
const biome = world.getBiomeAt(player.x, player.y);

console.log({
  key: biome.key,
  name: biome.name,
  danger: biome.danger,
  distanceFromCenter: biome.radialDistance,
  isSpawn: biome.isSpawn
});
```

Each entry in `Biomes.json` contains:

| Field | Meaning |
| --- | --- |
| `id` | Stable numeric biome ID |
| `name` | Display name |
| `start`, `end` | Normalized radial range from center to outer corners |
| `heightBias` | Adds lowlands or raised terrain |
| `ridgeStrength` | Controls mountain intensity |
| `surface`, `shallow`, `beach` | Keys referencing entries in `tiles.json` |
| `tint` | RGB multipliers applied during rendering |
| `danger` | Game-facing progression metadata |
| `resourceSpawnNodes` | Deterministic resource definitions available in this biome |
| `caves` | Entrance density and flooding rules for this biome |

The included progression is:

1. Spawn Meadows
2. Greenwood
3. Sunken Mire
4. Frozen Highlands
5. Ember Reach

Ranges may overlap. At a coordinate, `World.getBiomeAt()` selects the biome whose band center best matches the warped radial distance. Keep the first biome starting at `0`, and ensure the last biome extends beyond `1` so every corner is covered.

`biomeSetId` travels with deltas and chunk snapshots. Multiplayer peers reject incompatible biome generation rules before applying terrain changes.

## Generation settings

[generation.json](./generation.json) is the single customization object for terrain shape and world features:

```js
const generation = await World.loadGeneration("./generation.json");
const world = new World(canvas, {
  generation,
  generationSetId: "realm-generation-v1"
});
```

The terrain pipeline combines:

1. Low-frequency fractal continental noise
2. Domain warping that bends coastlines and land masses
3. Higher-frequency terrain detail
4. Ridge noise multiplied by the active biome
5. Center-to-edge island falloff
6. Biome elevation bias
7. A blended, playable spawn plateau

This produces connected islands, bays, peninsulas, inland hills, mountain ridges, shallow coasts, and an ocean boundary while retaining deterministic chunk generation. Altitudes above `seaLevel` are dry land; altitude `seaLevel` is the shoreline band; lower exposed cells are water.

Important `terrain` settings:

| Setting | Effect |
| --- | --- |
| `continentScale` | Size of major islands and land masses |
| `continentOctaves` | Continental fractal detail |
| `continentPersistence` | Strength retained by successive octaves |
| `detailScale`, `detailOctaves`, `detailStrength` | Local terrain variation |
| `domainWarpScale`, `domainWarpStrength` | Coastline distortion |
| `ridgeScale`, `ridgeThreshold` | Mountain band shape |
| `elevationAmplitude` | Conversion from noise to altitude layers |
| `landBias` | Global lift applied before altitude conversion |
| `islandFalloffStart`, `islandFalloffStrength` | Outer-ocean boundary |
| `seaLevel` | Water altitude |
| `coastWidth` | Reserved coast tuning value |
| `deepMaterial` | Tile used below biome topsoil |

The `spawn` section controls the safe center plateau. `flatRadius` is perfectly flattened to `altitude`; `blendRadius` eases that plateau into surrounding procedural terrain. Cave fields and resource nodes are suppressed within their configured spawn clearances.

### Sea-level calibration

The supplied settings use:

```json
{
  "seaLevel": 0,
  "landBias": 0.5,
  "islandFalloffStart": 0.82,
  "islandFalloffStrength": 0.9
}
```

`landBias` is the primary dry-land control:

- Increase it when too much terrain is submerged.
- Decrease it when the world lacks oceans and channels.
- Raise `islandFalloffStart` to move the outer ocean closer to the map edge.
- Raise `islandFalloffStrength` to make the edge become deep ocean more quickly.
- Use biome `heightBias` for regional tuning rather than changing the global sea level.

The supplied calibration makes Meadows and Greenwood predominantly dry, Mire intentionally wet but traversable, Highlands mountainous, and Ember Reach a mixture of outer islands and ocean. After changing generation values, regenerate with the same seed and inspect several regions rather than judging only the spawn chunk.

Increase `generationSetId` whenever generation values change for a live multiplayer world. Otherwise two clients could generate different pristine terrain from the same seed.

## Resource spawn nodes

Resource definitions live inside each biome under `resourceSpawnNodes`. Global placement spacing and limits live in `generation.json`.

```js
const cx = Math.floor(player.x / world.chunkSize);
const cy = Math.floor(player.y / world.chunkSize);
const nodes = world.getResourceSpawnNodes(cx, cy);
```

Each returned node is deterministic:

```js
{
  id: "4182:resource:84:19:copper_deposit",
  type: "copper_deposit",
  tile: "copper",
  tileId: 15,
  x: 8120,
  y: 1844,
  altitude: 2,
  surfaceAltitude: 3,
  amount: 17,
  biome: "greenwood"
}
```

Persist only depletion or modification state keyed by `id`; pristine nodes regenerate from the seed. Included resources cover all five biomes: stone and flint, copper and tin, iron and bog crystal, silver and mountain crystal, obsidian and ember cores.

## Caves

Subsurface cave voids are generated directly into negative-altitude layers. `generation.caves` controls their noise field and entrance spacing; each biome controls whether entrances exist, their density, and flooding probability.

```js
const caveEntrances = world.getCavesInChunk(cx, cy);
const undergroundVoid = world.isCaveAt(x, y, -3);
```

Entrances return stable IDs, position, surface altitude, radius, depth, biome, and flooding state. Spawn Meadows disables caves. Sunken Mire caves are commonly flooded, while Highlands and Ember Reach caves are usually dry.

## Camera and rendering

`render()` draws only the current viewport into a reusable off-screen canvas, then scales it with nearest-neighbor sampling.

```js
world.setCamera(player.x, player.y, 8);
world.pan(10, 0);
world.setAltitude(-2);
```

Useful methods:

- `setCamera(x, y, zoom?)`
- `pan(dx, dy)`
- `getViewport()`
- `setAltitude(z)`
- `resize()`
- `render()`
- `eventToWorld(pointerEvent)`

For smooth animation, set `autoRender: false`, mutate or pan as needed, and call `render()` once from `requestAnimationFrame`.

```js
const world = new World(canvas, { autoRender: false });

function frame() {
  world.setCamera(player.x, player.y);
  world.render();
  requestAnimationFrame(frame);
}
frame();
```

## Terrain and mining

```js
const material = world.materialAt(x, y, altitude);
const removed = world.mine(x, y, radius, altitude, {
  operationId: crypto.randomUUID(),
  render: false
});
world.setMaterial(x, y, altitude, World.STONE);
```

`mine()` batches a whole blast into one local revision and one operation ID. Radius is capped at 256 cells to prevent accidental unbounded client work.

Material constants:

| Constant | ID |
| --- | ---: |
| `World.AIR` | `0` |
| `World.WATER` | `1` |
| `World.SAND` | `2` |
| `World.GRASS` | `3` |
| `World.SOIL` | `4` |
| `World.STONE` | `5` |
| `World.ORE` | `6` |
| `World.CRYSTAL` | `7` |

## Multiplayer model

Use an authoritative server. Clients should send mining intents or locally predicted change packets; the server validates reach, radius, permissions, material, rate limits, and revision order before broadcasting an authoritative packet.

Do not treat client-generated deltas as trusted game state.

### Client transport example

```js
const socket = new WebSocket("wss://game.example/world/realm-01");

world.on("change", ({ source }) => {
  if (source !== "local" || socket.readyState !== WebSocket.OPEN) return;
  const packet = world.drainChanges();
  if (packet.changes.length) socket.send(JSON.stringify(packet));
});

socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);

  if (message.type === "world-changes") {
    world.applyChanges(message.packet);
  }

  if (message.type === "chunk-snapshot") {
    world.importChunk(message.chunk);
  }
});
```

`drainChanges()` returns and clears unsent local deltas:

```js
{
  protocol: 1,
  worldId: "realm-01",
  seed: 4182,
  tileSetId: "realm-tiles-v1",
  biomeSetId: "realm-biomes-v1",
  generationSetId: "realm-generation-v1",
  actorId: "peer-123",
  revision: 17,
  changes: [
    { x: 8021, y: 4108, z: -2, material: 0, revision: 17, operationId: "peer-123:9" }
  ]
}
```

Transport packets are plain data and work over WebSocket, WebTransport, Socket.IO, RTCDataChannel, or HTTP. Binary encoding and compression can be layered on later without changing the world model.

### Authoritative packet ordering

For strict gap detection, the server should broadcast:

```js
{
  protocol: 1,
  worldId: "realm-01",
  seed: 4182,
  tileSetId: "realm-tiles-v1",
  biomeSetId: "realm-biomes-v1",
  generationSetId: "realm-generation-v1",
  baseRevision: 1041,
  revision: 1042,
  changes: [
    { x: 8021, y: 4108, z: -2, material: 0, operationId: "server:1042" }
  ]
}
```

`applyChanges()`:

- rejects another protocol, seed, world ID, tile set, biome set, or generation set;
- ignores packets older than the applied remote revision;
- detects `baseRevision` gaps by default;
- de-duplicates operation IDs;
- applies all cells before rendering once;
- never echoes remote changes into the local outgoing queue.

When a gap is detected, request missing deltas with `changesSince(revision)` on the authority or replace nearby state with chunk snapshots. Use `{ strictRevision: false }` only during explicit snapshot recovery.

### Prediction and reconciliation

For responsive mining:

1. Apply `mine()` locally with a unique operation ID.
2. Send `drainChanges()` immediately.
3. The server validates the operation and assigns the authoritative revision.
4. Every peer applies the broadcast with `applyChanges()`.
5. If the server rejects or modifies an operation, send authoritative chunk snapshots for the affected chunks.

Operation IDs make accepted predictions idempotent when they return to their originating client.

## Chunk persistence and streaming

Export a chunk after changing it:

```js
const snapshot = world.exportChunk(cx, cy, altitude);
await database.put(`${snapshot.z}:${snapshot.cx}:${snapshot.cy}`, snapshot);
world.markChunkPersisted(cx, cy, altitude);
```

Load a server snapshot:

```js
world.importChunk(snapshot);
```

Important methods:

- `getChunk(cx, cy, altitude, create?)`
- `exportChunk(cx, cy, altitude)`
- `importChunk(snapshot, options?)`
- `markChunkPersisted(cx, cy, altitude)`
- `evictChunks(limit?)`

`markChunkPersisted()` makes a dirty chunk eligible for eviction. Call it only after durable storage succeeds.

### Interest management

Servers should stream only chunks and changes near each player:

```js
const viewport = world.getViewport();
const minCX = Math.floor(viewport.x / world.chunkSize);
const maxCX = Math.floor((viewport.x + viewport.width - 1) / world.chunkSize);
const minCY = Math.floor(viewport.y / world.chunkSize);
const maxCY = Math.floor((viewport.y + viewport.height - 1) / world.chunkSize);
```

Subscribe the client to those chunk coordinates plus a small movement margin. Unsubscribe old regions as the camera moves.

## Events

```js
const unsubscribe = world.on("change", (event, instance) => {
  console.log(event.source, event.revision, event.changes);
});

unsubscribe();
```

Events:

| Event | Payload |
| --- | --- |
| `change` | `{ source, revision, operationId?, changes }` |
| `chunkload` | `{ cx, cy, altitude }` |
| `reset` | `{ seed }` |

## Save state

`serialize()` returns world metadata plus dirty chunk snapshots only. Pristine terrain is regenerated from the seed.

```js
const save = world.serialize();
localStorage.setItem("world-save", JSON.stringify(save));
```

For large sessions, persist each dirty chunk separately in IndexedDB or server storage instead of placing the entire save in `localStorage`.

## Client performance guidance

- Use `64` or `128` cell chunks; benchmark for your target devices.
- Keep zoom at one CSS pixel per cell or higher.
- Render once per animation frame, not once per pointer event.
- Coalesce pointer movement and network sends to 20–30 Hz.
- Send one mining intent when possible instead of thousands of raw cells.
- Persist dirty chunks before allowing eviction.
- Move generation or compression to a Web Worker if profiling shows main-thread stalls.
- Treat `maxLoadedChunks` as a soft limit because unsaved dirty chunks are protected.

## Security and validation

An authoritative server should validate:

- `worldId`, seed, protocol, all three schema IDs, and expected revision;
- integer coordinates, altitude, material IDs, and world bounds;
- maximum blast radius and changes per operation;
- player range, tools, cooldowns, and permissions;
- operation ID uniqueness and rate limits.

The class validates packet shape at a basic level, but it is not an anti-cheat or networking server.
