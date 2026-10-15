import { canRadioTalk, learnFrequency, RADIO_SERVICE_NPCS } from '../services/radio.js';
import type { FastifyInstance } from 'fastify';
import type { GameRouteContext } from '../app.js';

export function registerDialogueRoutes(app: FastifyInstance, context: GameRouteContext): void {
  const {
    saves,
    dialogue,
    sharePartyQuestActivation,
    executeSaveCommand,
  } = context;
  app.post<{ Body: { saveId: string; npcId: string; playerMessage?: string; channel?: 'proximity' | 'radio' } }>(
    '/api/dialogue',
    async (req, reply) => {
      const save = await executeSaveCommand(req, reply, req.body.saveId, current => {
        const channel = req.body.channel === 'radio' ? 'radio' : 'proximity';
        const gate = channel === 'radio' ? canRadioTalk(current, req.body.npcId) : {ok:true,save:learnFrequency(current,req.body.npcId)};
        const saved = saves.save(gate.save);
        if (!gate.ok) { reply.status(400).send({error:'message' in gate ? gate.message : 'Radio unavailable',save:saved}); return null; }
        return saved;
      });
      if (!save) return;
      const channel = req.body.channel === 'radio' ? 'radio' : 'proximity';
      const response = await dialogue.generate({
        npcId: req.body.npcId,
        save,
        playerMessage: req.body.playerMessage,
        channel,
      });
      return { ...response, save: saves.load(save.id) ?? save };
    },
  );

  app.post<{ Body: { saveId: string; npcId: string; choiceId: string; channel?: 'proximity' | 'radio' } }>(
    '/api/dialogue/choice',
    async (req, reply) => {
    return executeSaveCommand(req, reply, req.body.saveId, (save) => {
      const channel = req.body.channel === 'radio' ? 'radio' : 'proximity';
      if (channel === 'radio') {
        const gate = canRadioTalk(save, req.body.npcId);
        save = gate.save;
        if (!gate.ok) {
          saves.save(save);
          return reply.status(400).send({ error: gate.message, save });
        }
        if (RADIO_SERVICE_NPCS.has(req.body.npcId)) {
          return reply.status(400).send({ error: 'По рации нельзя вызвать городские сервисы.', save });
        }
      }
      const result = dialogue.applyChoice(save, req.body.npcId, req.body.choiceId, { channel });
      const saved = saves.save(result.save);
      sharePartyQuestActivation(saved, save, saved);
      return { save: saved, followUp: result.followUp, townMessage: result.townMessage };

    });
  },
  );
}
