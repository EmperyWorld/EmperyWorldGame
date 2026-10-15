import type { EquipPreview, ItemDefinition, PlayerSave, PlayerStats } from './api.js';
import { mediaIconElement } from './hud-atlas.js';
import {
  enchantBonusForSlot,
  getEquipmentEnchant,
  maxInventoryEnchantForItem,
} from '@empery/shared/enchant';
import { canEquipBow, canEquipQuiver, canEquipShield, canEquipStaff, canEquipArmorType } from '@empery/shared/equipment-slots';
import { isEscapeHotkey, isSlashHotkey } from './hotkeys.js';
import { STAT_LABELS, formatAdenaLabel, statLabel } from './stat-labels.js';

export type InvFilter = 'all' | 'gear' | 'material';
export type InvSort = 'slot' | 'rarity' | 'name';
export type InvRarityFilter = 'all' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'daedric' | 'holy';

export interface InventoryHost {
  getSave: () => PlayerSave | null;
  getStats: () => PlayerStats | null;
  getItems: () => ItemDefinition[];
  assetUrl: (assetId: string) => string | undefined;
  getPortraitUrl?: () => string | undefined;
  fetchPreview: (itemId: string) => Promise<EquipPreview | null>;
  onEquip: (itemId: string, targetSlot?: string) => Promise<void>;
  onUnequip: (slot: string) => Promise<void>;
  /** Свиток воскрешения и т.п. */
  onUseConsumable?: (itemId: string) => Promise<void>;
  onSurvivalProcess?: (recipeId: string) => Promise<void>;
  /** После закрытия панели (кнопка «Закрыть»). */
  onClose?: () => void;
}

const EQUIP_SLOT_LABELS: Record<string, string> = {
  weapon: 'Оружие',
  weapon2: '2-й клинок',
  shield: 'Щит',
  quiver: 'Колчан',
  head: 'Голова',
  body: 'Тело',
  legs: 'Ноги',
  gloves: 'Перчатки',
  cloak: 'Плащ',
};

const SLOT_ORDER: Record<string, number> = {
  weapon: 0,
  weapon2: 1,
  shield: 2,
  quiver: 3,
  head: 4,
  body: 5,
  legs: 6,
  gloves: 7,
  cloak: 8,
  material: 9,
};
const RARITY_ORDER: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  daedric: 5,
  holy: 6,
};
const RARITY_LABELS: Record<string, string> = {
  common: 'обычный',
  uncommon: 'необычный',
  rare: 'редкий',
  epic: 'эпический',
  legendary: 'легендарный',
  daedric: 'даэдрический',
  holy: 'святой',
};

const RACE_LABELS: Record<string, string> = {
  human: 'человек',
  elf: 'эльф',
  orc: 'орк',
};
const PROFESSION_LABELS: Record<string, string> = {
  warrior: 'воин',
  rogue: 'разбойник',
  mystic: 'мистик',
  archer: 'лучник',
};

/** Условный «gear score» для сравнения предметов в UI. */
function itemPowerScore(item: ItemDefinition): number {
  const s = item.stats;
  return (
    (s.pAtk ?? 0) * 2 +
    (s.pDef ?? 0) * 1.5 +
    (s.mAtk ?? 0) * 2 +
    (s.mDef ?? 0) * 1.5 +
    (s.maxHp ?? 0) * 0.08 +
    (s.accuracy ?? 0) +
    (s.evasion ?? 0) +
    (s.attackSpeed ?? 0) +
    (s.critRate ?? 0) * 2 +
    (s.speed ?? 0) * 0.05
  );
}

function totalGearScore(save: PlayerSave, items: ItemDefinition[]): number {
  let total = 0;
  for (const itemId of Object.values(save.equipment)) {
    if (!itemId) continue;
    const item = items.find((i) => i.id === itemId);
    if (item) total += itemPowerScore(item);
  }
  return Math.round(total);
}

function buildItemTooltip(
  item: ItemDefinition,
  opts?: { stack?: number; equipped?: boolean; enchantLevel?: number; slot?: string },
): string {
  const level = opts?.enchantLevel ?? 0;
  const lines = [
    itemDisplayName(item, level),
    `${RARITY_LABELS[item.rarity] ?? item.rarity} · ${EQUIP_SLOT_LABELS[item.slot] ?? item.slot}`,
  ];
  const stats = formatItemStats(item, level, opts?.slot ?? item.slot);
  if (stats) lines.push(stats);
  lines.push(`сила ${Math.round(itemPowerScore(item))}`);
  if (opts?.stack && opts.stack > 1) lines.push(`×${opts.stack}`);
  if (opts?.equipped) lines.push('✓ Экипировано');
  return lines.join('\n');
}

function bagUpgradeKind(item: ItemDefinition, save: PlayerSave, items: ItemDefinition[]): 'upgrade' | 'sidegrade' | null {
  if (item.slot === 'material' || item.slot === 'consumable') return null;
  const eqId = save.equipment[item.slot];
  if (!eqId) return 'upgrade';
  const eq = items.find((i) => i.id === eqId);
  if (!eq) return null;
  const diff = itemPowerScore(item) - itemPowerScore(eq);
  if (diff > 0.5) return 'upgrade';
  if (diff < -0.5) return 'sidegrade';
  return null;
}

/** Меньше ms = быстрее атака → для UI инвертируем знак. */
const LOWER_IS_BETTER = new Set(['attackDelayMs']);

interface InventoryUi {
  root: HTMLElement;
  adena: HTMLElement;
  hero: HTMLElement | null;
  bagCount: HTMLElement | null;
  portrait: HTMLImageElement | null;
  equipFill: HTMLElement | null;
  equipSummary: HTMLElement | null;
  vital: HTMLElement | null;
  search: HTMLInputElement | null;
  searchClear: HTMLButtonElement | null;
  detailPanel: HTMLElement | null;
  bagUpgrades: HTMLElement | null;
  statsBar: HTMLElement;
  doll: HTMLElement;
  detail: HTMLElement;
  toolbar: HTMLElement;
  bagGrid: HTMLElement;
}

const DRAG_MIME = 'application/x-empery-item';

interface DragPayload {
  itemId: string;
  source: 'bag' | 'slot';
  slot?: string;
}

let host: InventoryHost;
let ui: InventoryUi;
let selectedId: string | null = null;
let filter: InvFilter = 'all';
let sort: InvSort = 'slot';
let rarityFilter: InvRarityFilter = 'all';
let searchQuery = '';
let preview: EquipPreview | null = null;
let previewFor: string | null = null;
let activeDrag: DragPayload | null = null;
let suppressClickUntil = 0;

const SLOT_EMPTY_GLYPH: Record<string, string> = {
  weapon: 'Ор',
  weapon2: 'О2',
  shield: 'Щт',
  quiver: 'Кл',
  head: 'Шл',
  body: 'Бр',
  legs: 'Нг',
  gloves: 'Пр',
  cloak: 'Пл',
};

