import { processSurvival, type PlayerSave, type PlayerStats } from './api.js';
import { friendlyUiError } from './ui-errors.js';

export type SurvivalStationKind = 'campfire' | 'hearth' | 'water' | 'pot';

export interface StationUiHost {
  getSave: () => PlayerSave | null;
  onSaveUpdate: (save: PlayerSave, stats?: PlayerStats) => void;
  onToast: (text: string) => void;
  onClose?: () => void;
}

interface StationRecipe {
  id: string;
  name: string;
  hint: string;
  stations: SurvivalStationKind[];
}

/** Mirrors content/crafts/survival.yaml (station gate only; server checks bag/housing). */
const STATION_RECIPES: StationRecipe[] = [
  {
    id: 'filter_water',
    name: 'Фильтровать воду',
    hint: 'Грязная вода + угольный фильтр',
    stations: ['water'],
  },
  {
    id: 'boil_water',
    name: 'Вскипятить воду',
    hint: 'Фильтрованная вода + котелок (у очага хворост не нужен)',
    stations: ['pot', 'campfire', 'hearth'],
  },
  {
    id: 'cook_meat',
    name: 'Жарить мясо',
    hint: 'Сырое мясо (из рюкзака или ледника)',
    stations: ['campfire', 'hearth'],
  },
  {
    id: 'cook_fish',
    name: 'Жарить рыбу',
    hint: 'Сырая рыба (из рюкзака или ледника)',
    stations: ['campfire', 'hearth'],
  },
  {
    id: 'dry_meat',
    name: 'Сушить мясо',
    hint: 'Жареное мясо',
    stations: ['campfire', 'hearth'],
  },
  {
    id: 'dry_fish',
    name: 'Сушить рыбу',
    hint: 'Жареная рыба',
    stations: ['campfire', 'hearth'],
  },
  {
    id: 'stabilize_camp',
    name: 'Согреться у огня',
    hint: 'Остановить холод без расходников',
    stations: ['campfire', 'hearth'],
  },
  {
    id: 'light_fire',
    name: 'Разжечь / погреться',
    hint: 'У очага — просто тепло; в поле нужен хворост',
    stations: ['campfire', 'hearth'],
  },
];

const KIND_TITLE: Record<SurvivalStationKind, string> = {
  hearth: 'Очаг',
  campfire: 'Костёр',
  water: 'Источник воды',
  pot: 'Котёл',
};

let root: HTMLElement | null = null;
let host: StationUiHost | null = null;
let activeKinds: SurvivalStationKind[] = [];
let busy = false;

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id)! as T;
}

export function stationPanelTitle(kinds: SurvivalStationKind[]): string {
  const uniq = [...new Set(kinds)];
  if (uniq.includes('hearth') && uniq.includes('pot')) return 'Русская печь';
  if (uniq.length === 1) return KIND_TITLE[uniq[0]!];
  return uniq.map((k) => KIND_TITLE[k]).join(' · ');
}

export function mountStationPanel(container: HTMLElement, h: StationUiHost): void {
  root = container;
  host = h;
  el<HTMLButtonElement>('station-close').onclick = () => closeStationPanel();
}

export function isStationPanelOpen(): boolean {
  return Boolean(root?.classList.contains('visible'));
}

export function closeStationPanel(): void {
  root?.classList.remove('visible');
  activeKinds = [];
  busy = false;
  host?.onClose?.();
}

export function openStationPanel(kinds: SurvivalStationKind[]): void {
  if (!root || !host || !kinds.length) return;
  document.getElementById('inventory')?.classList.remove('visible');
  document.getElementById('travel')?.classList.remove('visible');
  document.getElementById('skills')?.classList.remove('visible');
  document.getElementById('housing')?.classList.remove('visible');
  document.getElementById('shop')?.classList.remove('visible');
  document.getElementById('forge')?.classList.remove('visible');
  document.getElementById('radio')?.classList.remove('visible');
  activeKinds = [...new Set(kinds)];
  root.classList.add('visible');
  el('station-title').textContent = stationPanelTitle(activeKinds);
  el('station-hint').textContent =
    'Выбери действие. Предметы можно взять из рюкзака или хранилища квартиры.';
  render();
}

function recipesFor(kinds: SurvivalStationKind[]): StationRecipe[] {
  const set = new Set(kinds);
  return STATION_RECIPES.filter((r) => r.stations.some((k) => set.has(k)));
}

function render(): void {
  const list = el('station-list');
  list.innerHTML = '';
  const recipes = recipesFor(activeKinds);
  if (!recipes.length) {
    list.innerHTML = '<div class="station-empty">Здесь нечего делать.</div>';
    return;
  }
  for (const recipe of recipes) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'station-row';
    const name = document.createElement('span');
    name.className = 'station-row-name';
    name.textContent = recipe.name;
    const hint = document.createElement('span');
    hint.className = 'station-row-hint';
    hint.textContent = recipe.hint;
    btn.append(name, hint);
    btn.onclick = () => void runRecipe(recipe.id);
    list.appendChild(btn);
  }
}

async function runRecipe(recipeId: string): Promise<void> {
  if (!host || busy) return;
  const save = host.getSave();
  if (!save) return;
  busy = true;
  try {
    const result = await processSurvival(save.id, recipeId);
    host.onSaveUpdate(result.save, result.stats);
    host.onToast(result.message);
    render();
  } catch (err) {
    host.onToast(friendlyUiError(err, 'Не удалось обработать'));
  } finally {
    busy = false;
  }
}
