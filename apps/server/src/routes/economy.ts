import { computeStats } from '../services/stats.js';
import { equipItem, unequipItem } from '../services/quests.js';
import { previewEquip } from '../services/inventory.js';
import { gateNpcInteract, gateShopOpen } from '../services/npc-schedule-gate.js';
import { buyFromMerchant, craftItem, getMerchantName, listBagSellQuotes, listShopOffers, resolveShopId, sellAllBagToMerchant, sellToMerchant } from '../services/town-services.js';
import { buildForgeMenu, enchantAtBlacksmith } from '../services/enchant.js';
import { markFreshnessForNewInventory } from '../services/survival.js';
import type { FastifyInstance } from 'fastify';
import type { GameRouteContext } from '../app.js';

export function registerEconomyRoutes(app: FastifyInstance, context: GameRouteContext): void {
  const {
    saves,
    dayNight,
    world,
    executeSaveCommand,
  } = context;
  app.get<{ Querystring: { shopId?: string; locationId?: string } }>('/api/shop', async (req) => {
    const shopId = resolveShopId(req.query.shopId);
    const locationId = String(req.query.locationId ?? '').trim();
    const gate =
      locationId.length > 0
        ? gateShopOpen(dayNight, shopId, locationId)
        : { ok: true, message: '' };
    return {
      merchantName: getMerchantName(shopId),
      offers: gate.ok ? listShopOffers(shopId) : [],
      shopId,
      open: gate.ok,
      closedMessage: gate.ok ? undefined : gate.message,
    };
  });

  app.get<{ Params: { id: string }; Querystring: { shopId?: string } }>(
    '/api/saves/:id/shop',
    async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
      const shopId = resolveShopId(req.query.shopId);
      const gate = gateShopOpen(dayNight, shopId, save.location);
      return {
        merchantName: getMerchantName(shopId),
        offers: gate.ok ? listShopOffers(shopId) : [],
        shopId,
        open: gate.ok,
        closedMessage: gate.ok ? undefined : gate.message,
      };

    });
  },
  );

  app.post<{ Params: { id: string }; Body: { itemId: string; quantity?: number; shopId?: string } }>(
    '/api/saves/:id/shop/buy',
    async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
      const shopId = resolveShopId(req.body?.shopId);
      const gate = gateShopOpen(dayNight, shopId, save.location);
      if (!gate.ok) return reply.status(400).send({ error: gate.message, save });
      const result = buyFromMerchant(save, req.body.itemId, req.body.quantity ?? 1, shopId);
      if (!result.ok) return reply.status(400).send({ error: result.message, save: result.save });
      const saved = saves.save(markFreshnessForNewInventory(save, result.save));
      return { save: saved, stats: computeStats(saved), message: result.message };

    });
  },
  );

  app.post<{ Params: { id: string }; Body: { inventoryIndex: number; shopId?: string } }>(
    '/api/saves/:id/shop/sell',
    async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
      const shopId = resolveShopId(req.body?.shopId);
      const gate = gateShopOpen(dayNight, shopId, save.location);
      if (!gate.ok) return reply.status(400).send({ error: gate.message, save });
      const result = sellToMerchant(save, req.body.inventoryIndex);
      if (!result.ok) return reply.status(400).send({ error: result.message, save: result.save });
      const saved = saves.save(result.save);
      return { save: saved, stats: computeStats(saved), message: result.message };

    });
  },
  );

  app.post<{ Params: { id: string }; Body: { shopId?: string } }>(
    '/api/saves/:id/shop/sell-all',
    async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
      const shopId = resolveShopId(req.body?.shopId);
      const gate = gateShopOpen(dayNight, shopId, save.location);
      if (!gate.ok) return reply.status(400).send({ error: gate.message, save });
      const result = sellAllBagToMerchant(save);
      if (!result.ok) return reply.status(400).send({ error: result.message, save: result.save });
      const saved = saves.save(result.save);
      return { save: saved, stats: computeStats(saved), message: result.message };

    });
  },
  );

  app.get<{ Params: { id: string } }>('/api/saves/:id/shop/bag', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
    return { items: listBagSellQuotes(save) };

    });
  });

  app.get<{ Params: { id: string } }>('/api/saves/:id/forge', async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
    const gate = gateNpcInteract(dayNight, 'town_blacksmith', save.location);
    if (!gate.ok) {
      return {
        open: false,
        closedMessage: gate.message,
        smithName: 'Кузнец',
        adena: save.adena ?? 0,
        hint: gate.message,
        enchant: [],
        craft: [],
      };
    }
    return { open: true, ...buildForgeMenu(save) };

    });
  });

  app.post<{ Params: { id: string }; Body: { slot: string } }>(
    '/api/saves/:id/forge/enchant',
    async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
      const gate = gateNpcInteract(dayNight, 'town_blacksmith', save.location);
      if (!gate.ok) return reply.status(400).send({ error: gate.message, save });
      const result = enchantAtBlacksmith(save, req.body.slot);
      // Валидация без изменений сейва
      if (result.save === save) {
        return reply.status(400).send({ error: result.message, save: result.save });
      }
      const saved = saves.save(result.save);
      return { save: saved, stats: computeStats(saved), message: result.message, ok: result.ok };

    });
  },
  );

  app.post<{ Params: { id: string }; Body: { recipeId: string } }>(
    '/api/saves/:id/forge/craft',
    async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
      const gate = gateNpcInteract(dayNight, 'town_blacksmith', save.location);
      if (!gate.ok) return reply.status(400).send({ error: gate.message, save });
      const result = craftItem(save, req.body.recipeId);
      if (!result.ok) return reply.status(400).send({ error: result.message, save: result.save });
      const saved = saves.save(markFreshnessForNewInventory(save, result.save));
      return { save: saved, stats: computeStats(saved), message: result.message, ok: true };

    });
  },
  );

  app.post<{ Params: { id: string }; Body: { itemId: string; slot?: string } }>(
    '/api/saves/:id/equip',
    async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
      const next = equipItem(save, req.body.itemId, req.body.slot);
      const saved = saves.save(next);
      world.syncLookFromSave(saved);
      return { save: saved, stats: computeStats(saved) };

    });
  },
  );

  app.post<{ Params: { id: string }; Body: { slot: string } }>(
    '/api/saves/:id/unequip',
    async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
      const next = unequipItem(save, req.body.slot);
      const saved = saves.save(next);
      world.syncLookFromSave(saved);
      return { save: saved, stats: computeStats(saved) };

    });
  },
  );

  app.get<{ Params: { id: string }; Querystring: { itemId: string } }>(
    '/api/saves/:id/inventory/preview',
    async (req, reply) => {
    return executeSaveCommand(req, reply, req.params.id, (save) => {
      const preview = previewEquip(save, req.query.itemId);
      if (!preview) return reply.status(400).send({ error: 'Cannot preview item' });
      return preview;

    });
  },
  );
}
