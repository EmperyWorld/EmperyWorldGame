# Сводка: комплексный пайплайн Phaser 4.2 + браузер

## Дата
2026-09-15

## Проблема

Узкое место — CPU decode сотен WebP, runtime atlas 4096 на главном потоке, CPU `TilemapLayer` и ~22 `Graphics.clear` на Haven. Картинка и геймплей должны остаться теми же: граждане / named NPC / Y-sort пропы **не** на `SpriteGPULayer`, ночь — overlay ColorMatrix, не `setLighting`.

## Волна 1 — Phaser 4.2 в рантайме

| Место | Зачем |
|---|---|
| `createGroundLayers` | один `TilemapGPULayer` (`createLayer(..., true)`), CPU только если GPU throw |
| `night-color-matrix` + `cameras.main.filters.external` | тот же `overlayColor`/`overlayAlpha`, без fullscreen Rectangle; fallback internal / Rectangle |
| `mapJsonUrl` + `MAPS_STAMP` | `?v=` на Tiled JSON; stamp пишет `generate-maps` |
| BootScene `load.on('progress')` | полоса «Загрузка локации…» |
| `smoothPixelArt` только `performance` | high/balanced — `pixelArt` как раньше |
| `webglcontextlost` | Phaser restore; если нет `webglcontextrestored` за 2с — toast + recreate Game |

## Волна 2 — билд-тайм атласы

| Место | Зачем |
|---|---|
| `scripts/pack-media-atlases.ts` | world per location + HUD; `pnpm pack:atlases`; хук после generate/convert |
| `preloadGameTextures` `load.atlas` / `load.pack` / compressed | runtime `packWorldMediaAtlas` только leftover, файл-атлас не CPU-перепаковывается; skipped кадры — `leftover[]` standalone |
| `hud-atlas` CSS sprite | инвентарь / магазин / скиллы / баффы читают один bitmap; `?v=generatedAt` |
| leftover props | остаются standalone, если не влезли в pack |

Процедурные combat/gear/mount атласы не трогали.

## Волна 3 — GPU-декор

| Место | Зачем |
|---|---|
| звёзды | `SpriteGPULayer` twinkle, Graphics fallback |
| Vfx ambient | GPU motes, cap 12 только на CPU-пути; high берёт каталожный count |
| дым / пар / угли / флаги / чайки | GPU members + property animation; performance — один кадр (`decorCounterDuration == null`) |
| bake static Graphics | пруд, вода, glow, если AABB ≤ 1024²; дороги/washes на всю карту не печём |

Граждане и city props — Sprites как раньше.

## Волна 4 — HTTP / SW / KTX

| Место | Зачем |
|---|---|
| Fastify `/media/assets` `/media/atlases` | `Cache-Control: immutable` |
| `GET /api/media/manifest` | `no-store` |
| Vite preview `/assets/*` immutable, `/maps` 1ч | hashed JS не залипает; карты бьются `?v=` |
| `public/sw.js` | cache-first `/media` `/maps` `/assets`; network-only `/api` `/ws` `/health`; только `import.meta.env.PROD` |
| `navigator.storage.persist()` | после успешного SW |
| `toktx` | опциональный ASTC/ETC2; без энкодера остаётся WebP |

Аудио Phaser Sound не переносили — UI-осцилляторы свои.

## Проверка

- Client: tests + `tsc --noEmit`. Server: `media-cache-headers` + tsc.
- `pnpm pack:atlases`: 23 world sheets (Haven 221 props → 4032×1042, leftover нет) + HUD 387 icons → 2048×860. `toktx` в PATH нет → WebP.
- HTTP (живой API/preview):
  - `GET /api/media/manifest` → `Cache-Control: no-store`, `atlases.hud` + `world.empery_haven`
  - `/media/atlases/hud.webp` и `/media/assets/*.webp` → `immutable`
  - preview `/assets/*.js` → `immutable`, `/maps/*.json` → `max-age=3600`
- Phaser GPU/ночь/иконки в браузере: нужен **перезапуск `pnpm start:all`** (preview бандл сейчас старый) + жёсткий refresh. `data/generated/atlases` в gitignore.

`load.pack` на клиенте не зовём: Phaser 4 типизирует второй аргумент как URL, а `*.pack.json` хранит пути **без** `?v=generatedAt` — при `immutable` атлас залип бы после `generate:media`. Грузим `load.atlas` / `loader.texture` с tagged URL.

## Правки после аудита (костыли)

| Было | Почему ломалось | Стало |
|---|---|---|
| Два `createLayer` (GPU + невидимый CPU) | `LayerData.tilemapLayer` — один указатель; второй слой перетирал GPU | Один слой: GPU `createLayer(..., true)`, иначе CPU. Collision/getTileAt есть на `TilemapLayerBase` (`isTilemap`) |
| `constructor.name === 'TilemapGPULayer'` | хрупко | `generateLayerDataTexture` |
| `GetBounds(Graphics)` | Graphics **без** mixin GetBounds → AABB 0, bake мёртвый | Явный `BakeRect` с call site |
| `game.textures.setFilter` | у `TextureManager` метода нет | `textures.each(t => t.setFilter)` |
| `preventDefault` на contextlost | блокирует restore Phaser 4 | 2s timeout, recreate только если не `webglcontextrestored` |
| `setScrollFactor` на SpriteGPULayer | компонента ScrollFactor нет | `scrollFactorX/Y` у member |
| `filters?.internal` duck-type | официально `cam.filters.external.addColorMatrix()` | тот API; звёзды ADD, чтобы читались сквозь матрицу |
| Fastify `header`/`setHeader` | v10 `setHeaders(reply)` | `reply.header` |
| `toktx --encode etc1s` | это Basis, не ETC2 Phaser | `--encode etc2` |
| sharp webp→png | лишний decode | resize→png |
| `MAPS_STAMP = 'pipeline-1'` | кэш карт не бьётся | sha1 JSON `ca130038973e` |
| SW без чистки / без fallback | старые cache names, сеть падает в пустоту | activate delete other keys; fetch error → cache hit |

Bake без AABB не зовём — дороги/washes на всю карту остаются Graphics.
