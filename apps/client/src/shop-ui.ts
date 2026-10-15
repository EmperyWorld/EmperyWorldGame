import type { ItemDefinition, PlayerSave } from './api.js';
import { appendMediaIcon } from './hud-atlas.js';
import {
  buyMount,
  buyShopItem,
  fetchMounts,
  fetchRadioStatus,
  fetchShopBag,
  fetchShopCatalog,
  repairFieldRadio,
  sellAllShopItems,
  sellShopItem,
  type MountDefinition,
  type RadioStatus,
  type ShopOffer,
} from './api.js';
import { friendlyUiError } from './ui-errors.js';
import { STAT_LABELS, formatAdenaLabel } from './stat-labels.js';

export interface ShopHost {
  getSave: () => PlayerSave | null;
  assetUrl: (assetId: string) => string | undefined;
  onSaveUpdate: (save: PlayerSave) => void;
  onToast: (text: string) => void;
  /** После закрытия лавки. */
  onClose?: () => void;
}

const SLOT_LABELS: Record<string, string> = {
  weapon: 'Оружие',
  shield: 'Щит',
  head: 'Голова',
  body: 'Тело',
  legs: 'Ноги',
  gloves: 'Перчатки',
  cloak: 'Плащ',
  quiver: 'Стрелы',
  material: 'Материал',
  consumable: 'Расходник',
};

const SLOT_FILTERS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'weapon', label: 'Оружие' },
  { id: 'quiver', label: 'Стрелы' },
  { id: 'shield', label: 'Щиты' },
  { id: 'head', label: 'Шлемы' },
  { id: 'body', label: 'Доспехи' },
  { id: 'gloves', label: 'Перчатки' },
  { id: 'legs', label: 'Сапоги' },
  { id: 'cloak', label: 'Плащи' },
];

const RARITY_LABELS: Record<string, string> = {
  common: 'обычный',
  uncommon: 'необычный',
  rare: 'редкий',
  epic: 'эпический',
  legendary: 'легендарный',
  daedric: 'даэдрический',
  holy: 'святой',
};

type ShopMode = 'buy' | 'sell';
type BagQuote = { inventoryIndex: number; item: ItemDefinition; sellPrice: number };

let root: HTMLElement | null = null;
let host: ShopHost | null = null;
let offers: ShopOffer[] = [];
let bagQuotes: BagQuote[] = [];
let mode: ShopMode = 'buy';
let filter = 'all';
let selectedId: string | null = null;
let selectedBagIndex: number | null = null;
let buyQty = 1;
let busy = false;
let sellAllConfirmOpen = false;
let currentShopId = 'haven_merchant';
let buyOnly = false;
/** Только кони — без витрины предметов. */
let mountsOnly = false;
let radioStatus: RadioStatus | null = null;

const BUY_QTY_MAX = 99;

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id)! as T;
}

function allowsBulkBuy(item: ItemDefinition): boolean {
  return (
    item.slot === 'quiver' ||
    item.slot === 'consumable' ||
    item.id.startsWith('radio_battery')
  );
}

function clampBuyQty(n: number, maxAffordable: number): number {
  const capped = Math.min(BUY_QTY_MAX, Math.max(1, Math.floor(n) || 1));
  if (maxAffordable < 1) return 1;
  return Math.min(capped, maxAffordable);
}

function formatPrice(n: number): string {
  return n.toLocaleString('ru-RU');
}

function formatStats(item: ItemDefinition): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(item.stats)) {
    if (!val) continue;
    const label = STAT_LABELS[key] ?? key;
    parts.push(`${val > 0 ? '+' : ''}${val} ${label}`);
  }
  if (item.weaponWeight) {
    const w = { light: 'лёгкое', normal: 'среднее', heavy: 'тяжёлое' }[item.weaponWeight];
    if (w) parts.push(w);
  }
  if (item.attackRange && item.attackRange > 0) parts.push(`дальность ${item.attackRange}`);
  if (item.armorType) {
    parts.push(
      item.armorType === 'light' ? 'лёгкая' : item.armorType === 'heavy' ? 'тяжёлая' : 'роба',
    );
  }
  return parts.join(' · ') || 'Без бонусов';
}

function itemIconUrl(item: ItemDefinition): string | undefined {
  return host?.assetUrl(`item_${item.id}`) ?? (item.icon?.startsWith('/media/') ? item.icon : undefined);
}

function filteredOffers(): ShopOffer[] {
  if (filter === 'all') return offers;
  return offers.filter((o) => o.item.slot === filter);
}

