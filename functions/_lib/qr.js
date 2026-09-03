/**
 * A QR encoder, because the payment page is not allowed to borrow one.
 *
 * /pay/<order> shows a wallet URI — "ethereum:0x5aAe…@1?value=2922652014437901",
 * "solana:Es9v…?amount=0.066123456&spl-token=Es9v…" — that a buyer sitting at a
 * desktop has to get into a phone wallet. Retyping a 42-character address is
 * precisely the mistake that sends somebody's money to a place nobody can spend
 * it from, so the page shows a QR code and the phone reads it.
 *
 * Every design decision here is forced by the site's Content-Security-Policy,
 * "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:":
 *
 *   - No CDN, so no qrcode.js off jsdelivr; script-src 'self' means any
 *     client-side encoder would have to be vendored into our own bundle, which
 *     is a lot of shipped bytes for one image on one page. So: server-side,
 *     dependency-free, emitted as inline SVG in the HTML we already send.
 *   - No style attribute and no <style> element, so the SVG carries its colours
 *     as presentation attributes (fill=, width=, shape-rendering=) only.
 *   - The site has a light and a dark theme, and the SVG has to scan in both.
 *     `currentColor` is the elegant answer and a trap — it gives dark-on-dark on
 *     one theme and an inverted symbol on the other, and plenty of readers will
 *     not touch an inverted symbol. So this paints its OWN ground: an explicit
 *     white rect covering the quiet zone (a QR without its 4-module light
 *     border does not scan against a coloured page) and explicitly black
 *     modules. It looks like a sticker on the page in dark mode. That is fine;
 *     scanning is the whole job.
 *
 * Byte mode, error-correction level M (~15% recoverable), versions 1..40 chosen
 * automatically — a payment URI is 40..120 bytes, which lands around version
 * 4..7, and M is the level phone cameras want at that size. No numeric or
 * alphanumeric mode: URIs are mixed-case and full of punctuation, so byte mode
 * is both the correct and the only applicable encoding.
 *
 * The parts that are easy to get subtly wrong, and what to check if a symbol
 * ever fails to scan:
 *
 *   - GF(2^8) arithmetic for Reed-Solomon uses the QR primitive polynomial
 *     0x11D. Multiplication is table-driven (log/antilog); zero has no log, so
 *     it is special-cased rather than folded into the tables.
 *   - Codewords are NOT laid out block by block. Data blocks are interleaved
 *     column-wise, then all the EC blocks after them; blocks differ in length
 *     by at most one codeword and the short ones simply drop out of the last
 *     data column. Get this wrong and the symbol still *looks* right and
 *     decodes to garbage.
 *   - Format information is a BCH(15,5) code over (EC level, mask), XORed with
 *     the fixed pattern 101010000010010 so an all-zero format never occurs. It
 *     is written twice, in two different orders, and depends on the mask — so
 *     it must be re-stamped for every mask that gets evaluated.
 *   - All 8 masks are tried and scored with the four standard penalty rules;
 *     lowest total wins. The finder-lookalike rule (N3) is the fiddly one and
 *     is implemented over a run-length history with a virtual light border on
 *     each end, per the 2015 edition of the spec.
 *
 * Dependency-free ES module, Web-standard globals only (TextEncoder), so the
 * same file runs on Cloudflare Workers and on Node 22.
 */

/* ------------------------------------------------------------------ *
 * Capacity tables — level M only
 * ------------------------------------------------------------------ */

/**
 * Indexed by version 1..40; slot 0 is a placeholder so the arrays are read with
 * the version number itself, the way the standard's tables are.
 */
const ECC_CODEWORDS_PER_BLOCK = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26,
  30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
  26, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
];

const ERROR_CORRECTION_BLOCKS = [
  -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5,
  5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
  17, 17, 18, 20, 21, 23, 25, 26, 28, 29,
  31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
];

const MIN_VERSION = 1;
const MAX_VERSION = 40;

/** Penalty weights from the standard: runs, blocks, finder lookalikes, balance. */
const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

