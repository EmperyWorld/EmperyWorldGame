import type { PlayerSave, SkillDefinition } from './api.js';
import {
  skillCooldownProgress,
  skillCooldownSec,
} from './skill-cooldown.js';

export { skillCooldownSec, syncSkillCooldownsFromSave, hasAnySkillCooldown, skillCooldownProgress } from './skill-cooldown.js';

export type SkillsPanelFilter = 'all' | 'active' | 'passive' | 'learned';
export type SkillsViewMode = 'list' | 'tree';
export type SkillsDomain = 'combat' | 'survival' | 'craft';

import { SKILL_HOTBAR_SIZE } from '@empery/shared';
import { appendMediaIcon } from './hud-atlas.js';
import { STAT_LABELS, statLabel } from './stat-labels.js';

export { SKILL_HOTBAR_SIZE };

function skillDomainOf(skill: SkillDefinition): SkillsDomain {
  return skill.domain === 'survival' || skill.domain === 'craft' ? skill.domain : 'combat';
}

export interface SkillsHost {
  getSave: () => PlayerSave | null;
  getSkills: () => SkillDefinition[];
  getHotbar: () => (string | null)[];
  assetUrl: (assetId: string) => string | undefined;
  onHotbarChange: (slots: (string | null)[]) => Promise<void>;
  onClose?: () => void;
}

interface SkillsUi {
  root: HTMLElement;
  panel: HTMLElement;
  profession: HTMLElement;
  hotbar: HTMLElement;
  statsBar: HTMLElement;
  toolbar: HTMLElement;
  search: HTMLInputElement | null;
  searchClear: HTMLButtonElement | null;
  body: HTMLElement;
  grid: HTMLElement;
  tree: HTMLElement;
  detail: HTMLElement;
  detailPanel: HTMLElement;
  footerHint: HTMLElement | null;
  close: HTMLButtonElement | null;
}

const PROFESSION_LABELS: Record<string, string> = {
  warrior: 'Воин',
  rogue: 'Разбойник',
  mystic: 'Мистик',
  archer: 'Лучник',
  support: 'Саппорт',
};

const DOMAIN_LABELS: Record<SkillsDomain, string> = {
  combat: 'Бой',
  survival: 'Выживание',
  craft: 'Крафт',
};

let host: SkillsHost;
let ui: SkillsUi;
let selectedId: string | null = null;
let filter: SkillsPanelFilter = 'all';
let viewMode: SkillsViewMode = 'list';
let domain: SkillsDomain = 'combat';
let searchQuery = '';

export function mountSkills(root: HTMLElement, nextHost: SkillsHost): void {
  host = nextHost;
  ui = {
    root,
    panel: root.querySelector('#skills-panel')!,
    profession: root.querySelector('#skills-profession')!,
    hotbar: root.querySelector('#skills-hotbar')!,
    statsBar: root.querySelector('#skills-stats-bar')!,
    toolbar: root.querySelector('#skills-toolbar')!,
    search: root.querySelector('#skills-search') as HTMLInputElement | null,
    searchClear: root.querySelector('#skills-search-clear') as HTMLButtonElement | null,
    body: root.querySelector('#skills-body')!,
    grid: root.querySelector('#skills-grid')!,
    tree: root.querySelector('#skills-tree')!,
    detail: root.querySelector('#skills-detail')!,
    detailPanel: root.querySelector('.skills-panel-detail')!,
    footerHint: root.querySelector('.skills-footer-hint'),
    close: root.querySelector('#skills-close') as HTMLButtonElement | null,
  };

  ui.close?.addEventListener('click', () => {
    root.classList.remove('visible');
    host.onClose?.();
  });

  root.addEventListener('click', (e) => {
    if (e.target === root) {
      root.classList.remove('visible');
      host.onClose?.();
    }
  });

  ui.toolbar.addEventListener('click', (e) => {
    const domainBtn = (e.target as HTMLElement).closest('[data-skills-domain]') as HTMLElement | null;
    if (domainBtn?.dataset.skillsDomain) {
      domain = domainBtn.dataset.skillsDomain as SkillsDomain;
      selectedId = null;
      renderSkillsPanel();
      return;
    }
    const filterBtn = (e.target as HTMLElement).closest('[data-skills-filter]') as HTMLElement | null;
    if (filterBtn?.dataset.skillsFilter) {
      filter = filterBtn.dataset.skillsFilter as SkillsPanelFilter;
      renderSkillsPanel();
      return;
    }
    const viewBtn = (e.target as HTMLElement).closest('[data-skills-view]') as HTMLElement | null;
    if (viewBtn?.dataset.skillsView) {
      viewMode = viewBtn.dataset.skillsView as SkillsViewMode;
      renderSkillsPanel();
    }
  });

  ui.search?.addEventListener('input', () => {
    searchQuery = ui.search!.value.trim().toLowerCase();
    if (ui.searchClear) ui.searchClear.hidden = !searchQuery;
    renderSkillsPanel();
  });

  ui.searchClear?.addEventListener('click', () => {
    searchQuery = '';
    if (ui.search) ui.search.value = '';
    if (ui.searchClear) ui.searchClear.hidden = true;
    ui.search?.focus();
    renderSkillsPanel();
  });

  ui.grid.addEventListener('click', (e) => {
    const card = (e.target as HTMLElement).closest('[data-skill-id]') as HTMLElement | null;
    if (!card?.dataset.skillId) return;
    selectSkill(card.dataset.skillId);
  });

  ui.tree.addEventListener('click', (e) => {
    const node = (e.target as HTMLElement).closest('[data-skill-id]') as HTMLElement | null;
    if (!node?.dataset.skillId) return;
    selectSkill(node.dataset.skillId);
  });

  ui.hotbar.addEventListener('click', (e) => {
    const slotEl = (e.target as HTMLElement).closest('[data-hotbar-slot]') as HTMLElement | null;
    if (!slotEl) return;
    const idx = Number(slotEl.dataset.hotbarSlot);
    if (!Number.isFinite(idx)) return;
    const skillId = host.getHotbar()[idx];
    if (skillId) selectSkill(skillId);
  });

  ui.detail.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-hotbar-assign]') as HTMLElement | null;
    if (!btn) return;
    const slot = Number(btn.dataset.hotbarAssign);
    const skillId = btn.dataset.skillId ?? null;
    if (!Number.isFinite(slot) || !skillId) return;
    void assignHotbar(slot, skillId);
  });

  ui.detail.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-hotbar-clear]') as HTMLElement | null;
    if (!btn) return;
    const slot = Number(btn.dataset.hotbarClear);
    if (!Number.isFinite(slot)) return;
    void clearHotbarSlot(slot);
  });
}