function filteredBag(): BagQuote[] {
  if (filter === 'all') return bagQuotes;
  return bagQuotes.filter((q) => q.item.slot === filter);
}

function renderModeTabs(): void {
  const bar = el<HTMLElement>('shop-mode');
  bar.innerHTML = '';
  if (buyOnly) {
    mode = 'buy';
    return;
  }
  for (const m of [
    { id: 'buy' as const, label: 'Купить' },
    { id: 'sell' as const, label: 'Продать' },
  ]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `shop-filter-btn${mode === m.id ? ' active' : ''}`;
    btn.textContent = m.label;
    btn.onclick = () => {
      mode = m.id;
      selectedId = null;
      selectedBagIndex = null;
      sellAllConfirmOpen = false;
      void refreshAndRender();
    };
    bar.appendChild(btn);
  }

  if (mode === 'sell') {
    const total = bagQuotes.reduce((sum, q) => sum + q.sellPrice, 0);
    const count = bagQuotes.length;
    const sellAll = document.createElement('button');
    sellAll.type = 'button';
    sellAll.id = 'shop-sell-all-btn';
    sellAll.className = 'shop-sell-all-btn';
    sellAll.disabled = busy || count === 0;
    sellAll.textContent =
      count === 0 ? 'Продать всё' : `Продать всё (${count} · +${formatPrice(total)} a)`;
    sellAll.onclick = () => {
      if (count === 0 || busy) return;
      sellAllConfirmOpen = true;
      renderSellAllConfirm();
    };
    bar.appendChild(sellAll);
  }
}

function hideSellAllConfirm(): void {
  sellAllConfirmOpen = false;
  const box = document.getElementById('shop-sell-all-confirm');
  if (box) box.hidden = true;
}

function renderSellAllConfirm(): void {
  const box = el<HTMLElement>('shop-sell-all-confirm');
  if (!sellAllConfirmOpen) {
    box.hidden = true;
    return;
  }
  const count = bagQuotes.length;
  const total = bagQuotes.reduce((sum, q) => sum + q.sellPrice, 0);
  box.hidden = false;
  box.innerHTML = `
    <div class="shop-confirm-card">
      <div class="shop-confirm-title">Продать весь рюкзак?</div>
      <p class="shop-confirm-text">
        Будет продано <strong>${count}</strong> неэкипированных предметов
        за <strong>+${formatPrice(total)} адены</strong>.
        Надетое снаряжение не трогаем.
      </p>
      <div class="shop-confirm-actions">
        <button type="button" class="shop-confirm-cancel" id="shop-sell-all-cancel" ${busy ? 'disabled' : ''}>Отмена</button>
        <button type="button" class="shop-confirm-ok" id="shop-sell-all-ok" ${busy ? 'disabled' : ''}>Подтвердить продажу</button>
      </div>
    </div>
  `;
  el<HTMLButtonElement>('shop-sell-all-cancel').onclick = () => {
    hideSellAllConfirm();
  };
  el<HTMLButtonElement>('shop-sell-all-ok').onclick = () => {
    void sellAllItems();
  };
}

function renderFilters(): void {
  const bar = el<HTMLElement>('shop-filters');
  bar.innerHTML = '';
  if (mountsOnly) return;
  for (const f of SLOT_FILTERS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `shop-filter-btn${filter === f.id ? ' active' : ''}`;
    btn.textContent = f.label;
    btn.onclick = () => {
      filter = f.id;
      selectedId = null;
      selectedBagIndex = null;
      renderShop();
    };
    bar.appendChild(btn);
  }
}

function renderBuyList(): void {
  const list = el<HTMLElement>('shop-list');
  list.innerHTML = '';
  const rows = filteredOffers();
  if (rows.length === 0) {
    list.innerHTML = '<div class="shop-empty">В этой категории пока пусто</div>';
    return;
  }

  const save = host!.getSave();
  const adena = save?.adena ?? 0;

  for (const offer of rows) {
    const { item, price } = offer;
    const canAfford = adena >= price;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `shop-card rarity-${item.rarity}${selectedId === item.id ? ' selected' : ''}${canAfford ? '' : ' unaffordable'}`;
    card.onclick = () => {
      selectedId = item.id;
      buyQty = 1;
      renderShop();
    };

    const iconWrap = document.createElement('div');
    iconWrap.className = 'shop-card-icon';
    const url = itemIconUrl(item);
    if (url) {
      appendMediaIcon(iconWrap, `item_${item.id}`, {
        url,
        alt: item.name,
        onError: () => {
          iconWrap.textContent = item.slot === 'weapon' ? 'Ор' : 'Бр';
        },
      });
    } else {
      iconWrap.textContent = item.slot === 'weapon' ? 'Ор' : 'Бр';
    }

    const body = document.createElement('div');
    body.className = 'shop-card-body';
    body.innerHTML = `
      <div class="shop-card-top">
        <span class="shop-card-name">${item.name}</span>
        <span class="shop-card-price">${formatPrice(price)} a</span>
      </div>
      <div class="shop-card-meta">
        <span class="shop-badge slot">${SLOT_LABELS[item.slot] ?? item.slot}</span>
        <span class="shop-badge rarity-${item.rarity}">${RARITY_LABELS[item.rarity] ?? item.rarity}</span>
      </div>
      <div class="shop-card-stats">${formatStats(item)}</div>
    `;

    card.appendChild(iconWrap);
    card.appendChild(body);
    list.appendChild(card);
  }
}

