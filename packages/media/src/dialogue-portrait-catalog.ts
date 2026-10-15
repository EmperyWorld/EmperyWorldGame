import { EMPERY_FOUNDERS } from '@empery/shared';
import type { MediaAssetSpec } from './catalog.js';

const NPC_LOOK: Record<string, { name: string; race: string; look: string }> = {
  elder_mira: {
    name: 'Elder Mira',
    race: 'human',
    look: 'wise elderly human village elder, silver hair, brown robes, wooden staff',
  },
  silvan_hermit: {
    name: 'Silvan Hermit',
    race: 'elf',
    look: 'elven forest druid hermit, silver hair, pointed ears, green robes, moss accents',
  },
  ash_shaman: {
    name: 'Ash Shaman',
    race: 'orc',
    look: 'orc tribal shaman, grey-green skin, bone necklace, ash face paint, fur cloak',
  },
  town_merchant: {
    name: 'Merchant Loren',
    race: 'human',
    look: 'friendly human merchant, apron, coin pouch, rolled sleeves, market trader',
  },
  town_innkeeper: {
    name: 'Innkeeper Marta',
    race: 'human',
    look: 'warm human innkeeper woman, apron, tavern keeper, welcoming night-shift smile',
  },
  town_innkeeper_day: {
    name: 'Innkeeper Oleg',
    race: 'human',
    look: 'sturdy human tavern keeper man, rolled sleeves, mug in hand, friendly day-shift barkeep',
  },
  town_captain: {
    name: 'Captain Garrett',
    race: 'human',
    look: 'human town guard captain, steel armor, cape, sword at hip, authoritative',
  },
  town_blacksmith: {
    name: 'Blacksmith Harold',
    race: 'human',
    look: 'muscular human blacksmith, leather apron, soot on arms, hammer at belt',
  },
  town_radio: {
    name: 'Radio Tech Ren',
    race: 'human',
    look: 'lean human radio technician, headset, field radio pack, utility vest, short dark hair',
  },
  town_stable: {
    name: 'Stablemaster Boris',
    race: 'human',
    look: 'sturdy human stablemaster, weathered face, leather vest, straw in beard, horse brush at belt',
  },
  rift_scout: {
    name: 'Scout Kai',
    race: 'human',
    look: 'young human signal scout, dusty cloak, earpiece, binoculars, cautious city explorer',
  },
  rift_guide: {
    name: 'Guide Lyra',
    race: 'elf',
    look: 'elven rift guide woman, silver-white hair, pointed ears, travel cloak, glowing map crystal',
  },
  collapse_seer: {
    name: 'Seer Era',
    race: 'elf',
    look: 'elven collapse seer, pale eyes, veiled hood, fractured crystal jewelry, ominous calm',
  },
  gods_oracle: {
    name: 'Oracle Nyx',
    race: 'elf',
    look: 'elven divine oracle, dark hair with star-silver streaks, ritual tattoos, ethereal robes',
  },
  town_priest: {
    name: 'Father Cassius',
    race: 'human',
    look: 'middle-aged human priest, balding with grey temples, white and gold vestments, wooden holy symbol, kind eyes',
  },
  town_scribe: {
    name: 'Scribe Irina',
    race: 'human',
    look: 'young human woman scribe, ink-stained fingers, spectacles, brown archive robes, scroll case at belt',
  },
  town_guard: {
    name: 'Guard Leon',
    race: 'human',
    look: 'human city gate guard, steel helm under arm, chainmail, spear, disciplined young soldier face',
  },
  town_fisher: {
    name: 'Fisher Ulf',
    race: 'human',
    look: 'weathered human fisherman, salt-streaked beard, oilskin coat, net scar on cheek, sea-worn smile',
  },
  town_dockhand: {
    name: 'Dockhand Petr',
    race: 'human',
    look: 'strong human dock worker, rolled sleeves, rope-calloused hands, canvas vest, harbor sunburn',
  },
  town_bathkeeper: {
    name: 'Bathkeeper Nika',
    race: 'human',
    look: 'human bathhouse attendant woman, damp dark hair tied up, linen wrap, steam-softened warm face',
  },
  town_brewer: {
    name: 'Brewer Holm',
    race: 'human',
    look: 'stout human brewer, flour-dusted apron, barrel belly, red cheeks, wooden tasting mug',
  },
  town_miller: {
    name: 'Miller Faddey',
    race: 'human',
    look: 'elderly human miller, white flour on clothes, soft cap, kind lined face, grain sack nearby',
  },
  town_butcher: {
    name: 'Butcher Bran',
    race: 'human',
    look: 'sturdy human butcher, bloodstained apron, cleaver at belt, thick arms, market stall trader',
  },
  town_healer: {
    name: 'Healer Sera',
    race: 'human',
    look: 'gentle human healer woman, soft green robes, herb satchel, calm caring expression, silver hair streak',
  },
  town_teacher: {
    name: 'Teacher Lavr',
    race: 'human',
    look: 'middle-aged human schoolteacher man, ink-blue coat, chalk-dusted sleeves, patient scholarly face',
  },
  town_steward: {
    name: 'Steward Edmund',
    race: 'human',
    look: 'dignified human apartment steward butler, neat dark coat, silver keys on chain, composed polite face, grey temples',
  },
  town_gardener: {
    name: 'Gardener Ilya',
    race: 'human',
    look: 'weathered human community gardener, sun-browned face, linen shirt, soil-stained apron, watering can nearby',
  },
  town_informant: {
    name: 'The Informant',
    race: 'human',
    look: 'shadowy human alley informant, dark hooded cloak, sharp eyes, quiet smirk, Whispering Alley fixer',
  },
  town_hq_sentry: {
    name: 'EmperyWorld Sentry',
    race: 'human',
    look: 'corporate security sentry in dark tactical armor with cyan trim, visor helmet, spear rifle hybrid, cold professional face',
  },
  town_hq_receptionist: {
    name: 'EmperyWorld Receptionist',
    race: 'human',
    look: 'one exceptionally beautiful young adult professional fashion model aged 22 working as a receptionist, youthful delicate symmetrical face, high defined cheekbones, soft refined jawline, full natural lips, captivating bright green eyes, clear luminous youthful skin with subtle freckles, long luxurious voluminous copper-red curls, polished editorial beauty makeup, flattering soft commercial beauty lighting, radiant confident smile, tailored navy blazer over ivory blouse, small cyan lapel pin, seated behind a polished reception desk, hands naturally resting beside a tablet, welcoming professional expression, bright contemporary EmperyWorld office lobby with glass walls and indoor plants',
  },
  town_hq_researcher: {
    name: 'Dr. Vane',
    race: 'human',
    look: 'corporate chief scientist man in high-tech lab coat with cyan neon circuits, glasses, tablet, calm intellectual face, modern research lab background',
  },
  town_hq_terminal: {
    name: 'Data Terminal',
    race: 'human',
    look: 'glowing futuristic server console screen with cyan holographic interface and telemetry graphs, dark server room background',
  },
  town_notice_board: {
    name: 'Haven Notice Board',
    race: 'human',
    look: 'detailed municipal wooden bulletin board with nailed parchment notices, guild bounty scrolls with red wax seals, town square background',
  },
  stage_bard: {
    name: 'Bard Kai',
    race: 'human',
    look: 'charismatic human traveling bard minstrel man, stylish feathered beret, embroidered scarlet doublet, wooden acoustic lute, open-air stone amphitheatre background',
  },
  apartment_fridge: {
    name: 'Apartment Icebox',
    race: 'human',
    look: 'rustic wooden icebox refrigerator with iron latches and a frost-lined door, modest tenement kitchen pantry, no people, no text',
  },
  apartment_chest: {
    name: 'Apartment Chest',
    race: 'human',
    look: 'large iron-bound oak travel chest, linen packs and leather satchels inside, modest tenement room, no people, no text',
  },
  apartment_bed: {
    name: 'Apartment Bed',
    race: 'human',
    look: 'simple wooden single bed with folded linen blanket and pillow, warm window light, modest tenement bedroom, no people, no text',
  },
  apartment_rack: {
    name: 'Apartment Gear Rack',
    race: 'human',
    look: 'wooden armor stand with hanging cloak, sword belt and travel gear, tenement alcove, no people, no text',
  },
};

