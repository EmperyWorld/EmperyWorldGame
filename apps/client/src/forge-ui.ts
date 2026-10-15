import {
  craftAtForge,
  enchantAtForge,
  fetchForgeMenu,
  type ForgeMenuState,
  type PlayerSave,
  type PlayerStats,
} from './api.js';
import { friendlyUiError } from './ui-errors.js';
import { formatAdenaLabel } from './stat-labels.js';

export interface ForgeHost {
  getSave: () => PlayerSave | null;
  assetUrl: (assetId: string) => string | undefined;
  onSaveUpdate: (save: PlayerSave, stats?: PlayerStats) => void;
  onToast: (text: string) => void;
  onClose?: () => void;
}

type ForgeTab = 'enchant' | 'craft';

let root: HTMLElement | null = null;
let host: ForgeHost | null = null;
let menu: ForgeMenuState | null = null;
let tab: ForgeTab = 'enchant';
let selectedKey: string | null = null;
let busy = false;
let lastMsg = '';

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id)! as T;
}

function formatAdena(n: number): string {
  return n.toLocaleString('ru-RU');
}

function itemIconUrl(itemId: string): string | undefined {
  return host?.assetUrl(`item_${itemId}`);
}

export function mountForge(container: HTMLElement, h: ForgeHost): void {
  root = container;
  host = h;
  el<HTMLButtonElement>('forge-close').onclick = () => closeForge();
  el('forge-tab-enchant').onclick = () => {
    tab = 'enchant';
    selectedKey = null;
    renderForge();
  };
  el('forge-tab-craft').onclick = () => {
    tab = 'craft';
    selectedKey = null;
    renderForge();
  };
}

export function isForgeOpen(): boolean {
  return root?.classList.contains('visible') ?? false;
}

export function closeForge(): void {
  root?.classList.remove('visible');
  menu = null;
  selectedKey = null;
  lastMsg = '';
  busy = false;
  host?.onClose?.();
}

export async function openForge(): Promise<void> {
  if (!root || !host) return;
  const save = host.getSave();
  if (!save) return;
  tab = 'enchant';
  selectedKey = null;
  lastMsg = '';
  root.classList.add('visible');
  el('forge-list').innerHTML = '<div class="forge-empty">Загрузка…</div>';
  el('forge-detail').innerHTML = '';
  try {
    menu = await fetchForgeMenu(save.id);
    if (menu.open === false) {
      const msg = menu.closedMessage ?? 'Закрыто до утра.';
      host.onToast(msg);
      el('forge-list').innerHTML = `<div class="forge-empty">${msg}</div>`;
      el('forge-detail').innerHTML = '';
      el('forge-title').textContent = menu.smithName;
      el('forge-hint').textContent = msg;
      return;
    }
    renderForge();
  } catch (err) {
    host.onToast(friendlyUiError(err, 'Кузня недоступна'));
    closeForge();
  }
}

function renderForge(): void {
  if (!root || !host || !menu) return;
  const save = host.getSave();
  el('forge-title').textContent = menu.smithName;
  el('forge-adena').textContent = formatAdenaLabel(save?.adena ?? menu.adena);
  el('forge-hint').textContent = menu.hint;

  el('forge-tab-enchant').classList.toggle('active', tab === 'enchant');
  el('forge-tab-craft').classList.toggle('active', tab === 'craft');

  const list = el('forge-list');
  list.innerHTML = '';

  if (tab === 'enchant') {
    if (menu.enchant.length === 0) {
      list.innerHTML =
        '<div class="forge-empty">Надень оружие или броню — тогда появится заточка.</div>';
    } else {
      for (const row of menu.enchant) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'forge-row';
        if (selectedKey === `e:${row.slot}`) btn.classList.add('selected');
        if (row.maxed) btn.classList.add('maxed');
        const icon = itemIconUrl(row.itemId);
        btn.innerHTML = `
          ${icon ? `<img class="forge-row-icon" src="${icon}" alt="" />` : '<span class="forge-row-icon forge-row-icon-empty"></span>'}
          <span class="forge-row-main">
            <span class="forge-row-title">${row.itemName} <em>+${row.level}</em></span>
            <span class="forge-row-sub">${row.slotLabel}${row.maxed ? ' · максимум' : ` · ${formatAdena(row.cost)} · ${row.chance}`}</span>
          </span>
        `;
        btn.onclick = () => {
          selectedKey = `e:${row.slot}`;
          renderForge();
        };
        list.appendChild(btn);
      }
    }
  } else if (menu.craft.length === 0) {
    list.innerHTML = '<div class="forge-empty">Рецептов пока нет.</div>';
  } else {
    for (const row of menu.craft) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'forge-row';
      if (selectedKey === `c:${row.id}`) btn.classList.add('selected');
      if (!row.canCraft) btn.classList.add('locked');
      const icon = itemIconUrl(row.resultId);
      const mats = row.ingredients.map((i) => `${i.have}/${i.need} ${i.name}`).join(', ');
      btn.innerHTML = `
        ${icon ? `<img class="forge-row-icon" src="${icon}" alt="" />` : '<span class="forge-row-icon forge-row-icon-empty"></span>'}
        <span class="forge-row-main">
          <span class="forge-row-title">${row.name}</span>
          <span class="forge-row-sub">${mats}</span>
        </span>
      `;
      btn.onclick = () => {
        selectedKey = `c:${row.id}`;
        renderForge();
      };
      list.appendChild(btn);
    }
  }

  renderDetail();
}

