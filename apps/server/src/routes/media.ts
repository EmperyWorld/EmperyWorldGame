import { loadMediaManifest } from '../services/content.js';
import { MEDIA_MANIFEST_CACHE_CONTROL } from '../services/media-cache-headers.js';
import type { FastifyInstance } from 'fastify';
import type { GameRouteContext } from '../app.js';

export function registerMediaRoutes(app: FastifyInstance, context: GameRouteContext): void {
  const {
    comfy,
    mediaJobs,
    requireAdmin,
    requireAccount,
  } = context;
  app.get('/api/media/manifest', async (_req, reply) => {
    reply.header('Cache-Control', MEDIA_MANIFEST_CACHE_CONTROL);
    return loadMediaManifest() ?? { assets: {} };
  });

  app.post<{ Body: import('@empery/shared').MediaJobRequest }>(
    '/api/media/jobs',
    async (req,reply) => {
      const account=requireAdmin(req,reply);if (!account) return;
      return mediaJobs.create(comfy,req.body,account.id);
    },
  );

  app.get<{ Params: { id: string } }>('/api/media/jobs/:id', async (req, reply) => {
    const account=requireAccount(req,reply);if (!account) return;
    const job = mediaJobs.get(req.params.id);
    if (!job) return reply.status(404).send({ error: 'Job not found' });
    if (!account.admin && job.ownerAccountId!==account.id) return reply.status(403).send({error:'Чужое задание'});
    return job;
  });
}
