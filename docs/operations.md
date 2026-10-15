# Local operations

The configured game runs as the user systemd target `empery-game.target`. Its server, client and admin services restart after failures. PostgreSQL/Redis are started before the server, which applies idempotent schema upgrades. User lingering enables startup at boot without an interactive login. The server handles SIGTERM and drains durable writes before releasing world ownership.

```bash
pnpm build
pnpm services:install
systemctl --user start empery-game.target empery-backup.timer empery-monitor.timer empery-restore-check.timer
systemctl --user status empery-server.service
systemctl --user restart empery-game.target
systemctl --user stop empery-game.target
journalctl --user -u empery-server.service -f
```

`services:install` generates only Empery units for the current checkout and Node runtime. Reinstall after changing the checkout/runtime path. It enables units without starting or rebuilding them. `services:install` creates a random operations token when absent and writes matching configuration and `deploy/systemd/runtime.env` with mode 0600. Keep it out of version control. Client/admin preview services serve built artifacts; rebuild and restart the target after releases. Avoid running `start:all` simultaneously with the services.

Logs use journald's automatic rotation/retention. Service log rates are bounded. WebSocket query tokens are redacted from request logs. Logs can be inspected by unit; the shared host journal retains its system policy.

## Storage and authentication

PostgreSQL and Redis bind directories are configured in ignored `deploy/podman/.env` through `EMPERY_POSTGRES_DATA` and `EMPERY_REDIS_DATA`. The default remains repo `data/postgres` and `data/redis`. Database ports bind to loopback. On this host, active directories are under `/home/owned/.local/share/empery-world` on a separate NVMe from the heavily loaded `/data` filesystem. Original directories and the pre-migration dump remain available for recovery. Do not start both old and new clusters against the same game simultaneously.

PostgreSQL now stores `game_accounts` and `game_auth_sessions`. Startup validates and imports local accounts/sessions once in a transaction, records `file-auth-v1`, preserves password hashes, account IDs, privileges, save links and unexpired sessions, and retains the JSON files as backups. Session bearer tokens are stored only as SHA-256 digests in PostgreSQL. Files mode still uses explicit JSON development storage.

Authentication mutations wait for database completion before success. Storage failure returns 503 and makes readiness unavailable. Requests refresh database account/session state; open sockets refresh within five seconds, so external role/revocation changes propagate. `pnpm admin:grant -- --user=NAME [--revoke]` updates the configured primary backend. A database unique constraint handles concurrent registrations. Authoritative character `accountId` remains the ownership source; save-link lists are reconciled from character state.

## Backups and recovery

Copy `config/operations.example.json` to ignored `config/operations.json`, choose a backup directory on another physical disk, set retention (at least two days), container names and thresholds. Its `metricsToken` must match the server environment token. Protect this file with mode 0600. This installation keeps local copies on `/data/repos/EmperyWorldGame/data/backups/automatic`, separate from the active database disk. Local copies are the user's selected policy.

```bash
pnpm backup
pnpm backup:verify /absolute/path/to/backup-directory
systemctl --user list-timers 'empery-*'
```

An isolated restore verification runs every Sunday at 05:00 and records its result beside the verified backup. Daily backups run at 04:00 local time with up to ten minutes of randomized delay, resume missed runs, and use low CPU/I/O priority. A backup contains a custom-format PostgreSQL dump plus content/config, generated assets, media jobs and legacy/local state. PostgreSQL counts and the dump share an exported repeatable-read snapshot. File state is copied while the game is running; it is not a cross-store transaction. Pause a running media worker when an exact media-job snapshot is required. PostgreSQL characters, accounts, sessions and command receipts remain the durable gameplay state.

Backups are first written under a hidden partial directory, checksummed, and renamed only after success. Retention removes only validated older automatic backups; manual migration backups are preserved. Verification checks SHA-256 hashes, restores into a uniquely named disposable database, compares counts with the exported snapshot, checks session relationships, extracts files into a temporary directory, starts the restored game and requires readiness 200. It never overwrites the live database. Temporary state is removed after verification.