export function isSkillsOpen(): boolean {
  return ui?.root.classList.contains('visible') ?? false;
}

export function focusSkillsSearch(): void {
  ui.search?.focus();
  ui.search?.select();
}

export function clearSkillsSearch(): boolean {
  if (!searchQuery) return false;
  searchQuery = '';
  if (ui.search) ui.search.value = '';
  if (ui.searchClear) ui.searchClear.hidden = true;
  ui.search?.blur();
  renderSkillsPanel();
  return true;
}

export function isSkillsSearchFocused(): boolean {
  return document.activeElement === ui?.search;
}

function skillAssetId(skillId: string): string {
  return `skill_${skillId}`;
}

function skillIconUrl(skillId: string): string | undefined {
  return host.assetUrl(skillAssetId(skillId));
}

function createSkillIcon(skill: SkillDefinition, slotNum?: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'skill-icon-wrap';
  const url = skillIconUrl(skill.id);
  if (url) {
    appendMediaIcon(wrap, skillAssetId(skill.id), {
      url,
      alt: skill.name,
      onError: () => {
        wrap.appendChild(createSkillFallback(skill));
      },
    });
  } else {
    wrap.appendChild(createSkillFallback(skill));
  }
  if (slotNum !== undefined) {
    const badge = document.createElement('span');
    badge.className = 'skill-slot-badge';
    badge.textContent = String(slotNum);
    wrap.appendChild(badge);
  }
  return wrap;
}

function createSkillFallback(skill: SkillDefinition): HTMLElement {
  const el = document.createElement('div');
  el.className = 'skill-icon-fallback';
  el.textContent = skill.type === 'active' ? '⚡' : '◆';
  return el;
}

