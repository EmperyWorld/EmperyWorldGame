# Multiplayer rollout

## Current single-node foundation

- HTTP/WebSocket account ownership and strict runtime input contracts.
- Movement protocol **v4**: `move_command {seq, locationId, dx, dy, dash?, persist?}`. Coordinates from the old `player_input` protocol are rejected. The server consumes at most one command per 50 ms step, normalizes diagonals, preserves analog throttle, bounds the backlog at eight commands, and rejects replays/stale locations.
- Client prediction uses the same 50 ms movement and swept collision geometry. Motion snapshots acknowledge processed sequences; reconciliation shifts pending predictions and ignores stale acknowledgements. Reconnect resets sequences while retaining server cooldowns.
- Shared terrain vocabulary, prop placements, baked alpha footprints, gates and collision math live in `packages/shared`. Player and enemy movement use swept geometry; PvE/PvP range checks also require line of sight. Attacks remain server-resolved HTTP/WS domain commands with server cadence; fixed-step world movement does not depend on client coordinates.
- Per-connection interest filtering and baseline/delta replication for players and enemies. Leaving interest recycles an enemy without a death/reward transition. Optional-field removal is explicit, including expired control effects. Combat bursts share a coalesced location update; observers with the same baseline reuse the encoded payload.
- Server stamina, dash, incoming damage, bleed/poison, once-only kill transitions, parties, XP/quest credit, loot ownership and disconnect grace.

## PostgreSQL primary and migration

`save.backend: postgres` is the default. Configure `persistence.postgres.url` in `config/services.yaml`, then run:

```bash
pnpm start:infra
pnpm persistence:init
pnpm start:server
```

For the complete local stack, use `pnpm start:infra` followed by `pnpm start:all` (API :3000, client :5180, admin :5190). The all-in-one launcher builds the workspace and waits for `/ready`. It does not regenerate map assets or kill unrelated port owners. Infrastructure startup reuses existing containers and data.

The server launch scripts also run the idempotent schema initializer. This updates existing databases as well as empty ones; initialization is no longer limited to a container's first boot. `EMPERY_POSTGRES_URL` and `EMPERY_REDIS_URL` can override service URLs for isolated tests/CI.

Before serving traffic, the server acquires a PostgreSQL advisory lock for this world. Primary writes use that same connection, so losing ownership also aborts an in-flight transaction. The first migration imports absent file-save IDs and applies existing deletion tombstones in one transaction. It records `file-saves-v1` in `game_storage_migrations`. Existing PostgreSQL characters win; local JSON files remain migration backups. Corrupt or mismatched file identities stop migration instead of being silently skipped. Once migration is recorded, backups are never reimported, including after character deletion.

Progression lives in PostgreSQL. Active character state lives in the simulation owner's memory. Domain mutations receive monotonically increasing revisions, use optimistic concurrency, and commit character payloads plus changed equipment/skills/inventory in a transaction. Multiple-character changes roll back together. PostgreSQL JSONB object key order is ignored when deciding whether child rows changed. Runtime checkpoint batches use a bulk parent upsert.

An `Idempotency-Key` identifies a mutating HTTP command within an account. The request fingerprint and response share the progression transaction. Concurrent repeats and repeats after restart return the recorded response; using a key for another request returns `409 COMMAND_CONFLICT`. The client creates keys for save mutations. Receipts are durable database records and belong in database backup/maintenance policies.

Movement and stamina between gameplay operations are ephemeral, checkpointed once per second and on explicit persistence/disconnect. Progression operations flush the latest state before acknowledgement. A crash can lose motion since the last committed checkpoint (normally the one-second interval plus commit delay); it cannot acknowledge an uncommitted purchase/reward. Motion acknowledgements describe simulation state, not a disk-write guarantee.

Client encounter bootstrap captures the network generation after starting the request, because starting an encounter creates a new generation. Results from an aborted or superseded start cannot restore the old encounter ID. Independent combat, quest and respawn requests share a generation-scoped cancellation signal; they do not cancel one another. Leaving a scene cancels that generation. Environment, loot and companion callbacks also check the gameplay scene generation before changing the scene or HUD, and a new scene resets its pickup lock.

### Player movement on foot and mounted