const EQUIP_DOT_SLOTS = [
  'weapon',
  'weapon2',
  'shield',
  'quiver',
  'head',
  'body',
  'legs',
  'gloves',
  'cloak',
] as const;

function equippedSlotCount(save: PlayerSave): { filled: number; total: number } {
  const slots = EQUIP_DOT_SLOTS.filter((s) => {
    if (s === 'weapon2') return hasMadDualist(save);
    if (s === 'shield') return canEquipShield(save.profession);
    if (s === 'quiver') return canEquipQuiver(save.profession);
    return true;
  });
  const filled = slots.filter((s) => save.equipment[s]).length;
  return { filled, total: slots.length };
}

function countBagUpgrades(save: PlayerSave, items: ItemDefinition[]): number {
  let n = 0;
  const seen = new Set<string>();
  for (const itemId of save.inventory) {
    if (seen.has(itemId)) continue;
    seen.add(itemId);
    const item = items.find((i) => i.id === itemId);
    if (item && bagUpgradeKind(item, save, items) === 'upgrade') n++;
  }
  return n;
}

function bagCountLabel(save: PlayerSave, entries: Array<{ count: number }>): string {
  const total = save.inventory.length;
  const shown = entries.reduce((n, e) => n + e.count, 0);
  const filtered = filter !== 'all' || rarityFilter !== 'all' || Boolean(searchQuery);
  if (!filtered) return `${total} шт.`;
  return `${shown} из ${total}`;
}

function emptyBagMessage(): string {
  if (searchQuery) return `Ничего не найдено: «${searchQuery}»`;
  if (rarityFilter !== 'all') return `Нет предметов: ${RARITY_LABELS[rarityFilter] ?? rarityFilter}`;
  if (filter === 'gear') return 'Нет снаряжения в рюкзаке';
  if (filter === 'material') return 'Нет материалов';
  return 'Рюкзак пуст';
}

function updateDetailPanelAccent(item: ItemDefinition | null): void {
  if (!ui.detailPanel) return;
  ui.detailPanel.className = 'inv-panel inv-panel-detail';
  if (item) ui.detailPanel.classList.add(`rarity-accent-${item.rarity}`);
}

function onInventoryKeydown(e: KeyboardEvent): void {
  if (!isInventoryOpen()) return;
  if (isSlashHotkey(e) && document.activeElement !== ui.search) {
    e.preventDefault();
    ui.search?.focus();
    ui.search?.select();
  }
  if (isEscapeHotkey(e) && document.activeElement === ui.search) {
    e.preventDefault();
    ui.search?.blur();
    if (searchQuery) {
      searchQuery = '';
      if (ui.search) ui.search.value = '';
      void renderInventory();
    }
  }
}

export function mountInventory(root: HTMLElement, h: InventoryHost): void {
  host = h;
  ui = {
    root,
    adena: root.querySelector('#inventory-adena')!,
    hero: root.querySelector('#inventory-hero'),
    bagCount: root.querySelector('#inventory-bag-count'),
    portrait: root.querySelector('#inventory-portrait'),
    equipFill: root.querySelector('#inventory-equip-fill'),
    equipSummary: root.querySelector('#inventory-equip-summary'),
    vital: root.querySelector('#inventory-vital'),
    search: root.querySelector('#inventory-search'),
    searchClear: root.querySelector('#inventory-search-clear'),
    detailPanel: root.querySelector('.inv-panel-detail'),
    bagUpgrades: root.querySelector('#inventory-bag-upgrades'),
    statsBar: root.querySelector('#inventory-stats-bar')!,
    doll: root.querySelector('#inventory-doll')!,
    detail: root.querySelector('#inventory-detail')!,
    toolbar: root.querySelector('#inventory-toolbar')!,
    bagGrid: root.querySelector('#inventory-bag-grid')!,
  };

  root.querySelector('#inventory-close')?.addEventListener('click', () => {
    root.classList.remove('visible');
    host.onClose?.();
  });

  root.addEventListener('click', (e) => {
    if (e.target === root) {
      root.classList.remove('visible');
      host.onClose?.();
    }
  });

  ui.search?.addEventListener('input', () => {
    searchQuery = (ui.search?.value ?? '').trim().toLowerCase();
    if (ui.searchClear) ui.searchClear.hidden = !searchQuery;
    void renderInventory();
  });

  ui.searchClear?.addEventListener('click', () => {
    searchQuery = '';
    if (ui.search) ui.search.value = '';
    if (ui.searchClear) ui.searchClear.hidden = true;
    ui.search?.focus();
    void renderInventory();
  });

  document.addEventListener('keydown', onInventoryKeydown);

  ui.toolbar.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest(
      '[data-inv-filter], [data-inv-sort], [data-inv-rarity]',
    ) as HTMLElement | null;
    if (!btn) return;
    if (btn.dataset.invFilter) filter = btn.dataset.invFilter as InvFilter;
    if (btn.dataset.invSort) sort = btn.dataset.invSort as InvSort;
    if (btn.dataset.invRarity) rarityFilter = btn.dataset.invRarity as InvRarityFilter;
    void renderInventory();
  });

  bindBagDropZone();
}

function parseDragPayload(e: DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer?.getData(DRAG_MIME);
    if (raw) return JSON.parse(raw) as DragPayload;
  } catch {
    /* ignore */
  }
  return activeDrag;
}

function clearDropHighlights(): void {
  ui.root.querySelectorAll('.inv-drop-valid, .inv-drop-invalid, .inv-bag-drop-active').forEach((el) => {
    el.classList.remove('inv-drop-valid', 'inv-drop-invalid', 'inv-bag-drop-active');
  });
}

function hasMadDualist(save: PlayerSave | null): boolean {
  return (save?.skillLevels?.mad_dualist ?? 0) > 0;
}

function itemFitsEquipmentSlot(
  item: ItemDefinition,
  slot: string,
  save: PlayerSave | null,
): boolean {
  if (item.slot === 'material' || item.slot === 'consumable') return false;
  if (slot === 'shield') {
    return item.slot === 'shield' && canEquipShield(save?.profession);
  }
  if (slot === 'quiver') {
    return item.slot === 'quiver' && canEquipQuiver(save?.profession);
  }
  if (slot === 'weapon2') {
    if (item.slot !== 'weapon' || item.weaponWeight !== 'light') return false;
    if (item.weaponKind === 'bow' || item.weaponKind === 'staff') return false;
    if (!hasMadDualist(save)) return false;
    const mainId = save?.equipment?.weapon;
    const main = mainId ? findItem(mainId, host.getItems()) : undefined;
    return Boolean(
      main &&
        main.weaponWeight === 'light' &&
        main.weaponKind !== 'bow' &&
        main.weaponKind !== 'staff',
    );
  }
  if (slot === 'weapon' && item.slot === 'weapon') {
    if (item.weaponKind === 'bow') return canEquipBow(save?.profession);
    if (item.weaponKind === 'staff') return canEquipStaff(save?.profession);
  }
  if (['head', 'body', 'legs', 'gloves'].includes(slot) && item.armorType) {
    return item.slot === slot && canEquipArmorType(save?.profession, item.armorType);
  }
  return item.slot === slot;
}

