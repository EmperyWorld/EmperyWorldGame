# Сводка: Учитель Лавр — урок странника

## Дата
2026-09-15

## Цель
Изолированный городской сервис `town_teacher`: платный урок (+mAtk «Урок Лавра») и разовый экзамен после двух уроков. Flavor YAML (`teacher_map` / `teacher_praise` / `teacher_leave`) сохранён. HUD-флаг не ставится — экзамен просто появляется в меню после 2 уроков.

## Файлы

| Путь | Роль |
|---|---|
| `content/items/haven-teacher.yaml` | `lavr_notes` (unsellable lore, material) |
| `content/npcs/town_teacher.yaml` | `teacher_lesson` / `teacher_exam` + старые flavor-ноды |
| `apps/server/src/services/teacher-lesson.ts` | Механика урока и экзамена |
| `apps/server/src/services/teacher-lesson-dialogue.ts` | `generateTeacherDialogue` / `applyTeacherChoice` |
| `apps/server/src/services/teacher-lesson.test.ts` | Сервис + фильтры диалога |
| `apps/server/src/services/haven-npc-plugin.ts` | Контракт `HavenNpcFeaturePlugin` (import-only) |

Не трогались: `dialogue.ts`, `quest-hud*`, `dialogue-controller`, `haven-services`, `ally-buffs.ts`, combat, rumors, radio, housing, garden, medical, mounts, town-services, citizen-rumors, npc-schedule-gate, layouts, locations, shared, media.

## Сигнатуры

```ts
takeLavrLesson(save: PlayerSave): TeacherLessonResult
takeLavrExam(save: PlayerSave): TeacherLessonResult
lavrLessonCount(save: PlayerSave): number
isTeacherExamReady(save: PlayerSave): boolean

generateTeacherDialogue(npc: HavenNpcLike, save: PlayerSave): DialogueResponse | null
applyTeacherChoice(save: PlayerSave, npc: HavenNpcLike, choiceId: string): HavenNpcChoiceResult | null

export const teacherLessonPlugin: HavenNpcFeaturePlugin
```

Константы: `LAVR_LESSON_COST=10`, `LAVR_EXAM_REWARD_ADENA=35`, `LAVR_LESSONS_FOR_EXAM=2`, флаги `haven_lavr_lessons` / `quest_teacher_exam_complete`.

Бафф (через `applyNamedBuff` + `applyStatsToSave`, ally-buffs не меняли):
- `lavr_lesson` / `mAtk` / 12 / 25 мин / «Урок Лавра»

Choice ids:
- `teacher_lesson` — механика урока
- `teacher_exam` — экзамен (visible если lessons≥2 && !complete)
- `teacher_map`, `teacher_praise`, `teacher_leave`, `*_bye` — YAML fallthrough

## Правила механики

- Урок: 10 адены, бафф `lavr_lesson`, `haven_lavr_lessons += 1`. Повтор разрешён.
- Экзамен до 2 уроков: fail `Сначала два урока`.
- Экзамен после 2: предмет `lavr_notes`, +35 адены, `quest_teacher_exam_complete`. Повтор — отказ.
- Отдельного `quest_teacher_exam_ready` нет: кнопка экзамена появляется из счётчика уроков.

## WIRING (интегратор)

`dialogue.ts` **не** подключён в этом диффе — без двух вставок Лавр останется flavor-only на LLM/YAML.

### 1. `apps/server/src/services/dialogue.ts`

Импорт:

```ts
import { generateTeacherDialogue, applyTeacherChoice } from './teacher-lesson-dialogue.js';
```

`DialogueService.generate` — сразу после schedule-gate / `getNpcQuestDialogue` (до citizen/LLM):

```ts
const teacherDialogue = generateTeacherDialogue(npc, input.save);
if (teacherDialogue) return teacherDialogue;
```

`DialogueService.applyChoice` — сразу после schedule-gate / `walk_bye`, **до** YAML `nextNode` fallback:

```ts
const teacherApplied = applyTeacherChoice(save, npc, choiceId);
if (teacherApplied) return teacherApplied;
```

Порядок важен: flavor ids вернут `null` и дойдут до существующего YAML-блока (`flag.startsWith('_')` + `nextNode`).

Плагин: `teacherLessonPlugin.apply` уже меняет порядок аргументов под контракт `(npc, save, choiceId)`.

### 2. HUD — не нужен

Экзамен не вешается на `quest-hud.ts`. Не ставить `quest_teacher_exam_ready`. Если позже понадобится строка при активном экзамене:

`Квест: сдайте экзамен учителю Лавру [E]`

## Тесты

```bash
pnpm --filter @empery/server test -- teacher-lesson
```

Покрыто: бедность урока, бафф mAtk + счётчик, инкремент уроков, экзамен до 2 уроков (`Сначала два урока`), успех (notes +35 + complete), повтор экзамена, generate-фильтры (hide exam, show after 2, hide after complete), flavor keep, apply null для flavor / чужого NPC.

Интеграция через `DialogueService` (как в `haven-city-plugins-dialogue.test.ts`) **не** гоняется, пока нет WIRING в `dialogue.ts`.

## Риски

- Без WIRING в `dialogue.ts` новые choices видны в YAML-меню/LLM, но механика не сработает (`_teacher_lesson` / `_teacher_exam` без nextNode тихо закроют диалог). После вставки — ок.
- Иконка: хук пытался дописать `packages/media` / manifest — откатили (media запрещена). Слот в инвентаре может быть пустым, пока не прогонят `generate:media -- --only=item_lavr_notes`.
- Flavor `teacher_map` / `teacher_praise` по-прежнему lore без предмета — намеренно. Реальные записки только через экзамен.
- Бафф урока делит `buffId: lavr_lesson` — повтор перезаписывает таймер, счётчик растёт.
- Не пересекается с Ириной (`accuracy`), Хольмом (`critRate`/`mDef`), Фаддеем (`mpRegen`), Борисом (`speed`).
