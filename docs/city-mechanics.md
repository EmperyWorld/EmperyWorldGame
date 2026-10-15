# Haven city mechanics

Server snapshots remain authoritative for time, NPC shifts, sleep, service availability and ship schedules. The client does not advance the world clock or invent schedule phases between server messages.

## Movement and daily life

Residents commute to their posts and then resume their district routes, pauses, greetings, social conversations and mounted-player yielding. `at_post` identifies the daytime routine; it no longer pulls a resident back to its starting point every update. At dusk the daytime routine stops and the homeward route starts from the current position. Conversation pauses also apply when the actor is outside the camera.

Visible residents finish their physical homeward walk even if the server has already switched to `at_home`. They enter only within 16 px of their doorway and after the schedule permits entry. A blocked path or a safe endpoint far from the door does not count as arrival. Initial night joins still seed residents indoors. Late morning snapshots play the exit transition before the walk to work; live `at_post` updates require nearby arrival rather than accepting a remote daytime pose. Entry animations preserve their position and opacity across schedule changes.

Ambient and stage updates accumulate elapsed milliseconds instead of selecting display-frame numbers. Visible residents update approximately every 32 ms; offscreen residents update every 200 or 500 ms according to distance, with their elapsed time retained individually. Background catch-up is bounded at 500 ms. Movement uses the accumulated interval; route traversal spends one distance budget across successive waypoints. Stuck recovery uses milliseconds and recognizes small valid steps at high refresh rates. Crowd separation runs every 120 ms over a snapshot of nearby actors.

## Navigation and collision costs

Shared street paths preserve exact start/end positions. Sidewalk offsets apply inside a route while keeping its anchors unchanged. Route rejoin chooses the nearest segment, avoiding a skipped corner when the nearest vertex is ahead of the walker.

The client route cache belongs to its scene, uses exact endpoints, evicts old entries without clearing the entire cache, and expires when obstacle geometry or the ground layer changes. Short walks within 192 px use a clear direct segment; longer walks use streets and A* over the whole map. A binary heap replaces the linear scan of the search queue; the visit limit is the smaller of the grid size and 45,000 nodes. A failed search returns an unavailable route instead of walking through a blocked fallback. An unavailable route does not establish that a global path is impossible.

Blocked commutes retry with delays of 0.5–5 seconds, without skipping blocked waypoints or displacing the actor to force progress. Obstacle changes trigger a fresh attempt immediately. Patrols can choose another destination after repeated failures. A* checks edges as well as grid nodes and connects both exact endpoints to reachable grid nodes. Cell and edge checks are shared between searches in compact arrays and invalidated with the scene geometry. Movement stops at newly blocked terrain or prop footprints.

Static prop queries use a 128 px spatial index. Adding/removing props or changing gates invalidates it; ordinary queries visit nearby cells instead of every building. Crowd separation uses its own local spatial buckets and stable positions, avoiding a full pairwise scan for dispersed actors.

Gate footprints update on actual open/closed changes. Optional texture availability does not alter whether the opening is physically passable. Collision changes invalidate cached navigation and active actor routes.

## Interactions

The client requires both an available actor and a non-sleeping, interactable schedule entry. Server shops also respect the entry's availability while a worker is waiting to depart at dusk. A walking NPC can provide its commute dialogue; its shop remains closed until the service is available.

## Verification

```bash
pnpm --filter @empery/client test
pnpm --filter @empery/server exec vitest run src/services/haven-street-path.test.ts src/services/haven-schedule.test.ts src/services/npc-schedule-gate.test.ts
pnpm check
```

Regression tests cover 30/60/120/144 FPS cadence, offscreen time retention, high-refresh-rate stall detection, exact anchors, route rejoin at corners, scene cache isolation, blocked routes, indexed collision reads, gate state/texture handling, crowd-neighbor equivalence and dusk service closure. Browser smoke checks use a disposable account/world; live characters are preserved.

