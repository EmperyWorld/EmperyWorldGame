#!/usr/bin/env tsx
/**
 * Генератор предметов EmperyWorldGame.
 *
 * Статы — только из жёстких бюджетов (не из LLM).
 * LLM (config llama.chat, напр. 192.168.1.111:8080) — имя, описание, icon prompt.
 *
 * Usage:
 *   pnpm generate:items -- --count=10
 *   pnpm generate:items -- --count=5 --rarity=epic --slot=weapon
 *   pnpm generate:items -- --count=8 --theme="аномалия / разлом"
 *   pnpm generate:items -- --count=3 --no-llm --dry-run
 *   pnpm generate:items -- --count=5 --no-media
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  BOW_RANGE,
  assertSaneStats,
  clampStats,
  mulberry32,
  rollArmorStats,
  rollQuiverStats,
  rollShieldStats,
  rollWeaponStats,
  slugifyId,
  type ItemRarity,
  type ItemSlot,
} from '@empery/shared';
import { loadServicesConfig } from '@empery/shared/config';
import { LlamaStack } from '@empery/llm';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function argValue(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const COUNT = Math.max(1, Math.min(50, Number(argValue('count') ?? '5') || 5));
const RARITY = (argValue('rarity') ?? 'auto') as ItemRarity | 'auto';
const SLOT = (argValue('slot') ?? 'auto') as ItemSlot | 'auto';
const THEME = argValue('theme') ?? 'аномалия Empery, разлом, эры, тёмный фэнтези';
const OUT_FILE = argValue('out') ?? 'content/items/generated.yaml';
const DROP_ONLY = hasFlag('drop-only') || !hasFlag('shop-ok');
const NO_LLM = hasFlag('no-llm');
const DRY = hasFlag('dry-run');
/** Иконки через ComfyUI по умолчанию; отключить: --no-media */
const WANT_MEDIA = !hasFlag('no-media') && !DRY;
const SEED = Number(argValue('seed') ?? Date.now() % 1_000_000_000);

const RARITIES: ItemRarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
  'holy',
  'daedric',
];
const SLOTS: ItemSlot[] = [
  'weapon',
  'shield',
  'quiver',
  'head',
  'body',
  'legs',
  'gloves',
  'cloak',
];

interface GeneratedItem {
  id: string;
  name: string;
  description?: string;
  slot: ItemSlot;
  rarity: ItemRarity;
  stats: Record<string, number>;
  icon: string;
  weaponWeight?: 'light' | 'normal' | 'heavy';
  weaponKind?: 'melee' | 'bow';
  attackRange?: number;
  armorType?: 'light' | 'heavy';
  iconPrompt: string;
}

function loadExistingIds(): Set<string> {
  const dir = join(rootDir, 'content/items');
  const ids = new Set<string>();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.yaml')) continue;
    const text = readFileSync(join(dir, name), 'utf8');
    for (const m of text.matchAll(/^id:\s*([a-zA-Z][a-zA-Z0-9_]*)/gm)) {
      ids.add(m[1]!);
    }
  }
  return ids;
}

function pickRarity(rng: () => number): ItemRarity {
  if (RARITY !== 'auto' && RARITIES.includes(RARITY)) return RARITY;
  const weights: Array<[ItemRarity, number]> = [
    ['common', 8],
    ['uncommon', 14],
    ['rare', 22],
    ['epic', 24],
    ['legendary', 16],
    ['holy', 10],
    ['daedric', 6],
  ];
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [rar, w] of weights) {
    r -= w;
    if (r <= 0) return rar;
  }
  return 'rare';
}

function pickSlot(rng: () => number): ItemSlot {
  if (SLOT !== 'auto' && SLOTS.includes(SLOT)) return SLOT;
  const weights: Array<[ItemSlot, number]> = [
    ['weapon', 28],
    ['body', 14],
    ['cloak', 12],
    ['head', 10],
    ['legs', 10],
    ['gloves', 10],
    ['shield', 8],
    ['quiver', 8],
  ];
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [slot, w] of weights) {
    r -= w;
    if (r <= 0) return slot;
  }
  return 'weapon';
}

