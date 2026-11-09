// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FORMATS } from '../src/audio.js';
import { DEFAULT_CONFIG, LANGUAGES } from '../src/config.js';
import { DEFAULT_TIMINGS, TRIGGERS } from '../src/provider.js';
import { createWorld } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const allFields = [
  ...(manifest.config_schema ?? []),
  ...[...(manifest.actions ?? []), ...(manifest.scene_triggers ?? [])].flatMap(
    (item) => item.fields ?? [],
  ),
];
const keysOf = (list) => (list ?? []).map((entry) => entry.key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

test('identity: a local TTS provider on the voice assistants shelf', () => {
  assert.equal(manifest.type, 'tts');
  assert.equal(manifest.name, 'Piper (Wyoming)');
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-wyoming:/);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-wyoming/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['local']);
  assert.deepEqual(manifest.categories, ['assistants']);
  // The tts type exists from Gladys 5.3.0 (store: MANIFEST_TYPE_MIN_GLADYS_VERSION).
  assert.deepEqual(minGladysVersion(), [5, 3, 0]);
  assert.equal(pkg.dependencies['@breezystack/lamejs'] !== undefined, true, 'runtime dependency');
});

test('every manifest action has a handler', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.deepEqual(keysOf(manifest.actions), ['test_voice', 'list_voices']);
  for (const action of manifest.actions) {
    const ack = await world.fake.action(action.key, {});
    assert.equal(ack.success, true, `${action.key}: ${ack.error}`);
    assert.deepEqual(Object.keys(ack.data.message), LANGUAGES);
  }
  const test = manifest.actions.find((action) => action.key === 'test_voice');
  assert.ok(test.timeout_seconds * 1000 > DEFAULT_TIMINGS.testTimeoutMs);
});

test('the scene triggers are the ones the provider fires', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers).sort(), Object.values(TRIGGERS).sort());
  for (const trigger of manifest.scene_triggers) {
    assert.equal(trigger.variables, undefined, 'the events carry no data');
  }
});

test('config_schema defaults and options stay consistent with the code', () => {
  assert.deepEqual(
    Object.keys(DEFAULT_CONFIG).sort(),
    manifest.config_schema
      .filter((f) => f.type !== 'section')
      .map((f) => f.key)
      .sort(),
  );
  for (const field of manifest.config_schema.filter((f) => f.default !== undefined)) {
    assert.equal(DEFAULT_CONFIG[field.key], field.default, field.key);
  }
  const format = manifest.config_schema.find((f) => f.key === 'audio_format');
  assert.deepEqual(
    format.options.map((o) => o.value),
    FORMATS,
  );
  for (const action of manifest.actions) {
    const language = action.fields.find((f) => f.key === 'language');
    assert.deepEqual(language.options.map((o) => o.value).sort(), [...LANGUAGES].sort());
  }
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('number fields have integer bounds and defaults (the form has no step)', () => {
  for (const field of allFields.filter((f) => f.type === 'number')) {
    for (const key of ['min', 'max', 'default']) {
      if (field[key] !== undefined) {
        assert.ok(Number.isInteger(field[key]), `${field.key}.${key}`);
      }
    }
  }
});

test('actions declare no secret field, no required field (no default is applied)', () => {
  for (const action of manifest.actions) {
    for (const field of action.fields ?? []) {
      assert.notEqual(field.type, 'secret');
      assert.notEqual(field.required, true);
    }
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});