export function skillEffectText(skill: SkillDefinition, lvl: number): string {
  if (lvl <= 0) return '';
  const parts: string[] = [];
  if (skill.effects) {
    for (const [key, values] of Object.entries(skill.effects)) {
      const val = values[Math.min(lvl, values.length) - 1];
      if (val !== undefined) parts.push(`${STAT_LABELS[key] ?? key} +${val}`);
    }
  }
  if (skill.type === 'active' && skill.levels?.[lvl]) {
    const lv = skill.levels[lvl];
    if (lv.damageMultiplier) parts.push(`×${lv.damageMultiplier} урон`);
    if (lv.healFlat || lv.healMAtkScale) {
      const flat = lv.healFlat ?? 0;
      const scale = lv.healMAtkScale ?? 0;
      parts.push(`лечение ${flat}${scale ? `+${scale}×${statLabel('mAtk')}` : ''}`);
    }
    if (lv.mpFlat || lv.mpMAtkScale) {
      const flat = lv.mpFlat ?? 0;
      const scale = lv.mpMAtkScale ?? 0;
      parts.push(`MP ${flat}${scale ? `+${scale}×${statLabel('mAtk')}` : ''}`);
    }
    if (lv.buffAmount && skill.buffStat) {
      parts.push(`${statLabel(skill.buffStat)} +${lv.buffAmount}`);
    }
    if (lv.buffPAtk) parts.push(`${statLabel('pAtk')} +${lv.buffPAtk}`);
    if (lv.buffPDef) parts.push(`${statLabel('pDef')} +${lv.buffPDef}`);
    if (lv.buffMDef) parts.push(`${statLabel('mDef')} +${lv.buffMDef}`);
    if (lv.buffDurationMs) {
      const ms = lv.buffDurationMs;
      parts.push(ms >= 60_000 ? `${Math.round(ms / 60_000)} мин` : `${Math.round(ms / 1000)}с`);
    }
    if (lv.critBonus) parts.push(`+${lv.critBonus}% крит`);
    if (lv.accuracyBonus) parts.push(`+${lv.accuracyBonus} точн.`);
    if (lv.armorPenetration) parts.push(`${Math.round(lv.armorPenetration * 100)}% пробитие`);
    if (lv.mpCost) parts.push(`${lv.mpCost} MP`);
  }
  if (skill.effect === 'balance') parts.push('баланс HP');
  if (skill.targetMode === 'ally') parts.push('союзник');
  if (skill.targetMode === 'party') parts.push('пати');
  if (skill.cooldownMs && lvl > 0) parts.push(`CD ${Math.round(skill.cooldownMs / 1000)}с`);
  return parts.join(' · ');
}

function skillEffectLines(skill: SkillDefinition, lvl: number): string[] {
  const text = skillEffectText(skill, lvl);
  return text ? text.split(' · ') : [];
}

function unlockTier(skill: SkillDefinition): number {
  return skill.unlockLevel && skill.unlockLevel > 0 ? skill.unlockLevel : 1;
}

function isLocked(skill: SkillDefinition, save: PlayerSave): boolean {
  const lvl = skill.level ?? 0;
  if (lvl > 0) return false;
  return Boolean(skill.unlockLevel && skill.unlockLevel > save.level);
}

function filteredSkills(skills: SkillDefinition[]): SkillDefinition[] {
  let list = skills.filter((s) => skillDomainOf(s) === domain);
  if (filter === 'active') list = list.filter((s) => s.type === 'active');
  if (filter === 'passive') list = list.filter((s) => s.type === 'passive');
  if (filter === 'learned') list = list.filter((s) => (s.level ?? 0) > 0);
  if (searchQuery) {
    const q = searchQuery;
    list = list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q),
    );
  }
  return list.sort((a, b) => {
    const la = (a.level ?? 0) > 0 ? 0 : 1;
    const lb = (b.level ?? 0) > 0 ? 0 : 1;
    if (la !== lb) return la - lb;
    if (a.type !== b.type) return a.type === 'active' ? -1 : 1;
    return unlockTier(a) - unlockTier(b);
  });
}

function emptyMessage(): string {
  if (searchQuery) return `Ничего не найдено: «${searchQuery}»`;
  if (filter === 'learned') return `Пока нет изученных навыков (${DOMAIN_LABELS[domain].toLowerCase()})`;
  if (filter === 'active') return 'Нет активных навыков в этой группе';
  if (filter === 'passive') return 'Нет пассивных навыков в этой группе';
  if (domain === 'survival') return 'Навыки выживания ещё не открыты';
  if (domain === 'craft') return 'Навыки крафта ещё не открыты';
  return 'Навыки не загружены';
}

function selectSkill(id: string): void {
  selectedId = id;
  renderSkillsPanel();
}

async function assignHotbar(slot: number, skillId: string): Promise<void> {
  const skills = host.getSkills();
  const skill = skills.find((s) => s.id === skillId);
  if (
    !skill ||
    skillDomainOf(skill) !== 'combat' ||
    skill.type !== 'active' ||
    (skill.level ?? 0) <= 0
  ) {
    return;
  }

  const next: (string | null)[] = Array.from({ length: SKILL_HOTBAR_SIZE }, (_, i) => host.getHotbar()[i] ?? null);
  for (let i = 0; i < next.length; i++) {
    if (i !== slot && next[i] === skillId) next[i] = null;
  }
  if (next[slot] === skillId) {
    next[slot] = null;
  } else {
    next[slot] = skillId;
  }
  await host.onHotbarChange(next);
  renderSkillsPanel();
}