function buildSkeleton(
  rng: () => number,
  rarity: ItemRarity,
  slot: ItemSlot,
): Omit<GeneratedItem, 'id' | 'name' | 'description' | 'icon' | 'iconPrompt'> & {
  iconPromptHint: string;
} {
  if (slot === 'weapon') {
    const bow = rng() < 0.28;
    const weightRoll = rng();
    const weaponWeight: 'light' | 'normal' | 'heavy' = bow
      ? weightRoll < 0.55
        ? 'light'
        : weightRoll < 0.85
          ? 'normal'
          : 'heavy'
      : weightRoll < 0.4
        ? 'light'
        : weightRoll < 0.75
          ? 'normal'
          : 'heavy';
    const stats = rollWeaponStats(rarity, bow ? 'bow' : 'melee', weaponWeight, rng);
    assertSaneStats(stats);
    const [rlo, rhi] = BOW_RANGE[rarity];
    return {
      slot,
      rarity,
      stats,
      weaponWeight,
      weaponKind: bow ? 'bow' : 'melee',
      attackRange: bow ? Math.round(rlo + rng() * (rhi - rlo)) : undefined,
      iconPromptHint: bow
        ? `${rarity} fantasy bow weapon icon`
        : `${rarity} fantasy ${weaponWeight} ${weaponWeight === 'light' ? 'dagger' : 'sword'} weapon icon`,
    };
  }

  if (slot === 'shield') {
    const stats = rollShieldStats(rarity, rng);
    assertSaneStats(stats);
    return {
      slot,
      rarity,
      stats,
      iconPromptHint: `${rarity} fantasy kite shield icon`,
    };
  }

  if (slot === 'quiver') {
    const stats = rollQuiverStats(rarity, rng);
    assertSaneStats(stats);
    return {
      slot,
      rarity,
      stats,
      iconPromptHint: `${rarity} fantasy arrow quiver icon`,
    };
  }

  const armorType: 'light' | 'heavy' =
    slot === 'cloak' ? 'light' : rng() < (slot === 'body' ? 0.45 : 0.55) ? 'light' : 'heavy';
  const stats = rollArmorStats(slot, rarity, armorType, rng);
  assertSaneStats(stats);
  return {
    slot,
    rarity,
    stats,
    armorType,
    iconPromptHint: `${rarity} fantasy ${armorType} ${slot} armor icon`,
  };
}

function fallbackFlavor(
  slot: ItemSlot,
  rarity: ItemRarity,
  index: number,
): { name: string; description: string; idHint: string; iconPrompt: string } {
  const labels: Record<ItemSlot, string> = {
    weapon: 'Клинок',
    shield: 'Щит',
    quiver: 'Колчан',
    head: 'Шлем',
    body: 'Доспех',
    legs: 'Поножи',
    gloves: 'Перчатки',
    cloak: 'Плащ',
  };
  const tag =
    rarity === 'holy' ? 'Священный' : rarity === 'daedric' ? 'Даэдрический' : 'Аномальный';
  const name = `${tag} ${labels[slot]} ${index + 1}`;
  return {
    name,
    description: `${labels[slot]} редкости ${rarity}, найденный в разломе.`,
    idHint: `${rarity}_${slot}_${index + 1}`,
    iconPrompt: `detailed ${rarity} fantasy ${slot} item icon, dark atmosphere`,
  };
}