/**
 * Modules available to data, in bits, for a version — total area minus every
 * function pattern. Closed form rather than a table so there is nothing to
 * mistype: finders and separators and format areas are the constant 64, the
 * alignment patterns scale with their count, and version information (v7+)
 * costs a further 36.
 */
function rawDataModules(version) {
  let bits = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    bits -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) bits -= 36;
  }
  return bits;
}

/** Total codewords in the symbol (data + error correction). */
const totalCodewords = (version) => Math.floor(rawDataModules(version) / 8);

/** Codewords left for data once level M's error correction has taken its share. */
function dataCodewords(version) {
  return totalCodewords(version)
    - ECC_CODEWORDS_PER_BLOCK[version] * ERROR_CORRECTION_BLOCKS[version];
}

/**
 * Byte mode's character-count field is 8 bits up to version 9 and 16 bits from
 * version 10 on, which is why version selection has to be re-tested per version
 * rather than solved once.
 */
const charCountBits = (version) => (version <= 9 ? 8 : 16);

/** Smallest version whose data capacity holds `byteLength` bytes, or 0. */
function chooseVersion(byteLength) {
  for (let version = MIN_VERSION; version <= MAX_VERSION; version += 1) {
    const needed = 4 + charCountBits(version) + byteLength * 8;
    if (needed <= dataCodewords(version) * 8) return version;
  }
  return 0;
}

/* ------------------------------------------------------------------ *
 * GF(2^8) and Reed-Solomon
 * ------------------------------------------------------------------ */

/**
 * Antilog/log tables over GF(2^8) with the QR primitive polynomial
 * x^8 + x^4 + x^3 + x^2 + 1 (0x11D) and generator 2. EXP is 255 entries long
 * because the multiplicative group has order 255; LOG[0] is never read.
 */
const EXP = new Uint8Array(255);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    // Multiply by the generator, reducing modulo the primitive polynomial.
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
}

/** Field multiplication. Zero has no logarithm, so it is handled up front. */
function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[(LOG[a] + LOG[b]) % 255];
}

/**
 * The generator polynomial for `degree` error-correction codewords:
 * (x - 2^0)(x - 2^1)…(x - 2^(degree-1)), expanded in the field.
 *
 * It is monic, so the leading 1 is left implicit and only the `degree` lower
 * coefficients are stored, highest power first — which is exactly the shape the
 * remainder loop below wants.
 */
function rsDivisor(degree) {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    // Multiply the accumulated polynomial by (x - root), in place.
    for (let j = 0; j < degree; j += 1) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 2);
  }
  return result;
}

/** Polynomial long division; the remainder IS the block's EC codewords. */
function rsRemainder(data, divisor) {
  const result = new Uint8Array(divisor.length);
  for (const byte of data) {
    const factor = byte ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let i = 0; i < result.length; i += 1) result[i] ^= gfMul(divisor[i], factor);
  }
  return result;
}

/* ------------------------------------------------------------------ *
 * Bitstream and codeword assembly
 * ------------------------------------------------------------------ */

/** Appends the low `length` bits of `value`, most significant first. */
function appendBits(bits, value, length) {
  for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
}

/**
 * Header + payload + padding, as one flat array of data codewords.
 *
 * Byte mode is indicator 0100, then the length, then the raw bytes. What is
 * left over is filled with the terminator (up to four zero bits), zeros to the
 * next byte boundary, and then the fixed alternating pad bytes 0xEC/0x11 — a
 * decoder stops at the terminator, so the padding only has to be *something*
 * that does not bias the mask evaluation, which is why the standard picked two
 * bytes with lively bit patterns.
 */
function buildDataCodewords(bytes, version) {
  const capacityBits = dataCodewords(version) * 8;
  const bits = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, charCountBits(version));
  for (const byte of bytes) appendBits(bits, byte, 8);

  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));
  appendBits(bits, 0, (8 - (bits.length % 8)) % 8);

  const codewords = new Uint8Array(capacityBits / 8);
  for (let i = 0; i < bits.length; i += 1) {
    codewords[i >>> 3] |= bits[i] << (7 - (i & 7));
  }
  for (let i = bits.length / 8, pad = 0xec; i < codewords.length; i += 1, pad ^= 0xec ^ 0x11) {
    codewords[i] = pad;
  }
  return codewords;
}