async function clearHotbarSlot(slot: number): Promise<void> {
  const next: (string | null)[] = Array.from({ length: SKILL_HOTBAR_SIZE }, (_, i) => host.getHotbar()[i] ?? null);
  next[slot] = null;
  await host.onHotbarChange(next);
  renderSkillsPanel();
}

function renderHotbar(skills: SkillDefinition[]): void {
  ui.hotbar.innerHTML = '';
  const label = document.createElement('span');
  label.className = 'skills-hotbar-label';
  label.textContent = 'Панель';
  ui.hotbar.appendChild(label);

  const slotsWrap = document.createElement('div');
  slotsWrap.className = 'skills-hotbar-slots';
  const hotbar = host.getHotbar();

  for (let i = 0; i < SKILL_HOTBAR_SIZE; i++) {
    const skillId = hotbar[i];
    const skill = skillId ? skills.find((s) => s.id === skillId) : undefined;
    const cd = skill ? skillCooldownSec(skill) : 0;
    const progress = skill ? skillCooldownProgress(skill) : 0;
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = `skills-hotbar-slot${skill ? ' filled' : ' empty'}${cd > 0 ? ' on-cd' : ''}${skill?.targetMode === 'ally' || skill?.targetMode === 'party' ? ' ally' : ''}${skill?.targetMode === 'party' ? ' party' : ''}${selectedId && skillId === selectedId ? ' selected' : ''}`;
    slot.dataset.hotbarSlot = String(i);
    if (cd > 0) slot.style.setProperty('--cd-progress', progress.toFixed(3));
    if (skill) {
      const allyHint =
        skill.targetMode === 'party'
          ? ' · пати в радиусе'
          : skill.targetMode === 'ally'
            ? ' · союзник/себя (таргет пати)'
            : '';
      slot.title = `${skill.name}${allyHint} — клик: детали · снять в панели справа`;
      slot.appendChild(createSkillIcon(skill, i + 1));
      if (skill.targetMode === 'ally' || skill.targetMode === 'party') {
        const tag = document.createElement('span');
        tag.className = 'hud-hotbar-ally';
        tag.textContent = skill.targetMode === 'party' ? 'P' : '+';
        slot.appendChild(tag);
      }
      if (cd > 0) {
        const cdLabel = document.createElement('span');
        cdLabel.className = 'hud-hotbar-cd';
        cdLabel.textContent = `${cd}`;
        slot.appendChild(cdLabel);
      }
    } else {
      slot.textContent = `[${i + 1}]`;
      slot.title = 'Пустой слот — выбери активный навык и назначь справа';
    }
    slotsWrap.appendChild(slot);
  }
  ui.hotbar.appendChild(slotsWrap);

  const hint = document.createElement('span');
  hint.className = 'skills-hotbar-hint';
  hint.textContent = 'Союз (+) / пати (P) — на таргет или группу в радиусе';
  ui.hotbar.appendChild(hint);
}

function renderStatsBar(skills: SkillDefinition[]): void {
  const learned = skills.filter((s) => (s.level ?? 0) > 0);
  const actives = learned.filter((s) => s.type === 'active');
  const passives = learned.filter((s) => s.type === 'passive');
  const onBar = host.getHotbar().filter(Boolean).length;

  ui.statsBar.innerHTML = '';
  const pills: Array<[string, string | number]> = [
    ['Изучено', `${learned.length}/${skills.length}`],
    ['Активные', actives.length],
    ['Пассивные', passives.length],
    ['На панели', onBar],
  ];
  for (const [label, val] of pills) {
    const pill = document.createElement('span');
    pill.className = 'skills-stat-pill';
    pill.innerHTML = `<span class="skills-stat-pill-label">${label}</span><span class="skills-stat-pill-value">${val}</span>`;
    ui.statsBar.appendChild(pill);
  }
}

