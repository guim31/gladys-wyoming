// -----------------------------------------------------------------------------
// The Wyoming protocol (https://github.com/OHF-Voice/wyoming), client side.
//
// Over TCP, every event is one JSON line (`type`, optional `data`,
// `data_length`, `payload_length`), followed by `data_length` bytes of JSON
// merged into `data`, then `payload_length` bytes of binary (PCM audio). A TCP
// read can cut anywhere, so the parser is a small state machine fed with
// whatever arrives.
// -----------------------------------------------------------------------------

import net from 'node:net';

// The protocol version the client advertises (servers do not check it).
export const PROTOCOL_VERSION = '1.11.0';

// Bounds against a broken or hostile server: the container has 256 MB.
const MAX_HEADER_BYTES = 1024 * 1024;
const MAX_DATA_BYTES = 8 * 1024 * 1024;
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;

// Why an exchange failed, for the user-facing messages (src/texts.js).
export const ERROR_KINDS = {
  unreachable: 'unreachable',
  timeout: 'timeout',
  protocol: 'protocol',
  server: 'server',
  noTts: 'noTts',
  tooLong: 'tooLong',
};

export class WyomingError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message technical detail, for the logs
   * @param {object} [extra] `serverText` (the text of a Wyoming `error` event)
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'WyomingError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

/** Serializes one event the way the Python reference does (data after the line). */
export function encodeEvent(type, data, payload) {
  const header = { type, version: PROTOCOL_VERSION };
  const parts = [];
  let dataBytes = null;
  if (data && Object.keys(data).length > 0) {
    dataBytes = Buffer.from(JSON.stringify(data), 'utf8');
    header.data_length = dataBytes.length;
  }
  if (payload && payload.length > 0) {
    header.payload_length = payload.length;
  }
  parts.push(Buffer.from(`${JSON.stringify(header)}\n`, 'utf8'));
  if (dataBytes) {
    parts.push(dataBytes);
  }
  if (payload && payload.length > 0) {
    parts.push(payload);
  }
  return Buffer.concat(parts);
}

/**
 * Incremental parser: `push(chunk)` returns the events completed by that
 * chunk, `{ type, data, payload }` (payload: Buffer or null). Throws a
 * WyomingError('protocol') on malformed input.
 */
export class EventParser {
  constructor() {
    this.buffer = Buffer.alloc(0);
    this.pending = null; // header read, waiting for data and payload
  }

  push(chunk) {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    const events = [];
    for (;;) {
      if (!this.pending) {
        const newline = this.buffer.indexOf(0x0a);
        if (newline === -1) {
          if (this.buffer.length > MAX_HEADER_BYTES) {
            throw new WyomingError(ERROR_KINDS.protocol, 'Event header too long');
          }
          break;
        }
        const line = this.buffer.subarray(0, newline).toString('utf8').trim();
        this.buffer = this.buffer.subarray(newline + 1);
        if (line === '') {
          continue;
        }
        this.pending = parseHeader(line);
      }
      const { dataLength, payloadLength } = this.pending;
      if (this.buffer.length < dataLength + payloadLength) {
        break;
      }
      const event = this.pending.event;
      if (dataLength > 0) {
        event.data = { ...event.data, ...parseJson(this.buffer.subarray(0, dataLength)) };
      }
      if (payloadLength > 0) {
        // Copy: the parser's buffer is reused by the next chunks.
        event.payload = Buffer.from(this.buffer.subarray(dataLength, dataLength + payloadLength));
      }
      this.buffer = this.buffer.subarray(dataLength + payloadLength);
      this.pending = null;
      events.push(event);
    }
    return events;
  }
}

function parseHeader(line) {
  const header = parseJson(line);
  if (!header || typeof header.type !== 'string') {
    throw new WyomingError(ERROR_KINDS.protocol, 'Event without a type');
  }
  const dataLength = length(header.data_length, MAX_DATA_BYTES, 'data');
  const payloadLength = length(header.payload_length, MAX_PAYLOAD_BYTES, 'payload');
  const data = header.data && typeof header.data === 'object' ? header.data : {};
  return { event: { type: header.type, data, payload: null }, dataLength, payloadLength };
}

function length(value, max, what) {
  if (value === undefined || value === null) {
    return 0;
  }
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new WyomingError(ERROR_KINDS.protocol, `Invalid ${what} length ${value}`);
  }
  return value;
}

function parseJson(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    throw new WyomingError(ERROR_KINDS.protocol, 'Malformed JSON in an event');
  }
}

/**
 * One request/answer exchange on a fresh TCP connection (Piper closes nothing
 * on its side, Home Assistant opens one connection per request too).
 *
 * @param {object} options
 * @param {string} options.host
 * @param {number} options.port
 * @param {Buffer[]} options.send encoded events to write
 * @param {(event: object) => boolean} options.onEvent returns true when done
 * @param {number} options.timeoutMs deadline of the whole exchange
 * @param {() => boolean} [options.onDeadline] returns true to end the exchange
 *   successfully at the deadline (with what was received) instead of failing
 * @param {number} [options.connectTimeoutMs]
 * @param {typeof net.connect} [options.connect] test seam
 */
