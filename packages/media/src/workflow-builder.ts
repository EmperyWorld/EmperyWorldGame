import type { MediaJobRequest, ServicesConfig } from '@empery/shared';
import {
  buildFluxKleinWorkflow,
  profileUsesBackgroundRemoval,
  profileUsesUpscale,
} from './flux-workflow.js';

export interface ComfyUIConfig {
  checkpoint: string;
  steps: number;
  cfg: number;
}

const EMPERY_ART_DIRECTION =
  'grounded high-fidelity dark medieval fantasy, near-realistic premium digital painting, believable historical construction and craftsmanship, physically plausible stone wood leather cloth and metal, restrained natural color palette, cinematic but realistic light, fine material texture, consistent Empery World visual identity';

const NEGATIVE_DEFAULT =
  'blurry, text, watermark, logo, low quality, deformed, multiple objects, frame, border, cropped, cartoon, anime, chibi, flat vector art, cel shading, toy, plastic, glossy 3d render, oversaturated neon colors, modern objects';

const NEGATIVE_BY_PROFILE: Partial<Record<MediaJobRequest['profile'], string>> = {
  game_sprite:
    'blurry, text, watermark, side view, portrait bust, multiple characters, duplicate, collage, UI, isometric cube, 3d render',
  tileset:
    'blurry, text, watermark, characters, people, animals, objects, items, buildings, perspective, 3d, giant slabs, huge flagstones, two stones only, checkerboard, collage',
  terrain_tile:
    'blurry, text, watermark, characters, people, animals, buildings, props, perspective, vanishing point, 3d render, giant paving slabs the size of cars, huge flagstones, only 2 or 4 stones in frame, empty plain color, collage, grid lines overlay, UI, beige sand grid, cream grout crosses',
  character_sheet:
    'text, letters, words, caption, title, watermark, logo, collage, grid, split panel, duplicate, mirrored twin, two faces, tiled, frame, border, forest scenery, anime, chibi, doll, wax skin, plastic armor, modern clothing',
  dialogue_portrait:
    'text, letters, words, caption, watermark, logo, collage, grid, split panel, duplicate, mirrored twin, two faces, tiled, frame, border, multiple characters, anime, chibi, doll, wax skin, plastic armor, full scene background',
  prop_sprite:
    'blurry, text, watermark, multiple objects, character, people, scene, landscape, frame, border, isometric, axonometric, diamond footprint, rhombus plan, 45-degree rotation, three-quarter view, oblique walls, tilted building, perspective vanishing point, tiny cottage, small shed, hut, cabin, sparse yard, miniature house, dollhouse, lonely small building in empty space, courtyard, enclosed yard, plaza, chapel inside walls, misaligned windows, crooked window rows, uneven window spacing, flat plastic textures, smooth modern walls, drywall, vinyl siding, glossy plastic beams, monochrome roof, flat unbroken roof fill, cartoonish look, low details, clean vector art, sterile CAD render, toy model, LEGO brick look, torn fabric, perforated holes, swiss cheese alpha, translucent walls',
  ship_sprite:
    'oars, oar banks, banks of oars, rowing benches, sweeps, paddles, rowboat, galley oars, canoe, kayak, crew, sailors, people, faces, water surface, ocean waves, wake, dock, pier, quay, land, castle, house, building, text, letters, words, numbers, nameplate, inscription, caption, watermark, logo, SOUTH, EAST, WEST, NORTH, collage, multiple ships, cropped hull, side-view only cutaway, photoreal studio product shot, plastic scale model, glossy 3d CGI, blender render, octane, toy, cartoon',
};

/** Доп. шаги/cfg для профилей, где нужна детализация. */
export const PROFILE_SAMPLER: Partial<
  Record<MediaJobRequest['profile'], { steps: number; cfg: number }>
> = {
  item_icon: { steps: 32, cfg: 7.5 },
  skill_icon: { steps: 32, cfg: 7.5 },
  tileset: { steps: 32, cfg: 7 },
  terrain_tile: { steps: 36, cfg: 7.5 },
  prop_sprite: { steps: 36, cfg: 7.5 },
  ship_sprite: { steps: 36, cfg: 7.5 },
  game_sprite: { steps: 32, cfg: 7 },
  character_sheet: { steps: 32, cfg: 7 },
  dialogue_portrait: { steps: 32, cfg: 7.5 },
};

export function resolveSamplerConfig(
  base: ComfyUIConfig,
  profile: MediaJobRequest['profile'],
): ComfyUIConfig {
  const override = PROFILE_SAMPLER[profile];
  return override ? { ...base, ...override } : base;
}

const PROFILE_PROMPTS: Record<
  MediaJobRequest['profile'],
  (params: Record<string, string>) => { prompt: string; width: number; height: number }
