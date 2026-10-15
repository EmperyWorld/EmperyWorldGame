import { dialoguePortraitId } from '@empery/shared/dialogue-portraits';
import { RADIO_NPC_LABELS } from './radio-ui.js';

export interface RadioCallHost {
  assetUrl: (assetId: string) => string | undefined;
  onAnswer: (npcId: string) => void;
  onToast?: (text: string) => void;
}

const MARGIN = 12;

let host: RadioCallHost | null = null;
let root: HTMLElement | null = null;
let avatarEl: HTMLImageElement | null = null;
let nameEl: HTMLElement | null = null;
let statusEl: HTMLElement | null = null;
let pendingNpcId: string | null = null;
let answering = false;
let autoAnswerTimer: number | null = null;

function clearAutoAnswer(): void {
  if (autoAnswerTimer != null) {
    window.clearTimeout(autoAnswerTimer);
    autoAnswerTimer = null;
  }
}

function hide(): void {
  clearAutoAnswer();
  pendingNpcId = null;
  answering = false;
  root?.classList.remove('visible', 'connecting');
  if (avatarEl) {
    avatarEl.removeAttribute('src');
    avatarEl.classList.add('empty');
  }
  if (statusEl) statusEl.textContent = 'Входящий вызов';
}

function answer(): void {
  if (!host || !pendingNpcId || answering) return;
  answering = true;
  const npcId = pendingNpcId;
  root?.classList.add('connecting');
  if (statusEl) statusEl.textContent = 'Связь…';
  host.onAnswer(npcId);
  hide();
}

function ignore(): void {
  if (!pendingNpcId || answering) return;
  host?.onToast?.('Вызов сброшен');
  hide();
}

export function mountRadioCall(el: HTMLElement, nextHost: RadioCallHost): void {
  host = nextHost;
  root = el;
  avatarEl = el.querySelector('#radio-call-avatar') as HTMLImageElement;
  nameEl = el.querySelector('#radio-call-name') as HTMLElement;
  statusEl = el.querySelector('#radio-call-status') as HTMLElement;
  el.querySelector('#radio-call-answer')?.addEventListener('click', () => answer());
  el.querySelector('#radio-call-ignore')?.addEventListener('click', () => ignore());
}

/** Показать рамку входящего вызова (слева сверху, напротив миникарты). */
export function showRadioIncoming(npcId: string): void {
  if (!host || !root || !avatarEl || !nameEl || !statusEl) return;
  if (pendingNpcId === npcId && root.classList.contains('visible')) return;

  answering = false;
  pendingNpcId = npcId;
  nameEl.textContent = RADIO_NPC_LABELS[npcId] ?? npcId;
  statusEl.textContent = 'Входящий вызов';
  root.classList.remove('connecting');
  root.classList.add('visible');
  root.style.left = `${MARGIN}px`;
  root.style.top = `${MARGIN}px`;

  const portraitId = dialoguePortraitId(npcId, 'neutral');
  const url =
    host.assetUrl(portraitId) ??
    host.assetUrl(dialoguePortraitId(npcId, 'serious')) ??
    host.assetUrl(dialoguePortraitId(npcId, 'action'));
  if (url) {
    avatarEl.classList.remove('empty');
    avatarEl.src = url;
    avatarEl.alt = nameEl.textContent;
  } else {
    avatarEl.classList.add('empty');
    avatarEl.removeAttribute('src');
    avatarEl.alt = '';
  }

  host.onToast?.('Рация: входящий вызов');

  clearAutoAnswer();
  autoAnswerTimer = window.setTimeout(() => {
    autoAnswerTimer = null;
    answer();
  }, 2200);
}

export function dismissRadioCall(): void {
  hide();
}

export function isRadioCallVisible(): boolean {
  return Boolean(root?.classList.contains('visible'));
}
