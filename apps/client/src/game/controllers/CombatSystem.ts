import Phaser from 'phaser';
import { attackReach, MELEE_ATTACK_RANGE, resolveAttackRange } from '@empery/shared/attack-range';
import { SKILL_HOTBAR_SIZE } from '@empery/shared';
import { applyCombatPlayerDelta } from '@empery/shared/combat-delta';
import { isCleaveTactic } from '@empery/shared/combat-tactics';
import type { BatchAttackResult, PlayerSave, PlayerStats, SkillDefinition } from '../../api.js';
import type { EnemyEntity } from '../entities/EnemyEntity.js';
import type { EntityManager } from '../systems/EntityManager.js';
import type { NetworkManager } from '../systems/NetworkManager.js';
import type { RemotePlayerManager } from '../systems/RemotePlayerManager.js';
import type { VfxSystem } from '../systems/VfxSystem.js';
import type { InputManager } from '../systems/InputManager.js';
import type { PlayerController } from './PlayerController.js';
import type { LocationConfig } from '../scenes/location-types.js';
import { CombatAttackFsm } from '../fsm/CombatAttackFsm.js';
import { skillCooldownSec, syncSkillCooldownsFromSave } from '../../skill-cooldown.js';

const AUTO_ATTACK_DURATION_MS = 30_000;

export interface CombatCallbacks {
  onSaveUpdate?: (
    save: PlayerSave,
    stats?: PlayerStats,
    opts?: { combatTick?: boolean },
  ) => void;
  onCombatFeedback?: (text: string) => void;
  onSkillsChanged?: (unlocked?: string[]) => void;
  onPlayerDeath?: () => void;
  onEncounterStale?: () => Promise<void>;
  onTimedBuffs?: (buffs: TimedBuffState[]) => void;
  /** Отправить PvP-удар по игроку через WS. */
  onPvpAttack?: (targetSaveId: string, skillId?: string) => void;
  /** Союзный heal/buff (`targetSaveId` опционален для party). */
  onAllyCast?: (targetSaveId: string | undefined, skillId: string) => void;
  /**
   * Цель для союзного навыка: выбранный игрок пати в радиусе, иначе себя.
   * `null` — нельзя (мертв / нет себя).
   */
  resolveAllyCastTarget?: (
    reach: number,
  ) => { saveId: string; x: number; y: number } | null;
  /** Входящий вызов по рации (квест завершён, условия связи ок). */
  onRadioIncoming?: (npcId: string) => void;
}

export interface TimedBuffState {
  id: string;
  name: string;
  remainingMs: number;
  detail?: string;
}

export class CombatSystem {
  private readonly attackFsm = new CombatAttackFsm();
  private activeSkillIds: (string | null)[] = [];
  /** До какого scene.time.now включена автоатака (0 = выкл). */
  private autoAttackUntil = 0;
  private skillDefs: SkillDefinition[] = [];
  private skillById = new Map<string, SkillDefinition>();
  private autoRangeCache = { at: 0, hit: false, reach: 0 };
  /** Последний известный save (для bleed-kill и merge дельты). */
  private lastSave: PlayerSave | null = null;
  /** Союзные баффы с сервера (не затираются combat emit). */
  private allyHudBuffs: TimedBuffState[] = [];

  constructor(
    private scene: Phaser.Scene,
    private input: InputManager,
    private player: PlayerController,
    private entities: EntityManager,
    private network: NetworkManager,
    private vfx: VfxSystem,
    private callbacks: CombatCallbacks,
    private remotes?: RemotePlayerManager,
  ) {}

  setActiveSkillIds(ids: (string | null)[]): void {
    this.activeSkillIds = Array.from({ length: SKILL_HOTBAR_SIZE }, (_, i) => ids[i] ?? null);
  }

  setSkillDefinitions(skills: SkillDefinition[]): void {
    this.skillDefs = skills;
    this.skillById = new Map(skills.map((s) => [s.id, s]));
    if (this.lastSave) syncSkillCooldownsFromSave(this.skillDefs, this.lastSave);
  }

