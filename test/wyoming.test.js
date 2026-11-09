// -----------------------------------------------------------------------------
// The Wyoming client: framing (against the bytes of a real Piper server, cut
// anywhere), the exchanges and their failures.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_KINDS, EventParser, describe, encodeEvent, synthesize } from '../src/wyoming.js';
import {
  DESCRIBE_BYTES,
  FakeWyoming,
  SYNTHESIZE_FR_BYTES,
  eventsOf,
  toneAnswer,
} from './helpers/fakeWyoming.js';

const HOST = '192.0.2.30';

function parseInPieces(bytes, sizes) {
  const parser = new EventParser();
  const events = [];
  let offset = 0;
  let i = 0;
  while (offset < bytes.length) {
    const size = sizes[i % sizes.length];
    events.push(...parser.push(bytes.subarray(offset, offset + size)));
    offset += size;
    i += 1;
  }
  return events;
}

test('a real Piper info event parses the same whatever the TCP cuts', () => {
  const whole = eventsOf(DESCRIBE_BYTES);
  assert.equal(whole.length, 1);
  assert.equal(whole[0].type, 'info');
  assert.equal(whole[0].data.tts[0].name, 'piper');
  assert.ok(whole[0].data.tts[0].voices.length > 100);
  for (const sizes of [[1], [7, 3, 1000], [65536]]) {
    assert.deepEqual(parseInPieces(DESCRIBE_BYTES, sizes), whole);
  }
});

test('a real Piper audio stream parses whatever the TCP cuts', () => {
  const whole = eventsOf(SYNTHESIZE_FR_BYTES);
  assert.equal(whole[0].type, 'audio-start');
  assert.deepEqual(
    { rate: whole[0].data.rate, width: whole[0].data.width, channels: whole[0].data.channels },
    { rate: 22050, width: 2, channels: 1 },
  );
  assert.equal(whole.at(-1).type, 'audio-stop');
  const pcm = whole.filter((event) => event.type === 'audio-chunk');
  assert.ok(pcm.every((event) => event.payload.length > 0));
  for (const sizes of [[1], [13, 2048, 5], [100_000]]) {
    const events = parseInPieces(SYNTHESIZE_FR_BYTES, sizes);
    assert.equal(events.length, whole.length);
    assert.deepEqual(
      Buffer.concat(events.filter((e) => e.payload).map((e) => e.payload)),
      Buffer.concat(pcm.map((e) => e.payload)),
    );
  }
});

test('encodeEvent writes data and payload after the line, as the reference does', () => {
  const bytes = encodeEvent(
    'audio-chunk',
    { rate: 16000, width: 2, channels: 1 },
    Buffer.from([1, 2, 3, 4]),
  );
  const line = JSON.parse(bytes.subarray(0, bytes.indexOf(0x0a)).toString());
  assert.equal(line.type, 'audio-chunk');
  assert.equal(line.payload_length, 4);
  assert.equal(line.data, undefined);
  const [event] = eventsOf(bytes);
  assert.deepEqual(event.data, { rate: 16000, width: 2, channels: 1 });
  assert.deepEqual([...event.payload], [1, 2, 3, 4]);
  assert.deepEqual(JSON.parse(encodeEvent('describe').toString()), {
    type: 'describe',
    version: '1.11.0',
  });
});

test('data inline in the header line is merged with the data that follows', () => {
  const extra = Buffer.from('{"b":2}');
  const bytes = Buffer.concat([
    Buffer.from(`{"type":"x","data":{"a":1},"data_length":${extra.length}}\n`),
    extra,
    Buffer.from('\n{"type":"y"}\n'),
  ]);
  const events = eventsOf(bytes);
  assert.deepEqual(
    events.map((e) => [e.type, e.data]),
    [
      ['x', { a: 1, b: 2 }],
      ['y', {}],
    ],
  );
});

test('malformed input is a protocol error', () => {
  for (const bad of ['not json\n', '{"no":"type"}\n', '{"type":"x","payload_length":-1}\n']) {
    assert.throws(() => new EventParser().push(Buffer.from(bad)), { kind: ERROR_KINDS.protocol });
  }
  assert.throws(
    () => new EventParser().push(Buffer.from('{"type":"x","payload_length":999999999}\n')),
    {
      kind: ERROR_KINDS.protocol,
    },
  );
});

test('describe and synthesize against the fake server', async () => {
  const server = new FakeWyoming();
  const info = await describe({ host: HOST, port: 10200, connect: server.connect });
  assert.equal(info.tts[0].voices.length > 100, true);
  const audio = await synthesize({
    host: HOST,
    port: 10200,
    text: 'Bonjour, ici Gladys.',
    voice: { name: 'fr_FR-siwis-medium' },
    timeoutMs: 5000,
    connect: server.connect,
  });
  assert.equal(audio.rate, 22050);
  assert.ok(audio.pcm.length > 50_000);
  assert.deepEqual(server.syntheses[0].data, {
    text: 'Bonjour, ici Gladys.',
    voice: { name: 'fr_FR-siwis-medium' },
  });
  assert.deepEqual(server.connections[0], { host: HOST, port: 10200 });
});

test('a server that is down, mute, refusing or too long fails with its kind', async () => {
  const base = { host: HOST, port: 10200, text: 'Hello', timeoutMs: 200 };
  await assert.rejects(
    synthesize({ ...base, connect: new FakeWyoming({ online: false }).connect }),
    { kind: ERROR_KINDS.unreachable },
  );
  await assert.rejects(synthesize({ ...base, connect: new FakeWyoming({ hang: true }).connect }), {
    kind: ERROR_KINDS.timeout,
  });
  const refusing = new FakeWyoming({ voices: ['fr_FR-siwis-medium'] });
  await assert.rejects(
    synthesize({ ...base, voice: { name: 'xx_XX-none-medium' }, connect: refusing.connect }),
    { kind: ERROR_KINDS.server, serverText: 'xx_XX-none-medium' },
  );
  const long = new FakeWyoming();
  long.audio = toneAnswer(3);
  await assert.rejects(
    synthesize({ ...base, timeoutMs: 5000, maxPcmBytes: 10_000, connect: long.connect }),
    { kind: ERROR_KINDS.tooLong },
  );
});
