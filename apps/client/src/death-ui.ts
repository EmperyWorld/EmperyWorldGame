import {
  deathXpPercent,
  inferDeathKind,
  SURVIVAL_COLLAPSE_CAUSE_PREFIX,
  type DeathKind,
} from '@empery/shared';

export { SURVIVAL_COLLAPSE_CAUSE_PREFIX };

export function deathTitle(kind: DeathKind): string {
  if (kind === 'doom') return 'Гибель';
  if (kind === 'faint') return 'Обморок';
  return 'Поражение';
}

export function respawnButtonLabel(kind: DeathKind): string {
  return `В Гавань (−${deathXpPercent(kind)}% XP)`;
}

function xpHint(kind: DeathKind): string {
  return `Гавань: −${deathXpPercent(kind)}% опыта уровня.`;
}

const COMBAT_HINT = `${xpHint('combat')} Или жди свиток от живого игрока — воскресят на месте.`;
const FAINT_HINT = `${xpHint('faint')} Истощение лечит бинт или Сера.`;
const DOOM_HINT = `${xpHint('doom')} Травма не была снята. Лечение — бинт или Сера. Ещё −10% адены.`;

export function isSurvivalCollapseCause(cause: string | null | undefined): boolean {
  return inferDeathKind(cause) === 'faint';
}

export function isSurvivalDoomCause(cause: string | null | undefined, kind?: DeathKind | null): boolean {
  return inferDeathKind(cause, kind) === 'doom';
}

function hintFor(kind: DeathKind): string {
  if (kind === 'doom') return DOOM_HINT;
  if (kind === 'faint') return FAINT_HINT;
  return COMBAT_HINT;
}

/** Sync death overlay title, hint, button, and panel tint. */
export function syncDeathScreen(cause?: string | null, kind?: DeathKind | null): void {
  const hint = document.getElementById('death-hint');
  const title = document.getElementById('death-title');
  const btn = document.getElementById('respawn-btn');
  const screen = document.getElementById('death-screen');
  const trimmed = cause?.trim() ?? '';
  const resolved = inferDeathKind(trimmed || null, kind);
  if (title) title.textContent = deathTitle(resolved);
  if (btn) btn.textContent = respawnButtonLabel(resolved);
  if (screen) screen.dataset.kind = resolved;
  if (!hint) return;
  if (!trimmed) {
    hint.textContent = hintFor(resolved);
    return;
  }
  hint.textContent = `${trimmed} ${hintFor(resolved)}`;
}

export function resetDeathScreen(): void {
  const title = document.getElementById('death-title');
  if (title) title.textContent = 'Поражение';
  const hint = document.getElementById('death-hint');
  if (hint) hint.textContent = COMBAT_HINT;
  const btn = document.getElementById('respawn-btn');
  if (btn) btn.textContent = respawnButtonLabel('combat');
  const screen = document.getElementById('death-screen');
  if (screen) delete screen.dataset.kind;
}