Resident runtime tests also exercise blocked evening commutes followed by sleep snapshots at 30/60/144 FPS, opening an obstacle during retry, doorway waiting, entry animation continuity, late morning exits, unavailable work routes and narrow-footprint detours.

## Service NPCs and the amphitheatre

Service NPCs and stage actors use `CityRouteFollower`: it retains the requested goal, shares one distance budget across corners, samples collision every 8 px, retries blocked paths with bounded delays and resets retries on obstacle revision changes. A shortened safe path is not arrival at a remote goal. Service NPCs finish walking home before their entry fade, exit before returning to work and walk to remote `at_post` / `open` anchors without live teleports. Server service availability still closes immediately according to its schedule, even if the visual actor is finishing a delayed commute. Conversations pause movement, and crowd separation excludes the talking actor and blocked terrain.

Stage actors use shared residential destinations and street routes. Only the initial bootstrap seeds their schedule pose; live snapshots preserve physical continuity and server departure waves. Performances require both an authoritative seat phase and physical arrival of every spawned participant. Seated animation offsets do not start another commute. Completed narrative timers leave their tracking set immediately. Residents no longer restore an old waypoint coordinate during a wait or conversation.

Social encounters search nearby spatial buckets instead of the entire crowd. Critter movement and crowd separation also reject blocked terrain and prop footprints. The accelerated browser smoke observed night and the following day without console errors; shortened cycles are not a timing benchmark for all long routes at the normal world speed.

Regression checks include service commutes at 30/60/144 FPS, late morning exits, conversation holds, crowd/terrain constraints, fast-frame collision sampling, shortened endpoints, stage departure/arrival and seated animation continuity. `createGameServer` accepts an optional isolated clock configuration for accelerated browser simulations; production still reads its normal world clock content.

These changes improve client mechanics and reduce repeated work. The ambient crowd is still a client presentation of server schedule phases; it is not a distributed authoritative pedestrian simulation.

## Coordinate roles and placement coverage

Tile coordinates denote authored cells; world coordinates denote pixel positions, with a 64 px tile centre at `(tx*64+32, ty*64+32)`. Image bounds are visual occupancy, not collision geometry. Ambient definitions retain their authored tiles and are resolved once against actual scene ground and prop bodies by `ambientPlacement`. The obsolete slot-index workplace table and image-AABB pre-snap were removed. A resident's post belongs to its explicit workplace or its first district patrol point. The indoor home pose is kept separate from the south-facing, collision-clear entrance. Expanded loiter paths use the same resolver. Three field/cemetery residents have explicit homes outside the closed city wall.

`HAVEN_STAGE_LAYOUT` and `havenStageSeat` supply both rendering and server schedules. Audience anchors leave the benches clear and keep at least 36 px between participants. The platform floor is walkable; its back wall and side supports remain solid. Captain and gardener posts were corrected in shared scheduling, YAML and layout generation together. Ship display scale and station prop descriptors are shared with server/player collision. Station fallback graphics also create their canonical collider.

Commute snapshots include optional `walkT`. On join, service NPCs and performers seed along collision-safe routes using that progress; scene metadata no longer overwrites the resolved actor pose with a raw schedule sample. Old snapshots still have a placement fallback.

Cosmetic animation is separate from physical placement: theatre bobbing and applause use `ActorVisualOffset` display-origin channels, while working and fencing actors lean without changing their world anchors. Decorative actors reserve collision-clear positions at least 36 px away from named posts, theatre seats and other decorative actors. Station bodies are installed before resolving those positions. Garrison patrols follow collision-safe routes with elapsed-time updates and bounded retries; their lamps follow the actual actor pose. Rest-phase bindings are idempotent, so repeated clock messages do not restart work animations.

Explicit `speed: 0` residents keep their stationary daytime post regardless of definition order; their home commutes still use a separate minimum walking speed. Empty patrols no longer produce an invented `(0, 0)` anchor. Placement rejects nonfinite world coordinates before consulting geometry. Decorative spacing checks every reservation against the final projected position, including reservations outside the original authored search radius, and releases reservations on scene shutdown.

