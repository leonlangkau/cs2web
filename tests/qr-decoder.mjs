/**
 * qr-decoder.mjs — an independent QR Code decoder, written as a test oracle.
 *
 * Implemented from the ISO/IEC 18004 specification (symbol geometry, format
 * information, data masking, symbol character placement, block interleaving and
 * the byte-mode segment layout). It is deliberately NOT derived from this
 * repository's encoder, so that agreement between the two is real evidence.
 *
 * Scope / simplifications:
 *   - Error correction level M only, versions 1..40.
 *   - Reed-Solomon error correction codewords are NOT checked or used. This
 *     decoder only ever reads pristine symbols, so the EC codewords are simply
 *     skipped after de-interleaving. A damaged symbol will therefore produce
 *     garbage or an error rather than being repaired.
 *   - Segment modes supported: byte (0100, decoded as UTF-8), numeric (0001),
 *     alphanumeric (0010), ECI (0111, parsed and ignored) and the terminator.
 *     Anything else throws.
 *
 * Usage:
 *   import { decodeQr } from './qr-decoder.mjs';
 *   decodeQr(matrix) -> string      // matrix is boolean[][], [row][col],
 *                                   // true = dark, NO quiet zone.
 */

// ---------------------------------------------------------------------------
// Static tables from ISO/IEC 18004
// ---------------------------------------------------------------------------

/**
 * Annex E: row/column coordinates of alignment pattern centres, per version.
 * The alignment patterns sit at every (row, col) combination of these
 * coordinates except the three that would collide with a finder pattern.
 */
const ALIGNMENT_PATTERN_CENTERS = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
  11: [6, 30, 54],
  12: [6, 32, 58],
  13: [6, 34, 62],
  14: [6, 26, 46, 66],
  15: [6, 26, 48, 70],
  16: [6, 26, 50, 74],
  17: [6, 30, 54, 78],
  18: [6, 30, 56, 82],
  19: [6, 30, 58, 86],
  20: [6, 34, 62, 90],
  21: [6, 28, 50, 72, 94],
  22: [6, 26, 50, 74, 98],
  23: [6, 30, 54, 78, 102],
  24: [6, 28, 54, 80, 106],
  25: [6, 32, 58, 84, 110],
  26: [6, 30, 58, 86, 114],
  27: [6, 34, 62, 90, 118],
  28: [6, 26, 50, 74, 98, 122],
  29: [6, 30, 54, 78, 102, 126],
  30: [6, 26, 52, 78, 104, 130],
  31: [6, 30, 56, 82, 108, 134],
  32: [6, 34, 60, 86, 112, 138],
  33: [6, 30, 58, 86, 114, 142],
  34: [6, 34, 62, 90, 118, 146],
  35: [6, 30, 54, 78, 102, 126, 150],
  36: [6, 24, 50, 76, 102, 128, 154],
  37: [6, 28, 54, 80, 106, 132, 158],
  38: [6, 32, 58, 84, 110, 136, 162],
  39: [6, 26, 54, 82, 110, 138, 166],
  40: [6, 30, 58, 86, 114, 142, 170],
};

/**
 * Table 9 (error correction level M): the number of error correction
 * codewords per block, and the block structure as [blockCount, dataCodewords]
 * groups. Group 1 (the shorter blocks) always precedes group 2.
 */
