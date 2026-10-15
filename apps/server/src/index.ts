import { createGameServer } from './app.js';
import { loadServicesConfig } from '@empery/shared/config';

const config = loadServicesConfig();
const { app } = await createGameServer({config});
let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  const timeout = setTimeout(() => process.exit(1), 10_000);
  timeout.unref();
  try { await app.close(); } catch (error) { app.log.error(error); process.exitCode = 1; }
  finally { clearTimeout(timeout); }
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
try { await app.listen({host:config.server.host,port:config.server.port}); }
catch (error) { app.log.error(error); await app.close(); process.exitCode = 1; }