const NPC_POSES: Record<string, Array<{ pose: string; mood: string }>> = {
  elder_mira: [
    { pose: 'neutral', mood: 'calm wise welcoming expression, soft smile' },
    { pose: 'serious', mood: 'stern worried expression, giving important quest' },
    { pose: 'happy', mood: 'grateful relieved smile, thanking the hero' },
    { pose: 'angry', mood: 'disappointed betrayed glare, narrowed eyes' },
    { pose: 'action', mood: 'raised staff blessing the grove, decisive quest-complete gesture' },
  ],
  silvan_hermit: [
    { pose: 'neutral', mood: 'serene mystical calm, faint elven smile' },
    { pose: 'serious', mood: 'focused grave expression, forest warning' },
    { pose: 'happy', mood: 'quiet satisfied smile, forest at peace' },
    { pose: 'action', mood: 'invoking forest spirits, hands raised over mossy staff' },
  ],
  ash_shaman: [
    { pose: 'neutral', mood: 'stern tribal pride, evaluating warrior' },
    { pose: 'serious', mood: 'intense ritual focus, trial challenge' },
    { pose: 'action', mood: 'fierce encouraging battle cry pose' },
    { pose: 'happy', mood: 'approving warrior grin, ash blessing' },
  ],
  town_merchant: [
    { pose: 'neutral', mood: 'friendly merchant greeting, open hands' },
    { pose: 'trade', mood: 'excited showing wares, counting coins' },
    { pose: 'happy', mood: 'delighted successful sale, big smile' },
    { pose: 'serious', mood: 'worried trader sharing grim market rumors, furrowed brow, closed mouth, no text, no caption, no letters' },
  ],
  town_innkeeper: [
    { pose: 'neutral', mood: 'warm welcoming hostess smile' },
    { pose: 'happy', mood: 'caring satisfied expression, guest rested' },
    { pose: 'serious', mood: 'stern tavern warning, closed mouth, lowered brows, no smile, no text, no caption, no letters' },
  ],
  town_innkeeper_day: [
    { pose: 'neutral', mood: 'friendly barkeep greeting at daytime counter' },
    { pose: 'happy', mood: 'satisfied host grin, guest rested' },
    { pose: 'serious', mood: 'stern daytime tavern warning, closed mouth, lowered brows, no smile, no text' },
  ],
  town_captain: [
    { pose: 'neutral', mood: 'authoritative calm guard captain' },
    { pose: 'serious', mood: 'strategic briefing expression, pointing direction' },
    { pose: 'action', mood: 'urgent rallying pose, hand on sword hilt' },
    { pose: 'happy', mood: 'approving captain smile, proud of the garrison' },
  ],
  town_blacksmith: [
    { pose: 'neutral', mood: 'confident craftsman welcoming at forge' },
    { pose: 'work', mood: 'focused hammering at anvil, sparks flying' },
    { pose: 'happy', mood: 'proud successful enchant grin' },
    { pose: 'angry', mood: 'frustrated failed enchant, sweat and grit' },
    { pose: 'serious', mood: 'grim craftsman warning about poor steel, soot-stained frown' },
  ],
  town_radio: [
    { pose: 'neutral', mood: 'practical technician greeting, adjusting headset' },
    { pose: 'work', mood: 'focused tuning dials, concentrated eyes on radio gear' },
    { pose: 'happy', mood: 'signal clear grin, thumbs up with headset' },
    { pose: 'serious', mood: 'worried about static, urgent radio briefing' },
  ],
  town_stable: [
    { pose: 'neutral', mood: 'gruff friendly stablemaster welcoming, horse tack nearby' },
    { pose: 'happy', mood: 'proud of fine mount, affectionate grin toward horse' },
    { pose: 'serious', mood: 'stern safety warning about charge and reins' },
    { pose: 'work', mood: 'brushing horse, focused stable chores' },
  ],
  rift_scout: [
    { pose: 'neutral', mood: 'alert scout greeting, scanning horizon' },
    { pose: 'serious', mood: 'urgent warning expression, signal interference worry' },
    { pose: 'action', mood: 'ready to move, pointing toward signal district' },
  ],
  rift_guide: [
    { pose: 'neutral', mood: 'calm elven guide welcoming traveler to chaos sector' },
    { pose: 'serious', mood: 'grave warning about distortion, crystal glowing' },
    { pose: 'action', mood: 'leading through rift paths, cloak flowing' },
  ],
  collapse_seer: [
    { pose: 'neutral', mood: 'eerie calm seer greeting at the fringe' },
    { pose: 'serious', mood: 'prophetic intensity, seeing collapsing realities' },
    { pose: 'action', mood: 'channeling vision, hands raised over fractured crystal' },
  ],
  gods_oracle: [
    { pose: 'neutral', mood: 'detached divine oracle greeting at the gods rift' },
    { pose: 'serious', mood: 'solemn warning about broken gods, starlight eyes' },
    { pose: 'action', mood: 'invoking residual divinity, ritual gesture' },
  ],
  town_priest: [
    { pose: 'neutral', mood: 'gentle priest greeting at cathedral steps, soft smile' },
    { pose: 'serious', mood: 'solemn sermon expression, hands clasped in prayer' },
    { pose: 'happy', mood: 'warm blessing smile, raised hand in benediction' },
  ],
  town_scribe: [
    { pose: 'neutral', mood: 'quiet archive greeting, quill paused mid-air' },
    { pose: 'serious', mood: 'stern hush for silence in the archive' },
    { pose: 'happy', mood: 'delighted finding the right scroll, bright eyes' },
    { pose: 'work', mood: 'focused copying manuscript by candlelight' },
  ],
  town_guard: [
    { pose: 'neutral', mood: 'polite gate guard greeting, spear grounded' },
    { pose: 'serious', mood: 'stern law warning, inspecting traveler' },
    { pose: 'action', mood: 'alert ready stance, hand near sword hilt' },
    { pose: 'happy', mood: 'relieved nod, city safe for now' },
  ],
  town_fisher: [
    { pose: 'neutral', mood: 'weathered fisherman greeting by the pier' },
    { pose: 'happy', mood: 'proud showing a fat catch, broad sea grin' },
    { pose: 'serious', mood: 'warning about tides and storms, furrowed brow' },
    { pose: 'work', mood: 'hauling wet fishing nets on the pier, salt spray, focused effort' },
  ],
  town_dockhand: [
    { pose: 'neutral', mood: 'busy dockhand greeting between crates' },
    { pose: 'work', mood: 'hauling rope and barrel, strained effort face' },
    { pose: 'happy', mood: 'break finished grin, wiping sweat' },
    { pose: 'serious', mood: 'warning stay clear of crane, urgent gesture' },
  ],
  town_bathkeeper: [
    { pose: 'neutral', mood: 'calm bathhouse greeting through soft steam' },
    { pose: 'happy', mood: 'relaxed satisfied hostess after a good soak talk' },
    { pose: 'serious', mood: 'firm house rules, no fighting in the baths' },
  ],
  town_brewer: [
    { pose: 'neutral', mood: 'cheerful brewer greeting by oak barrels' },
    { pose: 'work', mood: 'tasting wort carefully, critical craftsman face' },
    { pose: 'happy', mood: 'proud toast with frothy mug, red-cheeked smile' },
    { pose: 'serious', mood: 'stern about spoiled batch, protective of recipe' },
  ],
  town_miller: [
    { pose: 'neutral', mood: 'kind miller greeting near millstones' },
    { pose: 'work', mood: 'checking flour sack, flour dust in air' },
    { pose: 'happy', mood: 'grateful smile after good harvest talk' },
    { pose: 'serious', mood: 'worried about grain shortage, grave advice' },
  ],
  town_butcher: [
    { pose: 'neutral', mood: 'butcher greeting at meat stall, cleaver at rest' },
    { pose: 'work', mood: 'cutting meat on block, focused craftsman' },
    { pose: 'happy', mood: 'proud of fresh cut, welcoming trader smile' },
    { pose: 'serious', mood: 'warning about raw meat spoilage, stern advice' },
  ],
  town_healer: [
    { pose: 'neutral', mood: 'gentle healer greeting, soft caring eyes' },
    { pose: 'serious', mood: 'examining wounds carefully, focused concern' },
    { pose: 'happy', mood: 'relieved patient recovering, warm smile' },
    { pose: 'work', mood: 'grinding herbs in mortar, concentrated' },
  ],
  town_teacher: [
    { pose: 'neutral', mood: 'patient schoolteacher greeting with open book' },
    { pose: 'happy', mood: 'proud of a clever pupil answer, warm smile' },
    { pose: 'serious', mood: 'stern lesson about maps and dangers, chalk raised' },
    { pose: 'work', mood: 'writing on slate board, focused teaching pose' },
  ],
  town_steward: [
    { pose: 'neutral', mood: 'polite butler greeting at tenement entrance, keys in hand' },
    { pose: 'work', mood: 'presenting apartment keys and ledger, professional courtesy' },
    { pose: 'happy', mood: 'satisfied welcoming new tenant smile, slight bow' },
  ],
  town_gardener: [
    { pose: 'neutral', mood: 'weathered gardener greeting among vegetable beds' },
    { pose: 'work', mood: 'watering garden plots with a can, focused care' },
    { pose: 'happy', mood: 'grateful smile after beds are watered, soft relief' },
    { pose: 'serious', mood: 'worried about dry soil, urging for water' },
  ],
  town_informant: [
    { pose: 'neutral', mood: 'hooded alley informant, quiet assessing stare' },
    { pose: 'happy', mood: 'knowing smirk sharing a shady tip, half smile' },
    { pose: 'serious', mood: 'low whisper about danger, eyes darting to shadows' },
  ],
  town_hq_sentry: [
    { pose: 'neutral', mood: 'corporate sentry at closed gate, visor down, impassive' },
    { pose: 'serious', mood: 'warning stance, spear ready, no unauthorized entry' },
    { pose: 'happy', mood: 'brief nod allowing clearance, visor lifted slightly' },
  ],
  town_hq_receptionist: [
    { pose: 'neutral', mood: 'corporate receptionist greeting at lobby desk' },
    { pose: 'happy', mood: 'polite welcome smile, pointing to campus map' },
  ],
  town_hq_researcher: [
    { pose: 'neutral', mood: 'corporate chief scientist holding a research tablet, calm intellectual stare' },
    { pose: 'work', mood: 'analyzing anomaly sample with holographic scanner, focused expression' },
    { pose: 'happy', mood: 'satisfied smile after successful calibration, pleased discovery' },
    { pose: 'serious', mood: 'warning about space distortion risks, stern professional concern' },
  ],
  town_hq_terminal: [
    { pose: 'neutral', mood: 'glowing cyan terminal screen displaying active system diagnostics' },
    { pose: 'happy', mood: 'terminal screen displaying green calibration success and power surge' },
    { pose: 'serious', mood: 'terminal screen flashing amber fault codes and distortion warning graphs' },
  ],
  town_notice_board: [
    { pose: 'neutral', mood: 'parchment bulletins and municipal orders pinned neatly to timber' },
    { pose: 'happy', mood: 'completed contracts and bounty tokens with royal wax seals' },
    { pose: 'serious', mood: 'urgent monster hunt posters with dagger pinning notice' },
    { pose: 'work', mood: 'freshly nailed petition scroll and clerk ink stamps on the timber board' },
  ],
  stage_bard: [
    { pose: 'neutral', mood: 'charismatic minstrel smiling gently with wooden lute in hand' },
    { pose: 'happy', mood: 'bard smiling warmly and nodding gratitude to the audience' },
    { pose: 'sing', mood: 'bard singing passionately with open posture and inspired eyes' },
  ],
  apartment_fridge: [
    { pose: 'neutral', mood: 'closed frost-lined icebox ready to open, cool pantry light' },
    { pose: 'happy', mood: 'icebox door ajar showing wrapped rations and a clay water jug' },
    { pose: 'serious', mood: 'nearly empty icebox with a single leftover parcel, sparse shelves' },
  ],
  apartment_chest: [
    { pose: 'neutral', mood: 'closed iron-bound chest in a tenement corner, sturdy and locked' },
    { pose: 'serious', mood: 'chest lid half-open with scattered scraps, missing travel kit' },
  ],
  apartment_bed: [
    { pose: 'neutral', mood: 'neatly made simple bed waiting for rest, folded blanket' },
    { pose: 'happy', mood: 'freshly changed linen, plump pillow, inviting rest' },
    { pose: 'serious', mood: 'rumpled unused bed, thin blanket, restless night look' },
  ],
  apartment_rack: [
    { pose: 'neutral', mood: 'armor stand with cloak and belt hanging ready' },
    { pose: 'work', mood: 'polishing cloth and oil on the armor stand, gear being cared for' },
    { pose: 'serious', mood: 'empty pegs and a dull unpolished breastplate on the rack' },
  ],
};