const EC_BLOCKS_M = {
   1: { ecPerBlock: 10, groups: [[1, 16]] },
   2: { ecPerBlock: 16, groups: [[1, 28]] },
   3: { ecPerBlock: 26, groups: [[1, 44]] },
   4: { ecPerBlock: 18, groups: [[2, 32]] },
   5: { ecPerBlock: 24, groups: [[2, 43]] },
   6: { ecPerBlock: 16, groups: [[4, 27]] },
   7: { ecPerBlock: 18, groups: [[4, 31]] },
   8: { ecPerBlock: 22, groups: [[2, 38], [2, 39]] },
   9: { ecPerBlock: 22, groups: [[3, 36], [2, 37]] },
  10: { ecPerBlock: 26, groups: [[4, 43], [1, 44]] },
  11: { ecPerBlock: 30, groups: [[1, 50], [4, 51]] },
  12: { ecPerBlock: 22, groups: [[6, 36], [2, 37]] },
  13: { ecPerBlock: 22, groups: [[8, 37], [1, 38]] },
  14: { ecPerBlock: 24, groups: [[4, 40], [5, 41]] },
  15: { ecPerBlock: 24, groups: [[5, 41], [5, 42]] },
  16: { ecPerBlock: 28, groups: [[7, 45], [3, 46]] },
  17: { ecPerBlock: 28, groups: [[10, 46], [1, 47]] },
  18: { ecPerBlock: 26, groups: [[9, 43], [4, 44]] },
  19: { ecPerBlock: 26, groups: [[3, 44], [11, 45]] },
  20: { ecPerBlock: 26, groups: [[3, 41], [13, 42]] },
  21: { ecPerBlock: 26, groups: [[17, 42]] },
  22: { ecPerBlock: 28, groups: [[17, 46]] },
  23: { ecPerBlock: 28, groups: [[4, 47], [14, 48]] },
  24: { ecPerBlock: 28, groups: [[6, 45], [14, 46]] },
  25: { ecPerBlock: 28, groups: [[8, 47], [13, 48]] },
  26: { ecPerBlock: 28, groups: [[19, 46], [4, 47]] },
  27: { ecPerBlock: 28, groups: [[22, 45], [3, 46]] },
  28: { ecPerBlock: 28, groups: [[3, 45], [23, 46]] },
  29: { ecPerBlock: 28, groups: [[21, 45], [7, 46]] },
  30: { ecPerBlock: 28, groups: [[19, 47], [10, 48]] },
  31: { ecPerBlock: 28, groups: [[2, 46], [29, 47]] },
  32: { ecPerBlock: 28, groups: [[10, 46], [23, 47]] },
  33: { ecPerBlock: 28, groups: [[14, 46], [21, 47]] },
  34: { ecPerBlock: 28, groups: [[14, 46], [23, 47]] },
  35: { ecPerBlock: 28, groups: [[12, 47], [26, 48]] },
  36: { ecPerBlock: 28, groups: [[6, 47], [34, 48]] },
  37: { ecPerBlock: 28, groups: [[29, 46], [14, 47]] },
  38: { ecPerBlock: 28, groups: [[13, 46], [32, 47]] },
  39: { ecPerBlock: 28, groups: [[40, 47], [7, 48]] },
  40: { ecPerBlock: 28, groups: [[18, 47], [31, 48]] },
};

/** Table 25: the 2-bit error correction level indicator, as stored in the format information. */
const EC_LEVEL_NAMES = { 0b01: 'L', 0b00: 'M', 0b11: 'Q', 0b10: 'H' };

/** Table 5: the alphanumeric mode character set, indexed by value 0..44. */
const ALPHANUMERIC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

/** Mode indicators (Table 2). */
const MODE_TERMINATOR = 0b0000;
const MODE_NUMERIC = 0b0001;
const MODE_ALPHANUMERIC = 0b0010;
const MODE_BYTE = 0b0100;
const MODE_ECI = 0b0111;
const MODE_KANJI = 0b1000;
const MODE_STRUCTURED_APPEND = 0b0011;
const MODE_FNC1_FIRST = 0b0101;
const MODE_FNC1_SECOND = 0b1001;

const MODE_NAMES = {
  [MODE_NUMERIC]: 'numeric',
  [MODE_ALPHANUMERIC]: 'alphanumeric',
  [MODE_BYTE]: 'byte',
  [MODE_ECI]: 'ECI',
  [MODE_KANJI]: 'kanji',
  [MODE_STRUCTURED_APPEND]: 'structured append',
  [MODE_FNC1_FIRST]: 'FNC1 (first position)',
  [MODE_FNC1_SECOND]: 'FNC1 (second position)',
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function fail(message) {
  throw new Error(`QR decode failed: ${message}`);
}

function popCount(n) {
  let c = 0;
  while (n) {
    n &= n - 1;
    c++;
  }
  return c;
}

/** Sequential MSB-first reader over an array of codewords (bytes). */
class BitReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.pos = 0;
  }

  get remaining() {
    return this.bytes.length * 8 - this.pos;
  }

  read(count) {
    if (count > this.remaining) {
      fail(
        `bit stream underrun: wanted ${count} more bits but only ${this.remaining} remain ` +
          `(read ${this.pos} of ${this.bytes.length * 8})`,
      );
    }
    let value = 0;
    for (let i = 0; i < count; i++) {
      const bit = (this.bytes[this.pos >> 3] >> (7 - (this.pos & 7))) & 1;
      value = value * 2 + bit;
      this.pos++;
    }
    return value;
  }
}

