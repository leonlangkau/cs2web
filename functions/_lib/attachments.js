/**
 * Ticket attachments: accept, store and serve back.
 *
 * Screenshots and app logs are the difference between one reply and five, so
 * uploads are worth having — but a file uploaded by anyone on the internet
 * and served back from our own origin is a stored-XSS primitive if handled
 * carelessly. The rules here:
 *
 *  1. The stored MIME type is decided by US, from the file's magic bytes and
 *     its extension — never from the browser's Content-Type header.
 *  2. The allowlist contains no format that a browser will execute: no SVG,
 *     no HTML, no XML. An image whose bytes do not match a known image
 *     signature is stored as a plain-text download, not as an image.
 *  3. Everything that is not a verified raster image is served with
 *     `Content-Disposition: attachment`, so it downloads rather than renders.
 *  4. Files live in D1 as base64, hard-capped well under D1's 1 MB per-value
 *     limit, so deploying this needs no R2 bucket or other binding.
 */

/** Extension -> stored MIME. Nothing here is executable in a browser. */
const ALLOWED = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain',
  log: 'text/plain',
  cfg: 'text/plain',
  json: 'text/plain',
  csv: 'text/plain',
  pdf: 'application/pdf',
  zip: 'application/zip',
};

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

const EXT_LIST = Object.keys(ALLOWED);
const ACCEPT_ATTR = EXT_LIST.map((e) => `.${e}`).join(',');

/** Magic-byte signatures, so an .png that is really something else is caught. */
function sniff(bytes) {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05)) return 'application/zip';
  return null;
}

/** Strips directories and anything that is not a safe filename character. */
function safeFilename(raw) {
  const base = String(raw || 'file')
    .replace(/[\\/]/g, '_')
    // Anything outside the allowlist below (control characters included) becomes _
    .replace(/[^A-Za-z0-9._ -]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 80);
  return base || 'file';
}

const extensionOf = (filename) => {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
};

/** btoa() over a byte array, chunked so a large file cannot blow the stack. */
function toBase64(bytes) {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(String(value || ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Validates and encodes the uploads on a request.
 *
 * Returns { files: [{ filename, mime, bytes, data }], errors: [] }. Rejecting
 * a file never throws, and never silently drops it either — the caller decides
 * what a rejection means: opening a ticket sends the form back with the text
 * intact (the screenshot is often the point), while replying to an existing
 * one delivers the message anyway and reports the rejection as a warning,
 * because that text is already worth having.
 */
async function readUploads(c, cfg, field = 'files') {
  const maxBytes = cfg.attachMaxKb * 1024;
  const uploads = typeof c.req.files === 'function' ? c.req.files(field) : [];
  const files = [];
  const errors = [];

  for (const { file } of uploads) {
    if (!file || typeof file.arrayBuffer !== 'function') continue;
    const filename = safeFilename(file.name);
    if (!file.size) continue; // empty file input

    if (files.length >= cfg.attachMaxCount) {
      errors.push(`Only ${cfg.attachMaxCount} file${cfg.attachMaxCount === 1 ? '' : 's'} can be attached at a time — "${filename}" was not attached.`);
      continue;
    }
    if (file.size > maxBytes) {
      errors.push(`"${filename}" is ${Math.round(file.size / 1024)} KB; the limit is ${cfg.attachMaxKb} KB. Zip it, or paste the text instead.`);
      continue;
    }

    const ext = extensionOf(filename);
    let mime = ALLOWED[ext];
    if (!mime) {
      errors.push(`"${filename}" is not an accepted file type. Send a screenshot (${EXT_LIST.slice(0, 5).join(', ')}) or a log/text file.`);
      continue;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > maxBytes) {
      errors.push(`"${filename}" is larger than the ${cfg.attachMaxKb} KB limit.`);
      continue;
    }

    const sniffed = sniff(bytes);
    if (IMAGE_TYPES.has(mime) || mime === 'application/pdf' || mime === 'application/zip') {
      // A binary type must actually BE that type. If the bytes disagree, keep
      // the file but demote it to an inert download rather than guessing.
      if (sniffed !== mime) {
        if (sniffed && (IMAGE_TYPES.has(sniffed) || sniffed === 'application/pdf' || sniffed === 'application/zip')) {
          mime = sniffed;
        } else {
          mime = 'application/octet-stream';
        }
      }
    } else if (sniffed) {
      // A "log file" whose bytes are a PNG is not a log file.
      mime = IMAGE_TYPES.has(sniffed) ? sniffed : 'application/octet-stream';
    }

    files.push({ filename, mime, bytes: bytes.length, data: toBase64(bytes) });
  }

  return { files, errors };
}

/** Persists validated uploads against a ticket/message. */
async function saveUploads(db, { ticketId, messageId, uploaderId, uploaderName, uploaderRole }, files) {
  for (const f of files) {
    await db.run(
      `INSERT INTO ticket_attachments
         (ticket_id, message_id, uploader_id, uploader_name, uploader_role, filename, mime, bytes, data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ticketId, messageId, uploaderId, uploaderName, uploaderRole, f.filename, f.mime, f.bytes, f.data
    );
  }
  return files.length;
}

/**
 * Builds the response for one attachment. Only verified raster images render
 * inline; everything else downloads. `nosniff` is already set site-wide by
 * the security headers, and the CSP here is a second belt: even if a browser
 * were talked into treating the body as a document, it could execute nothing.
 */
function attachmentResponse(row) {
  const bytes = fromBase64(row.data);
  const inline = IMAGE_TYPES.has(row.mime);
  const filename = safeFilename(row.filename);
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': inline ? row.mime : 'application/octet-stream',
      'Content-Length': String(bytes.length),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename.replace(/"/g, '')}"`,
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      // Access is re-checked on every request, so the bytes must not linger in
      // a shared browser's cache after the person signs out or the ticket is
      // merged away from them.
      'Cache-Control': 'no-store',
    },
  });
}

export {
  ALLOWED, IMAGE_TYPES, EXT_LIST, ACCEPT_ATTR,
  safeFilename, sniff, toBase64, fromBase64,
  readUploads, saveUploads, attachmentResponse,
};