  /** HUD-баффы от союзных скиллов (heal/ward/shout). */
  setAllyHudBuffs(buffs: TimedBuffState[]): void {
    this.allyHudBuffs = buffs.filter((b) => b.remainingMs > 0);
    this.emitTimedBuffs({});
  }

  clearAllyHudBuffs(): void {
    this.allyHudBuffs = [];
    this.emitTimedBuffs({});
  }

  private resolveReach(stats: PlayerStats, skillId?: string): number {
    const skillRange = skillId ? this.skillById.get(skillId)?.attackRange : undefined;
    const range = resolveAttackRange({
      weaponAttackRange: stats.attackRange ?? (stats.rangedWeapon ? MELEE_ATTACK_RANGE : null),
      skillAttackRange: skillRange,
    });
    return attackReach(range);
  }

  /** Вкл/выкл автоатаку на 30с. Возвращает, активна ли сейчас. */
  toggleAutoAttack(): boolean {
    const now = this.scene.time.now;
    if (now < this.autoAttackUntil) {
      this.autoAttackUntil = 0;
      return false;
    }
    this.autoAttackUntil = now + AUTO_ATTACK_DURATION_MS;
    return true;
  }

  isAutoAttackActive(): boolean {
    return this.scene.time.now < this.autoAttackUntil;
  }

  getAutoAttackRemainingMs(): number {
    return Math.max(0, this.autoAttackUntil - this.scene.time.now);
  }

  clearAutoAttack(): void {
    this.autoAttackUntil = 0;
  }

  private lastCdSyncAt = 0;

  /** Сброс in-flight флагов при SHUTDOWN сцены. */
  shutdown(): void {
    this.attackFsm.reset();
    this.clearAutoAttack();
    this.lastCdSyncAt = 0;
  }

  /** Async combat не должен применяться после travel/abort. */
  private isCombatActive(gen: number): boolean {
    return this.scene.sys.isActive() && gen === this.network.getGeneration();
  }

  private canResolveAttack(gen: number): boolean {
    return this.isCombatActive(gen) && !this.player.isDead && !this.input.isUiBlocked();
  }

  private syncSkillCdsIfNeeded(save: PlayerSave): void {
    const now = this.scene.time.now;
    if (now - this.lastCdSyncAt < 250) return;
    this.lastCdSyncAt = now;
    syncSkillCooldownsFromSave(this.skillDefs, save);
  }

  update(save: PlayerSave, stats: PlayerStats, location: LocationConfig): void {
    this.lastSave = save;
    this.syncSkillCdsIfNeeded(save);
    const chargeRequested = this.player.consumeChargeHitRequest();
    if (this.player.isDead || this.input.isUiBlocked()) return;
    if (chargeRequested) void this.performMountCharge(save, stats, location);
    if (this.attackFsm.isBusy) return;
    if (!this.player.canAttack(stats)) return;

    let skillId: string | undefined;
    let manual = false;
    for (let i = 0; i < SKILL_HOTBAR_SIZE; i++) {
      const slotSkill = this.activeSkillIds[i];
      if (slotSkill && this.input.consumeSkill(i)) {
        skillId = slotSkill;
        manual = true;
        break;
      }
    }

    const supportDef = skillId ? this.skillById.get(skillId) : undefined;
    const supportMode = supportDef?.targetMode;
    const supportSkill =
      skillId && supportDef && (supportMode === 'ally' || supportMode === 'party')
        ? skillId
        : undefined;

    if (supportSkill && supportDef) {
      if (skillCooldownSec(supportDef) > 0) {
        this.callbacks.onCombatFeedback?.('Скилл на перезарядке');
        return;
      }
      void this.performAllyCast(save, stats, supportSkill, supportMode === 'party');
      return;
    }

    if (location.safeZone) return;

    if (!manual) {
      if (this.input.consumeAttack()) {
        skillId = undefined;
        manual = true;
      } else if (this.shouldAutoBasicAttack(stats)) {
        skillId = undefined;
        manual = false;
      } else return;
    }

    if (skillId) {
      const def = this.skillById.get(skillId);
      if (def && skillCooldownSec(def) > 0) {
        this.callbacks.onCombatFeedback?.('Скилл на перезарядке');
        return;
      }
    }

    void this.performAttack(save, stats, location, skillId, manual);
  }