function renderSellList(): void {
  const list = el<HTMLElement>('shop-list');
  list.innerHTML = '';
  const rows = filteredBag();
  if (rows.length === 0) {
    list.innerHTML = '<div class="shop-empty">В рюкзаке нечего продавать</div>';
    return;
  }

  for (const quote of rows) {
    const { item, sellPrice, inventoryIndex } = quote;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `shop-card rarity-${item.rarity}${selectedBagIndex === inventoryIndex ? ' selected' : ''}`;
    card.onclick = () => {
      selectedBagIndex = inventoryIndex;
      renderShop();
    };

    const iconWrap = document.createElement('div');
    iconWrap.className = 'shop-card-icon';
    const url = itemIconUrl(item);
    if (url) {
      appendMediaIcon(iconWrap, `item_${item.id}`, { url, alt: item.name });
    } else {
      iconWrap.textContent = item.slot === 'material' ? 'Мт' : item.slot === 'weapon' ? 'Ор' : 'Бр';
    }

    const body = document.createElement('div');
    body.className = 'shop-card-body';
    body.innerHTML = `
      <div class="shop-card-top">
        <span class="shop-card-name">${item.name}</span>
        <span class="shop-card-price">+${formatPrice(sellPrice)} a</span>
      </div>
      <div class="shop-card-meta">
        <span class="shop-badge slot">${SLOT_LABELS[item.slot] ?? item.slot}</span>
        <span class="shop-badge rarity-${item.rarity}">${RARITY_LABELS[item.rarity] ?? item.rarity}</span>
      </div>
      <div class="shop-card-stats">${formatStats(item)}</div>
    `;

    card.appendChild(iconWrap);
    card.appendChild(body);
    list.appendChild(card);
  }
}

