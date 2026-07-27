# World.js

`World.js` is a browser-native ES6 class for large, layered, destructible top-down RPG terrain. It uses deterministic procedural generation, lazy chunks, viewport-only Canvas rendering, and JSON-safe change packets suitable for authoritative multiplayer.

It targets modern evergreen browsers with ES2022 class-field and private-method support. The canvas check is realm-safe, so canvases supplied by an iframe document are supported.

## Project files

| File | Responsibility |
| --- | --- |
| `World.js` | Generation, chunks, rendering, destruction, saves, and multiplayer deltas |
| `World-Collision.js` | Terrain collision, surface walking, ledges, falling, raycasts, and reports |
| `Player.js` | Server authority, client prediction, control sampling, and movement |
| `Player-Render.js` | Sprite loading, animation, shadows, and presentation smoothing |
| `Player-Plugin.js` | Base contract for modular player systems |
| `OSJoypad.js` | Phone analog stick and configurable RPG action buttons |
| `Placeable.js` | Base lifecycle, validation, rendering, and serialization for placed objects |
| `Ladder.js` | Up/down placeable ladders connecting adjacent altitude layers |
| `tiles.json` | Pixel materials and resource materials |
| `Biomes.json` | The five radial biomes and biome-specific content |
| `generation.json` | Terrain shape, sea level, spawn, caves, and resource placement |
| `TerrainTest.html` | Interactive two-client test harness |
| `game.html` | Playable local game client |

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
  import World from "./World.js?v=player-render-9";

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

Open `game.html` for the playable client. Its initial world uses seed `4182`; pass a deterministic seed in the URL with `game.html?seed=12345`, or use **Generate New Seed** in the HUD. The game uses a smaller spawn plateau than the library default so coastlines, elevation, and terrain variation appear in the opening viewport.

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
| `collision` | `{}` | Collision, drop, gravity, and reporting options |

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
| `walkable` | boolean | Whether a non-solid tile can support surface movement |
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

Mining converts mineable walls into the non-solid `dirt_floor` material. Dirt
floor remains at the same altitude and supports surface movement, while water
and air remain non-walkable. Repeated mining cannot remove dirt floor.

## Placeables and ladders

`Placeable.js` is the parent class for world objects that can be validated,
placed, rendered, removed, and serialized. `Ladder.js` inherits from it and
connects adjacent altitude layers:

```js
import Ladder from "./Ladder.js";

const ladder = new Ladder({
  x: 120,
  y: 80,
  altitude: 1,
  direction: "down"
});

const placement = ladder.place(world);
if (placement.ok) ladder.use(player);
```

Ladders are placed as linked pairs. A down ladder automatically places its up
counterpart on the lower floor. An up ladder creates a dirt landing when the
layer above is air, then places its down counterpart there. Water, altitude
limits, and occupied endpoints prevent placement. `world.addPlaceable()`,
`world.removePlaceable()`, and `world.getPlaceablesAt()` manage placed objects;
`world.render()` draws them before players and `world.serialize()` includes
their serialized state.

Surface movement is bounded by the player's current altitude and cannot snap
to a higher layer. Ladder traversal explicitly changes the player altitude;
the game then renders only that player layer and its matching ladder endpoint.

`tileSetId` is included in change packets, chunk snapshots, and saves. Multiplayer peers reject data from a different tile schema. Increase it whenever tile IDs or their gameplay meaning changes.

## 16×16 tilemap atlas

`World.js` automatically attempts to load `Tiles.png`. Filenames are case-sensitive on many servers, so retain the capital `T`. Every atlas cell is exactly `16 × 16` source pixels.

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

The current `Tiles.png` is `64 × 64`, so it contains atlas space for Tile IDs `0–3` and Biome IDs `0–3`. All other tile/biome combinations correctly use solid-color fallback until the image is expanded to `336 × 80`.

Configuration lives in `generation.json`:

```json
{
  "rendering": {
    "tileSize": 16,
    "tilemapUrl": "./Tiles.png",
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
await world.loadTilemap("./Tiles.png");
world.setTilemap(existingImageElement);
```

If `Tiles.png` fails to load, rendering continues with the biome-tinted solid color from `tiles.json`. If an individual atlas coordinate falls outside the image bounds, only that cell uses the solid-color fallback. An excavated air cell renders the lower altitude’s atlas tile with a dark overlay.

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

## Terrain collision and drop detection