For an actual recovery, stop `empery-game.target`, keep a copy of the failed state, restore the selected dump into a new database, restore needed file state into a new directory, point the configuration at that recovered state, and start/verify the target. Keep the old state until the recovered game is validated. Changing back to the old physical directory after newer commits is a recovery to an older snapshot, not a lossless rollback.

## Monitoring

`empery-monitor.timer` checks every minute: readiness, PostgreSQL round-trip time, Redis, disk occupancy, backup age, progression queue/commit latency and event-loop delay. Protected `/api/ops/metrics` is enabled only with an operations token. It exposes the same bounded metrics as the administrator endpoint. Tokens are never printed by the monitor. Thresholds live in `config/operations.json`.

Changes in problems or recovery are recorded in journald and sent to desktop notifications when available. Service failures also trigger `empery-alert@.service`. Repeated unchanged problems do not produce repeated notifications. Monitor state is `data/operations-monitor.json`. A monitor failure caused by unreadable configuration remains visible as a failed systemd unit.

## Real network validation

```bash
RUN_PERSISTENCE_TESTS=1 EMPERY_POSTGRES_URL=postgres://... EMPERY_REDIS_URL=redis://... pnpm check
EMPERY_POSTGRES_URL=postgres://... pnpm soak:network --players=50 --seconds=900 --postgres=1 --output=data/verification/network-soak.json
pnpm soak:network --players=10 --seconds=60 --delay=150 --jitter=50 --loss=0.05
```

Integration tests cover a real three-client party, shared PvE XP, exclusive/concurrent loot pickup, authoritative PvP, movement/reconnect, travel and restart with persisted sessions/progress. Tests seed deterministic server fixtures; they do not automate every Phaser interaction.

The soak runs an isolated world/database with actual HTTP and TCP WebSocket connections, 20 movement messages per client per second, periodic progression commands, RTT probes and reconnects. It records bounded timing windows, periodic memory/connection samples, traffic and errors. The driver and server share a process; its memory and event-loop measurements include driver overhead. Delay/jitter/drop apply to outgoing movement commands only; RTT probes measure the actual local transport. These settings do not model TCP packet loss. Temporary databases require create/drop privileges. Increasing online capacity requires separate-host, representative combat/terrain workloads and longer measurements.

## Локальный ComfyUI из существующего каталога

Запуск: `bash scripts/start-comfyui.sh /путь/к/podryad`. Скрипт использует существующие `stack2/comfyui-clean` и `models/comfyui` через read-only bind-монты контейнера `ewg-comfyui`. Порт берётся из `comfyui.url` в `config/services.yaml` и публикуется только на `127.0.0.1`. Рабочая база, пользовательские настройки и PNG-результаты сохраняются в `data/comfyui-runtime`; исходный каталог и модели не изменяются.

Среда ComfyUI использует Python 3.10 и готовые зависимости из `.container-venv`. Bootstrap подключает их после стандартной библиотеки, чтобы старый пакет `argparse` не подменял встроенный модуль. CDI подключает GPU; CUDA/NVML/JIT-библиотеки системного драйвера дополнительно монтируются read-only. По умолчанию обычный режим с `--disable-dynamic-vram` держит текстовый энкодер на GPU. Для GPU с недостатком свободной памяти перед созданием контейнера задайте `EMPERY_COMFY_LOW_VRAM=1`: энкодер будет перенесён на CPU. Пользовательские и облачные API-ноды не нужны штатному игровому Flux-пайплайну и при этом запуске не загружаются.

Статус: `podman ps --filter name=ewg-comfyui`, логи: `podman logs ewg-comfyui`, API: `http://127.0.0.1:31003/system_stats`. Остановка: `podman stop ewg-comfyui`; повторный запуск тем же скриптом сохраняет bind-данные. Догенерация отсутствующих ресурсов: `pnpm generate:media` без `--force`; результат игры — WebP в `data/generated/assets`, с обновлением `content/media/manifest.json`.