> = {
  character_sheet: (p) => {
    const race = p.race ?? 'human';
    const gender = p.gender === 'female' ? 'female' : 'male';
    const profession = (p.profession ?? 'warrior').toLowerCase();

    const raceBase: Record<string, Record<'male' | 'female', string>> = {
      human: {
        male: 'human male, short brown hair, fair skin',
        female: 'human female, shoulder-length brown hair, fair skin',
      },
      elf: {
        male: 'elf male, pointed ears, silver hair, fair skin',
        female: 'elf female, pointed ears, long silver hair, fair skin',
      },
      orc: {
        male: 'orc male, grey-green skin, short dark hair, strong jaw',
        female: 'orc female, grey-green skin, dark braided hair, strong features',
      },
    };

    const classLook: Record<string, string> = {
      warrior: 'warrior class, steel plate armor, sword hilt visible, martial confident stance',
      rogue: 'rogue class, dark leather armor, hooded cloak, subtle dagger, cunning look',
      mystic: 'mystic class, arcane robes, soft magical glow, staff or crystal focus',
      archer: 'archer class, light leather armor, quiver strap, bow over shoulder',
    };

    const base = raceBase[race]?.[gender] ?? raceBase.human![gender];
    const clazz = classLook[profession] ?? classLook.warrior!;
    return {
      prompt: `${EMPERY_ART_DIRECTION}, single character portrait only, one face centered, ${base}, ${clazz}, anatomically natural face and hands, authentic worn materials, bust shot from chest up, looking at camera, dark neutral gradient backdrop, cinematic portrait lighting, not a collage, not a grid, not duplicated, no text`,
      width: 512,
      height: 512,
    };
  },
  portrait_npc: (p) => ({
    prompt: `${EMPERY_ART_DIRECTION}, single NPC portrait, ${p.npc_name ?? 'villager'}, ${p.mood ?? 'calm'}, ${p.race ?? 'human'}, anatomically natural face, authentic worn clothing, bust shot centered, dark neutral gradient backdrop, no text, no collage`,
    width: 512,
    height: 512,
  }),
  dialogue_portrait: (p) => ({
    prompt: [
      p.visual_style === 'photographic'
        ? 'real professional DSLR photograph, photorealistic contemporary corporate portrait, natural skin texture, realistic facial proportions, subtle imperfections, soft daylight, 50mm lens'
        : `${EMPERY_ART_DIRECTION}, masterpiece character portrait`,
      `single character only, ${p.npc_look ?? p.npc_name ?? 'fantasy NPC'}`,
      p.mood ?? 'calm expressive face',
      p.visual_style === 'photographic' ? 'real human person' : `${p.race ?? 'human'} fantasy RPG`,
      p.visual_style === 'photographic'
        ? 'anatomically natural face and hands, contemporary professional office clothing'
        : 'anatomically natural face and hands, authentic worn clothing and equipment',
      'half-body to three-quarter view, facing viewer, controlled cinematic rim light',
      p.visual_style === 'photographic'
        ? `${p.portrait_background ?? 'bright modern reception lobby in background, reception counter visible in foreground'}, person prominent, no illustration, no painting, no CGI, no text, no watermark, no collage`
        : 'soft dark neutral gradient background, character prominent, no text, no watermark, no collage, no duplicate',
    ].join(', '),
    width: 512,
    height: 768,
  }),
  item_icon: (p) => ({
    prompt: `${EMPERY_ART_DIRECTION}, museum-quality fantasy RPG inventory item icon, ${p.item_name ?? 'sword'}, one complete object centered, historically believable construction, visible wear and fine craftsmanship, three-quarter product view, subtle rim light, dark neutral gradient vignette, square icon, no text, no watermark, tack-sharp focus`,
    width: 384,
    height: 384,
  }),
  skill_icon: (p) => ({
    prompt: `${EMPERY_ART_DIRECTION}, fantasy RPG skill ability icon, ${p.skill_name ?? 'magic spell'}, one strong centered readable symbol, physically grounded magical energy, controlled glow and particles, dark neutral gradient background, square game UI icon, no text, sharp silhouette`,
    width: 256,
    height: 256,
  }),
  location_bg: (p) => ({
    prompt: `${EMPERY_ART_DIRECTION}, masterpiece wide environmental establishing shot, ${p.location_name ?? 'forest grove'}, coherent medieval scale and architecture, lived-in details, realistic weathering, cinematic natural lighting, rich foreground midground and background, atmospheric depth, no UI, no text, no watermark`,
    width: 1024,
    height: 576,
  }),
  game_sprite: (p) => {
    const kind = p.kind ?? 'hero';
    const variant = p.variant ?? 'human';
    const base =
      `${EMPERY_ART_DIRECTION}, orthographic overhead camera looking straight down, top-down RPG sprite only, full body seen from above, head toward top of frame, plain pure black background #000000, realistic materials with a strong readable silhouette, no cast shadow, no side view, no front view, no portrait, no text`;
    if (kind === 'hero') {
      const raceDesc =
        variant === 'elf'
          ? 'elven ranger dark teal plate armor gold trim pointed ears silver hair'
          : variant === 'orc'
            ? 'orc warrior grey-green skin fur pauldrons battle axe'
            : 'human adventurer blue steel plate armor sword shield';
      return {
        prompt: `${base}, playable hero, ${raceDesc}`,
        width: 512,
        height: 512,
      };
    }
    if (kind === 'enemy') {
      const enemyDesc: Record<string, string> = {
        goblin: 'small green goblin scout dagger hunched',
        shadow: 'hooded shadow rogue purple cloak dagger',
        wolf: 'grey wolf beast four legs tail',
        cinder: 'small red fire imp demon wings',
        bone: 'skeleton undead warrior bones',
        orc_grunt: 'large orc warrior tribal axe',
      };
      const desc = enemyDesc[variant] ?? 'goblin scout';
      return {
        prompt: `${base}, hostile enemy monster, ${desc}`,
        width: 512,
        height: 512,
      };
    }
    const npcDesc: Record<string, string> = {
      elder_mira: 'wise elderly human village elder brown robes wooden staff',
      silvan_hermit: 'elven druid hermit green robes silver hair',
      ash_shaman: 'orc shaman tribal paint bone necklace',
      town_merchant: 'human merchant apron coin pouch friendly',
      town_innkeeper: 'human innkeeper apron welcoming pose',
      town_innkeeper_day: 'human male tavern barkeep rolled sleeves mug friendly day shift',
      town_captain: 'human town guard captain armor sword cape',
    };
    const desc = npcDesc[variant] ?? 'fantasy NPC villager';
    return {
      prompt: `${base}, friendly NPC, ${desc}`,
      width: 512,
      height: 512,
    };
  },
  tileset: (p) => ({
    prompt: `${EMPERY_ART_DIRECTION}, top-down RPG terrain tileset as a clean 2x2 grid in one square image, four seamless tileable realistic hand-painted ground textures with fine grain and consistent lighting: top-left ${p.grass ?? 'green grass meadow'} with dozens of tiny blades, top-right ${p.path ?? 'brown dirt path'} with fine gravel, bottom-left ${p.water ?? 'blue water pond ripples'} with small ripples, bottom-right ${p.wall ?? 'dense dark forest trees impassable border'}, orthographic, strong readable contrast between cells, no characters, no props, no text`,
    width: 768,
    height: 768,
  }),
  terrain_tile: (p) => ({
    prompt: `${EMPERY_ART_DIRECTION}, single seamless RPG ground texture, top-down orthographic, ${p.surface ?? 'fine cobblestone'}, realistic hand-painted material study with even diffuse lighting, approximately 12 to 16 small repeating surface elements across the width, seamless tileable edges, no characters, no buildings, no props, no sky, no perspective`,
    width: 512,
    height: 512,
  }),
  prop_sprite: (p) => ({
    prompt: [
      p.era === 'contemporary'
        ? 'premium realistic contemporary game artwork, modern architecture and industrial design, clean steel glass and polished wood, highly detailed isolated 2D map asset'
        : `${EMPERY_ART_DIRECTION}, highly detailed isolated 2D map asset`,
      p.object_view === 'top_down_furniture'
        ? 'realistic material definition, orthographic high elevated top-down game camera at 60 degrees, compact wide shallow horizontal silhouette, surface seen from above, furniture not a building, no tall facade'
        : 'realistic material definition, subtle ambient occlusion only in seams, orthographic slightly elevated front elevation',
      p.prop_name ?? 'tree',
      'front facade facing the camera when architectural, rectangular axis-aligned ground footprint, walls parallel to image edges',
      'single complete object centered, believable scale and construction, realistic weathering, crisp silhouette, plain pure black background #000000',
      'no ground plane, no text, no characters, no shadow blob, not isometric, not diamond shaped plan',
    ].join(', '),
    width: 512,
    height: 512,
  }),
  ship_sprite: (p) => ({
    prompt: [
      p.prop_name ?? 'sailing ship',
      `${EMPERY_ART_DIRECTION}, isolated hand-painted 2D RPG harbor ship sprite`,
      'complete hull masts yards and canvas, readable game-prop silhouette',
      'weathered wood tarred seams rope and metal, matte painted illustration not a photoreal 3D product render',
      'single complete ship centered, canvas sails only, sailing rig, no oars, no oar banks, no paddles',
      'no crew, no people, no water, no dock, no wake, no ground plane, unmarked blank hull, empty transom, no letters, no words, no nameplate, no text, crisp silhouette, plain pure black background #000000',
    ].join(', '),
    width: 512,
    height: 512,
  }),
};