`World.js` imports `World-Collision.js` and creates one collision engine automatically:

```js
const world = new World(canvas, {
  collision: {
    radius: 0.38,
    maxStep: 1,
    maxDrop: 2,
    dropThreshold: 0.5,
    lethalDrop: 4,
    gravity: 18,
    terminalVelocity: 28,
    skin: 0.04,
    maxReports: 256
  }
});

world.collision; // WorldCollision instance
```

The engine reads live chunk state through `world.materialAt()`. Mining and multiplayer terrain changes therefore affect collision immediately; no separate collision mesh needs rebuilding.

### Surface information

Use surface queries for normal top-down outdoor movement:

```js
const altitude = world.getSurfaceAltitude(x, y);
const surface = world.getSurfaceInfo(x, y, {
  entityAltitude: player.altitude
});
```

`getSurfaceInfo()` reports:

```js
{
  x,
  y,
  altitude: 2,
  material: 11,
  tile: "snow",
  solid: true,
  liquidAltitude: null,
  inWater: false,
  submerged: false,
  seaLevel: 0,
  biome: "highlands"
}
```

It scans from the highest altitude downward and returns the first solid tile. A fully excavated vertical shaft returns `altitude: null`.

### Surface-aware entity movement

`world.moveEntity()` defaults to surface movement:

```js
const player = {
  x: spawn.x,
  y: spawn.y,
  altitude: world.getSurfaceAltitude(spawn.x, spawn.y),
  radius: 0.38
};

const result = world.moveEntity(player, velocityX * dt, velocityY * dt, {
  maxStep: 1,
  maxDrop: 2,
  allowDrop: false,
  canSwim: false
});
```

The method:

- substeps long movements to prevent tunnelling;
- samples the center and circular footprint;
- blocks rises higher than `maxStep`;
- detects ledges and excavated shafts;
- blocks unsafe drops unless `allowDrop` is true;
- optionally blocks entry into water;
- updates the entity in place;
- returns the final position, blocking reason, drop information, and report.

Possible surface blocking reasons are `world-boundary`, `step-too-high`, `drop-too-far`, and `water`.

### Cave and volume collision

Use explicit volume mode when an entity moves through a cave layer and solid pixels are walls:

```js
const result = world.moveEntity(entity, dx, dy, {
  mode: "volume",
  altitude: -3,
  radius: 0.42,
  slide: true
});
```

Volume movement uses swept-circle tests and axis sliding:

```js
world.collision.isSolidAt(x, y, altitude);
world.collision.isLiquidAt(x, y, altitude);
world.collision.overlapsSolid(x, y, altitude, radius);
world.collision.sweepCircle(from, to, options);
world.collision.moveCircle(entity, dx, dy, options);
```

Out-of-world coordinates are treated as solid boundaries.

### Ledge and drop detection

Inspect a move without applying it:

```js
const drop = world.detectDrop(
  { x: player.x, y: player.y, altitude: player.altitude },
  { x: targetX, y: targetY },
  {
    maxDrop: 2,
    lethalDrop: 4
  }
);
```

The result includes:

```js
{
  isDrop: true,
  isVoid: false,
  dropHeight: 3,
  fromAltitude: 4,
  landingAltitude: 1,
  safe: false,
  lethal: false,
  intoWater: false,
  landingMaterial: 3,
  landingTile: "grass",
  biome: "meadows",
  from: { /* surface info */ },
  to: { /* surface info */ }
}
```

### Falling and landing

Entities may carry `altitude`, `verticalVelocity`, and an automatically managed `fallStartAltitude`:

```js
function update(dt) {
  const state = world.updateFalling(player, dt, {
    gravity: 18,
    terminalVelocity: 28,
    lethalDrop: 4
  });

  if (state.landed) {
    console.log(state.report.dropHeight, state.report.intoWater);
  }
}
```

`deltaSeconds` is clamped to `0.1` seconds by default to avoid extreme simulation jumps. Landing snaps to the current live terrain surface and reports drop height, impact velocity, lethality, water landing, and landing material.

### Terrain raycasts

Raycast through altitude layers:

```js
const hit = world.raycastTerrain(
  { x: player.x, y: player.y, altitude: 5 },
  { x: player.x, y: player.y, altitude: -5 },
  { stepLength: 0.25 }
);
```

The result contains `hit`, `point`, `fraction`, `distance`, and `material`.

### Collision reporting

Collision, drop, and landing events create ordered reports:

