// -----------------------------------------------------------------------------
// Which voice speaks which language, from the voices of a real Piper server.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseVoice,
  parsePreferred,
  parseVoices,
  primaryLanguage,
  wyomingVoice,
} from '../src/voices.js';
import { DESCRIBE_BYTES, eventsOf } from './helpers/fakeWyoming.js';

const voices = parseVoices(eventsOf(DESCRIBE_BYTES)[0].data);

test('the Piper voices are read with their languages and speakers', () => {
  const siwis = voices.find((voice) => voice.name === 'fr_FR-siwis-medium');
  assert.deepEqual(siwis.languages, ['fr_FR']);
  const upmc = voices.find((voice) => voice.name === 'fr_FR-upmc-medium');
  assert.ok(upmc.speakers.length >= 2);
  assert.equal(new Set(voices.map((voice) => voice.name)).size, voices.length);
});

test('languages are compared on their primary subtag', () => {
  assert.equal(primaryLanguage('fr_FR'), 'fr');
  assert.equal(primaryLanguage('en-GB'), 'en');
  assert.equal(primaryLanguage('DE'), 'de');
  assert.equal(primaryLanguage(null), null);
  assert.equal(primaryLanguage('français'), null);
});

test('automatic: the usual voice of each language of Gladys', () => {
  const pick = (language) => chooseVoice({ language, preferred: [], voices });
  assert.deepEqual(pick('fr'), { name: 'fr_FR-siwis-medium', source: 'automatic' });
  assert.deepEqual(pick('en'), { name: 'en_US-lessac-medium', source: 'automatic' });
  assert.deepEqual(pick('de'), { name: 'de_DE-thorsten-medium', source: 'automatic' });
  assert.deepEqual(pick('es'), { name: 'es_ES-davefx-medium', source: 'automatic' });
  // A language without a known favourite: a medium voice of the server.
  assert.match(pick('it').name, /^it_IT-.*-medium$/);
});

test('the listed voices win for their language, the first one is the default', () => {
  const preferred = parsePreferred('fr_FR-upmc-medium:pierre, en_GB-alba-medium');
  assert.deepEqual(preferred, [
    { name: 'fr_FR-upmc-medium', speaker: 'pierre' },
    { name: 'en_GB-alba-medium' },
  ]);
  const pick = (language) => chooseVoice({ language, preferred, voices });
  assert.deepEqual(pick('fr'), {
    name: 'fr_FR-upmc-medium',
    speaker: 'pierre',
    source: 'preferred',
  });
  assert.deepEqual(pick('en'), { name: 'en_GB-alba-medium', source: 'preferred' });
  assert.equal(pick('de').source, 'automatic');
  // A language no voice speaks, or no language at all: the default voice.
  assert.deepEqual(pick('xx'), { name: 'fr_FR-upmc-medium', speaker: 'pierre', source: 'default' });
  assert.deepEqual(pick(null).source, 'default');
});

test('without any voice information, the names still give their language', () => {
  const preferred = parsePreferred('de_DE-thorsten-medium\nfr_FR-siwis-medium');
  assert.equal(chooseVoice({ language: 'fr', preferred, voices: [] }).name, 'fr_FR-siwis-medium');
  // Nothing listed, nothing known: the server's default voice, with the language.
  assert.deepEqual(chooseVoice({ language: 'fr', preferred: [], voices: [] }), {
    language: 'fr',
    source: 'server',
  });
  assert.deepEqual(wyomingVoice({ language: 'fr', source: 'server' }), { language: 'fr' });
  assert.deepEqual(wyomingVoice({ name: 'a', speaker: 'b', source: 'preferred' }), {
    name: 'a',
    speaker: 'b',
  });
});

test('a non-Piper server: voices without a language prefix, uninstalled ones skipped', () => {
  const custom = parseVoices({
    tts: [
      {
        name: 'kokoro',
        voices: [
          { name: 'ff_siwis', languages: ['fr'], installed: true },
          { name: 'af_heart', languages: ['en-us'], installed: true },
          { name: 'bf_emma', languages: ['en-gb'], installed: false },
        ],
      },
    ],
  });
  assert.deepEqual(
    custom.map((voice) => voice.name),
    ['ff_siwis', 'af_heart'],
  );
  assert.equal(chooseVoice({ language: 'fr', preferred: [], voices: custom }).name, 'ff_siwis');
  assert.equal(chooseVoice({ language: 'en', preferred: [], voices: custom }).name, 'af_heart');
});