export function negativePromptFor(profile: MediaJobRequest['profile']): string {
  return NEGATIVE_BY_PROFILE[profile] ?? NEGATIVE_DEFAULT;
}

export function buildTxt2ImgWorkflow(
  cfg: ComfyUIConfig,
  input: {
    prompt: string;
    width: number;
    height: number;
    seed: number;
    filenamePrefix: string;
    negative?: string;
  },
): Record<string, unknown> {
  return {
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed: input.seed,
        steps: cfg.steps,
        cfg: cfg.cfg,
        sampler_name: 'euler',
        scheduler: 'normal',
        denoise: 1,
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
      },
    },
    '4': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: cfg.checkpoint },
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: { width: input.width, height: input.height, batch_size: 1 },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { text: input.prompt, clip: ['4', 1] },
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: { text: input.negative ?? NEGATIVE_DEFAULT, clip: ['4', 1] },
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: { samples: ['3', 0], vae: ['4', 2] },
    },
    '9': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: input.filenamePrefix, images: ['8', 0] },
    },
  };
}

export function profileToGeneration(
  request: MediaJobRequest,
  jobId: string,
): { prompt: string; width: number; height: number; seed: number; filenamePrefix: string } {
  const builder = PROFILE_PROMPTS[request.profile];
  const spec = builder(request.params);
  const styleBias = request.params.style_bias?.trim();
  const prompt = styleBias
    ? `${spec.prompt}, additional creative emphasis: ${styleBias}`
    : spec.prompt;
  let seed = 42;
  if (request.params.seed) seed = Number.parseInt(request.params.seed, 10);
  else {
    const idPart = [...jobId].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const promptPart = [...prompt].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    seed = (idPart * 997 + promptPart) % 2_000_000_000;
  }

  return {
    ...spec,
    prompt,
    seed,
    filenamePrefix: `empery_${request.profile}_${jobId.slice(0, 8)}`,
  };
}