```js
const unsubscribe = world.collision.on("*", (report) => {
  console.log(report.id, report.type, report);
});

world.on("collisionreport", (report) => {
  sendToDiagnostics(report);
});

const newReports = world.getCollisionReports({ sinceId: lastSeenId });
const landings = world.getCollisionReports({ type: "landing" });

world.collision.clearReports();
unsubscribe();
```

Report types:

| Type | Produced by |
| --- | --- |
| `collision` | Blocked volume or surface movement |
| `drop` | An allowed surface movement crossed a ledge |
| `landing` | Falling simulation reached terrain |

Reports are local diagnostics and are not automatically included in multiplayer terrain packets.

## Authoritative players

`Player.js` uses `world.collision` for all movement. Create players through `World.js` so they are registered, rendered, and discoverable:

```js
const player = world.createPlayer({
  id: "player-42",
  role: "client",
  speed: 5,
  sprintMultiplier: 1.65,
  radius: 0.38,
  maxStep: 1,
  maxDrop: 2,
  canSwim: true,
  spriteUrl: "./player.png"
});
```

World player lifecycle:

```js
world.getPlayer("player-42");
world.renderPlayers();
world.removePlayer("player-42");
```

`world.render()` automatically renders registered players after terrain and before the mining cursor.

### Player options

| Option | Default | Meaning |
| --- | ---: | --- |
| `id` | generated | Network-stable player ID; set this explicitly for multiplayer |
| `role` | `client` | `client` or `server` |
| `x`, `y` | world spawn | Initial position |
| `altitude` | live surface | Initial altitude |
| `radius` | `0.38` | Collision footprint |
| `speed` | `5` | Cells per second |
| `sprintMultiplier` | `1.65` | Sprint speed multiplier |
| `acceleration` | `28` | Speed gained per second for responsive starts |
| `deceleration` | `36` | Speed removed per second after releasing movement |
| `airControl` | `0.35` | Fraction of normal acceleration while falling |
| `controlDeadzone` | `0.16` | Browser gamepad analog deadzone |
| `gamepadIndex` | `0` | Browser gamepad slot to sample |
| `maxStep` | `1` | Highest automatically traversable rise |
| `maxDrop` | `2` | Highest safe automatic drop |
| `canSwim` | `true` | Whether surface movement may enter water |
| `allowDrop` | `false` | Whether unsafe ledges may begin a fall |
| `maxInputDelta` | `0.1` | Maximum accepted input duration |
| `reconcileThreshold` | `0.03` | Position error that triggers correction |
| `teleportThreshold` | `3` | Large-error metadata threshold |
| `spriteUrl` | `./player.png` | Optional player sprite sheet |
| `renderSize` | `16` | Player display size on the 16×16 grid |
| `fallbackColor` | `#f3e56b` | Color used when the sprite is unavailable |
| `rendering` | `{}` | `PlayerRender` smoothing, animation, bob, and shadow options |
| `onSendInput` | `null` | Client transport callback |
| `onSendSnapshot` | `null` | Server transport callback |

### Controls and client prediction

Attach keyboard controls on the client:

```js
const localPlayer = world.createPlayer({
  id: session.playerId,
  role: "client",
  onSendInput(input) {
    socket.send(JSON.stringify({
      type: "player-input",
      input
    }));
  }
});

localPlayer.attachControls(window);

let previous = performance.now();
function frame(now) {
  const dt = (now - previous) / 1000;
  previous = now;

  localPlayer.update(dt);
  world.setCamera(localPlayer.x, localPlayer.y);
  world.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

Controls:

| Keys | Action |
| --- | --- |
| `W A S D` or arrows | Normalized eight-direction movement |
| Left or right Shift | Sprint |
| Gamepad left stick | Analog movement |
| Gamepad A / left-stick click | Sprint |

Each client update:

1. Samples controls.
2. Creates a monotonically sequenced input.
3. Applies it locally through terrain collision.
4. Stores it as an unacknowledged input.
5. Sends it through `onSendInput`.

Input shape:

```js
{
  playerId: "player-42",
  sequence: 81,
  moveX: 0.7071,
  moveY: -0.7071,
  sprint: false,
  delta: 0.0167,
  clientTime: 18420.5
}
```

Movement vectors are normalized, values are clamped, and `delta` cannot exceed `maxInputDelta`. Movement accelerates toward the requested velocity and decelerates after release. The velocity is part of authoritative state so reconciliation and replay remain deterministic.

### Phone joypad and RPG buttons

`OSJoypad.js` is a DOM-based, dependency-free phone controller. It feeds full analog values into `Player.sampleControls()` alongside keyboard and browser gamepad input:

```js
import OSJoypad from "./OSJoypad.js";

