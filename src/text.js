// -----------------------------------------------------------------------------
// Long texts are sent in pieces of a few sentences. A Piper server finishes a
// text once it has started it, even after the client left, and serves one
// text at a time: a 2,000-character announcement cut by the 30 s of Gladys
// would keep it busy for another minute and delay the next one. Sent piece by
// piece, only the piece in progress outlives the deadline.
// -----------------------------------------------------------------------------

export const MAX_PIECE_CHARACTERS = 300;

// After a sentence end, or a line break.
const SENTENCE_END = /(?<=[.!?…;:。！？])\s+|\n+/u;

/** Splits a sentence longer than `max` at commas, then at spaces. */
function splitLong(sentence, max) {
  const pieces = [];
  let rest = sentence;
  while (rest.length > max) {
    const window = rest.slice(0, max + 1);
    let cut = Math.max(window.lastIndexOf(', '), window.lastIndexOf(' '));
    if (cut < max / 3) {
      cut = window.lastIndexOf(' ');
    }
    if (cut <= 0) {
      cut = max - 1;
    }
    pieces.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest !== '') {
    pieces.push(rest);
  }
  return pieces;
}

/** The pieces of a text, whole sentences grouped up to `max` characters. */
export function splitText(text, max = MAX_PIECE_CHARACTERS) {
  const sentences = text
    .split(SENTENCE_END)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '')
    .flatMap((sentence) => splitLong(sentence, max));
  const pieces = [];
  for (const sentence of sentences) {
    const last = pieces.at(-1);
    if (last !== undefined && last.length + 1 + sentence.length <= max) {
      pieces[pieces.length - 1] = `${last} ${sentence}`;
    } else {
      pieces.push(sentence);
    }
  }
  return pieces;
}