export function exchange({
  host,
  port,
  send,
  onEvent,
  timeoutMs,
  onDeadline = () => false,
  connectTimeoutMs = 5000,
  connect = net.connect,
}) {
  return new Promise((resolve, reject) => {
    const parser = new EventParser();
    let connected = false;
    let settled = false;
    const socket = connect({ host, port });

    const finish = (err) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(connectTimer);
      clearTimeout(deadline);
      socket.removeAllListeners('data');
      socket.destroy();
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };

    const connectTimer = setTimeout(() => {
      if (!connected) {
        finish(
          new WyomingError(ERROR_KINDS.unreachable, `No answer from ${host}:${port} (connect)`),
        );
      }
    }, connectTimeoutMs);
    const deadline = setTimeout(
      () =>
        onDeadline()
          ? finish()
          : finish(new WyomingError(ERROR_KINDS.timeout, `No complete answer in ${timeoutMs} ms`)),
      timeoutMs,
    );

    socket.on('connect', () => {
      connected = true;
      for (const buffer of send) {
        socket.write(buffer);
      }
    });
    socket.on('data', (chunk) => {
      try {
        for (const event of parser.push(chunk)) {
          if (event.type === 'error') {
            // Bounded: a Python exception text may quote the input.
            const text =
              typeof event.data.text === 'string' ? event.data.text.slice(0, 120) : 'unknown error';
            finish(
              new WyomingError(ERROR_KINDS.server, `Server error: ${text}`, { serverText: text }),
            );
            return;
          }
          if (onEvent(event)) {
            finish();
            return;
          }
        }
      } catch (err) {
        finish(
          err instanceof WyomingError ? err : new WyomingError(ERROR_KINDS.protocol, err.message),
        );
      }
    });
    socket.on('error', (err) => {
      const kind = connected ? ERROR_KINDS.protocol : ERROR_KINDS.unreachable;
      finish(new WyomingError(kind, `${err.code ?? 'Error'}: ${err.message}`));
    });
    socket.on('close', () => {
      finish(new WyomingError(ERROR_KINDS.protocol, 'Connection closed before the end'));
    });
  });
}

/** Asks the server what it offers: resolves the `data` of its `info` event. */
export async function describe({ host, port, timeoutMs = 10_000, connect }) {
  let info = null;
  await exchange({
    host,
    port,
    timeoutMs,
    connect,
    send: [encodeEvent('describe')],
    onEvent: (event) => {
      if (event.type === 'info') {
        info = event.data;
        return true;
      }
      return false;
    },
  });
  return info;
}

/**
 * Synthesizes one text: resolves `{ rate, width, channels, pcm }`.
 *
 * @param {object} options
 * @param {string} options.text
 * @param {{ name?: string, language?: string, speaker?: string }} [options.voice]
 * @param {number} [options.maxPcmBytes] refuse longer audio (memory bound)
 * @param {boolean} [options.keepBeginning] at the deadline, resolve the audio
 *   received so far (`truncated: true`) instead of failing: Piper streams a
 *   long text sentence by sentence, so its beginning is ready long before
 *   the end — the core itself truncates a long text rather than failing.
 */
export async function synthesize({
  host,
  port,
  text,
  voice,
  timeoutMs,
  connect,
  maxPcmBytes = 48 * 1024 * 1024,
  keepBeginning = false,
}) {
  let format = null;
  const chunks = [];
  let total = 0;
  let truncated = false;
  const data = { text };
  if (voice && Object.keys(voice).length > 0) {
    data.voice = voice;
  }
  await exchange({
    host,
    port,
    timeoutMs,
    connect,
    onDeadline: () => {
      truncated = keepBeginning && format !== null && total > 0;
      return truncated;
    },
    send: [encodeEvent('synthesize', data)],
    onEvent: (event) => {
      if (event.type === 'audio-start') {
        format = readFormat(event.data);
      } else if (event.type === 'audio-chunk') {
        // A chunk carries its format too: enough when audio-start is missing.
        format ??= readFormat(event.data);
        if (event.payload) {
          total += event.payload.length;
          if (total > maxPcmBytes) {
            throw new WyomingError(ERROR_KINDS.tooLong, `Audio longer than ${maxPcmBytes} bytes`);
          }
          chunks.push(event.payload);
        }
      } else if (event.type === 'audio-stop') {
        return true;
      }
      return false;
    },
  });
  if (!format) {
    throw new WyomingError(ERROR_KINDS.protocol, 'Audio without a format');
  }
  return { ...format, pcm: Buffer.concat(chunks, total), truncated };
}

function readFormat(data) {
  const { rate, width, channels } = data ?? {};
  const valid =
    Number.isInteger(rate) &&
    rate >= 4000 &&
    rate <= 192_000 &&
    [1, 2, 4].includes(width) &&
    Number.isInteger(channels) &&
    channels >= 1 &&
    channels <= 8;
  if (!valid) {
    throw new WyomingError(
      ERROR_KINDS.protocol,
      `Unsupported audio format ${JSON.stringify({ rate, width, channels })}`,
    );
  }
  return { rate, width, channels };
}