const joypad = new OSJoypad({
  root: document.querySelector(".hud"),
  buttons: [
    { id: "attack", label: "A", className: "primary" },
    { id: "interact", label: "B" },
    { id: "dodge", label: "X" },
    { id: "menu", label: "Y" }
  ]
}).bind(localPlayer);

joypad.on("action", ({ action, pressed }) => {
  if (action === "attack" && pressed) attack();
  if (action === "interact" && pressed) interact();
});
```

`dodge` is exposed as sprint by the default `sampleControls()` implementation. Use `isPressed(action)` for held actions, `setVisible(boolean)` to switch control schemes, and `destroy()` when leaving the game. `game.html` includes a complete responsive layout and maps attack to mining.

Any custom input device can integrate without changing `Player.js`:

```js
const detach = player.addControlSource({
  sampleControls: () => ({ moveX, moveY, sprint })
});
```

### Server authority

Create one server-role player for each connected player:

```js
const serverPlayer = serverWorld.createPlayer({
  id: connection.playerId,
  role: "server",
  onSendSnapshot(snapshot) {
    connection.send(JSON.stringify({
      type: "player-state",
      snapshot
    }));
  }
});

function receiveClientMessage(message) {
  if (message.type === "player-input") {
    serverPlayer.enqueueInput(message.input);
  }
}

function serverTick() {
  serverPlayer.processServerInputs(32);
}
```

The server:

- rejects another player ID;
- rejects invalid or already processed sequences;
- clamps movement, sprint state, and elapsed time;
- sorts queued inputs by sequence;
- applies movement against the authoritative live terrain;
- acknowledges the last processed input;
- emits a state snapshot after each accepted input.

Snapshot shape:

```js
{
  protocol: 1,
  type: "player-state",
  worldId: "realm-01",
  playerId: "player-42",
  serverTick: 1493,
  lastProcessedInput: 81,
  x: 8201.42,
  y: 8158.17,
  altitude: 1,
  direction: "north",
  moving: true,
  sprinting: false,
  falling: false,
  verticalVelocity: 0,
  velocityX: 2.4,
  velocityY: -1.1
}
```

In production, the server should also enforce session ownership, input-rate limits, tool/status effects, speed modifiers, and maximum sequence gaps before calling `enqueueInput()`.

### Reconciliation and replay

Apply authoritative snapshots on the owning client:

```js
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.type === "player-state") {
    localPlayer.applySnapshot(message.snapshot);
  }
});
```

`applySnapshot()`:

1. Verifies protocol, world ID, and player ID.
2. Ignores stale acknowledgements.
3. Removes acknowledged inputs.
4. Measures prediction error.
5. Resets to authoritative state when outside the threshold.
6. Replays remaining unacknowledged inputs through the same collision code.

Because server and client use the same seed, JSON schemas, terrain deltas, and `WorldCollision`, ordinary predictions converge without correction. A terrain revision should be delivered before any player snapshot that depends on it.

### Player rendering

`Player-Render.js` keeps presentation separate from authoritative state. `Player.render()` delegates to `player.renderer`, which loads a 16×16 directional sprite sheet, animates four walk frames, draws a terrain shadow and fallback marker, and smoothly follows corrected positions and altitude without changing collision coordinates.

```js
player.renderer.update(deltaSeconds);
player.render();

await player.loadSprite("./player.png");
player.renderer.snap(); // use after a deliberate visual teleport
```

Renderer options under `rendering` include `positionSmoothing`, `altitudeSmoothing`, `animationRate`, `bobStrength`, `shadowColor`, and `renderSize`. Server simulations do not need a renderer tick; browser clients should call `player.update(dt)` or `player.renderer.update(dt)` once per displayed frame.

### Remote players

For non-owned players, do not call `update()` or attach controls. Apply received state to their position and render them:

```js
const remote = world.createPlayer({
  id: remoteId,
  role: "client",
  spriteUrl: "./player.png"
});

