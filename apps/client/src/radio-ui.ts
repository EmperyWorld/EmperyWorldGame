import type { PlayerSave } from './api.js';
import {
  activateRadioBattery,
  fetchRadioStatus,
  setRadioPowerOn,
  type RadioStatus,
} from './api.js';

export interface RadioHost {
  getSave: () => PlayerSave | null;
  onSaveUpdate: (save: PlayerSave) => void;
  onToast: (text: string) => void;
  onCallNpc: (npcId: string) => void;
  onClose?: () => void;
}

export const RADIO_NPC_LABELS: Record<string, string> = {
  elder_mira: 'Старейшина Мира',
  silvan_hermit: 'Сильванский отшельник',
  ash_shaman: 'Пепельный шаман',
  town_captain: 'Капитан Гаррет',
  rift_scout: 'Скаут Кай',
  rift_guide: 'Проводница Лира',
  collapse_seer: 'Провидица Эра',
  gods_oracle: 'Оракул Никс',
};

const NPC_LABELS = RADIO_NPC_LABELS;

let root: HTMLElement | null = null;
let host: RadioHost | null = null;
let status: RadioStatus | null = null;
let busy = false;
let tickTimer: number | null = null;

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id)! as T;
}

function formatRemain(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function formatLongRemain(ms: number): string {
  const h = Math.max(0, Math.floor(ms / 3_600_000));
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d} д ${h % 24} ч`;
  }
  if (h >= 1) return `${h} ч ${Math.floor((ms / 60_000) % 60)} мин`;
  return formatRemain(ms);
}

function formatCharge(ms: number): string {
  return ms >= 3_600_000 ? formatLongRemain(ms) : formatRemain(ms);
}

function stopTick(): void {
  if (tickTimer != null) {
    window.clearInterval(tickTimer);
    tickTimer = null;
  }
}

function startTick(): void {
  stopTick();
  tickTimer = window.setInterval(() => {
    if (!status) return;
    const now = Date.now();
    const next = { ...status };
    if (next.sessionExpiresAt) {
      next.remainingMs = Math.max(0, Date.parse(next.sessionExpiresAt) - now);
      next.sessionLive = Date.parse(next.sessionExpiresAt) > now;
      next.powerOn = Boolean(next.powerOn && next.sessionLive);
      if (!next.sessionLive) {
        next.sessionExpiresAt = null;
        next.remainingMs = 0;
        next.powerOn = false;
      }
    }
    if (!next.repaired && next.starterExpiresAt) {
      next.starterRemainingMs = Math.max(0, Date.parse(next.starterExpiresAt) - now);
      if (next.starterRemainingMs <= 0 && !next.broken) {
        next.broken = true;
        next.powerOn = false;
        next.sessionLive = false;
        next.sessionExpiresAt = null;
        next.remainingMs = 0;
      }
    }
    status = next;
    render();
  }, 1000);
}

function render(): void {
  if (!root || !host) return;
  const save = host.getSave();
  const owned = Boolean(status?.owned ?? save?.inventory.includes('field_radio'));
  const body = el<HTMLElement>('radio-body');
  const title = el<HTMLElement>('radio-title');
  title.textContent = 'Полевая рация';

  if (!owned) {
    body.innerHTML =
      '<p class="radio-hint">Рации нет. Загляни к Связисту Рену в Гавань (ремонт и батарейки).</p>';
    return;
  }

  const live = Boolean(status?.sessionLive);
  const powered = Boolean(status?.powerOn);
  const packs = status?.batteryPacks ?? 0;
  const remain = status?.remainingMs ?? 0;
  const freqs = status?.frequencies ?? [];
  const broken = Boolean(status?.broken);
  const repaired = Boolean(status?.repaired);
  const starterMs = status?.starterRemainingMs ?? 0;
  const repairCost = status?.repairCost ?? 100000;
  const offers =
    status?.batteryOffers ??
    [
      { id: 'radio_battery_pack', label: '1 ч', hours: 1, count: packs },
    ];

  const lines: string[] = [];
  if (broken) {
    lines.push(
      `<div class="radio-broken">Рация сломалась (стартовый срок вышел). Почини у Связиста Рена в Гавани за ${repairCost.toLocaleString('ru-RU')} адены — один раз, навсегда.</div>`,
    );
  } else if (!repaired && starterMs > 0) {
    lines.push(
      `<p class="radio-hint">Корпус: осталось <strong>${formatLongRemain(starterMs)}</strong>, потом рация один раз сломается.</p>`,
    );
  }

  lines.push(`<div class="radio-status">`);
  lines.push(
    `<div>Заряд: <strong>${live && !broken ? formatCharge(remain) : 'нет'}</strong> · Рация: <strong>${powered && !broken ? 'ВКЛ' : 'ВЫКЛ'}</strong></div>`,
  );
  lines.push(
    `<div>Батарейки: ${offers.map((o) => `<strong>${o.count}</strong>×${o.label}`).join(' · ')}</div>`,
  );
  lines.push(`</div>`);

  lines.push(`<div class="radio-actions">`);
  for (const o of offers) {
    lines.push(
      `<button type="button" class="radio-activate-btn" data-pack="${o.id}" ${busy || live || o.count < 1 || broken ? 'disabled' : ''}>Активировать ${o.label}</button>`,
    );
  }
  lines.push(
    `<button type="button" id="radio-power" ${busy || !live || broken ? 'disabled' : ''}>${powered ? 'Выключить' : 'Включить'}</button>`,
  );
  lines.push(`</div>`);
  lines.push(
    `<p class="radio-hint">Заряд сгорает с момента активации — даже если рация выключена. Батарейки: 1 / 12 / 24 ч у Связиста. По рации нельзя торговать и пользоваться кузней/трактиром.</p>`,
  );

  lines.push(`<h3 class="radio-freq-title">Частоты</h3>`);
  if (freqs.length === 0) {
    lines.push('<p class="radio-hint">Пока пусто. Поговори с квестовым NPC лично (E) — частота запишется.</p>');
  } else {
    lines.push('<div class="radio-freq-list">');
    for (const id of freqs) {
      const label = NPC_LABELS[id] ?? id;
      const canCall = powered && live && !broken;
      lines.push(
        `<button type="button" class="radio-freq-btn" data-npc="${id}" ${busy || !canCall ? 'disabled' : ''}>${label}</button>`,
      );
    }
    lines.push('</div>');
    if (!canCallHint(powered, live) && !broken) {
      lines.push('<p class="radio-hint">Чтобы вызвать — активируй комплект и включи рацию.</p>');
    }
  }

  body.innerHTML = lines.join('');

  body.querySelectorAll<HTMLButtonElement>('.radio-activate-btn').forEach((btn) => {
    btn.onclick = () => void onActivate(btn.dataset.pack);
  });
  el<HTMLButtonElement>('radio-power').onclick = () => void onPower();
  body.querySelectorAll<HTMLButtonElement>('.radio-freq-btn').forEach((btn) => {
    btn.onclick = () => {
      const npcId = btn.dataset.npc;
      if (!npcId || !host) return;
      closeRadio();
      host.onCallNpc(npcId);
    };
  });
}

function canCallHint(powered: boolean, live: boolean): boolean {
  return powered && live;
}

async function refreshStatus(): Promise<void> {
  const save = host?.getSave();
  if (!save) {
    status = null;
    return;
  }
  status = await fetchRadioStatus(save.id);
  if (status.save) host?.onSaveUpdate(status.save);
}

async function onActivate(packId?: string): Promise<void> {
  const save = host?.getSave();
  if (!save || busy) return;
  busy = true;
  render();
  try {
    status = await activateRadioBattery(save.id, packId);
    if (status.save) host?.onSaveUpdate(status.save);
    host?.onToast(status.message ?? 'Комплект активирован');
    startTick();
  } catch (err) {
    host?.onToast(err instanceof Error ? err.message : 'Не удалось активировать');
  } finally {
    busy = false;
    render();
  }
}

async function onPower(): Promise<void> {
  const save = host?.getSave();
  if (!save || busy || !status) return;
  busy = true;
  render();
  try {
    status = await setRadioPowerOn(save.id, !status.powerOn);
    if (status.save) host?.onSaveUpdate(status.save);
    host?.onToast(status.message ?? (status.powerOn ? 'Включено' : 'Выключено'));
  } catch (err) {
    host?.onToast(err instanceof Error ? err.message : 'Не удалось переключить');
  } finally {
    busy = false;
    render();
  }
}

export function mountRadio(container: HTMLElement, h: RadioHost): void {
  root = container;
  host = h;
  el<HTMLButtonElement>('radio-close').onclick = () => closeRadio();
}

export function isRadioOpen(): boolean {
  return root?.classList.contains('visible') ?? false;
}

export function closeRadio(): void {
  stopTick();
  root?.classList.remove('visible');
  host?.onClose?.();
}

export async function openRadio(): Promise<void> {
  if (!root || !host) return;
  root.classList.add('visible');
  el<HTMLElement>('radio-body').innerHTML = '<div class="radio-loading">Связь…</div>';
  try {
    await refreshStatus();
    startTick();
    render();
  } catch {
    el<HTMLElement>('radio-body').innerHTML = '<p class="radio-hint">Не удалось получить статус рации.</p>';
  }
}
