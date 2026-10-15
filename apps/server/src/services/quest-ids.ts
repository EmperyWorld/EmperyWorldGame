import type { PlayerSave } from '@empery/shared';

export function questIdForEnemyType(enemyType: string, save: PlayerSave): string | undefined {
  const f = save.questFlags;
  if (f.quest_grove_active && enemyType === 'goblin_scout') return 'grove_intro';
  if (f.quest_betrayal_active && enemyType === 'shadow_thug') return 'shadow_deal';
  if (f.quest_silverwood_active && enemyType === 'shadow_thug') return 'silverwood_hunt';
  if (f.quest_ash_active && (enemyType === 'orc_grunt' || enemyType === 'goblin_scout')) return 'ash_trial';
  if (f.quest_depths_clear_active && enemyType === 'cave_stalker') return 'depths_clear';
  if (f.quest_depths_purge_active && enemyType === 'deep_wraith') return 'depths_purge';
  if (f.quest_depths_boss_active && enemyType === 'shadow_overlord') return 'depths_boss';
  if (f.quest_signal_active && enemyType === 'signal_drone') return 'signal_sweep';
  if (f.quest_relay_active && enemyType === 'echo_wraith') return 'signal_relay';
  if (f.quest_core_active && enemyType === 'static_colossus') return 'signal_core';
  if (f.quest_chaos_active && enemyType === 'warp_spawn') return 'chaos_breach';
  if (f.quest_fold_active && enemyType === 'fold_horror') return 'chaos_fold';
  if (f.quest_scar_active && enemyType === 'void_leviathan') return 'chaos_scar';
  if (f.quest_collapse_active && enemyType === 'collapse_spawn') return 'collapse_breach';
  if (f.quest_siege_active && enemyType === 'siege_wraith') return 'collapse_siege';
  if (f.quest_citadel_active && enemyType === 'singularity_avatar') return 'collapse_citadel';
  if (f.quest_gods_active && enemyType === 'divine_echo') return 'gods_breach';
  if (f.quest_ascent_active && enemyType === 'pantheon_sentinel') return 'gods_ascent';
  if (f.quest_throne_active && enemyType === 'fallen_sovereign') return 'gods_throne';
  return undefined;
}