function canDropOnSlot(payload: DragPayload, slot: string, items: ItemDefinition[]): boolean {
  const item = findItem(payload.itemId, items);
  if (!item || item.slot === 'material' || item.slot === 'consumable') return false;
  if (!itemFitsEquipmentSlot(item, slot, host.getSave())) return false;
  if (payload.source === 'slot' && payload.slot === slot) return false;
  if (payload.source === 'bag') return true;
  if (payload.source === 'slot') return payload.slot !== slot;
  return false;
}

function bindDragSource(el: HTMLElement, payload: DragPayload, enabled: boolean): void {
  el.draggable = enabled;
  if (!enabled) return;

  el.addEventListener('dragstart', (e) => {
    activeDrag = payload;
    e.dataTransfer?.setData(DRAG_MIME, JSON.stringify(payload));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    el.classList.add('inv-dragging');
  });

  el.addEventListener('dragend', () => {
    activeDrag = null;
    el.classList.remove('inv-dragging');
    clearDropHighlights();
    suppressClickUntil = Date.now() + 150;
  });
}

function bindSlotDropTarget(el: HTMLElement, slot: string, items: ItemDefinition[]): void {
  el.addEventListener('dragover', (e) => {
    if (!activeDrag) return;
    e.preventDefault();
    const valid = canDropOnSlot(activeDrag, slot, items);
    el.classList.toggle('inv-drop-valid', valid);
    el.classList.toggle('inv-drop-invalid', !valid);
    if (e.dataTransfer) e.dataTransfer.dropEffect = valid ? 'move' : 'none';
  });

  el.addEventListener('dragleave', (e) => {
    if (e.currentTarget === e.target || !(e.currentTarget as Node).contains(e.relatedTarget as Node)) {
      el.classList.remove('inv-drop-valid', 'inv-drop-invalid');
    }
  });

  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('inv-drop-valid', 'inv-drop-invalid');
    const payload = parseDragPayload(e);
    if (!payload || !canDropOnSlot(payload, slot, items)) return;
    void host.onEquip(payload.itemId, slot);
  });
}

function bindBagDropZone(): void {
  ui.bagGrid.addEventListener('dragover', (e) => {
    if (!activeDrag || activeDrag.source !== 'slot' || !activeDrag.slot) return;
    e.preventDefault();
    ui.bagGrid.classList.add('inv-bag-drop-active');
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  });

  ui.bagGrid.addEventListener('dragleave', (e) => {
    if (!ui.bagGrid.contains(e.relatedTarget as Node)) {
      ui.bagGrid.classList.remove('inv-bag-drop-active');
    }
  });

  ui.bagGrid.addEventListener('drop', (e) => {
    e.preventDefault();
    ui.bagGrid.classList.remove('inv-bag-drop-active');
    const payload = parseDragPayload(e);
    if (!payload || payload.source !== 'slot' || !payload.slot) return;
    void host.onUnequip(payload.slot);
  });
}

function shouldSuppressClick(): boolean {
  return Date.now() < suppressClickUntil;
}

export function isInventoryOpen(): boolean {
  return ui.root.classList.contains('visible');
}

/** Cheap HUD sync while inventory is open — no doll/bag rebuild. */
export function refreshInventoryChrome(): void {
  if (!isInventoryOpen()) return;
  const save = host.getSave();
  const stats = host.getStats();
  const items = host.getItems();
  if (!save || !ui) return;

  const gs = totalGearScore(save, items);
  ui.adena.innerHTML = `<span class="inv-adena-coin">${formatAdenaLabel(save.adena ?? 0)}</span><span class="inv-adena-meta">${save.inventory.length} предм. · сила ${gs}</span>`;

  if (ui.vital && stats) {
    const hpPct = Math.max(0, Math.min(100, (save.hp / Math.max(1, stats.maxHp)) * 100));
    const maxMp = stats.maxMp ?? save.maxMp ?? 0;
    const mp = save.mp ?? maxMp;
    const mpPct = maxMp > 0 ? Math.max(0, Math.min(100, (mp / maxMp) * 100)) : 0;
    const hpFill = ui.vital.querySelector('.inv-vital-fill.hp') as HTMLElement | null;
    const mpFill = ui.vital.querySelector('.inv-vital-fill.mp') as HTMLElement | null;
    const texts = ui.vital.querySelectorAll('.inv-vital-text');
    if (hpFill && mpFill && texts.length >= 2) {
      hpFill.style.width = `${hpPct}%`;
      mpFill.style.width = `${mpPct}%`;
      texts[0]!.textContent = `${save.hp}/${stats.maxHp}`;
      texts[1]!.textContent = `${mp}/${maxMp}`;
    } else {
      ui.vital.innerHTML = `
      <div class="inv-vital-row">
        <span class="inv-vital-label">HP</span>
        <div class="inv-vital-bar"><div class="inv-vital-fill hp" style="width:${hpPct}%"></div><span class="inv-vital-text">${save.hp}/${stats.maxHp}</span></div>
      </div>
      <div class="inv-vital-row">
        <span class="inv-vital-label">MP</span>
        <div class="inv-vital-bar"><div class="inv-vital-fill mp" style="width:${mpPct}%"></div><span class="inv-vital-text">${mp}/${maxMp}</span></div>
      </div>`;
    }
  }
}

