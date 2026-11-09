// -----------------------------------------------------------------------------
// From the raw PCM a Wyoming server streams to a clip Gladys accepts: MP3 (the
// format every speaker plays, Google Cast included, which announces any URL
// as audio/mp3) or WAV (no encoding at all). Pure JavaScript: no ffmpeg in the
// image.
//
// The core refuses a clip above 5 MB decoded. A 2,000-character text read by
// a Piper "medium" voice (22,050 Hz, 16 bits) lasts about 2.5 minutes, 6.6 MB
// of WAV: the WAV path then resamples the voice down (16,000, 11,025, then
// 8,000 Hz) until the clip fits. MP3 at 64 kbit/s never comes near the cap.
// -----------------------------------------------------------------------------

import { setImmediate as yieldToEventLoop } from 'node:timers/promises';
import { Mp3Encoder } from '@breezystack/lamejs';

// Mirrors MAX_TTS_AUDIO_SIZE_BYTES of the SDK (not exported).
export const MAX_CLIP_BYTES = 5 * 1024 * 1024;
export const MP3_BITRATE_KBPS = 64;
export const FORMATS = ['mp3', 'wav'];

// Sample rates an MP3 frame can carry (MPEG 1, 2 and 2.5).
const MP3_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000];
// Fallback rates of an oversized WAV clip, best first.
const WAV_FALLBACK_RATES = [16000, 11025, 8000];
// Samples per encoder call: a multiple of the 1,152 samples of an MP3 frame,
// small enough to yield to the event loop (the SDK's WebSocket) in between.
const MP3_BLOCK = 1152 * 64;

/** Converts interleaved PCM (8-bit unsigned, 16 or 32-bit signed) to 16-bit mono. */
export function toMono16({ pcm, width, channels }) {
  const frames = Math.floor(pcm.length / (width * channels));
  const out = new Int16Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const offset = (frame * channels + channel) * width;
      if (width === 1) {
        sum += (pcm[offset] - 128) << 8;
      } else if (width === 2) {
        sum += pcm.readInt16LE(offset);
      } else {
        sum += pcm.readInt32LE(offset) >> 16;
      }
    }
    out[frame] = Math.round(sum / channels);
  }
  return out;
}

/** Linear-interpolation resampling: good enough for speech, no dependency. */
export function resample(samples, fromRate, toRate) {
  if (fromRate === toRate || samples.length === 0) {
    return samples;
  }
  const length = Math.max(1, Math.floor((samples.length * toRate) / fromRate));
  const out = new Int16Array(length);
  const step = fromRate / toRate;
  for (let i = 0; i < length; i += 1) {
    const position = i * step;
    const index = Math.floor(position);
    const next = Math.min(index + 1, samples.length - 1);
    const fraction = position - index;
    out[i] = Math.round(samples[index] * (1 - fraction) + samples[next] * fraction);
  }
  return out;
}

/** A RIFF/WAVE file around PCM as is. */
export function wavFile({ pcm, rate, width, channels }) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * width * channels, 28);
  header.writeUInt16LE(width * channels, 32);
  header.writeUInt16LE(width * 8, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const int16Buffer = (samples) =>
  Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);

/** The WAV clip, resampled down when the original does not fit the core's cap. */
export function encodeWav(audio) {
  const original = wavFile(audio);
  if (original.length <= MAX_CLIP_BYTES) {
    return { buffer: original, rate: audio.rate };
  }
  const mono = toMono16(audio);
  for (const rate of WAV_FALLBACK_RATES.filter((candidate) => candidate < audio.rate)) {
    const pcm = int16Buffer(resample(mono, audio.rate, rate));
    if (pcm.length + 44 <= MAX_CLIP_BYTES) {
      return { buffer: wavFile({ pcm, rate, width: 2, channels: 1 }), rate };
    }
  }
  return null;
}

/**
 * Encodes MP3 (mono, 64 kbit/s) as the audio arrives: the pieces of a long
 * text are encoded while the server synthesizes the next ones, so the
 * deadline is not eaten by a final encoding (seconds on a Raspberry Pi).
 */
export class Mp3Stream {
  constructor(rate) {
    // Resample to the closest MP3 rate above (no loss), else the highest one.
    this.inputRate = rate;
    this.rate = MP3_RATES.includes(rate) ? rate : (MP3_RATES.find((r) => r >= rate) ?? 48000);
    this.encoder = new Mp3Encoder(1, this.rate, MP3_BITRATE_KBPS);
    this.parts = [];
  }

  async add(audio) {
    const samples = resample(toMono16(audio), this.inputRate, this.rate);
    for (let start = 0; start < samples.length; start += MP3_BLOCK) {
      this.push(this.encoder.encodeBuffer(samples.subarray(start, start + MP3_BLOCK)));
      await yieldToEventLoop();
    }
  }

  push(block) {
    if (block.length > 0) {
      this.parts.push(Buffer.from(block.buffer, block.byteOffset, block.length));
    }
  }

  finish() {
    this.push(this.encoder.flush());
    return Buffer.concat(this.parts);
  }
}

/** The MP3 clip of one stretch of audio. */
export async function encodeMp3(audio) {
  const stream = new Mp3Stream(audio.rate);
  await stream.add(audio);
  const buffer = stream.finish();
  return buffer.length <= MAX_CLIP_BYTES ? { buffer, rate: stream.rate } : null;
}

/** Duration of the PCM, in seconds. */
export function durationSeconds({ pcm, rate, width, channels }) {
  return pcm.length / (rate * width * channels);
}

/**
 * Builds the clip: `{ contentType, buffer, rate }`, or null when even the
 * smallest version exceeds the cap.
 */
export async function buildClip(audio, format) {
  if (format === 'wav') {
    const clip = encodeWav(audio);
    return clip && { contentType: 'audio/wav', ...clip };
  }
  const clip = await encodeMp3(audio);
  return clip && { contentType: 'audio/mpeg', ...clip };
}