/**
 * Splits the data into blocks, appends each block's EC codewords, and
 * interleaves the lot into the final codeword sequence.
 *
 * Block lengths differ by at most one codeword: with `blocks` blocks and
 * `total` data codewords, `total % blocks` of them are one longer, and the
 * standard puts the SHORT blocks first. Interleaving then reads column-wise
 * across the blocks — data columns first (the short blocks simply have nothing
 * to contribute to the final data column), then the EC columns, which are all
 * the same length. This is what spreads a scratch or a thumb across several
 * blocks so that no single block exceeds its correction capacity.
 */
function interleave(data, version) {
  const numBlocks = ERROR_CORRECTION_BLOCKS[version];
  const eccLen = ECC_CODEWORDS_PER_BLOCK[version];
  const shortLen = Math.floor(data.length / numBlocks);
  const numShort = numBlocks - (data.length % numBlocks);
  const divisor = rsDivisor(eccLen);

  const dataBlocks = [];
  const eccBlocks = [];
  for (let i = 0, offset = 0; i < numBlocks; i += 1) {
    const length = shortLen + (i < numShort ? 0 : 1);
    const block = data.subarray(offset, offset + length);
    offset += length;
    dataBlocks.push(block);
    eccBlocks.push(rsRemainder(block, divisor));
  }

  const out = new Uint8Array(totalCodewords(version));
  let at = 0;
  for (let i = 0; i <= shortLen; i += 1) {
    for (const block of dataBlocks) if (i < block.length) out[at++] = block[i];
  }
  for (let i = 0; i < eccLen; i += 1) {
    for (const block of eccBlocks) out[at++] = block[i];
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Symbol geometry
 * ------------------------------------------------------------------ */

/**
 * Centres of the alignment patterns. Always 6 and size-7 at the ends, with
 * evenly spaced centres between them; the count grows by one every 7 versions.
 * Version 32 is the one case the "round the spacing up to an even number" rule
 * gets wrong, so it is hard-coded exactly as the standard's table has it.
 */
function alignmentPositions(version) {
  if (version === 1) return [];
  const size = version * 4 + 17;
  const count = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((size - 13) / (count * 2 - 2)) * 2;
  const positions = [6];
  for (let pos = size - 7; positions.length < count; pos -= step) positions.splice(1, 0, pos);
  return positions;
}

/** The 8 mask patterns; true means "flip this module". */
function maskAt(mask, x, y) {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

/* ------------------------------------------------------------------ *
 * Mask penalties
 * ------------------------------------------------------------------ */

/**
 * Rule 3 detects the 1:1:3:1:1 finder signature anywhere in a line, which would
 * confuse a reader hunting for the real finders. `history` holds the last seven
 * run lengths, newest first; a match needs the 1:1:3:1:1 core plus four modules
 * of light space on one side or the other.
 */
function countFinderPatterns(history) {
  const n = history[1];
  const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
  return (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0)
    + (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0);
}

/** Pushes a run onto the history, crediting the symbol's edge as light space. */
function addRunToHistory(runLength, history, size) {
  // An empty history means this is the first run of the line, and the quiet
  // zone beyond the edge counts as light modules in front of it.
  if (history[0] === 0) runLength += size;
  history.pop();
  history.unshift(runLength);
}

/** Closes off a line: the trailing quiet zone is light space too. */
function terminateRun(runDark, runLength, history, size) {
  if (runDark) {
    addRunToHistory(runLength, history, size);
    runLength = 0;
  }
  addRunToHistory(runLength + size, history, size);
  return countFinderPatterns(history);
}

/** Total penalty for a finished, masked symbol. Lower is better. */
function penaltyScore(modules, size) {
  let score = 0;

  // Rules 1 and 3, scanned once horizontally and once vertically.
  for (let axis = 0; axis < 2; axis += 1) {
    for (let a = 0; a < size; a += 1) {
      let runDark = false;
      let runLength = 0;
      const history = [0, 0, 0, 0, 0, 0, 0];
      for (let b = 0; b < size; b += 1) {
        const dark = axis === 0 ? modules[a][b] : modules[b][a];
        if (dark === runDark) {
          runLength += 1;
          if (runLength === 5) score += PENALTY_N1;
          else if (runLength > 5) score += 1;
        } else {
          addRunToHistory(runLength, history, size);
          // Only a run that just ended LIGHT can close a finder lookalike.
          if (!runDark) score += countFinderPatterns(history) * PENALTY_N3;
          runDark = dark;
          runLength = 1;
        }
      }
      score += terminateRun(runDark, runLength, history, size) * PENALTY_N3;
    }
  }

  // Rule 2: every 2x2 block of one colour.
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const c = modules[y][x];
      if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) {
        score += PENALTY_N2;
      }
    }
  }

  // Rule 4: deviation of the dark ratio from 50%, in 5% steps.
  let dark = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) if (modules[y][x]) dark += 1;
  }
  const total = size * size;
  // Smallest k >= 0 with (45 - 5k)% <= dark/total <= (55 + 5k)%.
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  return score + k * PENALTY_N4;
}

