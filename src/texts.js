// -----------------------------------------------------------------------------
// Every text the container sends to Gladys, in the four languages of its
// interface (German says "du", Spanish "usted"). test/i18n.test.js checks them.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './wyoming.js';

// Connection status of the Supervision screen (setConnectionStatus takes the
// whole object, never one language).
export const CONNECTION_TEXT = {
  notConfigured: {
    en: 'Enter the address of your Wyoming server (Piper) in the configuration.',
    fr: "Saisissez l'adresse de votre serveur Wyoming (Piper) dans la configuration.",
    de: 'Gib in der Konfiguration die Adresse deines Wyoming-Servers (Piper) ein.',
    es: 'Introduzca la dirección de su servidor Wyoming (Piper) en la configuración.',
  },
  unreachable: {
    en: 'The Wyoming server does not answer: check its address, its port and that it is running.',
    fr: 'Le serveur Wyoming ne répond pas : vérifiez son adresse, son port et qu’il est démarré.',
    de: 'Der Wyoming-Server antwortet nicht: prüfe Adresse, Port und ob er läuft.',
    es: 'El servidor Wyoming no responde: compruebe su dirección, su puerto y que esté en marcha.',
  },
  noTts: {
    en: 'This Wyoming server offers no text-to-speech (is it a speech-to-text server?).',
    fr: 'Ce serveur Wyoming ne propose pas de synthèse vocale (serveur de reconnaissance ?).',
    de: 'Dieser Wyoming-Server bietet keine Sprachausgabe (ein Spracherkennungs-Server?).',
    es: 'Este servidor Wyoming no ofrece síntesis de voz (¿es un servidor de reconocimiento?).',
  },
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
    de: 'Die Initialisierung ist fehlgeschlagen, sieh in den Logs der Integration nach.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
};

// Why a synthesis or an action failed (one entry per ERROR_KINDS value, plus
// the missing address).
export const ERROR_TEXT = {
  [ERROR_KINDS.unreachable]: {
    en: 'The Wyoming server does not answer.',
    fr: 'Le serveur Wyoming ne répond pas.',
    de: 'Der Wyoming-Server antwortet nicht.',
    es: 'El servidor Wyoming no responde.',
  },
  [ERROR_KINDS.timeout]: {
    en: 'The Wyoming server took too long to speak.',
    fr: 'Le serveur Wyoming a mis trop de temps à parler.',
    de: 'Der Wyoming-Server hat zu lange zum Sprechen gebraucht.',
    es: 'El servidor Wyoming ha tardado demasiado en hablar.',
  },
  [ERROR_KINDS.protocol]: {
    en: 'The Wyoming server sent an unexpected answer.',
    fr: 'Le serveur Wyoming a envoyé une réponse inattendue.',
    de: 'Der Wyoming-Server hat eine unerwartete Antwort geschickt.',
    es: 'El servidor Wyoming ha enviado una respuesta inesperada.',
  },
  [ERROR_KINDS.server]: {
    en: 'The Wyoming server refused the text (unknown voice?).',
    fr: 'Le serveur Wyoming a refusé le texte (voix inconnue ?).',
    de: 'Der Wyoming-Server hat den Text abgelehnt (unbekannte Stimme?).',
    es: 'El servidor Wyoming ha rechazado el texto (¿voz desconocida?).',
  },
  [ERROR_KINDS.noTts]: {
    en: 'This Wyoming server offers no text-to-speech.',
    fr: 'Ce serveur Wyoming ne propose pas de synthèse vocale.',
    de: 'Dieser Wyoming-Server bietet keine Sprachausgabe.',
    es: 'Este servidor Wyoming no ofrece síntesis de voz.',
  },
  [ERROR_KINDS.tooLong]: {
    en: 'The audio is too long for Gladys (5 MB at most).',
    fr: "L'audio est trop long pour Gladys (5 Mo au maximum).",
    de: 'Das Audio ist zu lang für Gladys (höchstens 5 MB).',
    es: 'El audio es demasiado largo para Gladys (5 MB como máximo).',
  },
  notConfigured: {
    en: 'No Wyoming server configured.',
    fr: 'Aucun serveur Wyoming configuré.',
    de: 'Kein Wyoming-Server konfiguriert.',
    es: 'Ningún servidor Wyoming configurado.',
  },
};

