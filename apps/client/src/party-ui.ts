import { PARTY_XP_RANGE, type PartyInvitePayload, type PartySnapshot } from './api.js';

export interface PartyHost {
  invite: (toName: string) => void;
  accept: (partyId: string) => void;
  decline: (partyId: string) => void;
  leave: () => void;
  kick: (saveId: string) => void;
  disband: () => void;
  promote?: (saveId: string) => void;
  selectMember?: (saveId: string, name: string) => void;
  takeAssistTarget?: () => void;
  onFocusChange?: (focused: boolean) => void;
}

export interface PartyXpContext {
  selfLocationId: string | null;
  /** world positions of players in current location (saveId → xy) */
  positions: Map<string, { x: number; y: number }>;
  selfPos: { x: number; y: number } | null;
}

let root: HTMLElement | null = null;
let listEl: HTMLElement | null = null;
let inviteEl: HTMLElement | null = null;
let actionsEl: HTMLElement | null = null;
let host: PartyHost | null = null;
let selfSaveId: string | null = null;
let current: PartySnapshot | null = null;
let pendingInvite: PartyInvitePayload | null = null;
let selectedSaveId: string | null = null;
let inviteTimer: ReturnType<typeof setInterval> | null = null;
let xpCtx: PartyXpContext = { selfLocationId: null, positions: new Map(), selfPos: null };
/** Клиентский оверлей бафов союзников (из ally_cast). */
const memberBuffs = new Map<
  string,
  Array<{ id: string; name: string; remainingMs: number; detail?: string; until: number }>
>();
let buffTickTimer: ReturnType<typeof setInterval> | null = null;

export function mountParty(el: HTMLElement, nextHost: PartyHost): void {
  root = el;
  host = nextHost;
  listEl = el.querySelector('#party-list');
  inviteEl = el.querySelector('#party-invite');
  actionsEl = el.querySelector('#party-actions');
  render();
}

export function setPartySelf(saveId: string | null): void {
  selfSaveId = saveId;
  render();
}

export function setPartyXpContext(next: PartyXpContext): void {
  xpCtx = next;
  refreshXpHints();
}

export function applyPartySnapshot(snapshot: PartySnapshot | null): void {
  current = snapshot;
  if (snapshot) {
    pendingInvite = null;
    const ids = new Set(snapshot.members.map((m) => m.saveId));
    for (const id of memberBuffs.keys()) {
      if (!ids.has(id)) memberBuffs.delete(id);
    }
  } else {
    memberBuffs.clear();
    stopBuffTicker();
  }
  stopInviteTimer();
  render();
}

export function applyPartyInvite(invite: PartyInvitePayload): void {
  pendingInvite = invite;
  if (root) root.classList.remove('hidden');
  startInviteTimer();
  render();
}

export function clearPartyUi(): void {
  current = null;
  pendingInvite = null;
  selfSaveId = null;
  selectedSaveId = null;
  memberBuffs.clear();
  stopBuffTicker();
  stopInviteTimer();
  render();
  root?.classList.add('hidden');
}

export function getPartySnapshot(): PartySnapshot | null {
  return current;
}

export function getPartyMemberSaveIds(): string[] {
  return current?.members.map((m) => m.saveId) ?? [];
}

export function isInPartyWith(saveId: string): boolean {
  return Boolean(current?.members.some((m) => m.saveId === saveId));
}

export function isPartyLeader(): boolean {
  return Boolean(current && selfSaveId && current.leaderSaveId === selfSaveId);
}

export function setPartySelected(saveId: string | null): void {
  selectedSaveId = saveId;
  if (!listEl) return;
  for (const row of listEl.querySelectorAll('.party-member')) {
    const id = (row as HTMLElement).dataset.saveId;
    row.classList.toggle('selected', Boolean(id && id === saveId));
  }
}