  private async performAllyCast(
    _save: PlayerSave,
    stats: PlayerStats,
    skillId: string,
    partyMode = false,
  ): Promise<void> {
    if (this.attackFsm.isBusy) return;
    if (!this.attackFsm.tryBegin()) return;
    const gen = this.network.getGeneration();
    try {
      this.player.beginAttack(stats, { allowMove: true });
      await new Promise<void>((r) => this.scene.time.delayedCall(40, () => r()));
      if (!this.canResolveAttack(gen)) {
        this.player.endAttack();
        return;
      }
      const reach = this.resolveReach(stats, skillId);
      if (partyMode) {
        this.vfx.sparks(this.player.x, this.player.y, 0x66ee99, 12);
        this.callbacks.onAllyCast?.(undefined, skillId);
        this.player.endAttack();
        return;
      }
      const target = this.callbacks.resolveAllyCastTarget?.(reach);
      if (!target) {
        this.callbacks.onCombatFeedback?.('Нет цели для навыка');
        this.player.endAttack();
        return;
      }
      this.vfx.magicBolt(this.player.x, this.player.y, target.x, target.y);
      this.callbacks.onAllyCast?.(target.saveId, skillId);
      this.player.endAttack();
    } finally {
      if (gen === this.network.getGeneration()) {
        this.attackFsm.complete();
      }
    }
  }

  private shouldAutoBasicAttack(stats: PlayerStats): boolean {
    if (!this.isAutoAttackActive()) return false;
    const reach = this.resolveReach(stats);
    const now = this.scene.time.now;
    if (
      now - this.autoRangeCache.at < 100 &&
      Math.abs(this.autoRangeCache.reach - reach) < 1
    ) {
      return this.autoRangeCache.hit;
    }
    const hit = this.entities.hasEnemyInRange(
      this.player.x,
      this.player.y,
      reach,
      (x, y) => this.player.hasLineOfSight(x, y),
    );
    this.autoRangeCache = { at: now, hit, reach };
    return hit;
  }

  private async performMountCharge(
    save: PlayerSave,
    _stats: PlayerStats,
    location: LocationConfig,
  ): Promise<void> {
    if (location.safeZone) return;
    const gen = this.network.getGeneration();
    const px = this.player.x;
    const py = this.player.y;
    const reach = 48;
    const nearby = this.entities.collectInRange(px, py, reach, (x, y) => this.player.hasLineOfSight(x, y)).map((t) => t.entityId);
    this.vfx.sparks(px, py, 0xc8a060, 10);
    this.callbacks.onCombatFeedback?.('Таран!');
    try {
      const result = await this.network.mountCharge({
        targetEntityIds: nearby,
        playerX: px,
        playerY: py,
        nearbyEnemyCount: this.entities.countNearby(px, py),
      });
      if (!result || !this.isCombatActive(gen)) return;
      this.applyBatchResult(save, result, { quiet: false });
      if (result.questCompleted || result.leveledUp || result.skillsUnlocked?.length) {
        if (this.lastSave) this.callbacks.onSaveUpdate?.(this.lastSave, result.stats);
      }
    } catch {
      /* ignore */
    }
  }

