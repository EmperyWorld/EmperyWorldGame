import type Phaser from 'phaser';
import type { PlayerSave, PlayerStats, SkillDefinition } from './api.js';
import { restSurvival } from './api.js';
import { playSurvivalBreathCue } from './survival-audio.js';
import { getGameScene } from './game/game-loader.js';
import type { LocationConfig } from './game/scenes/location-types.js';
import { formatQuestHud, formatQuestHudLabel } from './quest-hud.js';
import { appendMediaIcon } from './hud-atlas.js';
import {
  buildSkillIconEl,
  hasAnySkillCooldown,
  isSkillsOpen,
  renderSkillsPanel,
  skillCooldownProgress,
  skillCooldownSec,
  syncSkillCooldownsFromSave,
  SKILL_HOTBAR_SIZE,
} from './skills-ui.js';
import { isInventoryOpen, refreshInventoryChrome } from './inventory-ui.js';
import { mountCompanionPanel, type CompanionUiHandle } from './companion-ui.js';
import {
  buyCompanion,
  feedCompanion,
  trainCompanion,
} from './api.js';
import {
  GRAPHICS_CHANGED_EVENT,
  getGraphicsQuality,
  graphicsQualityLabel,
} from './game/systems/graphics-quality.js';
import { getClientSetting, setClientSetting } from './settings-store.js';

function formatAdena(n: number): string {
  return `${Math.max(0, Math.floor(n)).toLocaleString('ru-RU')}`;
}

type HudBuffEntry = {
  id: string;
  name: string;
  detail?: string;
  endsAt: number;
  kind: 'swarm' | 'dual' | 'auto' | 'pvp';
};

export interface HudControllerHost {
  getSave: () => PlayerSave | null;
  setSave: (save: PlayerSave) => void;
  getStats: () => PlayerStats | null;
  setStats: (stats: PlayerStats) => void;
  getSkills: () => SkillDefinition[];
  getActiveSkillIds: () => (string | null)[];
  syncActiveSkillIdsFromSave: () => void;
  getLocation: () => LocationConfig | null;
  getGame: () => Phaser.Game | null;
  isGameplayVisible: () => boolean;
  professionLabel: (id: string) => string;
  assetUrl: (assetId: string) => string | undefined;
  showToast: (text: string) => void;
}

/**
 * DOM HUD: HP/MP/XP, skill hotbar CD, buffs, PvP strip, auto-attack button.
 * Keeps combat-tick throttling and skill-CD sync out of main.ts.
 */
export class HudController {
  private lastCombatHudAt = 0;
  private skillCdTicker: ReturnType<typeof setInterval> | null = null;
  private autoAttackUiTimer: number | null = null;
  private hudBuffTicker: number | null = null;
  private readonly hudBuffStore = new Map<string, HudBuffEntry>();
  private staminaWrap: HTMLElement | null = null;
  private staminaBar: HTMLElement | null = null;
  private staminaLabel: HTMLElement | null = null;
  private lastStaminaText = '';
  private pstaminaBar: HTMLElement | null = null;
  private pstaminaLabel: HTMLElement | null = null;
  private lastPStaminaText = '';
  private lastHotbarKey = '';
  private lastAdenaText = '';
  private lastQuestText = '';
  private lastHpText = '';
  private lastMpText = '';
  private lastXpText = '';
  private lastSkillsPanelAt = 0;
  private lastCombatStatsKey = '';
  private readonly hpBar = document.getElementById('hp-bar');
  private readonly mpBar = document.getElementById('mp-bar');
  private readonly xpBar = document.getElementById('xp-bar');

  private readonly els = {
    name: document.getElementById('hud-name')!,
    meta: document.getElementById('hud-meta')!,
    level: document.getElementById('hud-level')!,
    location: document.getElementById('hud-location')!,
    survival: document.getElementById('hud-survival')!,
    survivalPanel: document.getElementById('hud-survival-panel'),
    survivalOverlay: document.getElementById('survival-overlay'),
    pvp: document.getElementById('hud-pvp')!,
    hp: document.getElementById('hud-hp')!,
    mp: document.getElementById('hud-mp')!,
    xp: document.getElementById('hud-xp')!,
    hpWrap: document.getElementById('hp-bar-wrap'),
    adena: document.getElementById('hud-adena')!,
    combatStats: document.getElementById('hud-combat-stats')!,
    skillSlots: document.getElementById('hud-skill-slots')!,
    passives: document.getElementById('hud-skills-passives')!,
    quest: document.getElementById('hud-quest')!,
    buffs: document.getElementById('hud-buffs')!,
    autoAttack: document.getElementById('action-auto-attack') as HTMLButtonElement,
    autoAttackLabel: document.getElementById('action-auto-attack-label')!,
  };
  private survivalPanelOpen = false;
  private lastSurvivalWarning = '';
  private lastSurvivalSeverity: 'ok' | 'deficit' | 'critical' = 'ok';
  private companionUi: CompanionUiHandle | null = null;
  private companionEventsBound = false;
  private readonly gfxChip = document.getElementById('hud-gfx') as HTMLButtonElement | null;

