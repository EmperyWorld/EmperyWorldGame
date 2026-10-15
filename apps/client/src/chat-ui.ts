import type { ChatChannel, MultiplayerChatMessage } from './api.js';
import { getClientSetting, setClientSetting } from './settings-store.js';

const CHAT_LOG_MAX = 80;
export interface ChatHost {
  sendLocation: (text: string) => void;
  sendGlobal: (text: string) => void;
  sendPrivate: (toName: string, text: string) => void;
  sendParty: (text: string) => void;
  inviteToParty: (toName: string) => void;
  onFocusChange?: (focused: boolean) => void;
}

let root: HTMLElement | null = null;
let logEl: HTMLElement | null = null;
let inputEl: HTMLInputElement | null = null;
let formEl: HTMLFormElement | null = null;
let host: ChatHost | null = null;
let focused = false;
let collapsed = true;
let toggleBtn: HTMLButtonElement | null = null;

function isCollapsedSetting(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

function setCollapsed(next: boolean): void {
  collapsed = next;
  if (!root) return;
  root.classList.toggle('chat-collapsed', next);
  if (toggleBtn) {
    toggleBtn.textContent = next ? '▴' : '▾';
    toggleBtn.title = next ? 'Развернуть чат' : 'Свернуть чат';
  }
  setClientSetting('chatCollapsed', next);
}

export function mountChat(el: HTMLElement, nextHost: ChatHost): void {
  root = el;
  host = nextHost;
  logEl = el.querySelector('#chat-log');
  formEl = el.querySelector('#chat-form');
  inputEl = el.querySelector('#chat-input');
  toggleBtn = el.querySelector('#chat-toggle-btn');
  const storedCollapsed = getClientSetting('chatCollapsed');
  collapsed = isCollapsedSetting(storedCollapsed) ? storedCollapsed : true;
  setCollapsed(collapsed);

  el.querySelector('#chat-header')?.addEventListener('click', () => {
    if (collapsed) setCollapsed(false);
    focusChat();
  });
  toggleBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    setCollapsed(!collapsed);
    if (!collapsed) focusChat();
    else blurChat();
  });

  formEl?.addEventListener('submit', (e) => {
    e.preventDefault();
    submitChat();
  });

  inputEl?.addEventListener('focus', () => {
    focused = true;
    root?.classList.add('chat-focused');
    host?.onFocusChange?.(true);
  });
  inputEl?.addEventListener('blur', () => {
    focused = false;
    root?.classList.remove('chat-focused');
    host?.onFocusChange?.(false);
  });

  logEl?.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement | null)?.closest('[data-whisper]');
    if (!(target instanceof HTMLElement)) return;
    const name = target.dataset.whisper?.trim();
    if (!name) return;
    e.preventDefault();
    if ((e as MouseEvent).shiftKey) {
      host?.inviteToParty(name);
      appendChatSystem(`Приглашение: ${name}`);
      return;
    }
    startWhisper(name);
  });
}

export function isChatFocused(): boolean {
  return focused;
}

export function focusChat(): void {
  if (collapsed) setCollapsed(false);
  inputEl?.focus();
}

export function blurChat(): void {
  inputEl?.blur();
}

/** Fill input with /w Name and focus for a private reply. */
export function startWhisper(name: string): void {
  if (!inputEl || !name.trim()) return;
  const quoted = formatWhisperTarget(name.trim());
  inputEl.value = `/w ${quoted} `;
  focusChat();
  const len = inputEl.value.length;
  inputEl.setSelectionRange(len, len);
}

/** Открыть чат с префиксом пати. */
export function startPartyChat(): void {
  if (!inputEl) return;
  if (!inputEl.value.startsWith('/p ')) {
    inputEl.value = '/p ';
  }
  focusChat();
  const len = inputEl.value.length;
  inputEl.setSelectionRange(len, len);
}

export function appendChatMessage(msg: MultiplayerChatMessage, selfSaveId?: string): void {
  if (!logEl) return;
  const line = document.createElement('div');
  line.className = `chat-line chat-${msg.channel}`;

  const tag = document.createElement('span');
  tag.className = 'chat-tag';
  tag.textContent = channelTag(msg.channel);
  line.appendChild(tag);
  line.appendChild(document.createTextNode(' '));

  if (msg.channel === 'private') {
    const mine = Boolean(selfSaveId && msg.fromSaveId === selfSaveId);
    if (mine) {
      line.appendChild(document.createTextNode('→ '));
      line.appendChild(
        makeWho(msg.toName ?? '?', msg.toSaveId !== selfSaveId ? msg.toName : undefined),
      );
    } else {
      line.appendChild(document.createTextNode('← '));
      line.appendChild(
        makeWho(msg.fromName, msg.fromSaveId !== selfSaveId ? msg.fromName : undefined),
      );
    }
  } else {
    line.appendChild(
      makeWho(msg.fromName, msg.fromSaveId !== selfSaveId ? msg.fromName : undefined),
    );
  }

  line.appendChild(document.createTextNode(`: ${msg.text}`));
  logEl.appendChild(line);
  while (logEl.childElementCount > CHAT_LOG_MAX) {
    logEl.firstElementChild?.remove();
  }
  logEl.scrollTop = logEl.scrollHeight;
}