export async function renderInventory(): Promise<void> {
  const save = host.getSave();
  const stats = host.getStats();
  const items = host.getItems();
  if (!save) return;

  if (ui.search && ui.search.value !== searchQuery) ui.search.value = searchQuery;
  if (ui.searchClear) ui.searchClear.hidden = !searchQuery;

  const gs = totalGearScore(save, items);
  ui.adena.innerHTML = `<span class="inv-adena-coin">${formatAdenaLabel(save.adena ?? 0)}</span><span class="inv-adena-meta">${save.inventory.length} предм. · сила ${gs}</span>`;

  if (ui.hero) {
    const race = RACE_LABELS[save.race] ?? save.race;
    const prof = PROFESSION_LABELS[save.profession] ?? save.profession;
    ui.hero.textContent = `${save.name} · ур. ${save.level} · ${race} / ${prof}`;
  }

  const portraitUrl = host.getPortraitUrl?.();
  if (ui.portrait) {
    if (portraitUrl) {
      ui.portrait.src = portraitUrl;
      ui.portrait.classList.add('visible');
    } else {
      ui.portrait.removeAttribute('src');
      ui.portrait.classList.remove('visible');
    }
  }

  if (ui.equipFill) {
    ui.equipFill.innerHTML = '';
    const { filled, total } = equippedSlotCount(save);
    if (ui.equipSummary) {
      ui.equipSummary.textContent = `${filled}/${total} слотов`;
      ui.equipSummary.classList.toggle('inv-equip-full', filled >= total);
    }
    for (const slot of EQUIP_DOT_SLOTS) {
      if (slot === 'weapon2' && !hasMadDualist(save)) continue;
      if (slot === 'shield' && !canEquipShield(save.profession)) continue;
      if (slot === 'quiver' && !canEquipQuiver(save.profession)) continue;
      const itemId = save.equipment[slot];
      const item = itemId ? items.find((i) => i.id === itemId) : undefined;
      const dot = document.createElement('span');
      dot.className = `inv-equip-dot${item ? ` filled rarity-${item.rarity}` : ''}`;
      dot.title = item
        ? `${EQUIP_SLOT_LABELS[slot]}: ${item.name}`
        : `${EQUIP_SLOT_LABELS[slot]}: пусто`;
      ui.equipFill.appendChild(dot);
    }
  }

  if (ui.vital && stats) {
    const hpPct = Math.max(0, Math.min(100, (save.hp / Math.max(1, stats.maxHp)) * 100));
    const maxMp = stats.maxMp ?? save.maxMp ?? 0;
    const mp = save.mp ?? maxMp;
    const mpPct = maxMp > 0 ? Math.max(0, Math.min(100, (mp / maxMp) * 100)) : 0;
    ui.vital.innerHTML = `
      <div class="inv-vital-row">
        <span class="inv-vital-label">HP</span>
        <div class="inv-vital-bar"><div class="inv-vital-fill hp" style="width:${hpPct}%"></div><span class="inv-vital-text">${save.hp}/${stats.maxHp}</span></div>
      </div>
      <div class="inv-vital-row">
        <span class="inv-vital-label">MP</span>
        <div class="inv-vital-bar"><div class="inv-vital-fill mp" style="width:${mpPct}%"></div><span class="inv-vital-text">${mp}/${maxMp}</span></div>
      </div>`;
  } else if (ui.vital) {
    ui.vital.innerHTML = '';
  }

  ui.statsBar.innerHTML = '';
  if (stats) {
    const pills: [string, string | number | undefined][] = [
      [statLabel('pAtk'), stats.pAtk],
      [statLabel('pDef'), stats.pDef],
      [statLabel('mAtk'), stats.mAtk],
      [statLabel('mDef'), stats.mDef],
      [statLabel('accuracy'), stats.accuracy],
      [statLabel('evasion'), stats.evasion],
      [statLabel('critRate'), `${stats.critRate}%`],
      [statLabel('attackSpeed'), stats.attackSpeed],
      [statLabel('speed'), stats.speed],
    ];
    if (stats.carryWeightKg != null) {
      const parts = [
        stats.bodyWeightKg != null ? `тело ${stats.bodyWeightKg}` : null,
        stats.gearWeightKg != null ? `экип ${stats.gearWeightKg}` : null,
        stats.bagWeightKg != null ? `рюкзак ${stats.bagWeightKg}` : null,
      ].filter(Boolean);
      pills.push([
        'Вес',
        parts.length ? `${stats.carryWeightKg} (${parts.join(', ')})` : `${stats.carryWeightKg} кг`,
      ]);
    }
    for (const [label, val] of pills) {
      const pill = document.createElement('span');
      pill.className = 'inv-stat-pill';
      pill.innerHTML = `<span class="inv-stat-pill-label">${label}</span><span class="inv-stat-pill-value">${val}</span>`;
      ui.statsBar.appendChild(pill);
    }
  }

  renderDoll(save, items);
  renderToolbar();
  const entries = bagEntries(save);
  renderBag(save, items, entries);

  let selectedItem: ItemDefinition | null = null;
  if (selectedId) {
    const item = findItem(selectedId, items);
    if (item) {
      selectedItem = item;
      await loadPreviewIfNeeded(selectedId, item);
      renderDetail(item, save, items);
    } else {
      selectedId = null;
      preview = null;
      renderDetailEmpty();
    }
  } else {
    renderDetailEmpty();
  }
  updateDetailPanelAccent(selectedItem);
}

function findItem(id: string, items: ItemDefinition[]): ItemDefinition | undefined {
  return items.find((i) => i.id === id);
}

function itemIconUrl(item: ItemDefinition): string | undefined {
  return host.assetUrl(`item_${item.id}`) ?? (item.icon?.startsWith('/media') ? item.icon : undefined);
}

function createItemIcon(item: ItemDefinition, stack?: number, enchantLevel = 0): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = `inv-icon-wrap rarity-${item.rarity}`;
  const url = itemIconUrl(item);
  if (url) {
    const img = mediaIconElement(`item_${item.id}`, {
      url,
      alt: itemDisplayName(item, enchantLevel),
    });
    if (img instanceof HTMLImageElement) {
      img.onerror = () => {
        img.remove();
        wrap.appendChild(createIconFallback(item));
      };
    }
    wrap.appendChild(img);
  } else {
    wrap.appendChild(createIconFallback(item));
  }
  if (enchantLevel > 0) {
    const badge = document.createElement('span');
    badge.className = 'inv-enchant-badge';
    badge.textContent = `+${enchantLevel}`;
    wrap.appendChild(badge);
  }
  if (stack && stack > 1) {
    const badge = document.createElement('span');
    badge.className = 'inv-stack-badge';
    badge.textContent = `×${stack}`;
    wrap.appendChild(badge);
  }
  return wrap;
}

function createIconFallback(item: ItemDefinition): HTMLElement {
  const el = document.createElement('div');
  el.className = 'inv-icon-fallback';
  const icons: Record<string, string> = {
    weapon: 'Ор',
    weapon2: 'О2',
    shield: 'Щт',
    quiver: 'Кл',
    head: 'Шл',
    body: 'Бр',
    legs: 'Нг',
    gloves: 'Пр',
    cloak: 'Пл',
    material: 'Мт',
    consumable: 'Рс',
  };
  el.textContent = icons[item.slot] ?? '·';
  return el;
}

