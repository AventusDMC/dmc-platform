import { rmSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const cwd = resolve(process.cwd());
const isApiWorkspace = basename(cwd) === 'api' && basename(dirname(cwd)) === 'apps';

if (!isApiWorkspace) {
  console.error(`Refusing to clean API build output from unexpected cwd: ${cwd}`);
  console.error('Expected cwd to be the apps/api workspace.');
  process.exit(1);
}

rmSync(resolve(cwd, 'dist'), { recursive: true, force: true });
rmSync(resolve(cwd, 'tsconfig.build.tsbuildinfo'), { force: true });

console.log(`Cleaned API build output: ${resolve(cwd, 'dist')}`);