function renderBuyDetail(): void {
  const detail = el<HTMLElement>('shop-detail');
  const save = host!.getSave();
  const adena = save?.adena ?? 0;
  const offer = offers.find((o) => o.item.id === selectedId);

  if (!offer) {
    detail.innerHTML = `
      <div class="shop-detail-empty">
        <p>Выбери товар слева</p>
        <p class="shop-hint">Иконка · слот · статы · цена</p>
      </div>`;
    return;
  }

  const { item, price } = offer;
  const bulk = allowsBulkBuy(item);
  const maxAffordable = Math.max(0, Math.floor(adena / Math.max(1, price)));
  if (bulk) {
    buyQty = clampBuyQty(buyQty, Math.max(1, maxAffordable || 1));
  } else {
    buyQty = 1;
  }
  const qty = bulk ? buyQty : 1;
  const total = price * qty;
  const canAfford = adena >= total && maxAffordable >= 1;
  const url = itemIconUrl(item);

  const qtyBlock = bulk
    ? `
    <div class="shop-qty-row">
      <span class="shop-qty-label">Количество</span>
      <div class="shop-qty-controls">
        <button type="button" class="shop-qty-btn" data-qty-delta="-10" ${busy ? 'disabled' : ''}>−10</button>
        <button type="button" class="shop-qty-btn" data-qty-delta="-1" ${busy ? 'disabled' : ''}>−</button>
        <input id="shop-qty-input" class="shop-qty-input" type="number" min="1" max="${BUY_QTY_MAX}" value="${qty}" ${busy ? 'disabled' : ''} />
        <button type="button" class="shop-qty-btn" data-qty-delta="1" ${busy ? 'disabled' : ''}>+</button>
        <button type="button" class="shop-qty-btn" data-qty-delta="10" ${busy ? 'disabled' : ''}>+10</button>
        <button type="button" class="shop-qty-btn shop-qty-max" data-qty-max="1" ${busy || maxAffordable < 1 ? 'disabled' : ''}>макс</button>
      </div>
      <div class="shop-qty-hint">до ${Math.min(BUY_QTY_MAX, maxAffordable)} шт. по кошельку</div>
    </div>`
    : '';

  detail.innerHTML = `
    <div class="shop-detail-header">
      <div class="shop-detail-icon">${url ? `<img src="${url}" alt="" />` : '◆'}</div>
      <div>
        <div class="shop-detail-name">${item.name}</div>
        <div class="shop-detail-meta">
          <span class="shop-badge slot">${SLOT_LABELS[item.slot] ?? item.slot}</span>
          <span class="shop-badge rarity-${item.rarity}">${RARITY_LABELS[item.rarity] ?? item.rarity}</span>
        </div>
      </div>
    </div>
    <p class="shop-detail-stats">${formatStats(item)}</p>
    ${qtyBlock}
    <div class="shop-detail-price-row">
      <span class="shop-detail-price-label">${bulk && qty > 1 ? `Итого (${qty} × ${formatPrice(price)})` : 'Цена'}</span>
      <span class="shop-detail-price">${formatPrice(total)} адены</span>
    </div>
    <div class="shop-detail-wallet">У тебя: <strong>${formatPrice(adena)}</strong> адены</div>
    <button type="button" class="shop-buy-btn" id="shop-buy-btn" ${canAfford && !busy ? '' : 'disabled'}>
      ${
        canAfford
          ? bulk && qty > 1
            ? `Купить ${qty} шт. за ${formatPrice(total)}`
            : `Купить за ${formatPrice(total)}`
          : 'Не хватает адены'
      }
    </button>
  `;

  if (bulk) {
    for (const btn of detail.querySelectorAll<HTMLButtonElement>('[data-qty-delta]')) {
      btn.onclick = () => {
        const delta = Number(btn.dataset.qtyDelta ?? 0);
        buyQty = clampBuyQty(buyQty + delta, Math.max(1, maxAffordable || 1));
        renderBuyDetail();
      };
    }
    const maxBtn = detail.querySelector<HTMLButtonElement>('[data-qty-max]');
    if (maxBtn) {
      maxBtn.onclick = () => {
        buyQty = clampBuyQty(Math.min(BUY_QTY_MAX, maxAffordable), Math.max(1, maxAffordable || 1));
        renderBuyDetail();
      };
    }
    const input = detail.querySelector<HTMLInputElement>('#shop-qty-input');
    if (input) {
      input.onchange = () => {
        buyQty = clampBuyQty(Number(input.value), Math.max(1, maxAffordable || 1));
        renderBuyDetail();
      };
    }
  }

  const buyBtn = detail.querySelector('#shop-buy-btn') as HTMLButtonElement | null;
  if (buyBtn && canAfford) {
    buyBtn.onclick = () => void purchase(item.id, qty);
  }
}

function renderSellDetail(): void {
  const detail = el<HTMLElement>('shop-detail');
  const save = host!.getSave();
  const adena = save?.adena ?? 0;
  const quote = bagQuotes.find((q) => q.inventoryIndex === selectedBagIndex);

  if (!quote) {
    detail.innerHTML = `
      <div class="shop-detail-empty">
        <p>Выбери предмет из рюкзака</p>
        <p class="shop-hint">Лорен купит по оценке лавки</p>
      </div>`;
    return;
  }

  const { item, sellPrice, inventoryIndex } = quote;
  const url = itemIconUrl(item);

  detail.innerHTML = `
    <div class="shop-detail-header">
      <div class="shop-detail-icon">${url ? `<img src="${url}" alt="" />` : '◆'}</div>
      <div>
        <div class="shop-detail-name">${item.name}</div>
        <div class="shop-detail-meta">
          <span class="shop-badge slot">${SLOT_LABELS[item.slot] ?? item.slot}</span>
          <span class="shop-badge rarity-${item.rarity}">${RARITY_LABELS[item.rarity] ?? item.rarity}</span>
        </div>
      </div>
    </div>
    <p class="shop-detail-stats">${formatStats(item)}</p>
    <div class="shop-detail-price-row">
      <span class="shop-detail-price-label">Выручка</span>
      <span class="shop-detail-price">+${formatPrice(sellPrice)} адены</span>
    </div>
    <div class="shop-detail-wallet">У тебя: <strong>${formatPrice(adena)}</strong> адены</div>
    <button type="button" class="shop-buy-btn shop-sell-btn" id="shop-sell-btn" ${busy ? 'disabled' : ''}>
      Продать за ${formatPrice(sellPrice)}
    </button>
  `;

  const sellBtn = detail.querySelector('#shop-sell-btn') as HTMLButtonElement | null;
  if (sellBtn) {
    sellBtn.onclick = () => void sellItem(inventoryIndex);
  }
}