function formatItemStats(item: ItemDefinition, enchantLevel = 0, slot?: string): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(item.stats)) {
    if (val === 0) continue;
    if (key === 'blockChance' || key === 'critRate') {
      parts.push(`${val > 0 ? '+' : ''}${val}% ${STAT_LABELS[key] ?? key}`);
      continue;
    }
    parts.push(`${val > 0 ? '+' : ''}${val} ${STAT_LABELS[key] ?? key}`);
  }
  if (enchantLevel > 0 && slot) {
    const bonus = enchantBonusForSlot(slot, enchantLevel);
    if (bonus.pAtk) parts.push(`+${bonus.pAtk} ${statLabel('pAtk')} (заточка +${enchantLevel})`);
    if (bonus.pDef) parts.push(`+${bonus.pDef} ${statLabel('pDef')} (заточка +${enchantLevel})`);
    if (bonus.maxHp) parts.push(`+${bonus.maxHp} HP (заточка +${enchantLevel})`);
  }
  if (item.weaponWeight) {
    const w = { light: 'лёгкое', normal: 'среднее', heavy: 'тяжёлое' }[item.weaponWeight];
    if (w) parts.push(w);
  }
  if (item.attackRange && item.attackRange > 0) {
    parts.push(`дальность ${item.attackRange}`);
  }
  if (item.armorType) {
    const armorLabel =
      item.armorType === 'light' ? 'лёгкая броня' : item.armorType === 'heavy' ? 'тяжёлая броня' : 'роба';
    parts.push(armorLabel);
  }
  return parts.join(' · ');
}

function itemDisplayName(item: ItemDefinition, enchantLevel = 0): string {
  if (enchantLevel <= 0) return item.name;
  return `${item.name} +${enchantLevel}`;
}

function quickDelta(item: ItemDefinition, save: PlayerSave, items: ItemDefinition[]): string | null {
  if (item.slot === 'material' || item.slot === 'consumable') return null;
  const eqId = save.equipment[item.slot];
  if (!eqId) return 'новый слот';
  const eq = items.find((i) => i.id === eqId);
  if (!eq) return null;
  const pAtk = (item.stats.pAtk ?? 0) - (eq.stats.pAtk ?? 0);
  if (pAtk !== 0) return pAtk > 0 ? `+${pAtk} ${statLabel('pAtk')}` : `${pAtk} ${statLabel('pAtk')}`;
  const mAtk = (item.stats.mAtk ?? 0) - (eq.stats.mAtk ?? 0);
  if (mAtk !== 0) return mAtk > 0 ? `+${mAtk} ${statLabel('mAtk')}` : `${mAtk} ${statLabel('mAtk')}`;
  const pDef = (item.stats.pDef ?? 0) - (eq.stats.pDef ?? 0);
  if (pDef !== 0) return pDef > 0 ? `+${pDef} ${statLabel('pDef')}` : `${pDef} ${statLabel('pDef')}`;
  const mDef = (item.stats.mDef ?? 0) - (eq.stats.mDef ?? 0);
  if (mDef !== 0) return mDef > 0 ? `+${mDef} ${statLabel('mDef')}` : `${mDef} ${statLabel('mDef')}`;
  return null;
}

function deltaClass(key: string, val: number): string {
  if (val === 0) return 'neutral';
  const good = LOWER_IS_BETTER.has(key) ? val < 0 : val > 0;
  return good ? 'better' : 'worse';
}

function formatDelta(key: string, val: number): string {
  if (val === 0) return '±0';
  const sign = val > 0 ? '+' : '';
  if (key === 'attackDelayMs') return `${sign}${val} ms`;
  if (key === 'attackSpeed') return `${sign}${val}`;
  if (key === 'critRate') return `${sign}${val}%`;
  return `${sign}${val}`;
}

async function selectItem(id: string): Promise<void> {
  selectedId = id;
  preview = null;
  previewFor = null;
  await renderInventory();
  const card = ui.bagGrid.querySelector(`[data-item-id="${id}"]`);
  card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

async function loadPreviewIfNeeded(itemId: string, item: ItemDefinition): Promise<void> {
  const save = host.getSave();
  if (!save || item.slot === 'material' || item.slot === 'consumable' || !save.inventory.includes(itemId)) {
    preview = null;
    previewFor = null;
    return;
  }
  if (previewFor === itemId && preview) return;
  try {
    preview = await host.fetchPreview(itemId);
    previewFor = itemId;
  } catch {
    preview = null;
    previewFor = null;
  }
}

function renderDoll(save: PlayerSave, items: ItemDefinition[]): void {
  ui.doll.innerHTML = '';
  const layout: Array<{ slot: string; gridArea: string }> = [
    { slot: 'head', gridArea: 'head' },
    { slot: 'cloak', gridArea: 'cloak' },
    { slot: 'weapon', gridArea: 'weapon' },
    { slot: 'body', gridArea: 'body' },
    { slot: 'gloves', gridArea: 'gloves' },
    { slot: 'legs', gridArea: 'legs' },
  ];
  if (canEquipShield(save.profession)) {
    layout.splice(4, 0, { slot: 'shield', gridArea: 'shield' });
  }
  if (canEquipQuiver(save.profession)) {
    layout.splice(canEquipShield(save.profession) ? 5 : 4, 0, { slot: 'quiver', gridArea: 'quiver' });
  }
  if (hasMadDualist(save)) {
    layout.push({ slot: 'weapon2', gridArea: 'weapon2' });
  }

  const silhouette = document.createElement('div');
  silhouette.className = 'inv-doll-silhouette';
  silhouette.setAttribute('aria-hidden', 'true');
  ui.doll.appendChild(silhouette);

  const portraitUrl = host.getPortraitUrl?.();
  if (portraitUrl) {
    const face = document.createElement('img');
    face.className = 'inv-doll-portrait visible';
    face.src = portraitUrl;
    face.alt = '';
    ui.doll.appendChild(face);
  }

  for (const { slot, gridArea } of layout) {
    const itemId = save.equipment[slot] ?? null;
    const item = itemId ? items.find((i) => i.id === itemId) : undefined;
    const enchantLevel = getEquipmentEnchant(save.equipmentEnchants, slot);
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `inv-doll-slot${item ? ' filled' : ''}${item ? ` rarity-${item.rarity}` : ''}${selectedId === itemId ? ' selected' : ''}`;
    el.style.gridArea = gridArea;
    el.title = item
      ? buildItemTooltip(item, { equipped: true, enchantLevel, slot })
      : `${EQUIP_SLOT_LABELS[slot] ?? slot} · перетащи предмет сюда`;

    bindSlotDropTarget(el, slot, items);

    const label = document.createElement('span');
    label.className = 'inv-doll-slot-label';
    label.textContent = EQUIP_SLOT_LABELS[slot] ?? slot;
    el.appendChild(label);

    if (item) {
      el.appendChild(createItemIcon(item, undefined, enchantLevel));
      const name = document.createElement('span');
      name.className = 'inv-doll-slot-name';
      name.textContent = itemDisplayName(item, enchantLevel);
      el.appendChild(name);
      bindDragSource(el, { itemId: item.id, source: 'slot', slot }, true);
      el.onclick = () => {
        if (shouldSuppressClick()) return;
        void selectItem(item.id);
      };
      el.ondblclick = (ev) => {
        ev.preventDefault();
        void host.onUnequip(slot);
      };
    } else {
      const empty = document.createElement('span');
      empty.className = 'inv-doll-empty';
      empty.textContent = SLOT_EMPTY_GLYPH[slot] ?? '+';
      el.appendChild(empty);
      el.onclick = () => {
        selectedId = null;
        void renderInventory();
      };
    }

    ui.doll.appendChild(el);
  }
}

function renderDetailEmpty(): void {
  ui.detail.innerHTML = `
    <div class="inv-detail-empty">
      <div class="inv-detail-empty-icon">◇</div>
      <p>Выбери предмет в рюкзаке или слоте</p>
      <p class="inv-hint">Двойной клик — экипировать / снять</p>
      <p class="inv-hint">Перетащи предмет в слот или в рюкзак</p>
    </div>`;
}

function renderItemStatGrid(item: ItemDefinition, enchantLevel: number, slot: string): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'inv-stat-grid';
  for (const [key, val] of Object.entries(item.stats)) {
    if (val === 0) continue;
    const row = document.createElement('div');
    row.className = 'inv-stat-row';
    row.innerHTML = `<span>${STAT_LABELS[key] ?? key}</span><span>${val > 0 ? '+' : ''}${val}</span>`;
    grid.appendChild(row);
  }
  if (enchantLevel > 0) {
    const bonus = enchantBonusForSlot(slot, enchantLevel);
    for (const [key, val] of Object.entries(bonus)) {
      if (!val) continue;
      const row = document.createElement('div');
      row.className = 'inv-stat-row';
      row.innerHTML = `<span>${STAT_LABELS[key] ?? key} (заточка)</span><span>+${val}</span>`;
      grid.appendChild(row);
    }
  }
  const metaBits: string[] = [];
  if (item.weaponWeight) {
    const w = { light: 'лёгкое', normal: 'среднее', heavy: 'тяжёлое' }[item.weaponWeight];
    if (w) metaBits.push(w);
  }
  if (item.attackRange && item.attackRange > 0) metaBits.push(`дальность ${item.attackRange}`);
  if (item.armorType) {
    metaBits.push(
      item.armorType === 'light' ? 'лёгкая броня' : item.armorType === 'heavy' ? 'тяжёлая броня' : 'роба',
    );
  }
  if (metaBits.length) {
    const meta = document.createElement('div');
    meta.className = 'inv-stat-meta';
    meta.textContent = metaBits.join(' · ');
    grid.appendChild(meta);
  }
  if (!grid.childElementCount) {
    const empty = document.createElement('div');
    empty.className = 'inv-stat-meta';
    empty.textContent = 'Без бонусов';
    grid.appendChild(empty);
  }
  return grid;
}

