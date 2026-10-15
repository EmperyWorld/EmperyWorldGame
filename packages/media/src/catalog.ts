import { citizenPortraitCatalog } from './citizen-portrait-catalog.js';
import type { MediaJobRequest } from '@empery/shared';
import { SKILL_MEDIA_CATALOG } from './skill-catalog.js';
import { dialoguePortraitCatalog } from './dialogue-portrait-catalog.js';
import { havenShipMediaCatalog } from './ship-catalog.js';
import { ASSET_IMAGE_EXT } from './webp-encode.js';

export interface MediaAssetSpec {
  id: string;
  profile: MediaJobRequest['profile'];
  params: Record<string, string>;
  label: string;
}
const BASE_MEDIA_CATALOG: MediaAssetSpec[] = [
  // Раса × пол × класс — портреты создания / HUD
  ...(['human', 'elf', 'orc'] as const).flatMap((race) =>
    (['male', 'female'] as const).flatMap((gender) =>
      (['warrior', 'rogue', 'mystic', 'archer'] as const).map((profession) => ({
        id: `race_${race}_${gender}_${profession}`,
        profile: 'character_sheet' as const,
        label: `${race} ${gender} ${profession}`,
        params: { race, gender, profession, name: `${race} ${gender} ${profession}` },
      })),
    ),
  ),
  // Fallback: только раса × пол
  {
    id: 'race_human_male',
    profile: 'character_sheet',
    label: 'Human male',
    params: { race: 'human', gender: 'male', profession: 'warrior', name: 'Human male' },
  },
  {
    id: 'race_human_female',
    profile: 'character_sheet',
    label: 'Human female',
    params: { race: 'human', gender: 'female', profession: 'warrior', name: 'Human female' },
  },
  {
    id: 'race_elf_male',
    profile: 'character_sheet',
    label: 'Elf male',
    params: { race: 'elf', gender: 'male', profession: 'warrior', name: 'Elf male' },
  },
  {
    id: 'race_elf_female',
    profile: 'character_sheet',
    label: 'Elf female',
    params: { race: 'elf', gender: 'female', profession: 'warrior', name: 'Elf female' },
  },
  {
    id: 'race_orc_male',
    profile: 'character_sheet',
    label: 'Orc male',
    params: { race: 'orc', gender: 'male', profession: 'warrior', name: 'Orc male' },
  },
  {
    id: 'race_orc_female',
    profile: 'character_sheet',
    label: 'Orc female',
    params: { race: 'orc', gender: 'female', profession: 'warrior', name: 'Orc female' },
  },
  // Legacy unisex fallbacks
  { id: 'race_human', profile: 'character_sheet', label: 'Human', params: { race: 'human', gender: 'male', profession: 'warrior' } },
  { id: 'race_elf', profile: 'character_sheet', label: 'Elf', params: { race: 'elf', gender: 'female', profession: 'warrior' } },
  { id: 'race_orc', profile: 'character_sheet', label: 'Orc', params: { race: 'orc', gender: 'male', profession: 'warrior' } },

  // NPC
  {
    id: 'npc_elder_mira',
    profile: 'portrait_npc',
    label: 'Elder Mira',
    params: { npc_name: 'Elder Mira', race: 'human', mood: 'wise village elder' },
  },

  // Предметы — иконки инвентаря (детальные промпты для ComfyUI)
  {
    id: 'item_rusty_sword',
    profile: 'item_icon',
    label: 'Rusty sword',
    params: { item_name: 'weathered rusty iron shortsword with worn leather grip, medieval fantasy weapon' },
  },
  {
    id: 'item_leather_scrap',
    profile: 'item_icon',
    label: 'Leather scrap',
    params: { item_name: 'stack of brown leather scraps and hide pieces, crafting material' },
  },
  {
    id: 'item_leather_cap',
    profile: 'item_icon',
    label: 'Leather cap',
    params: { item_name: 'sturdy brown leather cap helmet with stitched seams, light adventurer armor' },
  },
  {
    id: 'item_leather_tunic',
    profile: 'item_icon',
    label: 'Leather tunic',
    params: { item_name: 'brown leather chest armor tunic with belts and buckles, ranger gear' },
  },
  {
    id: 'item_leather_boots',
    profile: 'item_icon',
    label: 'Leather boots',
    params: { item_name: 'pair of worn leather boots with folded cuffs, adventurer footwear' },
  },
  {
    id: 'item_iron_chain',
    profile: 'item_icon',
    label: 'Iron chainmail',
    params: { item_name: 'iron chainmail hauberk armor with metallic rings, heavy knight gear' },
  },
  {
    id: 'item_shadow_dagger',
    profile: 'item_icon',
    label: 'Shadow dagger',
    params: { item_name: 'curved dark shadow dagger with purple glow and obsidian blade, rogue weapon' },
  },
  {
    id: 'item_leather_gloves',
    profile: 'item_icon',
    label: 'Leather gloves',
    params: { item_name: 'pair of brown leather gauntlets gloves with stitched seams, light armor' },
  },
  {
    id: 'item_traveler_cloak',
    profile: 'item_icon',
    label: 'Traveler cloak',
    params: { item_name: 'brown wool traveler cape cloak with hood down, fantasy adventurer gear' },
  },
  {
    id: 'item_shadow_cloak',
    profile: 'item_icon',
    label: 'Shadow cloak',
    params: { item_name: 'dark purple shadow cloak with hood, flowing fabric, rogue assassin gear' },
  },
  {
    id: 'item_bronze_sword',
    profile: 'item_icon',
    label: 'Bronze sword',
    params: { item_name: 'polished bronze shortsword with leather-wrapped hilt, medieval fantasy weapon' },
  },
  {
    id: 'item_steel_longsword',
    profile: 'item_icon',
    label: 'Steel longsword',
    params: { item_name: 'steel longsword with crossguard and blue-tinted blade, knight weapon' },
  },
  {
    id: 'item_war_hammer',
    profile: 'item_icon',
    label: 'War hammer',
    params: { item_name: 'heavy iron war hammer with spiked head and wooden haft, brutal weapon' },
  },
  {
    id: 'item_studded_leather',
    profile: 'item_icon',
    label: 'Studded leather',
    params: { item_name: 'brown studded leather chest armor with metal rivets, medium light armor' },
  },
  {
    id: 'item_iron_helm',
    profile: 'item_icon',
    label: 'Iron helm',
    params: { item_name: 'iron open-face helmet with nose guard, medieval heavy armor' },
  },
  {
    id: 'item_iron_greaves',
    profile: 'item_icon',
    label: 'Iron greaves',
    params: { item_name: 'pair of iron plate greaves leg armor with straps, heavy armor' },
  },
  {
    id: 'item_iron_gauntlets',
    profile: 'item_icon',
    label: 'Iron gauntlets',
    params: { item_name: 'pair of iron plate gauntlets with knuckle plates, heavy gloves' },
  },
  {
    id: 'item_steel_cuirass',
    profile: 'item_icon',
    label: 'Steel cuirass',
    params: { item_name: 'polished steel breastplate cuirass with embossed edges, rare heavy armor' },
  },
  {
    id: 'item_hunter_cloak',
    profile: 'item_icon',
    label: 'Hunter cloak',
    params: { item_name: 'green-brown hunter cloak with leaf clasp, ranger outdoor cape' },
  },
  {
    id: 'item_oak_spear',
    profile: 'item_icon',
    label: 'Oak spear',
    params: {
      item_name:
        'oak-shaft spear with iron leaf tip and leather binding, common medieval fantasy weapon icon',
    },
  },
  {
    id: 'item_falchion',
    profile: 'item_icon',
    label: 'Falchion',
    params: {
      item_name:
        'curved single-edge falchion sword with brass guard, uncommon fantasy weapon icon',
    },
  },
  {
    id: 'item_battle_axe',
    profile: 'item_icon',
    label: 'Battle axe',
    params: {
      item_name:
        'heavy double-bit battle axe with worn steel blades and wooden haft, uncommon weapon icon',
    },
  },
  {
    id: 'item_knight_blade',
    profile: 'item_icon',
    label: 'Knight blade',
    params: {
      item_name:
        'ornate knight longsword with silver crossguard and blue ribbon, rare fantasy weapon icon',
    },
  },
  {
    id: 'item_padded_coif',
    profile: 'item_icon',
    label: 'Padded coif',
    params: {
      item_name:
        'quilted padded cloth coif hood helmet, light common armor icon',
    },
  },
  {
    id: 'item_sentry_helm',
    profile: 'item_icon',
    label: 'Sentry helm',
    params: {
      item_name:
        'steel sentry open-face helmet with cheek guards, uncommon heavy armor icon',
    },
  },
  {
    id: 'item_scale_vest',
    profile: 'item_icon',
    label: 'Scale vest',
    params: {
      item_name:
        'bronze scale mail vest with overlapping fish-scale plates, uncommon light chest armor',
    },
  },
  {
    id: 'item_hardened_boots',
    profile: 'item_icon',
    label: 'Hardened boots',
    params: {
      item_name:
        'pair of hardened leather reinforced boots with metal toe caps, uncommon light greaves',
    },
  },
  {
    id: 'item_plate_greaves',
    profile: 'item_icon',
    label: 'Plate greaves',
    params: {
      item_name:
        'pair of polished steel plate greaves with knee cops, uncommon heavy leg armor',
    },
  },
  {
    id: 'item_ringmail_gloves',
    profile: 'item_icon',
    label: 'Ringmail gloves',
    params: {
      item_name:
        'pair of ringmail chain gloves with leather palms, uncommon heavy gloves',
    },
  },
  {
    id: 'item_sergeant_cloak',
    profile: 'item_icon',
    label: 'Sergeant cloak',
    params: {
      item_name:
        'crimson and grey sergeant military cloak with brass clasp, uncommon cape icon',
    },
  },
  {
    id: 'item_brigandine',
    profile: 'item_icon',
    label: 'Brigandine',
    params: {
      item_name:
        'brigandine chest armor with riveted metal plates under leather, rare heavy body armor',
    },
  },

  {
    id: 'item_dusk_blade',
    profile: 'item_icon',
    label: 'Dusk blade',
    params: {
      item_name:
        'curved dusk steel longsword with violet twilight glow and dark leather grip, rare fantasy weapon icon',
    },
  },
  {
    id: 'item_shadow_mail',
    profile: 'item_icon',
    label: 'Shadow mail',
    params: {
      item_name:
        'dark shadow chainmail hauberk with purple-black rings and faint ethereal glow, rare heavy chest armor',
    },
  },
  {
    id: 'item_void_gloves',
    profile: 'item_icon',
    label: 'Void gloves',
    params: {
      item_name:
        'pair of black void leather gauntlets with indigo runes and void cracks, uncommon light gloves',
    },
  },
  {
    id: 'item_depths_cloak',
    profile: 'item_icon',
    label: 'Depths cloak',
    params: {
      item_name:
        'deep indigo cave depths cloak with tattered hem and bioluminescent edge glow, rare adventurer cape',
    },
  },
  {
    id: 'item_rune_greaves',
    profile: 'item_icon',
    label: 'Rune greaves',
    params: {
      item_name:
        'iron greaves boots with glowing cyan runes etched into plates, uncommon heavy leg armor',
    },
  },
  {
    id: 'item_crystal_helm',
    profile: 'item_icon',
    label: 'Crystal helm',
    params: {
      item_name:
        'steel helmet crowned with pale blue crystal shards and silver filigree, rare heavy head armor',
    },
  },

  {
    id: 'item_nightfang',
    profile: 'item_icon',
    label: 'Nightfang',
    params: {
      item_name:
        'curved epic assassin dagger with ashen black blade, violet edge glow and bone-wrapped grip, unique light weapon icon',
    },
  },
  {
    id: 'item_hush_cowl',
    profile: 'item_icon',
    label: 'Hush cowl',
    params: {
      item_name:
        'deep charcoal soft leather rogue cowl with muted ash embroidery and shadowed eye slits, epic light hood',
    },
  },
  {
    id: 'item_emberhide',
    profile: 'item_icon',
    label: 'Emberhide',
    params: {
      item_name:
        'ashen emberhide leather jerkin with smoldering orange seams and dark soot stains, epic light chest armor',
    },
  },
  {
    id: 'item_ghoststride',
    profile: 'item_icon',
    label: 'Ghoststride',
    params: {
      item_name:
        'silent ghoststride soft boots with pale mist trails and thin silver soles, epic light footwear',
    },
  },
  {
    id: 'item_bloodlace',
    profile: 'item_icon',
    label: 'Bloodlace',
    params: {
      item_name:
        'bloodlace fingerless assassin gloves with crimson lace and thin razor-thread stitching, epic light gloves',
    },
  },
  {
    id: 'item_mothwing_cloak',
    profile: 'item_icon',
    label: 'Mothwing cloak',
    params: {
      item_name:
        'mothwing epic cloak with iridescent ash-grey wing patterns and powdery trailing hem, unique light cape',
    },
  },

  {
    id: 'item_oak_spear',
    profile: 'item_icon',
    label: 'Дубовое копьё',
    params: { item_name: 'oak spear, fantasy weapon, detailed hand-painted game art' },
  },

  {
    id: 'item_falchion',
    profile: 'item_icon',
    label: 'Фальшион',
    params: { item_name: 'falchion, fantasy weapon, detailed hand-painted game art' },
  },

  {
    id: 'item_battle_axe',
    profile: 'item_icon',
    label: 'Боевой топор',
    params: { item_name: 'battle axe, fantasy weapon, detailed hand-painted game art' },
  },

  {
    id: 'item_knight_blade',
    profile: 'item_icon',
    label: 'Клинок рыцаря',
    params: { item_name: 'knight blade, fantasy weapon, detailed hand-painted game art' },
  },

  {
    id: 'item_padded_coif',
    profile: 'item_icon',
    label: 'Стёганый капюшон',
    params: { item_name: 'padded coif, helmet head armor, detailed hand-painted game art' },
  },

  {
    id: 'item_sentry_helm',
    profile: 'item_icon',
    label: 'Шлем часового',
    params: { item_name: 'sentry helm, helmet head armor, detailed hand-painted game art' },
  },

  {
    id: 'item_scale_vest',
    profile: 'item_icon',
    label: 'Чешуйчатый жилет',
    params: { item_name: 'scale vest, chest body armor, detailed hand-painted game art' },
  },

  {
    id: 'item_hardened_boots',
    profile: 'item_icon',
    label: 'Укреплённые сапоги',
    params: { item_name: 'hardened boots, leg boots footwear, detailed hand-painted game art' },
  },

  {
    id: 'item_plate_greaves',
    profile: 'item_icon',
    label: 'Латные поножи',
    params: { item_name: 'plate greaves, leg boots footwear, detailed hand-painted game art' },
  },

  {
    id: 'item_ringmail_gloves',
    profile: 'item_icon',
    label: 'Кольчужные перчатки',
    params: { item_name: 'ringmail gloves, gauntlets gloves hand armor, detailed hand-painted game art' },
  },

  {
    id: 'item_sergeant_cloak',
    profile: 'item_icon',
    label: 'Плащ сержанта',
    params: { item_name: 'sergeant cloak, cape cloak back armor, detailed hand-painted game art' },
  },

  {
    id: 'item_brigandine',
    profile: 'item_icon',
    label: 'Бригантина',
    params: { item_name: 'brigandine, chest body armor, detailed hand-painted game art' },
  },

  {
    id: 'item_void_petal',
    profile: 'item_icon',
    label: 'Void petal',
    params: {
      item_name:
        'epic curved dagger with crimson petal-shaped guard and void-black blade, scarlet silk wrap, light assassin weapon icon',
    },
  },
  {
    id: 'item_starfall_fang',
    profile: 'item_icon',
    label: 'Starfall fang',
    params: {
      item_name:
        'legendary starfall fang dagger with golden constellation inlays and comet-trail blue glow, light fantasy weapon icon',
    },
  },
  {
    id: 'item_daedric_razor',
    profile: 'item_icon',
    label: 'Daedric razor',
    params: {
      item_name:
        'daedric razor jagged obsidian dagger with molten crimson runes and demonic spiked hilt, dark legendary light weapon icon',
    },
  },

  {
    id: 'item_daedric_shroud',
    profile: 'item_icon',
    label: 'Daedric shroud',
    params: {
      item_name:
        'daedric light cloak of blackened obsidian silk with molten crimson rune trim and spiked shoulder clasps, demonic flowing cape icon',
    },
  },
  {
    id: 'item_daedric_hide_vest',
    profile: 'item_icon',
    label: 'Daedric hide vest',
    params: {
      item_name:
        'ultra-thin elastic daedra leather vest, paper-thin black demonic hide that stretches like second skin yet harder than steel, molten crimson stitch runes, light chest armor icon',
    },
  },

  {
    id: 'item_wooden_buckler',
    profile: 'item_icon',
    label: 'Wooden buckler',
    params: {
      item_name:
        'small round wooden buckler shield with iron boss and leather rim, simple starter shield icon',
    },
  },
  {
    id: 'item_iron_kite_shield',
    profile: 'item_icon',
    label: 'Iron kite shield',
    params: {
      item_name:
        'iron kite drop-shaped shield with riveted plates and worn grey metal, uncommon shield icon',
    },
  },
  {
    id: 'item_steel_heater_shield',
    profile: 'item_icon',
    label: 'Steel heater shield',
    params: {
      item_name:
        'polished steel heater shield with blue enamel cross and reinforced rim, rare knight shield icon',
    },
  },
  {
    id: 'item_daedric_tower_shield',
    profile: 'item_icon',
    label: 'Daedric tower shield',
    params: {
      item_name:
        'huge daedric tower shield of blackened obsidian plates with molten crimson runes and demonic spikes, fat bulky legendary shield icon',
    },
  },
  {
    id: 'item_daedric_warhelm',
    profile: 'item_icon',
    label: 'Daedric warhelm',
    params: {
      item_name:
        'massive daedric war helmet with thick spiked horns, molten crimson eye slits and heavy demonic plating, bulky heavy helm icon',
    },
  },
  {
    id: 'item_daedric_bulkplate',
    profile: 'item_icon',
    label: 'Daedric bulkplate',
    params: {
      item_name:
        'extremely bulky overweight daedric chest plate, fat layered obsidian slabs with molten crimson seams and spiked pauldrons, heavy tank armor icon',
    },
  },
  {
    id: 'item_daedric_bulkgreaves',
    profile: 'item_icon',
    label: 'Daedric bulkgreaves',
    params: {
      item_name:
        'thick heavy daedric greaves and boots with chunky blackened plates molten crimson rivets, bulky leg armor icon',
    },
  },
  {
    id: 'item_daedric_bulkgauntlets',
    profile: 'item_icon',
    label: 'Daedric bulkgauntlets',
    params: {
      item_name:
        'oversized daedric gauntlets of blackened metal with clawed knuckles and molten crimson runes, heavy fist armor icon',
    },
  },

  {
    id: 'item_holy_crusader_shield',
    profile: 'item_icon',
    label: 'Holy crusader shield',
    params: {
      item_name:
        'tall ornate holy crusader tower shield of polished ivory-white and gold metal, radiant golden cross, clear capital letters EW emblem centered on the face, sacred light glow, divine high fantasy shield icon',
    },
  },

  {
    id: 'item_short_bow',
    profile: 'item_icon',
    label: 'Короткий лук',
    params: { item_name: 'short bow, fantasy weapon, detailed hand-painted game art' },
  },

  {
    id: 'item_hunter_bow',
    profile: 'item_icon',
    label: 'Охотничий лук',
    params: { item_name: 'hunter bow, fantasy weapon, detailed hand-painted game art' },
  },

  {
    id: 'item_composite_bow',
    profile: 'item_icon',
    label: 'Составной лук',
    params: { item_name: 'composite bow, fantasy weapon, detailed hand-painted game art' },
  },

  {
    id: 'item_wooden_arrow',
    profile: 'item_icon',
    label: 'Деревянная стрела',
    params: { item_name: 'wooden arrow, fantasy item, detailed hand-painted game art' },
  },

  {
    id: 'item_iron_arrow',
    profile: 'item_icon',
    label: 'Железная стрела',
    params: { item_name: 'iron arrow, fantasy item, detailed hand-painted game art' },
  },

  {
    id: 'item_elven_longbow',
    profile: 'item_icon',
    label: 'Эльфийский длинный лук',
    params: { item_name: 'elven longbow, fantasy weapon, detailed hand-painted game art' },
  },

  {
    id: 'item_storm_bow',
    profile: 'item_icon',
    label: 'Лук бури',
    params: { item_name: 'storm bow, fantasy weapon, detailed hand-painted game art' },
  },

  {
    id: 'item_daedric_composite_bow',
    profile: 'item_icon',
    label: 'Даэдрический составной лук',
    params: {
      item_name:
        'daedric composite bow, black crimson ebony limbs, glowing red runes, demonic fantasy weapon icon, detailed hand-painted game art',
    },
  },

  {
    id: 'item_field_radio',
    profile: 'item_icon',
    label: 'Полевая рация',
    params: { item_name: 'field radio, crafting material resource, detailed hand-painted game art' },
  },

  {
    id: 'item_resurrection_scroll',
    profile: 'item_icon',
    label: 'Свиток воскрешения',
    params: {
      item_name:
        'ancient parchment resurrection scroll, glowing holy runes, white gold light, fantasy RPG item icon, detailed hand-painted game art',
    },
  },

  {
    id: 'item_radio_battery_pack',
    profile: 'item_icon',
    label: 'Комплект батареек',
    params: { item_name: 'radio battery pack, crafting material resource, detailed hand-painted game art' },
  },

  {
    id: 'item_apprentice_staff',
    profile: 'item_icon',
    label: 'Учеников посох',
    params: { item_name: 'apprentice staff, fantasy weapon, detailed hand-painted game art' },
  },

  {
    id: 'item_novice_robe',
    profile: 'item_icon',
    label: 'Роба новичка',
    params: { item_name: 'novice robe, chest body armor, detailed hand-painted game art' },
  },

  {
    id: 'item_cloth_cowl',
    profile: 'item_icon',
    label: 'Тканевый капюшон',
    params: { item_name: 'cloth cowl, helmet head armor, detailed hand-painted game art' },
  },

  {
    id: 'item_cloth_sandals',
    profile: 'item_icon',
    label: 'Тканевые сандалии',
    params: { item_name: 'cloth sandals, leg boots footwear, detailed hand-painted game art' },
  },

  {
    id: 'item_cloth_wraps',
    profile: 'item_icon',
    label: 'Тканевые обмотки',
    params: { item_name: 'cloth wraps, gauntlets gloves hand armor, detailed hand-painted game art' },
  },

  {
    id: 'item_adept_staff',
    profile: 'item_icon',
    label: 'Посох адепта',
    params: { item_name: 'adept staff, fantasy weapon, detailed hand-painted game art' },
  },

  {
    id: 'item_linen_robe',
    profile: 'item_icon',
    label: 'Льняная роба',
    params: {
      item_name:
        'linen mage robe with soft blue embroidery and tied sash, cloth chest armor icon',
    },
  },

  {
    id: 'item_linen_cowl',
    profile: 'item_icon',
    label: 'Льняной капюшон',
    params: {
      item_name:
        'linen mystic cowl hood with pale rune stitch, soft cloth head armor icon',
    },
  },

  {
    id: 'item_linen_slippers',
    profile: 'item_icon',
    label: 'Льняные туфли',
    params: {
      item_name:
        'pair of soft linen mage slippers with thin soles, cloth footwear icon',
    },
  },

  {
    id: 'item_linen_gloves',
    profile: 'item_icon',
    label: 'Льняные перчатки',
    params: {
      item_name:
        'pair of thin linen mystic gloves with faint arcane thread, cloth hand armor icon',
    },
  },

  {
    id: 'item_weave_cloak',
    profile: 'item_icon',
    label: 'Плащ плетения',
    params: {
      item_name:
        'woven arcane cloak with shimmering thread patterns, mystic cloth cape icon',
    },
  },

  {
    id: 'item_crystal_staff',
    profile: 'item_icon',
    label: 'Кристальный посох',
    params: {
      item_name:
        'tall crystal-tipped mage staff with clear blue shard and carved wood shaft, fantasy magic weapon icon',
    },
  },

  {
    id: 'item_silk_hood',
    profile: 'item_icon',
    label: 'Шёлковый капюшон',
    params: {
      item_name:
        'deep indigo silk mage hood with silver trim, rare cloth head armor icon',
    },
  },

  {
    id: 'item_silk_robe',
    profile: 'item_icon',
    label: 'Шёлковая роба',
    params: {
      item_name:
        'flowing indigo silk robe with silver arcane filigree, rare mystic chest armor icon',
    },
  },

  {
    id: 'item_silk_slippers',
    profile: 'item_icon',
    label: 'Шёлковые туфли',
    params: {
      item_name:
        'pair of indigo silk mage slippers with silver soles, rare cloth footwear icon',
    },
  },

  {
    id: 'item_silk_gloves',
    profile: 'item_icon',
    label: 'Шёлковые перчатки',
    params: {
      item_name:
        'pair of indigo silk mystic gloves with silver stitching, rare cloth hand armor icon',
    },
  },

  {
    id: 'item_silk_mantle',
    profile: 'item_icon',
    label: 'Шёлковая мантия',
    params: {
      item_name:
        'indigo silk mystic mantle cloak with silver runes, rare cloth cape icon',
    },
  },

  {
    id: 'item_void_oracle_staff',
    profile: 'item_icon',
    label: 'Посох пустотного оракула',
    params: {
      item_name:
        'epic void oracle staff with dark purple crystal orb and blackened shaft, violet void glow, fantasy magic weapon icon',
    },
  },

  {
    id: 'item_starweave_hood',
    profile: 'item_icon',
    label: 'Капюшон звёздной нити',
    params: {
      item_name:
        'starweave mystic hood embroidered with constellation gold thread on midnight cloth, epic head armor icon',
    },
  },

  {
    id: 'item_starweave_robe',
    profile: 'item_icon',
    label: 'Роба звёздной нити',
    params: {
      item_name:
        'starweave midnight robe with gold constellation embroidery and soft cosmic glow, epic mystic chest armor icon',
    },
  },

  {
    id: 'item_starweave_slippers',
    profile: 'item_icon',
    label: 'Туфли звёздной нити',
    params: {
      item_name:
        'pair of starweave midnight slippers with gold constellation soles, epic cloth footwear icon',
    },
  },

  {
    id: 'item_starweave_gloves',
    profile: 'item_icon',
    label: 'Перчатки звёздной нити',
    params: {
      item_name:
        'pair of starweave mystic gloves with gold constellation thread, epic cloth hand armor icon',
    },
  },

  {
    id: 'item_starweave_cloak',
    profile: 'item_icon',
    label: 'Плащ звёздной нити',
    params: {
      item_name:
        'starweave midnight cloak trailing faint starlight motes, epic mystic cape icon',
    },
  },

  {
    id: 'item_rift_scepter',
    profile: 'item_icon',
    label: 'Скипетр разлома',
    params: {
      item_name:
        'legendary rift scepter with crimson anomaly crystal and warped black metal shaft, reality crack glow, fantasy magic weapon icon',
    },
  },

  {
    id: 'item_eclipse_vestments',
    profile: 'item_icon',
    label: 'Облачение затмения',
    params: {
      item_name:
        'legendary eclipse mystic vestments robe of black and pale gold with solar eclipse emblem and soft corona glow, cloth chest armor icon',
    },
  },

  {
    id: 'item_radio_battery_12h',
    profile: 'item_icon',
    label: 'Батарейки 12 ч',
    params: { item_name: 'radio battery 12h, crafting material resource, detailed hand-painted game art' },
  },

  {
    id: 'item_radio_battery_24h',
    profile: 'item_icon',
    label: 'Батарейки 24 ч',
    params: { item_name: 'radio battery 24h, crafting material resource, detailed hand-painted game art' },
  },

  {
    id: 'item_resurrection_scroll',
    profile: 'item_icon',
    label: 'Свиток воскрешения',
    params: { item_name: 'resurrection scroll, fantasy item, detailed hand-painted game art' },
  },

  {
    id: 'item_dirty_water',
    profile: 'item_icon',
    label: 'Мутная вода',
    params: { item_name: 'dirty water, fantasy item, detailed hand-painted game art' },
  },

  {
    id: 'item_filtered_water',
    profile: 'item_icon',
    label: 'Фильтрованная вода',
    params: { item_name: 'filtered water, fantasy item, detailed hand-painted game art' },
  },

  {
    id: 'item_boiled_water',
    profile: 'item_icon',
    label: 'Кипячёная вода',
    params: { item_name: 'boiled water, fantasy item, detailed hand-painted game art' },
  },

  {
    id: 'item_raw_meat',
    profile: 'item_icon',
    label: 'Сырое мясо',
    params: { item_name: 'raw meat, fantasy item, detailed hand-painted game art' },
  },

  {
    id: 'item_cooked_meat',
    profile: 'item_icon',
    label: 'Жареное мясо',
    params: { item_name: 'cooked meat, fantasy item, detailed hand-painted game art' },
  },

  {
    id: 'item_charcoal_filter',
    profile: 'item_icon',
    label: 'Угольный фильтр',
    params: { item_name: 'charcoal filter, crafting material resource, detailed hand-painted game art' },
  },

  {
    id: 'item_camp_fuel',
    profile: 'item_icon',
    label: 'Связка сухих дров',
    params: { item_name: 'camp fuel, crafting material resource, detailed hand-painted game art' },
  },

  {
    id: 'item_field_pot',
    profile: 'item_icon',
    label: 'Походный котелок',
    params: { item_name: 'field pot, crafting material resource, detailed hand-painted game art' },
  },

  {
    id: 'item_firestarter',
    profile: 'item_icon',
    label: 'Огниво',
    params: { item_name: 'firestarter, crafting material resource, detailed hand-painted game art' },
  },

  {
    id: 'item_field_bandage',
    profile: 'item_icon',
    label: 'Полевой бинт',
    params: { item_name: 'field bandage, fantasy item, detailed hand-painted game art' },
  },

  {
    id: 'item_antibiotic_tonic',
    profile: 'item_icon',
    label: 'Противоинфекционный настой',
    params: { item_name: 'antibiotic tonic, fantasy item, detailed hand-painted game art' },
  },

  {
    id: 'item_cooling_draught',
    profile: 'item_icon',
    label: 'Охлаждающий настой',
    params: { item_name: 'cooling draught, fantasy item, detailed hand-painted game art' },
  },

  {
    id: 'item_dried_meat',
    profile: 'item_icon',
    label: 'Вяленое мясо',
    params: { item_name: 'dried meat, fantasy item, detailed hand-painted game art' },
  },

  {
    id: 'item_raw_fish',
    profile: 'item_icon',
    label: 'Сырая рыба',
    params: { item_name: 'raw fish, fantasy item, detailed hand-painted game art' },
  },

  {
    id: 'item_cooked_fish',
    profile: 'item_icon',
    label: 'Жареная рыба',
    params: { item_name: 'cooked fish, fantasy item, detailed hand-painted game art' },
  },

  {
    id: 'item_dried_fish',
    profile: 'item_icon',
    label: 'Вяленая рыба',
    params: { item_name: 'dried fish, fantasy item, detailed hand-painted game art' },
  },

  {
    id: 'item_bread_loaf',
    profile: 'item_icon',
    label: 'Свежий хлеб',
    params: { item_name: 'bread loaf, fantasy item, detailed hand-painted game art' },
  },

  {
    id: 'item_travel_biscuit',
    profile: 'item_icon',
    label: 'Дорожный сухарь',
    params: { item_name: 'travel biscuit, fantasy item, detailed hand-painted game art' },
  },

  {
    id: 'item_haven_ale',
    profile: 'item_icon',
    label: 'Эль Гавани',
    params: { item_name: 'haven ale, fantasy item, detailed hand-painted game art' },
  },

  {
    id: 'item_mill_grain',
    profile: 'item_icon',
    label: 'Рожь',
    params: { item_name: 'mill grain, crafting material resource, detailed hand-painted game art' },
  },

  {
    id: 'item_mill_flour',
    profile: 'item_icon',
    label: 'Мука',
    params: { item_name: 'mill flour, crafting material resource, detailed hand-painted game art' },
  },

  {
    id: 'item_holm_stout',
    profile: 'item_icon',
    label: 'Стаут Хольма',
    params: { item_name: 'dark stout ale tankard, foam, fantasy tavern drink, detailed hand-painted game art' },
  },

  {
    id: 'item_stable_hay',
    profile: 'item_icon',
    label: 'Охапка сена',
    params: { item_name: 'stable hay, crafting material resource, detailed hand-painted game art' },
  },

  {
    id: 'item_scribe_travel_writ',
    profile: 'item_icon',
    label: 'Путевая грамота Гавани',
    params: { item_name: 'scribe travel writ, crafting material resource, detailed hand-painted game art' },
  },

  {
    id: 'item_scribe_port_folio',
    profile: 'item_icon',
    label: 'Опись причалов',
    params: { item_name: 'scribe port folio, crafting material resource, detailed hand-painted game art' },
  },

  {
    id: 'item_port_crate',
    profile: 'item_icon',
    label: 'Портовый ящик',
    params: { item_name: 'heavy wooden port crate, rope, dock cargo, detailed hand-painted game art' },
  },

  {
    id: 'item_lavr_notes',
    profile: 'item_icon',
    label: 'Записки Лавра',
    params: { item_name: 'teacher lecture notes parchment, ink, fantasy item, detailed hand-painted game art' },
  },

  {
    id: 'item_sera_bandage',
    profile: 'item_icon',
    label: 'Полевой бинт Серы',
    params: { item_name: 'herbal field bandage roll, medical, fantasy item, detailed hand-painted game art' },
  },

  {
    id: 'item_smoked_brisket',
    profile: 'item_icon',
    label: 'Копчёная грудинка',
    params: { item_name: 'smoked brisket meat, smoke, fantasy food, detailed hand-painted game art' },
  },

  {
    id: 'item_garden_cabbage',
    profile: 'item_icon',
    label: 'Капуста с грядки',
    params: { item_name: 'fresh garden cabbage, fantasy food, detailed hand-painted game art' },
  },

  {
    id: 'item_whisper_dossier',
    profile: 'item_icon',
    label: 'Досье Переулка',
    params: { item_name: 'sealed shady dossier scroll, wax, fantasy item, detailed hand-painted game art' },
  },

  {
    id: 'item_smith_whetstone',
    profile: 'item_icon',
    label: 'Оселок Гарольда',
    params: { item_name: 'blacksmith whetstone, crafting material resource, detailed hand-painted game art' },
  },
  {
    id: 'item_cassius_candle',
    profile: 'item_icon',
    label: 'Свеча Кассия',
    params: { item_name: 'temple votive candle, fantasy item, detailed hand-painted game art' },
  },
  {
    id: 'item_marta_stew',
    profile: 'item_icon',
    label: 'Ночной горшок Марты',
    params: { item_name: 'hearty tavern stew bowl, fantasy food, detailed hand-painted game art' },
  },
  {
    id: 'item_oleg_broth',
    profile: 'item_icon',
    label: 'Дневной обед Олега',
    params: { item_name: 'innkeeper broth bowl, fantasy food, detailed hand-painted game art' },
  },
  {
    id: 'item_nika_oil',
    profile: 'item_icon',
    label: 'Масло Ники',
    params: { item_name: 'bath massage oil vial, fantasy item, detailed hand-painted game art' },
  },
  {
    id: 'item_forum_bulletin',
    profile: 'item_icon',
    label: 'Листовка форума',
    params: { item_name: 'city notice bulletin parchment, fantasy item, detailed hand-painted game art' },
  },
  {
    id: 'item_forum_seal',
    profile: 'item_icon',
    label: 'Печать магистрата',
    params: { item_name: 'wax municipal seal, fantasy item, detailed hand-painted game art' },
  },
  {
    id: 'item_hq_visitor_badge',
    profile: 'item_icon',
    label: 'Жетон HQ',
    params: { item_name: 'corporate visitor badge, sci-fi item, detailed hand-painted game art' },
  },
  {
    id: 'item_apt_ration',
    profile: 'item_icon',
    label: 'Паёк жильца',
    params: { item_name: 'apartment leftover ration, fantasy food, detailed hand-painted game art' },
  },
  {
    id: 'item_apt_travel_kit',
    profile: 'item_icon',
    label: 'Дорожный набор',
    params: { item_name: 'travel kit pack, fantasy item, detailed hand-painted game art' },
  },

  {
    id: 'item_ulf_bait',
    profile: 'item_icon',
    label: 'Наживка Ульфа',
    params: { item_name: 'ulf bait, crafting material resource, detailed hand-painted game art' },
  },

  {
    id: 'item_plaza_charm',
    profile: 'item_icon',
    label: 'Талисман площади',
    params: { item_name: 'plaza charm, crafting material resource, detailed hand-painted game art' },
  },

  {
    id: 'item_market_pie',
    profile: 'item_icon',
    label: 'Пирог с прилавка',
    params: { item_name: 'market pie, fantasy item, detailed hand-painted game art' },
  },

  {
    id: 'item_prayer_ribbon',
    profile: 'item_icon',
    label: 'Молитвенная лента',
    params: { item_name: 'prayer ribbon, crafting material resource, detailed hand-painted game art' },
  },

  {
    id: 'item_craft_scrap',
    profile: 'item_icon',
    label: 'Обрезки с горна',
    params: { item_name: 'craft scrap, crafting material resource, detailed hand-painted game art' },
  },

  {
    id: 'item_harbor_charm',
    profile: 'item_icon',
    label: 'Оберег причала',
    params: { item_name: 'harbor charm, crafting material resource, detailed hand-painted game art' },
  },

  // Локации — фоны (меню / загрузка)
  {
    id: 'location_starter_grove',
    profile: 'location_bg',
    label: 'Starter grove',
    params: { location_name: 'peaceful forest grove meadow sunlight' },
  },
  {
    id: 'location_empery_haven',
    profile: 'location_bg',
    label: 'Empery Haven',
    params: {
      location_name:
        'imperial fantasy harbor city aerial vista, distinct districts: northwest garrison barracks with campfire parade ground, central forum fountain and clock tower, grand open-air amphitheatre with red carpet south of plaza, western market stalls and guildhall, southwest residential tenement quarter, northeast municipal palace cathedral and library, eastern inns and bathhouse, southeast river port with piers and ships, stone walls and gatehouses, warm lantern dusk light, painterly AAA game concept art, rich amber and slate palette',
    },
  },
  {
    id: 'location_haven_apartment',
    profile: 'location_bg',
    label: 'Haven apartment',
    params: {
      location_name:
        'cozy imperial fantasy apartment interior top-down view, russian masonry stove with warm fire glow in living room, wooden floorboards, chest weapon rack and icebox furniture, soft amber lantern light, private tenant flat, painterly AAA game concept art',
    },
  },
  {
    id: 'location_silverwood',
    profile: 'location_bg',
    label: 'Silverwood',
    params: { location_name: 'silver elven forest moonlight magical trees' },
  },
  {
    id: 'location_ash_highlands',
    profile: 'location_bg',
    label: 'Ash highlands',
    params: { location_name: 'volcanic ash highlands orc barbarian lands' },
  },
  {
    id: 'location_adena_fields',
    profile: 'location_bg',
    label: 'Adena fields',
    params: { location_name: 'golden wheat farm fields open meadow fantasy farmland sunny' },
  },
  {
    id: 'location_suburban_park',
    profile: 'location_bg',
    label: 'Suburban park',
    params: {
      location_name:
        'abandoned suburban city park asphalt paths pond benches street lamps overgrown lawn anomaly haze twilight',
    },
  },
  {
    id: 'location_abandoned_yard',
    profile: 'location_bg',
    label: 'Abandoned yard',
    params: {
      location_name:
        'abandoned construction site unfinished concrete buildings rebar crates fences dirt roads anomaly dusk',
    },
  },
  {
    id: 'location_intersection_district',
    profile: 'location_bg',
    label: 'Intersection district',
    params: {
      location_name:
        'neon city crossroads night anomaly rift glowing street lamps glass towers purple blue haze',
    },
  },
  {
    id: 'location_signal_block',
    profile: 'location_bg',
    label: 'Signal block',
    params: {
      location_name:
        'abandoned city block rooftop antennas radio towers static haze teal neon dusk urban rooftops',
    },
  },
  {
    id: 'location_relay_spire',
    profile: 'location_bg',
    label: 'Relay spire',
    params: {
      location_name:
        'tall ruined radio relay tower spire steel lattice cables sparks cyan echo haze night city rooftop',
    },
  },
  {
    id: 'location_static_core',
    profile: 'location_bg',
    label: 'Static core',
    params: {
      location_name:
        'underground anomaly core chamber glowing teal cables concentric platforms static colossus arena dark industrial',
    },
  },
  {
    id: 'location_chaos_sector',
    profile: 'location_bg',
    label: 'Chaos sector',
    params: {
      location_name:
        'warped ruined city floating debris crimson magenta distortion haze cracked earth anomaly wasteland twilight',
    },
  },
  {
    id: 'location_fracture_ridge',
    profile: 'location_bg',
    label: 'Fracture ridge',
    params: {
      location_name:
        'jagged fracture ridge broken cliffs crimson cracks floating boulders magenta rift sky harsh anomaly ridge',
    },
  },
  {
    id: 'location_void_scar',
    profile: 'location_bg',
    label: 'Void scar',
    params: {
      location_name:
        'deep void scar canyon crimson black chasm floating debris dark magenta abyss leviathan lair anomaly wound',
    },
  },
  {
    id: 'location_collapse_fringe',
    profile: 'location_bg',
    label: 'Collapse fringe',
    params: {
      location_name:
        'collapsing world fringe floating ruins ash horizon black sky crimson dust end of reality wasteland twilight',
    },
  },
  {
    id: 'location_citadel_approach',
    profile: 'location_bg',
    label: 'Citadel approach',
    params: {
      location_name:
        'dark siege road to singularity citadel black walls horizon crimson banners floating debris endgame approach',
    },
  },
  {
    id: 'location_singularity_citadel',
    profile: 'location_bg',
    label: 'Singularity citadel',
    params: {
      location_name:
        'black singularity citadel throne hall crimson void core dark marble columns endgame fortress interior',
    },
  },
  {
    id: 'location_gods_rift',
    profile: 'location_bg',
    label: 'Gods rift',
    params: {
      location_name:
        'golden divine rift cracked sky floating temple ruins god shards glowing fissures endgame anomaly landscape',
    },
  },
  {
    id: 'location_pantheon_ascent',
    profile: 'location_bg',
    label: 'Pantheon ascent',
    params: {
      location_name:
        'ascending ruined pantheon stairs golden columns broken idols temple terraces endgame divine ascent',
    },
  },
  {
    id: 'location_godfall_throne',
    profile: 'location_bg',
    label: 'Godfall throne',
    params: {
      location_name:
        'empty golden god throne hall shattered pantheon apex fallen sovereign aura divine endgame interior',
    },
  },
  {
    id: 'location_cave',
    profile: 'location_bg',
    label: 'Goblin cave',
    params: { location_name: 'dark goblin cave dungeon rocky east' },
  },
  {
    id: 'location_shadow_grove',
    profile: 'location_bg',
    label: 'Shadow grove',
    params: { location_name: 'shadowy smuggler grove dark west forest' },
  },

  // Тайлсеты локаций (8×64 strip после postprocess / pack)
  {
    id: 'tileset_starter_grove',
    profile: 'tileset',
    label: 'Tiles starter grove',
    params: { grass: 'sunlit green grass meadow flowers', path: 'packed dirt trail', water: 'forest pond blue water', wall: 'dense oak forest border' },
  },
  {
    id: 'tileset_empery_haven',
    profile: 'tileset',
    label: 'Tiles empery haven',
    params: {
      grass: 'warm sandstone plaza with FINE tiny cobbles 12+ across tile, thin gold-tan mortar',
      path: 'imperial street of SMALL grey cobblestones 12+ across tile, worn wheel tracks, dense',
      water: 'deep harbor water teal small ripples',
      wall: 'dark stone masonry bricks many small bricks across tile',
    },
  },
  // Мелкозернистые отдельные тайлы Гавани → pack в tileset_empery_haven (512×64)
  {
    id: 'tile_haven_plaza_a',
    profile: 'terrain_tile',
    label: 'Haven plaza A',
    params: {
      surface:
        'warm beige sandstone plaza cobbles, irregular small river stones, 12 to 16 stones across width, thin dark mortar, sunny dust',
    },
  },
  {
    id: 'tile_haven_plaza_b',
    profile: 'terrain_tile',
    label: 'Haven plaza B',
    params: {
      surface:
        'lighter cream sandstone plaza paving, tiny worn cobbles 12+ across, soft gold mortar, subtle moss flecks',
    },
  },
  {
    id: 'tile_haven_plaza_c',
    profile: 'terrain_tile',
    label: 'Haven plaza C',
    params: {
      surface:
        'tan imperial forum cobblestone, dense small stones 14 across, cool shadow tint, fine grit',
    },
  },
  {
    id: 'tile_haven_road_a',
    profile: 'terrain_tile',
    label: 'Haven road A',
    params: {
      surface:
        'dark grey imperial cobblestone street, small packed stones 12+ across, center wear groove, thin black mortar',
    },
  },
  {
    id: 'tile_haven_road_b',
    profile: 'terrain_tile',
    label: 'Haven road B',
    params: {
      surface:
        'brown-grey street cobbles smaller than a boot, dense irregular shapes 14 across, wheel-rut dust',
    },
  },
  {
    id: 'tile_haven_road_c',
    profile: 'terrain_tile',
    label: 'Haven road C',
    params: {
      surface:
        'slate street paving bricks and pebbles mix, fine scale 12+ units across, darker edges',
    },
  },
  {
    id: 'tile_haven_water',
    profile: 'terrain_tile',
    label: 'Haven water',
    params: {
      surface:
        'ONLY deep blue-teal harbor seawater from directly above, soft ripples and light caustics, cool cyan reflections, seamless tileable water surface, no stone, no cobble, no sand, no dirt, no grass, no grid',
    },
  },
  {
    id: 'tile_haven_wall',
    profile: 'terrain_tile',
    label: 'Haven wall',
    params: {
      surface:
        'dark grey city wall stone blocks top-down fill, many small masonry bricks across tile, rough mortar',
    },
  },
  {
    id: 'tile_haven_dock_a',
    profile: 'terrain_tile',
    label: 'Haven quay cobble A',
    params: {
      surface:
        'ONLY irregular rounded river cobbles from directly above, mixed pebble sizes 8 to 16 stones across, no repeating grid, no parquet, no rectangular floorboards, cool grey granite cobble, dark mortar, seamless tileable, no wood, no planks, no building, no water',
    },
  },
  {
    id: 'tile_haven_dock_b',
    profile: 'terrain_tile',
    label: 'Haven quay sett B',
    params: {
      surface:
        'ONLY large rectangular granite setts from directly above, 5 to 7 big blocks across, stretcher-bond street paving, long grey stones, wide charcoal joints, not tiny cobbles, no wood, no parquet, no planks, seamless tileable, no building, no water',
    },
  },
  {
    id: 'tile_haven_dock_c',
    profile: 'terrain_tile',
    label: 'Haven quay moss C',
    params: {
      surface:
        'ONLY wet dark basalt setts from directly above, bright green moss stuffed in every joint, 9 to 11 irregular stones across, high contrast moss vs black stone, no wood, no parquet, no yellow, seamless tileable, no building, no water',
    },
  },
  {
    id: 'tile_haven_dock_d',
    profile: 'terrain_tile',
    label: 'Haven quay pebble D',
    params: {
      surface:
        'ONLY fine packed pebble paving from directly above, 16 to 20 tiny stones across, dusty tan-grey grit, almost gravel, no large blocks, no wood, no parquet, no planks, seamless tileable, no building, no water',
    },
  },
  {
    id: 'tile_haven_dock_e',
    profile: 'terrain_tile',
    label: 'Haven quay repair E',
    params: {
      surface:
        'ONLY flat seamless ground texture of broken repaired quay paving seen from directly above, mix of cracked stone slabs and small wedge cobbles filling the whole square, salt-white rims, 6 to 10 irregular pieces, no 3D cube, no object, no pedestal, no wood, no parquet, no planks, no building, no water',
    },
  },
  {
    id: 'prop_dock_crates',
    profile: 'prop_sprite',
    label: 'Dock crate pile',
    params: {
      seed: '84101',
      prop_name:
        'ONLY a pile of six weathered wooden shipping crates with rope and iron bands, ground clutter, no building, no house, no roof, no walls, no door, no cottage, isolated cargo stack on black void, top-down RPG prop',
    },
  },
  {
    id: 'prop_dock_nets',
    profile: 'prop_sprite',
    label: 'Dock drying nets',
    params: {
      seed: '84102',
      prop_name:
        'ONLY wooden racks hung with fishing nets and cork floats, ground clutter, no building, no house, no roof, no walls, isolated dock nets on black void, top-down RPG prop',
    },
  },
  {
    id: 'prop_dock_barrels',
    profile: 'prop_sprite',
    label: 'Dock barrel pile',
    params: {
      seed: '84103',
      prop_name:
        'ONLY a tight cluster of five oak wine barrels on their sides and ends, iron hoops, ground clutter, no building, no house, no roof, no walls, isolated cargo barrels on black void, top-down RPG prop',
    },
  },
  {
    id: 'prop_dock_rope',
    profile: 'prop_sprite',
    label: 'Dock rope coils',
    params: {
      seed: '84104',
      prop_name:
        'ONLY three thick hemp rope coils and a coiled hawser, dock rope, ground clutter, no building, no house, no roof, isolated rope piles on black void, top-down RPG prop',
    },
  },
  {
    id: 'prop_dock_fishboxes',
    profile: 'prop_sprite',
    label: 'Dock fish boxes',
    params: {
      seed: '84105',
      prop_name:
        'ONLY stacked wooden fish boxes packed with ice and silver fish, open crates, ground clutter, no building, no house, no roof, isolated catch boxes on black void, top-down RPG prop',
    },
  },
  {
    id: 'tileset_adena_fields',
    profile: 'tileset',
    label: 'Tiles adena fields',
    params: { grass: 'golden wheat field sunny farmland', path: 'dirt farm road trail', water: 'irrigation ditch water', wall: 'wooden farm fence border' },
  },
  {
    id: 'tileset_silverwood',
    profile: 'tileset',
    label: 'Tiles silverwood',
    params: { grass: 'silver moonlit grass magical glow', path: 'root-covered elven path', water: 'moonlit stream silver water', wall: 'ancient silver birch trees' },
  },
  {
    id: 'tileset_ash_highlands',
    profile: 'tileset',
    label: 'Tiles ash highlands',
    params: { grass: 'volcanic ash grey ground cracks', path: 'scorched rocky trail', water: 'lava pool orange magma', wall: 'jagged black volcanic rocks' },
  },
  {
    id: 'tileset_suburban_park',
    profile: 'tileset',
    label: 'Tiles suburban park',
    params: {
      grass: 'overgrown city park lawn green grass',
      path: 'cracked asphalt park path grey',
      water: 'park pond reflective water',
      wall: 'iron park fence bushes',
    },
  },
  {
    id: 'tileset_abandoned_yard',
    profile: 'tileset',
    label: 'Tiles abandoned yard',
    params: {
      grass: 'packed construction dirt gravel',
      path: 'temporary construction road boards',
      water: 'muddy puddle brown water',
      wall: 'concrete barrier rebar fence',
    },
  },
  {
    id: 'tileset_intersection_district',
    profile: 'tileset',
    label: 'Tiles intersection district',
    params: {
      grass: 'dark city asphalt with neon reflections',
      path: 'bright neon crosswalk street',
      water: 'glowing purple anomaly rift pool',
      wall: 'glass building wall neon signs',
    },
  },
  {
    id: 'tileset_signal_block',
    profile: 'tileset',
    label: 'Tiles signal block',
    params: {
      grass: 'dark rooftop tar with antenna shadows',
      path: 'metal walkway grated city roof',
      water: 'glowing teal static anomaly pool',
      wall: 'concrete apartment wall radio dishes',
    },
  },
  {
    id: 'tileset_relay_spire',
    profile: 'tileset',
    label: 'Tiles relay spire',
    params: {
      grass: 'steel grated platform with cable shadows',
      path: 'narrow metal catwalk bolted plates',
      water: 'glowing cyan echo energy pool',
      wall: 'lattice radio tower steel beams',
    },
  },
  {
    id: 'tileset_static_core',
    profile: 'tileset',
    label: 'Tiles static core',
    params: {
      grass: 'dark industrial concrete with cable grooves',
      path: 'glowing teal circuit floor path',
      water: 'liquid static energy teal pool',
      wall: 'reinforced bunker wall sparking cables',
    },
  },
  {
    id: 'tileset_chaos_sector',
    profile: 'tileset',
    label: 'Tiles chaos sector',
    params: {
      grass: 'cracked warped earth magenta veins',
      path: 'broken floating stone path crimson cracks',
      water: 'liquid chaos magenta void pool',
      wall: 'twisted ruin wall floating debris',
    },
  },
  {
    id: 'tileset_fracture_ridge',
    profile: 'tileset',
    label: 'Tiles fracture ridge',
    params: {
      grass: 'jagged ridge stone with crimson fissures',
      path: 'narrow cliff path cracked slabs',
      water: 'deep rift void magenta glow',
      wall: 'sheer cliff face broken rock',
    },
  },
  {
    id: 'tileset_void_scar',
    profile: 'tileset',
    label: 'Tiles void scar',
    params: {
      grass: 'black scarred stone with crimson void veins',
      path: 'broken canyon walkway dark slabs',
      water: 'liquid void abyss magenta black pool',
      wall: 'torn reality cliff void cracks',
    },
  },
  {
    id: 'tileset_collapse_fringe',
    profile: 'tileset',
    label: 'Tiles collapse fringe',
    params: {
      grass: 'ashen crumbling earth dark crimson dust',
      path: 'fractured floating ruin path',
      water: 'entropy pool black red swirl',
      wall: 'collapsing ruin wall floating stone',
    },
  },
  {
    id: 'tileset_citadel_approach',
    profile: 'tileset',
    label: 'Tiles citadel approach',
    params: {
      grass: 'scorched siege ground dark ash',
      path: 'broken paved siege road crimson cracks',
      water: 'dark blood-tinted siege moat',
      wall: 'black citadel outer wall battlements',
    },
  },
  {
    id: 'tileset_singularity_citadel',
    profile: 'tileset',
    label: 'Tiles singularity citadel',
    params: {
      grass: 'black marble floor with crimson void veins',
      path: 'polished dark citadel corridor',
      water: 'liquid singularity crimson black pool',
      wall: 'obsidian citadel pillar wall runes',
    },
  },
  {
    id: 'tileset_gods_rift',
    profile: 'tileset',
    label: 'Tiles gods rift',
    params: {
      grass: 'cracked divine stone with golden veins',
      path: 'broken temple avenue gold inlay',
      water: 'liquid gold divine ichor pool',
      wall: 'ruined pantheon column wall',
    },
  },
  {
    id: 'tileset_pantheon_ascent',
    profile: 'tileset',
    label: 'Tiles pantheon ascent',
    params: {
      grass: 'weathered temple terrace stone gold dust',
      path: 'wide ascending pantheon stair path',
      water: 'sacred ichor reflecting columns',
      wall: 'broken idol pillar battlement',
    },
  },
  {
    id: 'tileset_godfall_throne',
    profile: 'tileset',
    label: 'Tiles godfall throne',
    params: {
      grass: 'polished divine marble with gold cracks',
      path: 'throne hall aisle gold inlay',
      water: 'molten sacred ichor throne pool',
      wall: 'shattered god throne pillar wall',
    },
  },

  // Пропсы для декора карт (top-down)
  {
    id: 'prop_tree_oak',
    profile: 'prop_sprite',
    label: 'Oak tree',
    params: {
      prop_name:
        'large healthy oak tree canopy from above, lush green foliage, thick trunk, top-down RPG prop',
    },
  },
  { id: 'prop_tree_silver', profile: 'prop_sprite', label: 'Silver tree', params: { prop_name: 'tall silver birch tree glowing pale leaves from above' } },
  { id: 'prop_rock_volcanic', profile: 'prop_sprite', label: 'Volcanic rock', params: { prop_name: 'dark volcanic boulder rock from above' } },
  {
    id: 'prop_inn',
    profile: 'prop_sprite',
    label: 'Town inn',
    params: {
      seed: '940201',
      prop_name:
        'COLOSSAL 5-story imperial inn-palace filling ENTIRE frame edge-to-edge, huge red terracotta roof mass, dozens of glowing windows, giant hanging tavern sign, monumental stone-timber bulk dominating canvas, civic landmark scale, FORBIDDEN small tavern hut shed cabin, front elevation orthographic, rectangular axis-aligned, not isometric',
    },
  },
  { id: 'prop_hut', profile: 'prop_sprite', label: 'Forest hut', params: { seed: '51459',
      prop_name:
        'small wooden forest hunter hut cabin from above, front facade facing camera straight-on, rectangular axis-aligned footprint, walls parallel to image edges, not isometric not diamond not 45-degree rotated' } },
  { id: 'prop_campfire', profile: 'prop_sprite', label: 'Campfire', params: { prop_name: 'campfire with logs and orange flames from above' } },
  { id: 'prop_signpost', profile: 'prop_sprite', label: 'Signpost', params: { prop_name: 'wooden road signpost with directional boards from above' } },
  { id: 'prop_shrine', profile: 'prop_sprite', label: 'Elven shrine', params: { prop_name: 'small elven stone shrine with blue glow from above' } },
  { id: 'prop_totem', profile: 'prop_sprite', label: 'Orc totem', params: { prop_name: 'orc tribal totem pole with skull from above' } },

  // Городские здания и декор (Empery Haven) — imperial fantasy top-down
  {
    id: 'prop_house_stone',
    profile: 'prop_sprite',
    label: 'Stone house',
    params: {
      seed: '938202',
      prop_name:
        'STONE CITIZEN SET matching, MASSIVE 4-story grey-brown ashlar terrace BLOCK SECTION filling frame, blank party walls LEFT RIGHT, twin chimneys, FORBIDDEN plastic timber beams wood plank, aged medieval rough ashlar stone texture, porous weathered masonry, mortar gaps, rough stone foundation, chipped cobblestone bottom, detailed slate or clay roof tiles, textured shingles, moss accents on roof edges, subtle grime and weathering, realistic material definition, perfect architectural symmetry, aligned windows, structured facade layout, front elevation orthographic, not isometric',
    },
  },
  {
    id: 'prop_house_timber',
    profile: 'prop_sprite',
    label: 'Timber house',
    params: {
      seed: '938302',
      prop_name:
        'MERCHANT HALF-TIMBERED SET matching, MASSIVE 4-story classic living fachwerk terrace BLOCK SECTION filling frame, blank party walls LEFT RIGHT, cream panels dark oak beams terracotta roof, FORBIDDEN plastic vinyl beams bare log grey ashlar, aged medieval stucco texture, weathered half-timbered wooden beams with visible grain and cracks, rough stone foundation, chipped cobblestone bottom, detailed clay roof tiles, textured terracotta shingles, moss accents on roof edges, subtle grime and weathering, realistic material definition, perfect architectural symmetry, aligned windows, structured facade layout, front elevation orthographic, not isometric',
    },
  },
  {
    id: 'prop_shop_front',
    profile: 'prop_sprite',
    label: 'Shop building',
    params: {
      seed: '44501',
      prop_name:
        'merchant shop building facade facing camera, striped awning, hanging trade sign, display crates, front elevation orthographic, rectangular footprint, not isometric',
    },
  },
  {
    id: 'prop_blacksmith',
    profile: 'prop_sprite',
    label: 'Blacksmith',
    params: {
      seed: '31441',
      prop_name:
        'colossal multi-story imperial blacksmith forge complex, massive stone workshop, multiple smoking chimneys, glowing forge mouths, anvil yard, weapon racks, top-down RPG landmark, front facade facing camera straight-on, rectangular axis-aligned footprint, walls parallel to image edges, not isometric not diamond not 45-degree rotated',
    },
  },
  {
    id: 'prop_warehouse',
    profile: 'prop_sprite',
    label: 'Warehouse',
    params: {
      seed: '959808',
      prop_name:
        'COLOSSAL 5-story harbor warehouse palace filling ENTIRE frame, weathered timber-stone megastructure, giant loading doors, crate stacks, monumental dock landmark bulk, FORBIDDEN small shed barn hut, front elevation orthographic, rectangular axis-aligned, not isometric',
    },
  },
  {
    id: 'prop_guard_tower',
    profile: 'prop_sprite',
    label: 'Guard tower',
    params: {
      seed: '14240',
      prop_name:
        'square imperial stone watchtower, crenellations, crimson-gold banner, torch sconces, top-down RPG prop, front facade facing camera straight-on, rectangular axis-aligned footprint, walls parallel to image edges, not isometric not diamond not 45-degree rotated',
    },
  },
  {
    id: 'prop_city_gate',
    profile: 'prop_sprite',
    label: 'City gate',
    params: {
      prop_name:
        'COLOSSAL imperial city gate fortress filling frame width, twin asymmetric bastion towers, massive arched portal, layered machicolations, heavy oak-iron doors CLOSED sealed shut, red-gold heraldic crest, worn limestone blocks with readable masonry seams, cinematic top-down RPG landmark, strict orthographic front elevation, axis-aligned rectangular footprint, no isometric tilt',
    },
  },
  {
    id: 'prop_city_gate_open',
    profile: 'prop_sprite',
    label: 'City gate open',
    params: {
      prop_name:
        'COLOSSAL imperial city gate fortress filling frame width, twin bastion towers, massive arched portal with oak-iron doors OPEN swung inward, walkable dark passageway through center, red-gold heraldic crest, worn limestone, cinematic top-down RPG landmark, orthographic front elevation, axis-aligned rectangular footprint, no isometric tilt',
    },
  },
  {
    id: 'prop_chapel',
    profile: 'prop_sprite',
    label: 'Chapel',
    params: {
      seed: '66212',
      prop_name:
        'small stone chapel front elevation facing camera, rectangular nave, central arched door with stained glass, short centered steeple, base edges horizontal parallel to frame, orthographic, NOT isometric NOT diamond NOT three-quarter',
    },
  },
  {
    id: 'prop_barracks',
    profile: 'prop_sprite',
    label: 'Barracks',
    params: {
      seed: '955101',
      prop_name:
        'COLOSSAL fortress barracks complex filling ENTIRE frame, long multi-wing stone keep, battlements, crimson-gold banners, spear racks, monumental garrison landmark, FORBIDDEN small hut shed cabin, front elevation orthographic, rectangular axis-aligned, not isometric',
    },
  },
  {
    id: 'prop_stable',
    profile: 'prop_sprite',
    label: 'Stable',
    params: {
      seed: '17904',
      prop_name:
        'colossal imperial horse stable complex, long wooden stall wings, hay loft roof, hitching yard, brown tiled roof, top-down RPG landmark, STRICT front elevation, camera looking at the front wall, building NOT rotated, orthographic slightly elevated, rectangular plan aligned to X/Y axes, door centered on front, left and right walls foreshortened symmetrically, FORBIDDEN isometric axonometric diamond base 45 degree turn three-quarter corner view',
    },
  },
  {
    id: 'prop_statue_imperial',
    profile: 'prop_sprite',
    label: 'Imperial statue',
    params: {
      prop_name:
        'bronze emperor statue on ornate marble pedestal, plaza monument, gold accents, top-down RPG prop',
    },
  },
  {
    id: 'prop_fountain',
    profile: 'prop_sprite',
    label: 'Town fountain',
    params: {
      prop_name:
        'grand imperial plaza fountain, carved stone lions, blue water basin, gold trim, top-down RPG prop',
    },
  },
  {
    id: 'prop_well',
    profile: 'prop_sprite',
    label: 'Town well',
    params: {
      prop_name:
        'circular carved stone well, wooden shingle roof, rope and bucket, top-down RPG prop',
    },
  },
  {
    id: 'prop_crate_stack',
    profile: 'prop_sprite',
    label: 'Crate stack',
    params: {
      prop_name: 'neat stack of wooden trade crates and grain sacks, ropes, top-down RPG prop',
    },
  },
  {
    id: 'prop_barrels',
    profile: 'prop_sprite',
    label: 'Barrels',
    params: {
      prop_name: 'cluster of oak wine barrels and casks with iron bands, top-down RPG prop',
    },
  },
  {
    id: 'prop_merchant_cart',
    profile: 'prop_sprite',
    label: 'Merchant cart',
    params: {
      prop_name:
        'wooden merchant cart loaded with colorful goods and fabrics, spoked wheels, top-down RPG prop',
    },
  },
  {
    id: 'prop_bench',
    profile: 'prop_sprite',
    label: 'Bench',
    params: {
      prop_name: 'ornate stone and wood plaza bench, imperial style, top-down RPG prop',
    },
  },
  {
    id: 'prop_planter',
    profile: 'prop_sprite',
    label: 'Flower planter',
    params: {
      prop_name:
        'carved stone flower planter with bright imperial garden flowers, top-down RPG prop',
    },
  },
  {
    id: 'prop_bush_garden',
    profile: 'prop_sprite',
    label: 'Garden bush',
    params: {
      prop_name: 'neat round ornamental evergreen bush, garden greenery, top-down RPG prop',
    },
  },
  {
    id: 'prop_pier',
    profile: 'prop_sprite',
    label: 'Pier',
    params: {
      prop_name: 'short wooden harbor pier dock with posts and planks over water, top-down RPG prop',
    },
  },
  {
    id: 'prop_pier_long',
    profile: 'prop_sprite',
    label: 'Long pier',
    params: {
      prop_name:
        'long wooden harbor quay pier stretching into water, mooring posts, ropes, top-down RPG prop',
    },
  },
  {
    id: 'prop_harbor_crane',
    profile: 'prop_sprite',
    label: 'Harbor crane',
    params: {
      prop_name:
        'tall wooden harbor cargo crane on quay, rope and hook, stone base, top-down RPG prop',
    },
  },
  ...havenShipMediaCatalog(),
  {
    id: 'prop_banner_pole',
    profile: 'prop_sprite',
    label: 'Banner pole',
    params: {
      prop_name:
        'tall flagpole with flowing imperial crimson and gold banner, top-down RPG prop',
    },
  },
  {
    id: 'prop_market_canopy',
    profile: 'prop_sprite',
    label: 'Market canopy',
    params: {
      prop_name:
        'large colorful market canopy tent with hanging fabrics and lanterns, top-down RPG prop',
    },
  },
  {
    id: 'prop_market_stall',
    profile: 'prop_sprite',
    label: 'Market stall',
    params: {
      prop_name:
        'wooden market stall with striped crimson-gold awning and crates of produce, top-down RPG prop',
    },
  },
  {
    id: 'prop_street_lamp',
    profile: 'prop_sprite',
    label: 'Street lamp',
    params: {
      prop_name:
        'ornate wrought-iron imperial street lamp with warm golden lantern glow, top-down RPG prop',
    },
  },

  // Крупные городские якоря (Empery Haven)
  {
    id: 'prop_cathedral',
    profile: 'prop_sprite',
    label: 'Cathedral',
    params: {
      seed: '979859',
      prop_name:
        'TITANIC high-gothic imperial cathedral colossus dominating entire frame, colossal nave volume, blazing rose window, giant copper dome with patina, twin ornate bell towers, flying buttress rhythm, red-gold banners, premium carved stone detail, dramatic but clean silhouette for gameplay readability, strict orthographic front elevation, rectangular axis-aligned footprint, no isometric rotation',
    },
  },
  {
    id: 'prop_governor_palace',
    profile: 'prop_sprite',
    label: 'Governor palace',
    params: {
      seed: '90117',
      prop_name:
        'monumental imperial governor palace facade, very wide ceremonial frontage, grand colonnade, layered terraces, marble stairs, gilded emblems, crimson state banners, rich roof geometry and high-end stone trim, elite city-center landmark, strict orthographic front elevation, rectangular footprint parallel to frame, no isometric tilt',
    },
  },
  {
    id: 'prop_guildhall',
    profile: 'prop_sprite',
    label: 'Merchant guildhall',
    params: {
      seed: '44821',
      prop_name:
        'massive merchant guildhall with deep facade articulation, stepped gables, heavy buttressed corners, carved trade sigils, broad arched entries, premium medieval stone-and-oak craft detail, city anchor building, strict orthographic front elevation, rectangular footprint, no isometric tilt',
    },
  },
  {
    id: 'prop_trade_hall',
    profile: 'prop_sprite',
    label: 'Covered trade hall',
    params: {
      seed: '944135',
      prop_name:
        'COLOSSAL covered trade hall megastructure spanning full frame, multi-story arcaded frontage, colossal timber-truss roof, layered market bays, ornate civic banners, carved stone piers, premium high-density facade detail while preserving clean gameplay silhouette, strict orthographic front elevation, rectangular axis-aligned footprint, no isometric tilt',
    },
  },
  {
    id: 'prop_granary',
    profile: 'prop_sprite',
    label: 'Granary',
    params: {
      prop_name:
        'tall bulky stone and timber granary warehouse, steep roof, loading doors, grain sacks, top-down RPG prop',
    },
  },
  {
    id: 'prop_clock_tower',
    profile: 'prop_sprite',
    label: 'Clock tower',
    params: {
      prop_name:
        'towering imperial clock tower landmark with oversized illuminated clock faces, intricate bell chamber arches, copper spire, secondary side annex mass, weathered ashlar masonry and gold accents, premium top-down RPG civic monument, strict orthographic front elevation',
    },
  },
  {
    id: 'prop_colonnade',
    profile: 'prop_sprite',
    label: 'Colonnade',
    params: {
      prop_name:
        'short marble colonnade arcade segment with tiled roof, imperial columns, top-down RPG architecture prop',
    },
  },
  {
    id: 'prop_forum_arch',
    profile: 'prop_sprite',
    label: 'Triumph arch',
    params: {
      prop_name:
        'ornate imperial triumphal arch, carved reliefs, gold eagle crest, stone, top-down RPG plaza prop',
    },
  },
  {
    id: 'prop_keep_wing',
    profile: 'prop_sprite',
    label: 'Keep wing',
    params: {
      seed: '13524',
      prop_name:
        'fortress-grade imperial keep wing with heavy battered walls, tiered battlements, murder-hole gallery, iron reinforcement bands, banners and defensive parapets, massive military architecture with premium detail, strict front facade orthographic, rectangular axis-aligned footprint, no isometric angle',
    },
  },
  {
    id: 'prop_lighthouse',
    profile: 'prop_sprite',
    label: 'Harbor lighthouse',
    params: {
      prop_name:
        'grand harbor lighthouse complex with very tall cylindrical tower, robust base building, glowing lantern chamber, wraparound balcony rings, weathered sea-stone texture and brass fittings, heroic coastal landmark quality, top-down RPG orthographic readability',
    },
  },
  {
    id: 'prop_obelisk',
    profile: 'prop_sprite',
    label: 'Obelisk',
    params: {
      prop_name:
        'tall imperial stone obelisk monument with gold tip and carved runes, plaza prop, top-down RPG',
    },
  },
  {
    id: 'prop_amphora_stack',
    profile: 'prop_sprite',
    label: 'Amphora stack',
    params: {
      prop_name:
        'large stack of clay amphorae and oil jars on wooden pallets, harbor cargo, top-down RPG prop',
    },
  },
  {
    id: 'prop_cistern',
    profile: 'prop_sprite',
    label: 'Cistern',
    params: {
      prop_name:
        'large round stone water cistern with iron grate and steps, city utility, top-down RPG prop',
    },
  },
  {
    id: 'prop_statue_lion',
    profile: 'prop_sprite',
    label: 'Lion statue',
    params: {
      prop_name:
        'imperial stone lion statue on pedestal, guardian monument, gold accents, top-down RPG prop',
    },
  },
  {
    id: 'prop_weapon_rack',
    profile: 'prop_sprite',
    label: 'Weapon rack',
    params: {
      prop_name:
        'wooden weapon rack with spears shields and swords, barracks yard prop, top-down RPG',
    },
  },
  {
    id: 'prop_training_dummy',
    profile: 'prop_sprite',
    label: 'Training dummy',
    params: {
      prop_name:
        'straw training dummy on wooden post with shield, barracks drill yard, top-down RPG prop',
    },
  },
  {
    id: 'prop_rose_arch',
    profile: 'prop_sprite',
    label: 'Rose arch',
    params: {
      prop_name:
        'stone garden arch covered in red roses and ivy, cathedral garden, top-down RPG prop',
    },
  },
  {
    id: 'prop_customs_house',
    profile: 'prop_sprite',
    label: 'Customs house',
    params: {
      seed: '47661',
      prop_name:
        'harbor customs house office, stone and timber, scales sign, ledger porch, bulky top-down RPG building, front facade facing camera straight-on, rectangular axis-aligned footprint, walls parallel to image edges, not isometric not diamond not 45-degree rotated',
    },
  },
  {
    id: 'prop_fish_stall',
    profile: 'prop_sprite',
    label: 'Fish stall',
    params: {
      prop_name:
        'harbor fishmonger stall with ice trays of fish, striped awning, top-down RPG prop',
    },
  },
  {
    id: 'prop_tavern_sign',
    profile: 'prop_sprite',
    label: 'Tavern sign',
    params: {
      prop_name:
        'ornate hanging tavern sign board with golden tankard emblem on iron post, top-down RPG prop',
    },
  },
  {
    id: 'prop_quay_bollard',
    profile: 'prop_sprite',
    label: 'Quay bollard',
    params: {
      prop_name: 'heavy iron mooring bollard with rope coils on stone quay, top-down RPG prop',
    },
  },
  {
    id: 'prop_garden_fountain',
    profile: 'prop_sprite',
    label: 'Garden fountain',
    params: {
      prop_name:
        'small ornate garden fountain with tiered basin and flowers, palace courtyard, top-down RPG prop',
    },
  },
  {
    id: 'prop_anvil',
    profile: 'prop_sprite',
    label: 'Anvil',
    params: {
      prop_name: 'heavy blacksmith anvil on wooden stump with hammer, forge yard, top-down RPG prop',
    },
  },
  {
    id: 'prop_coal_pile',
    profile: 'prop_sprite',
    label: 'Coal pile',
    params: {
      prop_name: 'heap of black coal and charcoal with shovel, smith yard, top-down RPG prop',
    },
  },
  {
    id: 'prop_shield_stack',
    profile: 'prop_sprite',
    label: 'Shield stack',
    params: {
      prop_name: 'stack of round imperial shields with spears leaning, barracks, top-down RPG prop',
    },
  },
  {
    id: 'prop_ballista',
    profile: 'prop_sprite',
    label: 'Ballista',
    params: {
      prop_name:
        'wooden siege ballista on wheeled frame, barracks arsenal, top-down RPG prop, no crew',
    },
  },
  {
    id: 'prop_spice_stall',
    profile: 'prop_sprite',
    label: 'Spice stall',
    params: {
      prop_name:
        'market spice stall with colorful jars sacks and hanging herbs, striped awning, top-down RPG prop',
    },
  },
  {
    id: 'prop_flower_cart',
    profile: 'prop_sprite',
    label: 'Flower cart',
    params: {
      prop_name: 'wooden flower cart overflowing with bright blooms, market plaza, top-down RPG prop',
    },
  },
  {
    id: 'prop_outdoor_table',
    profile: 'prop_sprite',
    label: 'Outdoor table',
    params: {
      prop_name: 'wooden tavern outdoor table with stools and mugs, inn yard, top-down RPG prop',
    },
  },
  {
    id: 'prop_keg_rack',
    profile: 'prop_sprite',
    label: 'Keg rack',
    params: {
      prop_name: 'wooden rack of large beer kegs and wine casks, tavern cellar yard, top-down RPG prop',
    },
  },
  {
    id: 'prop_drying_nets',
    profile: 'prop_sprite',
    label: 'Drying nets',
    params: {
      prop_name: 'fishing nets hung on wooden frames to dry, harbor quay, top-down RPG prop',
    },
  },
  {
    id: 'prop_lobster_pots',
    profile: 'prop_sprite',
    label: 'Lobster pots',
    params: {
      prop_name: 'stack of woven lobster pots and crab cages, harbor, top-down RPG prop',
    },
  },
  {
    id: 'prop_sundial',
    profile: 'prop_sprite',
    label: 'Sundial',
    params: {
      prop_name: 'ornate stone plaza sundial on pedestal, imperial plaza, top-down RPG prop',
    },
  },
  {
    id: 'prop_candle_stand',
    profile: 'prop_sprite',
    label: 'Candle stand',
    params: {
      prop_name:
        'tall iron candle stand with warm glowing votive candles, cathedral courtyard, top-down RPG prop',
    },
  },
  {
    id: 'prop_hitching_post',
    profile: 'prop_sprite',
    label: 'Hitching post',
    params: {
      prop_name: 'wooden hitching post with iron rings and rope, stable yard, top-down RPG prop',
    },
  },
  {
    id: 'prop_clothesline',
    profile: 'prop_sprite',
    label: 'Clothesline',
    params: {
      prop_name:
        'clothesline with hanging laundry between wooden posts, residential alley, top-down RPG prop',
    },
  },
  {
    id: 'prop_chicken_coop',
    profile: 'prop_sprite',
    label: 'Chicken coop',
    params: {
      prop_name: 'small wooden chicken coop with nest boxes, backyard, top-down RPG prop, no animals',
    },
  },
  {
    id: 'prop_library',
    profile: 'prop_sprite',
    label: 'Library',
    params: {
      seed: '991338',
      prop_name:
        'COLOSSAL imperial public library palace filling ENTIRE frame, tall window ranks, stone-timber megastructure, book crest, monumental civic bulk, FORBIDDEN small house hut shed, front elevation orthographic, rectangular axis-aligned, not isometric',
    },
  },
  {
    id: 'prop_bathhouse',
    profile: 'prop_sprite',
    label: 'Bathhouse',
    params: {
      seed: '943947',
      prop_name:
        'COLOSSAL imperial bathhouse complex filling ENTIRE frame, multiple giant stone domes, steam vents, multi-wing civic megastructure, FORBIDDEN small hut shed cabin, front elevation orthographic, rectangular axis-aligned, not isometric',
    },
  },
  {
    id: 'prop_jeweler',
    profile: 'prop_sprite',
    label: 'Jeweler shop',
    params: {
      prop_name:
        'compact jeweler shop with gold hanging sign and display windows, top-down RPG prop',
    },
  },
  {
    id: 'prop_butcher',
    profile: 'prop_sprite',
    label: 'Butcher shop',
    params: {
      seed: '937041',
      prop_name:
        'COLOSSAL multi-story butcher guild palace filling ENTIRE frame, grand striped awning, hanging meats, stone-timber megastructure chimney smoke, monumental market landmark, FORBIDDEN small shop hut shed, front elevation orthographic, rectangular axis-aligned, not isometric',
    },
  },
  {
    id: 'prop_guard_post',
    profile: 'prop_sprite',
    label: 'Guard post',
    params: {
      prop_name:
        'small wooden and stone guard booth with spear rack, city gate checkpoint, top-down RPG prop',
    },
  },
  {
    id: 'prop_captain_hut',
    profile: 'prop_sprite',
    label: 'Harbor master hut',
    params: {
      seed: '81228',
      prop_name:
        'harbor master wooden hut, spyglass on porch, front door facing camera, front elevation orthographic, rectangular footprint, not isometric',
    },
  },
  {
    id: 'prop_sail_rack',
    profile: 'prop_sprite',
    label: 'Sail rack',
    params: {
      prop_name: 'wooden rack with folded and hanging ship sails, harbor, top-down RPG prop',
    },
  },
  {
    id: 'prop_firewood',
    profile: 'prop_sprite',
    label: 'Firewood stack',
    params: {
      prop_name: 'neat stack of chopped firewood logs, backyard utility, top-down RPG prop',
    },
  },
  {
    id: 'prop_rain_barrel',
    profile: 'prop_sprite',
    label: 'Rain barrel',
    params: {
      prop_name: 'large wooden rain barrel collecting water under spout, alley, top-down RPG prop',
    },
  },
  {
    id: 'prop_herb_garden',
    profile: 'prop_sprite',
    label: 'Herb garden',
    params: {
      prop_name:
        'raised herb garden beds with green plants and labels, apothecary yard, top-down RPG prop',
    },
  },
  {
    id: 'prop_memorial_stone',
    profile: 'prop_sprite',
    label: 'Memorial stone',
    params: {
      prop_name:
        'carved memorial stone plaque on pedestal with wreath, civic plaza, top-down RPG prop',
    },
  },
  {
    id: 'prop_covered_wagon',
    profile: 'prop_sprite',
    label: 'Covered wagon',
    params: {
      prop_name:
        'large covered merchant wagon with canvas roof and spoked wheels, trade road, top-down RPG prop',
    },
  },
  {
    id: 'prop_windmill',
    profile: 'prop_sprite',
    label: 'Windmill',
    params: {
      seed: '44011',
      prop_name:
        'timber windmill millhouse facing camera, round tower front elevation, bare axle hub only NO sails NO blades, door centered, rectangular base parallel to frame, orthographic slightly elevated, NOT isometric NOT diamond NOT 45 degree',
    },
  },
  {
    id: 'prop_brewery',
    profile: 'prop_sprite',
    label: 'Brewery',
    params: {
      seed: '955102',
      prop_name:
        'COLOSSAL imperial brewery megastructure filling ENTIRE frame, timber-stone factory wings, giant copper kettle chimneys, barrel stacks, monumental industrial landmark, FORBIDDEN small hut shed cabin, front elevation orthographic, rectangular axis-aligned, not isometric',
    },
  },
  {
    id: 'prop_healer_hall',
    profile: 'prop_sprite',
    label: 'Healer hall',
    params: {
      seed: '924737',
      prop_name:
        'COLOSSAL civic healer hospice palace filling ENTIRE frame, white banners, multi-wing stone-timber complex, herb terraces, monumental medical landmark, FORBIDDEN small clinic hut shed, front elevation orthographic, rectangular axis-aligned, not isometric',
    },
  },
  {
    id: 'prop_jail',
    profile: 'prop_sprite',
    label: 'City jail',
    params: {
      prop_name:
        'small stone city jail with barred windows iron door and watch lamp, garrison compound, top-down RPG landmark',
    },
  },
  {
    id: 'prop_pottery_kiln',
    profile: 'prop_sprite',
    label: 'Pottery kiln',
    params: {
      prop_name:
        'pottery workshop with brick kiln chimney and clay pots on shelves, market craft stall, top-down RPG prop',
    },
  },
  {
    id: 'prop_weaver_loom',
    profile: 'prop_sprite',
    label: 'Weaver loom',
    params: {
      prop_name:
        'open weaver stall with wooden loom and colorful dyed cloth bolts hanging, market craft, top-down RPG prop',
    },
  },
  {
    id: 'prop_flour_sacks',
    profile: 'prop_sprite',
    label: 'Flour sacks',
    params: {
      prop_name: 'stack of bulging flour sacks tied with rope near mill, dusty, top-down RPG prop',
    },
  },
  {
    id: 'prop_wall_brazier',
    profile: 'prop_sprite',
    label: 'Wall brazier',
    params: {
      prop_name:
        'iron wall-mounted brazier with orange coals and smoke, fortification torch, top-down RPG prop',
    },
  },
  {
    id: 'prop_orchard_tree',
    profile: 'prop_sprite',
    label: 'Orchard tree',
    params: {
      prop_name:
        'fruit orchard tree with ripe apples on a short trunk, palace garden, top-down RPG prop',
    },
  },
  {
    id: 'prop_steam_vent',
    profile: 'prop_sprite',
    label: 'Steam vent',
    params: {
      prop_name:
        'stone bathhouse steam vent grate with rising white vapor plume, wet stone base, top-down RPG prop',
    },
  },
  {
    id: 'prop_book_cart',
    profile: 'prop_sprite',
    label: 'Book cart',
    params: {
      prop_name:
        'wooden book cart loaded with stacked tomes and scrolls, library yard, top-down RPG prop',
    },
  },
  {
    id: 'prop_grape_arbor',
    profile: 'prop_sprite',
    label: 'Grape arbor',
    params: {
      prop_name:
        'wooden grape vine arbor with hanging purple clusters, tavern courtyard, top-down RPG prop',
    },
  },
  {
    id: 'prop_stocks',
    profile: 'prop_sprite',
    label: 'Pillory stocks',
    params: {
      prop_name:
        'wooden public pillory stocks on a small platform, garrison square, top-down RPG prop',
    },
  },
  {
    id: 'prop_gazebo',
    profile: 'prop_sprite',
    label: 'Garden gazebo',
    params: {
      seed: '24239',
      prop_name:
        'elegant open wooden gazebo with tiled roof and flower boxes, city park pavilion, top-down RPG landmark, front facade facing camera straight-on, rectangular axis-aligned footprint, walls parallel to image edges, not isometric not diamond not 45-degree rotated',
    },
  },
  {
    id: 'prop_open_stage',
    profile: 'prop_sprite',
    label: 'Open stage',
    params: {
      prop_name:
        'colossal majestic imperial open-air amphitheatre stage, wide wooden and marble platform, towering red velvet curtain backdrop with gold tassels, ornate columns, footlight row, grand civic theatre landmark, top-down RPG prop',
    },
  },
  {
    id: 'prop_moneylender',
    profile: 'prop_sprite',
    label: 'Moneylender office',
    params: {
      prop_name:
        'compact stone moneylender bank office with iron-barred window and coin sign, market street, top-down RPG prop',
    },
  },
  {
    id: 'prop_tailor',
    profile: 'prop_sprite',
    label: 'Tailor shop',
    params: {
      prop_name:
        'tailor shop with hanging fabrics and measuring sign, striped awning, market craft, top-down RPG prop',
    },
  },
  {
    id: 'prop_ship_chandler',
    profile: 'prop_sprite',
    label: 'Ship chandler',
    params: {
      prop_name:
        'harbor ship chandler warehouse with rope coils lanterns and tar barrels on porch, quay, top-down RPG landmark',
    },
  },
  {
    id: 'prop_rope_coil',
    profile: 'prop_sprite',
    label: 'Rope coils',
    params: {
      prop_name: 'large coils of thick ship rope stacked on quay, harbor, top-down RPG prop',
    },
  },
  {
    id: 'prop_farmhouse',
    profile: 'prop_sprite',
    label: 'Farmhouse',
    params: {
      prop_name:
        'rural timber farmhouse with thatched or shingle roof and small porch, outside city walls, top-down RPG landmark',
    },
  },
  {
    id: 'prop_haystack',
    profile: 'prop_sprite',
    label: 'Haystack',
    params: {
      prop_name: 'tall round haystack in a farm field, golden straw, top-down RPG prop',
    },
  },
  {
    id: 'prop_scarecrow',
    profile: 'prop_sprite',
    label: 'Scarecrow',
    params: {
      prop_name: 'scarecrow on a pole with ragged clothes and hat in wheat field, top-down RPG prop',
    },
  },
  {
    id: 'prop_wheat_sheaf',
    profile: 'prop_sprite',
    label: 'Wheat sheaves',
    params: {
      prop_name: 'bundle of harvested wheat sheaves leaned together, farm yard, top-down RPG prop',
    },
  },
  {
    id: 'prop_carriage',
    profile: 'prop_sprite',
    label: 'Noble carriage',
    params: {
      prop_name:
        'ornate noble horse carriage with gold trim parked near palace, top-down RPG prop, no horses',
    },
  },
  {
    id: 'prop_produce_cart',
    profile: 'prop_sprite',
    label: 'Produce cart',
    params: {
      prop_name:
        'wooden cart piled with vegetables fruits and cabbages, market produce, top-down RPG prop',
    },
  },
  {
    id: 'prop_dock_tavern',
    profile: 'prop_sprite',
    label: 'Dock tavern',
    params: {
      seed: '89819',
      prop_name:
        'rough harbor dockside tavern with crooked timber and beer kegs on porch, quay, top-down RPG landmark, front facade facing camera straight-on, rectangular axis-aligned footprint, walls parallel to image edges, not isometric not diamond not 45-degree rotated',
    },
  },
  {
    id: 'prop_watch_house',
    profile: 'prop_sprite',
    label: 'Watch house',
    params: {
      prop_name:
        'small stone and timber city watch house with bell and spear rack by east gate, top-down RPG landmark',
    },
  },
  {
    id: 'prop_carpenter',
    profile: 'prop_sprite',
    label: 'Carpenter shop',
    params: {
      prop_name:
        'carpenter workshop with timber stacks sawhorse and wood shavings, craft street, top-down RPG prop',
    },
  },
  {
    id: 'prop_mason_shed',
    profile: 'prop_sprite',
    label: 'Mason shed',
    params: {
      seed: '53169',
      prop_name:
        'stonemason shed with cut blocks chisels and dust, construction yard, top-down RPG prop, front facade facing camera straight-on, rectangular axis-aligned footprint, walls parallel to image edges, not isometric not diamond not 45-degree rotated',
    },
  },
  {
    id: 'prop_street_shrine',
    profile: 'prop_sprite',
    label: 'Street shrine',
    params: {
      prop_name:
        'small roadside stone shrine with candles and flower offerings, civic street, top-down RPG prop',
    },
  },
  {
    id: 'prop_aqueduct_arch',
    profile: 'prop_sprite',
    label: 'Aqueduct arch',
    params: {
      prop_name:
        'single stone aqueduct arch remnant with water channel on top, imperial ruin landmark, top-down RPG prop',
    },
  },
  {
    id: 'prop_fishmonger',
    profile: 'prop_sprite',
    label: 'Fishmonger shop',
    params: {
      seed: '953057',
      prop_name:
        'COLOSSAL harbor fishmonger hall filling ENTIRE frame, iced trays under giant awning, hanging catch, stone-timber dock megastructure, monumental port landmark, FORBIDDEN small stall shed hut, front elevation orthographic, rectangular axis-aligned, not isometric',
    },
  },
  {
    id: 'prop_garden_pergola',
    profile: 'prop_sprite',
    label: 'Garden pergola',
    params: {
      prop_name:
        'wooden garden pergola with climbing roses and bench shade, noble yard, top-down RPG prop',
    },
  },
  {
    id: 'prop_beehive',
    profile: 'prop_sprite',
    label: 'Beehive',
    params: {
      prop_name: 'wooden skep beehive in a garden corner, top-down RPG prop, no bees swarm',
    },
  },
  {
    id: 'prop_water_pump',
    profile: 'prop_sprite',
    label: 'Water pump',
    params: {
      prop_name: 'cast iron hand water pump over a stone basin, residential street, top-down RPG prop',
    },
  },
  {
    id: 'prop_laundry_tub',
    profile: 'prop_sprite',
    label: 'Laundry tubs',
    params: {
      prop_name: 'wooden laundry wash tubs with scrub board and hanging wet cloth, alley, top-down RPG prop',
    },
  },
  {
    id: 'prop_weigh_house',
    profile: 'prop_sprite',
    label: 'Weigh house',
    params: {
      seed: '12901',
      prop_name:
        'market weigh house with large balance scales under a roof, trade inspection, top-down RPG landmark, front facade facing camera straight-on, rectangular axis-aligned footprint, walls parallel to image edges, not isometric not diamond not 45-degree rotated',
    },
  },
  {
    id: 'prop_leatherworker',
    profile: 'prop_sprite',
    label: 'Leatherworker',
    params: {
      seed: '84647',
      prop_name:
        'leatherworker workshop with hanging hides and workbench, craft street near stables, top-down RPG prop, front facade facing camera straight-on, rectangular axis-aligned footprint, walls parallel to image edges, not isometric not diamond not 45-degree rotated',
    },
  },
  {
    id: 'prop_scriptorium',
    profile: 'prop_sprite',
    label: 'Scriptorium',
    params: {
      seed: '45464',
      prop_name:
        'imperial scriptorium annex with desk lamps and scroll shelves, next to library, top-down RPG landmark, front facade facing camera straight-on, rectangular axis-aligned footprint, walls parallel to image edges, not isometric not diamond not 45-degree rotated',
    },
  },
  {
    id: 'prop_town_milestone',
    profile: 'prop_sprite',
    label: 'Town milestone',
    params: {
      prop_name: 'stone road milestone pillar with carved distances, roadside, top-down RPG prop',
    },
  },
  {
    id: 'prop_public_oven',
    profile: 'prop_sprite',
    label: 'Public oven',
    params: {
      prop_name:
        'communal brick bread oven with wood pile and warm glow, market bakery yard, top-down RPG prop',
    },
  },
  {
    id: 'prop_pigeon_coop',
    profile: 'prop_sprite',
    label: 'Pigeon coop',
    params: {
      prop_name:
        'tall wooden pigeon loft coop for messenger birds, garrison yard, top-down RPG prop',
    },
  },
  {
    id: 'prop_catapult',
    profile: 'prop_sprite',
    label: 'Display catapult',
    params: {
      prop_name:
        'wooden siege catapult on display in garrison yard, imperial war engine, top-down RPG prop',
    },
  },
  {
    id: 'prop_herb_drying_rack',
    profile: 'prop_sprite',
    label: 'Herb drying rack',
    params: {
      prop_name:
        'wooden rack with hanging dried herbs and flowers, healer yard, top-down RPG prop',
    },
  },
  {
    id: 'prop_palace_kitchen',
    profile: 'prop_sprite',
    label: 'Palace kitchen',
    params: {
      prop_name:
        'palace service kitchen wing with chimney and pantry crates, noble compound, top-down RPG landmark',
    },
  },
  {
    id: 'prop_gate_shrine',
    profile: 'prop_sprite',
    label: 'Gate shrine',
    params: {
      prop_name:
        'small traveler shrine with candles at city gate approach, stone niche, top-down RPG prop',
    },
  },
  {
    id: 'prop_garden_plot',
    profile: 'prop_sprite',
    label: 'Garden plot',
    params: {
      prop_name:
        'rectangular community vegetable garden plot with soil rows and young greens, top-down RPG prop',
    },
  },
  {
    id: 'prop_watering_can',
    profile: 'prop_sprite',
    label: 'Watering can',
    params: {
      prop_name:
        'metal watering can beside garden beds, spout and handle, top-down RPG prop',
    },
  },
  {
    id: 'prop_secret_arch',
    profile: 'prop_sprite',
    label: 'Secret alley arch',
    params: {
      prop_name:
        'narrow shadowy stone archway into a secret alley, worn bricks, top-down RPG prop',
    },
  },
  {
    id: 'prop_hidden_bench',
    profile: 'prop_sprite',
    label: 'Hidden alley bench',
    params: {
      prop_name:
        'weathered wooden bench tucked in a shadowy alley niche, top-down RPG prop',
    },
  },
  {
    id: 'prop_shadow_lamp',
    profile: 'prop_sprite',
    label: 'Shadow alley lamp',
    params: {
      prop_name:
        'dim iron street lamp casting soft glow in a dark alley, top-down RPG prop',
    },
  },
  {
    id: 'location_empery_hq',
    profile: 'location_bg',
    label: 'EmperyWorld HQ campus',
    params: {
      location_name:
        'futuristic corporate campus behind glass and steel fences at dusk, cyan neon accents, antenna arrays, clean paved plaza, sci-fi RPG location background',
    },
  },
  {
    id: 'prop_hq_fence',
    profile: 'prop_sprite',
    label: 'HQ security fence',
    params: {
      prop_name:
        'tall modern steel security fence with barbed wire and cyan warning lights, corporate perimeter, top-down RPG prop',
    },
  },
  {
    id: 'prop_hq_fence_corner',
    profile: 'prop_sprite',
    label: 'HQ fence corner',
    params: {
      prop_name:
        'reinforced steel fence corner post with camera and floodlight, corporate security, top-down RPG prop',
    },
  },
  {
    id: 'prop_hq_gate_closed',
    profile: 'prop_sprite',
    label: 'HQ gate closed',
    params: {
      prop_name:
        'massive closed futuristic corporate gate with EmperyWorld logo, steel blast doors sealed, cyan LEDs, top-down RPG prop',
    },
  },
  {
    id: 'prop_hq_gate_open',
    profile: 'prop_sprite',
    label: 'HQ gate open',
    params: {
      prop_name:
        'open futuristic corporate gate archway with EmperyWorld logo, steel frames retracted, cyan LEDs, walkable center, top-down RPG prop',
    },
  },
  {
    id: 'prop_hq_sniper_tower',
    profile: 'prop_sprite',
    label: 'HQ sniper tower',
    params: {
      prop_name:
        'premium high-tech sniper overwatch tower, armored steel core, panoramic bulletproof glass pod, tactical mast antennas, surveillance arrays, strong cyan emissive accents, elite corporate military aesthetic, top-down RPG orthographic prop',
    },
  },
  {
    id: 'prop_hq_building',
    profile: 'prop_sprite',
    label: 'HQ main building',
    params: {
      prop_name:
        'MEGA-SCALE EmperyWorld HQ arcology block, monumental glass-and-steel massing, layered terraces, recessed atriums, luminous cyan corporate insignia, luxury sci-fi facade paneling, flagship district landmark, strict orthographic front elevation, axis-aligned mega footprint',
    },
  },
  {
    id: 'prop_hq_lab',
    profile: 'prop_sprite',
    label: 'HQ laboratory wing',
    params: {
      prop_name:
        'large advanced research campus wing, segmented clean-room volumes, reinforced glass ribbons, external reactor housings, subtle cyan procedural light bands, premium near-future corporate science architecture, top-down RPG orthographic prop',
    },
  },
  {
    id: 'prop_hq_pad',
    profile: 'prop_sprite',
    label: 'HQ landing pad',
    params: {
      prop_name:
        'circular futuristic landing pad with glowing ring lights and EmperyWorld markings, top-down RPG prop',
    },
  },
  {
    id: 'prop_hq_antenna',
    profile: 'prop_sprite',
    label: 'HQ antenna array',
    params: {
      prop_name:
        'tall modern radio antenna array with dishes and blinking cyan lights, corporate campus, top-down RPG prop',
    },
  },
  {
    id: 'prop_hq_checkpoint',
    profile: 'prop_sprite',
    label: 'HQ checkpoint booth',
    params: {
      prop_name:
        'small futuristic security checkpoint booth with scanner gate and cyan lights, top-down RPG prop',
    },
  },
  {
    id: 'prop_hq_server_rack',
    profile: 'prop_sprite',
    label: 'HQ server racks',
    params: {
      prop_name:
        'outdoor sealed server rack cabinets with blinking LEDs, sci-fi corporate tech, top-down RPG prop',
    },
  },
  {
    id: 'prop_hq_holo_sign',
    profile: 'prop_sprite',
    label: 'HQ holo sign',
    params: {
      prop_name:
        'floating holographic EmperyWorld logo sign on a pedestal, cyan glow, futuristic plaza, top-down RPG prop',
    },
  },
  {
    id: 'prop_hq_floodlight',
    profile: 'prop_sprite',
    label: 'HQ floodlight',
    params: {
      prop_name:
        'tall modern security floodlight pole casting bright beam, corporate perimeter, top-down RPG prop',
    },
  },
  {
    id: 'prop_hq_barrier',
    profile: 'prop_sprite',
    label: 'HQ road barrier',
    params: {
      prop_name:
        'retractable steel vehicle barrier with warning stripes and cyan lights, security checkpoint, top-down RPG prop',
    },
  },
  {
    id: 'prop_hq_panel',
    profile: 'prop_sprite',
    label: 'HQ tech panel',
    params: {
      prop_name:
        'free-standing holographic control panel console with cyan UI screens, sci-fi campus, top-down RPG prop',
    },
  },
  ...[
    ['prop_hq_reception_desk', 'HQ reception desk', 'a contemporary curved reception counter, matte navy front with thin cyan accent, light oak countertop, tablet and small vase, clean modern office furniture'],
  ].map(([id, label, prop_name]) => ({id: id!, label: label!, profile: 'prop_sprite' as const, params: {prop_name: `compact low horizontal furniture, wide shallow silhouette, tabletop dominant, legs mostly concealed, ${prop_name!}`, object_view: 'top_down_furniture'}})),
  ...[
    ['prop_hq_lounge_sofa', 'Premium reception sofa', 'one compact low two-seat designer sofa, warm ivory boucle upholstery, elegant rounded back, dark walnut legs, sophisticated luxury hotel lobby furniture, wide shallow silhouette, no table, no people'],
    ['prop_hq_indoor_planter', 'Premium reception planter', 'one refined cylindrical matte charcoal ceramic planter containing an elegant small rubber plant with broad deep green leaves, clean modern luxury office decor, no flowers, no pedestal, no other objects'],
    ['prop_hq_reception_backdrop', 'Premium reception backdrop', 'a wide low contemporary reception backdrop wall, warm ivory honed limestone, narrow vertical walnut slats, subtle brushed brass trim, soft integrated warm lighting, sophisticated boutique hotel reception architectural panel, blank unmarked centre, no desk, no table, no letters, no words, no logo'],
  ].map(([id,label,prop_name]) => ({id:id!,label:label!,profile:'prop_sprite' as const,params:{prop_name:prop_name!,era:'contemporary'}})),
  {
    id: 'prop_schoolhouse',
    profile: 'prop_sprite',
    label: 'Schoolhouse',
    params: {
      seed: '988441',
      prop_name:
        'COLOSSAL imperial academy school palace filling ENTIRE frame, 4-story stone facade, central grand door steps, vast slate roof cupola, monumental civic landmark, FORBIDDEN small schoolhouse hut cabin, front elevation orthographic, rectangular axis-aligned, not isometric',
    },
  },
  {
    id: 'prop_glassblower',
    profile: 'prop_sprite',
    label: 'Glassblower shop',
    params: {
      prop_name:
        'glassblower workshop with glowing furnace and glass bottles on racks, craft street, top-down RPG prop',
    },
  },
  {
    id: 'prop_map_shop',
    profile: 'prop_sprite',
    label: 'Map shop',
    params: {
      prop_name:
        'harbor map and chart shop with rolled maps and globe in window, sailor street, top-down RPG prop',
    },
  },
  {
    id: 'prop_harbor_bell',
    profile: 'prop_sprite',
    label: 'Harbor bell',
    params: {
      prop_name: 'large bronze harbor warning bell on a wooden frame, quay, top-down RPG prop',
    },
  },
  {
    id: 'prop_tombstone',
    profile: 'prop_sprite',
    label: 'Tombstone',
    params: {
      prop_name: 'weathered stone tombstone with carved epitaph, memorial garden, top-down RPG prop',
    },
  },
  {
    id: 'prop_grave_angel',
    profile: 'prop_sprite',
    label: 'Grave angel',
    params: {
      prop_name:
        'stone mourning angel statue over a grave, memorial garden, top-down RPG prop',
    },
  },
  {
    id: 'prop_dye_vat',
    profile: 'prop_sprite',
    label: 'Dye vats',
    params: {
      prop_name:
        'large dye vats with purple and indigo cloth hanging to dry, craft yard, top-down RPG prop',
    },
  },
  {
    id: 'prop_basket_stall',
    profile: 'prop_sprite',
    label: 'Basket stall',
    params: {
      prop_name:
        'wicker basket weaver stall with stacked baskets and reeds, market, top-down RPG prop',
    },
  },
  {
    id: 'prop_victory_monument',
    profile: 'prop_sprite',
    label: 'Victory monument',
    params: {
      prop_name:
        'tall imperial victory monument column with bronze wreath and relief, civic plaza approach, top-down RPG landmark',
    },
  },
  {
    id: 'prop_neighborhood_well',
    profile: 'prop_sprite',
    label: 'Neighborhood well',
    params: {
      prop_name:
        'communal neighborhood stone well with rope and bucket, residential square, top-down RPG prop',
    },
  },
  {
    id: 'prop_cobbler',
    profile: 'prop_sprite',
    label: 'Cobbler shop',
    params: {
      prop_name:
        'cobbler shoe repair shop with hanging boots and workbench, residential street, top-down RPG prop',
    },
  },
  {
    id: 'prop_barber',
    profile: 'prop_sprite',
    label: 'Barber shop',
    params: {
      prop_name:
        'barber shop with striped pole and chairs visible through window, boulevard, top-down RPG prop',
    },
  },
  {
    id: 'prop_sparring_ring',
    profile: 'prop_sprite',
    label: 'Sparring ring',
    params: {
      prop_name:
        'circular dirt sparring ring with wooden posts and practice weapons rack, garrison yard, top-down RPG prop',
    },
  },
  {
    id: 'prop_pilot_lookout',
    profile: 'prop_sprite',
    label: 'Pilot lookout',
    params: {
      prop_name:
        'small harbor pilot lookout tower with spyglass balcony, quay, top-down RPG landmark',
    },
  },
  {
    id: 'prop_ropewalk',
    profile: 'prop_sprite',
    label: 'Ropewalk shed',
    params: {
      prop_name:
        'long low rope-making shed with hemp coils and spinning gear, harbor craft, top-down RPG prop',
    },
  },
  {
    id: 'prop_imperial_archive',
    profile: 'prop_sprite',
    label: 'Imperial archive',
    params: {
      prop_name:
        'stone imperial archive annex with sealed doors and document crest, beside library, top-down RPG landmark',
    },
  },
  {
    id: 'prop_villa_garden',
    profile: 'prop_sprite',
    label: 'Villa garden',
    params: {
      prop_name:
        'walled private villa garden with fountain basin and trimmed hedges, noble district, top-down RPG prop',
    },
  },
  {
    id: 'prop_traveler_camp',
    profile: 'prop_sprite',
    label: 'Traveler camp',
    params: {
      prop_name:
        'small traveler camp with tent bedrolls and cookfire outside city walls near fields, top-down RPG prop',
    },
  },
  {
    id: 'prop_millstone',
    profile: 'prop_sprite',
    label: 'Millstones',
    params: {
      prop_name: 'pair of heavy round millstones near windmill, dusty yard, top-down RPG prop',
    },
  },
  {
    id: 'prop_flower_bed',
    profile: 'prop_sprite',
    label: 'Flower bed',
    params: {
      prop_name: 'rectangular civic flower bed with colorful blooms, boulevard edge, top-down RPG prop',
    },
  },
  {
    id: 'prop_cheese_shop',
    profile: 'prop_sprite',
    label: 'Cheese shop',
    params: {
      prop_name:
        'cheese monger shop with wheels of cheese on shelves and striped awning, residential street, top-down RPG prop',
    },
  },
  {
    id: 'prop_candle_shop',
    profile: 'prop_sprite',
    label: 'Candle shop',
    params: {
      seed: '16398',
      prop_name:
        'candle maker shop with hanging wax candles and warm window glow, craft street, top-down RPG prop, front facade facing camera straight-on, rectangular axis-aligned footprint, walls parallel to image edges, not isometric not diamond not 45-degree rotated',
    },
  },
  {
    id: 'prop_tea_house',
    profile: 'prop_sprite',
    label: 'Tea house',
    params: {
      prop_name:
        'cozy imperial tea house with lattice windows and steam from kettles, east boulevard, top-down RPG landmark',
    },
  },
  {
    id: 'prop_anchor_monument',
    profile: 'prop_sprite',
    label: 'Anchor monument',
    params: {
      prop_name:
        'large bronze ship anchor monument on a stone plinth, harbor plaza, top-down RPG landmark',
    },
  },
  {
    id: 'prop_salt_stacks',
    profile: 'prop_sprite',
    label: 'Salt stacks',
    params: {
      prop_name: 'stacks of white salt sacks and barrels on the quay, harbor trade, top-down RPG prop',
    },
  },
  {
    id: 'prop_crier_stand',
    profile: 'prop_sprite',
    label: 'Town crier stand',
    params: {
      prop_name:
        'raised wooden town crier platform with bell and notice scrolls, plaza edge, top-down RPG prop',
    },
  },
  {
    id: 'prop_wagon_workshop',
    profile: 'prop_sprite',
    label: 'Wagon workshop',
    params: {
      prop_name:
        'wagon wright workshop with half-built cart wheel and timber, craft yard, top-down RPG prop',
    },
  },
  {
    id: 'prop_perfume_stall',
    profile: 'prop_sprite',
    label: 'Perfume stall',
    params: {
      prop_name:
        'perfume and oil stall with glass bottles and flower garlands, market boulevard, top-down RPG prop',
    },
  },
  {
    id: 'prop_east_garden_pool',
    profile: 'prop_sprite',
    label: 'Garden reflecting pool',
    params: {
      prop_name:
        'small rectangular reflecting pool with lily pads in a noble garden, east district, top-down RPG prop',
    },
  },
  {
    id: 'prop_fire_brigade',
    profile: 'prop_sprite',
    label: 'Fire brigade shed',
    params: {
      seed: '41735',
      prop_name:
        'city fire brigade shed with hand pump cart and buckets, civic street, top-down RPG landmark, front facade facing camera straight-on, rectangular axis-aligned footprint, walls parallel to image edges, not isometric not diamond not 45-degree rotated',
    },
  },

  // Стены гавани — N/S/E/W отдельно (бойницы всегда наружу). Только сегмент стены, не двор.
  {
    id: 'prop_city_wall_n',
    profile: 'prop_sprite',
    label: 'City wall north',
    params: {
      prop_name:
        'SINGLE straight horizontal fortified stone CURTAIN WALL SEGMENT only for the NORTH map edge, thick grey masonry spanning left-right, merlons and crenellations along the TOP edge facing outside, flat patrol walkway strip along the BOTTOM toward city, no courtyard, no buildings, no chapel, no towers, no ground yard, no interior space, solid opaque stone, top-down RPG fortification module',
    },
  },
  {
    id: 'prop_city_wall_s',
    profile: 'prop_sprite',
    label: 'City wall south',
    params: {
      prop_name:
        'SINGLE straight horizontal fortified stone CURTAIN WALL SEGMENT only for the SOUTH map edge, thick grey masonry spanning left-right, merlons and crenellations along the BOTTOM edge facing outside, flat patrol walkway strip along the TOP toward city, no courtyard, no buildings, no chapel, no towers, no ground yard, no interior space, solid opaque stone, top-down RPG fortification module',
    },
  },
  {
    id: 'prop_city_wall_w',
    profile: 'prop_sprite',
    label: 'City wall west',
    params: {
      prop_name:
        'SINGLE straight vertical fortified stone CURTAIN WALL SEGMENT only for the WEST map edge, thick grey masonry spanning top-bottom, merlons along the LEFT edge facing outside, flat patrol walkway strip along the RIGHT toward city, no courtyard, no buildings, no chapel, no towers, no ground yard, no interior space, solid opaque stone, top-down RPG fortification module',
    },
  },
  {
    id: 'prop_city_wall_e',
    profile: 'prop_sprite',
    label: 'City wall east',
    params: {
      prop_name:
        'SINGLE straight vertical fortified stone CURTAIN WALL SEGMENT only for the EAST map edge, thick grey masonry spanning top-bottom, merlons along the RIGHT edge facing outside, flat patrol walkway strip along the LEFT toward city, no courtyard, no buildings, no chapel, no towers, no ground yard, no interior space, solid opaque stone, top-down RPG fortification module',
    },
  },
  {
    id: 'prop_city_wall',
    profile: 'prop_sprite',
    label: 'City wall (legacy north)',
    params: {
      prop_name:
        'SINGLE straight horizontal fortified stone CURTAIN WALL SEGMENT only, thick layered curtain wall, deep crenellations, patrol walkway on city side, no courtyard, no buildings, no interior yard, solid opaque premium weathered stone, top-down RPG fortification module',
    },
  },
  {
    id: 'prop_wall_tower',
    profile: 'prop_sprite',
    label: 'Wall tower',
    params: {
      prop_name:
        'huge curtain-wall tower bastion only, thick drum core with machicolations, multi-tier crenellation crown, embedded arrow slits, heraldic banner and iron lamps, solid opaque stone, no courtyard scene, high-detail but readable top-down RPG fortification prop',
    },
  },
  {
    id: 'prop_city_gate_s',
    profile: 'prop_sprite',
    label: 'City gate south',
    params: {
      prop_name:
        'grand imperial city gate on SOUTH wall, twin towers, heavy oak doors CLOSED facing BOTTOM of image toward outside south, crest above arch, solid opaque stone, top-down RPG prop',
    },
  },
  {
    id: 'prop_city_gate_s_open',
    profile: 'prop_sprite',
    label: 'City gate south open',
    params: {
      prop_name:
        'grand imperial city gate on SOUTH wall, twin towers, oak doors OPEN swung aside, walkable arch passageway facing BOTTOM of image, crest above arch, solid opaque stone, top-down RPG prop',
    },
  },
  {
    id: 'prop_city_gate_e',
    profile: 'prop_sprite',
    label: 'City gate east',
    params: {
      prop_name:
        'grand imperial city gate on EAST wall, twin towers, heavy oak doors CLOSED facing RIGHT of image toward outside east, crest above arch, side-facing gatehouse, solid opaque stone, top-down RPG prop',
    },
  },
  {
    id: 'prop_city_gate_e_open',
    profile: 'prop_sprite',
    label: 'City gate east open',
    params: {
      prop_name:
        'grand imperial city gate on EAST wall, twin towers, oak doors OPEN swung aside, walkable arch passageway facing RIGHT of image, crest above arch, side-facing gatehouse, solid opaque stone, top-down RPG prop',
    },
  },
  {
    id: 'prop_harbor_guard_arch',
    profile: 'prop_sprite',
    label: 'Harbor guard arch',
    params: {
      prop_name:
        'wide stone harbor checkpoint archway on quay wall, open walkable span, twin guard posts with lanterns and spears, imperial naval crest, thick pillars, no closed doors, top-down RPG fortification prop, orthographic',
    },
  },
  {
    id: 'prop_house_manor',
    profile: 'prop_sprite',
    label: 'Manor house',
    params: {
      seed: '938206',
      prop_name:
        'STONE CITIZEN SET matching, MASSIVE 5-story merchant stone manor terrace BLOCK SECTION filling frame, blank party walls LEFT RIGHT, balcony, FORBIDDEN plastic wood plank half-timber, aged medieval rough ashlar stone texture, porous weathered masonry, mortar gaps, rough stone foundation, chipped cobblestone bottom, detailed slate or clay roof tiles, textured shingles, moss accents on roof edges, subtle grime and weathering, realistic material definition, perfect architectural symmetry, aligned windows, structured facade layout, front elevation orthographic, not isometric',
    },
  },
  {
    id: 'prop_house_redroof',
    profile: 'prop_sprite',
    label: 'Red roof house',
    params: {
      seed: '938301',
      prop_name:
        'MERCHANT HALF-TIMBERED SET matching, MASSIVE 4-story living medieval fachwerk terrace BLOCK SECTION filling frame, blank party walls LEFT RIGHT, cream aged plaster dark oak beams bright terracotta roof, FORBIDDEN plastic vinyl beams bare log grey ashlar only, aged medieval stucco texture, weathered half-timbered wooden beams with visible grain and cracks, rough stone foundation, chipped cobblestone bottom, detailed clay roof tiles, textured terracotta shingles, moss accents on roof edges, subtle grime and weathering, realistic material definition, perfect architectural symmetry, aligned windows, structured facade layout, front elevation orthographic, not isometric',
    },
  },
  {
    id: 'prop_house_slate',
    profile: 'prop_sprite',
    label: 'Slate house',
    params: {
      seed: '938203',
      prop_name:
        'STONE CITIZEN SET matching, MASSIVE 5-story grey stone terrace BLOCK SECTION filling frame, blank party walls LEFT RIGHT, blue-grey slate roof mullioned windows, FORBIDDEN plastic wood half-timber, aged medieval rough ashlar stone texture, porous weathered masonry, mortar gaps, rough stone foundation, chipped cobblestone bottom, detailed slate or clay roof tiles, textured shingles, moss accents on roof edges, subtle grime and weathering, realistic material definition, perfect architectural symmetry, aligned windows, structured facade layout, front elevation orthographic, not isometric',
    },
  },
  {
    id: 'prop_house_villa',
    profile: 'prop_sprite',
    label: 'Villa',
    params: {
      seed: '938201',
      prop_name:
        'STONE CITIZEN SET matching, MASSIVE 4-story warm sandstone terrace BLOCK SECTION filling frame, blank party walls LEFT RIGHT, civic stone district, FORBIDDEN plastic wood plank half-timber, aged medieval rough ashlar stone texture, porous weathered masonry, mortar gaps, rough stone foundation, chipped cobblestone bottom, detailed slate or clay roof tiles, textured shingles, moss accents on roof edges, subtle grime and weathering, realistic material definition, perfect architectural symmetry, aligned windows, structured facade layout, front elevation orthographic, not isometric',
    },
  },
  {
    id: 'prop_house_cottage',
    profile: 'prop_sprite',
    label: 'Cottage',
    params: {
      seed: '938101',
      prop_name:
        'WOODEN SLUM SET matching, MASSIVE 3-story weathered dark-timber terrace BLOCK SECTION filling frame, blank party walls LEFT RIGHT, rough plank walls, poor imperial fringe, FORBIDDEN plastic smooth walls stone palace half-timber cream, aged medieval weathered dark timber texture, rough sawn plank grain, cracked wood, rough stone foundation, chipped cobblestone bottom, detailed clay roof tiles, textured terracotta or mossy shingle roof, moss accents on roof edges, subtle grime and weathering, realistic material definition, perfect architectural symmetry, aligned windows, structured facade layout, front elevation orthographic, not isometric',
    },
  },
  {
    id: 'prop_house_townhouse',
    profile: 'prop_sprite',
    label: 'Townhouse',
    params: {
      seed: '938204',
      prop_name:
        'STONE CITIZEN SET matching, MASSIVE 5-story dressed stone brick terrace BLOCK SECTION filling frame, blank party walls LEFT RIGHT, cream quoins, FORBIDDEN plastic dark timber wood plank, aged medieval rough ashlar stone texture, porous weathered masonry, mortar gaps, rough stone foundation, chipped cobblestone bottom, detailed slate or clay roof tiles, textured shingles, moss accents on roof edges, subtle grime and weathering, realistic material definition, perfect architectural symmetry, aligned windows, structured facade layout, front elevation orthographic, not isometric',
    },
  },
  {
    id: 'prop_house_duplex',
    profile: 'prop_sprite',
    label: 'Duplex house',
    params: {
      seed: '938303',
      prop_name:
        'MERCHANT HALF-TIMBERED SET matching, MASSIVE 4-story twin-door living fachwerk terrace BLOCK SECTION filling frame, blank party walls LEFT RIGHT, cream plaster oak beams shared terracotta roof, FORBIDDEN plastic vinyl beams bare wood grey ashlar, aged medieval stucco texture, weathered half-timbered wooden beams with visible grain and cracks, rough stone foundation, chipped cobblestone bottom, detailed clay roof tiles, textured terracotta shingles, moss accents on roof edges, subtle grime and weathering, realistic material definition, perfect architectural symmetry, aligned windows, structured facade layout, front elevation orthographic, not isometric',
    },
  },
  {
    id: 'prop_house_gardener',
    profile: 'prop_sprite',
    label: 'Gardener house',
    params: {
      seed: '938103',
      prop_name:
        'WOODEN SLUM SET matching, MASSIVE 3-story timber terrace BLOCK SECTION filling frame, blank party walls LEFT RIGHT, lean-to greenhouse glass green shutters, FORBIDDEN plastic smooth walls stone palace, aged medieval weathered dark timber texture, rough sawn plank grain, cracked wood, rough stone foundation, chipped cobblestone bottom, detailed clay roof tiles, textured terracotta or mossy shingle roof, moss accents on roof edges, subtle grime and weathering, realistic material definition, perfect architectural symmetry, aligned windows, structured facade layout, front elevation orthographic, not isometric',
    },
  },
  {
    id: 'prop_house_attic',
    profile: 'prop_sprite',
    label: 'Attic house',
    params: {
      seed: '938102',
      prop_name:
        'WOODEN SLUM SET matching, MASSIVE 3-story dark timber terrace BLOCK SECTION filling frame, blank party walls LEFT RIGHT, attic dormers patched shingles, FORBIDDEN plastic smooth walls stone half-timber, aged medieval weathered dark timber texture, rough sawn plank grain, cracked wood, rough stone foundation, chipped cobblestone bottom, detailed clay roof tiles, textured terracotta or mossy shingle roof, moss accents on roof edges, subtle grime and weathering, realistic material definition, perfect architectural symmetry, aligned windows, structured facade layout, front elevation orthographic, not isometric',
    },
  },
  {
    id: 'prop_house_stucco',
    profile: 'prop_sprite',
    label: 'Stucco house',
    params: {
      seed: '938305',
      prop_name:
        'MERCHANT HALF-TIMBERED SET matching, MASSIVE 4-story living fachwerk-stucco terrace BLOCK SECTION filling frame, blank party walls LEFT RIGHT, oak beam accents terracotta roof blue shutters, FORBIDDEN plastic vinyl beams bare wood grey ashlar, aged medieval stucco texture, weathered half-timbered wooden beams with visible grain and cracks, rough stone foundation, chipped cobblestone bottom, detailed clay roof tiles, textured terracotta shingles, moss accents on roof edges, subtle grime and weathering, realistic material definition, perfect architectural symmetry, aligned windows, structured facade layout, front elevation orthographic, not isometric',
    },
  },
  {
    id: 'prop_house_bay',
    profile: 'prop_sprite',
    label: 'Bay window house',
    params: {
      seed: '938207',
      prop_name:
        'STONE CITIZEN SET matching, MASSIVE 4-story grey stone terrace BLOCK SECTION filling frame, blank party walls LEFT RIGHT, stacked bay windows copper gutters, FORBIDDEN plastic wood half-timber, aged medieval rough ashlar stone texture, porous weathered masonry, mortar gaps, rough stone foundation, chipped cobblestone bottom, detailed slate or clay roof tiles, textured shingles, moss accents on roof edges, subtle grime and weathering, realistic material definition, perfect architectural symmetry, aligned windows, structured facade layout, front elevation orthographic, not isometric',
    },
  },
  {
    id: 'prop_house_workshop_home',
    profile: 'prop_sprite',
    label: 'Workshop home',
    params: {
      seed: '938104',
      prop_name:
        'WOODEN SLUM SET matching, MASSIVE 3-story live-work timber terrace BLOCK SECTION filling frame, blank party walls LEFT RIGHT, wide workshop shutters, FORBIDDEN plastic cream half-timber, aged medieval weathered dark timber texture, rough sawn plank grain, cracked wood, rough stone foundation, chipped cobblestone bottom, detailed clay roof tiles, textured terracotta or mossy shingle roof, moss accents on roof edges, subtle grime and weathering, realistic material definition, perfect architectural symmetry, aligned windows, structured facade layout, front elevation orthographic, not isometric',
    },
  },
  {
    id: 'prop_house_blue',
    profile: 'prop_sprite',
    label: 'Blue shutter house',
    params: {
      seed: '938304',
      prop_name:
        'MERCHANT HALF-TIMBERED SET matching, MASSIVE 4-story living fachwerk terrace BLOCK SECTION filling frame, blank party walls LEFT RIGHT, bright blue shutters oak beams terracotta roof, FORBIDDEN plastic vinyl beams bare wood grey stone, aged medieval stucco texture, weathered half-timbered wooden beams with visible grain and cracks, rough stone foundation, chipped cobblestone bottom, detailed clay roof tiles, textured terracotta shingles, moss accents on roof edges, subtle grime and weathering, realistic material definition, perfect architectural symmetry, aligned windows, structured facade layout, front elevation orthographic, not isometric',
    },
  },
  {
    id: 'prop_house_rooftop',
    profile: 'prop_sprite',
    label: 'Rooftop terrace house',
    params: {
      seed: '938105',
      prop_name:
        'WOODEN SLUM SET matching, MASSIVE 3-story timber terrace BLOCK SECTION filling frame, blank party walls LEFT RIGHT, rooftop railing clay pots, FORBIDDEN plastic stone half-timber, aged medieval weathered dark timber texture, rough sawn plank grain, cracked wood, rough stone foundation, chipped cobblestone bottom, detailed clay roof tiles, textured terracotta or mossy shingle roof, moss accents on roof edges, subtle grime and weathering, realistic material definition, perfect architectural symmetry, aligned windows, structured facade layout, front elevation orthographic, not isometric',
    },
  },
  {
    id: 'prop_house_corner_shop',
    profile: 'prop_sprite',
    label: 'Corner grocery home',
    params: {
      seed: '938306',
      prop_name:
        'MERCHANT HALF-TIMBERED SET matching, MASSIVE 4-story corner shop living fachwerk terrace BLOCK SECTION filling frame, blank party walls, ground awning produce crates cream plaster oak beams terracotta, FORBIDDEN plastic vinyl beams bare wood grey ashlar, aged medieval stucco texture, weathered half-timbered wooden beams with visible grain and cracks, rough stone foundation, chipped cobblestone bottom, detailed clay roof tiles, textured terracotta shingles, moss accents on roof edges, subtle grime and weathering, realistic material definition, perfect architectural symmetry, aligned windows, structured facade layout, front elevation orthographic, not isometric',
    },
  },
  {
    id: 'prop_house_row',
    profile: 'prop_sprite',
    label: 'Row house',
    params: {
      seed: '938205',
      prop_name:
        'STONE CITIZEN SET matching, MASSIVE 5-story dark brick stone terrace BLOCK SECTION filling frame, blank party walls LEFT RIGHT flush, stoop, FORBIDDEN plastic wood half-timber, aged medieval rough ashlar stone texture, porous weathered masonry, mortar gaps, rough stone foundation, chipped cobblestone bottom, detailed slate or clay roof tiles, textured shingles, moss accents on roof edges, subtle grime and weathering, realistic material definition, perfect architectural symmetry, aligned windows, structured facade layout, front elevation orthographic, not isometric',
    },
  },
  {
    id: 'prop_basketball_court',
    profile: 'prop_sprite',
    label: 'Basketball court',
    params: {
      seed: '83010',
      prop_name:
        'small outdoor neighborhood basketball court from slightly above, painted asphalt with free-throw lines, two simple hoop poles with backboards, chain-link fence sides, wooden bench, top-down RPG ground prop, rectangular axis-aligned, plain black background, no people',
    },
  },
  {
    id: 'prop_playground_sandbox',
    profile: 'prop_sprite',
    label: 'Playground sandbox',
    params: {
      seed: '83011',
      prop_name:
        'wooden sandbox play square with sand, tiny bucket shovel and toy, low timber border, top-down RPG ground prop, rectangular axis-aligned, plain black background, no children',
    },
  },
  {
    id: 'prop_neighborhood_gate',
    profile: 'prop_sprite',
    label: 'Neighborhood gate',
    params: {
      seed: '83012',
      prop_name:
        'small brick neighborhood entry arch with iron gate open, hanging street lantern, ivy, front elevation orthographic, top-down RPG prop, rectangular footprint, not isometric, plain black background',
    },
  },
  {
    id: 'prop_picket_fence',
    profile: 'prop_sprite',
    label: 'Picket fence',
    params: {
      seed: '83013',
      prop_name:
        'short white wooden picket fence section with gate post, neighborhood yard divider, front elevation orthographic, top-down RPG prop, wide rectangular footprint, plain black background',
    },
  },
  {
    id: 'prop_mailbox',
    profile: 'prop_sprite',
    label: 'Mailbox',
    params: {
      seed: '83014',
      prop_name:
        'small wooden street mailbox on a post with tiny flag, neighborhood residential, front elevation orthographic, top-down RPG prop, plain black background',
    },
  },
  {
    id: 'prop_hopscotch',
    profile: 'prop_sprite',
    label: 'Hopscotch chalk',
    params: {
      seed: '83015',
      prop_name:
        'chalk hopscotch grid drawn on cobblestone street, numbered squares 1 to 8, faded colorful chalk, top-down RPG ground prop, rectangular axis-aligned, plain black background, no people',
    },
  },
  {
    id: 'prop_window_box',
    profile: 'prop_sprite',
    label: 'Window flower box',
    params: {
      seed: '83016',
      prop_name:
        'wooden window flower box overflowing with colorful blooms and trailing ivy, neighborhood facade detail, front elevation orthographic, top-down RPG prop, plain black background',
    },
  },
  {
    id: 'prop_yard_fountain',
    profile: 'prop_sprite',
    label: 'Yard fountain',
    params: {
      seed: '83017',
      prop_name:
        'tiny stone drinking fountain with basin and trickle of water, neighborhood courtyard, top-down RPG ground prop, rectangular axis-aligned, plain black background, no people',
    },
  },
  {
    id: 'prop_doghouse',
    profile: 'prop_sprite',
    label: 'Doghouse',
    params: {
      seed: '83018',
      prop_name:
        'small wooden doghouse kennel with peaked roof and bowl, backyard neighborhood, front elevation orthographic, top-down RPG prop, plain black background, no dog',
    },
  },
  {
    id: 'prop_string_lights',
    profile: 'prop_sprite',
    label: 'String lights',
    params: {
      seed: '83019',
      prop_name:
        'string of warm festival fairy lights hung between two wooden posts over a courtyard, glowing bulbs, neighborhood night décor, front elevation orthographic, top-down RPG prop, plain black background',
    },
  },
  {
    id: 'prop_shop_awning',
    profile: 'prop_sprite',
    label: 'Shop awning',
    params: {
      seed: '83020',
      prop_name:
        'striped fabric shop awning canopy over a small storefront, red and cream stripes, wooden frame, neighborhood corner shop, front elevation orthographic, top-down RPG prop, plain black background',
    },
  },
  {
    id: 'prop_wheelbarrow',
    profile: 'prop_sprite',
    label: 'Wheelbarrow',
    params: {
      seed: '83021',
      prop_name:
        'wooden wheelbarrow with one iron wheel, half full of vegetables and sacks, neighborhood yard, front elevation orthographic, top-down RPG prop, plain black background',
    },
  },
  {
    id: 'prop_workbench',
    profile: 'prop_sprite',
    label: 'Workbench',
    params: {
      seed: '83022',
      prop_name:
        'sturdy carpenter workbench with vices, wood shavings and hand tools on top, craft workshop, front elevation orthographic, top-down RPG prop, plain black background',
    },
  },
  {
    id: 'prop_plank_stack',
    profile: 'prop_sprite',
    label: 'Plank stack',
    params: {
      seed: '83023',
      prop_name:
        'neat stack of cut lumber planks and timber beams, carpenter yard, top-down RPG ground prop, rectangular axis-aligned, plain black background',
    },
  },
  {
    id: 'prop_soldier_tent',
    profile: 'prop_sprite',
    label: 'Soldier tent',
    params: {
      seed: '83024',
      prop_name:
        'military canvas soldier tent with wooden poles and rolled bedrolls outside, garrison camp, front elevation orthographic, top-down RPG prop, plain black background',
    },
  },
  {
    id: 'prop_archery_target',
    profile: 'prop_sprite',
    label: 'Archery target',
    params: {
      seed: '83025',
      prop_name:
        'round straw archery target on a wooden stand with painted rings and a few stuck arrows, garrison training yard, front elevation orthographic, top-down RPG prop, plain black background',
    },
  },
  {
    id: 'prop_bakery',
    profile: 'prop_sprite',
    label: 'Bakery',
    params: {
      prop_name:
        'imperial bakery shop, hanging bread sign, warm oven glow, flour sacks, top-down RPG prop',
    },
  },
  {
    id: 'prop_apothecary',
    profile: 'prop_sprite',
    label: 'Apothecary',
    params: {
      prop_name:
        'apothecary herbalist shop, green shutters, herb hanging bundles, potion bottles, top-down RPG prop',
    },
  },
  {
    id: 'prop_armory',
    profile: 'prop_sprite',
    label: 'Armory',
    params: {
      prop_name:
        'large imperial armory complex, reinforced stone-and-iron frontage, oversized vault doors, weapon relief emblems, defensive buttresses, premium military craft detail, top-down RPG orthographic building prop',
    },
  },
  {
    id: 'prop_wagon',
    profile: 'prop_sprite',
    label: 'Wagon',
    params: {
      prop_name: 'empty wooden freight wagon with large wheels, top-down RPG prop',
    },
  },
  {
    id: 'prop_hay_cart',
    profile: 'prop_sprite',
    label: 'Hay cart',
    params: {
      prop_name: 'wooden cart piled high with golden hay, top-down RPG prop',
    },
  },
  {
    id: 'prop_water_trough',
    profile: 'prop_sprite',
    label: 'Water trough',
    params: {
      prop_name: 'long stone horse water trough with water, top-down RPG prop',
    },
  },
  {
    id: 'prop_notice_board',
    profile: 'prop_sprite',
    label: 'Notice board',
    params: {
      prop_name: 'wooden town notice board with pinned papers, top-down RPG prop',
    },
  },
  {
    id: 'prop_scaffold',
    profile: 'prop_sprite',
    label: 'Scaffold',
    params: {
      prop_name: 'wooden construction scaffolding and ladders, top-down RPG prop',
    },
  },
  {
    id: 'prop_chimney_smoke',
    profile: 'prop_sprite',
    label: 'Chimney hut',
    params: {
      prop_name: 'tiny stone smokehouse with chimney puff, top-down RPG prop',
    },
  },
  {
    id: 'prop_tenement_block',
    profile: 'prop_sprite',
    label: 'Tenement block',
    params: {
      seed: '982115',
      prop_name:
        'TITANIC multi-wing urban tenement megastructure across full frame, dense 6-7 floor facade rhythm, layered balconies, laundry lines, patched chimneys, varied window shutters, gritty lived-in imperial masonry, extremely rich but readable silhouette for gameplay, strict orthographic long rectangular facade, no isometric angle',
    },
  },  {
    id: 'prop_radio_booth',
    profile: 'prop_sprite',
    label: 'Radio booth',
    params: {
      seed: '977322',
      prop_name:
        'COLOSSAL imperial radio relay palace filling ENTIRE frame, stone-timber megastructure, giant antenna mast array on roof, monumental tech landmark, FORBIDDEN small booth hut shed cabin, front elevation orthographic, rectangular axis-aligned, not isometric',
    },
  },
  {
    id: 'prop_russian_stove',
    profile: 'prop_sprite',
    label: 'Russian stove',
    params: {
      prop_name:
        'traditional large russian pechka masonry stove with whitewashed brick, sleeping bench ledge, chimney stack and warm fire mouth, top-down RPG furniture prop',
    },
  },
  {
    id: 'prop_hearth',
    profile: 'prop_sprite',
    label: 'Indoor hearth',
    params: {
      prop_name:
        'indoor stone fireplace hearth with warm orange fire glow, brick chimney breast, iron grate and logs, top-down RPG prop',
    },
  },
  {
    id: 'prop_cookpot',
    profile: 'prop_sprite',
    label: 'Cookpot',
    params: {
      prop_name:
        'iron cookpot cauldron over small fire or stand, steam, top-down RPG cooking prop',
    },
  },
  {
    id: 'prop_washbasin',
    profile: 'prop_sprite',
    label: 'Washbasin',
    params: {
      prop_name:
        'wooden kitchen washbasin with water pitcher and ceramic bowl, top-down RPG furniture prop',
    },
  },
  {
    id: 'prop_storage_chest',
    profile: 'prop_sprite',
    label: 'Storage chest',
    params: {
      prop_name: 'large wooden treasure storage chest with iron bands, top-down RPG furniture prop',
    },
  },
  {
    id: 'prop_icebox',
    profile: 'prop_sprite',
    label: 'Icebox',
    params: {
      prop_name:
        'top-down RPG icebox cold pantry cabinet, thick wood body with metal latch, frost accents, closed door, fantasy apartment fridge prop, clear silhouette on black',
    },
  },
  {
    id: 'prop_apt_bed',
    profile: 'prop_sprite',
    label: 'Apartment bed',
    params: {
      prop_name:
        'cozy wooden bed with linen pillows and blanket, top-down RPG apartment furniture prop, warm amber light',
    },
  },
  {
    id: 'prop_apt_table',
    profile: 'prop_sprite',
    label: 'Apartment table',
    params: {
      prop_name:
        'sturdy wooden dining table top-down RPG furniture prop, simple imperial fantasy flat interior',
    },
  },
  {
    id: 'prop_apt_rug',
    profile: 'prop_sprite',
    label: 'Apartment rug',
    params: {
      prop_name:
        'ornate woven floor rug with amber and burgundy pattern, top-down RPG flat prop, soft edges',
    },
  },
  {
    id: 'prop_apt_lantern',
    profile: 'prop_sprite',
    label: 'Apartment lantern',
    params: {
      prop_name:
        'wall-mounted warm oil lantern with soft glow, top-down RPG interior prop, brass and glass',
    },
  },

  // Спрайты героя (top-down для Phaser)
  { id: 'sprite_hero_human', profile: 'game_sprite', label: 'Hero human', params: { kind: 'hero', variant: 'human' } },
  { id: 'sprite_hero_elf', profile: 'game_sprite', label: 'Hero elf', params: { kind: 'hero', variant: 'elf' } },
  { id: 'sprite_hero_orc', profile: 'game_sprite', label: 'Hero orc', params: { kind: 'hero', variant: 'orc' } },

  // Враги
  { id: 'sprite_enemy_goblin', profile: 'game_sprite', label: 'Goblin', params: { kind: 'enemy', variant: 'goblin' } },
  { id: 'sprite_enemy_shadow', profile: 'game_sprite', label: 'Shadow thug', params: { kind: 'enemy', variant: 'shadow' } },
  { id: 'sprite_enemy_wolf', profile: 'game_sprite', label: 'Forest wolf', params: { kind: 'enemy', variant: 'wolf' } },
  { id: 'sprite_enemy_cinder', profile: 'game_sprite', label: 'Cinder imp', params: { kind: 'enemy', variant: 'cinder' } },
  { id: 'sprite_enemy_bone', profile: 'game_sprite', label: 'Bone walker', params: { kind: 'enemy', variant: 'bone' } },
  { id: 'sprite_enemy_orc_grunt', profile: 'game_sprite', label: 'Orc grunt', params: { kind: 'enemy', variant: 'orc_grunt' } },

  // NPC на карте
  {
    id: 'sprite_npc_elder_mira',
    profile: 'game_sprite',
    label: 'NPC Elder Mira',
    params: { kind: 'npc', variant: 'elder_mira' },
  },
  {
    id: 'sprite_npc_silvan_hermit',
    profile: 'game_sprite',
    label: 'NPC Silvan Hermit',
    params: { kind: 'npc', variant: 'silvan_hermit' },
  },
  {
    id: 'sprite_npc_ash_shaman',
    profile: 'game_sprite',
    label: 'NPC Ash Shaman',
    params: { kind: 'npc', variant: 'ash_shaman' },
  },
  {
    id: 'sprite_npc_town_merchant',
    profile: 'game_sprite',
    label: 'NPC Town merchant',
    params: { kind: 'npc', variant: 'town_merchant' },
  },
  {
    id: 'sprite_npc_town_innkeeper',
    profile: 'game_sprite',
    label: 'NPC Town innkeeper',
    params: { kind: 'npc', variant: 'town_innkeeper' },
  },
  {
    id: 'sprite_npc_town_innkeeper_day',
    profile: 'game_sprite',
    label: 'NPC Town innkeeper Oleg',
    params: { kind: 'npc', variant: 'town_innkeeper_day' },
  },
  {
    id: 'sprite_npc_town_captain',
    profile: 'game_sprite',
    label: 'NPC Town captain',
    params: { kind: 'npc', variant: 'town_captain' },
  },
  {
    id: 'sprite_npc_town_blacksmith',
    profile: 'game_sprite',
    label: 'NPC Town blacksmith',
    params: { kind: 'npc', variant: 'town_blacksmith' },
  },
  {
    id: 'item_rift_cleaver',
    profile: 'item_icon',
    label: 'Rift Cleaver',
    params: { item_name: 'jagged rift steel longsword with violet cracks, fantasy weapon icon' },
  },
  {
    id: 'item_fold_stiletto',
    profile: 'item_icon',
    label: 'Fold Stiletto',
    params: { item_name: 'slim fold-metal stiletto dagger with shimmering edge, fantasy weapon icon' },
  },
  {
    id: 'item_pulse_recurve',
    profile: 'item_icon',
    label: 'Pulse Recurve',
    params: { item_name: 'recurve bow of pulsing neon wood and metal, fantasy bow icon' },
  },
  {
    id: 'item_static_buckler',
    profile: 'item_icon',
    label: 'Static Buckler',
    params: { item_name: 'small round buckler crackling with static electricity, fantasy shield icon' },
  },
  {
    id: 'item_echo_coif',
    profile: 'item_icon',
    label: 'Echo Coif',
    params: { item_name: 'light coif woven with echo crystals, fantasy helmet icon' },
  },
  {
    id: 'item_warp_hauberk',
    profile: 'item_icon',
    label: 'Warp Hauberk',
    params: { item_name: 'warped chain hauberk with bent metal rings, fantasy armor icon' },
  },
  {
    id: 'item_signal_greaves',
    profile: 'item_icon',
    label: 'Signal Greaves',
    params: { item_name: 'signal-etched light greaves with antenna motifs, fantasy boots icon' },
  },
  {
    id: 'item_drone_grips',
    profile: 'item_icon',
    label: 'Drone Grips',
    params: { item_name: 'tech-leather gloves with drone claw tips, fantasy gauntlets icon' },
  },
  {
    id: 'item_neon_mantle',
    profile: 'item_icon',
    label: 'Neon Mantle',
    params: { item_name: 'neon-trimmed mage mantle cloak glowing cyan, fantasy cloak icon' },
  },
  {
    id: 'item_shard_arrows',
    profile: 'item_icon',
    label: 'Shard Arrows',
    params: { item_name: 'quiver of crystal shard arrows glowing faintly, fantasy quiver icon' },
  },
  {
    id: 'item_voidscar_greatsword',
    profile: 'item_icon',
    label: 'Voidscar Greatsword',
    params: { item_name: 'massive voidscar greatsword with black scar along blade, fantasy weapon icon' },
  },
  {
    id: 'item_entropy_fang',
    profile: 'item_icon',
    label: 'Entropy Fang',
    params: { item_name: 'curved entropy fang dagger dissolving at the tip, fantasy weapon icon' },
  },
  {
    id: 'item_collapse_longbow',
    profile: 'item_icon',
    label: 'Collapse Longbow',
    params: { item_name: 'tall collapse longbow of bent spacetime wood, fantasy bow icon' },
  },
  {
    id: 'item_siege_tower_shield',
    profile: 'item_icon',
    label: 'Siege Tower Shield',
    params: { item_name: 'tall siege tower shield with battered plates, fantasy shield icon' },
  },
  {
    id: 'item_null_visor',
    profile: 'item_icon',
    label: 'Null Visor',
    params: { item_name: 'heavy null-visor helm with blank faceplate, fantasy helmet icon' },
  },
  {
    id: 'item_citadel_cuirass',
    profile: 'item_icon',
    label: 'Citadel Cuirass',
    params: { item_name: 'citadel plate cuirass with singularity crest, fantasy armor icon' },
  },
  {
    id: 'item_fringe_treads',
    profile: 'item_icon',
    label: 'Fringe Treads',
    params: { item_name: 'collapse fringe light leggings with torn edges, fantasy boots icon' },
  },
  {
    id: 'item_reaver_gauntlets',
    profile: 'item_icon',
    label: 'Reaver Gauntlets',
    params: { item_name: 'spiked reaver gauntlets dark iron, fantasy gauntlets icon' },
  },
  {
    id: 'item_rift_veil',
    profile: 'item_icon',
    label: 'Rift Veil',
    params: { item_name: 'rift veil cloak swirling with violet mist, fantasy cloak icon' },
  },
  {
    id: 'item_godshard_quiver',
    profile: 'item_icon',
    label: 'Godshard Quiver',
    params: { item_name: 'quiver of glowing godshard arrows, fantasy quiver icon' },
  },
  {
    id: 'item_singularity_edge',
    profile: 'item_icon',
    label: 'Singularity Edge',
    params: { item_name: 'singularity edge sword bending light around blade, fantasy weapon icon' },
  },
  {
    id: 'item_idol_needle',
    profile: 'item_icon',
    label: 'Idol Needle',
    params: { item_name: 'idol needle dagger of pale divine metal, fantasy weapon icon' },
  },
  {
    id: 'item_pantheon_arc',
    profile: 'item_icon',
    label: 'Pantheon Arc',
    params: { item_name: 'pantheon arc ornate heavy bow with divine runes, fantasy bow icon' },
  },
  {
    id: 'item_aegis_of_null',
    profile: 'item_icon',
    label: 'Aegis Of Null',
    params: { item_name: 'legendary null aegis kite shield absorbing light, fantasy shield icon' },
  },
  {
    id: 'item_oracle_circlet',
    profile: 'item_icon',
    label: 'Oracle Circlet',
    params: { item_name: 'oracle circlet of floating godglass shards, fantasy helmet icon' },
  },
  {
    id: 'item_throne_plate',
    profile: 'item_icon',
    label: 'Throne Plate',
    params: { item_name: 'throne plate armor gold-black regal, fantasy armor icon' },
  },
  {
    id: 'item_ascent_strides',
    profile: 'item_icon',
    label: 'Ascent Strides',
    params: { item_name: 'ascent strides leg armor climbing motif, fantasy boots icon' },
  },
  {
    id: 'item_sovereign_grips',
    profile: 'item_icon',
    label: 'Sovereign Grips',
    params: { item_name: 'sovereign grips heavy royal gauntlets, fantasy gauntlets icon' },
  },
  {
    id: 'item_godfall_cloak',
    profile: 'item_icon',
    label: 'Godfall Cloak',
    params: { item_name: 'godfall cloak with falling star embroidery, fantasy cloak icon' },
  },
  {
    id: 'item_horizon_quiver',
    profile: 'item_icon',
    label: 'Horizon Quiver',
    params: { item_name: 'horizon quiver of endless arrows silhouette, fantasy quiver icon' },
  },
  {
    id: 'item_worldscar_blade',
    profile: 'item_icon',
    label: 'Worldscar Blade',
    params: { item_name: 'holy worldscar blade radiant crack through steel, fantasy weapon icon' },
  },
  {
    id: 'item_whisper_of_nix',
    profile: 'item_icon',
    label: 'Whisper Of Nix',
    params: { item_name: 'holy whisper of nix ethereal twin-edge dagger, fantasy weapon icon' },
  },
  {
    id: 'item_era_skybow',
    profile: 'item_icon',
    label: 'Era Skybow',
    params: { item_name: 'holy era skybow of celestial wood shooting starlight, fantasy bow icon' },
  },
  {
    id: 'item_bastion_of_eras',
    profile: 'item_icon',
    label: 'Bastion Of Eras',
    params: { item_name: 'holy bastion of eras towering shield with age layers, fantasy shield icon' },
  },
  {
    id: 'item_crown_of_collapse',
    profile: 'item_icon',
    label: 'Crown Of Collapse',
    params: { item_name: 'holy crown of collapse jagged regal helm, fantasy helmet icon' },
  },
  {
    id: 'item_mail_of_the_rift',
    profile: 'item_icon',
    label: 'Mail Of The Rift',
    params: { item_name: 'holy mail of the rift light armor with rift seams, fantasy armor icon' },
  },
  {
    id: 'item_greaves_of_ascent',
    profile: 'item_icon',
    label: 'Greaves Of Ascent',
    params: { item_name: 'holy greaves of ascent climbing plate legs, fantasy boots icon' },
  },
  {
    id: 'item_gauntlets_of_judgment',
    profile: 'item_icon',
    label: 'Gauntlets Of Judgment',
    params: { item_name: 'holy gauntlets of judgment glowing scales motif, fantasy gauntlets icon' },
  },
  {
    id: 'item_mantle_beyond',
    profile: 'item_icon',
    label: 'Mantle Beyond',
    params: { item_name: 'holy mantle beyond horizon starfield cloak, fantasy cloak icon' },
  },
  {
    id: 'item_quiver_of_godfall',
    profile: 'item_icon',
    label: 'Quiver Of Godfall',
    params: { item_name: 'holy quiver of godfall arrows tipped with light, fantasy quiver icon' },
  },
  {
    id: 'item_chaos_halberd',
    profile: 'item_icon',
    label: 'Chaos Halberd',
    params: { item_name: 'chaos halberd twisted polearm with swirling runes, fantasy weapon icon' },
  },
  {
    id: 'item_mirror_wand_blade',
    profile: 'item_icon',
    label: 'Mirror Wand Blade',
    params: { item_name: 'mirror wand-blade hybrid mystic weapon reflecting light, fantasy weapon icon' },
  },
  {
    id: 'item_scar_handaxe',
    profile: 'item_icon',
    label: 'Scar Handaxe',
    params: { item_name: 'scarred handaxe with void-black edge, fantasy weapon icon' },
  },
  {
    id: 'item_leviathan_scale_cloak',
    profile: 'item_icon',
    label: 'Leviathan Scale Cloak',
    params: { item_name: 'leviathan scale cloak heavy dark blue scales, fantasy cloak icon' },
  },
  {
    id: 'item_pulse_ringmail',
    profile: 'item_icon',
    label: 'Pulse Ringmail',
    params: { item_name: 'pulse ringmail light armor with glowing circuits, fantasy armor icon' },
  },
  {
    id: 'item_remnants_of_fallen_glory',
    profile: 'item_icon',
    label: 'Ошметки былого величия',
    params: { item_name: 'tattered dark fantasy trousers, ethereal glowing cracks, swirling void particles, shadows and silver threads, dark fantasy aesthetic, isolated on black background' },
  },
  {
    id: 'item_shard_of_primordial_era',
    profile: 'item_icon',
    label: 'Осколок Изначальной Эры',
    params: { item_name: 'massive jagged obsidian blade with glowing purple cracks, swirling cosmic energy, dark fantasy aesthetic, heavy silhouette, cinematic lighting, isolated on black background' },
  },
  {
    id: 'item_eternal_shard_armor',
    profile: 'item_icon',
    label: 'Осколок Вечности',
    params: { item_name: 'dark fantasy heavy plate armor made of fractured obsidian and glowing violet cosmic energy, swirling void cracks, cinematic lighting, dramatic silhouette, hyper-detailed, dark atmosphere' },
  },
  {
    id: 'item_shattered_era_shell',
    profile: 'item_icon',
    label: 'Оболочка Расколотой Эры',
    params: { item_name: 'dark fantasy light armor, ethereal cracks glowing with void energy, obsidian plates, swirling temporal anomaly, cinematic lighting, dark background' },
  },
  {
    id: 'item_gloves_time_distortion_daedric',
    profile: 'item_icon',
    label: 'Перчатки Искаженного Времени',
    params: { item_name: 'daedric gloves made of swirling dark ether and fractured clockwork gears, ethereal glowing cracks, dark fantasy style, obsidian texture, cinematic lighting, isolated on black background' },
  },
  {
    id: 'item_holy_body_1',
    profile: 'item_icon',
    label: 'Священный Доспех 1',
    params: { item_name: 'detailed holy fantasy body item icon, dark atmosphere' },
  },

  // DOM shell chrome — ornaments / menu mood (used as CSS backgrounds)
  {
    id: 'ui_ornament_corner',
    profile: 'item_icon',
    label: 'UI corner ornament',
    params: {
      item_name:
        'ornate fantasy game UI corner filigree only, antique burnished gold L-shaped corner piece, engraved scrollwork metal, isolated on pure black background, no text, no frame border around image',
    },
  },
  {
    id: 'ui_ornament_divider',
    profile: 'item_icon',
    label: 'UI divider ornament',
    params: {
      item_name:
        'horizontal ornate fantasy gold metal flourish divider, symmetric filigree with small central gem, thin decorative bar, isolated on pure black background, game UI asset, no text',
    },
  },
  {
    id: 'ui_seal_imperial',
    profile: 'item_icon',
    label: 'Imperial UI seal',
    params: {
      item_name:
        'imperial fantasy circular seal medallion, embossed golden eagle crest, antique brass rim, wax-and-metal look, isolated on pure black background, game UI badge, no text',
    },
  },
  {
    id: 'ui_menu_atmosphere',
    profile: 'location_bg',
    label: 'Main menu atmosphere',
    params: {
      location_name:
        'dark imperial fantasy throne hall empty chamber, distant stained glass warm gold light shafts, volumetric dust motes, moody cinematic atmosphere, soft bokeh, no people, no text',
    },
  },
  // Gameplay HUD action icons
  {
    id: 'ui_action_enter',
    profile: 'item_icon',
    label: 'HUD action enter',
    params: {
      item_name:
        'minimal fantasy UI icon, doorway portal arrow entering, glowing cyan accent, centered single symbol, transparent background look, no text',
    },
  },
  {
    id: 'ui_action_auto_attack',
    profile: 'item_icon',
    label: 'HUD action auto attack',
    params: {
      item_name:
        'minimal fantasy UI icon, crossed swords combat symbol, warm steel and crimson accent, centered single symbol, no text',
    },
  },
  {
    id: 'ui_action_inventory',
    profile: 'item_icon',
    label: 'HUD action inventory',
    params: {
      item_name:
        'minimal fantasy UI icon, leather backpack bag symbol, brass buckle, centered single symbol, no text',
    },
  },
  {
    id: 'ui_action_skills',
    profile: 'item_icon',
    label: 'HUD action skills',
    params: {
      item_name:
        'minimal fantasy UI icon, arcane star glyph with subtle glow, centered single symbol, no text',
    },
  },
  {
    id: 'ui_action_travel',
    profile: 'item_icon',
    label: 'HUD action travel',
    params: {
      item_name:
        'minimal fantasy UI icon, parchment world map with route marker, centered single symbol, no text',
    },
  },
  {
    id: 'ui_action_radio',
    profile: 'item_icon',
    label: 'HUD action radio',
    params: {
      item_name:
        'minimal fantasy UI icon, field radio beacon waves antenna symbol, centered single symbol, no text',
    },
  },
  {
    id: 'ui_action_settings',
    profile: 'item_icon',
    label: 'HUD action settings',
    params: {
      item_name:
        'minimal fantasy UI icon, metal cogwheel with tiny gem center, centered single symbol, no text',
    },
  },
  {
    id: 'ui_action_mount',
    profile: 'item_icon',
    label: 'HUD action mount',
    params: {
      item_name:
        'minimal fantasy UI icon, horse head crest side profile, centered single symbol, no text',
    },
  },
  // Survival need icons for HUD chip
  {
    id: 'ui_need_ok',
    profile: 'item_icon',
    label: 'HUD need status ok',
    params: {
      item_name:
        'minimal fantasy UI icon, healthy heart emblem, centered single symbol, no text',
    },
  },
  {
    id: 'ui_need_hungry',
    profile: 'item_icon',
    label: 'HUD need hungry',
    params: {
      item_name:
        'minimal fantasy UI icon, roasted meat ration symbol, centered single symbol, no text',
    },
  },
  {
    id: 'ui_need_dehydrated',
    profile: 'item_icon',
    label: 'HUD need dehydrated',
    params: {
      item_name:
        'minimal fantasy UI icon, water drop flask symbol, centered single symbol, no text',
    },
  },
  {
    id: 'ui_need_hypothermia',
    profile: 'item_icon',
    label: 'HUD need hypothermia',
    params: {
      item_name:
        'minimal fantasy UI icon, snowflake frost crystal symbol, centered single symbol, no text',
    },
  },
  {
    id: 'ui_need_hyperthermia',
    profile: 'item_icon',
    label: 'HUD need hyperthermia',
    params: {
      item_name:
        'minimal fantasy UI icon, burning sun heat symbol, centered single symbol, no text',
    },
  },
  {
    id: 'ui_need_fatigued',
    profile: 'item_icon',
    label: 'HUD need fatigued',
    params: {
      item_name:
        'minimal fantasy UI icon, crescent moon sleep symbol, centered single symbol, no text',
    },
  },
  {
    id: 'ui_need_infection',
    profile: 'item_icon',
    label: 'HUD need infection',
    params: {
      item_name:
        'minimal fantasy UI icon, plague biohazard rune symbol, centered single symbol, no text',
    },
  },
  {
    id: 'ui_need_food_poisoning',
    profile: 'item_icon',
    label: 'HUD need food poisoning',
    params: {
      item_name:
        'minimal fantasy UI icon, toxic vial poison symbol, centered single symbol, no text',
    },
  },
  {
    id: 'ui_need_exhaustion_injury',
    profile: 'item_icon',
    label: 'HUD need exhaustion injury',
    params: {
      item_name:
        'minimal fantasy UI icon, bandage wrapped wound symbol, centered single symbol, no text',
    },
  },
  {
    id: 'ui_need_frostbite',
    profile: 'item_icon',
    label: 'HUD need frostbite',
    params: {
      item_name:
        'minimal fantasy UI icon, cracked ice hand symbol, centered single symbol, no text',
    },
  },
  {
    id: 'ui_need_heatstroke',
    profile: 'item_icon',
    label: 'HUD need heatstroke',
    params: {
      item_name:
        'minimal fantasy UI icon, flame over head heatstroke symbol, centered single symbol, no text',
    },
  },
];

/** Все статические ассеты игры для ComfyUI batch-генерации */
export const MEDIA_CATALOG: MediaAssetSpec[] = [
  ...BASE_MEDIA_CATALOG.map(spec => spec.id.startsWith('prop_hq_')
    ? {...spec, params: {...spec.params, era: 'contemporary'}} : spec),
  ...SKILL_MEDIA_CATALOG,
  ...dialoguePortraitCatalog(),
  ...citizenPortraitCatalog(),
];

export { skillAssetId } from './skill-catalog.js';

export function assetUrl(assetId: string): string {
  return `/media/assets/${assetId}.${ASSET_IMAGE_EXT}`;
}
