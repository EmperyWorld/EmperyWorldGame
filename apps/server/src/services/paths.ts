import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const contentRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../content');
