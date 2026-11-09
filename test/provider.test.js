// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys and the fake
// Wyoming server: what Gladys receives when it asks for a voice, the
// Supervision status, the scene triggers and the two buttons.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parseHost } from '../src/config.js';
import { CONNECTION_TEXT, ERROR_TEXT } from '../src/texts.js';
import { TRIGGERS } from '../src/provider.js';
import { HOST, createWorld } from './helpers/world.js';
import { FakeWyoming, toneAnswer } from './helpers/fakeWyoming.js';
import { encodeEvent } from '../src/wyoming.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

function decode(ack) {
  const [contentType, base64] = ack.data.audio.split(';base64,');
  return { contentType, bytes: Buffer.from(base64, 'base64') };
}

test('Gladys gets an MP3 clip spoken by the French voice', async (t) => {
  const w = await world(t);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  const ack = await w.fake.ttsSynthesize('Bonjour, ici Gladys.', 'fr');
  assert.equal(ack.success, true, ack.error);
  const { contentType, bytes } = decode(ack);
  assert.equal(contentType, 'audio/mpeg');
  assert.equal(bytes[0], 0xff);
  assert.deepEqual(w.server.syntheses[0].data, {
    text: 'Bonjour, ici Gladys.',
    voice: { name: 'fr_FR-siwis-medium' },
  });
});

test('the WAV format, and the voice of each language', async (t) => {
  const w = await world(t, {
    config: { host: HOST, audio_format: 'wav', voices: 'en_GB-alba-medium' },
  });
  const ack = await w.fake.ttsSynthesize('Hello', 'en');
  const { contentType, bytes } = decode(ack);
  assert.equal(contentType, 'audio/wav');
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  await w.fake.ttsSynthesize('Hallo', 'de');
  await w.fake.ttsSynthesize('Hello'); // language unknown: the default voice
  assert.deepEqual(
    w.server.syntheses.map((event) => event.data.voice),
    [
      { name: 'en_GB-alba-medium' },
      { name: 'de_DE-thorsten-medium' },
      { name: 'en_GB-alba-medium' },
    ],
  );
});

test('a long announcement is cut to fit the 5 MB of Gladys', async (t) => {
  const w = await world(t, { config: { host: HOST, audio_format: 'wav' } });
  w.server.audio = toneAnswer(150);
  const ack = await w.fake.ttsSynthesize('Une seule longue phrase sans fin', 'fr');
  assert.equal(ack.success, true, ack.error);
  assert.ok(decode(ack).bytes.length <= 5 * 1024 * 1024);
});

test('a server down: the status says so, the synthesis fails visibly', async (t) => {
  const w = await world(t, { server: new FakeWyoming({ online: false }) });
  assert.deepEqual(w.fake.connectionStatus, {
    connected: false,
    message: CONNECTION_TEXT.unreachable,
  });
  const ack = await w.fake.ttsSynthesize('Bonjour', 'fr');
  assert.equal(ack.success, false);
  assert.match(ack.error, /does not answer/);
});

test('a server too slow or refusing the voice fails with its reason', async (t) => {
  const slow = await world(t, {
    server: new FakeWyoming({ hang: true }),
    timings: { describeTimeoutMs: 50, synthesizeTimeoutMs: 50 },
  });
  const timeout = await slow.fake.ttsSynthesize('Bonjour', 'fr');
  assert.match(timeout.error, /took too long/);

  const strict = await world(t, {
    server: new FakeWyoming({ voices: ['fr_FR-siwis-medium'] }),
    config: { host: HOST, voices: 'fr_FR-absent-medium' },
  });
  const refused = await strict.fake.ttsSynthesize('Bonjour', 'fr');
  assert.match(refused.error, /refused the text.*fr_FR-absent-medium/);
});

test('without an address, the status asks for one and nothing is dialled', async (t) => {
  const w = await world(t, { config: {} });
  assert.deepEqual(w.fake.connectionStatus, {
    connected: false,
    message: CONNECTION_TEXT.notConfigured,
  });
  const ack = await w.fake.ttsSynthesize('Bonjour', 'fr');
  assert.equal(ack.success, false);
  assert.equal(w.server.connections.length, 0);
  await w.fake.configUpdated({ host: `${HOST}:10300` });
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  assert.deepEqual(w.server.connections.at(-1), { host: HOST, port: 10300 });
});

