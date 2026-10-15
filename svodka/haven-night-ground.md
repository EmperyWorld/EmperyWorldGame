# Сводка: ночь / земля / «вкопаные» жители

## Дата
2026-09-15

## Жалобы
1. Поверхность Гавани слабая (после фикса чёрной земли — всё ещё «плоская»).
2. Ночь светлая как день.
3. Ночью часть жителей стоит как вкопаные.

## Почему

### Ночь
- Safe-zone darkness ×0.82 + слабый overlay → пол почти дневной.
- ColorMatrix только тонировал, не гасил яркость; ADD-фонари засвечивали улицы.
- Прямоугольник-оверлей создавался только без ColorMatrix → с матрицей не было veil.

### Жители
- Soft-repath на `STUCK_REPATH_AT` сбрасывал `stuckFrames` → вечный standstill на commute.
- `applyCitizenSchedule` early-`continue` без walk/idle/depth → даже движущиеся выглядели статуями.

### Земля
- Procedural cobble был мелкой «сеткой кирпичей» без объёма; часть тайлов — wet/rocky вместо брусчатки.

## Фикс
- `day-night.ts`: глубже night keys; safe ×0.92; floor alpha ≥0.55.
- `overlayColorMatrix(..., darkness)` + veil rectangle; слабее лампы.
- Commute: `repathCount` → abort/teleport после 3 soft-repath; анимация на commute-кадрах.
- Cobble: крупнее камни, bevel, тёплый base; 3× cobble + 1× wet для Haven.

## Проверка
- `pnpm --filter @empery/shared build`
- `pnpm --filter @empery/server test -- services/day-night.test.ts`
- `pnpm --filter @empery/client test -- game/systems/night-color-matrix.test.ts`
- F5: ночь тёмная, фонари локальные; брусчатка читается; commute не зависает.