function renderToolbar(): void {
  ui.toolbar.innerHTML = '';

  const domainGroup = document.createElement('div');
  domainGroup.className = 'skills-toolbar-group skills-domain-group';
  for (const d of [
    { id: 'combat' as const, label: 'Бой' },
    { id: 'survival' as const, label: 'Выживание' },
    { id: 'craft' as const, label: 'Крафт' },
  ]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `skills-toolbar-btn domain-btn${domain === d.id ? ' active' : ''}`;
    btn.dataset.skillsDomain = d.id;
    btn.textContent = d.label;
    domainGroup.appendChild(btn);
  }
  ui.toolbar.appendChild(domainGroup);

  const filters: Array<{ id: SkillsPanelFilter; label: string; cls?: string }> = [
    { id: 'all', label: 'Все' },
    { id: 'learned', label: 'Изученные' },
    { id: 'active', label: 'Активные', cls: 'type-active' },
    { id: 'passive', label: 'Пассивные', cls: 'type-passive' },
  ];
  const filterGroup = document.createElement('div');
  filterGroup.className = 'skills-toolbar-group';
  for (const f of filters) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `skills-toolbar-btn${filter === f.id ? ' active' : ''}${f.cls ? ` ${f.cls}` : ''}`;
    btn.dataset.skillsFilter = f.id;
    btn.textContent = f.label;
    filterGroup.appendChild(btn);
  }
  ui.toolbar.appendChild(filterGroup);

  const viewGroup = document.createElement('div');
  viewGroup.className = 'skills-toolbar-group';
  for (const v of [
    { id: 'list' as const, label: 'Список' },
    { id: 'tree' as const, label: 'Дерево' },
  ]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `skills-toolbar-btn view-btn${viewMode === v.id ? ' active' : ''}`;
    btn.dataset.skillsView = v.id;
    btn.textContent = v.label;
    viewGroup.appendChild(btn);
  }
  ui.toolbar.appendChild(viewGroup);
}

function renderLevelPips(skill: SkillDefinition, lvl: number): HTMLElement {
  const row = document.createElement('div');
  row.className = 'skill-level-row';
  const pips = document.createElement('div');
  pips.className = 'skill-level-pips';
  for (let i = 1; i <= skill.maxLevel; i++) {
    const pip = document.createElement('div');
    pip.className = `skill-pip${i <= lvl ? ' filled' : ''}`;
    pips.appendChild(pip);
  }
  row.appendChild(pips);
  return row;
}

function renderList(skills: SkillDefinition[], save: PlayerSave): void {
  ui.grid.innerHTML = '';
  const sorted = filteredSkills(skills);
  if (sorted.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'skills-empty';
    empty.textContent = emptyMessage();
    ui.grid.appendChild(empty);
    return;
  }

  const hotbar = host.getHotbar();
  for (const skill of sorted) {
    const lvl = skill.level ?? 0;
    const cd = skillCooldownSec(skill);
    const locked = isLocked(skill, save);
    const slotIdx = hotbar.indexOf(skill.id);
    const card = document.createElement('article');
    card.className = `skill-card type-${skill.type}`;
    if (lvl > 0) card.classList.add('learned');
    if (locked || (lvl <= 0 && !skill.unlockLevel)) card.classList.add('locked');
    if (slotIdx >= 0) card.classList.add('active-slot');
    if (cd > 0) card.classList.add('on-cooldown');
    if (selectedId === skill.id) card.classList.add('selected');
    card.dataset.skillId = skill.id;

    const top = document.createElement('div');
    top.className = 'skill-card-top';
    top.appendChild(createSkillIcon(skill, slotIdx >= 0 ? slotIdx + 1 : undefined));

    const meta = document.createElement('div');
    meta.className = 'skill-meta';
    meta.innerHTML = `<div class="skill-name">${skill.name}</div>`;
    const badges = document.createElement('div');
    badges.className = 'skill-badges';
    badges.innerHTML = `<span class="skill-badge type-${skill.type}">${skill.type === 'active' ? 'актив' : 'пасс'}</span>`;
    if (skill.targetMode === 'ally') badges.innerHTML += `<span class="skill-badge ally">союз</span>`;
    if (skill.targetMode === 'party') badges.innerHTML += `<span class="skill-badge ally party">пати</span>`;
    if (skill.requiresShield) badges.innerHTML += `<span class="skill-badge shield">щит</span>`;
    if (slotIdx >= 0) badges.innerHTML += `<span class="skill-badge hotbar">[${slotIdx + 1}]</span>`;
    if (cd > 0) badges.innerHTML += `<span class="skill-badge cd">${cd}с</span>`;
    if (locked) badges.innerHTML += `<span class="skill-badge unlock">lvl ${skill.unlockLevel}</span>`;
    else if (lvl <= 0) badges.innerHTML += `<span class="skill-badge unlock">не изучен</span>`;
    meta.appendChild(badges);
    top.appendChild(meta);
    card.appendChild(top);

    const desc = document.createElement('div');
    desc.className = 'skill-desc';
    desc.textContent = skill.description;
    card.appendChild(desc);

    const fx = skillEffectText(skill, Math.max(lvl, 1));
    if (fx && (lvl > 0 || !locked)) {
      const effects = document.createElement('div');
      effects.className = 'skill-effects';
      effects.textContent = lvl > 0 ? fx : `на 1 ур.: ${fx}`;
      card.appendChild(effects);
    }

    const levelRow = renderLevelPips(skill, lvl);
    const lvlText = document.createElement('span');
    lvlText.className = 'skill-level-text';
    lvlText.textContent = locked ? `с lvl ${skill.unlockLevel}` : `lvl ${lvl}/${skill.maxLevel}`;
    levelRow.appendChild(lvlText);
    card.appendChild(levelRow);

    if (cd > 0) {
      const overlay = document.createElement('div');
      overlay.className = 'skill-cd-overlay';
      overlay.textContent = `${cd}с`;
      card.appendChild(overlay);
    }

    ui.grid.appendChild(card);
  }
}