/** Обновить HP/MP члена пати из presence (без полного snapshot). */
export function patchPartyMemberVitals(
  saveId: string,
  vitals: {
    hp?: number;
    maxHp?: number;
    mp?: number;
    maxMp?: number;
    online?: boolean;
    locationId?: string | null;
    locationName?: string | null;
    pvpStatus?: string;
    inCombat?: boolean;
    buffLabels?: Array<{ id: string; name: string; remainingMs: number; detail?: string }>;
  },
): void {
  if (!current) return;
  const m = current.members.find((x) => x.saveId === saveId);
  if (!m) return;
  let changed = false;
  if (vitals.hp !== undefined && m.hp !== vitals.hp) {
    m.hp = vitals.hp;
    changed = true;
  }
  if (vitals.maxHp !== undefined && m.maxHp !== vitals.maxHp) {
    m.maxHp = vitals.maxHp;
    changed = true;
  }
  if (vitals.mp !== undefined && m.mp !== vitals.mp) {
    m.mp = vitals.mp;
    changed = true;
  }
  if (vitals.maxMp !== undefined && m.maxMp !== vitals.maxMp) {
    m.maxMp = vitals.maxMp;
    changed = true;
  }
  if (vitals.online !== undefined && m.online !== vitals.online) {
    m.online = vitals.online;
    changed = true;
  }
  if (vitals.locationId !== undefined && m.locationId !== vitals.locationId) {
    m.locationId = vitals.locationId;
    changed = true;
  }
  if (vitals.locationName !== undefined && m.locationName !== vitals.locationName) {
    m.locationName = vitals.locationName;
    changed = true;
  }
  if (vitals.pvpStatus !== undefined && m.pvpStatus !== vitals.pvpStatus) {
    m.pvpStatus = vitals.pvpStatus as typeof m.pvpStatus;
    changed = true;
  }
  if (vitals.inCombat !== undefined && m.inCombat !== vitals.inCombat) {
    m.inCombat = vitals.inCombat;
    changed = true;
  }
  if (vitals.buffLabels !== undefined) {
    const now = Date.now();
    const next = vitals.buffLabels
      .filter((b) => b.remainingMs > 0)
      .map((b) => ({ ...b, until: now + b.remainingMs }));
    if (next.length > 0) memberBuffs.set(saveId, next);
    else memberBuffs.delete(saveId);
    changed = true;
    ensureBuffTicker();
  }
  if (!changed) {
    refreshXpHints();
    return;
  }

  const row = listEl?.querySelector(`.party-member[data-save-id="${CSS.escape(saveId)}"]`) as HTMLElement | null;
  if (!row) {
    render();
    return;
  }
  row.classList.toggle('offline', !m.online);
  row.classList.toggle('dead', m.online && (m.hp ?? 1) <= 0);
  row.classList.toggle('in-combat', Boolean(m.inCombat));
  row.dataset.pvp = m.pvpStatus ?? 'peaceful';
  const bars = row.querySelector('.party-bars');
  if (bars) bars.innerHTML = barHtml('hp', m.hp, m.maxHp) + barHtml('mp', m.mp, m.maxMp);
  updateMemberMeta(row, m);
  updateMemberBuffs(row, saveId);
  refreshXpHints();
}

function ensureBuffTicker(): void {
  if (buffTickTimer) return;
  buffTickTimer = setInterval(() => {
    const now = Date.now();
    let any = false;
    for (const [id, list] of memberBuffs) {
      const next = list.filter((b) => b.until > now);
      if (next.length === 0) memberBuffs.delete(id);
      else {
        memberBuffs.set(id, next);
        any = true;
      }
      const row = listEl?.querySelector(
        `.party-member[data-save-id="${CSS.escape(id)}"]`,
      ) as HTMLElement | null;
      if (row) updateMemberBuffs(row, id);
    }
    if (!any && memberBuffs.size === 0) stopBuffTicker();
  }, 1000);
}

function stopBuffTicker(): void {
  if (buffTickTimer) {
    clearInterval(buffTickTimer);
    buffTickTimer = null;
  }
}

function updateMemberBuffs(row: HTMLElement, saveId: string): void {
  let wrap = row.querySelector('.party-buffs') as HTMLElement | null;
  const list = memberBuffs.get(saveId) ?? [];
  const now = Date.now();
  const live = list.filter((b) => b.until > now);
  if (live.length === 0) {
    wrap?.remove();
    return;
  }
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'party-buffs';
    row.appendChild(wrap);
  }
  wrap.innerHTML = live
    .slice(0, 4)
    .map((b) => {
      const sec = Math.max(1, Math.ceil((b.until - now) / 1000));
      const tip = b.detail ? `${b.name} ${b.detail}` : b.name;
      return `<span class="party-buff" title="${escapeHtml(tip)}">${escapeHtml(b.name)} ${sec}с</span>`;
    })
    .join('');
}

function memberLocLine(m: PartySnapshot['members'][0]): string {
  if (!m.online) return 'оффлайн';
  if ((m.hp ?? 1) <= 0) return 'мёртв';
  return m.locationName ?? m.locationId ?? '—';
}

