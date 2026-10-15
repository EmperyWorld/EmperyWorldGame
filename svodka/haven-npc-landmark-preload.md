# Сводка: у колоссов NPC не грузились спрайты

## Дата
2026-09-15

## Почему в игре «нет картинок у домов»

WebP у жилых `prop_house_*` и у колоссов (inn, bathhouse, schoolhouse, cathedral, …) **есть** в `data/generated/assets` и в manifest. Клиент их запрашивает только если id попал в `locationPropIds`.

Колоссы рисуются из `HAVEN_NPC_BUILDINGS`, а строки с тем же id из `HAVEN_CITY_PROPS` **скипаются** (`havenCityPropReplacedByNpcLandmark`). В прелоад шли только city-props + три runtime id (tenement / court / mill). Остальные 15 колоссов не качались → `placeWorldProp` = null → коричневый `fillRoundedRect` + треугольник крыши.

Жилой квартал (18 домов) грузился, потому что их id есть в `HAVEN_CITY_PROPS`.

## Правка

`locationPropIds('empery_haven')` берёт `b.prop` из `HAVEN_NPC_BUILDINGS`. Тест: ни один колосс не отсутствует в сете.

Генерация Comfy не нужна — файлы уже на диске. Нужен перезапуск `pnpm start:all` (preview без HMR).
