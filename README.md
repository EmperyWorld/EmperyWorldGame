# EmperyWorldGame

**License:** [MIT](LICENSE). First-party code and project-owned assets are open
for use, modification and redistribution. Third-party components retain their
own licenses; see [NOTICE](NOTICE).

Browser solo action RPG (Phaser + Fastify). Monorepo on pnpm + turbo.

## Quick start

```bash
pnpm install
cp config/services.example.yaml config/services.yaml   # edit URLs if needed

# Локальная БД (перед запуском с save.backend: postgres):
pnpm start:infra

# Скрипты запуска:
./scripts/start-all.sh          # API (build) + Client/Admin preview (бандл, без /src)
./scripts/start-server.sh       # API :3000 + Admin :5190
./scripts/start-client.sh       # UI  :5180
./scripts/start-admin.sh        # только Admin :5190
./scripts/start-dev.sh          # server+client сразу
./scripts/start-server-prod.sh  # build + node

# или через pnpm:
pnpm start:all                  # :3000 + preview :5180/:5190 (без /src)
pnpm start:server               # :3000 + админка :5190
pnpm start:client
pnpm start:admin
pnpm start:dev
pnpm start:server:prod

pnpm dev:server    # без bootstrap-проверок, только API
pnpm dev:client
pnpm dev:admin
```

Порты: API **3000**, игра **5180**, админка **5190** (идёт вместе с `start:server`).

### Multiplayer infra (local Podman)

Postgres + Redis с bind-mount в `data/postgres` и `data/redis`
(порты **5433** / **6380**, чтобы не конфликтовать с другими локальными стеками):

```bash
pnpm start:infra      # или ./scripts/start-infra.sh
pnpm status:infra
pnpm stop:infra       # данные на диске остаются
```

URL задаются в `config/services.yaml` → `persistence`. По умолчанию `save.backend: postgres`:
- PostgreSQL хранит прогресс; операции подтверждаются после транзакции, повторные команды распознаются по `Idempotency-Key`.
- Файловые сейвы импортируются один раз и остаются бэкапами. При сбое БД автоматического перехода на файлы нет.
- `pnpm persistence:init` обновляет схему существующей БД; скрипты запуска сервера вызывают его автоматически.
- Один игровой сервер владеет миром через advisory lock. Redis хранит presence и передаёт события; несколько владельцев одной симуляции не допускаются.
- Движение работает по протоколу v2: команды направления, серверный шаг 50 мс, общая геометрия и подтверждения. Клиент и сервер нужно обновлять вместе.

Для разработки без БД явно установите `save.backend: files`; этот режим не пишет в PostgreSQL.
Метрики доступны администраторам на `/api/admin/runtime-metrics`, readiness — на `/ready`.
Эксплуатация, автозапуск, локальные бэкапы и восстановление: [docs/operations.md](docs/operations.md).
Изолированные проверки нагрузки: `pnpm benchmark:runtime --players=10,50,100 --seconds=3`.
Порядок миграции, сетевые сценарии, PostgreSQL-бенчмарк и границы масштабирования: [docs/multiplayer-rollout.md](docs/multiplayer-rollout.md).

### Admin

1. Зарегистрируйтесь обычным логином в игре.
2. Выдайте права: `pnpm admin:grant -- --user=USERNAME`  
   или при старте сервера: `EMPERY_BOOTSTRAP_ADMIN=USERNAME pnpm start:server`
3. Откройте http://127.0.0.1:5190 — сейвы, онлайн, generate items/media, reset encounter.

## Structure

| Path | Description |
|------|-------------|
| `apps/client` | Vite + Phaser UI |
| `apps/admin` | Admin tooling UI (:5190) |
| `apps/server` | Game API, combat, saves |
| `content/` | YAML: items, skills, NPCs, locations, shops, crafts |
| `packages/shared` | Types, equipment slots |
| `packages/media` | ComfyUI catalog |

## Commands

```bash
pnpm build              # build all packages
pnpm check              # lint + typecheck + все настроенные тесты + build
pnpm test               # vitest: server/client/save/media/world-engine
pnpm generate:media:items
pnpm generate:media:skills
pnpm generate:items -- --count=10          # LLM-имена + безопасные статы + иконки ComfyUI
pnpm generate:items -- --count=5 --rarity=epic --slot=weapon --no-media
```

Предметы из `generate:items` по умолчанию **drop-only** (`content/items/generated.yaml`, не в shops) и сразу с иконками. Статы только из бюджетов (hard cap pAtk≤80 и т.п.) — LLM пишет имя/описание/icon prompt. `--no-media` — только YAML.

CI поднимает изолированные Postgres/Redis, применяет `deploy/podman/init/01-schema.sql` и обязательно запускает интеграционные тесты persistence. Для своего окружения доступны `EMPERY_POSTGRES_URL` и `EMPERY_REDIS_URL`.