function renderDetail(item: ItemDefinition, save: PlayerSave, items: ItemDefinition[]): void {
  ui.detail.innerHTML = '';

  const equippedSlot =
    Object.entries(save.equipment).find(([, id]) => id === item.id)?.[0] ?? null;
  const isEquipped = Boolean(equippedSlot);
  const inBag = save.inventory.includes(item.id);
  const enchantLevel = isEquipped && equippedSlot
    ? getEquipmentEnchant(save.equipmentEnchants, equippedSlot)
    : maxInventoryEnchantForItem(save.inventory, save.inventoryEnchants, item.id);

  const header = document.createElement('div');
  header.className = 'inv-detail-header';
  header.appendChild(createItemIcon(item, undefined, enchantLevel));
  const meta = document.createElement('div');
  const name = document.createElement('div');
  name.className = `inv-detail-name rarity-${item.rarity}`;
  name.textContent = itemDisplayName(item, enchantLevel);
  const gs = document.createElement('div');
  gs.className = 'inv-detail-gs';
  const score = Math.round(itemPowerScore(item));
  gs.innerHTML = `<span class="inv-gs-pill">сила ${score}</span>`;
  meta.appendChild(name);
  meta.appendChild(gs);
  const badges = document.createElement('div');
  badges.className = 'inv-card-badges';
  badges.innerHTML = `<span class="inv-badge rarity-${item.rarity}">${RARITY_LABELS[item.rarity] ?? item.rarity}</span>`;
  if (item.slot !== 'material') {
    badges.innerHTML += `<span class="inv-badge slot">${EQUIP_SLOT_LABELS[item.slot] ?? item.slot}</span>`;
  }
  if (enchantLevel > 0) {
    badges.innerHTML += `<span class="inv-badge enchant">+${enchantLevel}</span>`;
  }
  meta.appendChild(badges);
  header.appendChild(meta);
  ui.detail.appendChild(header);

  ui.detail.appendChild(renderItemStatGrid(item, enchantLevel, equippedSlot ?? item.slot));
  if (item.survival) {
    const survival = document.createElement('div');
    survival.className = 'inv-hint';
    const tags: string[] = [];
    const entry = save.inventoryEntries?.find((e) => e.itemId === item.id);
    if (item.survival.nutrition) tags.push(`сытость +${item.survival.nutrition}`);
    if (item.survival.hydration) tags.push(`вода +${item.survival.hydration}`);
    if (item.survival.warming) tags.push('согревает');
    if (item.survival.waterQuality === 'dirty') tags.push('риск инфекции');
    if (item.survival.rawFood) tags.push('риск отравления');
    if (item.survival.waterQuality) {
      const quality = entry?.waterQuality ?? item.survival.waterQuality;
      const labels: Record<string, string> = {
        dirty: 'грязная',
        filtered: 'фильтр.',
        boiled: 'кипячёная',
        clean: 'чистая',
      };
      tags.push(`вода: ${labels[quality] ?? quality}`);
    }
    if (entry?.temperature) {
      const tlabels = { hot: 'горячее', warm: 'тёплое', cold: 'холодное' } as const;
      tags.push(tlabels[entry.temperature]);
    }
    if (item.survival.shelfLifeHours) {
      if (typeof entry?.freshness === 'number') {
        tags.push(`свежесть: ${Math.round(entry.freshness)}%`);
      } else {
        const stamped = entry?.acquiredAt ?? save.survival?.freshnessAt?.[item.id];
        const ageHours = stamped ? Math.max(0, (Date.now() - Date.parse(stamped)) / 3_600_000) : 0;
        const freshness = Math.max(0, Math.round(100 - (ageHours / item.survival.shelfLifeHours) * 100));
        tags.push(`свежесть: ${freshness}%`);
      }
    }
    if (item.survival.tool) tags.push(`инструмент: ${item.survival.tool}`);
    survival.textContent = tags.join(' · ');
    if (tags.length) ui.detail.appendChild(survival);
  }

  if (preview && previewFor === item.id && inBag) {
    const comp = document.createElement('div');
    comp.className = 'inv-compare';
    comp.innerHTML = '<div class="inv-section-title">Сравнение при экипировке</div>';
    const list = document.createElement('div');
    list.className = 'inv-compare-list';
    for (const key of Object.keys(STAT_LABELS)) {
      const d = preview.delta[key as keyof EquipPreview['delta']];
      if (typeof d !== 'number' || d === 0) continue;
      const row = document.createElement('div');
      row.className = `inv-compare-row ${deltaClass(key, d)}`;
      const mag = Math.min(100, Math.abs(d) * (key === 'maxHp' || key === 'speed' ? 1.2 : 4));
      row.innerHTML = `<span>${STAT_LABELS[key]}</span><span>${formatDelta(key, d)}</span><div class="inv-compare-bar"><span style="width:${mag}%"></span></div>`;
      list.appendChild(row);
    }
    if (preview.replaces) {
      const rep = items.find((i) => i.id === preview!.replaces!);
      const note = document.createElement('div');
      note.className = 'inv-hint';
      note.textContent = rep ? `Заменит: ${rep.name}` : 'Заменит текущий предмет';
      comp.appendChild(note);
    }
    comp.appendChild(list);
    ui.detail.appendChild(comp);
  } else if (isEquipped) {
    const note = document.createElement('div');
    note.className = 'inv-equipped-tag';
    note.textContent = '✓ Экипировано';
    ui.detail.appendChild(note);
  }

  const actions = document.createElement('div');
  actions.className = 'inv-detail-actions';
  if (inBag && item.slot === 'consumable') {
    const btn = document.createElement('button');
    btn.className = 'inv-btn-primary';
    btn.textContent =
      item.id === 'resurrection_scroll' ? 'Воскресить союзника' : 'Использовать';
    btn.onclick = () => void host.onUseConsumable?.(item.id);
    actions.appendChild(btn);
    const recipes: Record<string, { id: string; label: string } | undefined> = {
      dirty_water: { id: 'filter_water', label: 'Фильтровать воду' },
      filtered_water: { id: 'boil_water', label: 'Вскипятить у огня' },
      raw_meat: { id: 'cook_meat', label: 'Приготовить у огня' },
      raw_fish: { id: 'cook_fish', label: 'Пожарить у огня' },
      cooked_meat: { id: 'dry_meat', label: 'Высушить у огня' },
      cooked_fish: { id: 'dry_fish', label: 'Высушить у огня' },
    };
    const recipe = recipes[item.id];
    if (recipe) {
      const process = document.createElement('button');
      process.className = 'inv-btn-secondary';
      process.textContent = recipe.label;
      process.onclick = () => void host.onSurvivalProcess?.(recipe.id);
      actions.appendChild(process);
    }
  } else if (inBag && (item.id === 'camp_fuel' || item.id === 'firestarter')) {
    if (item.id === 'camp_fuel') {
      const fire = document.createElement('button');
      fire.className = 'inv-btn-primary';
      fire.textContent = 'Разжечь / согреться у огня';
      fire.onclick = () => void host.onSurvivalProcess?.('light_fire');
      actions.appendChild(fire);
    }
    const stabilize = document.createElement('button');
    stabilize.className = 'inv-btn-secondary';
    stabilize.textContent = 'Согреться у очага';
    stabilize.onclick = () => void host.onSurvivalProcess?.('stabilize_camp');
    actions.appendChild(stabilize);
  } else if (inBag && item.slot !== 'material' && item.slot !== 'consumable') {
    if (item.slot === 'shield' && !canEquipShield(save.profession)) {
      const note = document.createElement('div');
      note.className = 'inv-hint';
      note.textContent = 'Щит может надеть только воин';
      ui.detail.appendChild(note);
    } else if (item.slot === 'quiver' && !canEquipQuiver(save.profession)) {
      const note = document.createElement('div');
      note.className = 'inv-hint';
      note.textContent = 'Стрелы может надеть только лучник';
      ui.detail.appendChild(note);
    } else if (item.slot === 'weapon' && item.weaponKind === 'bow' && !canEquipBow(save.profession)) {
      const note = document.createElement('div');
      note.className = 'inv-hint';
      note.textContent = 'Лук может надеть только лучник';
      ui.detail.appendChild(note);
    } else if (item.slot === 'weapon' && item.weaponKind === 'staff' && !canEquipStaff(save.profession)) {
      const note = document.createElement('div');
      note.className = 'inv-hint';
      note.textContent = 'Посох может надеть только мистик';
      ui.detail.appendChild(note);
    } else if (
      ['head', 'body', 'legs', 'gloves'].includes(item.slot) &&
      item.armorType &&
      !canEquipArmorType(save.profession, item.armorType)
    ) {
      const note = document.createElement('div');
      note.className = 'inv-hint';
      note.textContent =
        item.armorType === 'robe'
          ? 'Робу может надеть только мистик'
          : 'Мистик носит только робу';
      ui.detail.appendChild(note);
    } else {
      const btn = document.createElement('button');
      btn.className = 'inv-btn-primary';
      btn.textContent = 'Экипировать';
      btn.onclick = () => void host.onEquip(item.id);
      actions.appendChild(btn);
    }
    if (
      item.slot === 'weapon' &&
      item.weaponKind !== 'bow' &&
      item.weaponKind !== 'staff' &&
      item.weaponWeight === 'light' &&
      hasMadDualist(save) &&
      save.equipment.weapon
    ) {
      const main = findItem(save.equipment.weapon, host.getItems());
      if (
        main?.weaponWeight === 'light' &&
        main.weaponKind !== 'bow' &&
        main.weaponKind !== 'staff'
      ) {
        const btn2 = document.createElement('button');
        btn2.className = 'inv-btn-secondary';
        btn2.textContent = 'Во 2-й клинок';
        btn2.onclick = () => void host.onEquip(item.id, 'weapon2');
        actions.appendChild(btn2);
      }
    }
  }
  if (isEquipped && equippedSlot) {
    const btn = document.createElement('button');
    btn.className = 'inv-btn-secondary';
    btn.textContent = 'Снять';
    btn.onclick = () => void host.onUnequip(equippedSlot);
    actions.appendChild(btn);
  }
  if (actions.childElementCount) ui.detail.appendChild(actions);
}

