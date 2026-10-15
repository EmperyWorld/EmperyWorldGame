import { fetchSurvival, fetchTravelOptions, type LocationDefinition, type PlayerSave, type SurvivalEnvironment } from './api.js';
import { formatGameClock } from '@empery/shared';

export interface TravelHost {
  getSave: () => PlayerSave | null;
  assetUrl: (assetId: string) => string | undefined;
  raceLabel: (raceId: string) => string;
  onTravel: (locationId: string) => Promise<void>;
}

const LOC_THEMES: Record<string, { gradient: string; icon: string; zone: string }> = {
  starter_grove: { gradient: 'linear-gradient(135deg, #2a5030 0%, #142818 100%)', icon: 'Рщ', zone: 'Стартовая зона' },
  empery_haven: { gradient: 'linear-gradient(135deg, #3a4558 0%, #222830 100%)', icon: 'Гв', zone: 'Безопасный город' },
  empery_hq: { gradient: 'linear-gradient(135deg, #1a4058 0%, #061820 100%)', icon: 'HQ', zone: 'Кампус EmperyWorld' },
  adena_fields: { gradient: 'linear-gradient(135deg, #6a7040 0%, #3a4020 100%)', icon: 'Ад', zone: 'Фарм адены' },
  suburban_park: { gradient: 'linear-gradient(135deg, #3a5840 0%, #1a3020 100%)', icon: 'Пк', zone: 'Tier 1 · Парк' },
  abandoned_yard: { gradient: 'linear-gradient(135deg, #584830 0%, #2a2010 100%)', icon: 'Дв', zone: 'Tier 1 · Стройка' },
  intersection_district: { gradient: 'linear-gradient(135deg, #403060 0%, #181028 100%)', icon: 'Рз', zone: 'Tier 2 · Разлом' },
  signal_block: { gradient: 'linear-gradient(135deg, #204850 0%, #102028 100%)', icon: 'Сг', zone: 'Tier 2 · Сигнал' },
  relay_spire: { gradient: 'linear-gradient(135deg, #285068 0%, #102030 100%)', icon: 'Шп', zone: 'Tier 2 · Шпиль' },
  static_core: { gradient: 'linear-gradient(135deg, #1a4840 0%, #081818 100%)', icon: 'Яд', zone: 'Tier 2 · Ядро' },
  chaos_sector: { gradient: 'linear-gradient(135deg, #502038 0%, #180810 100%)', icon: 'Хс', zone: 'Tier 3 · Хаос' },
  fracture_ridge: { gradient: 'linear-gradient(135deg, #482030 0%, #14080c 100%)', icon: 'Гр', zone: 'Tier 3 · Гребень' },
  void_scar: { gradient: 'linear-gradient(135deg, #401828 0%, #10060a 100%)', icon: 'Шр', zone: 'Tier 3 · Шрам' },
  collapse_fringe: { gradient: 'linear-gradient(135deg, #381828 0%, #0c0408 100%)', icon: 'Кл', zone: 'Tier 4 · Коллапс' },
  citadel_approach: { gradient: 'linear-gradient(135deg, #401828 0%, #100408 100%)', icon: 'Пд', zone: 'Tier 4 · Подступы' },
  singularity_citadel: { gradient: 'linear-gradient(135deg, #481830 0%, #100208 100%)', icon: 'Цт', zone: 'Tier 4 · Цитадель' },
  gods_rift: { gradient: 'linear-gradient(135deg, #483818 0%, #100804 100%)', icon: 'Бг', zone: 'Tier 4 · Разлом' },
  pantheon_ascent: { gradient: 'linear-gradient(135deg, #504020 0%, #140a04 100%)', icon: 'Пн', zone: 'Tier 4 · Пантеон' },
  godfall_throne: { gradient: 'linear-gradient(135deg, #584818 0%, #140804 100%)', icon: 'Тр', zone: 'Tier 4 · Трон' },
  shadow_depths: { gradient: 'linear-gradient(135deg, #3a2850 0%, #181028 100%)', icon: 'Тн', zone: 'Данж Act 2' },
  silverwood: { gradient: 'linear-gradient(135deg, #304868 0%, #1a2838 100%)', icon: 'Ср', zone: 'Эльфийские земли' },
  ash_highlands: { gradient: 'linear-gradient(135deg, #503020 0%, #281810 100%)', icon: 'Пл', zone: 'Орочьи земли' },
};

