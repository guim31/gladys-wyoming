// -----------------------------------------------------------------------------
// The text-to-speech provider: follows the Wyoming server (its voices, whether
// it answers), speaks the texts Gladys sends, and serves the two buttons of
// the Configuration screen.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { MAX_CLIP_BYTES, Mp3Stream, durationSeconds, encodeWav } from './audio.js';
import { LANGUAGES } from './config.js';
import { splitText } from './text.js';
import {
  CONNECTION_TEXT,
  ERROR_TEXT,
  REPORT_TEXT,
  SAMPLE_TEXT,
  SOURCE_TEXT,
  localized,
} from './texts.js';
import {
  chooseVoice,
  hasTts,
  parseVoices,
  primaryLanguage,
  voiceLanguages,
  wyomingVoice,
} from './voices.js';
import { ERROR_KINDS, WyomingError, describe, synthesize } from './wyoming.js';

const logger = createLogger({ name: 'wyoming' });

// Manifest scene triggers: the server stops / starts answering.
export const TRIGGERS = { offline: 'server_offline', online: 'server_online' };

export const DEFAULT_TIMINGS = Object.freeze({
  // How often the server is described (voices, reachability).
  checkIntervalMs: 60_000,
  describeTimeoutMs: 10_000,
  // The core waits 30 s for the clip: leave room for the encoding (a few
  // seconds on a Raspberry Pi) and the relay. Past it, the beginning speaks.
  synthesizeTimeoutMs: 22_000,
  // The "Test the voice" button waits up to 120 s: a voice Piper has not
  // downloaded yet takes its first download time.
  testTimeoutMs: 110_000,
});

// Longest voice list shown under the "Show the voices" button.
const MAX_LISTED = 25;
const MAX_SPEAKERS = 4;

// Between two pieces of a long text (Piper ends its sentences with 0.2 s).
const PAUSE_SECONDS = 0.2;

/** Silent PCM (8-bit audio is unsigned: its silence is 128). */
function silence({ rate, width, channels }, seconds) {
  const bytes = Math.round(rate * seconds) * width * channels;
  return Buffer.alloc(bytes, width === 1 ? 128 : 0);
}

const round1 = (value) => Math.round(value * 10) / 10;

