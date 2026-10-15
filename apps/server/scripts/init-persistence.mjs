import { readFileSync } from 'node:fs';
import pg from 'pg';
import { parse } from 'yaml';
const config=process.env.EMPERY_POSTGRES_URL?null:parse(readFileSync(new URL('../../../config/services.yaml',import.meta.url),'utf8'));
if(config?.save?.backend==='files')process.exit(0);
const url = process.env.EMPERY_POSTGRES_URL??config?.persistence?.postgres?.url;
if (!url) throw new Error('PostgreSQL URL required in config/services.yaml or EMPERY_POSTGRES_URL');
const pool = new pg.Pool({ connectionString: url });
try { await pool.query(readFileSync(new URL('../../../deploy/podman/init/01-schema.sql', import.meta.url), 'utf8')); }
finally { await pool.end(); }