Residents are spawned after all city decoration modules have installed their bodies, including garrison tents and equipment. Seated silhouettes adjust normalized display origin rather than adding 5 px to the world position; frame changes retain that visual origin.

Resident walking samples every 8 px during deferred updates, retaining safe partial progress if an obstacle appears. A route is complete only when the resident is within 6 px of the requested goal; a shortened endpoint keeps that goal and enters bounded retry. Up to 64 short route vertices can share one update's distance budget, so closely spaced corners do not lower walking speed. Service NPC depth on join uses the resolved physical position rather than the raw schedule sample.

Morning resident joins interpolate their safe outdoor entrance-to-post route, never a route from the indoor house pose. Residents and service NPCs no longer invent a doorway if entrance resolution fails: sleepers remain hidden, outdoor home commutes wait, and active home fades pause without changing their position, opacity or progress. They resume when a valid entrance becomes available after a geometry revision.

Stage motion resolves residential entrances against current geometry instead of keeping an initial doorway or falling back to the indoor pose. A sleeper stays hidden when its entrance is unavailable; an outdoor performer retains its position until a home destination can be resolved. Home routes retarget when the entrance changes. Legacy join samples without `walkT` must be finite and walkable, otherwise the actor starts from the known commute anchor. Zero morning progress keeps sleepers hidden even though the server's indoor coordinate differs from the client's entrance. Cosmetic animation never moves the physical seat anchor, so a performer displaced farther than 6 px must return before it counts as seated.

The placement regression suite checks the complete 120×84 map: 31 YAML NPCs, 21 scheduled service posts, 16 major buildings, 475 layout props, all 154 resident definitions, 12 stage participants, 19 zones, 8 stations and 52 landmarks. It validates source agreement and house packing, day/night patrol and home routes with gates both open and closed, and player reachability from spawn to every NPC interaction, station and travel trigger. A daytime browser capture matched all 958 actual Phaser collider bodies to the shared collision model, including the four station props previously missing on the server. `?npcLifeDebug=1` exposes optional geometry/actor diagnostics on the canvas for future checks.

The isolated daytime browser check found no blocked poses among 119 active, fully visible actors. The follow-up night join check found no blocked poses among 54 active, fully visible actors and matched all 961 night collider bodies (closed gates) to the shared model. Neither check reported console warnings or errors. These are runtime snapshots, not a manual observation of every actor throughout a complete day. The latest full `pnpm check` run passed with 334 client tests and 950 server tests; 22 server infrastructure tests remained skipped. Subsequent movement fixes were verified with regressions for intermediate collision samples, shortened routes, short corners, resolved service NPC depth, safe morning join poses and unavailable home entrances before and during fades.

## Видимость городских взаимодействий

Подсказки станций и указателей и их выбор по E проверяют прямую видимость до существующей безопасной точки взаимодействия, а не до центра изображения внутри коллайдера. Недоступная станция не подавляет подсказку доступного указателя.

Выбор жителя учитывает активность, видимость, прозрачность, сон, переход через дверь, расстояние 72 px и препятствия. Между выбором по E и открытием диалога сохраняется конкретный слот жителя. Если выбранный житель стал недоступен, другой житель того же района не останавливается вместо него. Подсказка жителя использует ту же дальность и проверку видимости. Числовой выбор слота также проверяет доступность.

## Ночное освещение

Свет таверны, собора, лекаря и переулка информатора привязан к общим рабочим постам NPC (`HAVEN_NIGHT_VENUES`), а свет входов — к центрам существующих порталов. Новые источники не добавляют коллайдеров. Совпадающие источники объединяются по координатам и типу, некорректные точки отбрасываются.

Мягкие ореолы рисуются над ночным затемнением и при Light2D, чтобы сами фонари оставались видны; их яркость снижена относительно резервного рендера. Мерцание ослаблено, источники Light2D имеют небольшую индивидуальную фазу. Ночные декоративные эффекты обновляются не чаще 10 раз в секунду и не перерисовываются днём. Тень ночного портового персонажа скрывается вместе с ним; его положение корректируется по геометрии. Расписания заведений сохраняются.

