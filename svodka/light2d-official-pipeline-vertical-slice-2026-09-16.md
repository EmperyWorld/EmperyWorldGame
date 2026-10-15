# Light2D official pipeline (vertical slice for Haven)

## Что показала официальная документация Phaser
- `PointLight` и простые `ADD`-ореолы дают визуальный glow, но не освещают другие объекты сцены.
- Для "настоящего" 2D света Phaser рекомендует `LightsManager` + `Light2D` pipeline (+ normal maps для полноценного shading).

## Что внедрено
- Новый модуль: `apps/client/src/sprites/light2d-pipeline.ts`
  - централизованный флаг `light2dEnabled` на сцене,
  - helper для безопасного применения `setPipeline('Light2D')`.
- `apps/client/src/game/systems/GameplaySession.ts`
  - включение Light2D режима для `empery_haven` outdoor,
  - применение `Light2D` к ground render layer.
- `apps/client/src/sprites/texture-loader.ts`
  - все world props, добавляемые через `placeProp`, получают `Light2D` pipeline в соответствующих сценах.
- `apps/client/src/game/systems/EntityManager.ts`
  - интерактивные NPC спрайты получают `Light2D`.
- `apps/client/src/sprites/haven-citizens.ts`
  - ambient граждане получают `Light2D`.
- `apps/client/src/day-night-lights.ts`
  - добавлены реальные `scene.lights.addLight(...)` источники для статичных фонарей и движущихся огней;
  - добавлен ambient control через `scene.lights.setAmbientColor(...)`;
  - старый graphics-glow оставлен как fallback, если Light2D недоступен.

## Почему это лучше
- Свет перестает быть "кружком поверх картинки" и начинает влиять на объекты, переведенные в `Light2D`.
- Переход сделан как вертикальный срез (Haven) без ломки остальных локаций.
- Архитектурно это масштабируется: можно постепенно добавлять normal maps по важным ассетам и получать качественный локальный свет.
