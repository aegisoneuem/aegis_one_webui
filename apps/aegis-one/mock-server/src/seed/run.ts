import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_DEVICE_COUNT, DEFAULT_SEED, seedDatabase } from './seed';

/** Rebuilds the fixture database from scratch. See docs/seed.md. */
const here = dirname(fileURLToPath(import.meta.url));
const file = process.env['MOCK_DB'] ?? resolve(here, '../../data/aegis-mock.db');
const seed = Number(process.env['MOCK_SEED'] ?? DEFAULT_SEED);
const deviceCount = Number(process.env['MOCK_DEVICES'] ?? DEFAULT_DEVICE_COUNT);

const started = Date.now();
seedDatabase({ file, seed, deviceCount, onProgress: (m) => process.stdout.write(`${m}\n`) });
process.stdout.write(
  `seeded ${deviceCount.toLocaleString('en-IN')} devices (seed ${seed}) in ${((Date.now() - started) / 1000).toFixed(1)}s -> ${file}\n`,
);
