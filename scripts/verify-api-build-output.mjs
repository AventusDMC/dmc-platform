import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const apiMainPath = resolve(process.cwd(), 'dist/main.js');

if (!existsSync(apiMainPath)) {
  console.error(`Expected API build output was not found: ${apiMainPath}`);
  console.error('Run `npm --workspace @dmc/api run build` before starting production.');
  process.exit(1);
}

console.log(`Verified API build output: ${apiMainPath}`);