// ---------------------------------------------------------------------------
// Step 1 — normalise the matrix and derive the version from the symbol size
// ---------------------------------------------------------------------------

function normaliseMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    fail('matrix must be a non-empty array of rows');
  }
  const size = matrix.length;
  const grid = [];
  for (let r = 0; r < size; r++) {
    const row = matrix[r];
    if (!Array.isArray(row) && !ArrayBuffer.isView(row)) {
      fail(`row ${r} is not an array`);
    }
    if (row.length !== size) {
      fail(`matrix is not square: it has ${size} rows but row ${r} has ${row.length} columns`);
    }
    const out = new Uint8Array(size);
    for (let c = 0; c < size; c++) out[c] = row[c] ? 1 : 0;
    grid.push(out);
  }
  return grid;
}

function versionForSize(size) {
  // A version V symbol is (17 + 4V) modules on a side.
  if (size < 21 || (size - 17) % 4 !== 0) {
    fail(`${size}x${size} is not a valid QR symbol size (expected 17 + 4 x version, i.e. 21, 25, 29, ...)`);
  }
  const version = (size - 17) / 4;
  if (version < 1 || version > 40) {
    fail(`version ${version} (${size}x${size}) is outside the valid range 1..40`);
  }
  return version;
}

// ---------------------------------------------------------------------------
// Step 2 — map out the function patterns (everything that is not data)
// ---------------------------------------------------------------------------

/**
 * Returns a size x size Uint8Array grid where 1 marks a module belonging to a
 * function pattern: finder patterns, separators, format information, timing
 * patterns, alignment patterns, the dark module, and (version >= 7) the
 * version information blocks.
 */
function buildFunctionPatternMap(size, version) {
  const map = [];
  for (let r = 0; r < size; r++) map.push(new Uint8Array(size));

  const mark = (top, left, height, width) => {
    for (let r = top; r < top + height; r++) {
      for (let c = left; c < left + width; c++) map[r][c] = 1;
    }
  };

  // Finder patterns (7x7) with their separators and the adjacent format
  // information strips. Top-left occupies a 9x9 corner; the other two are
  // 8 modules deep because there is no format strip on their outer edge.
  mark(0, 0, 9, 9); // top-left finder + separator + format info
  mark(0, size - 8, 9, 8); // top-right finder + separator + format info
  mark(size - 8, 0, 8, 9); // bottom-left finder + separator + format info + dark module

  // Timing patterns: row 6 and column 6 run the full width/height. The parts
  // inside the finder corners are already marked above.
  for (let i = 0; i < size; i++) {
    map[6][i] = 1;
    map[i][6] = 1;
  }

  // Alignment patterns: 5x5, centred on every combination of the version's
  // alignment coordinates, minus the three that overlap a finder pattern.
  const centers = ALIGNMENT_PATTERN_CENTERS[version];
  if (centers.length > 0) {
    const first = centers[0];
    const last = centers[centers.length - 1];
    for (const r of centers) {
      for (const c of centers) {
        const collidesWithFinder =
          (r === first && c === first) || (r === first && c === last) || (r === last && c === first);
        if (collidesWithFinder) continue;
        mark(r - 2, c - 2, 5, 5);
      }
    }
  }

  // Version information: two 6x3 blocks, present from version 7 upwards.
  if (version >= 7) {
    mark(0, size - 11, 6, 3); // above the top-right finder
    mark(size - 11, 0, 3, 6); // left of the bottom-left finder
  }

  return map;
}

// ---------------------------------------------------------------------------
// Step 3 — read and decode the format information
// ---------------------------------------------------------------------------

