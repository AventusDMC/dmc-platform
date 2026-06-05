import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Phase 3D.1B guard: the preview panel must be read-only. We assert against the
// actual fetch()/method code (NOT prose), so the explanatory comment that names
// the forbidden endpoints doesn't create false positives. Uses cwd-relative
// paths (no import.meta) to stay CJS-safe for the build.
function readPanelSource(): string {
  const candidates = [
    resolve(process.cwd(), 'app/quotes/[id]/GenerateFromTouringRoutePanel.tsx'),
    resolve(process.cwd(), 'apps/admin-web/app/quotes/[id]/GenerateFromTouringRoutePanel.tsx'),
  ];
  const path = candidates.find((c) => existsSync(c)) ?? candidates[0];
  return readFileSync(path, 'utf8');
}

test('preview panel makes exactly one network call — a GET on the route detail', () => {
  const src = readPanelSource();
  const fetchCount = (src.match(/fetch\(/g) || []).length;
  assert.equal(fetchCount, 1, 'expected exactly one fetch() in the preview panel');
  assert.match(src, /fetch\(`\$\{apiBaseUrl\}\/touring-routes\/\$\{routeId\}`/, 'the one fetch must target the route detail');
  assert.match(src, /method:\s*'GET'/, 'the route-detail fetch must be a GET');
});

test('preview panel issues NO write methods (POST/PATCH/PUT/DELETE)', () => {
  const src = readPanelSource();
  assert.ok(!/method:\s*'(POST|PATCH|PUT|DELETE)'/.test(src), 'preview panel must not issue any write method');
});