```bash
RUN_PERSISTENCE_TESTS=1 pnpm --filter @empery/server exec vitest run src/services/persistence.test.ts
node scripts/generate-maps.mjs --only=empery_haven
```

`RUN_PERSISTENCE_TESTS=1` завершает проверку ошибкой, если обязательная инфраструктура недоступна. Для города исправления делаются в layout/редакторском override, затем перегенерируются props, карта и YAML; occupancy/census tests проверяют согласованность.

## Controls

`WASD` move · `Space` attack · `[1]`–`[9]` skills · `Shift` dash · `E` talk · `I` inventory · `K` skills · `T` travel

## Loop

Роща (квест Миры) → гавань (лавка / заточка / крафт / трактир) → фарм adena в полях или Act 2 данж «Пещеры теней» (капитан) → родины эльфов/орков.

## Design notes

- **Phaser:** один `Phaser.Game` на сессию персонажа; travel = `GameScene.transitionTo` / `scene.restart`, не `game.destroy`. Destroy только при выходе в меню.
- **Encounter session:** на вход в локацию `POST /encounter/start` → `encounterId` + сущности с `entityId` и HP на сервере. Бой: `POST /combat/batch-attack` (один HTTP на замах). Публичные `/combat/attack`, `/combat/kill` и `/combat/enemy-hit` удалены: награды и входящий урон определяет сервер.
- Сервер принимает только проверенные поля WS. Позиция ограничена бюджетом перемещения; stamina, рывки, cooldown атак, урон мобов и DOT рассчитываются сервером. Клиент предсказывает движение и принимает `player_state`, `enemy_hit`, `position_correction`.
- `PATCH /api/saves/:id` меняет только hotbar. `POST /api/saves/:id/position` сохраняет уже принятую WS-позицию, не принимает новый teleport.
- Игровые команды читают актуальный сейв через `SaveManager.command` и выполняют мутации без `await` внутри. Асинхронная генерация диалога проходит после команды.
- `createGameServer` в `apps/server/src/app.ts` создаёт `{app, context}` без listen; маршруты разделены по доменам в `apps/server/src/routes`. `index.ts` отвечает за запуск и сигналы. Закрытие останавливает симуляцию, завершает запросы и сбрасывает сейвы/зеркало.
- Сейвы имеют монотонную `revision`; Postgres обновляет payload и дочерние таблицы только для принятой версии. Удаления оставляют локальные tombstones, предотвращающие восстановление старого зеркала. Неудачные записи зеркала повторяются; перезапуск восстанавливает зеркало из файлов/tombstones.
- Аккаунты и сессии пишутся через temp+rename с `.bak`. Повреждение файлов останавливает загрузку/запись без перезаписи повреждённых данных и последней резервной копии. Восстановление — из проверенной резервной копии, при остановленном сервере.
- Произвольное создание media jobs требует admin; игрок может читать только своё задание портрета. Клиент отправляет auth token при polling.
- Media worker использует атомарные claims на локальной файловой системе и один завершённый проход перед следующим poll. Workers могут работать параллельно на одном хосте; claims погибших процессов восстанавливаются. Сохранённый ComfyUI prompt ID позволяет продолжить ожидание результата. Общая очередь на разных хостах потребует другого backend.
- Клиентские системы: `InputManager` (`uiBlocked`), `EntityManager` (pool), `CombatSystem`, `NetworkManager`, `VfxSystem`, `QuestPresenter`.
- На родине расы (+5% XP). Мистик тратит MP на активные скиллы.
- Цены лавки: `content/shops/haven_merchant.yaml`. Крафт кожи: `content/crafts/leather.yaml`.

## Client layout (`apps/client/src/game`)

```
game/
  create-game.ts
  scenes/BootScene.ts, GameScene.ts
  systems/ InputManager, NetworkManager, EntityManager, ResourceCache, VfxSystem, QuestPresenter
  controllers/ PlayerController, EnemyAIController, CombatSystem
  fsm/ PlayerFsm, EnemyFsm
  entities/ EnemyEntity
```

`main.ts` — DOM UI + travel API; Phaser не уничтожается при смене локации.

## Media (ComfyUI)

1. Start ComfyUI and set `comfyui.url` in `config/services.yaml`
2. `pnpm generate:media -- --only=item_<id> --force`
3. Assets land in `data/generated/assets/`, manifest in `content/media/manifest.json`

New items in `content/items/*.yaml` can auto-generate icons via Cursor hook (`.cursor/hooks/`).

## Config

Copy `config/services.example.yaml` → `config/services.yaml`. Player saves and generated PNGs stay in `data/` (gitignored).

> Public source snapshot: local configuration, saves, models, runtime-generated media, caches and GitHub Actions workflows are excluded. Use the example configuration and media generation instructions above.
