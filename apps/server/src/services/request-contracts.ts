import type { FastifyInstance } from 'fastify';

const id = { type: 'string', minLength: 1, maxLength: 128, pattern: '^[a-zA-Z0-9_-]+$' };
const finite = { type: 'number' };
const text = { type: 'string', maxLength: 4096 };
const boolean = { type: 'boolean' };
function object(properties: Record<string, unknown>, required: string[] = []) {
  return { type: 'object', properties, required, additionalProperties: false };
}
const combat = {
  encounterId: id, skillId: id, targetEntityIds: { type: 'array', items: id, maxItems: 8 },
  // Legacy hints are accepted during migration, but never used to decide combat.
  playerX: finite, playerY: finite, moving: boolean, dashing: boolean, nearbyEnemyCount: { type: 'integer', minimum: 0, maximum: 1024 },
};
// Explicit runtime contracts for the game command API.
const commandBodies: Record<string, unknown> = {
  "/api/auth/register": {
    "type": "object",
    "properties": {
      "username": {
        "type": "string",
        "maxLength": 256
      },
      "password": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [
      "username",
      "password"
    ],
    "additionalProperties": false
  },
  "/api/auth/login": {
    "type": "object",
    "properties": {
      "username": {
        "type": "string",
        "maxLength": 256
      },
      "password": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [
      "username",
      "password"
    ],
    "additionalProperties": false
  },
  "/api/saves/claim": {
    "type": "object",
    "properties": {
      "saveId": {
        "type": "string",
        "maxLength": 256
      },
      "all": {
        "type": "boolean"
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "/api/saves": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "maxLength": 256
      },
      "race": {
        "type": "string",
        "maxLength": 256
      },
      "gender": {
        "type": "string",
        "maxLength": 256
      },
      "profession": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [
      "name",
      "race"
    ],
    "additionalProperties": false
  },
  "/api/saves/:id/survival/consume": {
    "type": "object",
    "properties": {
      "itemId": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [
      "itemId"
    ],
    "additionalProperties": false
  },
  "/api/saves/:id/survival/treat": {
    "type": "object",
    "properties": {
      "itemId": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [
      "itemId"
    ],
    "additionalProperties": false
  },
  "/api/saves/:id/survival/process": {
    "type": "object",
    "properties": {
      "recipeId": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [
      "recipeId"
    ],
    "additionalProperties": false
  },
  "/api/debug/bug-report": {
    "type": "object",
    "properties": {
      "source": {
        "type": "string",
        "maxLength": 256
      },
      "now": {
        "type": "number"
      },
      "url": {
        "type": "string",
        "maxLength": 256
      },
      "userAgent": {
        "type": "string",
        "maxLength": 256
      },
      "saveId": {
        "anyOf": [
          {
            "type": "string",
            "maxLength": 256
          },
          {
            "type": "null"
          }
        ]
      },
      "locationId": {
        "anyOf": [
          {
            "type": "string",
            "maxLength": 256
          },
          {
            "type": "null"
          }
        ]
      },
      "worldTime": {},
      "havenSchedule": {},
      "settings": {},
      "graphicsQuality": {},
      "npcLifeEvents": {
        "type": "array",
        "maxItems": 256,
        "items": {}
      },
      "note": {
        "type": "string",
        "maxLength": 4096
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "/api/saves/:id/position": {
    "type": "object",
    "properties": {
      "worldX": {
        "type": "number"
      },
      "worldY": {
        "type": "number"
      },
      "location": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [
      "worldX",
      "worldY",
      "location"
    ],
    "additionalProperties": false
  },
  "/api/saves/:id/housing/buy": {
    "type": "object",
    "properties": {
      "tier": {
        "type": "number"
      }
    },
    "required": [
      "tier"
    ],
    "additionalProperties": false
  },
  "/api/saves/:id/housing/storage/deposit": {
    "type": "object",
    "properties": {
      "kind": {
        "enum": [
          "materials",
          "gear",
          "food"
        ]
      },
      "inventoryIndex": {
        "type": "number"
      }
    },
    "required": [
      "kind",
      "inventoryIndex"
    ],
    "additionalProperties": false
  },
  "/api/saves/:id/housing/storage/withdraw": {
    "type": "object",
    "properties": {
      "kind": {
        "enum": [
          "materials",
          "gear",
          "food"
        ]
      },
      "storageIndex": {
        "type": "number"
      }
    },
    "required": [
      "kind",
      "storageIndex"
    ],
    "additionalProperties": false
  },
  "/api/saves/:id/shop/buy": {
    "type": "object",
    "properties": {
      "itemId": {
        "type": "string",
        "maxLength": 256
      },
      "quantity": {
        "type": "number"
      },
      "shopId": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [
      "itemId"
    ],
    "additionalProperties": false
  },
  "/api/saves/:id/shop/sell": {
    "type": "object",
    "properties": {
      "inventoryIndex": {
        "type": "number"
      },
      "shopId": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [
      "inventoryIndex"
    ],
    "additionalProperties": false
  },
  "/api/saves/:id/shop/sell-all": {
    "type": "object",
    "properties": {
      "shopId": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "/api/saves/:id/forge/enchant": {
    "type": "object",
    "properties": {
      "slot": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [
      "slot"
    ],
    "additionalProperties": false
  },
  "/api/saves/:id/forge/craft": {
    "type": "object",
    "properties": {
      "recipeId": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [
      "recipeId"
    ],
    "additionalProperties": false
  },
  "/api/saves/:id/radio/activate": {
    "type": "object",
    "properties": {
      "packId": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "/api/saves/:id/radio/power": {
    "type": "object",
    "properties": {
      "on": {
        "type": "boolean"
      }
    },
    "required": [
      "on"
    ],
    "additionalProperties": false
  },
  "/api/saves/:id/mount/buy": {
    "type": "object",
    "properties": {
      "mountId": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "/api/saves/:id/companion/buy": {
    "type": "object",
    "properties": {
      "companionId": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "/api/saves/:id/companion/feed": {
    "type": "object",
    "properties": {
      "itemId": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "/api/saves/:id/companion/offer-bread": {
    "type": "object",
    "properties": {
      "seagullId": {
        "type": "string",
        "maxLength": 256
      },
      "x": {
        "type": "number"
      },
      "y": {
        "type": "number"
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "/api/saves/:id/loot/pickup": {
    "type": "object",
    "properties": {
      "lootId": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [],
    "additionalProperties": false
  },
  "/api/dialogue": {
    "type": "object",
    "properties": {
      "saveId": {
        "type": "string",
        "maxLength": 256
      },
      "npcId": {
        "type": "string",
        "maxLength": 256
      },
      "playerMessage": {
        "type": "string",
        "maxLength": 4096
      },
      "channel": {
        "anyOf": [
          {
            "const": "proximity"
          },
          {
            "const": "radio"
          }
        ]
      }
    },
    "required": [
      "saveId",
      "npcId"
    ],
    "additionalProperties": false
  },
  "/api/dialogue/choice": {
    "type": "object",
    "properties": {
      "saveId": {
        "type": "string",
        "maxLength": 256
      },
      "npcId": {
        "type": "string",
        "maxLength": 256
      },
      "choiceId": {
        "type": "string",
        "maxLength": 256
      },
      "channel": {
        "anyOf": [
          {
            "const": "proximity"
          },
          {
            "const": "radio"
          }
        ]
      }
    },
    "required": [
      "saveId",
      "npcId",
      "choiceId"
    ],
    "additionalProperties": false
  },
  "/api/saves/:id/equip": {
    "type": "object",
    "properties": {
      "itemId": {
        "type": "string",
        "maxLength": 256
      },
      "slot": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [
      "itemId"
    ],
    "additionalProperties": false
  },
  "/api/saves/:id/unequip": {
    "type": "object",
    "properties": {
      "slot": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [
      "slot"
    ],
    "additionalProperties": false
  },
  "/api/saves/:id/encounter/start": {
    "type": "object",
    "properties": {
      "locationId": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [
      "locationId"
    ],
    "additionalProperties": false
  },
  "/api/saves/:id/combat/batch-attack": {
    "type": "object",
    "properties": {
      "encounterId": {
        "type": "string",
        "maxLength": 256
      },
      "skillId": {
        "type": "string",
        "maxLength": 256
      },
      "moving": {
        "type": "boolean"
      },
      "dashing": {
        "type": "boolean"
      },
      "nearbyEnemyCount": {
        "type": "number"
      },
      "targetEntityIds": {
        "type": "array",
        "maxItems": 256,
        "items": {
          "type": "string",
          "maxLength": 256
        }
      },
      "playerX": {
        "type": "number"
      },
      "playerY": {
        "type": "number"
      }
    },
    "required": [
      "encounterId",
      "targetEntityIds"
    ],
    "additionalProperties": false
  },
  "/api/saves/:id/combat/bleed-kill": {
    "type": "object",
    "properties": {
      "encounterId": {
        "type": "string",
        "maxLength": 256
      },
      "entityId": {
        "type": "string",
        "maxLength": 256
      },
      "moving": {
        "type": "boolean"
      },
      "dashing": {
        "type": "boolean"
      },
      "nearbyEnemyCount": {
        "type": "number"
      }
    },
    "required": [
      "encounterId",
      "entityId"
    ],
    "additionalProperties": false
  },
  "/api/saves/:id/combat/mount-charge": {
    "type": "object",
    "properties": {
      "encounterId": {
        "type": "string",
        "maxLength": 256
      },
      "targetEntityIds": {
        "type": "array",
        "maxItems": 256,
        "items": {
          "type": "string",
          "maxLength": 256
        }
      },
      "playerX": {
        "type": "number"
      },
      "playerY": {
        "type": "number"
      },
      "nearbyEnemyCount": {
        "type": "number"
      }
    },
    "required": [
      "encounterId"
    ],
    "additionalProperties": false
  },
  "/api/saves/:id/encounter/farm-respawn": {
    "type": "object",
    "properties": {
      "encounterId": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [
      "encounterId"
    ],
    "additionalProperties": false
  },
  "/api/saves/:id/encounter/sync-quests": {
    "type": "object",
    "properties": {
      "encounterId": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [
      "encounterId"
    ],
    "additionalProperties": false
  },
  "/api/saves/:id/travel": {
    "type": "object",
    "properties": {
      "locationId": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [
      "locationId"
    ],
    "additionalProperties": false
  },
  "/api/saves/:id/resurrect": {
    "type": "object",
    "properties": {
      "targetSaveId": {
        "type": "string",
        "maxLength": 256
      }
    },
    "required": [
      "targetSaveId"
    ],
    "additionalProperties": false
  }
};
export const REQUEST_BODIES: Record<string, unknown> = {
  ...commandBodies,
  '/api/telemetry/client':object(Object.fromEntries(['frameMeanMs','frameP95Ms','rttMs','corrections','correctionPx','rxBytes','txBytes'].map(key=>[key,{type:'number',minimum:0,maximum:1e9}])),['frameMeanMs','frameP95Ms','rttMs','corrections','correctionPx','rxBytes','txBytes']),
  '/api/media/jobs': object({profile:{enum:['portrait_npc','dialogue_portrait','item_icon','skill_icon','location_bg','character_sheet','game_sprite','tileset','terrain_tile','prop_sprite','ship_sprite']},params:{type:'object',maxProperties:32,additionalProperties:{type:'string',maxLength:16000}}},['profile','params']),
  '/api/auth/register': object({ username: { type: 'string', minLength: 3, maxLength: 24 }, password: { type: 'string', minLength: 6, maxLength: 128 } }, ['username', 'password']),
  '/api/auth/login': object({ username: { type: 'string', minLength: 1, maxLength: 24 }, password: { type: 'string', minLength: 1, maxLength: 128 } }, ['username', 'password']),
  '/api/saves/:id': object({ skillHotbar: { type: 'array', maxItems: 9, items: { anyOf: [id, { type: 'null' }] } } }),
  '/api/saves/:id/position': object({ location: id }, ['location']),
  '/api/saves/:id/combat/batch-attack': object(combat, ['encounterId', 'targetEntityIds']),
  '/api/saves/:id/combat/mount-charge': object(combat, ['encounterId', 'targetEntityIds']),
  '/api/saves/:id/combat/bleed-kill': object({ encounterId: id, entityId: id, moving: boolean, dashing: boolean, nearbyEnemyCount: finite }, ['encounterId','entityId']),
  '/api/saves/:id/encounter/start': object({ locationId: id }, ['locationId']),
  '/api/saves/:id/mount/stamina': object({}),
  '/api/saves/:id/player-stamina': object({}),
  '/api/dialogue': object({ saveId: id, npcId: id, playerMessage: text, channel: { enum: ['proximity','radio'] } }, ['saveId','npcId']),
  '/api/dialogue/choice': object({ saveId: id, npcId: id, choiceId: id, channel: { enum: ['proximity','radio'] } }, ['saveId','npcId','choiceId']),
};

/** Contracts reject unknown fields; Ajv must not silently strip or coerce them. */
export function registerRequestContracts(app: FastifyInstance): void {
  app.addHook('onRoute', route => {
    if (!route.url.startsWith('/api/')) return;
    const schema = { ...route.schema };
    const keys = [...route.url.matchAll(/:([A-Za-z]+)/g)].map(match => match[1]!);
    if (keys.length && !schema.params) schema.params = object(Object.fromEntries(keys.map(key => [key, id])), keys);
    if (REQUEST_BODIES[route.url] && !schema.body && ['POST','PATCH'].some(method => (Array.isArray(route.method) ? route.method : [route.method]).includes(method as 'POST'))) {
      schema.body = REQUEST_BODIES[route.url];
    }
    route.schema = schema;
  });
}

export function parseClientMessage(value: unknown): import('@empery/shared').MultiplayerClientMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  const string = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 128;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const fields: Record<string, string[]> = {
    hello: ['saveId'], join_location: ['locationId'],
    move_command: ['seq','locationId','dx','dy','dash','persist'],
    player_input: ['x','y','moving','facing','persist','running','dash'],
    chat_send: ['channel','text','toName'], party_invite: ['toName'], party_accept: ['partyId'],
    party_decline: ['partyId'], party_leave: [], party_kick: ['saveId'], party_disband: [],
    party_promote: ['saveId'], party_assist: ['targetSaveId'], ally_cast: ['skillId','targetSaveId'],
    pvp_attack: ['targetSaveId','skillId','moving','dashing'], loot_pickup: ['lootId'], ping: ['ts'],
  };
  if (typeof message.type !== 'string' || !Object.hasOwn(fields, message.type)) return null;
  if (Object.keys(message).some(key => key !== 'type' && !fields[message.type as string]!.includes(key))) return null;
  for (const key of ['saveId','locationId','partyId','lootId','skillId','toName']) if (message[key] !== undefined && !string(message[key])) return null;
  if (message.targetSaveId !== undefined && message.targetSaveId !== null && !string(message.targetSaveId)) return null;
  for (const key of ['moving','persist','running','dash','dashing']) if (message[key] !== undefined && typeof message[key] !== 'boolean') return null;
  const required: Record<string,string[]> = {hello:['saveId'],join_location:['locationId'],party_invite:['toName'],party_accept:['partyId'],party_decline:['partyId'],party_kick:['saveId'],party_promote:['saveId'],party_assist:['targetSaveId'],ally_cast:['skillId'],pvp_attack:['targetSaveId'],loot_pickup:['lootId']};
  if (required[message.type]?.some(key => message[key] === undefined || (key !== 'targetSaveId' && !string(message[key])))) return null;
  if (message.type === 'pvp_attack' && !string(message.targetSaveId)) return null;
  if (message.type === 'player_input' && (!num(message.x) || !num(message.y) || typeof message.moving !== 'boolean' || !['left','right'].includes(String(message.facing)))) return null;
  if (message.type === 'move_command' && (!Number.isSafeInteger(message.seq) || (message.seq as number) < 1 || !string(message.locationId) || !num(message.dx) || !num(message.dy) || Math.abs(message.dx as number)>1 || Math.abs(message.dy as number)>1)) return null;
  if (message.type === 'ping' && !num(message.ts)) return null;
  if (message.type === 'chat_send' && (!['location','global','private','party'].includes(String(message.channel)) || typeof message.text !== 'string' || message.text.length > 4096)) return null;
  return message as unknown as import('@empery/shared').MultiplayerClientMessage;
}
