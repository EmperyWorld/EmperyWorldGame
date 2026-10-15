# Media regeneration not visible — cache root cause — 2026-09-17

## Диагноз

Регенерация на диске прошла успешно:

- ~807 WebP обновлены `2026-09-17`
- атласы пересобраны `07:40`
- admin job `generate_media` завершился `done`

Но клиент (`pnpm start:all` → vite preview) не показывал новые картинки, потому что:

1. URL медиа не менялись (`/media/atlases/hud.webp`, `/media/assets/*.webp`)
2. HTTP `Cache-Control` был `max-age=31536000, immutable`
3. Service Worker `empery-static-v1` кэшировал `/media/*` cache-first

Итог: браузер/SW продолжали отдавать старые байты по тем же URL.

## Исправление

- API `/api/media/manifest` добавляет `?v=<generatedAt ms>` ко всем asset/atlas URL
- Cache-Control для `/media` ослаблен до `max-age=3600, must-revalidate`
- SW обновлён до `empery-static-v2`: `/media` и `/maps` — network-first, `/assets` — cache-first

## Как увидеть изменения сейчас

1. Перезапустить `pnpm start:all` (подхватит сервер + новый `sw.js`)
2. Жёсткое обновление на `http://127.0.0.1:5180` (Ctrl+Shift+R)
3. Если всё ещё старое: DevTools → Application → Clear site data / Unregister SW