function renderTree(skills: SkillDefinition[], save: PlayerSave): void {
  ui.tree.innerHTML = '';
  const sorted = filteredSkills(skills);
  if (sorted.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'skills-empty';
    empty.textContent = emptyMessage();
    ui.tree.appendChild(empty);
    return;
  }

  const byTier = new Map<number, SkillDefinition[]>();
  for (const skill of sorted) {
    const tier = unlockTier(skill);
    const list = byTier.get(tier) ?? [];
    list.push(skill);
    byTier.set(tier, list);
  }
  const tiers = [...byTier.keys()].sort((a, b) => a - b);
  const hotbar = host.getHotbar();

  const scroll = document.createElement('div');
  scroll.className = 'skills-tree-scroll';

  for (let ti = 0; ti < tiers.length; ti++) {
    const tier = tiers[ti]!;
    const col = document.createElement('div');
    col.className = 'skills-tree-col';

    const head = document.createElement('div');
    head.className = 'skills-tree-col-head';
    head.textContent = tier <= 1 ? 'Старт' : `Ур. ${tier}`;
    if (save.level >= tier) head.classList.add('reached');
    col.appendChild(head);

    const nodes = document.createElement('div');
    nodes.className = 'skills-tree-nodes';

    const columnSkills = byTier.get(tier)!.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'active' ? -1 : 1;
      return a.name.localeCompare(b.name, 'ru');
    });

    for (const skill of columnSkills) {
      const lvl = skill.level ?? 0;
      const locked = isLocked(skill, save);
      const slotIdx = hotbar.indexOf(skill.id);
      const node = document.createElement('button');
      node.type = 'button';
      node.className = `skills-tree-node type-${skill.type}`;
      if (lvl > 0) node.classList.add('learned');
      if (locked) node.classList.add('locked');
      if (slotIdx >= 0) node.classList.add('active-slot');
      if (selectedId === skill.id) node.classList.add('selected');
      node.dataset.skillId = skill.id;
      node.title = skill.name;

      node.appendChild(createSkillIcon(skill, slotIdx >= 0 ? slotIdx + 1 : undefined));
      const name = document.createElement('div');
      name.className = 'skills-tree-node-name';
      name.textContent = skill.name;
      node.appendChild(name);

      const meta = document.createElement('div');
      meta.className = 'skills-tree-node-meta';
      meta.textContent =
        locked ? `с ${skill.unlockLevel}` : lvl > 0 ? `${lvl}/${skill.maxLevel}` : '—';
      node.appendChild(meta);

      nodes.appendChild(node);
    }

    col.appendChild(nodes);
    scroll.appendChild(col);

    if (ti < tiers.length - 1) {
      const bridge = document.createElement('div');
      bridge.className = 'skills-tree-bridge';
      bridge.setAttribute('aria-hidden', 'true');
      scroll.appendChild(bridge);
    }
  }

  ui.tree.appendChild(scroll);
}