function renderHeader(): void {
  const save = host!.getSave();
  el<HTMLElement>('shop-adena').textContent = formatAdenaLabel(save?.adena ?? 0);
  if (currentShopId === 'haven_radio') {
    el<HTMLElement>('shop-subtitle').textContent =
      'Батарейки для рации. Саму рацию не продаю — только ремонт, если сломалась.';
  } else if (currentShopId === 'haven_stable') {
    el<HTMLElement>('shop-subtitle').textContent =
      'Скакуны для поля. Один конь в сейве — покупка другого заменяет. Сесть: H.';
  } else {
    el<HTMLElement>('shop-subtitle').textContent =
      mode === 'buy'
        ? 'Выбери товар — справа подробности и кнопка покупки'
        : 'Продай лишнее из рюкзака — Лорен платит ~45% от цены лавки';
  }
  renderRadioRepair();
  renderMountOffer();
}

let mountOffers: MountDefinition[] = [];
/** Выбранная карточка в стойле (UI). */
let selectedMountId: string | null = null;

const MOUNT_VISUAL_META: Record<
  string,
  { label: string; accent: string; tone: string; mane: string; rarity: string }
> = {
  bay: {
    label: 'Гнедой',
    accent: 'bay',
    tone: '#a87848',
    mane: '#2a1c12',
    rarity: 'common',
  },
  ash: {
    label: 'Пепельный',
    accent: 'ash',
    tone: '#4a4a52',
    mane: '#5a2828',
    rarity: 'uncommon',
  },
  pale: {
    label: 'Бледный',
    accent: 'pale',
    tone: '#e0d8cc',
    mane: '#a8b0c0',
    rarity: 'rare',
  },
  prism: {
    label: 'Призма',
    accent: 'prism',
    tone: '#a888c8',
    mane: '#40c8c8',
    rarity: 'legendary',
  },
};

function mountHorseSvg(tone: string, mane: string): string {
  return `<svg class="shop-mount-svg" viewBox="0 0 64 48" aria-hidden="true">
    <ellipse cx="30" cy="42" rx="18" ry="3.2" fill="rgba(0,0,0,0.28)"/>
    <path fill="${mane}" d="M12 22c-2 2-6 4-8 6l2 2c3-1 7-2 9-4z"/>
    <path fill="${tone}" d="M18 20c0-5 6-9 14-9 5 0 9 1 12 4l6-5 2 3-4 5c3 2 5 5 5 8 0 3-2 5-6 6l-1 8h-4l1-7h-8l1 7h-4l-1-8c-5-1-9-4-9-8z"/>
    <path fill="${mane}" d="M42 12c1-3 4-6 5-8l-3-1c-2 3-4 5-5 7z"/>
    <path fill="${tone}" d="M44 15c3-1 7 0 9 2l3 1-1 3-4-1c-2 1-4 1-6 0z"/>
    <circle cx="50" cy="16.5" r="1.1" fill="#1a1008"/>
    <path fill="#5a3020" d="M26 18h10v3H26z"/>
    <path fill="rgba(0,0,0,0.18)" d="M22 24h18v2H22z"/>
  </svg>`;
}

function mountStatBars(horse: MountDefinition, maxSpeed: number, maxCharge: number): string {
  const speedPct = Math.round(((horse.speedMult - 1) / Math.max(0.01, maxSpeed - 1)) * 100);
  const chargePct = Math.round(
    ((horse.chargeDamageMult - 1) / Math.max(0.01, maxCharge - 1)) * 100,
  );
  const speedBonus = Math.round((horse.speedMult - 1) * 100);
  const chargeBonus = Math.round((horse.chargeDamageMult - 1) * 100);
  return `
    <div class="shop-mount-meters">
      <div class="shop-mount-meter">
        <div class="shop-mount-meter-label"><span>Скорость</span><span>+${speedBonus}%</span></div>
        <div class="shop-mount-meter-track"><i style="width:${speedPct}%"></i></div>
      </div>
      <div class="shop-mount-meter">
        <div class="shop-mount-meter-label"><span>Таран</span><span>+${chargeBonus}%</span></div>
        <div class="shop-mount-meter-track charge"><i style="width:${chargePct}%"></i></div>
      </div>
    </div>`;
}