  private async performAttack(
    save: PlayerSave,
    stats: PlayerStats,
    location: LocationConfig,
    skillId: string | undefined,
    allowPvp: boolean,
  ): Promise<void> {
    if (location.safeZone || this.attackFsm.isBusy) return;
    if (!this.attackFsm.tryBegin()) return;
    const gen = this.network.getGeneration();
    this.lastSave = save;
    try {
      const ranged = Boolean(stats.rangedWeapon);
      // Лук — hitscan: без стопа движения и без windup 80мс (это давало «фриз» мира)
      this.player.beginAttack(stats, { allowMove: ranged || Boolean(stats.mounted) });
      const px0 = this.player.x;
      const py0 = this.player.y;
      if (!ranged) {
        this.vfx.slash(px0, py0, this.player.getFacingRight(), Boolean(skillId));
        await new Promise<void>((r) => this.scene.time.delayedCall(80, () => r()));
      } else {
        // Короткий кадр на выстрел, без ощутимой паузы
        await new Promise<void>((r) => this.scene.time.delayedCall(16, () => r()));
      }
      if (!this.canResolveAttack(gen)) {
        this.player.endAttack();
        return;
      }
      this.attackFsm.tryEnter('resolve');
      const px = this.player.x;
      const py = this.player.y;
      const reach = this.resolveReach(stats, skillId);

      const nearestMob = this.entities.findNearestInRange(px, py, reach, (x, y) => this.player.hasLineOfSight(x, y));

      const partyIds = this.scene.registry.get('partySaveIds') as ReadonlySet<string> | undefined;
      const nearestPlayer =
        allowPvp && this.remotes ? this.remotes.nearestInRange(px, py, reach, (x, y) => this.player.hasLineOfSight(x, y), partyIds) : null;

      // Союзные навыки никогда не уходят в PvP (даже если defs подтянулись поздно).
      if (skillId) {
        const mode = this.skillById.get(skillId)?.targetMode;
        if (mode === 'ally' || mode === 'party') {
          this.player.endAttack();
          // finally сбросит FSM; каст уйдёт отдельным кадром
          queueMicrotask(() => {
            if (!this.canResolveAttack(gen)) return;
            void this.performAllyCast(save, stats, skillId, mode === 'party');
          });
          return;
        }
      }

      const preferPlayer =
        Boolean(nearestPlayer) &&
        (!nearestMob ||
          (nearestPlayer &&
            nearestPlayer.dist <= Math.sqrt(nearestMob.distSq)));

      if (preferPlayer && nearestPlayer) {
        if (ranged) {
          const spr = this.remotes?.getSprite(nearestPlayer.presence.saveId);
          if (spr) {
            if (stats.rangedKind === 'magic') this.vfx.magicBolt(px, py, spr.x, spr.y);
            else this.vfx.arrowShot(px, py, spr.x, spr.y);
          }
        }
        this.callbacks.onPvpAttack?.(nearestPlayer.presence.saveId, skillId);
        this.player.endAttack();
        return;
      }

      if (!nearestMob) {
        if (skillId) this.callbacks.onCombatFeedback?.('Никого в радиусе');
        this.player.endAttack();
        return;
      }

      if (ranged) {
        if (stats.rangedKind === 'magic') {
          this.vfx.magicBolt(px, py, nearestMob.entity.x, nearestMob.entity.y);
        } else {
          this.vfx.arrowShot(px, py, nearestMob.entity.x, nearestMob.entity.y);
        }
      }

      let result: BatchAttackResult | null = null;
      try {
        // Обычный мили и cleave — пачка в радиусе. Одиночный скилл / лук без nova — ближайший.
        const skillDef = skillId ? this.skillById.get(skillId) : undefined;
        const cleave = isCleaveTactic(skillDef?.tactic);
        const pack = !skillId || cleave;
        const targetIds =
          ranged && !cleave
            ? [nearestMob.entity.entityId]
            : pack
              ? this.entities.collectInRange(px, py, reach, (x, y) => this.player.hasLineOfSight(x, y)).map((t) => t.entityId)
              : [nearestMob.entity.entityId];
        result = await this.network.batchAttack({
          skillId,
          moving: this.player.isMoving,
          dashing: this.player.isDashing,
          nearbyEnemyCount: this.entities.countNearby(px, py),
          targetEntityIds: targetIds,
          playerX: px,
          playerY: py,
        });
      } catch (err) {
        if (this.isCombatActive(gen) && err instanceof Error && err.message === 'ENCOUNTER_STALE') {
          await this.callbacks.onEncounterStale?.();
        }
        this.player.endAttack();
        return;
      }

      if (!result || !this.isCombatActive(gen)) {
        this.player.endAttack();
        return;
      }

      // Авто-бейсик: меньше тостов (крит/лут/квест всё равно покажем)
      this.applyBatchResult(save, result, { quiet: !allowPvp && !skillId });
      this.player.endAttack();
      this.attackFsm.tryEnter('recovery');
      // Квест/лвл/скиллы — полный HUD (без combatTick)
      if (
        (result.questCompleted || result.leveledUp || result.skillsUnlocked?.length) &&
        this.lastSave
      ) {
        this.callbacks.onSaveUpdate?.(this.lastSave, result.stats);
      }
    } finally {
      if (gen === this.network.getGeneration()) {
        this.attackFsm.complete();
      }
    }
  }