/* ------------------------------------------------------------------ *
 * Drawing
 * ------------------------------------------------------------------ */

/**
 * Draws a complete symbol: function patterns, then the codeword zigzag, then
 * the best of the 8 masks.
 */
function buildSymbol(version, codewords) {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  // Function modules are fixed: they are skipped by the data placement and are
  // never masked.
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));

  const set = (x, y, dark) => {
    modules[y][x] = dark;
    fixed[y][x] = true;
  };

  // Timing patterns: row 6 and column 6, alternating from the origin. Drawn
  // FIRST, because row/column 6 runs straight through the finder patterns and
  // it is the finders that own those modules.
  for (let i = 0; i < size; i += 1) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }

  // Finder patterns with their separators. Chebyshev distance from the centre
  // gives the concentric rings: 0 and 1 dark, 2 light, 3 dark, 4 the separator.
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, ring !== 2 && ring !== 4);
      }
    }
  }

  // Alignment patterns, minus the three whose centres would sit inside a
  // finder pattern.
  const centres = alignmentPositions(version);
  const last = centres.length - 1;
  for (let i = 0; i <= last; i += 1) {
    for (let j = 0; j <= last; j += 1) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          set(centres[j] + dx, centres[i] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  /**
   * Format information: 5 bits (level M = 00, then the 3-bit mask) extended by
   * a BCH(15,5) remainder against generator 0x537, then XORed with 0x5412
   * (101010000010010) so that no valid format word is ever all-zero.
   *
   * Written twice — split around the top-left finder, and mirrored along the
   * bottom-left and top-right edges — so a symbol with one corner damaged is
   * still readable. Because it encodes the mask, it is re-stamped for every
   * candidate mask during evaluation.
   */
  const drawFormat = (mask) => {
    const data = (0b00 << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = (((data << 10) | rem) ^ 0x5412) & 0x7fff;
    const bit = (i) => ((bits >>> i) & 1) !== 0;

    // Copy 1, hugging the top-left finder. Column 6 and row 6 are timing, so
    // the run skips over them.
    for (let i = 0; i <= 5; i += 1) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i += 1) set(14 - i, 8, bit(i));

    // Copy 2, along the bottom-left and top-right edges.
    for (let i = 0; i < 8; i += 1) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i += 1) set(8, size - 15 + i, bit(i));
    // The dark module: always set, never carries information.
    set(8, size - 8, true);
  };

  // Version information (v7+): 6 data bits plus a BCH(18,6) remainder against
  // generator 0x1F25, in two 3x6 blocks by the bottom-left and top-right finders.
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (version << 12) | rem;
    for (let i = 0; i < 18; i += 1) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }

  // Reserve the format areas before laying data down; the mask here is a
  // placeholder that drawFormat() overwrites once a mask has been chosen.
  drawFormat(0);

  /**
   * Symbol character placement: two-module-wide columns walked right to left,
   * zigzagging up then down, each pair filled right module first. Column 6 is
   * timing, so once the walk reaches it the pair shifts left by one — hence the
   * `right === 6` step. Function modules are skipped; anything left over after
   * the last codeword stays light (the standard's remainder bits).
   */
  let bit = 0;
  const totalBits = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (fixed[y][x] || bit >= totalBits) continue;
        modules[y][x] = ((codewords[bit >>> 3] >>> (7 - (bit & 7))) & 1) !== 0;
        bit += 1;
      }
    }
  }

  const flip = (mask) => {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (!fixed[y][x] && maskAt(mask, x, y)) modules[y][x] = !modules[y][x];
      }
    }
  };

  // Try all 8 masks and keep the least penalised. XOR is its own inverse, so
  // each trial is undone by applying the same mask again.
  let bestMask = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    flip(mask);
    drawFormat(mask);
    const score = penaltyScore(modules, size);
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
    }
    flip(mask);
  }
  flip(bestMask);
  drawFormat(bestMask);

  return modules;
}