function renderDetail(skills: SkillDefinition[], save: PlayerSave): void {
  ui.detail.innerHTML = '';
  ui.detailPanel.className = 'skills-side-panel skills-panel-detail';

  const skill = selectedId ? skills.find((s) => s.id === selectedId) : null;
  if (!skill) {
    ui.detail.innerHTML = `
      <div class="skills-detail-empty">
        <div class="skills-detail-empty-icon">◇</div>
        <div>Выбери навык</div>
        <div class="skills-detail-empty-hint">Список или дерево · назначь [1]–[9] здесь</div>
      </div>`;
    return;
  }

  const lvl = skill.level ?? 0;
  const locked = isLocked(skill, save);
  const cd = skillCooldownSec(skill);
  const hotbar = host.getHotbar();
  const slotIdx = hotbar.indexOf(skill.id);

  ui.detailPanel.classList.add(`type-accent-${skill.type}`);
  if (lvl > 0) ui.detailPanel.classList.add('learned');

  const header = document.createElement('div');
  header.className = 'skills-detail-header';
  header.appendChild(createSkillIcon(skill, slotIdx >= 0 ? slotIdx + 1 : undefined));

  const titleWrap = document.createElement('div');
  titleWrap.className = 'skills-detail-title-wrap';
  const name = document.createElement('div');
  name.className = 'skills-detail-name';
  name.textContent = skill.name;
  titleWrap.appendChild(name);

  const badges = document.createElement('div');
  badges.className = 'skill-badges';
  badges.innerHTML = `<span class="skill-badge type-${skill.type}">${skill.type === 'active' ? 'активный' : 'пассивный'}</span>`;
  if (skill.targetMode === 'ally') badges.innerHTML += `<span class="skill-badge ally">союзник / себя</span>`;
  if (skill.targetMode === 'party') badges.innerHTML += `<span class="skill-badge ally party">вся пати</span>`;
  if (skill.requiresShield) badges.innerHTML += `<span class="skill-badge shield">только щит</span>`;
  if (slotIdx >= 0) badges.innerHTML += `<span class="skill-badge hotbar">слот [${slotIdx + 1}]</span>`;
  if (cd > 0) badges.innerHTML += `<span class="skill-badge cd">CD ${cd}с</span>`;
  titleWrap.appendChild(badges);
  header.appendChild(titleWrap);
  ui.detail.appendChild(header);

  if (skill.targetMode === 'ally') {
    const tip = document.createElement('div');
    tip.className = 'skills-detail-ally-tip';
    tip.textContent =
      'Цель: выбранный игрок в пати в радиусе, иначе — на себя. Работает и в городе.';
    ui.detail.appendChild(tip);
  }
  if (skill.targetMode === 'party') {
    const tip = document.createElement('div');
    tip.className = 'skills-detail-ally-tip';
    tip.textContent =
      'Цель: все живые члены пати в радиусе навыка (включая тебя). Таргет не нужен.';
    ui.detail.appendChild(tip);
  }

  const status = document.createElement('div');
  status.className = 'skills-detail-status';
  if (lvl > 0) {
    status.textContent = `Изучен · уровень ${lvl}/${skill.maxLevel}`;
    status.classList.add('ok');
  } else if (locked) {
    status.textContent = `Откроется на уровне ${skill.unlockLevel} (сейчас ${save.level})`;
    status.classList.add('locked');
  } else {
    status.textContent = 'Ещё не изучен';
  }
  ui.detail.appendChild(status);

  const levelRow = renderLevelPips(skill, lvl);
  const lvlText = document.createElement('span');
  lvlText.className = 'skill-level-text';
  lvlText.textContent = `lvl ${lvl}/${skill.maxLevel}`;
  levelRow.appendChild(lvlText);
  ui.detail.appendChild(levelRow);

  const desc = document.createElement('div');
  desc.className = 'skills-detail-desc';
  desc.textContent = skill.description;
  ui.detail.appendChild(desc);

  if (skill.requiresShield) {
    const note = document.createElement('div');
    note.className = 'skills-detail-unlock';
    note.textContent = 'Действует только пока экипирован щит';
    ui.detail.appendChild(note);
  }

  const showLvl = lvl > 0 ? lvl : 1;
  const lines = skillEffectLines(skill, showLvl);
  if (lines.length) {
    const box = document.createElement('div');
    box.className = 'skills-detail-effects';
    const caption = document.createElement('div');
    caption.className = 'skills-detail-effects-label';
    caption.textContent = lvl > 0 ? `Эффекты (ур. ${lvl})` : 'Эффекты на 1 ур.';
    box.appendChild(caption);
    const ul = document.createElement('ul');
    for (const line of lines) {
      const li = document.createElement('li');
      li.textContent = line;
      ul.appendChild(li);
    }
    box.appendChild(ul);
    ui.detail.appendChild(box);
  }

  if (lvl > 0 && lvl < skill.maxLevel) {
    const nextLines = skillEffectLines(skill, lvl + 1);
    if (nextLines.length) {
      const nextBox = document.createElement('div');
      nextBox.className = 'skills-detail-effects next';
      const caption = document.createElement('div');
      caption.className = 'skills-detail-effects-label';
      const at = skill.nextRankAt;
      caption.textContent =
        at != null
          ? `След. ур. ${lvl + 1} · на уровне персонажа ${at}`
          : `След. ур. ${lvl + 1}`;
      nextBox.appendChild(caption);
      const ul = document.createElement('ul');
      for (const line of nextLines) {
        const li = document.createElement('li');
        li.textContent = line;
        ul.appendChild(li);
      }
      nextBox.appendChild(ul);
      ui.detail.appendChild(nextBox);
    }
  }

  if (skill.unlockLevel && skill.unlockLevel > 0) {
    const unlock = document.createElement('div');
    unlock.className = 'skills-detail-unlock';
    if (lvl > 0) {
      unlock.textContent = `Открыт с уровня персонажа ${skill.unlockLevel}`;
    } else if (locked) {
      unlock.textContent = `Требование: уровень персонажа ${skill.unlockLevel}`;
    } else {
      unlock.textContent = `Открывается на уровне ${skill.unlockLevel}`;
    }
    ui.detail.appendChild(unlock);
  }

  if (skill.type === 'active' && skillDomainOf(skill) === 'combat') {
    const actions = document.createElement('div');
    actions.className = 'skills-detail-actions';
    if (lvl <= 0) {
      const note = document.createElement('div');
      note.className = 'skills-detail-note';
      note.textContent = locked
        ? 'Сначала доберись до нужного уровня'
        : 'Навык ещё не изучен — на панель нельзя';
      actions.appendChild(note);
    } else {
      for (let i = 0; i < SKILL_HOTBAR_SIZE; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const onSlot = hotbar[i] === skill.id;
        btn.className = `skills-assign-btn${onSlot ? ' active' : ''}`;
        btn.dataset.hotbarAssign = String(i);
        btn.dataset.skillId = skill.id;
        btn.textContent = onSlot ? `Снять с [${i + 1}]` : `На [${i + 1}]`;
        actions.appendChild(btn);
      }
    }
    ui.detail.appendChild(actions);
  } else {
    const note = document.createElement('div');
    note.className = 'skills-detail-note';
    note.textContent =
      skillDomainOf(skill) === 'survival'
        ? 'Пассивка выживания действует всегда, когда изучена'
        : skillDomainOf(skill) === 'craft'
          ? 'Пассивка крафта действует всегда, когда изучена'
          : 'Пассивный навык действует всегда, когда изучен';
    ui.detail.appendChild(note);
  }
}