async function llmFlavor(
  llm: LlamaStack,
  skel: ReturnType<typeof buildSkeleton>,
  index: number,
): Promise<{ name: string; description: string; idHint: string; iconPrompt: string }> {
  const system = `Ты геймдизайнер ARPG EmperyWorldGame (русский UI, тон тёмного фэнтези / аномалии).
Верни ТОЛЬКО один JSON-объект без markdown:
{"name":"русское название 2-5 слов","description":"1 короткое предложение по-русски","id_hint":"snake_case_english_id","icon_prompt":"english visual prompt for item icon, materials and silhouette, no text"}
Запрещено: цифры урона, статы, числа вроде 65535, англ. в name/description.`;

  const user = `Сделай уникальный предмет #${index + 1}.
Тема: ${THEME}
Слот: ${skel.slot}
Редкость: ${skel.rarity}
Тип: ${skel.weaponKind ?? skel.armorType ?? 'gear'}
Вес оружия: ${skel.weaponWeight ?? 'n/a'}
Статы уже заданы движком (не упоминай числа): ${JSON.stringify(Object.keys(skel.stats))}`;

  const raw = await llm.chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    280,
  );

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('LLM: no JSON');
  const parsed = JSON.parse(jsonMatch[0]) as {
    name?: string;
    description?: string;
    id_hint?: string;
    icon_prompt?: string;
  };

  const name = (parsed.name ?? '').trim().slice(0, 48);
  const description = (parsed.description ?? '').trim().slice(0, 160);
  const idHint = slugifyId(parsed.id_hint ?? name);
  const iconPrompt = (parsed.icon_prompt ?? skel.iconPromptHint).trim().slice(0, 220);

  if (!name || /65535|\d{4,}/.test(name)) throw new Error('LLM: bad name');
  if (!idHint) throw new Error('LLM: bad id');

  return {
    name,
    description: description || fallbackFlavor(skel.slot, skel.rarity, index).description,
    idHint,
    iconPrompt: iconPrompt || skel.iconPromptHint,
  };
}

function uniqueId(base: string, used: Set<string>): string {
  let id = slugifyId(base);
  if (!used.has(id)) return id;
  for (let n = 2; n < 1000; n++) {
    const cand = `${id}_${n}`;
    if (!used.has(cand)) return cand;
  }
  return `${id}_${Date.now().toString(36)}`;
}

function toYaml(item: GeneratedItem): string {
  const lines = [
    '---',
    `id: ${item.id}`,
    `name: ${item.name}`,
    `slot: ${item.slot}`,
    `rarity: ${item.rarity}`,
  ];
  if (item.description) {
    lines.push(`description: ${JSON.stringify(item.description)}`);
  }
  if (item.weaponKind) lines.push(`weaponKind: ${item.weaponKind}`);
  if (item.weaponWeight) lines.push(`weaponWeight: ${item.weaponWeight}`);
  if (item.attackRange) lines.push(`attackRange: ${item.attackRange}`);
  if (item.armorType) lines.push(`armorType: ${item.armorType}`);
  lines.push('stats:');
  for (const [k, v] of Object.entries(item.stats)) {
    lines.push(`  ${k}: ${v}`);
  }
  lines.push(`icon: ${item.icon}`);
  return `${lines.join('\n')}\n`;
}

