import {
  depositHousingStorage,
  fetchHousing,
  withdrawHousingStorage,
  type HousingStorageKind,
  type HousingView,
  type ItemDefinition,
  type PlayerSave,
  type PlayerStats,
} from './api.js';
import { friendlyUiError } from './ui-errors.js';
import { appendMediaIcon } from './hud-atlas.js';

export interface HousingStorageHost {
  getSave: () => PlayerSave | null;
  getItems: () => ItemDefinition[];
  assetUrl: (assetId: string) => string | undefined;
  onSaveUpdate: (save: PlayerSave, stats?: PlayerStats) => void;
  onToast: (text: string) => void;
  onClose?: () => void;
}

const KIND_LABEL: Record<HousingStorageKind, string> = {
  materials: 'Сундук · материалы',
  gear: 'Стеллаж · оружие и броня',
  food: 'Холодильник · еда',
};

const GEAR_SLOTS = new Set([
  'weapon',
  'weapon2',
  'shield',
  'quiver',
  'head',
  'body',
  'legs',
  'gloves',
  'cloak',
]);

const HOUSING_BLOCKED_ITEMS = new Set(['field_radio']);

let root: HTMLElement | null = null;
let host: HousingStorageHost | null = null;
let kind: HousingStorageKind = 'materials';
let view: HousingView | null = null;
let busy = false;

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id)! as T;
}

function itemById(itemId: string): ItemDefinition | undefined {
  return host?.getItems().find((i) => i.id === itemId);
}

function itemLabel(itemId: string): string {
  return itemById(itemId)?.name ?? itemId;
}

function itemAllowedInStorage(itemId: string, storageKind: HousingStorageKind): boolean {
  if (HOUSING_BLOCKED_ITEMS.has(itemId)) return false;
  const item = itemById(itemId);
  if (!item) return false;
  if (storageKind === 'materials') return item.slot === 'material';
  if (storageKind === 'gear') return GEAR_SLOTS.has(item.slot);
  const s = item.survival;
  return (
    item.slot === 'consumable' &&
    Boolean(s && (typeof s.nutrition === 'number' || typeof s.hydration === 'number'))
  );
}

function makeRow(itemId: string, qty: number, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'housing-row';
  const name = document.createElement('span');
  name.className = 'housing-row-name';
  name.textContent = itemLabel(itemId);
  btn.appendChild(name);
  if (qty > 1) {
    const badge = document.createElement('span');
    badge.className = 'housing-stack-badge';
    badge.textContent = `×${qty}`;
    btn.appendChild(badge);
  }
  const url = host?.assetUrl(`item_${itemId}`);
  if (url) {
    appendMediaIcon(btn, `item_${itemId}`, { url, alt: '' });
    const icon = btn.lastElementChild;
    if (icon) btn.insertBefore(icon, btn.firstChild);
  }
  btn.onclick = onClick;
  return btn;
}

export function mountHousingStorage(container: HTMLElement, h: HousingStorageHost): void {
  root = container;
  host = h;
  el<HTMLButtonElement>('housing-close').onclick = () => closeHousingStorage();
  for (const k of ['materials', 'gear', 'food'] as const) {
    const btn = document.getElementById(`housing-tab-${k}`);
    if (btn) {
      btn.onclick = () => {
        kind = k;
        void refresh();
      };
    }
  }
}

export function isHousingStorageOpen(): boolean {
  return Boolean(root?.classList.contains('visible'));
}

export function closeHousingStorage(): void {
  root?.classList.remove('visible');
  view = null;
  busy = false;
  host?.onClose?.();
}

export async function openHousingStorage(storageKind: HousingStorageKind): Promise<void> {
  if (!root || !host) return;
  const save = host.getSave();
  if (!save) return;
  kind = storageKind;
  root.classList.add('visible');
  el('housing-list').innerHTML = '<div class="housing-empty">Загрузка…</div>';
  el('housing-bag').innerHTML = '';
  try {
    view = await fetchHousing(save.id);
    render();
  } catch (err) {
    host.onToast(friendlyUiError(err, 'Хранилище недоступно'));
    closeHousingStorage();
  }
}

async function refresh(): Promise<void> {
  const save = host?.getSave();
  if (!save) return;
  view = await fetchHousing(save.id);
  render();
}