Click movement plans a body-clear route rather than truncating at the first wall. Incremental A* searches at 16 px and 4 px share a frame budget, with three coarse pops per fine pop while both remain active. Fine search can find offset narrow passages without waiting for a coarse flood to exhaust the city. Geometry caches are sparse and capped at 48,000 cells per resolution/world; search state is sparse, with 100,000 discovered nodes and 200,000 queued entries per search. At most 600 work units run per update, with a soft 3 ms deadline checked between batches of 16 units. These are bounded work limits, not a guaranteed frame-time measurement. A search limit has its own feedback rather than claiming that a destination is physically unreachable.

Route smoothing shares that budget and processes the entire route over successive frames. Fixed-step movement changes waypoints between commands and stops at the destination. The faint route line redraws only the remaining path, at most ten times per second or when the cursor/plan changes. WASD cancels it; repeated held clicks retain the search; destination, collision-world and off-route corrections replace it. Teleports and death clear navigation. Grid navigation remains conservative at 4 px resolution: a passage without a free anchor may still require manual steering.

Window blur or a hidden document cancels movement and blocks keyboard/gamepad input until focus returns. Double-click bursts expire after 350 ms and cannot remain armed through a blocking UI or a long path search. Predicted movement resolves the shared collision world directly: it does not also bind a Phaser prop solver that could move the display sprite independently. Bootstrap repairs and debug positioning update the physical pose, interpolation and queued frames together.

Travel zones can author a finite strict `arrival: {x, y}` on the destination's reverse edge. Apartment entry, apartment/HQ street exits and the southern Haven gate use explicit clear anchors. A coincident portal/spawn retains the authored spawn instead of assuming all maps share a fixed center. The server applies automatic dismounting first, validates the rounded arrival against current body/gate/housing geometry, then commits the location and invalidates the old encounter. A blocked arrival returns 409 without changing its location or discarding the encounter. All shipped travel edges are checked with open/closed gates, foot/mounted bodies, housing tiers and HQ access; authored city routes also exercise the apartment and HQ exits. Clicking a portal pad from outside now routes to its center; a second click or R confirms once inside. Confirmation cancels the remaining route before sending travel. UI locks, death and an in-flight travel prevent a new approach. Map JSON is cached once per location on the authority; geometry keys include only options that affect that map.

Foot collision radius is 14 px and mounted radius is 20 px on both peers. Mounting requires clearance at the authoritative current pose; insufficient space returns an error and preserves the unmounted save. A successful mode change resets prediction to the accepted saved pose and clears queued physical frames. Regression checks cover obstacle detours, bounded search, target replacement, disconnected destinations, gate/world changes, narrow passages and authored Haven routes for both radii.


`PlayerMotion` keeps a 50 ms physical prediction step and interpolates the sprite and camera between physical samples. Gameplay, commands and reconciliation read the physical pose, while display can trail it by one step (up to 50 ms). Corrections update both physical samples; teleports and respawns reset interpolation and unsent frames. Display interpolation is checked against current geometry, and swept player collision remains shared with the server. Deferred rendering updates consume at most four steps instead of accumulating an unbounded catch-up jump.

Input magnitudes below one preserve analog throttle; keyboard diagonals are still normalized. Click movement recomputes its direction at each simulation step and caps the final step at its target using the same command magnitude on the server. A blocked click waits 450 ms of elapsed time instead of counting display frames. Slow analog walking regenerates stamina; running drains it. Client stamina follows actual progress against obstacles instead of draining while stationary at a wall. Carried weight slows both tired walking and fresh running, and the client applies the same survival speed multiplier as the server.

Foot dash speed, duration and cooldown are shared constants. Mounted burst timings come from the mount content. Keys typed into chat or form fields are not buffered as later movement/burst commands. UI blocking prevents new bursts; mounting or dismounting cancels the active burst without clearing its cooldown. A mounted burst arms the persisted mount cooldown immediately. Its subsequent HTTP charge hit consumes the existing burst, without a second stamina charge or a later cooldown restart. Reconnecting cancels the active burst but preserves cooldown. An immediate dash command between physical steps carries zero movement, avoiding an extra unpredicted server step. The mount control tooltip identifies Shift as the burst/charge key.

Movement transport waits for a compatible v4 server welcome before sending sequenced commands and retains the welcome position as prediction zero. An acknowledgement of zero therefore preserves pending predicted movement instead of rolling it back to spawn. A new gameplay scene resets the previous scene's burst edge. Earlier or missing protocol versions are rejected with a page-refresh instruction; `/ready` reports the shared protocol constant.