### Переносные фонари

Свет идущих служебных NPC берётся из видимого актёра, а не из координат расписания. Свет ночных стражников скрывается во время сна и перехода в дом. Источники отбираются по области камеры с запасом 96 px, совпадающие точки объединяются; ближайшие к центру кадра имеют приоритет. На средних настройках доступно до четырёх лёгких ореолов, на высоких — до четырнадцати с существующим Light2D. Спрайты ореола и пламени переиспользуются; перерисовка Graphics для них не требуется. Рассвет и исчезновение актёра скрывают его свет.

## Смена ночного караула

Ночные посетители и дозорные проходят вечерний выход и утреннее возвращение с разнесённым временем отправления. После 07:00 расписание больше не переводит их сразу в `hidden`: живой актёр идёт от текущей позиции к входу и скрывается только после входа. Завершение планового времени пути не телепортирует опоздавшего персонажа. Городские дозорные возвращаются к караульне; полевой дозор отдыхает за городом, чтобы закрытые ворота не блокировали его маршрут. Проверки навигации включают путь домой и обратно для всех ночных актёров при открытых и закрытых воротах.

## Жилой двор и животные

Площадка использует общий `HAVEN_RESIDENTIAL_COURT`: центр `(1344,2608)`, размер 180 px. Её видимый контур не пересекает силуэты домов и тенемента. Декорация входит в серверную геометрию и создаётся на всех настройках графики. Четверо детей и трое родителей включены в общее расписание жителей, сохранены при прореживании населения, пользуются проверенными входами и маршрутами. Игровые точки детей лежат на площадке; приближение игрока не прерывает игру автоматическим приветствием. Мяч появляется только при наличии как минимум двух играющих детей и следует их текущим координатам.

Дворовые кошки и собака используют поиск пути и ограниченную скорость вместо прямых tween-перелётов. Лапы и тень привязаны к одной наземной позиции, а препятствия проверяются вдоль перемещения. Непривязанные к текущим крышам ночные силуэты кошек удалены; наземные животные остаются. Проверены проходы от входов всех жилых домов к двору.

## Театр: шаги и звук

Бард и зрители переключают кадры шага по фактическому перемещению и показывают неподвижную позу, когда стоят или упираются в препятствие. Сидящие зрители смотрят на сцену; раскачивание барда приостанавливается во время ходьбы. Аплодисменты и звуки портовой драки используют общий Web Audio контекст, разблокированный кликом или клавишей. Аплодисменты учитывают расстояние и общий переключатель «Звуки интерфейса и города»; близкие хлопки усилены до слышимого уровня.

### Вход по фактическому прибытию

При вечернем возвращении жители, служебные NPC и участники театра уходят внутрь по достижении проверенного входа. Расчётный `walkT` задаёт положение при первом подключении, но не удерживает уже дошедшего актёра у двери. Продолжающиеся сообщения `walking_home` не пробуждают и не показывают уже вошедшего персонажа; утренний выход остаётся отдельным переходом. Заблокированный или недоступный вход по-прежнему требует завершения реального маршрута.

## Образ всадника

Процедурный атлас верховой езды сохраняет кадры покоя (0) и атаки (4), добавляя восьмикадровый цикл движения и второй спокойный кадр дыхания. Поза всадника привязана к седлу без повторного прибавления вертикального движения коня. Колени согнуты, сапоги опущены к стременам, поводья доходят до рук. При взгляде спереди голова коня рисуется перед всадником; боковая морда и ограниченное покачивание хвоста остаются внутри своего кадра.

Уши эльфа и клыки орка различаются и в верховой позе. Цвета коня задаются его собственной палитрой: переливающийся конь больше не перекрашивает кожу, броню и плащ всего всадника. Локальные и удалённые игроки используют одинаковый атлас и анимации. Размер столкновений, скорость движения и игровая механика верховой езды этим изменением не меняются.

## Пеший образ и направление жителей