function slotCount(entries: Array<{ quantity?: number }>): number {
  return entries.reduce((n, e) => n + Math.max(1, Math.floor(e.quantity || 1)), 0);
}

/** Storage rows: keep stacks together; flatIndex = first unit for withdraw API. */
function storageStacks(
  entries: Array<{ id: string; itemId: string; quantity: number }>,
): Array<{ itemId: string; quantity: number; flatIndex: number }> {
  const out: Array<{ itemId: string; quantity: number; flatIndex: number }> = [];
  let flat = 0;
  for (const e of entries) {
    const qty = Math.max(1, Math.floor(e.quantity || 1));
    out.push({ itemId: e.itemId, quantity: qty, flatIndex: flat });
    flat += qty;
  }
  return out;
}

/** Bag rows: group identical itemIds into one line (arrows etc.). */
function bagStacks(
  bagIds: string[],
): Array<{ itemId: string; quantity: number; firstIndex: number }> {
  const out: Array<{ itemId: string; quantity: number; firstIndex: number }> = [];
  const seen = new Map<string, number>();
  bagIds.forEach((itemId, index) => {
    if (!itemAllowedInStorage(itemId, kind)) return;
    const at = seen.get(itemId);
    if (at === undefined) {
      seen.set(itemId, out.length);
      out.push({ itemId, quantity: 1, firstIndex: index });
    } else {
      out[at]!.quantity += 1;
    }
  });
  return out;
}

function render(): void {
  if (!root || !host || !view) return;
  const save = host.getSave();
  el('housing-title').textContent = KIND_LABEL[kind];
  const owned = view.owned;
  const caps = owned?.capacities;
  const used = owned ? slotCount(owned.storages[kind]) : 0;
  const max = caps ? caps[kind] : 0;
  el('housing-hint').textContent = owned
    ? `${owned.tier}-комнатная · ${used}/${max}`
    : 'Нет квартиры';

  for (const k of ['materials', 'gear', 'food'] as const) {
    document.getElementById(`housing-tab-${k}`)?.classList.toggle('active', k === kind);
  }

  const list = el('housing-list');
  list.innerHTML = '';
  const bag = el('housing-bag');
  bag.innerHTML = '';

  if (!owned) {
    list.innerHTML = '<div class="housing-empty">Сначала купи квартиру у дворецкого.</div>';
    return;
  }

  const storageRows = storageStacks(owned.storages[kind]);
  if (storageRows.length === 0) {
    list.innerHTML = '<div class="housing-empty">Пусто. Переложи предметы из рюкзака →</div>';
  } else {
    for (const row of storageRows) {
      list.appendChild(makeRow(row.itemId, row.quantity, () => void doWithdraw(row.flatIndex)));
    }
  }

  const bagIds = save?.inventory ?? [];
  const depositable = bagStacks(bagIds);

  if (bagIds.length === 0) {
    bag.innerHTML = '<div class="housing-empty">Рюкзак пуст</div>';
  } else if (depositable.length === 0) {
    bag.innerHTML = '<div class="housing-empty">Нет подходящих предметов для этого хранилища</div>';
  } else {
    for (const row of depositable) {
      bag.appendChild(makeRow(row.itemId, row.quantity, () => void doDeposit(row.firstIndex)));
    }
  }
}

async function doDeposit(inventoryIndex: number): Promise<void> {
  if (!host || busy) return;
  const save = host.getSave();
  if (!save) return;
  busy = true;
  try {
    const result = await depositHousingStorage(save.id, kind, inventoryIndex);
    host.onSaveUpdate(result.save, result.stats);
    host.onToast(result.message);
    view = result.housing;
    render();
  } catch (err) {
    host.onToast(friendlyUiError(err, 'Не удалось положить'));
  } finally {
    busy = false;
  }
}

async function doWithdraw(storageIndex: number): Promise<void> {
  if (!host || busy) return;
  const save = host.getSave();
  if (!save) return;
  busy = true;
  try {
    const result = await withdrawHousingStorage(save.id, kind, storageIndex);
    host.onSaveUpdate(result.save, result.stats);
    host.onToast(result.message);
    view = result.housing;
    render();
  } catch (err) {
    host.onToast(friendlyUiError(err, 'Не удалось взять'));
  } finally {
    busy = false;
  }
}