function renderMountOffer(): void {
  const box = document.getElementById('shop-mount-offer');
  if (!box) return;
  if (currentShopId !== 'haven_stable' || mode !== 'buy') {
    box.classList.remove('visible');
    box.innerHTML = '';
    selectedMountId = null;
    return;
  }
  const horses = [...mountOffers].sort((a, b) => a.shopPrice - b.shopPrice);
  if (!horses.length) {
    box.classList.remove('visible');
    box.innerHTML = '';
    return;
  }
  const save = host?.getSave();
  const ownedId = save?.mount?.ownedId ?? null;
  const adena = save?.adena ?? 0;
  if (!selectedMountId || !horses.some((h) => h.id === selectedMountId)) {
    selectedMountId = ownedId && horses.some((h) => h.id === ownedId) ? ownedId : horses[0]!.id;
  }
  const maxSpeed = Math.max(...horses.map((h) => h.speedMult));
  const maxCharge = Math.max(...horses.map((h) => h.chargeDamageMult));
  const selected = horses.find((h) => h.id === selectedMountId) ?? horses[0]!;
  const selectedMeta = MOUNT_VISUAL_META[selected.visual ?? 'bay'] ?? MOUNT_VISUAL_META.bay!;
  const selectedOwned = ownedId === selected.id;
  const selectedPoor = !selectedOwned && adena < selected.shopPrice;
  const canBuySelected = !selectedOwned && !selectedPoor && !busy;
  let selectedAction = `Купить за ${formatPrice(selected.shopPrice)}`;
  if (selectedOwned) selectedAction = 'Уже в стойле · сядь на H';
  else if (ownedId) selectedAction = `Заменить за ${formatPrice(selected.shopPrice)}`;
  else if (selectedPoor) selectedAction = `Не хватает ${formatPrice(selected.shopPrice - adena)}`;

  const ownedHorse = ownedId ? horses.find((h) => h.id === ownedId) : undefined;

  box.classList.add('visible');
  const cards = horses
    .map((horse) => {
      const visual = horse.visual ?? 'bay';
      const meta = MOUNT_VISUAL_META[visual] ?? MOUNT_VISUAL_META.bay!;
      const owned = ownedId === horse.id;
      const tooPoor = !owned && adena < horse.shopPrice;
      const selected = selectedMountId === horse.id;
      const classes = [
        'shop-mount-card',
        `accent-${meta.accent}`,
        owned ? 'owned' : '',
        tooPoor ? 'unaffordable' : '',
        selected ? 'selected' : '',
      ]
        .filter(Boolean)
        .join(' ');

      return `<button type="button" class="${classes}" data-mount-select="${horse.id}" aria-pressed="${selected}">
        <div class="shop-mount-art" aria-hidden="true">
          ${mountHorseSvg(meta.tone, meta.mane)}
          ${owned ? '<span class="shop-mount-ribbon">ваш</span>' : ''}
        </div>
        <div class="shop-mount-card-text">
          <div class="shop-mount-card-name">${horse.name}</div>
          <div class="shop-mount-card-sub">
            <span class="shop-badge rarity-${meta.rarity}">${meta.label}</span>
            <span class="shop-mount-card-price">${formatPrice(horse.shopPrice)}</span>
          </div>
        </div>
      </button>`;
    })
    .join('');

  box.innerHTML = `
    <div class="shop-mount-header">
      <div>
        <div class="shop-mount-title">Стойло Бориса</div>
        <div class="shop-mount-hint">Выбери масть · один конь в сейве · H — сесть / спешиться</div>
      </div>
      ${
        ownedHorse
          ? `<div class="shop-mount-current">Сейчас: <strong>${ownedHorse.name}</strong></div>`
          : `<div class="shop-mount-current muted">Стойло пусто</div>`
      }
    </div>
    <div class="shop-mount-layout">
      <div class="shop-mount-grid">${cards}</div>
      <div class="shop-mount-feature accent-${selectedMeta.accent}">
        <div class="shop-mount-feature-art" aria-hidden="true">
          ${mountHorseSvg(selectedMeta.tone, selectedMeta.mane)}
        </div>
        <div class="shop-mount-feature-body">
          <div class="shop-mount-feature-top">
            <div>
              <div class="shop-mount-feature-name">${selected.name}</div>
              <div class="shop-mount-meta">
                <span class="shop-badge rarity-${selectedMeta.rarity}">${selectedMeta.label}</span>
                ${selectedOwned ? '<span class="shop-badge shop-mount-owned-badge">в стойле</span>' : ''}
              </div>
            </div>
            <div class="shop-mount-feature-price">${formatPrice(selected.shopPrice)} <small>адены</small></div>
          </div>
          <p class="shop-mount-desc">${selected.description ?? 'Верховой конь'}</p>
          ${mountStatBars(selected, maxSpeed, maxCharge)}
          <div class="shop-mount-wallet">У тебя: <strong>${formatPrice(adena)}</strong> адены</div>
          <button type="button" class="shop-mount-buy-btn" data-mount-id="${selected.id}" ${canBuySelected ? '' : 'disabled'}>${selectedAction}</button>
        </div>
      </div>
    </div>
  `;

  box.querySelectorAll<HTMLButtonElement>('[data-mount-select]').forEach((btn) => {
    btn.onclick = () => {
      selectedMountId = btn.dataset.mountSelect ?? selectedMountId;
      renderMountOffer();
    };
  });
  box.querySelectorAll<HTMLButtonElement>('.shop-mount-buy-btn').forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.mountId;
      if (id) void onBuyMount(id);
    };
  });
}