  private applyBatchResult(
    baseSave: PlayerSave,
    result: BatchAttackResult,
    opts: { quiet?: boolean } = {},
  ): void {
    const quiet = Boolean(opts.quiet);
    const nextSave = applyCombatPlayerDelta(baseSave as never, result.player) as PlayerSave;
    this.lastSave = nextSave;
    this.callbacks.onSaveUpdate?.(nextSave, result.stats, { combatTick: true });
    if (typeof result.player.stamina === 'number') {
      this.player.adoptCombatStamina(result.player.stamina);
    }
    this.player.applySwarmFrenzy(result, quiet ? undefined : this.callbacks.onCombatFeedback);
    this.player.applyMadDualist(result, quiet ? undefined : this.callbacks.onCombatFeedback);
    if (
      result.swarmFrenzyRemainingMs ||
      result.madDualistRemainingMs ||
      result.shieldRiposteRemainingMs ||
      result.swarmFrenzyProc ||
      result.madDualistProc ||
      result.shieldRiposteConsumed
    ) {
      this.emitTimedBuffs(result);
    }

    if (result.skillOnCooldown) {
      this.callbacks.onCombatFeedback?.('Скилл на перезарядке');
      return;
    }
    if (result.insufficientMp) {
      this.callbacks.onCombatFeedback?.('Не хватает MP');
      return;
    }
    if (result.insufficientStamina) {
      this.callbacks.onCombatFeedback?.('Не хватает выносливости');
      return;
    }
    if (result.skillRequireFailed === 'backstab') {
      this.callbacks.onCombatFeedback?.('Нужна спина или фланг');
      return;
    }
    if (result.skillRequireFailed === 'execute') {
      this.callbacks.onCombatFeedback?.('Цель слишком жива');
      return;
    }
    if (result.skillRequireFailed === 'vanish') {
      this.callbacks.onCombatFeedback?.('Нужен рывок');
      return;
    }
    if (result.noBow) {
      this.callbacks.onCombatFeedback?.('Нужен лук');
      return;
    }
    if (result.noAmmo) {
      this.callbacks.onCombatFeedback?.('Нет стрел');
      return;
    }

    let anyKillXp = false;
    for (const hit of result.hits) {
      const enemy = this.entities.getByEntityId(hit.entityId);
      if (!enemy || enemy.isDying) continue;

      if (hit.missed) {
        const magic = result.stats?.rangedKind === 'magic';
        this.vfx.floatText(enemy.x, enemy.y, magic ? 'RESIST' : 'MISS', '#aaaaaa');
        if (!quiet) {
          this.callbacks.onCombatFeedback?.(magic ? 'Сопротивление магии' : 'Промах!');
        }
        continue;
      }

      enemy.applyHp(hit.enemyHp);
      // Не playHurt(): hurt-аним сбрасывает walk и выглядит как «фриз» моба
      enemy.flashHurt();
      if (hit.controlApplied) {
        enemy.control = hit.controlApplied;
      }
      this.vfx.sparks(enemy.x, enemy.y, hit.crit ? 0xffdd44 : 0xff8866, quiet ? 3 : hit.crit ? 8 : 5);
      const dmgText = hit.crit ? `CRIT -${hit.damage}` : `-${hit.damage}`;
      this.vfx.floatText(enemy.x, enemy.y, dmgText, hit.crit ? '#ffcc44' : '#ff8888');
      if (hit.backstab) {
        this.vfx.floatText(enemy.x, enemy.y - 18, 'СПИНА', '#c090ff');
        if (!quiet) this.callbacks.onCombatFeedback?.(`Удар в спину! ${hit.damage}`);
      } else if (hit.execute) {
        this.vfx.floatText(enemy.x, enemy.y - 18, 'КАЗНЬ', '#ff5566');
        if (!quiet) this.callbacks.onCombatFeedback?.(`Казнь! ${hit.damage}`);
      } else if (hit.markApplied) {
        this.vfx.floatText(enemy.x, enemy.y - 18, 'МЕТКА', '#88ddff');
        if (!quiet) this.callbacks.onCombatFeedback?.('Цель помечена');
      } else if (hit.marked) {
        this.vfx.floatText(enemy.x, enemy.y - 18, 'МЕЧЕН', '#66ccee');
      } else if (hit.snipe) {
        this.vfx.floatText(enemy.x, enemy.y - 18, 'ДАЛЬНИЙ', '#aadd88');
      } else if (hit.pyre) {
        this.vfx.floatText(enemy.x, enemy.y - 18, 'КОСТЁР', '#ff8844');
        if (!quiet) this.callbacks.onCombatFeedback?.('Взрыв в упор');
      } else if (hit.controlApplied === 'stun') {
        this.vfx.floatText(enemy.x, enemy.y - 18, 'STUN', '#ffe066');
        if (!quiet) this.callbacks.onCombatFeedback?.('Оглушение');
      } else if (hit.controlApplied === 'pin') {
        this.vfx.floatText(enemy.x, enemy.y - 18, 'PIN', '#77ccee');
        if (!quiet) this.callbacks.onCombatFeedback?.('Пригвождён');
      } else if (hit.vanish) {
        this.vfx.floatText(enemy.x, enemy.y - 18, 'РЫВОК', '#ddaaff');
      } else if (hit.seek) {
        this.vfx.floatText(enemy.x, enemy.y - 18, 'НАВОДКА', '#bbdd88');
      } else if (hit.cleaveSplash) {
        this.vfx.floatText(enemy.x + 8, enemy.y - 10, 'SPLASH', '#ffaa66');
      }
      if (hit.offhandHit && (hit.offhandDamage ?? 0) > 0) {
        const oh = hit.offhandCrit ? `2H CRIT -${hit.offhandDamage}` : `2H -${hit.offhandDamage}`;
        this.vfx.floatText(enemy.x + 10, enemy.y - 14, oh, hit.offhandCrit ? '#ddaaff' : '#cc99ff');
      }
      if (hit.riposte) {
        this.vfx.floatText(enemy.x - 12, enemy.y - 22, 'РИПОСТЕТ', '#e8c060');
        if (!quiet) this.callbacks.onCombatFeedback?.(`Ответный удар! ${hit.damage} урона`);
      }
      if (hit.crit) {
        // Shake с follow-камерой выглядит как knockback всей пачки мобов — только мили.
        if (!quiet && !result.stats.rangedWeapon) {
          this.scene.cameras.main.shake(60, 0.003);
        }
        if (!quiet) this.callbacks.onCombatFeedback?.(`Крит! ${hit.damage} урона`);
      }
      if (hit.bleed) {
        this.applyBleed(enemy, hit.bleed);
        if (hit.bleed.kind === 'poison' && !quiet) {
          this.callbacks.onCombatFeedback?.('Яд!');
        }
      }

      if (hit.killed) {
        anyKillXp = true;
        this.beginEnemyDeath(enemy);
      }
    }

    const combo = result.combo ?? 0;
    if (combo >= 2) {
      this.vfx.floatText(this.player.x, this.player.y - 28, `x${combo}`, '#ffe08a');
      if (combo >= 3) this.callbacks.onCombatFeedback?.(`Комбо x${combo}`);
    }

    if (result.xpGained && !quiet) {
      this.callbacks.onCombatFeedback?.(`+${result.xpGained} XP`);
    }
    if (result.leveledUp) {
      this.callbacks.onCombatFeedback?.(`Уровень ${nextSave.level}!`);
      this.callbacks.onSkillsChanged?.(result.skillsUnlocked);
    } else if (result.skillsUnlocked?.length) {
      this.callbacks.onSkillsChanged?.(result.skillsUnlocked);
    }
    if (result.drops?.length) {
      this.callbacks.onCombatFeedback?.('Добыча упала на землю');
    } else if (result.groundLoot?.length) {
      this.callbacks.onCombatFeedback?.('Добыча упала на землю');
    } else if (result.lootAdded) {
      this.callbacks.onCombatFeedback?.('Добыча упала на землю');
    }
    if (result.questCompleted) {
      this.callbacks.onCombatFeedback?.(
        result.radioIncoming?.npcId
          ? 'Квест завершён — входящий вызов'
          : 'Квест завершён!',
      );
    }
    if (result.radioIncoming?.npcId) {
      this.callbacks.onRadioIncoming?.(result.radioIncoming.npcId);
    }
    if (result.skillXpGained && !anyKillXp && !quiet) {
      this.vfx.floatText(
        this.player.x,
        this.player.y - 20,
        `+${result.skillXpGained} XP`,
        '#aaddff',
      );
    }
  }

