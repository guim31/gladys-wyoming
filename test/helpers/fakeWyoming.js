// -----------------------------------------------------------------------------
// A fake Wyoming server behind the `connect` seam of src/wyoming.js: no
// network. It answers with the bytes a real rhasspy/wyoming-piper 2.5.2 sent
// (test/fixtures/piper-*.bin), cut into random TCP-like pieces.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { EventParser, encodeEvent } from '../../src/wyoming.js';

export const fixture = (name) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url));

// `describe` → `info` (all the Piper voices); `synthesize` of
// "Bonjour, ici Gladys." with fr_FR-siwis-medium → audio-start, chunks, stop.
export const DESCRIBE_BYTES = fixture('piper-describe.bin');
export const SYNTHESIZE_FR_BYTES = fixture('piper-synthesize-fr.bin');

/** Every event of a recorded stream. */
export function eventsOf(bytes) {
  return new EventParser().push(bytes);
}

/** A generated answer: `seconds` of a 440 Hz tone, Piper's format by default. */
export function toneAnswer(seconds, { rate = 22050, width = 2, channels = 1 } = {}) {
  const format = { rate, width, channels };
  const frames = Math.round(seconds * rate);
  const pcm = Buffer.alloc(frames * width * channels);
  for (let i = 0; i < frames; i += 1) {
    const value = Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000);
    for (let c = 0; c < channels; c += 1) {
      const offset = (i * channels + c) * width;
      if (width === 2) {
        pcm.writeInt16LE(value, offset);
      } else if (width === 1) {
        pcm[offset] = 128 + (value >> 8);
      } else {
        pcm.writeInt32LE(value << 16, offset);
      }
    }
  }
  const parts = [encodeEvent('audio-start', format)];
  const chunk = 1024 * width * channels;
  for (let offset = 0; offset < pcm.length; offset += chunk) {
    parts.push(encodeEvent('audio-chunk', format, pcm.subarray(offset, offset + chunk)));
  }
  parts.push(encodeEvent('audio-stop'));
  return Buffer.concat(parts);
}

class FakeSocket extends EventEmitter {
  constructor(server) {
    super();
    this.server = server;
    this.parser = new EventParser();
    this.destroyed = false;
  }

  write(buffer) {
    for (const event of this.parser.push(buffer)) {
      this.server.requests.push(event);
      const answer = this.server.answer(event);
      if (answer) {
        this.sendInPieces(answer);
      }
    }
    return true;
  }

  sendInPieces(bytes) {
    let offset = 0;
    const next = () => {
      if (this.destroyed || offset >= bytes.length) {
        return;
      }
      const size = 1 + Math.floor(this.server.random() * this.server.maxPiece);
      this.emit('data', bytes.subarray(offset, offset + size));
      offset += size;
      setImmediate(next);
    };
    setImmediate(next);
  }

  destroy() {
    if (!this.destroyed) {
      this.destroyed = true;
      setImmediate(() => this.emit('close'));
    }
  }
}

export class FakeWyoming {
  constructor({ online = true, hang = false, info = null, voices = null, seed = 1 } = {}) {
    this.online = online;
    this.hang = hang;
    // A custom `info` data object instead of the recorded Piper answer.
    this.info = info;
    // Known voice names (null: every name is known, as Piper downloads them).
    this.voices = voices;
    // The synthesize answer: recorded bytes, or toneAnswer(...).
    this.audio = SYNTHESIZE_FR_BYTES;
    this.requests = [];
    this.connections = [];
    this.maxPiece = 4096;
    let state = seed;
    // Deterministic pseudo-random pieces (a test failure replays).
    this.random = () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
    this.connect = (target) => this.open(target);
  }

  open(target) {
    this.connections.push(target);
    const socket = new FakeSocket(this);
    setImmediate(() => {
      if (!this.online) {
        const err = Object.assign(new Error(`connect ECONNREFUSED ${target.host}`), {
          code: 'ECONNREFUSED',
        });
        socket.emit('error', err);
        socket.destroy();
        return;
      }
      socket.emit('connect');
    });
    return socket;
  }

  answer(event) {
    if (this.hang) {
      return null;
    }
    if (event.type === 'describe') {
      return this.info ? encodeEvent('info', this.info) : DESCRIBE_BYTES;
    }
    if (event.type === 'synthesize') {
      const name = event.data.voice?.name;
      if (name && this.voices && !this.voices.includes(name)) {
        return encodeEvent('error', { text: name, code: 'VoiceNotFoundError' });
      }
      return this.audio;
    }
    return null;
  }

  /** The `synthesize` requests received, in order. */
  get syntheses() {
    return this.requests.filter((event) => event.type === 'synthesize');
  }
}
