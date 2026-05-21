import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const cwd = resolve(process.cwd());
const packagePath = resolve(cwd, 'package.json');

if (!existsSync(packagePath)) {
  console.error(`Refusing to clean API build output: package.json was not found in ${cwd}`);
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
if (packageJson.name !== '@dmc/api') {
  console.error(`Refusing to clean API build output from unexpected package: ${packageJson.name || '(missing name)'}`);
  process.exit(1);
}

rmSync(resolve(cwd, 'dist'), { recursive: true, force: true });
rmSync(resolve(cwd, 'tsconfig.build.tsbuildinfo'), { force: true });

console.log(`Cleaned API build output: ${resolve(cwd, 'dist')}`);