function xpShareState(m: PartySnapshot['members'][0]): 'ok' | 'far' | 'away' | 'offline' | 'dead' | 'self' {
  if (m.saveId === selfSaveId) return 'self';
  if (!m.online) return 'offline';
  if ((m.hp ?? 1) <= 0) return 'dead';
  if (!xpCtx.selfLocationId || m.locationId !== xpCtx.selfLocationId) return 'away';
  const pos = xpCtx.positions.get(m.saveId);
  const self = xpCtx.selfPos;
  if (!pos || !self) return 'ok';
  const dist = Math.hypot(pos.x - self.x, pos.y - self.y);
  return dist <= PARTY_XP_RANGE ? 'ok' : 'far';
}

function xpShareLabel(state: ReturnType<typeof xpShareState>): string {
  switch (state) {
    case 'ok':
      return 'XP ок';
    case 'far':
      return 'далеко';
    case 'away':
      return 'др. локация';
    case 'offline':
      return 'оффлайн';
    case 'dead':
      return 'мёртв';
    default:
      return '';
  }
}

function pvpMark(status: string | undefined): string {
  if (status === 'chaotic') return 'ПК';
  if (status === 'flagged') return 'PvP';
  return '';
}

function updateMemberMeta(row: HTMLElement, m: PartySnapshot['members'][0]): void {
  const meta = row.querySelector('.party-meta');
  if (!meta) return;
  const dead = m.online && (m.hp ?? 1) <= 0;
  const combat = !dead && m.inCombat ? ' · бой' : '';
  const pvp = pvpMark(m.pvpStatus);
  meta.textContent = dead
    ? `lvl ${m.level} · пал`
    : `lvl ${m.level}${pvp ? ` ${pvp}` : ''}${combat}`;
  const loc = row.querySelector('.party-loc');
  if (loc) loc.textContent = memberLocLine(m);
  const xp = row.querySelector('.party-xp');
  if (xp) {
    const st = xpShareState(m);
    xp.textContent = xpShareLabel(st);
    xp.className = `party-xp xp-${st}`;
  }
  row.classList.toggle('dead', dead);
}

function refreshXpHints(): void {
  if (!listEl || !current) return;
  for (const m of current.members) {
    const row = listEl.querySelector(`.party-member[data-save-id="${CSS.escape(m.saveId)}"]`) as HTMLElement | null;
    if (row) updateMemberMeta(row, m);
  }
}

function barHtml(kind: 'hp' | 'mp', cur: number | null, max: number | null): string {
  if (cur == null || max == null || max <= 0) {
    return `<div class="party-bar party-bar-${kind}"><div class="party-bar-fill" style="width:0%"></div></div>`;
  }
  const pct = Math.max(0, Math.min(100, Math.round((cur / max) * 100)));
  return `<div class="party-bar party-bar-${kind}" title="${cur}/${max}"><div class="party-bar-fill" style="width:${pct}%"></div></div>`;
}

function startInviteTimer(): void {
  stopInviteTimer();
  inviteTimer = setInterval(() => {
    if (!pendingInvite) {
      stopInviteTimer();
      return;
    }
    if (Date.now() > pendingInvite.expiresAt) {
      pendingInvite = null;
      stopInviteTimer();
      render();
      return;
    }
    const ttl = inviteEl?.querySelector('.party-invite-ttl');
    if (ttl) ttl.textContent = inviteTtlText(pendingInvite.expiresAt);
  }, 500);
}

function stopInviteTimer(): void {
  if (inviteTimer) {
    clearInterval(inviteTimer);
    inviteTimer = null;
  }
}

function inviteTtlText(expiresAt: number): string {
  const sec = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  return `${sec}с`;
}

