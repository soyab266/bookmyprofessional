import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Next.js already emits width=device-width, initial-scale=1. A manual tag
// duplicates it. Keep viewport ownership with Next.js, including zoom defaults.
test('app source does not add a second manual viewport meta tag', () => {
  function inspect(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) inspect(path);
      else if (/\.[jt]sx?$/.test(entry.name)) {
        assert.doesNotMatch(readFileSync(path, 'utf8'), /<meta\b[^>]*\bname\s*=\s*["']viewport["']/i, path);
      }
    }
  }
  inspect('src/app');
});

test('root layout leaves the default responsive viewport to Next.js', () => {
  const source = readFileSync('src/app/layout.jsx', 'utf8');
  assert.doesNotMatch(source, /export\s+(?:const\s+viewport|(?:async\s+)?function\s+generateViewport)\b/);
});