  private playSurvivalCue(severity: 'deficit' | 'critical'): void {
    playSurvivalBreathCue(severity);
  }
  constructor(private readonly host: HudControllerHost) {
    this.bindChrome();
  }

  private bindChrome(): void {
    this.syncGfxChip();
    window.addEventListener(GRAPHICS_CHANGED_EVENT, () => this.syncGfxChip());
    this.gfxChip?.addEventListener('click', () => {
      const actionSettings = document.getElementById('action-settings') as HTMLButtonElement | null;
      actionSettings?.click();
      const save = this.host.getSave();
      if (save && this.survivalPanelOpen) this.renderSurvival(save);
    });
    this.els.survival.setAttribute('role', 'button');
    this.els.survival.tabIndex = 0;
    this.els.survival.addEventListener('click', () => {
      const save = this.host.getSave();
      if (!save?.survival) return;
      this.survivalPanelOpen = !this.survivalPanelOpen;
      this.renderSurvival(save);
    });
    this.els.survival.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      this.els.survival.click();
    });
    document.addEventListener('pointerdown', (e) => {
      if (!this.survivalPanelOpen) return;
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (this.els.survival.contains(target) || this.els.survivalPanel?.contains(target)) return;
      this.closeSurvivalPanel();
    });
  }

  closeSurvivalPanel(): boolean {
    if (!this.survivalPanelOpen) return false;
    this.survivalPanelOpen = false;
    const save = this.host.getSave();
    if (save) this.renderSurvival(save);
    else this.els.survivalPanel?.classList.remove('open');
    return true;
  }

  private syncGfxChip(): void {
    if (!this.gfxChip) return;
    const label = graphicsQualityLabel(getGraphicsQuality());
    this.gfxChip.textContent = `Графика · ${label}`;
    this.gfxChip.title = `Качество графики: ${label}. Нажмите, чтобы открыть настройки.`;
  }

  update(
    next: PlayerSave,
    nextStats?: PlayerStats,
    opts?: { combatTick?: boolean },
  ): void {
    this.host.setSave(next);
    if (nextStats) this.host.setStats(nextStats);

    const stats = this.host.getStats();
    const game = this.host.getGame();
    const skills = this.host.getSkills();

    if (opts?.combatTick) {
      const now = performance.now();
      this.syncAndRenderSkillCooldowns(next);
      if (now - this.lastCombatHudAt < 120) {
        this.setQuestText(formatQuestHudLabel(formatQuestHud(next)));
        this.setAdenaText(formatAdena(next.adena ?? 0));
        this.pushCombatTickToScene(next, stats);
        return;
      }
      this.lastCombatHudAt = now;
    }

    const need = next.level * 50;
    const maxMp = next.maxMp ?? 0;
    const mp = next.mp ?? 0;
    const hpPct = next.maxHp > 0 ? Math.max(0, Math.min(100, (next.hp / next.maxHp) * 100)) : 0;
    const mpPct = maxMp > 0 ? Math.max(0, Math.min(100, (mp / maxMp) * 100)) : 0;
    const xpPct = need > 0 ? Math.max(0, Math.min(100, (next.xp / need) * 100)) : 0;
    if (this.hpBar) this.hpBar.style.width = `${hpPct}%`;
    if (this.mpBar) this.mpBar.style.width = `${mpPct}%`;
    if (this.xpBar) this.xpBar.style.width = `${xpPct}%`;
    this.els.hpWrap?.classList.toggle('low', hpPct > 0 && hpPct <= 25);
    this.setHpText(`HP ${next.hp}/${next.maxHp}`);
    this.setMpText(`MP ${mp}/${maxMp}`);
    this.setXpText(`XP ${next.xp}/${need}`);
    this.setAdenaText(formatAdena(next.adena ?? 0));

    if (opts?.combatTick) {
      this.pushCombatTickToScene(next, stats);
      return;
    }

    this.host.syncActiveSkillIdsFromSave();
    syncSkillCooldownsFromSave(skills, next);
    const loc = this.host.getLocation();
    this.els.name.textContent = next.name;
    this.els.meta.textContent = `${this.host.professionLabel(next.profession)}`;
    this.els.level.textContent = String(next.level);
    this.els.location.textContent = loc
      ? `${loc.name}${loc.safeZone ? ' · безоп. зона' : ''}`
      : next.location;
    this.renderSurvival(next);
    this.renderPvp(next);
    this.renderCombatStatsPills(stats);
    this.renderSkillsHud(true);
    if (game) {
      try {
        const scene = getGameScene(game);
        scene.setActiveSkillIds(this.host.getActiveSkillIds());
        scene.setSkillDefinitions(skills);
      } catch {
        /* scene not ready */
      }
    }

    this.setQuestText(formatQuestHudLabel(formatQuestHud(next)));

    if (game && stats) {
      try {
        const scene = getGameScene(game);
        if (scene.scene.isActive() && scene.getLocationId() === next.location) {
          scene.updateSave(next, stats);
        }
      } catch {
        /* GameScene not ready */
      }
    }
    if (isInventoryOpen()) refreshInventoryChrome();
  }

  private renderSurvival(save: PlayerSave): void {
    const state = save.survival;
    const panel = this.els.survivalPanel;
    const overlay = this.els.survivalOverlay;
    const reduced = getClientSetting('survivalFxReduced') || document.body.classList.contains('survival-fx-reduced');
    if (reduced) document.body.classList.add('survival-fx-reduced');

    if (!state) {
      this.els.survival.textContent = '';
      this.els.survival.className = '';
      this.els.survival.removeAttribute('aria-expanded');
      panel?.classList.remove('open');
      if (panel) panel.innerHTML = '';
      this.companionUi = null;
      if (overlay) overlay.className = '';
      return;
    }

    const labels: Record<string, string> = {
      hungry: 'голод',
      dehydrated: 'жажда',
      hypothermia: 'переохлаждение',
      hyperthermia: 'перегрев',
      fatigued: 'усталость',
      infection: 'инфекция',
      food_poisoning: 'отравление',
      exhaustion_injury: 'истощение',
      frostbite: 'обморожение',
      heatstroke: 'тепловой удар',
    };
    const icons: Record<string, string> = {
      hungry: 'ui_need_hungry',
      dehydrated: 'ui_need_dehydrated',
      hypothermia: 'ui_need_hypothermia',
      hyperthermia: 'ui_need_hyperthermia',
      fatigued: 'ui_need_fatigued',
      infection: 'ui_need_infection',
      food_poisoning: 'ui_need_food_poisoning',
      exhaustion_injury: 'ui_need_exhaustion_injury',
      frostbite: 'ui_need_frostbite',
      heatstroke: 'ui_need_heatstroke',
    };
    const hints: Record<string, string> = {
      hungry: 'Найди еду или отдохни в безопасной зоне.',
      dehydrated: 'Выпей чистую воду.',
      hypothermia: 'Согрейсь у огня или надень тёплую одежду.',
      hyperthermia: 'Остынь в тени и пей воду.',
      fatigued: 'Кнопка «Отдохнуть», трактир или сон дома.',
      infection: 'Нужны антибиотики или лекарь в Гавани.',
      food_poisoning: 'Нужны антибиотики или лекарь в Гавани.',
      exhaustion_injury: 'Бинт или Сера. Иначе следующий обморок — Гибель (−40% XP).',
      frostbite: 'Бинт, тепло и Сера. Иначе следующий обморок — Гибель (−40% XP).',
      heatstroke: 'Охлаждающий настой или Сера. Иначе следующий обморок — Гибель (−40% XP).',
    };
    const severityRu = (value: string): string => {
      if (value === 'critical') return 'критично';
      if (value === 'deficit') return 'дефицит';
      return value;
    };

    const critical = state.conditions.filter((entry) => entry.severity === 'critical');
    const deficit = state.conditions.filter((entry) => entry.severity === 'deficit');
    const severity = critical.length ? 'critical' : deficit.length ? 'deficit' : 'ok';
    const active = critical.length ? critical : deficit;
    this.els.survival.className = severity;
    const iconHtml = (assetId: string): string =>
      `<img class="sv-chip-icon" alt="" src="/media/assets/${assetId}.webp" />`;
    const activeIcons = active.map((entry) => iconHtml(icons[entry.id] ?? 'ui_need_ok')).join('');
    this.els.survival.innerHTML =
      severity === 'ok'
        ? `${iconHtml('ui_need_ok')}<span class="sv-chip-text">Состояние</span>`
        : `${activeIcons}<span class="sv-chip-text">${active.map((entry) => labels[entry.id] ?? entry.id).join(', ')}</span>`;
    this.els.survival.title = 'Сытость, жажда, отдых, спутник';
    this.els.survival.setAttribute('aria-expanded', String(this.survivalPanelOpen));

    if (overlay) {
      overlay.className = severity === 'ok' ? '' : `${severity}${reduced ? ' reduced' : ''}`;
    }

    const warningKey = active.map((e) => `${e.id}:${e.severity}`).join('|');
    if (severity !== 'ok' && warningKey && warningKey !== this.lastSurvivalWarning) {
      this.lastSurvivalWarning = warningKey;
      const tip = active.map((e) => hints[e.id] ?? labels[e.id] ?? e.id).join(' ');
      this.host.showToast(severity === 'critical' ? `Критично! ${tip}` : tip);
      if (severity === 'critical' || (severity === 'deficit' && this.lastSurvivalSeverity === 'ok')) {
        this.playSurvivalCue(severity);
      }
    }
    if (severity === 'ok') this.lastSurvivalWarning = '';
    this.lastSurvivalSeverity = severity;

    if (!panel) return;
    if (!this.survivalPanelOpen) {
      panel.classList.remove('open');
      panel.innerHTML = '';
      this.companionUi = null;
      return;
    }

    const safeZone = Boolean(this.host.getLocation()?.safeZone);
    const meter = (label: string, value: number): string => {
      const pct = Math.max(0, Math.min(100, Math.round(value)));
      return `<div class="sv-meter"><div class="sv-meter-head"><span>${label}</span><span>${pct}%</span></div><div class="sv-meter-track"><span style="width:${pct}%"></span></div></div>`;
    };
    const conditionLines = state.conditions.length
      ? state.conditions
          .map((c) => {
            const stage =
              'stage' in c && c.stage === 'acute'
                ? ' · острое'
                : 'stage' in c && c.stage === 'mild'
                  ? ' · лёгкое'
                  : '';
            return `• ${labels[c.id] ?? c.id} (${severityRu(c.severity)}${stage})${hints[c.id] ? ` — ${hints[c.id]}` : ''}`;
          })
          .join('<br>')
      : '• Нет активных дефицитов';
    panel.classList.add('open');
    panel.innerHTML = `
      <h3>Состояние</h3>
      ${meter('Сытость', state.satiety)}
      ${meter('Гидратация', state.hydration)}
      ${meter('Усталость', state.fatigue)}
      ${meter('Намокание', state.wetness)}
      <div class="sv-row"><span>Температура</span><span>${state.bodyTemperature.toFixed(1)}°C</span></div>
      <div class="sv-hint">${conditionLines}</div>
      <div class="sv-actions">
        ${
          safeZone
            ? `<button type="button" data-sv-rest="1">Отдохнуть</button>`
            : `<span class="sv-hint">Полный отдых — только в безопасной зоне.</span>`
        }
        <button type="button" data-sv-fx="1">${reduced ? 'Обычные эффекты' : 'Слабые эффекты'}</button>
        <button type="button" data-sv-close="1">Закрыть</button>
      </div>
    `;
    panel.querySelector('[data-sv-close]')?.addEventListener('click', () => {
      this.survivalPanelOpen = false;
      this.renderSurvival(save);
    });
    panel.querySelector('[data-sv-fx]')?.addEventListener('click', () => {
      const next = !getClientSetting('survivalFxReduced');
      setClientSetting('survivalFxReduced', next);
      document.body.classList.toggle('survival-fx-reduced', next);
      this.renderSurvival(save);
    });
    panel.querySelector('[data-sv-rest]')?.addEventListener('click', () => {
      void (async () => {
        try {
          const result = await restSurvival(save.id);
          this.host.setSave(result.save);
          this.host.setStats(result.stats);
          this.update(result.save, result.stats);
          this.host.showToast(result.message);
        } catch (err) {
          this.host.showToast(err instanceof Error ? err.message : 'Не удалось отдохнуть');
        }
      })();
    });

    if (this.companionUi) {
      this.companionUi.destroy();
      this.companionUi = null;
    }
    this.companionUi = mountCompanionPanel(panel);
    this.bindCompanionEvents();
    this.companionUi.sync(save.companion);
  }

  private bindCompanionEvents(): void {
    if (this.companionEventsBound) return;
    this.companionEventsBound = true;
    window.addEventListener('empery:companion-buy', ((e: CustomEvent<{ companionId?: string }>) => {
      const save = this.host.getSave();
      if (!save) return;
      void buyCompanion(save.id, e.detail?.companionId ?? 'haven_puppy')
        .then((result) => {
          this.host.setSave(result.save);
          this.host.setStats(result.stats);
          this.update(result.save, result.stats);
          this.host.showToast(result.message);
        })
        .catch((err) => {
          this.host.showToast(err instanceof Error ? err.message : 'Не удалось купить');
        });
    }) as EventListener);
    window.addEventListener('empery:companion-feed', ((e: CustomEvent<{ itemId?: string }>) => {
      const save = this.host.getSave();
      if (!save) return;
      void feedCompanion(save.id, e.detail?.itemId ?? 'bread_loaf')
        .then((result) => {
          this.host.setSave(result.save);
          this.host.setStats(result.stats);
          this.update(result.save, result.stats);
          this.host.showToast(result.message);
        })
        .catch((err) => {
          this.host.showToast(err instanceof Error ? err.message : 'Не вышло');
        });
    }) as EventListener);
    window.addEventListener('empery:companion-train', (() => {
      const save = this.host.getSave();
      if (!save) return;
      void trainCompanion(save.id)
        .then((result) => {
          this.host.setSave(result.save);
          this.host.setStats(result.stats);
          this.update(result.save, result.stats);
          this.host.showToast(result.message);
        })
        .catch((err) => {
          this.host.showToast(err instanceof Error ? err.message : 'Не вышло');
        });
    }) as EventListener);
  }

  renderSkillsHud(force = false): void {
    const save = this.host.getSave();
    if (!save) return;
    const skills = this.host.getSkills();
    const activeSkillIds = this.host.getActiveSkillIds();
    const key = this.hotbarFingerprint(activeSkillIds, skills);
    if (!force && key === this.lastHotbarKey) {
      if (hasAnySkillCooldown(skills)) this.ensureSkillCdTicker();
      return;
    }
    this.lastHotbarKey = key;
    this.els.skillSlots.innerHTML = '';
    for (let i = 0; i < SKILL_HOTBAR_SIZE; i++) {
      const skillId = activeSkillIds[i];
      const skill = skillId ? skills.find((s) => s.id === skillId) : undefined;
      const slot = document.createElement('div');
      if (!skill) {
        slot.className = 'hud-hotbar-slot empty';
        slot.title = `Слот [${i + 1}] — пусто`;
        const keyBadge = document.createElement('span');
        keyBadge.className = 'skill-slot-badge';
        keyBadge.textContent = String(i + 1);
        slot.appendChild(keyBadge);
        this.els.skillSlots.appendChild(slot);
        continue;
      }
      const cd = skillCooldownSec(skill);
      const progress = skillCooldownProgress(skill);
      const ally = skill.targetMode === 'ally';
      const party = skill.targetMode === 'party';
      slot.className = `hud-hotbar-slot${cd > 0 ? ' on-cd' : ''}${ally || party ? ' ally' : ''}${party ? ' party' : ''}`;
      const allyHint = party ? ' · пати' : ally ? ' · союзник/себя' : '';
      slot.title = cd > 0 ? `${skill.name}${allyHint} (${cd}с)` : `${skill.name}${allyHint}`;
      slot.setAttribute('role', 'button');
      slot.tabIndex = 0;
      const activate = (): void => this.queueHotbarSkill(i);
      slot.addEventListener('click', activate);
      slot.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        activate();
      });
      if (cd > 0) slot.style.setProperty('--cd-progress', progress.toFixed(3));
      slot.appendChild(buildSkillIconEl(skill, this.host.assetUrl, i + 1));
      if (ally || party) {
        const tag = document.createElement('span');
        tag.className = 'hud-hotbar-ally';
        tag.textContent = party ? 'P' : '+';
        tag.title = party ? 'Пати в радиусе' : 'Союзный навык';
        slot.appendChild(tag);
      }
      if (cd > 0) {
        const cdLabel = document.createElement('span');
        cdLabel.className = 'hud-hotbar-cd';
        cdLabel.textContent = `${cd}`;
        slot.appendChild(cdLabel);
      }
      this.els.skillSlots.appendChild(slot);
    }

    if (hasAnySkillCooldown(skills)) this.ensureSkillCdTicker();

    const passives = skills.filter((s) => s.type === 'passive' && (s.level ?? 0) > 0);
    this.els.passives.textContent = passives.length
      ? passives.map((p) => p.name).join(' · ')
      : '';
  }

  private queueHotbarSkill(slot: number): void {
    const game = this.host.getGame();
    if (!game) return;
    try {
      getGameScene(game).inputManager.queueSkill(slot);
    } catch {
      /* scene not ready */
    }
  }

  private hotbarFingerprint(activeSkillIds: (string | null)[], skills: SkillDefinition[]): string {
    const parts: string[] = [];
    for (let i = 0; i < SKILL_HOTBAR_SIZE; i++) {
      const id = activeSkillIds[i];
      if (!id) {
        parts.push(`${i}:`);
        continue;
      }
      const skill = skills.find((s) => s.id === id);
      if (!skill) {
        parts.push(`${i}:${id}`);
        continue;
      }
      const cd = skillCooldownSec(skill);
      const bucket = cd > 0 ? Math.round(skillCooldownProgress(skill) * 12) : 0;
      parts.push(`${i}:${id}:${cd}:${bucket}:${skill.targetMode ?? ''}`);
    }
    return parts.join('|');
  }

  private setAdenaText(text: string): void {
    if (text === this.lastAdenaText) return;
    this.lastAdenaText = text;
    this.els.adena.textContent = text;
  }

  private setQuestText(text: string): void {
    if (text === this.lastQuestText) return;
    this.lastQuestText = text;
    this.els.quest.textContent = text;
  }

  private setHpText(text: string): void {
    if (text === this.lastHpText) return;
    this.lastHpText = text;
    this.els.hp.textContent = text;
  }

  private setMpText(text: string): void {
    if (text === this.lastMpText) return;
    this.lastMpText = text;
    this.els.mp.textContent = text;
  }

  private setXpText(text: string): void {
    if (text === this.lastXpText) return;
    this.lastXpText = text;
    this.els.xp.textContent = text;
  }

  renderPvp(
    next: PlayerSave,
    extra?: { pvpStatus?: string; pvpFlagRemainingMs?: number },
  ): void {
    if (!this.els.pvp) return;
    const karma = next.karma ?? 0;
    const status = extra?.pvpStatus ?? (karma > 0 ? 'chaotic' : 'peaceful');
    this.els.pvp.classList.remove('flagged', 'chaotic');
    if (karma > 0) {
      this.els.pvp.classList.add('chaotic');
      this.els.pvp.textContent = `Хаос · карма ${karma}${next.pkCount ? ` · ПК ${next.pkCount}` : ''}`;
    } else if (status === 'flagged' || (extra?.pvpFlagRemainingMs ?? 0) > 0) {
      this.els.pvp.classList.add('flagged');
      this.els.pvp.textContent = 'Флаг PvP';
    } else {
      this.els.pvp.textContent = '';
    }
    const flagMs = extra?.pvpFlagRemainingMs ?? 0;
    this.upsertBuffs(
      [{ id: 'pvp_flag', name: 'Флаг PvP', remainingMs: flagMs, detail: karma > 0 ? 'хаос' : undefined }],
      { replaceCombat: false },
    );
  }

  upsertBuffs(
    buffs: Array<{ id: string; name: string; remainingMs: number; detail?: string }>,
    opts?: { replaceCombat?: boolean },
  ): void {
    const now = Date.now();
    if (opts?.replaceCombat !== false) {
      // Полный снимок боевых/союзных бафов: убираем всё кроме UI-флагов сессии.
      for (const id of this.hudBuffStore.keys()) {
        if (id === 'pvp_flag' || id === 'auto_attack') continue;
        this.hudBuffStore.delete(id);
      }
    }
    for (const b of buffs) {
      if (b.remainingMs <= 0) {
        this.hudBuffStore.delete(b.id);
        continue;
      }
      this.hudBuffStore.set(b.id, {
        id: b.id,
        name: b.name,
        detail: b.detail,
        endsAt: now + b.remainingMs,
        kind: this.buffKind(b.id),
      });
    }
    this.renderBuffs();
    this.startBuffTicker();
  }

  /** Сброс всех иконок бафов (смена персонажа / выход в меню). */
  clearBuffs(): void {
    this.hudBuffStore.clear();
    this.els.buffs.innerHTML = '';
    if (this.hudBuffTicker !== null) {
      clearInterval(this.hudBuffTicker);
      this.hudBuffTicker = null;
    }
  }

  syncAutoAttackButton(active: boolean, remainingMs: number): void {
    const setAutoLabel = (text: string): void => {
      this.els.autoAttackLabel.innerHTML = `<img class="hud-action-icon" alt="" src="/media/assets/ui_action_auto_attack.webp" />${text}`;
    };
    this.els.autoAttack.classList.toggle('active', active);
    if (active && remainingMs > 0) {
      const sec = Math.ceil(remainingMs / 1000);
      setAutoLabel(`Авто ${sec}с`);
      this.els.autoAttack.title = `Автоатака · осталось ${sec}с [F]`;
      this.upsertBuffs(
        [{ id: 'auto_attack', name: 'Автоатака', remainingMs, detail: 'обычные удары' }],
        { replaceCombat: false },
      );
    } else {
      setAutoLabel('Авто');
      this.els.autoAttack.title = 'Автоатака 30с [F]';
      this.clearBuff('auto_attack');
    }
  }

  startAutoAttackUiTicker(): void {
    if (this.autoAttackUiTimer !== null) return;
    this.autoAttackUiTimer = window.setInterval(() => {
      const game = this.host.getGame();
      if (!game) {
        this.syncAutoAttackButton(false, 0);
        if (this.autoAttackUiTimer !== null) {
          clearInterval(this.autoAttackUiTimer);
          this.autoAttackUiTimer = null;
        }
        return;
      }
      try {
        const gs = getGameScene(game);
        const rem = gs.getAutoAttackRemainingMs();
        const on = rem > 0;
        this.syncAutoAttackButton(on, rem);
        if (!on && this.autoAttackUiTimer !== null) {
          clearInterval(this.autoAttackUiTimer);
          this.autoAttackUiTimer = null;
        }
      } catch {
        this.syncAutoAttackButton(false, 0);
      }
    }, 200);
  }

  toggleAutoAttackFromUi(): void {
    const game = this.host.getGame();
    if (!game) {
      this.host.showToast('Сначала начни игру');
      return;
    }
    try {
      const gs = getGameScene(game);
      if (!gs.scene.isActive()) {
        this.host.showToast('Автоатака только в бою');
        return;
      }
      const on = gs.toggleAutoAttack();
      const rem = gs.getAutoAttackRemainingMs();
      this.syncAutoAttackButton(on, rem);
      this.host.showToast(on ? 'Автоатака 30с' : 'Автоатака выкл');
      if (on) this.startAutoAttackUiTicker();
    } catch {
      this.host.showToast('Автоатака недоступна');
    }
  }

  stopSkillCdTicker(): void {
    if (!this.skillCdTicker) return;
    clearInterval(this.skillCdTicker);
    this.skillCdTicker = null;
  }

  stopMpRegenTicker(): void {
    /* HP/MP regen is server-authoritative (player_updated). */
  }

  private syncAndRenderSkillCooldowns(next: PlayerSave): void {
    syncSkillCooldownsFromSave(this.host.getSkills(), next);
    this.renderSkillsHud(false);
    if (isSkillsOpen()) {
      const now = performance.now();
      if (now - this.lastSkillsPanelAt >= 800) {
        this.lastSkillsPanelAt = now;
        renderSkillsPanel();
      }
    }
  }

  private ensureSkillCdTicker(): void {
    if (this.skillCdTicker) return;
    this.skillCdTicker = setInterval(() => {
      const save = this.host.getSave();
      if (!save) return;
      if (!this.host.isGameplayVisible()) return;
      if (!hasAnySkillCooldown(this.host.getSkills())) return;
      this.syncAndRenderSkillCooldowns(save);
    }, 400);
  }

  private renderCombatStatsPills(nextStats: PlayerStats | null): void {
    const rows: [string, string | number | undefined][] = [
      ['Атк', nextStats?.pAtk],
      ['Защ', nextStats?.pDef],
      ['Маг', nextStats?.mAtk],
      ['М.защ', nextStats?.mDef],
      ['Точн', nextStats?.accuracy],
      ['Уклон', nextStats?.evasion],
      ['Крит', nextStats?.critRate != null ? `${nextStats.critRate}%` : undefined],
      ['Скор', nextStats?.attackSpeed],
    ];
    if (nextStats?.blockChance && nextStats.blockChance > 0) {
      rows.splice(2, 0, ['Блок', `${nextStats.blockChance}%`]);
    }
    if (nextStats?.rangedWeapon && nextStats.attackRange) {
      rows.push(['Дал.', nextStats.attackRange]);
    }
    if (nextStats?.mpRegen && nextStats.mpRegen > 0) {
      rows.push(['MP+', `${nextStats.mpRegen}/5с`]);
    }
    if (nextStats?.hpRegen && nextStats.hpRegen > 0) {
      rows.push(['HP+', `${nextStats.hpRegen}/5с`]);
    }
    if (nextStats?.carryWeightKg != null) {
      rows.push(['Вес', `${nextStats.carryWeightKg}кг`]);
    }
    const key = rows.map(([label, value]) => `${label}:${value ?? ''}`).join('|');
    if (key === this.lastCombatStatsKey) return;
    this.lastCombatStatsKey = key;
    const visible = rows.slice(0, 4);
    const extra = rows.slice(4);
    const pills = visible
      .map(
        ([label, value]) =>
          `<span class="hud-stat-pill"><span>${label}</span>${value ?? '—'}</span>`,
      )
      .join('');
    const more = extra.length
      ? `<span class="hud-stat-more" title="${extra
          .map(([label, value]) => `${label} ${value ?? '—'}`)
          .join(' · ')}">ещё</span>`
      : '';
    this.els.combatStats.innerHTML = pills + more;
  }

  updateMountStamina(
    info: {
      owned: boolean;
      mounted: boolean;
      stamina: number;
      max: number;
      canRun: boolean;
      carryWeightKg: number;
    } | null,
  ): void {
    if (!this.staminaWrap) {
      this.staminaWrap = document.getElementById('stamina-bar-wrap');
      this.staminaBar = document.getElementById('stamina-bar');
      this.staminaLabel = document.getElementById('hud-stamina');
    }
    const wrap = this.staminaWrap;
    const bar = this.staminaBar;
    const label = this.staminaLabel;
    if (!wrap || !bar || !label) return;
    const show = Boolean(info?.owned);
    wrap.hidden = !show;
    if (!info || !show) return;
    const pct = info.max > 0 ? Math.max(0, Math.min(100, (info.stamina / info.max) * 100)) : 0;
    bar.style.width = `${pct}%`;
    bar.classList.toggle('walk-only', !info.canRun);
    const text = info.mounted
      ? info.canRun
        ? `Конь ${Math.round(info.stamina)}`
        : `Шаг ${Math.round(info.stamina)}`
      : `Конь ${Math.round(info.stamina)}`;
    if (text !== this.lastStaminaText) {
      this.lastStaminaText = text;
      label.textContent = text;
    }
  }

  updatePlayerStamina(info: {
    stamina: number;
    max: number;
    canRun: boolean;
    carryWeightKg: number;
  }): void {
    if (!this.pstaminaBar) {
      this.pstaminaBar = document.getElementById('pstamina-bar');
      this.pstaminaLabel = document.getElementById('hud-pstamina');
    }
    const bar = this.pstaminaBar;
    const label = this.pstaminaLabel;
    if (!bar || !label) return;
    const pct = info.max > 0 ? Math.max(0, Math.min(100, (info.stamina / info.max) * 100)) : 0;
    bar.style.width = `${pct}%`;
    bar.classList.toggle('walk-only', !info.canRun);
    const text = info.canRun ? `Вын. ${Math.round(info.stamina)}` : `Шаг ${Math.round(info.stamina)}`;
    if (text !== this.lastPStaminaText) {
      this.lastPStaminaText = text;
      label.textContent = text;
    }
  }

  private clearBuff(id: string): void {
    this.hudBuffStore.delete(id);
    this.renderBuffs();
  }

  private buffKind(id: string): HudBuffEntry['kind'] {
    if (id === 'swarm_frenzy') return 'swarm';
    if (id === 'auto_attack') return 'auto';
    if (id === 'pvp_flag') return 'pvp';
    return 'dual';
  }

  private renderBuffs(): void {
    const now = Date.now();
    for (const [id, b] of this.hudBuffStore) {
      if (b.endsAt <= now) this.hudBuffStore.delete(id);
    }
    const ids = [...this.hudBuffStore.keys()].sort().join(',');
    const existing = this.els.buffs.getAttribute('data-buff-ids');
    if (existing === ids && this.els.buffs.childElementCount === this.hudBuffStore.size) {
      for (const el of this.els.buffs.children) {
        const node = el as HTMLElement;
        const id = node.dataset.buffId;
        if (!id) continue;
        const b = this.hudBuffStore.get(id);
        if (!b) continue;
        const timer = node.querySelector('.hud-buff-timer');
        if (timer) {
          const sec = Math.max(1, Math.ceil((b.endsAt - now) / 1000));
          timer.textContent = `${sec}с`;
        }
      }
      return;
    }
    this.els.buffs.setAttribute('data-buff-ids', ids);
    this.els.buffs.innerHTML = '';
    for (const b of this.hudBuffStore.values()) {
      const sec = Math.max(1, Math.ceil((b.endsAt - now) / 1000));
      const el = document.createElement('div');
      el.className = `hud-buff ${b.kind}`;
      el.dataset.buffId = b.id;
      el.title = b.name;

      const icon = document.createElement('div');
      icon.className = 'hud-buff-icon';
      const url = b.id === 'auto_attack' ? undefined : this.host.assetUrl(`skill_${b.id}`);
      if (url) {
        appendMediaIcon(icon, `skill_${b.id}`, { url, alt: '' });
      } else {
        icon.textContent = b.kind === 'auto' ? 'А' : b.kind === 'pvp' ? 'P' : 'Б';
      }
      el.appendChild(icon);

      const meta = document.createElement('div');
      meta.className = 'hud-buff-meta';
      meta.innerHTML = `<div class="hud-buff-name">${b.name}</div><div class="hud-buff-timer">${sec}с</div>`;
      if (b.detail) {
        meta.innerHTML += `<div class="hud-buff-detail">${b.detail}</div>`;
      }
      el.appendChild(meta);
      this.els.buffs.appendChild(el);
    }
  }

  private startBuffTicker(): void {
    if (this.hudBuffTicker !== null) return;
    this.hudBuffTicker = window.setInterval(() => {
      if (this.hudBuffStore.size === 0) {
        if (this.hudBuffTicker !== null) {
          clearInterval(this.hudBuffTicker);
          this.hudBuffTicker = null;
        }
        this.els.buffs.innerHTML = '';
        this.els.buffs.removeAttribute('data-buff-ids');
        return;
      }
      this.renderBuffs();
    }, 400);
  }

  private pushCombatTickToScene(next: PlayerSave, stats: PlayerStats | null): void {
    const game = this.host.getGame();
    if (!game || !stats) return;
    try {
      const scene = getGameScene(game);
      if (scene.scene.isActive() && scene.getLocationId() === next.location) {
        scene.updateSave(next, stats, { combatTick: true });
      }
    } catch {
      /* ignore */
    }
  }
}
