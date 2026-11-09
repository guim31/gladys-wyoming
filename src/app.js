// -----------------------------------------------------------------------------
// Registers every SDK handler on a GladysIntegration (or the SDK's fake Gladys)
// and returns the provider, so index.js stays a few lines and the tests drive
// the very same wiring.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { WyomingProvider } from './provider.js';
import { CONNECTION_TEXT } from './texts.js';

const logger = createLogger({ name: 'wyoming-app' });

/**
 * @param {object} gladys GladysIntegration instance
 * @param {object} [options] test seams: connect, timers, timings, now
 */
export function registerHandlers(gladys, options = {}) {
  const provider = new WyomingProvider({
    gladys,
    connect: options.connect,
    timers: options.timers ?? true,
    timings: options.timings,
    now: options.now,
  });

  // Resolved once the provider has started; every handler waits for it, so a
  // text arriving during the first check is not lost.
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });
  let started = false;
  const whenReady =
    (fn) =>
    async (...args) => {
      await ready;
      return fn(...args);
    };

  gladys.on('connected', async () => {
    try {
      const config = normalizeConfig(await gladys.getConfig());
      if (started) {
        // A reconnection (Gladys restarted): send again what Gladys may have lost.
        await provider.resync(config);
        return;
      }
      started = true;
      await provider.start(config);
    } catch (err) {
      logger.error('Initialization failed', err);
      await gladys.setConnectionStatus(false, CONNECTION_TEXT.initFailed).catch(() => {});
    } finally {
      resolveReady();
    }
  });

  gladys.onTtsSynthesize(whenReady((text, language) => provider.synthesize(text, language)));

  gladys.onConfigUpdated(
    whenReady(async (newConfig) => {
      await provider.reconfigure(normalizeConfig(newConfig));
    }),
  );

  gladys.onAction(
    'test_voice',
    whenReady((fields) => provider.testVoice(fields)),
  );
  gladys.onAction(
    'list_voices',
    whenReady((fields) => provider.listVoices(fields)),
  );

  return { provider, ready, stop: () => provider.stop() };
}