const MAP_NODES: Record<string, { x: number; y: number }> = {
  starter_grove: { x: 48, y: 60 },
  empery_haven: { x: 64, y: 54 },
  empery_hq: { x: 74, y: 50 },
  suburban_park: { x: 78, y: 46 },
  abandoned_yard: { x: 88, y: 38 },
  intersection_district: { x: 94, y: 28 },
  signal_block: { x: 98, y: 18 },
  relay_spire: { x: 96, y: 8 },
  static_core: { x: 90, y: 4 },
  chaos_sector: { x: 82, y: 2 },
  fracture_ridge: { x: 72, y: 6 },
  void_scar: { x: 62, y: 10 },
  collapse_fringe: { x: 52, y: 14 },
  citadel_approach: { x: 44, y: 18 },
  singularity_citadel: { x: 36, y: 22 },
  gods_rift: { x: 28, y: 26 },
  pantheon_ascent: { x: 20, y: 30 },
  godfall_throne: { x: 12, y: 34 },
  adena_fields: { x: 68, y: 76 },
  shadow_depths: { x: 48, y: 82 },
  silverwood: { x: 22, y: 28 },
  ash_highlands: { x: 78, y: 18 },
};

const MAP_LINKS: [string, string][] = [
  ['starter_grove', 'empery_haven'],
  ['empery_haven', 'adena_fields'],
  ['empery_haven', 'suburban_park'],
  ['empery_haven', 'empery_hq'],
  ['suburban_park', 'abandoned_yard'],
  ['abandoned_yard', 'intersection_district'],
  ['intersection_district', 'signal_block'],
  ['signal_block', 'relay_spire'],
  ['relay_spire', 'static_core'],
  ['static_core', 'chaos_sector'],
  ['chaos_sector', 'fracture_ridge'],
  ['fracture_ridge', 'void_scar'],
  ['void_scar', 'collapse_fringe'],
  ['collapse_fringe', 'citadel_approach'],
  ['citadel_approach', 'singularity_citadel'],
  ['singularity_citadel', 'gods_rift'],
  ['gods_rift', 'pantheon_ascent'],
  ['pantheon_ascent', 'godfall_throne'],
  ['starter_grove', 'shadow_depths'],
  ['starter_grove', 'silverwood'],
  ['starter_grove', 'ash_highlands'],
];

const RACE_HINT_LABELS: Record<string, string> = {
  human: 'Люди',
  elf: 'Эльфы',
  orc: 'Орки',
};

let root: HTMLElement | null = null;
let host: TravelHost | null = null;
let options: LocationDefinition[] = [];
let traveling = false;

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

function theme(loc: LocationDefinition): { gradient: string; icon: string; zone: string } {
  return (
    LOC_THEMES[loc.id] ?? {
      gradient: 'linear-gradient(135deg, #2a2830 0%, #141820 100%)',
      icon: '·',
      zone: 'Неизвестно',
    }
  );
}

function zoneLabel(loc: LocationDefinition, saveRace: string): string {
  const t = theme(loc);
  if (loc.raceHint && loc.raceHint === saveRace) return `${t.zone} · родина`;
  if (loc.id === 'empery_haven') return t.zone;
  return t.zone;
}

function sortLocations(list: LocationDefinition[], currentId: string): LocationDefinition[] {
  return [...list].sort((a, b) => {
    const rank = (loc: LocationDefinition): number => {
      if (loc.id === currentId) return 0;
      if (loc.recommended) return 1;
      if (loc.canTravel) return 2;
      return 3;
    };
    return rank(a) - rank(b) || a.name.localeCompare(b.name, 'ru');
  });
}