/* ------------------------------------------------------------------ *
 * Public interface
 * ------------------------------------------------------------------ */

/**
 * Encodes `text` as a QR symbol.
 *
 * Returns a square boolean matrix indexed [row][column], true meaning a dark
 * module, with NO quiet zone — the caller adds that. Returns null only when the
 * text does not fit: more bytes than version 40 at level M can hold, so a caller
 * can degrade to showing the URI as text rather than rendering a broken image.
 *
 * The empty string is encoded, not rejected — a byte segment of length zero is
 * a legal symbol and round-trips back to '' through a decoder, so the contract
 * stays "null means it did not fit" with no second meaning layered on top. A
 * caller that has nothing worth showing should not be asking for a QR at all;
 * `pay.js` already guards on `order.uri` before it calls in here.
 */
function qrMatrix(text) {
  const bytes = new TextEncoder().encode(String(text ?? ''));
  const version = chooseVersion(bytes.length);
  if (version === 0) return null;
  return buildSymbol(version, interleave(buildDataCodewords(bytes, version), version));
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML-escape a value for interpolation into markup or an attribute. */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * Renders `text` as standalone inline SVG markup, or '' if it does not fit.
 *
 *   size   rendered edge in CSS pixels, quiet zone included
 *   quiet  light border in modules; 4 is the standard minimum, don't go lower
 *   title  accessible name, escaped into the <title> element
 *
 * The viewBox is in module units, so the browser scales one crisp grid rather
 * than us rounding module positions to pixels. Dark modules are merged into
 * horizontal runs and emitted as one <path>, which is several times smaller
 * than one <rect> per module — the whole point being that this markup ships
 * inside the page on every payment page load.
 */
function qrSvg(text, opts = {}) {
  const modules = qrMatrix(text);
  if (!modules) return '';

  const options = opts || {};
  const size = Number.isFinite(Number(options.size)) ? Math.max(1, Math.round(Number(options.size))) : 220;
  const quiet = Number.isFinite(Number(options.quiet)) ? Math.max(0, Math.round(Number(options.quiet))) : 4;
  const title = options.title === undefined ? 'Payment QR code' : options.title;

  const count = modules.length;
  const span = count + quiet * 2;

  let path = '';
  for (let y = 0; y < count; y += 1) {
    for (let x = 0; x < count; x += 1) {
      if (!modules[y][x]) continue;
      let run = 1;
      while (x + run < count && modules[y][x + run]) run += 1;
      path += `M${x + quiet} ${y + quiet}h${run}v1h-${run}z`;
      x += run - 1;
    }
  }

  // Presentation attributes only: the CSP forbids both a style attribute and a
  // <style> element, and the explicit white ground is what keeps the symbol
  // scannable on the dark theme.
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" width="${size}" height="${size}"`
    + ` viewBox="0 0 ${span} ${span}">`
    + `<title>${esc(title)}</title>`
    + `<rect width="${span}" height="${span}" fill="#ffffff"/>`
    + `<path fill="#000000" shape-rendering="crispEdges" d="${path}"/>`
    + '</svg>';
}

export { qrMatrix, qrSvg };
