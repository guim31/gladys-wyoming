// -----------------------------------------------------------------------------
// What the integration writes at the default level (info): the lifecycle
// only. A normal check or announcement writes nothing, an outage is logged
// once and its end once. Never the spoken text.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from './helpers/world.js';

function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record = (...args) =>
    lines.push(args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'warn', record);
  t.mock.method(console, 'error', record);
  return { lines, clear: () => lines.splice(0) };
}

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

test('normal checks and announcements write nothing at info', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  assert.ok(
    logs.lines.some((line) => line.includes('Connected to the Wyoming server')),
    'the start is logged',
  );
  logs.clear();
  for (let i = 0; i < 5; i += 1) {
    w.clock.advance(60_000);
    await w.provider.refresh();
    await w.fake.ttsSynthesize('Le lave-linge a terminé.', 'fr');
  }
  assert.deepEqual(logs.lines, []);
});

test('an outage writes one line when it starts and one when it ends', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  w.server.online = false;
  for (let i = 0; i < 6; i += 1) {
    w.clock.advance(60_000);
    await w.provider.refresh();
    await w.fake.ttsSynthesize('Bonjour', 'fr');
  }
  w.server.online = true;
  await w.provider.refresh();
  assert.equal(logs.lines.length, 2, logs.lines.join('\n'));
  assert.match(logs.lines[0], /ECONNREFUSED/);
  assert.match(logs.lines[1], /answers again after 5 min/);
});

test('the spoken text never reaches the logs, even in debug', async (t) => {
  const logs = captureLogs(t, 'debug');
  const w = await world(t);
  await w.fake.ttsSynthesize('Code de la porte : 4521', 'fr');
  w.server.hang = true;
  w.provider.timings.synthesizeTimeoutMs = 50;
  await w.fake.ttsSynthesize('Alarme désactivée par Marie', 'fr');
  const all = logs.lines.join('\n');
  assert.match(all, /Spoke 23 characters with fr_FR-siwis-medium/);
  for (const secret of ['4521', 'porte', 'Marie', 'Alarme']) {
    assert.ok(!all.includes(secret), secret);
  }
});