async function onBuyMount(mountId: string): Promise<void> {
  const save = host?.getSave();
  if (!save || busy) return;
  busy = true;
  selectedMountId = mountId;
  renderMountOffer();
  try {
    const result = await buyMount(save.id, mountId);
    selectedMountId = mountId;
    host?.onSaveUpdate(result.save);
    host?.onToast(result.message);
    renderShop();
  } catch (err) {
    host?.onToast(friendlyUiError(err, 'Не удалось купить'));
  } finally {
    busy = false;
    renderMountOffer();
  }
}

function renderRadioRepair(): void {
  const box = document.getElementById('shop-radio-repair');
  if (!box) return;
  if (currentShopId !== 'haven_radio' || !radioStatus?.broken) {
    box.classList.remove('visible');
    box.innerHTML = '';
    return;
  }
  const cost = radioStatus.repairCost ?? 100000;
  const adena = host?.getSave()?.adena ?? 0;
  box.classList.add('visible');
  box.innerHTML = `
    <div>Стартовая рация дохла. Починю навсегда за <strong>${formatPrice(cost)} адены</strong>.</div>
    <button type="button" id="shop-radio-repair-btn" ${busy || adena < cost ? 'disabled' : ''}>Починить рацию</button>
  `;
  const btn = document.getElementById('shop-radio-repair-btn');
  if (btn) btn.onclick = () => void onRepairRadio();
}

async function onRepairRadio(): Promise<void> {
  const save = host?.getSave();
  if (!save || busy) return;
  busy = true;
  renderRadioRepair();
  try {
    radioStatus = await repairFieldRadio(save.id);
    if (radioStatus.save) host?.onSaveUpdate(radioStatus.save);
    host?.onToast(radioStatus.message ?? 'Рация починена');
    renderHeader();
  } catch (err) {
    host?.onToast(friendlyUiError(err, 'Не удалось починить'));
  } finally {
    busy = false;
    renderHeader();
  }
}

function renderShop(): void {
  if (!root || !host) return;
  root.classList.toggle('shop-mounts-only', mountsOnly);
  renderHeader();
  renderModeTabs();
  renderFilters();
  if (mountsOnly) {
    el<HTMLElement>('shop-list').innerHTML = '';
    el<HTMLElement>('shop-detail').innerHTML = '';
    hideSellAllConfirm();
    return;
  }
  if (mode === 'buy') {
    hideSellAllConfirm();
    renderBuyList();
    renderBuyDetail();
  } else {
    renderSellList();
    renderSellDetail();
    if (sellAllConfirmOpen) renderSellAllConfirm();
    else hideSellAllConfirm();
  }
}

async function refreshBagQuotes(): Promise<void> {
  const save = host?.getSave();
  if (!save) {
    bagQuotes = [];
    return;
  }
  const bag = await fetchShopBag(save.id);
  bagQuotes = bag.items;
}

async function refreshAndRender(): Promise<void> {
  if (mode === 'sell') {
    try {
      await refreshBagQuotes();
    } catch {
      bagQuotes = [];
    }
  }
  renderShop();
}

async function purchase(itemId: string, quantity = 1): Promise<void> {
  const save = host?.getSave();
  if (!save || busy) return;
  busy = true;
  renderBuyDetail();
  try {
    const result = await buyShopItem(save.id, itemId, quantity, currentShopId);
    host!.onSaveUpdate(result.save);
    host!.onToast(result.message);
    renderShop();
  } catch (err) {
    host!.onToast(friendlyUiError(err, 'Не удалось купить'));
    renderShop();
  } finally {
    busy = false;
  }
}

