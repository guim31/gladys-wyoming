// -----------------------------------------------------------------------------
// Configuration: DEFAULT_CONFIG mirrors the `default` values of the manifest's
// config_schema (test/manifest.test.js keeps them in sync).
// -----------------------------------------------------------------------------

import { FORMATS } from './audio.js';
import { parsePreferred } from './voices.js';

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

export const DEFAULT_CONFIG = Object.freeze({
  host: '',
  port: 10200,
  voices: '',
  audio_format: 'mp3',
});

/**
 * Accepts `192.0.2.10`, `piper.lan`, `tcp://192.0.2.10:10200` (the address
 * Home Assistant shows) or `[2001:db8::1]`; a port written in the host wins
 * over the port field.
 */
export function parseHost(text, fallbackPort) {
  let host = typeof text === 'string' ? text.trim() : '';
  let port = fallbackPort;
  host = host.replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '');
  const bracketed = host.match(/^\[([^\]]+)\](?::(\d+))?$/);
  if (bracketed) {
    host = bracketed[1];
    port = bracketed[2] ? Number(bracketed[2]) : port;
  } else {
    const withPort = host.match(/^([^:]+):(\d+)$/);
    if (withPort) {
      host = withPort[1];
      port = Number(withPort[2]);
    }
  }
  return { host, port };
}

function validPort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : fallback;
}

export function normalizeConfig(raw = {}) {
  const config = { ...DEFAULT_CONFIG, ...(raw ?? {}) };
  const fieldPort = validPort(config.port, DEFAULT_CONFIG.port);
  const { host, port } = parseHost(config.host, fieldPort);
  return {
    host,
    port: validPort(port, fieldPort),
    preferred: parsePreferred(config.voices),
    format: FORMATS.includes(config.audio_format)
      ? config.audio_format
      : DEFAULT_CONFIG.audio_format,
  };
}
