import type { MediaJobRequest } from '@empery/shared';

export interface FluxModelConfig {
  unet: string;
  clip: string;
  vae: string;
  distilled?: boolean;
  steps?: number;
  cfg?: number;
}

export interface FluxWorkflowInput {
  prompt: string;
  width: number;
  height: number;
  seed: number;
  filenamePrefix: string;
  negative?: string;
  flux: FluxModelConfig;
  removeBackground?: boolean;
  upscaleModel?: string;
}

/**
 * BiRefNet + SaveImageWithAlpha currently blackens RGB (mask polarity bug).
 * Prefer solid black bg in prompts + luminance cut in postprocess.
 */
const BG_REMOVAL_PROFILES = new Set<MediaJobRequest['profile']>([]);
/** Upscale helps icons but 4× makes UI assets huge — we downscale after. */
const UPSCALE_PROFILES = new Set<MediaJobRequest['profile']>([
  'item_icon',
  'skill_icon',
  'portrait_npc',
  'dialogue_portrait',
  'prop_sprite',
  'ship_sprite',
]);

export function profileUsesBackgroundRemoval(profile: MediaJobRequest['profile']): boolean {
  return BG_REMOVAL_PROFILES.has(profile);
}

export function profileUsesUpscale(profile: MediaJobRequest['profile']): boolean {
  return UPSCALE_PROFILES.has(profile);
}

/** Flux.2 Klein txt2img (matches ComfyUI 0.28 template). */
export function buildFluxKleinWorkflow(input: FluxWorkflowInput): Record<string, unknown> {
  const distilled = input.flux.distilled ?? true;
  const steps = input.flux.steps ?? (distilled ? 4 : 20);
  const cfg = input.flux.cfg ?? (distilled ? 1 : 5);
  const { width, height } = input;

  const nodes: Record<string, unknown> = {
    '10': {
      class_type: 'UNETLoader',
      inputs: { unet_name: input.flux.unet, weight_dtype: 'default' },
    },
    '11': {
      class_type: 'CLIPLoader',
      inputs: { clip_name: input.flux.clip, type: 'flux2', device: 'default' },
    },
    '12': {
      class_type: 'VAELoader',
      inputs: { vae_name: input.flux.vae },
    },
    '20': {
      class_type: 'CLIPTextEncode',
      inputs: { text: input.prompt, clip: ['11', 0] },
    },
    '30': {
      class_type: 'RandomNoise',
      inputs: { noise_seed: input.seed, control_after_generate: 'fixed' },
    },
    '31': {
      class_type: 'KSamplerSelect',
      inputs: { sampler_name: 'euler' },
    },
    '33': {
      class_type: 'Flux2Scheduler',
      inputs: { steps, width, height },
    },
    '34': {
      class_type: 'EmptyFlux2LatentImage',
      inputs: { width, height, batch_size: 1 },
    },
    '35': {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise: ['30', 0],
        guider: ['32', 0],
        sampler: ['31', 0],
        sigmas: ['33', 0],
        latent_image: ['34', 0],
      },
    },
    '40': {
      class_type: 'VAEDecode',
      inputs: { samples: ['35', 0], vae: ['12', 0] },
    },
  };

  if (distilled) {
    nodes['21'] = {
      class_type: 'ConditioningZeroOut',
      inputs: { conditioning: ['20', 0] },
    };
    nodes['32'] = {
      class_type: 'CFGGuider',
      inputs: { model: ['10', 0], positive: ['20', 0], negative: ['21', 0], cfg: 1 },
    };
  } else {
    nodes['22'] = {
      class_type: 'CLIPTextEncode',
      inputs: { text: input.negative ?? '', clip: ['11', 0] },
    };
    nodes['32'] = {
      class_type: 'CFGGuider',
      inputs: { model: ['10', 0], positive: ['20', 0], negative: ['22', 0], cfg },
    };
  }

  let imageRef: [string, number] = ['40', 0];

  if (input.upscaleModel) {
    nodes['41'] = {
      class_type: 'UpscaleModelLoader',
      inputs: { model_name: input.upscaleModel },
    };
    nodes['42'] = {
      class_type: 'ImageUpscaleWithModel',
      inputs: { upscale_model: ['41', 0], image: imageRef },
    };
    imageRef = ['42', 0];
  }

  if (input.removeBackground) {
    nodes['51'] = {
      class_type: 'LoadBackgroundRemovalModel',
      inputs: { bg_removal_name: 'birefnet.safetensors' },
    };
    nodes['52'] = {
      class_type: 'RemoveBackground',
      inputs: { bg_removal_model: ['51', 0], image: imageRef },
    };
    nodes['99'] = {
      class_type: 'SaveImageWithAlpha',
      inputs: {
        images: imageRef,
        mask: ['52', 0],
        filename_prefix: input.filenamePrefix,
      },
    };
  } else {
    nodes['99'] = {
      class_type: 'SaveImage',
      inputs: { filename_prefix: input.filenamePrefix, images: imageRef },
    };
  }

  return nodes;
}
