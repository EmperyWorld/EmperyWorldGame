# Multiplayer Foundation

## Target
The first multiplayer implementation target is `shared_world_foundation`.

That means:
- real-time presence over WebSocket
- server-authoritative room/location state
- no attempt yet to finish full MMO-lite features like parties, chat, loot ownership, or shared combat rewards
- solo HTTP gameplay remains intact during rollout

This is intentionally one step below full `mmo_lite` so the codebase can migrate off the current per-save encounter model safely.

## Transport
- Keep content/inventory/dialogue/shop endpoints on HTTP.
- Add a dedicated WebSocket channel for presence and future combat/world replication.
- Client sends input/position deltas.
- Server owns the canonical player presence state and rebroadcasts snapshots/events.

## World Model
- `WorldRuntime` manages `LocationChannel`s.
- A player connection belongs to exactly one active location channel.
- A location channel stores connected player presence, later enemies, drops, projectiles, and world timers.
- Current per-save `encounter` logic remains for solo combat until shared combat is migrated.

## Persistence
- Current file saves remain the source of truth for character progression.
- The multiplayer contract is designed so persistence can later move to Postgres without changing the client protocol.
- Realtime presence state is ephemeral and currently in-memory; later it can move to Redis pub/sub + cache for multi-process scaling.

## Phase Slice
1. Presence:
   - connect/disconnect
   - join location
   - remote player snapshots
   - interpolation on client
2. Shared combat:
   - move enemies from per-save encounter to location instance
   - authoritative AI/combat ticks
   - shared damage attribution and reward rules
3. MMO-lite systems:
   - party
   - chat
   - reconnect/session recovery
   - Postgres + Redis migration

## Current Code Artifacts
- Shared contract: `packages/shared/src/multiplayer.ts`
- Runtime foundation: `apps/server/src/services/multiplayer.ts`
- Bootstrap endpoint + websocket gateway: `apps/server/src/index.ts`

The goal of this document is to turn the earlier assessment into a concrete implementation baseline instead of a pure plan.