export function buildWorkflowForJob(
  cfg: ServicesConfig['comfyui'],
  request: MediaJobRequest,
  jobId: string,
): Record<string, unknown> {
  const gen = profileToGeneration(request, jobId);

  // Flux Klein 4B distilled collapses terrain into noise/grids — use SD1.5 txt2img.
  const terrainLike = request.profile === 'terrain_tile' || request.profile === 'tileset';
  if (terrainLike) {
    const sampler = resolveSamplerConfig(
      { checkpoint: cfg.checkpoint, steps: cfg.steps, cfg: cfg.cfg },
      request.profile,
    );
    return buildTxt2ImgWorkflow(sampler, {
      ...gen,
      negative: negativePromptFor(request.profile),
    });
  }

  if (cfg.backend === 'flux2_klein') {
    const portraitLike =
      request.profile === 'character_sheet' ||
      request.profile === 'portrait_npc' ||
      request.profile === 'dialogue_portrait';
    // Measured: this Klein checkpoint is distilled for ~4-step guidance-
    // embedded sampling. Forcing real CFG (distilled:false, cfg>1) on
    // prop_sprite produces noisy/incoherent facades — the model isn't
    // trained for that regime, so the negative prompt isn't worth the
    // quality loss here (unlike character portraits, which do tolerate it).
    // Keep prop_sprite distilled; just allow a few extra steps for detail
    // and rely on the post-hoc 4x-UltraSharp upscale pass for crispness.
    const flux = portraitLike
      ? { ...cfg.flux, steps: 20, cfg: 2.5, distilled: false }
      : request.profile === 'ship_sprite'
        ? { ...cfg.flux, steps: 12 }
        : request.profile === 'prop_sprite'
        ? { ...cfg.flux, steps: 10 }
        : { ...cfg.flux, steps: 8 };
    return buildFluxKleinWorkflow({
      ...gen,
      negative: negativePromptFor(request.profile),
      flux,
      removeBackground: profileUsesBackgroundRemoval(request.profile),
      upscaleModel: profileUsesUpscale(request.profile) ? cfg.upscaleModel : undefined,
    });
  }

  return buildTxt2ImgWorkflow(
    {
      checkpoint: cfg.checkpoint,
      steps: cfg.steps,
      cfg: cfg.cfg,
    },
    {
      ...gen,
      negative: negativePromptFor(request.profile),
    },
  );
}