export function appendChatSystem(text: string): void {
  if (!logEl) return;
  const line = document.createElement('div');
  line.className = 'chat-line chat-system';
  line.textContent = text;
  logEl.appendChild(line);
  while (logEl.childElementCount > CHAT_LOG_MAX) {
    logEl.firstElementChild?.remove();
  }
  logEl.scrollTop = logEl.scrollHeight;
}

export function clearChatLog(): void {
  if (logEl) logEl.innerHTML = '';
}

function channelTag(channel: ChatChannel): string {
  if (channel === 'private') return 'ЛС';
  if (channel === 'global') return 'Мир';
  if (channel === 'party') return 'Пати';
  return 'Лок';
}

function makeWho(label: string, whisperTo?: string): HTMLElement {
  const who = document.createElement('span');
  who.className = whisperTo ? 'chat-who chat-who-click' : 'chat-who';
  who.textContent = label;
  if (whisperTo) {
    who.dataset.whisper = whisperTo;
    who.title = `ЛС: ${whisperTo} · Shift+клик — в пати`;
  }
  return who;
}

function formatWhisperTarget(name: string): string {
  return /\s|"/.test(name) ? `"${name.replace(/"/g, '')}"` : name;
}

function parseWhisper(raw: string): { toName: string; text: string } | null {
  const quoted = raw.match(/^\/(?:w|whisper|л|лс)\s+"([^"]+)"\s+(.+)$/i);
  if (quoted) return { toName: quoted[1]!.trim(), text: quoted[2]!.trim() };
  const plain = raw.match(/^\/(?:w|whisper|л|лс)\s+(\S+)\s+(.+)$/i);
  if (plain) return { toName: plain[1]!.trim(), text: plain[2]!.trim() };
  return null;
}

/** World chat: "+ текст" or "/+ текст". */
function parseGlobal(raw: string): string | null {
  const m = raw.match(/^(?:\+|\/\+)\s*(.+)$/);
  return m?.[1]?.trim() ? m[1].trim() : null;
}

function parsePartyChat(raw: string): string | null {
  const m = raw.match(/^\/(?:p|party|пати)\s+(.+)$/i);
  return m?.[1]?.trim() ? m[1].trim() : null;
}

function parseInvite(raw: string): string | null {
  const quoted = raw.match(/^\/(?:invite|inv|пригласить)\s+"([^"]+)"\s*$/i);
  if (quoted) return quoted[1]!.trim();
  const plain = raw.match(/^\/(?:invite|inv|пригласить)\s+(\S+)\s*$/i);
  return plain?.[1]?.trim() ?? null;
}

function submitChat(): void {
  if (!inputEl || !host) return;
  const raw = inputEl.value.trim();
  if (!raw) return;

  const whisper = parseWhisper(raw);
  if (whisper) {
    if (!whisper.toName || !whisper.text) {
      appendChatSystem('Формат: /w Имя текст');
      return;
    }
    host.sendPrivate(whisper.toName, whisper.text);
    inputEl.value = `/w ${formatWhisperTarget(whisper.toName)} `;
    const len = inputEl.value.length;
    inputEl.setSelectionRange(len, len);
    return;
  }
  if (/^\/(?:w|whisper|л|лс)\b/i.test(raw)) {
    appendChatSystem('Формат: /w Имя текст · или клик по нику');
    return;
  }

  const inviteName = parseInvite(raw);
  if (inviteName) {
    inputEl.value = '';
    host.inviteToParty(inviteName);
    appendChatSystem(`Приглашение: ${inviteName}`);
    return;
  }
  if (/^\/(?:invite|inv|пригласить)\b/i.test(raw)) {
    appendChatSystem('Формат: /invite Имя');
    return;
  }

  const partyText = parsePartyChat(raw);
  if (partyText) {
    inputEl.value = '';
    host.sendParty(partyText);
    return;
  }
  if (/^\/(?:p|party|пати)\b/i.test(raw)) {
    appendChatSystem('Пати: /p текст');
    return;
  }

  const globalText = parseGlobal(raw);
  if (globalText) {
    inputEl.value = '';
    host.sendGlobal(globalText);
    return;
  }
  if (raw === '+' || raw === '/+') {
    appendChatSystem('Мир: + текст');
    return;
  }

  if (raw.startsWith('/')) {
    appendChatSystem('Лок · + мир · /p пати · /w ЛС · /invite Имя');
    return;
  }

  inputEl.value = '';
  host.sendLocation(raw);
}
