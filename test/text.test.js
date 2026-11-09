// -----------------------------------------------------------------------------
// Long texts are cut between sentences, never inside a word.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitText } from '../src/text.js';

test('short texts stay whole, long ones are grouped by sentences', () => {
  assert.deepEqual(splitText('Bonjour. Il fait beau !'), ['Bonjour. Il fait beau !']);
  assert.deepEqual(splitText('  '), []);
  const pieces = splitText('Une phrase. Deux phrases ? Trois.\nQuatre', 20);
  assert.deepEqual(pieces, ['Une phrase.', 'Deux phrases ?', 'Trois. Quatre']);
});

test('a sentence longer than a piece is cut at a comma or a space', () => {
  const sentence = `${'mot '.repeat(40)}fin, ${'autre '.repeat(30)}point`;
  const pieces = splitText(sentence, 100);
  assert.ok(
    pieces.every((piece) => piece.length <= 100),
    pieces.join('|'),
  );
  assert.equal(pieces.join(' ').replace(/\s+/g, ' '), sentence.replace(/\s+/g, ' '));
  assert.deepEqual(splitText('x'.repeat(250), 100), [
    'x'.repeat(100),
    'x'.repeat(100),
    'x'.repeat(50),
  ]);
});
