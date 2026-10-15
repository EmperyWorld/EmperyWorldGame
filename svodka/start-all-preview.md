# Сводка: start-all → vite preview

## Дата
2026-09-15

## Проблема

`start-all` поднимал Vite **dev**. Браузер ходил на `/src/main.ts` и видел весь исходник — так устроен HMR, не прод.

## Что сделано

| Место | Зачем |
|---|---|
| `scripts/start-all.sh` | сначала `build` client/admin, потом `vite preview` |
| `apps/client/vite.config.ts` | тот же proxy (`/api`, `/media`, `/ws`) у preview, иначе LAN-игра без API |
| `apps/admin/vite.config.ts` | то же для `/api` |

Сервер по-прежнему `tsx watch` — исходники API в браузер не отдаются.

HMR в этом режиме нет. Для правок UI: `pnpm start:dev` / `pnpm start:client`.