Пеший персонаж использует более компактные пропорции головы, сапоги, шаги под корпусом и встречное движение рук. Контактная поза между противоположными шагами включена в циклы тела, оружия, щита и плаща. Кадры снаряжения рисуются на отдельных 48×48 поверхностях перед сборкой атласа, поэтому они не загрязняют соседние ячейки. Щит приближен к руке и уходит за корпус при северном направлении.

Для игрока и удалённых игроков заведены направленные позы покоя; плащ и оружие сохраняют тот же ряд после остановки. Конечная точка навигации имеет допуск 2 px вместо попыток достигнуть точности 0,05 px; промежуточные углы пути сохраняют прежнюю точность. После прибытия маршрут закрывается и субпиксельные поправки не разворачивают персонажа. Шаг игрока показывается при фактическом движении.

Жители выбирают направление по фактическому перемещению на текущем участке улицы. Для человеческих, эльфийских и орочьих образов используется соответствующий ряд пятинаправленного атласа; для образов с двумя рядами предусмотрен северный ряд. Служебные NPC получили северные анимации ходьбы и покоя. Северное движение и смена направления проверены регрессионными тестами.

Удалённые персонажи сохраняют последнее направление движения после остановки; сетевые поправки до 2,5 px не меняют направление и сами по себе не запускают шаг. Сглаживание завершается точным положением при остатке до 0,25 px. Остановленная при посадке анимация возобновляется после смены состояния, даже если её ключ не изменился. Локальная лошадь шагает только при фактическом перемещении. Завершение реакции на удар сохраняет направление покоя и не прерывает более новую реакцию или атаку.

## Толпа, занятия и гарнизон

Жители, служебные NPC, актёры театра и декоративные патрули зарегистрированы в общей системе личного пространства сцены. Обход выполняется ограниченными шагами с проверкой всего отрезка по статическим препятствиям и занятым позициям. Встречные прохожие сначала обходят справа; если места нет, остаются на месте. Отдельного раздвигания стоящих жителей после обновления больше нет. Входящий актёр снимается с учёта после ухода внутрь; регистрация освобождается при уничтожении. Для узких проходов основной поиск на сетке 32 px дополняется сеткой 16 px, с отдельными кешами и прежними ограничениями поиска.

Частота шага учитывает скорость пешего игрока, лошади и городских NPC; ручные анимации учитывают пройденное расстояние. Поворот к собеседнику использует полный вектор, включая северные и диагональные направления. Приветствие при приближении ограничено по времени и не удерживает жителей навсегда. Уступание верховому персонажу выполняется ходьбой к проверенной точке, а не мгновенной перестановкой.

Занятие задаёт направление взгляда и время остановки отдельно от точки подхода. У площадки дети сохраняют короткие игровые паузы, а родители смотрят в сторону игры; торговец и подмастерье ориентируются на рабочую зону. При разговоре занятие уступает управление диалогу.

`HAVEN_GARRISON_LAYOUT` и `HAVEN_GARRISON_PROPS` задают общий план гарнизона для клиента, серверных столкновений, станции костра и генератора карты. Костёр и отдых вынесены к югу от служебных постов, снаряжение и палатки — к западному краю; стрельба и фехтование имеют отдельные позиции. Подход к казарме, рабочие точки и весь патруль проверяются на поставляемой геометрии при открытых и закрытых воротах. Учебные солдаты и декоративные дневной/ночной караулы возвращаются пешком к входу; следующая смена выходит с задержками. Эффекты тренировок работают только при прибытии участников. Суточный цикл обычного жителя, ребёнка, родителя и ночного стражника проверяется с физическими входами и выходами, без скачка к расписанию.

Гарнизон огорожен деревянным частоколом с четырьмя проходами шириной 192 px. Геометрия ограды задана в shared и используется как сервером, так и клиентом; визуальные брёвна рисуются процедурно на той же линии. Посты по обе стороны входов не сужают проезд всадника. В отдельном списке заданы ещё 32 солдата: восемь в учебном строю, четыре отдыхающих, шесть дневных и шесть ночных часовых, четыре дневных и четыре ночных патрульных. Их смены используют физический выход из казармы и возвращение к входу, а занятия начинаются после прибытия. Все позиции солдат, входы и маршруты проверяются на карте с открытыми и закрытыми городскими воротами.