remote.teleport(snapshot.x, snapshot.y, snapshot.altitude, {
  report: false
});
remote.direction = snapshot.direction;
remote.moving = snapshot.moving;
```

For production presentation, buffer remote snapshots and interpolate their display positions separately from authoritative collision state.

### Player sprite sheet

`player.png` uses 16×16 frames:

```text
sourceX = 16 * animationFrame
sourceY = 16 * directionRow
```

Direction rows:

| Row | Direction |
| ---: | --- |
| `0` | South |
| `1` | West |
| `2` | East |
| `3` | North |

Frames `0–3` form the walking cycle. A complete four-frame sheet is `64 × 64` pixels. If the image fails to load or a frame is missing, the player renders as a colored directional marker.

```js
await player.spriteReady;
await player.loadSprite("./player.png");
player.setSprite(existingImageElement);
```

### Player events

```js
player.on("*", (event) => {
  console.log(event.type, event);
});
```

| Event | Role | Meaning |
| --- | --- | --- |
| `prediction` | client | Local input was predicted |
| `reconcile` | client | Authoritative snapshot was processed |
| `authority` | server | Input was authoritatively simulated |
| `move` | both | Collision movement completed |
| `landing` | both | Falling simulation landed |
| `teleport` | both | Player was repositioned |
| `spriteload` | both | Player sprite loaded |
| `spriteerror` | both | Player sprite failed |
| `plugininstall` | both | A plugin and its dependencies were installed |
| `pluginremove` | both | A plugin was removed |

## Modular player plugins

Inventory, equipment, combat, crafting, skills, status effects, quests, and other player systems can be added without modifying `Player.js`.

Plugins extend `PlayerPlugin`:

```js
import Player from "./Player.js";
import PlayerPlugin from "./Player-Plugin.js";
```

Register plugin classes once during application startup:

```js
Player.registerPlugin("inventory", InventoryPlugin);
Player.registerPlugin("equipment", EquipmentPlugin);
Player.registerPlugin("combat", CombatPlugin);
```

Install plugins by ID when creating a player:

```js
const player = world.createPlayer({
  id: "player-42",
  role: "client",
  plugins: ["combat"]
});
```

Dependencies install automatically. If Combat depends on Equipment and Equipment depends on Inventory, the resulting deterministic order is:

```text
inventory → equipment → combat
```

Circular dependencies throw an error. Removing a plugin required by another plugin is blocked unless `{ force: true }` is explicitly supplied.

### Base plugin contract

```js
class ExamplePlugin extends PlayerPlugin {
  static pluginId = "example";
  static version = "1";
  static priority = 100;
  static dependencies = [];
  static networked = true;

  constructor(config = {}) {
    super({
      id: ExamplePlugin.pluginId,
      version: ExamplePlugin.version,
      priority: ExamplePlugin.priority,
      dependencies: ExamplePlugin.dependencies,
      networked: ExamplePlugin.networked,
      state: {
        enabled: true
      }
    });
  }

  install(player, config) {
    super.install(player, config);
  }

  uninstall() {
    super.uninstall();
  }

  serialize() {
    return super.serialize();
  }

  deserialize(authoritativeState) {
    super.deserialize(authoritativeState);
  }
}
```

Plugin IDs must start with a lowercase letter and contain only lowercase letters, numbers, `_`, or `-`.

Plugin state and configuration are cloned as plain structured data. Keep networked state JSON-compatible and free of DOM nodes, functions, sockets, or class instances.

### Inventory example

```js
class InventoryPlugin extends PlayerPlugin {
  static pluginId = "inventory";
  static version = "1";
  static priority = 10;

  constructor(config = {}) {
    super({
      id: "inventory",
      version: "1",
      priority: 10,
      state: {
        slots: Array(config.slots ?? 24).fill(null),
        selected: 0,
        revision: 0
      }
    });
  }

  addItem(item, amount = 1) {
    // The server should validate item identity, capacity, and ownership.
    this.state.slots[this.state.selected] = {
      item,
      amount
    };
    this.state.revision++;
  }

  augmentInput({ input }) {
    input.plugins.inventory = {
      selected: this.state.selected
    };
  }

  validateInput({ input }) {
    const selected = input.plugins?.inventory?.selected;
    return Number.isInteger(selected) &&
      selected >= 0 &&
      selected < this.state.slots.length;
  }
}
```

Returning `false` from `validateInput()` rejects the input on the server.

### Equipment example

```js
class EquipmentPlugin extends PlayerPlugin {
  static pluginId = "equipment";
  static version = "1";
  static priority = 20;
  static dependencies = ["inventory"];