function renderWorldMap(save: PlayerSave, list: LocationDefinition[]): void {
  const mapEl = el<HTMLElement>('travel-map');
  const byId = new Map(list.map((l) => [l.id, l]));
  const lines = MAP_LINKS.map(([from, to]) => {
    const a = MAP_NODES[from];
    const b = MAP_NODES[to];
    if (!a || !b) return '';
    const locked = !byId.get(to)?.canTravel && byId.get(to)?.id !== save.location;
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="travel-map-link${locked ? ' locked' : ''}" />`;
  }).join('');

  const nodes = list
    .map((loc) => {
      const pos = MAP_NODES[loc.id];
      if (!pos) return '';
      const isCurrent = loc.id === save.location;
      const isLocked = !loc.canTravel && !isCurrent;
      const isRec = Boolean(loc.recommended);
      const t = theme(loc);
      return `<button type="button" class="travel-map-node${isCurrent ? ' current' : ''}${isLocked ? ' locked' : ''}${isRec ? ' recommended' : ''}" data-loc-id="${loc.id}" style="left:${pos.x}%;top:${pos.y}%" title="${loc.name}">
        <span class="travel-map-node-icon">${t.icon}</span>
        <span class="travel-map-node-name">${loc.name.split(' ')[0]}</span>
      </button>`;
    })
    .join('');

  mapEl.innerHTML = `<svg class="travel-map-svg" viewBox="0 0 100 70" preserveAspectRatio="none">${lines}</svg><div class="travel-map-nodes">${nodes}</div>`;

  mapEl.querySelectorAll<HTMLButtonElement>('.travel-map-node:not(.locked)').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.locId;
      if (!id || traveling) return;
      const loc = list.find((l) => l.id === id);
      if (!loc?.canTravel || id === save.location) return;
      void tryTravel(id);
    };
  });
}

function renderCurrentBanner(
  save: PlayerSave,
  list: LocationDefinition[],
  environment?: SurvivalEnvironment,
): void {
  const current = list.find((l) => l.id === save.location);
  const banner = el<HTMLElement>('travel-current');
  if (!current) {
    banner.innerHTML = '';
    return;
  }
  const t = theme(current);
  const bg = host!.assetUrl(current.backgroundAsset);
  banner.innerHTML = `
    <div class="travel-current-thumb" style="${bg ? `background-image:url(${bg})` : `background:${t.gradient}`}"></div>
    <div class="travel-current-body">
      <div class="travel-current-label">Текущая локация</div>
      <div class="travel-current-name">${current.name}</div>
      <div class="travel-current-desc">${current.description}</div>
      ${
        environment
          ? `<div class="travel-current-desc">Погода: ${environment.weather.name}${
              environment.season ? ` · ${environment.season.name}` : ''
            }${
              environment.timeOfDay
                ? ` · ${formatGameClock(environment.timeOfDay.hour)} · ${environment.timeOfDay.phaseName}`
                : ''
            } · ${environment.temperatureC >= 0 ? '+' : ''}${Math.round(environment.temperatureC)}°C · влажность ${Math.round(environment.humidity)}%</div>
      ${
        environment.forecast?.length
          ? `<div class="travel-current-desc">Прогноз: ${environment.forecast
              .slice(0, 3)
              .map((entry) => entry.weather.name)
              .join(' → ')}</div>`
          : ''
      }`
          : ''
      }
    </div>
  `;
}

function renderCard(loc: LocationDefinition, save: PlayerSave): HTMLElement {
  const isCurrent = loc.id === save.location;
  const isLocked = !loc.canTravel && !isCurrent;
  const t = theme(loc);
  const bg = host!.assetUrl(loc.backgroundAsset);
  const card = document.createElement('article');
  card.className = `travel-card${isCurrent ? ' current' : ''}${isLocked ? ' locked' : ''}${loc.recommended ? ' recommended' : ''}`;

  const badges: string[] = [];
  if (isCurrent) badges.push('<span class="travel-badge here">Вы здесь</span>');
  if (loc.recommended) badges.push('<span class="travel-badge homeland">Родина</span>');
  if (isLocked) badges.push('<span class="travel-badge locked">Закрыто</span>');
  if (!isCurrent && loc.canTravel) badges.push('<span class="travel-badge open">Доступно</span>');

  const npcs = (loc.npcs ?? [])
    .map((n) => `<span class="travel-npc-chip">${n.label.replace(' [E]', '')}</span>`)
    .join('');

  const raceHint =
    loc.raceHint && loc.raceHint !== save.race
      ? `<span class="travel-race-hint">${RACE_HINT_LABELS[loc.raceHint] ?? loc.raceHint}</span>`
      : '';
  const climate = loc.survivalClimate;
  const climateHint = climate
    ? `<div class="travel-card-zone">Климат: ${climate.temperatureC ?? '—'}°C · ${
        climate.water === 'clean' ? 'чистая вода' : climate.water === 'dirty' ? 'дикая вода' : 'без воды'
      }</div>`
    : '';

  card.innerHTML = `
    <div class="travel-card-thumb" style="${bg ? `background-image:url(${bg})` : `background:${t.gradient}`}">
      <span class="travel-card-icon">${t.icon}</span>
      ${badges.length ? `<div class="travel-card-badges">${badges.join('')}</div>` : ''}
    </div>
    <div class="travel-card-body">
      <div class="travel-card-head">
        <h3 class="travel-card-name">${loc.name}</h3>
        ${raceHint}
      </div>
      <div class="travel-card-zone">${zoneLabel(loc, save.race)}</div>
      ${climateHint}
      <p class="travel-card-desc">${loc.description}</p>
      ${npcs ? `<div class="travel-card-npcs">${npcs}</div>` : ''}
      <div class="travel-card-action"></div>
    </div>
  `;

  const action = card.querySelector('.travel-card-action')!;
  if (isCurrent) {
    action.innerHTML = '<span class="travel-here-tag">Персонаж находится здесь</span>';
  } else if (loc.canTravel) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'travel-go-btn';
    btn.textContent = 'Отправиться';
    btn.onclick = () => void tryTravel(loc.id);
    action.appendChild(btn);
  } else if (loc.lockReason) {
    action.innerHTML = `<div class="travel-lock-reason"><span class="travel-lock-icon" aria-hidden="true">×</span>${loc.lockReason}</div>`;
  }

  return card;
}

async function tryTravel(locationId: string): Promise<void> {
  if (!host || traveling) return;
  traveling = true;
  root?.classList.add('travel-busy');
  try {
    await host.onTravel(locationId);
  } finally {
    traveling = false;
    root?.classList.remove('travel-busy');
  }
}

function renderHeader(save: PlayerSave): void {
  el<HTMLElement>('travel-summary').textContent = `${save.name} · ${host!.raceLabel(save.race)} · lvl ${save.level}`;
}

export function mountTravel(container: HTMLElement, h: TravelHost): void {
  root = container;
  host = h;
  el<HTMLButtonElement>('travel-close').onclick = () => container.classList.remove('visible');
}

export function isTravelOpen(): boolean {
  return root?.classList.contains('visible') ?? false;
}

export async function renderTravelPanel(): Promise<void> {
  if (!root || !host) return;
  const save = host.getSave();
  if (!save) return;

  const grid = el<HTMLElement>('travel-grid');
  grid.innerHTML = '<div class="travel-loading">Загрузка маршрутов…</div>';

  try {
    const [travelOptions, survival] = await Promise.all([
      fetchTravelOptions(save.id),
      fetchSurvival(save.id).catch(() => null),
    ]);
    options = travelOptions;
    renderHeader(save);
    renderCurrentBanner(save, options, survival?.environment);
    renderWorldMap(save, options);

    grid.innerHTML = '';
    for (const loc of sortLocations(options, save.location)) {
      grid.appendChild(renderCard(loc, save));
    }
  } catch {
    grid.innerHTML = '<div class="travel-error">Не удалось загрузить список локаций</div>';
  }
}