function appendCatalogEntries(items: GeneratedItem[]): void {
  const catalogPath = join(rootDir, 'packages/media/src/catalog.ts');
  let text = readFileSync(catalogPath, 'utf8');
  const entries: string[] = [];
  for (const item of items) {
    if (text.includes(`id: 'item_${item.id}'`)) continue;
    const prompt = item.iconPrompt.replace(/'/g, "\\'");
    const label = item.name.replace(/'/g, "\\'");
    entries.push(
      `  {\n    id: 'item_${item.id}',\n    profile: 'item_icon',\n    label: '${label}',\n    params: { item_name: '${prompt}' },\n  },`,
    );
  }
  if (!entries.length) return;
  const marker = '];\n\n/** Все статические ассеты';
  const idx = text.indexOf(marker);
  if (idx < 0) throw new Error('catalog marker not found');
  text = `${text.slice(0, idx)}${entries.join('\n')}\n${text.slice(idx)}`;
  writeFileSync(catalogPath, text);
  console.log(`+ ${entries.length} записей в MEDIA_CATALOG`);
}

async function main(): Promise<void> {
  const used = loadExistingIds();
  const rng = mulberry32(SEED);
  const config = loadServicesConfig();
  const llm = new LlamaStack(config.llama);

  let llmOk = false;
  if (!NO_LLM) {
    const health = await llm.healthCheck();
    const chat = health.find((h) => h.service === 'llama-chat');
    if (!chat?.ok) {
      console.warn('LLM chat недоступен — fallback имена. Detail:', chat?.detail);
    } else {
      llmOk = true;
      console.log(`LLM OK (${chat.latencyMs}ms) @ ${config.llama.chat.url}`);
    }
  }

  console.log(
    `Генерируем ${COUNT} предметов (seed=${SEED}, theme="${THEME}", dropOnly=${DROP_ONLY})`,
  );

  const generated: GeneratedItem[] = [];

  for (let i = 0; i < COUNT; i++) {
    const rarity = pickRarity(rng);
    const slot = pickSlot(rng);
    const skel = buildSkeleton(rng, rarity, slot);

    let flavor = fallbackFlavor(slot, rarity, i);
    if (!NO_LLM && llmOk) {
      try {
        flavor = await llmFlavor(llm, skel, i);
      } catch (err) {
        console.warn(`  [llm fail #${i + 1}]`, err instanceof Error ? err.message : err);
      }
    }

    const id = uniqueId(flavor.idHint, used);
    used.add(id);

    const stats = clampStats(skel.stats);
    assertSaneStats(stats);

    const item: GeneratedItem = {
      id,
      name: flavor.name,
      description: flavor.description,
      slot: skel.slot,
      rarity: skel.rarity,
      stats,
      icon: `/media/assets/item_${id}.webp`,
      weaponWeight: skel.weaponWeight,
      weaponKind: skel.weaponKind,
      attackRange: skel.attackRange,
      armorType: skel.armorType,
      iconPrompt: flavor.iconPrompt || skel.iconPromptHint,
    };
    generated.push(item);
    console.log(
      `  ✓ ${item.id}  [${item.rarity}/${item.slot}]  ${item.name}  pAtk=${item.stats.pAtk ?? '-'} pDef=${item.stats.pDef ?? '-'}`,
    );
  }

  if (DRY) {
    console.log('\n--dry-run: файлы не пишем');
    console.log(generated.map((g) => toYaml(g)).join('\n'));
    return;
  }

  const outPath = join(rootDir, OUT_FILE);
  mkdirSync(dirname(outPath), { recursive: true });
  const header =
    existsSync(outPath) && readFileSync(outPath, 'utf8').trim().length > 0
      ? ''
      : `# Auto-generated items — ${DROP_ONLY ? 'DROP-ONLY: не добавлять в shops' : 'можно в shop вручную'}\n# seed=${SEED} theme=${JSON.stringify(THEME)}\n\n`;

  appendFileSync(outPath, header + generated.map((g) => toYaml(g)).join('\n'));
  console.log(`\nЗаписано → ${OUT_FILE}`);

  appendCatalogEntries(generated);

  if (WANT_MEDIA) {
    console.log('\n→ generate:media для новых item_* …');
    spawnSync('pnpm', ['--filter', '@empery/media', 'build'], {
      cwd: rootDir,
      stdio: 'inherit',
    });
    for (const item of generated) {
      const r = spawnSync('pnpm', ['generate:media', '--', `--only=item_${item.id}`], {
        cwd: rootDir,
        stdio: 'inherit',
      });
      if (r.status !== 0) console.warn(`media fail for ${item.id}`);
    }
  } else if (!DRY) {
    console.log(`\nИконки пропущены (--no-media). Позже: pnpm generate:media -- --only=item_<id>`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