## Индивидуальные образы жителей

154 расписания жителей используют постоянные идентификаторы `haven-resident-NNN`. Общий профиль `CitizenAppearance` задаёт возраст, пол, расу, лицо, волосы, телосложение, одежду и аксессуар. Клиент создаёт для каждого жителя собственный атлас с пятью направлениями ходьбы и покоя; декоративные персонажи порта, театра, мастерских, жилого района и гарнизона также получают отдельные образы. Палитра не зависит от случайности текущего запуска и не накладывается общим tint на кожу и одежду.

Портреты `portrait_haven_resident_NNN` генерируются через ComfyUI из того же профиля. Диалог сохраняет выбранного физического жителя при асинхронной загрузке ответа. Основной портрет и миниатюры вариантов ответа используют его личный ассет; общие портреты района не подставляются вместо отсутствующего личного изображения. Именные служебные NPC сохраняют свои отдельные портреты.

Для проверки полного состава включите высокий графический профиль и `?npcLifeDebug=1`. `canvas.dataset.citizenLooks` содержит контрольные суммы реальных пикселей каждого созданного спрайта. На полной городской сцене проверены 226 индивидуальных атласов, включая 154 жителя: совпадений нет. Процедурный атлас строится по одной полосе на направление и повторно используется при возвращении в город.

После генерации `pnpm audit:citizen-media` проверяет все 154 WebP: размер, полное декодирование, привязку manifest и отсутствие одинаковых пикселей. Проверка завершается ошибкой, если отсутствует хотя бы один портрет.

## Приёмная авторов EmperyWorld

Именованные авторы Lady_Boss и po&T встречают гостей в западной и восточной зонах ожидания приёмной. Идентификаторы, позиции и внешности находятся в `packages/shared/src/empery-founders.ts`; карта, спрайты NPC и портреты используют одну запись. Lady_Boss имеет длинные каштановые кудри, po&T — бритую голову и бороду. Ресепшен получил отдельный молодой рыжий кудрявый образ.

Личные диалоги авторов задаются в YAML с `dialogueMode: authored`: приветствие и ветки знакомства работают без запроса к LLM и не изменяют деньги или состояние квестов. Ресепшен объясняет, где найти обоих авторов, а терминал упоминает их в архиве. Лабораторный квест и допуск сохраняются.

Приёмная — отдельная карта `empery_hq_lobby` внутри главного корпуса, с режимом `dayNight: indoor` и защищённым внутренним климатом. Вход из кампуса и обратная дверь имеют явные безопасные точки прибытия. Наружные корпуса, ограда и посадочная площадка не рисуются внутри; старый `prop_hq_pad` убран и из двора. Приёмная имеет единый каменный пол, спокойную палитру, стеновую панель за стойкой, два компактных дивана и комнатные растения. Рабочих столов и цветных студийных контуров нет. План задаётся в `empery-hq-lobby.ts` и генераторе `scripts/layouts/empery_hq.mjs`. Размер стойки — 96 px, диванов — 88 px, кашпо — 48 px. Статические столкновения общие для клиента и сервера; низкая стойка блокирует ходьбу, но не линию видимости для разговора. Маршруты к NPC, подход к стойке и связь зон ожидания проверяются на карте. Изменённые медиа требуют `pnpm bake:collision`, сборки shared и пересборки атласов.

Авторы в приёмной закреплены на сиденьях своих диванов: Lady_Boss отдыхает в уверенной позе, po&T печатает на ноутбуке. Сидячая поза не использует анимацию ходьбы; во время разговора набор текста приостанавливается. Диваны остаются физическими препятствиями, но не перекрывают видимость для диалога. Фирменный логотип загружается из локального `branding/emperyworld-logo.webp`.