  private emitTimedBuffs(result: {
    swarmFrenzyActive?: boolean;
    swarmFrenzyEnemies?: number;
    swarmFrenzyRemainingMs?: number;
    madDualistActive?: boolean;
    madDualistRemainingMs?: number;
    shieldRiposteActive?: boolean;
    shieldRiposteRemainingMs?: number;
  }): void {
    const buffs: TimedBuffState[] = [];
    const frenzyMs = result.swarmFrenzyRemainingMs ?? 0;
    if (frenzyMs > 0) {
      const n = result.swarmFrenzyEnemies ?? 0;
      buffs.push({
        id: 'swarm_frenzy',
        name: 'Рой клинков',
        remainingMs: frenzyMs,
        detail: n > 0 ? `×${n}` : undefined,
      });
    }
    const dualMs = result.madDualistRemainingMs ?? 0;
    if (dualMs > 0) {
      buffs.push({
        id: 'mad_dualist',
        name: 'Безумный дуальщик',
        remainingMs: dualMs,
        detail: '×2',
      });
    }
    const riposteMs = result.shieldRiposteRemainingMs ?? 0;
    if (riposteMs > 0) {
      buffs.push({
        id: 'shield_riposte',
        name: 'Ответный удар',
        remainingMs: riposteMs,
        detail: 'щит',
      });
    }
    for (const b of this.allyHudBuffs) {
      if (b.remainingMs > 0) buffs.push(b);
    }
    this.callbacks.onTimedBuffs?.(buffs);
  }