function renderToolbar(): void {
  ui.toolbar.innerHTML = '';
  const filters: Array<{ id: InvFilter; label: string }> = [
    { id: 'all', label: 'Все' },
    { id: 'gear', label: 'Снаряжение' },
    { id: 'material', label: 'Материалы' },
  ];
  const sorts: Array<{ id: InvSort; label: string }> = [
    { id: 'slot', label: 'Слот' },
    { id: 'rarity', label: 'Редкость' },
    { id: 'name', label: 'Имя' },
  ];
  const rarities: Array<{ id: InvRarityFilter; label: string }> = [
    { id: 'all', label: '★' },
    { id: 'uncommon', label: 'N' },
    { id: 'rare', label: 'R' },
    { id: 'epic', label: 'E' },
    { id: 'legendary', label: 'L' },
    { id: 'daedric', label: 'D' },
    { id: 'holy', label: 'S' },
  ];

  const fg = document.createElement('div');
  fg.className = 'inv-toolbar-group';
  for (const f of filters) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `inv-toolbar-btn${filter === f.id ? ' active' : ''}`;
    b.dataset.invFilter = f.id;
    b.textContent = f.label;
    fg.appendChild(b);
  }
  ui.toolbar.appendChild(fg);

  const rg = document.createElement('div');
  rg.className = 'inv-toolbar-group';
  rg.title = 'Фильтр по редкости';
  for (const r of rarities) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `inv-toolbar-btn${rarityFilter === r.id ? ' active' : ''}${r.id !== 'all' ? ` rarity-${r.id}` : ''}`;
    b.dataset.invRarity = r.id;
    b.textContent = r.label;
    b.title =
      r.id === 'all'
        ? 'Все редкости'
        : (RARITY_LABELS[r.id] ?? r.id);
    rg.appendChild(b);
  }
  ui.toolbar.appendChild(rg);

  const sg = document.createElement('div');
  sg.className = 'inv-toolbar-group';
  for (const s of sorts) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `inv-toolbar-btn${sort === s.id ? ' active' : ''}`;
    b.dataset.invSort = s.id;
    b.textContent = s.label;
    sg.appendChild(b);
  }
  ui.toolbar.appendChild(sg);
}

