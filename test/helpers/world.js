// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys and a fake Wyoming server, with
// the integration wired on top through registerHandlers. No timer runs: the
// tests check the server with `world.provider.refresh()`.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { FakeWyoming } from './fakeWyoming.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const HOST = '192.0.2.30';

/** A manual clock. */
export function createClock(start = Date.parse('2026-11-09T10:00:00Z')) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export async function createWorld({
  clock = createClock(),
  server = new FakeWyoming(),
  config = { host: HOST },
  connect = true,
  timings = {},
} = {}) {
  const gladys = createFakeGladys({ config });
  const app = registerHandlers(gladys, {
    connect: server.connect,
    timers: false,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, server, app, provider: app.provider, clock };
}

export { FakeWyoming };