  constructor() {
    super({
      id: "equipment",
      version: "1",
      priority: 20,
      dependencies: ["inventory"],
      state: {
        weapon: null,
        armor: null,
        carryWeight: 0
      }
    });
  }

  beforeMove(context) {
    const penalty = Math.min(0.5, this.state.carryWeight / 200);
    context.speed *= 1 - penalty;
  }
}
```

`beforeMove()` may adjust `speed`, `sprintMultiplier`, `moveX`, or `moveY`. Setting `context.cancelled = true`, or returning `false`, cancels movement.

### Combat example

```js
class CombatPlugin extends PlayerPlugin {
  static pluginId = "combat";
  static version = "1";
  static priority = 30;
  static dependencies = ["equipment"];

  constructor() {
    super({
      id: "combat",
      version: "1",
      priority: 30,
      dependencies: ["equipment"],
      state: {
        health: 100,
        stamina: 100,
        cooldownUntil: 0
      }
    });
  }

  augmentInput({ input }) {
    input.plugins.combat = {
      attack: Boolean(this.attackPressed)
    };
  }

  validateInput({ input }) {
    const attack = input.plugins?.combat?.attack;
    if (typeof attack !== "boolean") return false;

    // A real authority should also validate cooldown, stamina,
    // equipped weapon, range, line of sight, and target state.
    return true;
  }

  update({ delta }) {
    this.state.stamina = Math.min(
      100,
      this.state.stamina + delta * 8
    );
  }
}
```

### Available hooks

Hooks execute synchronously in ascending `priority`, then alphabetically by plugin ID.

| Hook | Context | Purpose |
| --- | --- | --- |
| `installed` | `{ plugin }` | React after installation |
| `removing` | `{ plugin }` | Cleanup before removal |
| `update` | `{ delta, controls }` | Per-player tick |
| `augmentInput` | `{ input, controls }` | Add plugin input data |
| `validateInput` | `{ input }` | Server validation |
| `beforeInput` | `{ input, predicted?, authoritative?, replayed? }` | Cancel or prepare input |
| `afterInput` | `{ input, result }` | React after movement |
| `beforeMove` | movement context | Apply movement modifiers |
| `afterMove` | `{ input, movement, result }` | React to collision movement |
| `beforeSnapshot` | `{ snapshot }` | Add authoritative snapshot data |
| `afterSnapshot` | reconciliation context | React after client reconciliation |
| `beforeRender` | rendering context | Draw below the player or cancel base rendering |
| `afterRender` | rendering context | Draw equipment, effects, or UI above the player |

Hooks must be synchronous so prediction and authority remain deterministic. Returning a Promise throws an error.

### Plugin state synchronization

Networked plugin state is included automatically in player snapshots:

```js
{
  plugins: {
    inventory: {
      version: "1",
      state: {
        slots: [],
        selected: 0,
        revision: 12
      }
    },
    equipment: {
      version: "1",
      state: {
        weapon: "bronze_sword",
        armor: "hide_tunic",
        carryWeight: 34
      }
    }
  }
}
```

During reconciliation, the client:

1. Requires every authoritative networked plugin to be installed.
2. Verifies the exact plugin version.
3. Deserializes authoritative state.
4. Corrects player position when necessary.
5. Replays unacknowledged inputs through the updated plugin state.

Set `networked: false` for presentation-only plugins that should never enter authoritative snapshots.

### Runtime management

```js
const inventory = player.usePlugin("inventory", {
  slots: 24
});

player.getPlugin("inventory");
player.getPluginManifest();

player.removePlugin("inventory"); // blocked if dependents remain
player.removePlugin("inventory", { force: true });
```

`player.destroy()` removes plugins in reverse order and calls every plugin’s `uninstall()` method.

### Authority requirements

Plugins extend the transport format, but do not make the client trustworthy. The server remains responsible for:

- validating every plugin input payload;
- owning inventory mutations and item creation;
- verifying equipment ownership and compatibility;
- computing damage, stamina, cooldowns, range, and line of sight;
- issuing authoritative plugin state in snapshots;
- rejecting missing, unknown, or incompatible plugin versions;
- persisting plugin state separately from transient client prediction.

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
| `collisionreport` | A collision, drop, or landing report from `world.collision` |
| `playerjoin` | `{ player }` after `createPlayer()` |
| `playerleave` | `{ player }` after `removePlayer()` |

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
