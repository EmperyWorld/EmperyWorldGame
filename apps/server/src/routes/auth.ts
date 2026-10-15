
import type { FastifyInstance } from 'fastify';
import type { GameRouteContext } from '../app.js';

export function registerAuthRoutes(app: FastifyInstance, context: GameRouteContext): void {
  const {
    auth,
    bearerToken,
    requireAccount,
  } = context;
  app.post<{ Body: { username: string; password: string } }>('/api/auth/register', async (req, reply) => {
    const result = await auth.register(req.body.username ?? '', req.body.password ?? '');
    if ('error' in result) return reply.status(400).send(result);
    return result;
  });

  app.post<{ Body: { username: string; password: string } }>('/api/auth/login', async (req, reply) => {
    const result = await auth.login(req.body.username ?? '', req.body.password ?? '');
    if ('error' in result) return reply.status(401).send(result);
    return result;
  });

  app.post('/api/auth/logout', async (req) => {
    const token = bearerToken(req);
    if (token) auth.logout(token);
    return { ok: true };
  });

  app.get('/api/auth/me', async (req, reply) => {
    const account = requireAccount(req, reply);
    if (!account) return;
    return { account: auth.toPublic(account) };
  });
}