Prediction is coupled to transport capacity: at most eight issued commands may remain unacknowledged, and no new physical steps or bursts are generated before welcome, during travel handoff, after disconnection or when that window/socket buffer is full. Catch-up frames use only available slots; suspension finishes display interpolation and discards elapsed catch-up time. Previously generated frames are drained even during a frozen handoff. At acknowledgement delays above the 400 ms window, prediction intentionally pauses instead of extending unlimited local movement. This safety bound may reduce movement throughput on very slow links; it is not adaptive latency compensation.

The gateway serializes only movement contract fields, rejects invalid local values and ignores unissued/nonintegral acknowledgements or nonfinite positions. Only forward acknowledgement progress resets the 3 s watchdog. An open socket without welcome times out after 10 s; sustained outbound buffering above 64 KiB also triggers reconnect. All watchdogs and queued reconnects are cancelled during travel/disconnect. Socket identity as well as connection epoch protects against late messages from a superseded automatic reconnect. Terminal connection errors stop prediction and do not advertise an active reconnect.

A delayed HUD notice explains sustained waiting/disconnection after 750 ms and hides on readiness or travel. A current-map authoritative welcome can restore a point more than 512 px from the old local save, including clear points near map edges; a foreign-map welcome is ignored before changing actors, vitals or pose. Browser verification suspended only an isolated test server, observed blocked movement and the reconnect notice, resumed it and confirmed restored control without console warnings or errors. Unit integration couples prediction with delayed acknowledgements at 0/150/350/700 ms and verifies bounded queues, watchdogs, stale-socket messages and travel cleanup.

Movement regression checks cover foot, gallop and charge speeds at 30/60/144 FPS, analog throttle, exact click arrival, thin obstacles, interpolation corrections, teleports, identical blocked-click timing, UI locks, burst cooldown, dismount cancellation and acknowledgements lagging by 0/150/350 ms. The expanded full run passed 422 client tests and 985 server tests; the seven real HTTP/WebSocket gameplay tests passed separately in a disposable PostgreSQL database, including mounted movement, stopping, charging once, dismounting and unchanged authored travel arrivals through reconnect. A browser smoke on the final build approached the apartment pad by click, entered mounted with automatic dismount, routed around the furnishings to the exit and returned to Haven using R, with no console warnings or errors. This is not a WAN latency benchmark: remote connections still require playtesting under measured delay and jitter.

The broader regression run passed 342 client tests and 973 server tests. All 22 integration tests skipped by the ordinary run were executed separately: 12 auth/primary-progress tests, 5 real HTTP/WebSocket gameplay tests, and 5 PostgreSQL/Redis persistence and pub/sub tests. They used disposable PostgreSQL databases and, for Redis tests, a separate temporary localhost container, covering restart, atomic rollback, storage failure, shared combat, concurrent loot, travel, reconnect and cross-node presence. All 23 shipped map spawns and travel references are checked against actual player collision geometry; the apartment spawn was moved to a clear authored point instead of relying on emergency relocation. A browser smoke in `adena_fields` showed replicated enemies and no console warnings or errors. This coverage does not imply that every manual UI combination or external dependency failure was exercised.

Database write failure, revision conflict or loss of world ownership makes the node unavailable for progression. `/ready` returns 503 and simulation stops; there is no automatic file fallback. Restore PostgreSQL and restart to load committed state. `save.backend: files` is an explicit single-process development mode: it uses local atomic JSON writes and never mirrors them into the primary database.

## Measurements and repeatable checks

`GET /api/admin/runtime-metrics` requires an administrator. It exposes bounded recent timing samples, mean/p95/max, simulation/replication timings, commit latency/queue depth, command rejection counters, bytes by message type, event-loop delay and memory. Client reports include a bounded frame-time window, RTT, bytes and correction counts. Reports contain no player identifiers or raw inputs, are rate limited, and are diagnostic client claims rather than authoritative state. `/ready` and admin metrics remain available after a progress-storage failure.

