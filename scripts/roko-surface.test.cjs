const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  parseNameStatus,
  classify,
  summarizeByArea,
  parseUpstreamBase,
  isTest,
} = require('./roko-surface.cjs');

const COMMIT = 'e8f3be08623663d4ad7f7241e693c94469b63bb0';

test('reads added, modified and deleted files and ignores blank lines', () => {
  assert.deepEqual(parseNameStatus('A\ta/new.js\nM\tb/old.js\n\nD\tc/gone.js\n'), [
    { status: 'A', path: 'a/new.js' },
    { status: 'M', path: 'b/old.js' },
    { status: 'D', path: 'c/gone.js' },
  ]);
});

test('a status it does not know fails loudly instead of being dropped', () => {
  // Renames appear when git is run without --no-renames; losing them would hide a conflict.
  assert.throws(() => parseNameStatus('R100\told.js\tnew.js'), /no reconocida/);
});

test('splits owned, modified and removed files and keeps them sorted', () => {
  const surface = classify([
    { status: 'A', path: 'api/z.js' },
    { status: 'A', path: 'api/a.js' },
    { status: 'M', path: 'client/src/App.tsx' },
    { status: 'D', path: 'api/legacy.js' },
  ]);
  assert.deepEqual(surface, {
    owned: ['api/a.js', 'api/z.js'],
    modified: ['client/src/App.tsx'],
    removed: ['api/legacy.js'],
  });
});

test('dependency, translation, documentation and infrastructure noise is not surface', () => {
  const noise = [
    'package-lock.json',
    'bun.lock',
    'client/src/locales/ca/translation.json',
    'README.md',
    'docs/guide.md',
    '.github/workflows/ci.yml',
    'helm/librechat/Chart.yaml',
    'scratchpad/plan.txt',
  ];
  const surface = classify(noise.map((p) => ({ status: 'M', path: p })));
  assert.deepEqual(surface, { owned: [], modified: [], removed: [] });
});

test('tests are recognised by file name and by folder', () => {
  assert.equal(isTest('api/server/services/Nextcloud/webdav.spec.js'), true);
  assert.equal(isTest('client/src/hooks/useThing.test.ts'), true);
  assert.equal(isTest('client/src/components/__tests__/Panel.tsx'), true);
  assert.equal(isTest('api/server/services/Nextcloud/webdav.js'), false);
});

test('groups by two path segments and counts code and tests separately', () => {
  const summary = summarizeByArea([
    'packages/api/src/roko/workspace.ts',
    'packages/api/src/roko/workspace.spec.ts',
    'packages/data-provider/src/bridgeModels.ts',
    'config/claude-login.js',
  ]);
  assert.deepEqual(summary, [
    { area: 'packages/api', source: 1, tests: 1 },
    { area: 'config', source: 1, tests: 0 },
    { area: 'packages/data-provider', source: 1, tests: 0 },
  ]);
});

test('UPSTREAM-BASE needs a repository, a tag and a full commit hash', () => {
  const valid = `UPSTREAM_REPO=https://example.test/x.git\nUPSTREAM_TAG=v0.8.8\nUPSTREAM_COMMIT=${COMMIT}\n`;
  assert.deepEqual(parseUpstreamBase(valid), {
    repo: 'https://example.test/x.git',
    tag: 'v0.8.8',
    commit: COMMIT,
  });
  assert.throws(
    () => parseUpstreamBase(valid.replace('UPSTREAM_TAG=v0.8.8\n', '')),
    /UPSTREAM_TAG/,
  );
  assert.throws(() => parseUpstreamBase(valid.replace(COMMIT, 'e8f3be0')), /40 caracteres/);
});

test('the UPSTREAM-BASE committed in the repository parses', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'UPSTREAM-BASE'), 'utf8');
  const base = parseUpstreamBase(text);
  assert.match(base.tag, /^v\d+\.\d+\.\d+/);
});
