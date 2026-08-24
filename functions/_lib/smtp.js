/**
 * Minimal SMTPS client for Cloudflare's Email Service relay
 * (smtp.mx.cloudflare.net:465, implicit TLS, AUTH PLAIN with username
 * "api_token" and an API token carrying the "Email Sending: Edit"
 * permission as the password).
 *
 * On the Workers runtime the TCP connection comes from cloudflare:sockets;
 * the protocol logic itself is transport-agnostic and takes any object with
 * { readLine(), write(), close() }, which is how the test suite drives it
 * with a scripted fake. Port 25 is blocked on Workers, but 465 with
 * implicit TLS — exactly what this relay uses — is allowed.
 */

const CRLF = '\r\n';
const DEFAULT_TIMEOUT_MS = 15_000;

/** Wraps a bidirectional web-streams socket into a line-oriented transport. */
function lineTransport(socket, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const reader = socket.readable.getReader();
  const writer = socket.writable.getWriter();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  const withTimeout = (promise, what) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`smtp timeout: ${what}`)), timeoutMs)),
  ]);

  return {
    async readLine() {
      for (;;) {
        const nl = buffer.indexOf('\n');
        if (nl !== -1) {
          const line = buffer.slice(0, nl).replace(/\r$/, '');
          buffer = buffer.slice(nl + 1);
          return line;
        }
        const { value, done } = await withTimeout(reader.read(), 'read');
        if (done) throw new Error('smtp: connection closed by server');
        buffer += decoder.decode(value, { stream: true });
      }
    },
    async write(data) {
      await withTimeout(writer.write(encoder.encode(data)), 'write');
    },
    async close() {
      try { await writer.close(); } catch { /* already closed */ }
      try { reader.releaseLock(); } catch { /* fine */ }
      try { if (typeof socket.close === 'function') await socket.close(); } catch { /* fine */ }
    },
  };
}

/** Reads one (possibly multiline) SMTP reply; throws unless its code is expected. */
async function expectReply(transport, expected, phase) {
  let line;
  do {
    line = await transport.readLine();
  } while (/^\d{3}-/.test(line)); // continuation lines: "250-SIZE ..." until "250 ..."
  const code = Number(line.slice(0, 3));
  if (code !== expected) {
    throw new Error(`smtp ${phase}: expected ${expected}, got "${line.slice(0, 200)}"`);
  }
  return line;
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Dot-stuffing per RFC 5321 §4.5.2 plus CRLF normalisation. */
function encodeBody(text) {
  return String(text)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join(CRLF);
}

function buildMessage({ from, fromName, to, subject, text }) {
  // Body goes as base64 so UTF-8 (em dashes in our templates) never depends
  // on the relay's 8BITMIME support. Headers stay ASCII by construction.
  const bodyB64 = toBase64(String(text)).replace(/(.{76})/g, `$1${CRLF}`);
  return [
    `From: ${fromName ? `"${fromName.replace(/"/g, "'")}" ` : ''}<${from}>`,
    `To: <${to}>`,
    `Subject: ${String(subject).replace(/[\r\n]+/g, ' ').slice(0, 200)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBody(bodyB64),
  ].join(CRLF);
}

/**
 * Runs the SMTP conversation over an existing transport. Split out so tests
 * can drive it without a network.
 */
async function smtpConversation(transport, { username, password, from, fromName, to, subject, text }) {
  await expectReply(transport, 220, 'greeting');
  await transport.write(`EHLO goyhub${CRLF}`);
  await expectReply(transport, 250, 'EHLO');
  await transport.write(`AUTH PLAIN ${toBase64(`\u0000${username}\u0000${password}`)}${CRLF}`);
  await expectReply(transport, 235, 'AUTH');
  await transport.write(`MAIL FROM:<${from}>${CRLF}`);
  await expectReply(transport, 250, 'MAIL FROM');
  await transport.write(`RCPT TO:<${to}>${CRLF}`);
  await expectReply(transport, 250, 'RCPT TO');
  await transport.write(`DATA${CRLF}`);
  await expectReply(transport, 354, 'DATA');
  await transport.write(buildMessage({ from, fromName, to, subject, text }) + `${CRLF}.${CRLF}`);
  await expectReply(transport, 250, 'message accept');
  await transport.write(`QUIT${CRLF}`);
  // QUIT's 221 is best-effort; some relays just close.
  try { await transport.readLine(); } catch { /* fine */ }
}

/**
 * Sends one message through an SMTPS relay. `openSocket(host, port)` defaults
 * to cloudflare:sockets (Workers); tests inject their own transport factory
 * via `makeTransport`.
 */
async function sendViaSmtp(
  { host, port, username, password, from, fromName, to, subject, text },
  { openSocket, makeTransport = lineTransport } = {}
) {
  let socket = null;
  let transport = null;
  try {
    if (!openSocket) {
      const { connect } = await import('cloudflare:sockets');
      openSocket = (h, p) => connect(`${h}:${p}`, { secureTransport: 'on', allowHalfOpen: false });
    }
    socket = openSocket(host, port);
    transport = makeTransport(socket);
    await smtpConversation(transport, { username, password, from, fromName, to, subject, text });
    return { ok: true };
  } catch (err) {
    console.error('smtp send failed:', err && err.message);
    return { ok: false, error: String((err && err.message) || 'smtp_error').slice(0, 200) };
  } finally {
    if (transport) await transport.close().catch(() => {});
  }
}

export { sendViaSmtp, smtpConversation, buildMessage, lineTransport };