```bash
pnpm check
RUN_PERSISTENCE_TESTS=1 EMPERY_POSTGRES_URL=postgres://... EMPERY_REDIS_URL=redis://... pnpm --filter @empery/server test
pnpm benchmark:runtime --players=10,50,100 --seconds=3
pnpm benchmark:runtime --players=50 --seconds=3 --delay=150 --jitter=50 --loss=0.05
EMPERY_POSTGRES_URL=postgres://... pnpm benchmark:runtime --players=100 --seconds=3 --postgres=1
```

The benchmark creates disposable characters and directories. PostgreSQL mode creates and drops a uniquely named disposable database, requiring database-creation privileges. It uses Fastify's in-process WebSocket transport, not a production TCP deployment. Delay/jitter/drop act on application messages and do not model TCP packet retransmission. Measurements reset after setup and short runs establish a baseline, not a maximum supported online count.

CI starts PostgreSQL/Redis, initializes the schema, and requires integration tests to execute. Tests cover restart/replay, migration/deletion recovery, transaction conflicts, JSONB child-row preservation and write failure, alongside the ordinary runtime/client suites.

After regenerating prop assets, run `pnpm bake:collision` and commit `packages/shared/src/prop-opaque-bounds.ts` with those assets. Both client and server use these baked footprints; collision no longer varies with browser texture sampling. Map generation writes shared Haven/HQ placements.

## Next deployment boundary

There is one authoritative simulation owner per database/world. Accounts/sessions now use PostgreSQL in primary mode; media jobs still use local files. Redis presence/pub-sub does not provide shared multi-node simulation. Before adding game nodes, partition world instances, introduce per-instance ownership and durable handoff/recovery, and move job storage onto a suitable shared backend. Sticky routing alone is insufficient.

A native C++ prototype or an internal gRPC service can reuse the domain commands and versioned movement contract. The remaining browser client continues over HTTP/WebSocket. A transport change must preserve ownership, idempotency, revisions and server-authoritative simulation.

Local service management, backups, restore verification, monitoring and actual TCP tests are documented in [operations.md](operations.md).

## NPC approach and visible targets

Clicking a visible service NPC creates an interaction intent against its live actor position. Navigation selects a clear standing point 40–64 px away using the current foot or mount collision world. Moving targets replan after a 48 px displacement with a 500 ms throttle; pending searches finish without being restarted each frame. Dialogue opens once within 72 px and with line of sight. Manual movement, another destination, attack, blocking UI, teleport, death, or an unavailable NPC cancels the intent. Invisible furniture interaction proxies retain their existing E-key behavior.

Talk prompts and E-key selection require line of sight for character NPCs. Client enemy, area attack, mount charge, auto attack and PvP selection exclude occluded targets before selecting the closest candidate. The server remains authoritative for combat validation. Regression tests cover both body radii, detours, moving and unavailable targets, one-shot completion, manual cancellation, and occluded combat targets. A browser smoke test additionally verified click-to-approach and automatic captain dialogue.

## Mount transitions and interaction prerequisites

Both mount toggle and explicit dismount checkpoint the current actor position when a matching live presence exists; a stale or foreign-location presence is ignored. The client keeps its predicted position, route and unsent movement when changing mount mode. Only a position invalid for the new body radius can fall back to a valid authoritative checkpoint; ordinary movement corrections remain owned by the movement protocol.

Mount actions allow one HTTP transition at a time. Repeated H presses do not enqueue toggles; concurrent interactions wait for an in-flight mount and share one dismount. Responses cannot overwrite another character, location, game instance or a newer save revision. Mount HTTP calls time out after 10 seconds. The mount HUD exposes a busy state while waiting. Dialogue, shops, forge, storage and the travel panel require successful dismounting, and do not open after a failed prerequisite. Closing travel while dismounting also cancels the deferred panel render.

Regression tests cover delayed checkpoints, both dismount endpoints, repeated input, overlapping interactions, stale responses and failed prerequisites. The real HTTP/WebSocket gameplay suite also covers mounted analog movement, stopping, charge and dismount alongside travel and reconnects.

## Portal intent and travel recovery

A left click confirms only the portal actually clicked when the hero is inside its pad; a distant click approaches that pad even if another portal is underfoot. Right clicks do neither. R/HUD confirmation still uses the portal underfoot. Prompts hide during blocking UI, death, spawn locks and pending travel. Pending travel remains locked until its result arrives; failed attempts release the lock immediately.

