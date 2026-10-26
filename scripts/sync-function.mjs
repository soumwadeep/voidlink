import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const files = ['engine.ts', 'protocol.ts', 'service.ts', 'api.ts'];
const check = process.argv.includes('--check');
let mismatch = false;

for (const file of files) {
  const source = await readFile(join(root, 'shared', file), 'utf8');
  const target = join(root, 'functions', 'app', file);
  if (check) {
    let current = '';
    try {
      current = await readFile(target, 'utf8');
    } catch {
      current = '';
    }
    if (current !== source) {
      console.error(`Function copy is stale: functions/app/${file}`);
      mismatch = true;
    }
  } else {
    await writeFile(target, source, 'utf8');
    console.log(`synced shared/${file} -> functions/app/${file}`);
  }
}

if (check && mismatch) process.exit(1);
if (check) console.log('Function copies match shared/ sources.');