function formatSize(bytes) {
  return bytes >= 1024 * 1024
    ? `${round1(bytes / 1024 / 1024)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
}

function asWyomingError(err) {
  return err instanceof WyomingError ? err : new WyomingError(ERROR_KINDS.protocol, err.message);
}

export class WyomingProvider {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {Function} [options.connect] net.connect seam for the tests
   * @param {boolean} [options.timers] false in the tests: they call refresh()
   * @param {object} [options.timings]
   * @param {() => number} [options.now] clock seam
   */
  constructor({ gladys, connect, timers = true, timings = {}, now = () => Date.now() }) {
    this.gladys = gladys;
    this.connect = connect;
    this.useTimers = timers;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.now = now;
    this.config = null;
    this.voices = [];
    // null until the first check, then 'online' | 'offline' | 'unconfigured'.
    this.state = null;
    this.downSince = null;
    this.timer = null;
  }

  async start(config) {
    this.config = config;
    await this.refresh();
    if (this.useTimers && !this.timer) {
      this.timer = setInterval(() => {
        this.refresh().catch((err) => logger.error('Server check failed', err));
      }, this.timings.checkIntervalMs);
      this.timer.unref?.();
    }
  }

  async reconfigure(config) {
    const moved =
      !this.config || this.config.host !== config.host || this.config.port !== config.port;
    this.config = config;
    if (moved) {
      logger.info('Configuration updated: new server address');
      this.voices = [];
      // A new server is not the same one coming back: no scene event.
      this.state = null;
    }
    await this.refresh();
  }

  /** After a Gladys restart: Gladys may have lost the connection status. */
  async resync(config) {
    this.config = config;
    this.state = this.state === 'online' || this.state === 'offline' ? this.state : null;
    await this.publishStatus();
    await this.refresh();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  get address() {
    return `${this.config.host}:${this.config.port}`;
  }

  /** Describes the server: voices and reachability. */
  async refresh() {
    if (!this.config?.host) {
      await this.setState('unconfigured');
      return;
    }
    try {
      const info = await describe({
        host: this.config.host,
        port: this.config.port,
        timeoutMs: this.timings.describeTimeoutMs,
        connect: this.connect,
      });
      if (!hasTts(info)) {
        throw new WyomingError(ERROR_KINDS.noTts, 'No tts program in the server info');
      }
      this.voices = parseVoices(info);
      await this.setState('online');
    } catch (err) {
      await this.setState('offline', asWyomingError(err));
    }
  }

  /** Records a reachability change: one log line, the status, the scene event. */
  async setState(state, error = null) {
    const previous = this.state;
    this.error = error;
    if (state === previous) {
      return;
    }
    this.state = state;
    if (state === 'online') {
      const voices = this.voices.length;
      if (previous === 'offline' && this.downSince !== null) {
        const minutes = Math.max(1, Math.round((this.now() - this.downSince) / 60_000));
        logger.info(`Wyoming server ${this.address} answers again after ${minutes} min`);
      } else {
        logger.info(`Connected to the Wyoming server ${this.address} (${voices} voices)`);
      }
      this.downSince = null;
    } else if (state === 'offline') {
      this.downSince = this.now();
      logger.warn(`Wyoming server ${this.address} unavailable: ${error.message}`);
    } else {
      logger.info('No Wyoming server configured yet');
    }
    await this.publishStatus();
    // Scene events on a real transition only, not on the first check.
    if (previous === 'online' && state === 'offline') {
      await this.fire(TRIGGERS.offline);
    } else if (previous === 'offline' && state === 'online') {
      await this.fire(TRIGGERS.online);
    }
  }

  async publishStatus() {
    if (this.state === null) {
      return;
    }
    try {
      if (this.state === 'online') {
        await this.gladys.setConnectionStatus(true);
      } else if (this.state === 'unconfigured') {
        await this.gladys.setConnectionStatus(false, CONNECTION_TEXT.notConfigured);
      } else {
        const message =
          this.error?.kind === ERROR_KINDS.noTts
            ? CONNECTION_TEXT.noTts
            : CONNECTION_TEXT.unreachable;
        await this.gladys.setConnectionStatus(false, message);
      }
    } catch (err) {
      logger.error('Could not publish the connection status', err);
    }
  }

  async fire(key) {
    try {
      await this.gladys.publishSceneEvent(key, {});
    } catch (err) {
      logger.error(`Could not fire the ${key} scene trigger`, err);
    }
  }

  voiceFor(language) {
    return chooseVoice({ language, preferred: this.config.preferred, voices: this.voices });
  }

  /**
   * Synthesizes a text into a clip: `{ clip, choice, seconds }`. Throws a
   * WyomingError; a server that stops answering switches the status.
   */
  async speak(text, language, timeoutMs, { keepBeginning = false } = {}) {
    if (!this.config?.host) {
      throw new WyomingError('notConfigured', 'No Wyoming server configured');
    }
    const choice = this.voiceFor(language);
    let result;
    try {
      result = await this.speakPieces(splitText(text), choice, timeoutMs, keepBeginning);
    } catch (err) {
      const error = asWyomingError(err);
      if (error.kind === ERROR_KINDS.unreachable) {
        await this.setState('offline', error);
      }
      throw error;
    }
    if (this.state !== 'online') {
      // It answered: the next check will refresh the voices.
      await this.refresh();
    }
    if (!result.clip) {
      throw new WyomingError(ERROR_KINDS.tooLong, 'Clip above 5 MB even resampled');
    }
    return { ...result, choice };
  }

  /**
   * Synthesizes the pieces one after the other under one deadline, joined
   * by a short pause. With `keepBeginning`, the deadline ends the clip with
   * the pieces (and the part of a piece) already spoken.
   */
  async speakPieces(pieces, choice, timeoutMs, keepBeginning) {
    const deadline = this.now() + timeoutMs;
    const wav = this.config.format === 'wav';
    const parts = []; // WAV: the PCM, joined at the end
    let mp3 = null; // MP3: encoded while the next piece is synthesized
    let encoding = Promise.resolve();
    let format = null;
    let seconds = 0;
    let truncated = false;
    const append = (audio) => {
      seconds += durationSeconds(audio);
      if (wav) {
        parts.push(audio.pcm);
      } else {
        mp3 ??= new Mp3Stream(audio.rate);
        encoding = encoding.then(() => mp3.add(audio));
        // Handled here so a synthesis error thrown first cannot leave it
        // unhandled; the final `await encoding` still sees the failure.
        encoding.catch(() => {});
      }
    };
    for (const piece of pieces.length > 0 ? pieces : ['']) {
      const remaining = deadline - this.now();
      if (format && remaining < 500) {
        truncated = true;
        break;
      }
      let audio;
      try {
        audio = await synthesize({
          host: this.config.host,
          port: this.config.port,
          text: piece,
          voice: wyomingVoice(choice),
          timeoutMs: Math.max(remaining, 500),
          keepBeginning,
          connect: this.connect,
        });
      } catch (err) {
        if (keepBeginning && format && err.kind === ERROR_KINDS.timeout) {
          truncated = true;
          break;
        }
        throw err;
      }
      if (format) {
        const sameFormat =
          audio.rate === format.rate &&
          audio.width === format.width &&
          audio.channels === format.channels;
        if (!sameFormat) {
          truncated = true;
          break;
        }
        append({ ...format, pcm: silence(format, PAUSE_SECONDS) });
      }
      format ??= { rate: audio.rate, width: audio.width, channels: audio.channels };
      append(audio);
      if (audio.truncated) {
        truncated = true;
        break;
      }
    }
    if (wav) {
      const clip = encodeWav({ ...format, pcm: Buffer.concat(parts) });
      return { clip: clip && { contentType: 'audio/wav', ...clip }, seconds, truncated };
    }
    await encoding;
    const buffer = mp3.finish();
    const clip =
      buffer.length <= MAX_CLIP_BYTES
        ? { contentType: 'audio/mpeg', buffer, rate: mp3.rate }
        : null;
    return { clip, seconds, truncated };
  }

  /** onTtsSynthesize: `audio/…;base64,…`. */
  async synthesize(text, language) {
    const started = this.now();
    try {
      const { clip, choice, seconds, truncated } = await this.speak(
        text,
        language,
        this.timings.synthesizeTimeoutMs,
        { keepBeginning: true },
      );
      const summary =
        `${text.length} characters with ${choice.name ?? 'the server default voice'} ` +
        `(${choice.source}): ${round1(seconds)} s, ${formatSize(clip.buffer.length)}, ` +
        `${this.now() - started} ms`;
      if (truncated) {
        // Gladys would fail the whole announcement past its 30 s: speak the beginning.
        logger.warn(`Server too slow for the whole text, clip cut: ${summary}`);
      } else {
        logger.debug(`Spoke ${summary}`);
      }
      return `${clip.contentType};base64,${clip.buffer.toString('base64')}`;
    } catch (err) {
      // An outage is already logged once by setState.
      if (err.kind !== ERROR_KINDS.unreachable) {
        logger.warn(`Synthesis of ${text.length} characters failed: ${err.message}`);
      }
      // The core logs this message and shows it in the scene log.
      const reason = (ERROR_TEXT[err.kind] ?? ERROR_TEXT[ERROR_KINDS.protocol]).en;
      throw new Error(err.serverText ? `${reason} ${err.serverText}` : reason, { cause: err });
    }
  }

  /** "Test the voice" button. */
  async testVoice(fields = {}) {
    const language = LANGUAGES.includes(fields.language) ? fields.language : 'fr';
    const custom = typeof fields.text === 'string' ? fields.text.trim() : '';
    const text = custom === '' ? SAMPLE_TEXT[language] : custom.slice(0, 2000);
    logger.info(`Action test_voice (${language})`);
    const started = this.now();
    try {
      const { clip, choice, seconds } = await this.speak(
        text,
        language,
        this.timings.testTimeoutMs,
      );
      const elapsed = round1((this.now() - started) / 1000);
      const format = clip.contentType === 'audio/mpeg' ? 'MP3' : 'WAV';
      return localized((lang) => {
        const voice = `${choice.name ?? '?'} (${SOURCE_TEXT[lang][choice.source]})`;
        return REPORT_TEXT[lang].tested({
          voice,
          seconds: round1(seconds),
          size: `${format} ${formatSize(clip.buffer.length)}`,
          elapsed,
        });
      });
    } catch (err) {
      logger.warn(`Voice test failed: ${err.message}`);
      return this.errorReport(err);
    }
  }

  /** "Show the voices" button. */
  async listVoices(fields = {}) {
    logger.info('Action list_voices');
    await this.refresh();
    if (this.state !== 'online') {
      return this.state === 'unconfigured'
        ? ERROR_TEXT.notConfigured
        : this.errorReport(this.error ?? new WyomingError(ERROR_KINDS.unreachable, ''));
    }
    const language = primaryLanguage(fields.language);
    if (language) {
      const names = this.voices
        .filter((voice) => voiceLanguages(voice.name, this.voices).includes(language))
        .map((voice) => this.describeVoice(voice));
      const used = this.voiceFor(language);
      return localized((lang) => {
        if (names.length === 0) {
          return REPORT_TEXT[lang].noVoice({ language });
        }
        return REPORT_TEXT[lang].languageVoices({
          language,
          count: names.length,
          list: this.joinList(names, lang, used.name),
        });
      });
    }
    // Without a language: the voice each language of Gladys would use.
    return localized((lang) => {
      const list = LANGUAGES.map((code) => {
        const choice = this.voiceFor(code);
        return `${code}: ${choice.name ?? '—'} (${SOURCE_TEXT[lang][choice.source]})`;
      }).join(', ');
      return REPORT_TEXT[lang].voices({ count: this.voices.length, list });
    });
  }

  describeVoice(voice) {
    const { name, speakers } = voice;
    if (speakers.length === 0) {
      return name;
    }
    // Some voices have hundreds of numbered speakers (fr_FR-mls-medium: 124).
    const shown = speakers.slice(0, MAX_SPEAKERS).join(', ');
    return speakers.length > MAX_SPEAKERS
      ? `${name} [${shown}… +${speakers.length - MAX_SPEAKERS}]`
      : `${name} [${shown}]`;
  }

  joinList(names, lang, usedName) {
    const marked = names.map((name) =>
      usedName && (name === usedName || name.startsWith(`${usedName} [`))
        ? `${name} (${REPORT_TEXT[lang].used})`
        : name,
    );
    const shown = marked.slice(0, MAX_LISTED);
    if (marked.length > MAX_LISTED) {
      shown.push(REPORT_TEXT[lang].more({ count: marked.length - MAX_LISTED }));
    }
    return shown.join(', ');
  }

  errorReport(err) {
    const base = ERROR_TEXT[err.kind] ?? ERROR_TEXT[ERROR_KINDS.protocol];
    if (!err.serverText) {
      return base;
    }
    const detail = err.serverText.slice(0, 120);
    return localized((lang) => `${base[lang]} (${detail})`);
  }
}