function bagEntries(save: PlayerSave): Array<{ id: string; count: number }> {
  const stacks = new Map<string, number>();
  for (const itemId of save.inventory) {
    stacks.set(itemId, (stacks.get(itemId) ?? 0) + 1);
  }
  let entries = [...stacks.entries()].map(([id, count]) => ({ id, count }));

  if (filter === 'gear')
    entries = entries.filter(({ id }) => {
      const slot = host.getItems().find((i) => i.id === id)?.slot;
      return slot !== 'material' && slot !== 'consumable';
    });
  if (filter === 'material')
    entries = entries.filter(({ id }) => host.getItems().find((i) => i.id === id)?.slot === 'material');
  if (rarityFilter !== 'all') {
    entries = entries.filter(({ id }) => host.getItems().find((i) => i.id === id)?.rarity === rarityFilter);
  }
  if (searchQuery) {
    entries = entries.filter(({ id }) => {
      const item = host.getItems().find((i) => i.id === id);
      if (!item) return false;
      return (
        item.name.toLowerCase().includes(searchQuery) ||
        item.id.toLowerCase().includes(searchQuery) ||
        (RARITY_LABELS[item.rarity] ?? '').includes(searchQuery)
      );
    });
  }

  entries.sort((a, b) => {
    const ia = host.getItems().find((i) => i.id === a.id);
    const ib = host.getItems().find((i) => i.id === b.id);
    if (!ia || !ib) return 0;
    if (sort === 'name') return ia.name.localeCompare(ib.name, 'ru');
    if (sort === 'rarity') return (RARITY_ORDER[ib.rarity] ?? 0) - (RARITY_ORDER[ia.rarity] ?? 0);
    return (SLOT_ORDER[ia.slot] ?? 9) - (SLOT_ORDER[ib.slot] ?? 9) || ia.name.localeCompare(ib.name, 'ru');
  });

  return entries;
}

function renderBag(
  save: PlayerSave,
  items: ItemDefinition[],
  entries: Array<{ id: string; count: number }>,
): void {
  ui.bagGrid.innerHTML = '';

  if (ui.bagCount) ui.bagCount.textContent = bagCountLabel(save, entries);

  const upgrades = countBagUpgrades(save, items);
  if (ui.bagUpgrades) {
    ui.bagUpgrades.textContent = upgrades > 0 ? `↑ ${upgrades}` : '';
    ui.bagUpgrades.hidden = upgrades <= 0;
    ui.bagUpgrades.title = upgrades > 0 ? 'Предметы лучше экипировки' : '';
  }

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'inv-empty-bag';
    empty.textContent = emptyBagMessage();
    ui.bagGrid.appendChild(empty);
    return;
  }

  for (const { id, count } of entries) {
    const item = items.find((i) => i.id === id);
    if (!item) continue;

    const enchantLevel = maxInventoryEnchantForItem(save.inventory, save.inventoryEnchants, id);
    const card = document.createElement('button');
    card.type = 'button';
    const upgrade = bagUpgradeKind(item, save, items);
    card.className = `inv-bag-card rarity-${item.rarity}${item.slot === 'material' ? ' material' : ''}${selectedId === id ? ' selected' : ''}${upgrade === 'upgrade' ? ' has-upgrade' : ''}${upgrade === 'sidegrade' ? ' has-downgrade' : ''}`;
    card.dataset.itemId = id;
    card.title = buildItemTooltip(item, { stack: count, enchantLevel, slot: item.slot });

    card.appendChild(createItemIcon(item, count, enchantLevel));

    if (upgrade) {
      const badge = document.createElement('span');
      badge.className = `inv-upgrade-badge${upgrade === 'sidegrade' ? ' down' : ''}`;
      badge.textContent = upgrade === 'upgrade' ? '↑' : '↓';
      card.appendChild(badge);
    }

    const name = document.createElement('div');
    name.className = 'inv-bag-name';
    name.textContent = itemDisplayName(item, enchantLevel);
    card.appendChild(name);

    if (item.slot !== 'material') {
      const slotBadge = document.createElement('span');
      slotBadge.className = 'inv-bag-slot';
      slotBadge.textContent = EQUIP_SLOT_LABELS[item.slot] ?? item.slot;
      card.appendChild(slotBadge);
    }

    const delta = quickDelta(item, save, items);
    if (delta) {
      const d = document.createElement('div');
      d.className = `inv-bag-delta${delta.startsWith('+') || delta === 'новый слот' ? ' better' : delta.startsWith('-') ? ' worse' : ''}`;
      d.textContent = delta;
      card.appendChild(d);
    }

    card.onclick = () => {
      if (shouldSuppressClick()) return;
      void selectItem(id);
    };
    if (item.slot !== 'material') {
      bindDragSource(card, { itemId: id, source: 'bag' }, true);
      card.ondblclick = (ev) => {
        ev.preventDefault();
        void host.onEquip(id);
      };
    }

    ui.bagGrid.appendChild(card);
  }
}

export function clearInventorySelection(): void {
  selectedId = null;
  preview = null;
  previewFor = null;
}

export function invalidateInventoryPreview(): void {
  preview = null;
  previewFor = null;
}
