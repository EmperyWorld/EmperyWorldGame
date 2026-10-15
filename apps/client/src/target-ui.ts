export interface TargetInfo {
  saveId: string;
  name: string;
}

export interface TargetActionsState {
  canInvite: boolean;
  canWhisper: boolean;
  canResurrect: boolean;
  canPromote: boolean;
  canAssist: boolean;
  /** Цель уже назначена лидером как assist */
  assistActive: boolean;
}

export interface TargetHost {
  invite: (toName: string) => void;
  whisper: (toName: string) => void;
  resurrect: (saveId: string) => void;
  promote: (saveId: string) => void;
  assist: (saveId: string | null) => void;
  clear: () => void;
}

let root: HTMLElement | null = null;
let nameEl: HTMLElement | null = null;
let inviteBtn: HTMLButtonElement | null = null;
let whisperBtn: HTMLButtonElement | null = null;
let resurrectBtn: HTMLButtonElement | null = null;
let promoteBtn: HTMLButtonElement | null = null;
let assistBtn: HTMLButtonElement | null = null;
let clearBtn: HTMLButtonElement | null = null;
let host: TargetHost | null = null;
let current: TargetInfo | null = null;
let state: TargetActionsState = {
  canInvite: false,
  canWhisper: false,
  canResurrect: false,
  canPromote: false,
  canAssist: false,
  assistActive: false,
};

export function mountTargetActions(el: HTMLElement, nextHost: TargetHost): void {
  root = el;
  host = nextHost;
  nameEl = el.querySelector('#hud-target-name');
  inviteBtn = el.querySelector('#target-invite');
  whisperBtn = el.querySelector('#target-whisper');
  resurrectBtn = el.querySelector('#target-resurrect');
  promoteBtn = el.querySelector('#target-promote');
  assistBtn = el.querySelector('#target-assist');
  clearBtn = el.querySelector('#target-clear');

  inviteBtn?.addEventListener('click', () => {
    if (!current || !state.canInvite) return;
    host?.invite(current.name);
  });
  whisperBtn?.addEventListener('click', () => {
    if (!current || !state.canWhisper) return;
    host?.whisper(current.name);
  });
  resurrectBtn?.addEventListener('click', () => {
    if (!current || !state.canResurrect) return;
    host?.resurrect(current.saveId);
  });
  promoteBtn?.addEventListener('click', () => {
    if (!current || !state.canPromote) return;
    host?.promote(current.saveId);
  });
  assistBtn?.addEventListener('click', () => {
    if (!current) return;
    if (state.assistActive) host?.assist(null);
    else if (state.canAssist) host?.assist(current.saveId);
  });
  clearBtn?.addEventListener('click', () => {
    host?.clear();
  });

  setTargetUi(null, state);
}

export function setTargetUi(info: TargetInfo | null, next: TargetActionsState): void {
  current = info;
  state = next;
  if (!root || !nameEl) return;
  if (!info) {
    root.classList.add('hidden');
    nameEl.textContent = '—';
    hideAllActions();
    return;
  }
  root.classList.remove('hidden');
  nameEl.textContent = info.name;
  toggleBtn(inviteBtn, next.canInvite);
  toggleBtn(whisperBtn, next.canWhisper);
  toggleBtn(resurrectBtn, next.canResurrect);
  toggleBtn(promoteBtn, next.canPromote);
  if (assistBtn) {
    const show = next.canAssist || next.assistActive;
    toggleBtn(assistBtn, show);
    assistBtn.textContent = next.assistActive ? 'Сброс цели' : 'Цель пати';
  }
}

function hideAllActions(): void {
  toggleBtn(inviteBtn, false);
  toggleBtn(whisperBtn, false);
  toggleBtn(resurrectBtn, false);
  toggleBtn(promoteBtn, false);
  toggleBtn(assistBtn, false);
}

function toggleBtn(btn: HTMLButtonElement | null, show: boolean): void {
  if (!btn) return;
  btn.classList.toggle('hidden', !show);
}
