// -----------------------------------------------------------------------------
// From PCM to the clip Gladys accepts: WAV header, MP3 frames, the 5 MB cap.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CLIP_BYTES,
  buildClip,
  durationSeconds,
  resample,
  toMono16,
  wavFile,
} from '../src/audio.js';
import { SYNTHESIZE_FR_BYTES, eventsOf, toneAnswer } from './helpers/fakeWyoming.js';

function audioOf(bytes) {
  const events = eventsOf(bytes);
  const { rate, width, channels } = events[0].data;
  const pcm = Buffer.concat(events.filter((e) => e.payload).map((e) => e.payload));
  return { rate, width, channels, pcm };
}

const piper = audioOf(SYNTHESIZE_FR_BYTES);

test('the real Piper clip lasts about two seconds', () => {
  const seconds = durationSeconds(piper);
  assert.ok(seconds > 1 && seconds < 4, `${seconds} s`);
});

test('the WAV file has a canonical header around the PCM', async () => {
  const clip = await buildClip(piper, 'wav');
  assert.equal(clip.contentType, 'audio/wav');
  const wav = clip.buffer;
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(4), wav.length - 8);
  assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 22050);
  assert.equal(wav.readUInt32LE(28), 44100);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), piper.pcm.length);
  assert.deepEqual(wav.subarray(44), piper.pcm);
});

test('the MP3 clip is a stream of MPEG frames, eight times lighter than the WAV', async () => {
  const clip = await buildClip(piper, 'mp3');
  assert.equal(clip.contentType, 'audio/mpeg');
  assert.equal(clip.buffer[0], 0xff);
  assert.equal(clip.buffer[1] & 0xe0, 0xe0);
  // 64 kbit/s = 8,000 bytes a second, give or take the frame padding.
  const expected = durationSeconds(piper) * 8000;
  assert.ok(Math.abs(clip.buffer.length - expected) < expected * 0.2, `${clip.buffer.length}`);
});

test('a 2,000-character announcement fits the 5 MB cap in both formats', async () => {
  // About 150 s of speech at 22,050 Hz: 6.6 MB of raw WAV.
  const long = audioOf(toneAnswer(150));
  assert.ok(wavFile(long).length > MAX_CLIP_BYTES);
  const wav = await buildClip(long, 'wav');
  assert.ok(wav.buffer.length <= MAX_CLIP_BYTES);
  assert.equal(wav.rate, 16000);
  assert.equal(wav.buffer.readUInt32LE(24), 16000);
  const mp3 = await buildClip(long, 'mp3');
  assert.ok(mp3.buffer.length < 1.5 * 1024 * 1024);
});

test('audio too long even at 8 kHz is refused (null)', async () => {
  const huge = { rate: 22050, width: 2, channels: 1, pcm: Buffer.alloc(22050 * 2 * 400) };
  assert.equal(await buildClip(huge, 'wav'), null);
});

test('other formats: 8 and 32-bit, stereo, rates MP3 cannot carry', async () => {
  assert.deepEqual(
    [...toMono16({ pcm: Buffer.from([128, 255, 0]), width: 1, channels: 1 })],
    [0, 32512, -32768],
  );
  const stereo = Buffer.alloc(8);
  stereo.writeInt16LE(1000, 0);
  stereo.writeInt16LE(3000, 2);
  stereo.writeInt32LE(-2000 << 16, 4);
  assert.deepEqual([...toMono16({ pcm: stereo.subarray(0, 4), width: 2, channels: 2 })], [2000]);
  assert.deepEqual([...toMono16({ pcm: stereo.subarray(4), width: 4, channels: 1 })], [-2000]);
  assert.equal(resample(new Int16Array(441), 44100, 16000).length, 160);
  const odd = audioOf(toneAnswer(1, { rate: 20000, width: 4, channels: 2 }));
  const clip = await buildClip(odd, 'mp3');
  assert.equal(clip.rate, 22050);
  assert.equal(clip.buffer[0], 0xff);
});