function renderDetail(): void {
  const detail = el('forge-detail');
  if (!menu || !host) {
    detail.innerHTML = '';
    return;
  }

  if (lastMsg) {
    /* keep showing after action */
  }

  if (!selectedKey) {
    detail.innerHTML = `
      <div class="forge-detail-empty">
        <p>Выбери предмет слева.</p>
        ${lastMsg ? `<p class="forge-msg">${lastMsg}</p>` : ''}
      </div>`;
    return;
  }

  if (selectedKey.startsWith('e:')) {
    const slot = selectedKey.slice(2);
    const row = menu.enchant.find((r) => r.slot === slot);
    if (!row) {
      detail.innerHTML = '';
      return;
    }
    const icon = itemIconUrl(row.itemId);
    const next = row.level + 1;
    const risk =
      row.maxed
        ? 'Достигнут максимум +10.'
        : row.level >= 3
          ? 'Риск: при провале заточка сбросится до +0.'
          : 'Безопасная заточка (до +3).';
    detail.innerHTML = `
      <div class="forge-detail-head">
        ${icon ? `<img src="${icon}" alt="" />` : ''}
        <div>
          <div class="forge-detail-name">${row.itemName} +${row.level}</div>
          <div class="forge-detail-slot">${row.slotLabel}</div>
        </div>
      </div>
      <p class="forge-detail-risk">${risk}</p>
      ${
        row.maxed
          ? '<p class="forge-detail-meta">Дальше точить нельзя.</p>'
          : `<p class="forge-detail-meta">До +${next} · ${formatAdenaLabel(row.cost)} · шанс ${row.chance}</p>`
      }
      ${lastMsg ? `<p class="forge-msg">${lastMsg}</p>` : ''}
      <button type="button" id="forge-action" class="forge-action" ${row.maxed || !row.affordable || busy ? 'disabled' : ''}>
        ${row.maxed ? 'Максимум' : row.affordable ? `Заточить (+${next})` : 'Мало адены'}
      </button>
    `;
    const action = document.getElementById('forge-action') as HTMLButtonElement | null;
    if (action && !row.maxed) {
      action.onclick = () => void doEnchant(row.slot);
    }
    return;
  }

  const recipeId = selectedKey.slice(2);
  const row = menu.craft.find((r) => r.id === recipeId);
  if (!row) {
    detail.innerHTML = '';
    return;
  }
  const icon = itemIconUrl(row.resultId);
  const mats = row.ingredients
    .map(
      (i) =>
        `<li class="${i.have >= i.need ? 'ok' : 'miss'}">${i.name}: ${i.have}/${i.need}</li>`,
    )
    .join('');
  detail.innerHTML = `
    <div class="forge-detail-head">
      ${icon ? `<img src="${icon}" alt="" />` : ''}
      <div>
        <div class="forge-detail-name">${row.name}</div>
        <div class="forge-detail-slot">→ ${row.resultName}</div>
      </div>
    </div>
    <ul class="forge-mats">${mats}</ul>
    ${lastMsg ? `<p class="forge-msg">${lastMsg}</p>` : ''}
    <button type="button" id="forge-action" class="forge-action" ${!row.canCraft || busy ? 'disabled' : ''}>
      ${row.canCraft ? 'Скрафтить' : 'Не хватает материалов'}
    </button>
  `;
  const action = document.getElementById('forge-action') as HTMLButtonElement | null;
  if (action && row.canCraft) {
    action.onclick = () => void doCraft(row.id);
  }
}

async function refreshMenu(saveId: string): Promise<void> {
  menu = await fetchForgeMenu(saveId);
  renderForge();
}

async function doEnchant(slot: string): Promise<void> {
  const save = host?.getSave();
  if (!save || busy) return;
  busy = true;
  renderDetail();
  try {
    const result = await enchantAtForge(save.id, slot);
    host!.onSaveUpdate(result.save, result.stats);
    lastMsg = result.message;
    selectedKey = `e:${slot}`;
    await refreshMenu(result.save.id);
    host!.onToast(result.message);
  } catch (err) {
    lastMsg = friendlyUiError(err, 'Заточка не удалась');
    host!.onToast(lastMsg);
    renderDetail();
  } finally {
    busy = false;
    renderDetail();
  }
}

async function doCraft(recipeId: string): Promise<void> {
  const save = host?.getSave();
  if (!save || busy) return;
  busy = true;
  renderDetail();
  try {
    const result = await craftAtForge(save.id, recipeId);
    host!.onSaveUpdate(result.save, result.stats);
    lastMsg = result.message;
    selectedKey = `c:${recipeId}`;
    await refreshMenu(result.save.id);
    host!.onToast(result.message);
  } catch (err) {
    lastMsg = friendlyUiError(err, 'Крафт не удался');
    host!.onToast(lastMsg);
    renderDetail();
  } finally {
    busy = false;
    renderDetail();
  }
}
