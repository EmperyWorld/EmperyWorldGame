import Phaser from 'phaser';
import type { PlayerSave, PlayerStats, PvpHitPayload } from '../../api.js';
import { playHurtFlash } from '../../sprites/sprite-loader.js';
import type { PlayerController } from '../controllers/PlayerController.js';
import type { RemotePlayerManager } from './RemotePlayerManager.js';
import type { VfxSystem } from './VfxSystem.js';

export interface PvpHudCallbacks {
  onSaveUpdate?: (save: PlayerSave, stats?: PlayerStats) => void;
  onCombatFeedback?: (text: string) => void;
  onTimedBuffs?: (
    buffs: Array<{ id: string; name: string; remainingMs: number; detail?: string }>,
  ) => void;
  onPvpStatus?: (status: {
    karma: number;
    pvpStatus: string;
    pvpFlagRemainingMs?: number;
  }) => void;
  onPlayerDeath?: () => void;
}

export interface PvpPresenterContext {
  scene: Phaser.Scene;
  save: PlayerSave;
  stats: PlayerStats;
  setSave: (save: PlayerSave) => void;
  playerCtrl: PlayerController;
  remotePlayers: RemotePlayerManager;
  vfx: VfxSystem;
  callbacks: PvpHudCallbacks;
}

export class PvpPresenter {
  applyHit(payload: PvpHitPayload, ctx: PvpPresenterContext): void {
    const { scene, stats, setSave, playerCtrl, remotePlayers, vfx, callbacks } = ctx;
    let save = ctx.save;

    remotePlayers.applyPresence(payload.attacker);
    remotePlayers.applyPresence(payload.target);

    if (payload.attackerId === save.id) {
      save = {
        ...save,
        hp: payload.attacker.hp,
        maxHp: payload.attacker.maxHp,
        karma: payload.attacker.karma,
        mp: payload.attackerMp ?? save.mp,
        skillCooldowns: payload.attackerSkillCooldowns ?? save.skillCooldowns,
        inventory: payload.attackerInventory ?? save.inventory,
        equipment: payload.attackerEquipment ?? save.equipment,
        inventoryEnchants: payload.attackerInventoryEnchants ?? save.inventoryEnchants,
        equipmentEnchants: payload.attackerEquipmentEnchants ?? save.equipmentEnchants,
      };
      setSave(save);
      callbacks.onSaveUpdate?.(save, stats);
      callbacks.onPvpStatus?.({
        karma: payload.attacker.karma,
        pvpStatus: payload.attacker.pvpStatus,
        pvpFlagRemainingMs: payload.attacker.pvpFlagRemainingMs,
      });
      const atkRiposteMs = payload.attackerShieldRiposteRemainingMs ?? 0;
      callbacks.onTimedBuffs?.(
        atkRiposteMs > 0
          ? [{ id: 'shield_riposte', name: 'Ответный удар', remainingMs: atkRiposteMs }]
          : [],
      );
      if (payload.riposteConsumed) {
        callbacks.onCombatFeedback?.(`Ответный удар! ${payload.damage} урона`);
      } else if (payload.backstab && !payload.missed && payload.hit) {
        callbacks.onCombatFeedback?.(`Удар в спину! ${payload.damage}`);
      } else if (payload.execute && !payload.missed && payload.hit) {
        callbacks.onCombatFeedback?.(`Казнь! ${payload.damage}`);
      } else if (payload.skillId && !payload.missed && payload.hit) {
        callbacks.onCombatFeedback?.(`Скилл: ${payload.damage} урона`);
      }
      if ((payload.combo ?? 0) >= 3 && payload.hit) {
        callbacks.onCombatFeedback?.(`Комбо x${payload.combo}`);
      }
    }

    if (payload.targetId === save.id) {
      save = {
        ...save,
        hp: payload.target.hp,
        maxHp: payload.target.maxHp,
        karma: payload.target.karma,
      };
      setSave(save);
      callbacks.onSaveUpdate?.(save, stats);
      callbacks.onPvpStatus?.({
        karma: payload.target.karma,
        pvpStatus: payload.target.pvpStatus,
        pvpFlagRemainingMs: payload.target.pvpFlagRemainingMs,
      });
      const defRiposteMs = payload.targetShieldRiposteRemainingMs ?? 0;
      if (defRiposteMs > 0 || payload.shieldRiposteProc) {
        callbacks.onTimedBuffs?.(
          defRiposteMs > 0
            ? [{ id: 'shield_riposte', name: 'Ответный удар', remainingMs: defRiposteMs }]
            : [],
        );
      }
      if (payload.hit && !payload.missed) {
        scene.cameras.main.shake(80, 0.004);
        playerCtrl.playHurt();
        playHurtFlash(scene, playerCtrl.player);
        if (payload.fullyBlocked) {
          vfx.floatText(playerCtrl.player.x, playerCtrl.player.y - 14, 'ПОЛНЫЙ БЛОК', '#88aacc');
          callbacks.onCombatFeedback?.('Несокрушимая стена! Урон погашен');
        } else if (payload.blocked) {
          vfx.floatText(playerCtrl.player.x, playerCtrl.player.y - 14, 'БЛОК', '#88aacc');
          vfx.floatText(playerCtrl.player.x, playerCtrl.player.y, `-${payload.damage}`, '#ffaa77');
          callbacks.onCombatFeedback?.(
            payload.shieldRiposteProc
              ? 'Блок щитом — ответный удар готов'
              : `Блок щитом (−${payload.damage})`,
          );
        } else {
          vfx.floatText(playerCtrl.player.x, playerCtrl.player.y, `-${payload.damage}`, '#ff6666');
        }
      }
    }

    const isAttacker = payload.attackerId === save.id;
    const targetSprite = remotePlayers.getSprite(payload.targetId);
    if (targetSprite && payload.targetId !== save.id) {
      if (payload.missed) {
        vfx.floatText(targetSprite.x, targetSprite.y, 'MISS', '#aaaaaa');
        if (isAttacker) callbacks.onCombatFeedback?.('Промах!');
      } else if (payload.hit) {
        playHurtFlash(scene, targetSprite);
        vfx.sparks(targetSprite.x, targetSprite.y, payload.crit ? 0xffdd44 : 0xff8866, payload.crit ? 8 : 5);
        const dmgText = payload.crit ? `CRIT -${payload.damage}` : `-${payload.damage}`;
        vfx.floatText(targetSprite.x, targetSprite.y, dmgText, payload.crit ? '#ffcc44' : '#ff8888');
        if (payload.backstab) {
          vfx.floatText(targetSprite.x, targetSprite.y - 18, 'СПИНА', '#c090ff');
        } else if (payload.execute) {
          vfx.floatText(targetSprite.x, targetSprite.y - 18, 'КАЗНЬ', '#ff5566');
        } else if (payload.snipe) {
          vfx.floatText(targetSprite.x, targetSprite.y - 18, 'ДАЛЬНИЙ', '#aadd88');
        } else if (payload.pyre) {
          vfx.floatText(targetSprite.x, targetSprite.y - 18, 'КОСТЁР', '#ff8844');
        } else if (payload.vanish) {
          vfx.floatText(targetSprite.x, targetSprite.y - 18, 'РЫВОК', '#ddaaff');
        } else if (payload.seek) {
          vfx.floatText(targetSprite.x, targetSprite.y - 18, 'НАВОДКА', '#bbdd88');
        }
        if (payload.blocked) {
          vfx.floatText(targetSprite.x, targetSprite.y - 14, 'БЛОК', '#88aacc');
        }
        if (isAttacker && !payload.riposteConsumed && payload.crit) {
          callbacks.onCombatFeedback?.(`Крит! ${payload.damage} урона`);
        }
      }
    }
  }

  handleDeath(
    payload: {
      victimId: string;
      killerId: string;
      killerName: string;
      victimName: string;
      wasPk: boolean;
      victimDisconnected?: boolean;
    },
    ctx: Pick<PvpPresenterContext, 'save' | 'playerCtrl' | 'callbacks'>,
  ): void {
    const { save, playerCtrl, callbacks } = ctx;
    const { victimId, killerName, wasPk } = payload;
    if (victimId === save.id) {
      callbacks.onCombatFeedback?.(
        wasPk ? `Вас убил ${killerName} (ПК)` : `Вас убил ${killerName}`,
      );
      playerCtrl.beginDeath(() => callbacks.onPlayerDeath?.());
    } else if (payload.killerId === save.id) {
      const disc = payload.victimDisconnected ? ' · DISCONNECT' : '';
      callbacks.onCombatFeedback?.(
        wasPk
          ? `ПК! Убит ${payload.victimName}${disc}`
          : `PvP: убит ${payload.victimName}${disc}`,
      );
    }
  }
}