  private applyBleed(
    enemy: EnemyEntity,
    bleed: { tickDamage: number; durationMs: number; tickMs: number; kind?: 'bleed' | 'poison' },
  ): void {
    const gen = this.network.getGeneration();
    const poison = bleed.kind === 'poison';
    enemy.setTint(poison ? 0x44cc66 : 0xcc3344);
    const timer = this.scene.time.addEvent({
      delay: bleed.tickMs,
      repeat: Math.ceil(bleed.durationMs / bleed.tickMs) - 1,
      callback: () => {
        if (!this.isCombatActive(gen)) {
          timer.remove(false);
          return;
        }
        if (!enemy.active || enemy.isDying) {
          timer.remove(false);
          return;
        }
        this.vfx.floatText(
          enemy.x,
          enemy.y - 8,
          poison ? `яд -${bleed.tickDamage}` : `-${bleed.tickDamage}`,
          poison ? '#66ee88' : '#cc4455',
        );

      },
    });
    enemy.setBleedTimer(timer);
    this.scene.time.delayedCall(bleed.durationMs, () => {
      if (!this.isCombatActive(gen)) return;
      if (enemy.active && !enemy.isDying) enemy.clearTint();
    });
  }

  private beginEnemyDeath(enemy: EnemyEntity): void {
    if (enemy.isDying) return;
    const deathColor =
      enemy.enemyType === 'cinder_imp'
        ? 0xff6622
        : enemy.enemyType === 'shadow_thug'
          ? 0x9944cc
          : 0xffaa44;
    this.vfx.deathBurst(enemy.x, enemy.y, deathColor);
    enemy.beginDeath((e) => this.entities.recycleEnemy(e));
  }

  /** Death driven by remote enemy_snapshot (other player's kill / farm despawn). */
  applyRemoteDeath(entityId: string): void {
    const enemy = this.entities.getByEntityId(entityId);
    if (!enemy || enemy.isDying) return;
    this.beginEnemyDeath(enemy);
  }

}