function render(): void {
  if (!root || !listEl || !inviteEl || !actionsEl) return;

  if (!current && !pendingInvite) {
    root.classList.add('hidden');
    listEl.innerHTML = '';
    inviteEl.innerHTML = '';
    actionsEl.innerHTML = '';
    return;
  }

  root.classList.remove('hidden');
  inviteEl.innerHTML = '';
  actionsEl.innerHTML = '';
  listEl.innerHTML = '';

  if (pendingInvite && (!current || current.id !== pendingInvite.partyId)) {
    const box = document.createElement('div');
    box.className = 'party-invite-box';
    box.innerHTML = `<div>В пати от <strong>${escapeHtml(pendingInvite.fromName)}</strong> <span class="party-invite-ttl">${inviteTtlText(pendingInvite.expiresAt)}</span></div>`;
    const row = document.createElement('div');
    row.className = 'party-invite-actions';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = 'Принять';
    ok.onclick = () => {
      host?.accept(pendingInvite!.partyId);
      pendingInvite = null;
      stopInviteTimer();
      render();
    };
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'btn-danger';
    no.textContent = 'Отклонить';
    no.onclick = () => {
      host?.decline(pendingInvite!.partyId);
      pendingInvite = null;
      stopInviteTimer();
      render();
    };
    row.append(ok, no);
    box.appendChild(row);
    inviteEl.appendChild(box);
  }

  if (!current) return;

  const title = document.createElement('div');
  title.className = 'party-title';
  title.textContent = `Пати (${current.members.length})`;
  listEl.appendChild(title);

  if (current.assistTargetSaveId && current.assistTargetName) {
    const assist = document.createElement('div');
    assist.className = 'party-assist';
    const member = current.members.find((m) => m.saveId === current!.assistTargetSaveId);
    const dead = member && member.online && (member.hp ?? 1) <= 0;
    const away =
      member &&
      xpCtx.selfLocationId &&
      member.locationId &&
      member.locationId !== xpCtx.selfLocationId;
    const hint = dead ? ' (пал)' : away ? ' (др. локация)' : '';
    assist.innerHTML = `Цель пати: <strong>${escapeHtml(current.assistTargetName)}</strong>${hint}`;
    const take = document.createElement('button');
    take.type = 'button';
    take.textContent = 'Взять';
    take.disabled = Boolean(dead || away || (member && !member.online));
    take.title = take.disabled ? 'Цель недоступна здесь' : 'Взять в таргет';
    take.onclick = () => host?.takeAssistTarget?.();
    assist.appendChild(take);
    listEl.appendChild(assist);
  }

  const isLeader = selfSaveId === current.leaderSaveId;

  for (const m of current.members) {
    const row = document.createElement('div');
    row.className =
      'party-member' +
      (m.online ? '' : ' offline') +
      (m.online && (m.hp ?? 1) <= 0 ? ' dead' : '') +
      (m.saveId === selectedSaveId ? ' selected' : '') +
      (m.saveId === selfSaveId ? ' self' : '') +
      (m.inCombat && (m.hp ?? 1) > 0 ? ' in-combat' : '');
    row.dataset.saveId = m.saveId;
    row.dataset.pvp = m.pvpStatus ?? 'peaceful';

    const leaderMark = m.saveId === current.leaderSaveId ? '★ ' : '';
    const xpSt = xpShareState(m);

    const head = document.createElement('div');
    head.className = 'party-member-head';
    head.innerHTML = `<span class="party-name">${leaderMark}${escapeHtml(m.name)}</span><span class="party-meta"></span>`;

    const sub = document.createElement('div');
    sub.className = 'party-sub';
    sub.innerHTML = `<span class="party-loc"></span><span class="party-xp xp-${xpSt}"></span>`;

    const bars = document.createElement('div');
    bars.className = 'party-bars';
    bars.innerHTML = barHtml('hp', m.hp, m.maxHp) + barHtml('mp', m.mp, m.maxMp);

    row.append(head, sub, bars);
    updateMemberMeta(row, m);
    updateMemberBuffs(row, m.saveId);

    if (m.saveId !== selfSaveId) {
      row.classList.add('clickable');
      row.onclick = (ev) => {
        if ((ev.target as HTMLElement).closest('button')) return;
        host?.selectMember?.(m.saveId, m.name);
      };
    }

    if (isLeader && m.saveId !== selfSaveId) {
      const promote = document.createElement('button');
      promote.type = 'button';
      promote.className = 'party-promote';
      promote.title = 'Сделать лидером';
      promote.textContent = '★';
      promote.onclick = (ev) => {
        ev.stopPropagation();
        host?.promote?.(m.saveId);
      };
      head.appendChild(promote);

      const kick = document.createElement('button');
      kick.type = 'button';
      kick.className = 'party-kick';
      kick.title = 'Кикнуть';
      kick.textContent = '×';
      kick.onclick = (ev) => {
        ev.stopPropagation();
        host?.kick(m.saveId);
      };
      head.appendChild(kick);
    }
    listEl.appendChild(row);
  }

  const leaveBtn = document.createElement('button');
  leaveBtn.type = 'button';
  leaveBtn.textContent = 'Выйти';
  leaveBtn.onclick = () => host?.leave();
  actionsEl.appendChild(leaveBtn);

  if (isLeader) {
    const disbandBtn = document.createElement('button');
    disbandBtn.type = 'button';
    disbandBtn.className = 'btn-danger';
    disbandBtn.textContent = 'Распустить';
    disbandBtn.onclick = () => host?.disband();
    actionsEl.appendChild(disbandBtn);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