// The sentence of the "Test the voice" action when no text is given.
export const SAMPLE_TEXT = {
  en: 'Hello, this is Gladys speaking through your Wyoming server.',
  fr: 'Bonjour, ici Gladys, qui parle grâce à votre serveur Wyoming.',
  de: 'Hallo, hier spricht Gladys über deinen Wyoming-Server.',
  es: 'Hola, le habla Gladys a través de su servidor Wyoming.',
};

// How a voice was chosen, shown in the action reports.
export const SOURCE_TEXT = {
  en: { preferred: 'listed', automatic: 'automatic', default: 'default', server: 'server default' },
  fr: {
    preferred: 'listée',
    automatic: 'automatique',
    default: 'par défaut',
    server: 'défaut du serveur',
  },
  de: {
    preferred: 'gelistet',
    automatic: 'automatisch',
    default: 'Standard',
    server: 'Server-Standard',
  },
  es: {
    preferred: 'de la lista',
    automatic: 'automática',
    default: 'por defecto',
    server: 'del servidor',
  },
};

// Reports of the manifest actions (functions of their figures).
export const REPORT_TEXT = {
  en: {
    tested: ({ voice, seconds, size, elapsed }) =>
      `${voice}: ${seconds} s of audio (${size}) synthesized in ${elapsed} s.`,
    voices: ({ count, list }) => `${count} voices. ${list}`,
    languageVoices: ({ language, count, list }) => `${count} voices for “${language}”: ${list}`,
    noVoice: ({ language }) => `No voice for “${language}”: the default voice will speak.`,
    more: ({ count }) => `and ${count} more`,
    used: 'used',
  },
  fr: {
    tested: ({ voice, seconds, size, elapsed }) =>
      `${voice} : ${seconds} s d'audio (${size}) synthétisées en ${elapsed} s.`,
    voices: ({ count, list }) => `${count} voix. ${list}`,
    languageVoices: ({ language, count, list }) => `${count} voix pour « ${language} » : ${list}`,
    noVoice: ({ language }) => `Aucune voix pour « ${language} » : la voix par défaut parlera.`,
    more: ({ count }) => `et ${count} autres`,
    used: 'utilisée',
  },
  de: {
    tested: ({ voice, seconds, size, elapsed }) =>
      `${voice}: ${seconds} s Audio (${size}) in ${elapsed} s erzeugt.`,
    voices: ({ count, list }) => `${count} Stimmen. ${list}`,
    languageVoices: ({ language, count, list }) => `${count} Stimmen für „${language}“: ${list}`,
    noVoice: ({ language }) => `Keine Stimme für „${language}“: die Standardstimme spricht.`,
    more: ({ count }) => `und ${count} weitere`,
    used: 'genutzt',
  },
  es: {
    tested: ({ voice, seconds, size, elapsed }) =>
      `${voice}: ${seconds} s de audio (${size}) sintetizados en ${elapsed} s.`,
    voices: ({ count, list }) => `${count} voces. ${list}`,
    languageVoices: ({ language, count, list }) => `${count} voces para «${language}»: ${list}`,
    noVoice: ({ language }) => `Ninguna voz para «${language}»: hablará la voz por defecto.`,
    more: ({ count }) => `y ${count} más`,
    used: 'en uso',
  },
};

/** One multi-language object from a function of the language. */
export function localized(build) {
  return Object.fromEntries(
    Object.keys(REPORT_TEXT).map((language) => [language, build(language)]),
  );
}
