# Сводка: WS handshake fail + POST /mount/stamina 502

## Дата
2026-09-15

## Что видел клиент

`ws://192.168.1.136:5180/ws?...` — Connection closed before handshake.  
`POST /api/saves/.../mount/stamina` — 502 Bad Gateway.

Оба идут на **preview :5180**, не на API. Vite проксирует на `:3000`. 502 = цель прокси мертва.

## Почему

`start-all` держал API как `tsx watch`. Сборка `@empery/shared` (13:49) переписала `packages/shared/dist` → tsx рестартнул Fastify. Preview остался. Пока `:3000` лежал:

- HTTP-прокси → 502
- WS-прокси закрыл сокет до 101

Клиент крутит reconnect (`RealtimeGateway`) и stamina sync — отсюда пачка одинаковых строк. Это не баг квартиры и не LAN-IP: прямой `ws://127.0.0.1:3000/ws` и прокси через `:5180` после подъёма API отвечают (хотя бы `AUTH_REQUIRED`).

Старый `start-all` ещё и рвал весь стек: `tsx` «Previous process hasn't exited yet. Force killing…» → `wait -n` гасил preview.

## Правка

| Место | Зачем |
|---|---|
| `start-all.sh` | API = `tsx src/index.ts` **без watch**; ждать `/health` |
| `start-dev.sh` | ждать `/health` до Vite |
| `vite.config.ts` | `/ws` → `http://127.0.0.1:3000` + `ws: true` |
| `apps/server` SIGTERM | `app.close()` + таймаут 1.5с, чтобы порт отпускался |

Сейчас на машине health 200, WS через 5180 и LAN проходит. Достаточно обновить вкладку. Новый `start-all` — только после Ctrl+C.