async function sellItem(inventoryIndex: number): Promise<void> {
  const save = host?.getSave();
  if (!save || busy) return;
  busy = true;
  renderSellDetail();
  try {
    const result = await sellShopItem(save.id, inventoryIndex, currentShopId);
    host!.onSaveUpdate(result.save);
    host!.onToast(result.message);
    selectedBagIndex = null;
    await refreshBagQuotes();
    renderShop();
  } catch (err) {
    host!.onToast(friendlyUiError(err, 'Не удалось продать'));
    renderShop();
  } finally {
    busy = false;
  }
}

async function sellAllItems(): Promise<void> {
  const save = host?.getSave();
  if (!save || busy || bagQuotes.length === 0) return;
  busy = true;
  renderSellAllConfirm();
  try {
    const result = await sellAllShopItems(save.id, currentShopId);
    host!.onSaveUpdate(result.save);
    host!.onToast(result.message);
    selectedBagIndex = null;
    sellAllConfirmOpen = false;
    await refreshBagQuotes();
    renderShop();
  } catch (err) {
    host!.onToast(friendlyUiError(err, 'Не удалось продать всё'));
    renderShop();
  } finally {
    busy = false;
  }
}

export function mountShop(container: HTMLElement, h: ShopHost): void {
  root = container;
  host = h;
  el<HTMLButtonElement>('shop-close').onclick = () => closeShop();
}

export function isShopOpen(): boolean {
  return root?.classList.contains('visible') ?? false;
}

/** Закрыть диалог «продать всё» (Esc); false если его не было. */
export function dismissShopConfirm(): boolean {
  if (!sellAllConfirmOpen) return false;
  hideSellAllConfirm();
  return true;
}

export function closeShop(): void {
  hideSellAllConfirm();
  sellAllConfirmOpen = false;
  radioStatus = null;
  document.getElementById('shop-radio-repair')?.classList.remove('visible');
  root?.classList.remove('visible');
  root?.classList.remove('shop-mounts-only');
  mountsOnly = false;
  host?.onClose?.();
}

export async function openShop(
  shopId = 'haven_merchant',
  opts?: { buyOnly?: boolean; mountsOnly?: boolean },
): Promise<void> {
  if (!root || !host) return;
  currentShopId = shopId;
  mountsOnly = Boolean(opts?.mountsOnly) || shopId === 'haven_stable';
  buyOnly = Boolean(opts?.buyOnly) || shopId === 'haven_radio' || mountsOnly;
  mode = 'buy';
  sellAllConfirmOpen = false;
  radioStatus = null;
  root.classList.add('visible');
  root.classList.toggle('shop-mounts-only', mountsOnly);
  el<HTMLElement>('shop-list').innerHTML = mountsOnly
    ? ''
    : '<div class="shop-loading">Загрузка витрины…</div>';
  el<HTMLElement>('shop-detail').innerHTML = '';
  hideSellAllConfirm();
  try {
    const save = host.getSave();
    const catalog = await fetchShopCatalog(currentShopId, { saveId: save?.id });
    if (catalog.open === false) {
      const msg = catalog.closedMessage ?? 'Закрыто до утра.';
      host.onToast(msg);
      el<HTMLElement>('shop-title').textContent = catalog.merchantName;
      el<HTMLElement>('shop-list').innerHTML = mountsOnly
        ? ''
        : `<div class="shop-empty">${msg}</div>`;
      offers = [];
      if (mountsOnly) renderMountOffer();
      return;
    }
    offers = catalog.offers;
    el<HTMLElement>('shop-title').textContent = catalog.merchantName;
    selectedId = offers[0]?.item.id ?? null;
    selectedBagIndex = null;
    if (currentShopId === 'haven_radio') {
      const save = host.getSave();
      if (save) radioStatus = await fetchRadioStatus(save.id);
      if (radioStatus?.save) host.onSaveUpdate(radioStatus.save);
      mountOffers = [];
    } else if (currentShopId === 'haven_stable') {
      try {
        mountOffers = await fetchMounts();
      } catch {
        mountOffers = [];
      }
    } else {
      mountOffers = [];
    }
    renderShop();
  } catch (err) {
    const msg = friendlyUiError(err, 'Не удалось загрузить товары');
    host.onToast(msg);
    el<HTMLElement>('shop-list').innerHTML = mountsOnly
      ? ''
      : `<div class="shop-empty">${msg}</div>`;
    if (mountsOnly) renderMountOffer();
  }
}
