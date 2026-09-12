/**
 * Keccak-256 (the pre-standardisation variant Ethereum uses, padding byte 0x01
 * rather than SHA-3's 0x06).
 *
 * Web Crypto gives us SHA-256 but not Keccak, and the only thing this codebase
 * needs it for is EIP-55: an Ethereum address's mixed case IS a checksum over
 * keccak256 of its lowercase hex. Without it we could only check that a
 * receiving address is 40 hex characters — which catches a truncated paste but
 * not a transposed one, and a receiving address that is wrong by one character
 * sends every buyer's money somewhere nobody can spend it.
 *
 * Lanes are BigInt rather than paired 32-bit words: the inputs here are 40-byte
 * address strings, so clarity is worth more than throughput.
 */

const MASK64 = (1n << 64n) - 1n;

const ROUND_CONSTANTS = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

/** Rho rotation offsets, indexed x + 5y to match the flat state array. */
const ROTATIONS = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
];

const rotl = (value, bits) => ((value << BigInt(bits)) | (value >> BigInt(64 - bits))) & MASK64;

/** Keccak-f[1600] on a 25-lane state, in place. */
function permute(state) {
  const b = new Array(25);
  const c = new Array(5);
  const d = new Array(5);

  for (let round = 0; round < 24; round += 1) {
    // theta
    for (let x = 0; x < 5; x += 1) {
      c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (let x = 0; x < 5; x += 1) {
      d[x] = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1);
    }
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) state[x + 5 * y] ^= d[x];
    }

    // rho + pi
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(state[x + 5 * y], ROTATIONS[x + 5 * y]);
      }
    }

    // chi
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        state[x + 5 * y] = b[x + 5 * y]
          ^ ((~b[((x + 1) % 5) + 5 * y] & MASK64) & b[((x + 2) % 5) + 5 * y]);
      }
    }

    // iota
    state[0] ^= ROUND_CONSTANTS[round];
  }
}

/** Keccak-256 over bytes, returning 32 bytes. */
function keccak256(bytes) {
  const RATE = 136; // 1088 bits
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

  // pad10*1 with Keccak's 0x01 domain byte.
  const padLength = RATE - (input.length % RATE);
  const padded = new Uint8Array(input.length + padLength);
  padded.set(input);
  padded[input.length] = 0x01;
  padded[padded.length - 1] |= 0x80;

  const state = new Array(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += RATE) {
    for (let i = 0; i < RATE / 8; i += 1) {
      // Lanes are little-endian.
      let lane = 0n;
      for (let byte = 7; byte >= 0; byte -= 1) {
        lane = (lane << 8n) | BigInt(padded[offset + i * 8 + byte]);
      }
      state[i] ^= lane;
    }
    permute(state);
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i += 1) {
    let lane = state[i];
    for (let byte = 0; byte < 8; byte += 1) {
      out[i * 8 + byte] = Number(lane & 0xffn);
      lane >>= 8n;
    }
  }
  return out;
}

/** Keccak-256 of a UTF-8 string, as lowercase hex. */
function keccak256Hex(text) {
  const digest = keccak256(new TextEncoder().encode(String(text)));
  let hex = '';
  for (const byte of digest) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

export { keccak256, keccak256Hex };