export function renderSkillsPanel(): void {
  if (!ui) return;
  const save = host.getSave();
  if (!save) return;

  const skills = host.getSkills();
  const prof = PROFESSION_LABELS[save.profession] ?? save.profession;
  ui.profession.textContent =
    domain === 'combat' ? prof : `${DOMAIN_LABELS[domain]} · общие`;
  ui.profession.className = `prof-${save.profession} domain-${domain}`;

  if (ui.search && ui.search.value !== searchQuery) ui.search.value = searchQuery;
  if (ui.searchClear) ui.searchClear.hidden = !searchQuery;

  if (selectedId && !skills.some((s) => s.id === selectedId && skillDomainOf(s) === domain)) {
    selectedId = null;
  }

  ui.hotbar.hidden = domain !== 'combat';
  if (domain === 'combat') renderHotbar(skills);
  renderStatsBar(skills.filter((s) => skillDomainOf(s) === domain));
  renderToolbar();

  ui.body.dataset.view = viewMode;
  ui.body.dataset.domain = domain;
  ui.grid.hidden = viewMode !== 'list';
  ui.tree.hidden = viewMode !== 'tree';

  if (viewMode === 'tree') renderTree(skills, save);
  else renderList(skills, save);

  renderDetail(skills, save);

  if (ui.footerHint) {
    if (domain === 'combat') {
      ui.footerHint.textContent =
        viewMode === 'tree'
          ? 'Дерево по уровню · клик → детали · [1]–[9] в бою · / поиск'
          : '[1]–[9] в бою · клик → детали · / поиск · клик вне окна · Esc';
    } else if (domain === 'survival') {
      ui.footerHint.textContent = 'Выживание · общие для всех · клик → детали · клик вне окна · Esc';
    } else {
      ui.footerHint.textContent = 'Крафт · общие для всех · клик → детали · клик вне окна · Esc';
    }
  }
}

/** Иконка для HUD / внешних панелей. */
export function buildSkillIconEl(
  skill: SkillDefinition,
  assetUrlFn: (id: string) => string | undefined,
  slotNum?: number,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'skill-icon-wrap';
  const url = assetUrlFn(skillAssetId(skill.id));
  if (url) {
    appendMediaIcon(wrap, skillAssetId(skill.id), {
      url,
      alt: skill.name,
      onError: () => {
        const fb = document.createElement('div');
        fb.className = 'skill-icon-fallback';
        fb.textContent = skill.type === 'active' ? '⚡' : '◆';
        wrap.appendChild(fb);
      },
    });
  } else {
    const fb = document.createElement('div');
    fb.className = 'skill-icon-fallback';
    fb.textContent = skill.type === 'active' ? '⚡' : '◆';
    wrap.appendChild(fb);
  }
  if (slotNum !== undefined) {
    const badge = document.createElement('span');
    badge.className = 'skill-slot-badge';
    badge.textContent = String(slotNum);
    wrap.appendChild(badge);
  }
  return wrap;
}