/** BCH(15,5) encode the 5 format data bits and apply the 101010000010010 mask. */
function encodeFormatInfo(dataBits5) {
  let remainder = dataBits5 << 10;
  for (let bit = 14; bit >= 10; bit--) {
    if ((remainder >> bit) & 1) remainder ^= 0x537 << (bit - 10); // generator 10100110111
  }
  return (((dataBits5 << 10) | (remainder & 0x3ff)) ^ 0x5412) & 0x7fff;
}

/** The 32 legal 15-bit format information values, keyed by their 5 data bits. */
const VALID_FORMAT_INFO = (() => {
  const table = [];
  for (let data = 0; data < 32; data++) table.push({ data, bits: encodeFormatInfo(data) });
  return table;
})();

/** Read one of the two 15-bit format information copies, MSB first. */
function readFormatBits(grid, positions) {
  let bits = 0;
  for (const [r, c] of positions) bits = (bits << 1) | grid[r][c];
  return bits;
}

function formatPositionsCopy1() {
  // Around the top-left finder: along row 8 left-to-right (skipping the timing
  // column), then up column 8 (skipping the timing row).
  return [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
}

function formatPositionsCopy2(size) {
  // The redundant copy: up column 8 from the bottom edge (7 modules, stopping
  // just above the dark module), then along row 8 to the right edge (8 modules).
  const positions = [];
  for (let r = size - 1; r >= size - 7; r--) positions.push([r, 8]);
  for (let c = size - 8; c <= size - 1; c++) positions.push([8, c]);
  return positions;
}

function decodeFormatInfo(grid, size) {
  const copies = [
    readFormatBits(grid, formatPositionsCopy1()),
    readFormatBits(grid, formatPositionsCopy2(size)),
  ];

  let best = null;
  for (const bits of copies) {
    for (const candidate of VALID_FORMAT_INFO) {
      const distance = popCount(bits ^ candidate.bits);
      if (best === null || distance < best.distance) best = { distance, data: candidate.data };
      if (distance === 0) break;
    }
    if (best && best.distance === 0) break;
  }

  // The BCH(15,5) code has minimum distance 7, so it corrects up to 3 errors.
  if (best.distance > 3) {
    fail(
      `format information is unreadable (best match differs in ${best.distance} bits; ` +
        `read ${copies.map((b) => b.toString(2).padStart(15, '0')).join(' and ')})`,
    );
  }

  const ecLevelBits = (best.data >> 3) & 0b11;
  const maskPattern = best.data & 0b111;
  return { ecLevelBits, ecLevel: EC_LEVEL_NAMES[ecLevelBits], maskPattern };
}

// ---------------------------------------------------------------------------
// Step 4 — data mask patterns (Table 10)
// ---------------------------------------------------------------------------

const MASK_CONDITIONS = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

/** Invert the data mask over every non-function module (masking is its own inverse). */
function unmask(grid, functionMap, size, maskPattern) {
  const condition = MASK_CONDITIONS[maskPattern];
  const out = grid.map((row) => Uint8Array.from(row));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (functionMap[r][c]) continue;
      if (condition(r, c)) out[r][c] ^= 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Step 5 — walk the symbol character placement in reverse
// ---------------------------------------------------------------------------

/**
 * Reads the interleaved codeword stream. Placement runs in two-module-wide
 * columns starting at the bottom-right corner, alternating upwards and
 * downwards, right module before left module in each pair, skipping function
 * modules and skipping the vertical timing pattern in column 6. Any leftover
 * bits at the very end are the symbol's remainder bits and are discarded.
 */
function readCodewords(grid, functionMap, size) {
  const codewords = [];
  let current = 0;
  let bitsRead = 0;
  let readingUp = true;

  for (let rightCol = size - 1; rightCol > 0; rightCol -= 2) {
    if (rightCol === 6) rightCol = 5; // step over the vertical timing pattern
    for (let step = 0; step < size; step++) {
      const row = readingUp ? size - 1 - step : step;
      for (let offset = 0; offset < 2; offset++) {
        const col = rightCol - offset;
        if (functionMap[row][col]) continue;
        current = (current << 1) | grid[row][col];
        bitsRead++;
        if (bitsRead === 8) {
          codewords.push(current);
          current = 0;
          bitsRead = 0;
        }
      }
    }
    readingUp = !readingUp;
  }

  return codewords;
}

// ---------------------------------------------------------------------------
// Step 6 — de-interleave the blocks and drop the error correction codewords
// ---------------------------------------------------------------------------

function blockLayout(version) {
  const spec = EC_BLOCKS_M[version];
  if (!spec) fail(`no error correction block table for version ${version} at level M`);
  const dataLengths = [];
  for (const [blockCount, dataCodewords] of spec.groups) {
    for (let i = 0; i < blockCount; i++) dataLengths.push(dataCodewords);
  }
  const totalData = dataLengths.reduce((a, b) => a + b, 0);
  const totalEc = dataLengths.length * spec.ecPerBlock;
  return { dataLengths, ecPerBlock: spec.ecPerBlock, totalData, totalCodewords: totalData + totalEc };
}

/**
 * Undo the interleaving described in 8.6: the data codewords appear as the
 * first codeword of every block, then the second of every block, and so on,
 * with short blocks simply dropping out of the later rounds. The EC codewords
 * that follow are ignored entirely — this oracle never reads a damaged symbol.
 */
function deinterleaveData(codewords, dataLengths) {
  const blocks = dataLengths.map((len) => new Array(len));
  const longest = Math.max(...dataLengths);
  let index = 0;
  for (let i = 0; i < longest; i++) {
    for (let b = 0; b < dataLengths.length; b++) {
      if (i < dataLengths[b]) blocks[b][i] = codewords[index++];
    }
  }
  const data = [];
  for (const block of blocks) data.push(...block);
  return data;
}

// ---------------------------------------------------------------------------
// Step 7 — decode the segment bit stream
// ---------------------------------------------------------------------------

/** Table 3: character count indicator length, by mode and version range. */
function charCountBits(mode, version) {
  const range = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  switch (mode) {
    case MODE_NUMERIC:
      return [10, 12, 14][range];
    case MODE_ALPHANUMERIC:
      return [9, 11, 13][range];
    case MODE_BYTE:
      return [8, 16, 16][range];
    case MODE_KANJI:
      return [8, 10, 12][range];
    default:
      fail(`mode ${mode.toString(2).padStart(4, '0')} has no character count indicator`);
  }
}

function decodeNumericSegment(reader, count) {
  let out = '';
  let left = count;
  while (left >= 3) {
    const value = reader.read(10);
    if (value > 999) fail(`numeric segment contains the invalid triple value ${value}`);
    out += String(value).padStart(3, '0');
    left -= 3;
  }
  if (left === 2) {
    const value = reader.read(7);
    if (value > 99) fail(`numeric segment contains the invalid pair value ${value}`);
    out += String(value).padStart(2, '0');
  } else if (left === 1) {
    const value = reader.read(4);
    if (value > 9) fail(`numeric segment contains the invalid digit value ${value}`);
    out += String(value);
  }
  return out;
}

function decodeAlphanumericSegment(reader, count) {
  let out = '';
  let left = count;
  while (left >= 2) {
    const value = reader.read(11);
    if (value > 44 * 45 + 44) fail(`alphanumeric segment contains the invalid pair value ${value}`);
    out += ALPHANUMERIC_CHARS[Math.floor(value / 45)] + ALPHANUMERIC_CHARS[value % 45];
    left -= 2;
  }
  if (left === 1) {
    const value = reader.read(6);
    if (value > 44) fail(`alphanumeric segment contains the invalid character value ${value}`);
    out += ALPHANUMERIC_CHARS[value];
  }
  return out;
}

/** Read an ECI designator (1, 2 or 3 bytes, self-describing via its leading bits). */
function readEciDesignator(reader) {
  const first = reader.read(8);
  if ((first & 0b10000000) === 0) return first & 0b01111111;
  if ((first & 0b11000000) === 0b10000000) return ((first & 0b00111111) << 8) | reader.read(8);
  if ((first & 0b11100000) === 0b11000000) return ((first & 0b00011111) << 16) | reader.read(16);
  return fail(`malformed ECI designator (first byte 0x${first.toString(16)})`);
}

function utf8Decode(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
  } catch {
    const preview = bytes
      .slice(0, 24)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(' ');
    return fail(`byte segment is not valid UTF-8 (first bytes: ${preview}${bytes.length > 24 ? ' ...' : ''})`);
  }
}

/**
 * Walk the segments. Adjacent byte segments are concatenated before being
 * decoded so that a multi-byte UTF-8 sequence split across segments still
 * decodes correctly.
 */
function decodeBitStream(dataCodewords, version) {
  const reader = new BitReader(dataCodewords);
  const parts = []; // { kind: 'bytes', bytes } | { kind: 'text', text }
  let segmentCount = 0;

  while (reader.remaining >= 4) {
    const mode = reader.read(4);

    if (mode === MODE_TERMINATOR) break;

    if (mode === MODE_ECI) {
      readEciDesignator(reader); // parsed for correctness; byte data is always read as UTF-8
      continue;
    }

    if (mode === MODE_BYTE) {
      const count = reader.read(charCountBits(MODE_BYTE, version));
      const bytes = [];
      for (let i = 0; i < count; i++) bytes.push(reader.read(8));
      const last = parts[parts.length - 1];
      if (last && last.kind === 'bytes') last.bytes.push(...bytes);
      else parts.push({ kind: 'bytes', bytes });
      segmentCount++;
      continue;
    }

    if (mode === MODE_NUMERIC || mode === MODE_ALPHANUMERIC) {
      const count = reader.read(charCountBits(mode, version));
      const text =
        mode === MODE_NUMERIC
          ? decodeNumericSegment(reader, count)
          : decodeAlphanumericSegment(reader, count);
      parts.push({ kind: 'text', text });
      segmentCount++;
      continue;
    }

    const name = MODE_NAMES[mode];
    fail(
      `unsupported mode indicator ${mode.toString(2).padStart(4, '0')}` +
        (name ? ` (${name})` : '') +
        ' — this decoder supports byte, numeric, alphanumeric and ECI segments only',
    );
  }

  if (segmentCount === 0) fail('symbol contains no data segments');

  return parts.map((p) => (p.kind === 'bytes' ? utf8Decode(p.bytes) : p.text)).join('');
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Decode a QR symbol.
 *
 * @param {boolean[][]} matrix Square grid indexed [row][col], true = dark
 *   module, with no quiet zone included.
 * @returns {string} the decoded text.
 * @throws {Error} with a descriptive message if the symbol cannot be decoded.
 */
export function decodeQr(matrix) {
  const grid = normaliseMatrix(matrix);
  const size = grid.length;
  const version = versionForSize(size);

  const functionMap = buildFunctionPatternMap(size, version);

  const { ecLevel, maskPattern } = decodeFormatInfo(grid, size);
  if (ecLevel !== 'M') {
    fail(`error correction level ${ecLevel} is not supported (this decoder handles level M only)`);
  }

  // Cross-check the geometry against the codeword table: the number of
  // non-function modules must account for exactly the expected codewords plus
  // fewer than 8 remainder bits. A mismatch means the function pattern map (and
  // therefore everything downstream) is wrong.
  const layout = blockLayout(version);
  let dataModules = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) if (!functionMap[r][c]) dataModules++;
  }
  const capacity = Math.floor(dataModules / 8);
  if (capacity !== layout.totalCodewords) {
    fail(
      `internal consistency check failed for version ${version}: the symbol has room for ` +
        `${capacity} codewords but the specification tables expect ${layout.totalCodewords}`,
    );
  }

  const unmasked = unmask(grid, functionMap, size, maskPattern);
  const codewords = readCodewords(unmasked, functionMap, size);

  if (codewords.length !== layout.totalCodewords) {
    fail(
      `read ${codewords.length} codewords but version ${version}-M holds ${layout.totalCodewords}`,
    );
  }

  const dataCodewords = deinterleaveData(codewords, layout.dataLengths);
  return decodeBitStream(dataCodewords, version);
}

export default decodeQr;
