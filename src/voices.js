// -----------------------------------------------------------------------------
// Voices: what the server offers (its `info` event) and which one speaks a
// given language. The user lists preferred voices in the configuration; for a
// language none of them speaks, the integration picks one the server offers.
// -----------------------------------------------------------------------------

// The voices Home Assistant suggests for Piper: picked first when the server
// offers them, so "automatic" sounds the same as the usual setups.
export const KNOWN_GOOD_VOICES = [
  'fr_FR-siwis-medium',
  'en_US-lessac-medium',
  'en_GB-alba-medium',
  'de_DE-thorsten-medium',
  'es_ES-davefx-medium',
];

// Piper's quality suffixes, best compromise (speed on a Pi, sound) first.
const QUALITY_ORDER = ['medium', 'high', 'low', 'x_low'];

/** `fr_FR`, `fr-FR`, `FR` → `fr`; null for anything else. */
export function primaryLanguage(code) {
  if (typeof code !== 'string') {
    return null;
  }
  const match = code.trim().match(/^([a-z]{2,3})(?:[_-]|$)/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * The TTS voices of an `info` event: `[{ name, languages, speakers,
 * description }]`, uninstalled ones left out (a server lists them for
 * information only).
 */
export function parseVoices(info) {
  const programs = Array.isArray(info?.tts) ? info.tts : [];
  const voices = [];
  const seen = new Set();
  for (const program of programs) {
    for (const voice of Array.isArray(program?.voices) ? program.voices : []) {
      if (typeof voice?.name !== 'string' || voice.name === '' || voice.installed === false) {
        continue;
      }
      if (seen.has(voice.name)) {
        continue;
      }
      seen.add(voice.name);
      voices.push({
        name: voice.name,
        languages: (Array.isArray(voice.languages) ? voice.languages : []).filter(
          (language) => typeof language === 'string',
        ),
        speakers: (Array.isArray(voice.speakers) ? voice.speakers : [])
          .map((speaker) => speaker?.name)
          .filter((name) => typeof name === 'string' && name !== ''),
        description: typeof voice.description === 'string' ? voice.description : '',
      });
    }
  }
  return voices;
}

/** Whether the `info` event describes at least one TTS program. */
export function hasTts(info) {
  return Array.isArray(info?.tts) && info.tts.length > 0;
}

/**
 * The `voices` field of the configuration: names separated by commas, spaces
 * or new lines, `name:speaker` for a multi-speaker voice. The first one is the
 * default voice.
 */
export function parsePreferred(text) {
  if (typeof text !== 'string') {
    return [];
  }
  return text
    .split(/[\s,;]+/)
    .filter((entry) => entry !== '')
    .map((entry) => {
      const separator = entry.indexOf(':');
      if (separator > 0 && separator < entry.length - 1) {
        return { name: entry.slice(0, separator), speaker: entry.slice(separator + 1) };
      }
      return { name: entry.replace(/:$/, '') };
    });
}

/** The primary languages of a voice: from the server, else from its name (`fr_FR-…`). */
export function voiceLanguages(name, voices) {
  const known = voices.find((voice) => voice.name === name);
  const declared = (known?.languages ?? []).map(primaryLanguage).filter(Boolean);
  if (declared.length > 0) {
    return [...new Set(declared)];
  }
  const guessed = primaryLanguage(name);
  return guessed ? [guessed] : [];
}

function automaticRank(name) {
  const known = KNOWN_GOOD_VOICES.indexOf(name);
  const quality = QUALITY_ORDER.findIndex((suffix) => name.endsWith(`-${suffix}`));
  return [
    known === -1 ? KNOWN_GOOD_VOICES.length : known,
    quality === -1 ? QUALITY_ORDER.length : quality,
  ];
}

/** The voice the server offers for a language, null if none. */
export function automaticVoice(language, voices) {
  const candidates = voices.filter((voice) =>
    voiceLanguages(voice.name, voices).includes(language),
  );
  candidates.sort((a, b) => {
    const [ka, qa] = automaticRank(a.name);
    const [kb, qb] = automaticRank(b.name);
    return ka - kb || qa - qb || a.name.localeCompare(b.name);
  });
  return candidates[0] ?? null;
}

/**
 * Which voice speaks `language` (Gladys gives `fr`, `en`… or null).
 *
 * @returns {{ name?: string, speaker?: string, language?: string, source: string }}
 *   `source`: `preferred` (listed by the user for that language), `automatic`
 *   (picked among the server's voices), `default` (first listed voice: no
 *   voice for that language), `server` (nothing listed nor found: the
 *   server's own default voice).
 */
export function chooseVoice({ language, preferred, voices }) {
  const wanted = primaryLanguage(language);
  if (wanted) {
    const listed = preferred.find((entry) => voiceLanguages(entry.name, voices).includes(wanted));
    if (listed) {
      return { ...listed, source: 'preferred' };
    }
    const automatic = automaticVoice(wanted, voices);
    if (automatic) {
      return { name: automatic.name, source: 'automatic' };
    }
  }
  if (preferred.length > 0) {
    return { ...preferred[0], source: 'default' };
  }
  // No name: the server speaks with its default voice; the language may
  // still help a server that picks its voice by language.
  return wanted ? { language: wanted, source: 'server' } : { source: 'server' };
}

/** The `voice` object of a Wyoming `synthesize` event. */
export function wyomingVoice(choice) {
  const voice = {};
  for (const key of ['name', 'speaker', 'language']) {
    if (choice[key]) {
      voice[key] = choice[key];
    }
  }
  return voice;
}