test('a server that is not a TTS server is reported as such', async (t) => {
  const w = await world(t, {
    server: new FakeWyoming({ info: { asr: [{ name: 'faster-whisper' }], tts: [] } }),
  });
  assert.deepEqual(w.fake.connectionStatus, { connected: false, message: CONNECTION_TEXT.noTts });
});

test('the scene triggers fire on a real transition only, once each', async (t) => {
  const w = await world(t);
  w.server.online = false;
  await w.provider.refresh();
  await w.provider.refresh();
  const failed = await w.fake.ttsSynthesize('Bonjour', 'fr');
  assert.equal(failed.success, false);
  w.server.online = true;
  await w.provider.refresh();
  await w.provider.refresh();
  assert.deepEqual(
    w.fake.sceneEvents.map((event) => event.key ?? event.event_key),
    [TRIGGERS.offline, TRIGGERS.online],
  );
  // Starting with the server down is not a transition.
  const cold = await world(t, { server: new FakeWyoming({ online: false }) });
  assert.deepEqual(cold.fake.sceneEvents, []);
});

test('a synthesis that succeeds while the server was marked down brings it back', async (t) => {
  const w = await world(t);
  w.server.online = false;
  await w.provider.refresh();
  w.server.online = true;
  const ack = await w.fake.ttsSynthesize('Bonjour', 'fr');
  assert.equal(ack.success, true);
  await w.provider.pendingRefresh;
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('a Gladys restart gets the status again', async (t) => {
  const w = await world(t);
  const before = w.fake.connectionStatuses.length;
  await w.gladys.disconnect();
  await w.gladys.connect();
  assert.ok(w.fake.connectionStatuses.length > before);
});

test('"Test the voice" reports the voice, the duration and the size', async (t) => {
  const w = await world(t);
  const ack = await w.fake.action('test_voice', { language: 'en' });
  assert.equal(ack.success, true, ack.error);
  assert.match(
    ack.data.message.en,
    /^en_US-lessac-medium \(automatic\): \d+(\.\d)? s of audio \(MP3 \d+ KB\)/,
  );
  assert.match(ack.data.message.fr, /automatique/);
  assert.equal(
    w.server.syntheses[0].data.text,
    'Hello, this is Gladys speaking through your Wyoming server.',
  );
  await w.fake.action('test_voice', { text: '  Un texte à moi  ' });
  assert.equal(w.server.syntheses[1].data.text, 'Un texte à moi');
  assert.deepEqual(w.server.syntheses[1].data.voice, { name: 'fr_FR-siwis-medium' });
  w.server.online = false;
  const down = await w.fake.action('test_voice', {});
  assert.deepEqual(down.data.message, ERROR_TEXT.unreachable);
});

test('"Show the voices" lists the voices of a language, or the voice of each one', async (t) => {
  const w = await world(t, { config: { host: HOST, voices: 'fr_FR-upmc-medium:pierre' } });
  const all = await w.fake.action('list_voices', {});
  assert.match(
    all.data.message.en,
    /^\d{3} voices\. en: en_US-lessac-medium \(automatic\), fr: fr_FR-upmc-medium \(listed\)/,
  );
  const fr = await w.fake.action('list_voices', { language: 'fr' });
  assert.match(fr.data.message.fr, /^7 voix pour « fr » : /);
  assert.match(fr.data.message.fr, /fr_FR-upmc-medium \[.*pierre.*\] \(utilisée\)/);
  const unconfigured = await world(t, { config: {} });
  const none = await unconfigured.fake.action('list_voices', {});
  assert.deepEqual(none.data.message, ERROR_TEXT.notConfigured);
});

test('the address field takes what users paste', () => {
  assert.deepEqual(parseHost('tcp://192.0.2.30:10200', 1), { host: '192.0.2.30', port: 10200 });
  assert.deepEqual(parseHost(' piper.lan ', 10200), { host: 'piper.lan', port: 10200 });
  assert.deepEqual(parseHost('[2001:db8::1]:10201', 1), { host: '2001:db8::1', port: 10201 });
  assert.deepEqual(parseHost('2001:db8::1', 10200), { host: '2001:db8::1', port: 10200 });
  assert.deepEqual(normalizeConfig({ host: '192.0.2.30', port: 'x', audio_format: 'ogg' }), {
    host: '192.0.2.30',
    port: 10200,
    preferred: [],
    format: 'mp3',
  });
});

test('a server too slow for the whole text: the beginning speaks', async (t) => {
  const w = await world(t, { timings: { synthesizeTimeoutMs: 100 } });
  // The answer stops after its first sentences, as a slow Piper would at 22 s.
  const full = toneAnswer(4);
  w.server.audio = full.subarray(0, Math.floor(full.length / 2));
  const ack = await w.fake.ttsSynthesize('Une très longue annonce.', 'fr');
  assert.equal(ack.success, true, ack.error);
  assert.equal(decode(ack).contentType, 'audio/mpeg');
  // Nothing received at all is still a failure.
  w.server.hang = true;
  const nothing = await w.fake.ttsSynthesize('Bonjour', 'fr');
  assert.match(nothing.error, /took too long/);
});

test('a voice with a hundred speakers is listed briefly', async (t) => {
  const w = await world(t);
  const fr = await w.fake.action('list_voices', { language: 'fr' });
  assert.match(fr.data.message.en, /fr_FR-mls-medium \[1840, 3698, 123, 1474… \+\d+\]/);
  assert.ok(fr.data.message.en.length < 600);
});

test('a long text goes piece by piece, joined by a pause, cut at the deadline', async (t) => {
  const w = await world(t, { config: { host: HOST, audio_format: 'wav' } });
  w.server.audio = toneAnswer(1);
  const text = 'Première phrase du résumé. '.repeat(30).trim();
  const ack = await w.fake.ttsSynthesize(text, 'fr');
  assert.equal(ack.success, true, ack.error);
  const pieces = w.server.syntheses.map((event) => event.data.text);
  assert.ok(pieces.length >= 3 && pieces.every((piece) => piece.length <= 300));
  assert.equal(pieces.join(' '), text);
  // n pieces of one second, n - 1 pauses of 0.2 s.
  const seconds = decode(ack).bytes.readUInt32LE(40) / 44100;
  assert.ok(Math.abs(seconds - (pieces.length + (pieces.length - 1) * 0.2)) < 0.01, `${seconds}`);

  // The server stops answering after the first piece: the beginning speaks.
  const slow = await world(t, { timings: { synthesizeTimeoutMs: 600 } });
  slow.server.audio = toneAnswer(1);
  const answer = slow.server.answer.bind(slow.server);
  slow.server.answer = (event) => (slow.server.syntheses.length > 1 ? null : answer(event));
  const cut = await slow.fake.ttsSynthesize(text, 'fr');
  assert.equal(cut.success, true, cut.error);
  assert.equal(slow.server.syntheses.length, 2);
});

test('a piece refused after the first ones still speaks the beginning', async (t) => {
  const w = await world(t);
  w.server.audio = toneAnswer(1);
  const answer = w.server.answer.bind(w.server);
  w.server.answer = (event) =>
    w.server.syntheses.length > 1
      ? encodeEvent('error', { text: 'x'.repeat(500), code: 'RuntimeError' })
      : answer(event);
  const ack = await w.fake.ttsSynthesize('Première phrase du résumé. '.repeat(30).trim(), 'fr');
  assert.equal(ack.success, true, ack.error);
});

test('a check of the old server answering late does not overwrite the new one', async (t) => {
  const w = await world(t);
  w.server.hang = true;
  w.provider.timings.describeTimeoutMs = 50;
  const late = w.provider.refresh(); // old address, times out after the change
  w.server.hang = false;
  await w.fake.configUpdated({ host: '192.0.2.31' });
  await late;
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  assert.deepEqual(w.fake.sceneEvents, []);
});