export function dialoguePortraitCatalog(): MediaAssetSpec[] {
  const specs: MediaAssetSpec[] = [];
  for (const [npcId, poses] of Object.entries(NPC_POSES)) {
    const meta = NPC_LOOK[npcId];
    if (!meta) continue;
    for (const { pose, mood } of poses) {
      specs.push({
        id: `dialogue_${npcId}_${pose}`,
        profile: 'dialogue_portrait',
        label: `Dialogue ${meta.name} — ${pose}`,
        params: {
          npc_id: npcId,
          npc_name: meta.name,
          race: meta.race,
          npc_look: meta.look,
          mood,
          ...(npcId === 'town_hq_receptionist' ? {visual_style: 'photographic', seed: '22071397'} : {}),
        },
      });
    }
  }
  for (const founder of EMPERY_FOUNDERS) {
    for (const [pose, mood] of [['neutral', 'calm attentive expression'], ['happy', 'warm welcoming smile']] as const) {
      specs.push({
        id: `dialogue_${founder.id}_${pose}`,
        profile: 'dialogue_portrait',
        label: `Dialogue ${founder.name} — ${pose}`,
        params: { npc_id: founder.id, npc_name: founder.name, race: 'human',
          npc_look: founder.portraitLook, mood, visual_style: 'photographic', portrait_background: 'bright modern creative engineering studio in background', seed: String(founder.appearance.seed) },
      });
    }
  }
  return specs;
}