The travel deadline covers destination lookup and the POST together (10 seconds). Fetches accept cancellation, and a destination lookup finishing after cancellation cannot send a late POST. On failure, a separate bounded reconciliation (5 seconds) reads the authoritative save, location and stats before unlocking another attempt. If the server committed the transition before losing the response, the client restores that map. Late responses cannot overwrite another character, map/scene or newer save revision. A retry never queues behind a pending transition.

Regression tests cover portal selection, right clicks, spawn/UI locks, immediate retry, pending requests beyond ten seconds, stale character/map/scene replies, dropped responses, bounded lookup and reconciliation, and late replies after a successful retry.

## Dialogue lifecycle and choice replay

Each conversation has a lifecycle generation. Closing it or opening another conversation aborts its request and invalidates late dialogue, choice and portrait callbacks. Replies are also checked against character and location; older save revisions cannot overwrite newer state. Radio service rejection no longer pauses an NPC. Dialogue loading and ordinary choice requests use 30-second fetch deadlines.

Only one choice can be pending per conversation. Buttons are disabled while waiting, errors are caught and controls recover for retry. Ordinary choice retries reuse a command idempotency key until a new response is rendered, including when the action succeeded but the subsequent stats request failed. PostgreSQL command receipts replay the original result; a real HTTP regression test verifies that captain training charges 12 adena once across repeated requests. Special housing actions also check their originating dialogue/context before applying asynchronous results.

## Combat intent cancellation and friendly targets

Hostile player selection excludes party members before comparing distances, so a nearby ally does not prevent attacking a valid enemy or mob. Dead and occluded players remain ineligible. Melee/ranged windup and allied cast windup recheck scene generation, life state and blocking UI before dispatch. Already-dispatched authoritative results still use the existing generation guard. Combat updates drain one-shot charge intents even during blocking UI, preventing a deferred charge hit after closing a panel.

Client regression tests cover a nearer ally, dead and occluded players, death/UI during offensive and allied windup, and suppressed queued charge requests.

## Loot visibility and companion pickup

Loot selection and the E-key hint use the same client line-of-sight predicate. A nearer occluded pile does not mask a visible one. Manual HTTP/WebSocket pickup and companion completion check the authoritative collision world before claiming the pile; rejection leaves the pile and currency unchanged. The picker must exist and be alive. Companions filter occluded targets before selecting the nearest pile, recheck visibility on arrival, and release reservations when a pending fetch belongs to another location or the actor is no longer eligible. Seagull interaction hints/selection also use client line of sight.

Tests cover visible versus occluded selection, failed pickup preserving the pile, life-state rejection, companion target selection and arrival revalidation, plus the actual HTTP pickup handler with collision visibility denied and restored.

## Death and resurrection lifecycle

In-place resurrection uses the authoritative save coordinates instead of the map spawn. Respawning invalidates/stops the prior death tween and clears attack/charge intents, so a late death callback cannot show defeat after revival. Manual respawn is single-flight and bounded to 10 seconds, with a separate 5-second authoritative recovery read if its response was lost. Responses are guarded by character, location, game instance, operation generation and save revision. Allied resurrection supersedes a pending manual response, verifies positive HP and reconciles the authoritative map before applying state.

Server town respawn stops queued movement, updates same-map presence to the new spawn, and purges pre-existing ghost presence on relocation. In-place resurrection checkpoints live target coordinates and stops movement. Discarded movement commands are acknowledged and cannot preserve an old charge. Tests verify that the next server movement step keeps the new town spawn, alongside stale-response, duplicate-input, allied/manual overlap and late death-animation regressions.

## Resurrection reach and obstacles

Resurrection validates distance even without live presence: finite current-map actor coordinates take precedence, then saved coordinates; unknown positions are rejected. The authoritative collision world must have line of sight to the fallen target before any scroll is consumed. Rejected distance/visibility/position checks leave the scroll and target unchanged. Inventory selection of the nearest fallen player also skips occluded actors before choosing a target. Tests cover absent presence, unknown/foreign/nonfinite coordinates, distance, occlusion, successful nearby revival and unchanged inventory on rejection.

The dialogue UI handoff also has a latest-intent guard before asynchronous dismount completion: an older nearby NPC cannot replace a newer selection or radio call. Radio conversations do not force dismounting. Regression tests cover out-of-order prerequisites and radio/proximity overlap.
