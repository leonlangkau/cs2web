/**
 * Direct-to-wallet chain support: Ethereum and Solana, native coin and USDT.
 *
 * There is no payment processor here and no third party holding funds. The
 * operator pastes their own receiving addresses in as secrets, buyers pay them
 * directly, and this module is the read-only half that answers one question per
 * asset: "what has arrived at our address lately, and is it confirmed?"
 *
 * Design rules, all of them load-bearing:
 *
 *   - Read-only. Nothing here holds, derives or needs a private key. The worst
 *     a compromised endpoint can do is lie about incoming payments, which the
 *     confirmation threshold and amount matching in onchain.js then reject.
 *   - Keyless by default. Public endpoints (Blockscout for Ethereum, the
 *     Solana mainnet RPC) work with no signup at all; setting ETHERSCAN_API_KEY
 *     or SOLANA_RPC_URL swaps in a higher-limit provider with no code change.
 *   - Amounts are BigInt base units end to end — wei, lamports, token units.
 *     A float never touches a payment.
 *   - One row per (asset, transaction): a transaction's transfers to our
 *     address are SUMMED rather than listed. Explorers disagree about log and
 *     trace indices, so anything that used them as an identity would double-
 *     count on one provider and dedupe wrongly on another.
 *   - A failed lookup throws. It never returns "no payments found", because a
 *     caller that cannot tell those apart will happily expire an order that was
 *     actually paid.
 *
 * Built on fetch + BigInt only, so it runs unchanged on Cloudflare Workers and
 * on Node 22 (the test harness).
 */
import { keccak256Hex } from "./keccak.js";
import { fromUnits } from "./units.js";

/** Ceiling on any call to an explorer or RPC host, so a stalled node can't hang a request. */
const FETCH_TIMEOUT_MS = 12_000;

/**
 * Explorer paging. Rows are read forward from the cursor rather than newest
 * first, so unrelated traffic to the address can never hide a payment behind
 * it; these bound how much of a backlog one scan works through.
 */
const ETH_PAGE_SIZE = 100;
const ETH_MAX_PAGES_PER_SCAN = 5;

/** Public, keyless defaults. Both are overridable per deployment. */
const DEFAULT_ETH_EXPLORER = 'https://eth.blockscout.com/api';
const ETHERSCAN_V2 = 'https://api.etherscan.io/v2/api';
const DEFAULT_SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

/** Mainnet contract/mint for Tether. Overridable in case a deployment needs a different token. */
const DEFAULT_USDT_ERC20 = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const DEFAULT_USDT_SPL_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

/**
 * How many of an owner's SPL token accounts one scan will watch. Creating a
 * token account that names somebody else as its owner costs only rent, so
 * without a cap an outsider decides how much work every scan does.
 */
const MAX_TOKEN_ACCOUNTS_WATCHED = 4;

/** ERC-20 `Transfer(address,address,uint256)` — derived, not pasted, so it cannot be mistyped. */
const TRANSFER_TOPIC = `0x${keccak256Hex('Transfer(address,address,uint256)')}`;

/**
 * What we accept, and how each one is priced and displayed.
 *
 * `decimals` is the chain's precision. `payDecimals` is how many decimals the
 * buyer is actually asked to send: every pending order gets a unique amount by
 * varying its last three `payDecimals` digits (see onchain.js), so this has to
 * be coarse enough that every wallet and exchange withdrawal form accepts the
 * figure, and fine enough that the resulting spread is economically invisible.
 * The spread is 1000 * 10^-payDecimals of the coin — about three US cents for
 * ETH, one and a half for SOL, one for USDT.
 */
const ASSETS = {
  eth: {
    key: 'eth', chain: 'ethereum', kind: 'native',
    symbol: 'ETH', label: 'Ethereum', network: 'Ethereum mainnet',
    decimals: 18, payDecimals: 8, priceSymbol: 'ETH',
  },
  'usdt-erc20': {
    key: 'usdt-erc20', chain: 'ethereum', kind: 'erc20',
    symbol: 'USDT', label: 'USDT', network: 'Ethereum (ERC-20)',
    decimals: 6, payDecimals: 5, priceSymbol: 'USDT',
  },
  sol: {
    key: 'sol', chain: 'solana', kind: 'native',
    symbol: 'SOL', label: 'Solana', network: 'Solana mainnet',
    decimals: 9, payDecimals: 7, priceSymbol: 'SOL',
  },
  'usdt-spl': {
    key: 'usdt-spl', chain: 'solana', kind: 'spl',
    symbol: 'USDT', label: 'USDT', network: 'Solana (SPL)',
    decimals: 6, payDecimals: 5, priceSymbol: 'USDT',
  },
};

const ASSET_KEYS = Object.keys(ASSETS);

/* ------------------------------------------------------------------ *
 * Address validation
 * ------------------------------------------------------------------ */

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const BASE58_INDEX = new Map([...BASE58_ALPHABET].map((ch, i) => [ch, BigInt(i)]));

/** Decodes a base58 string to bytes, or null if it isn't valid base58. */
function base58Decode(value) {
  const text = String(value ?? '');
  if (!text) return null;
  let num = 0n;
  for (const ch of text) {
    const digit = BASE58_INDEX.get(ch);
    if (digit === undefined) return null;
    num = num * 58n + digit;
  }
  const bytes = [];
  while (num > 0n) {
    bytes.unshift(Number(num & 0xffn));
    num >>= 8n;
  }
  // Each leading '1' is a leading zero byte.
  for (const ch of text) {
    if (ch !== '1') break;
    bytes.unshift(0);
  }
  return new Uint8Array(bytes);
}

/**
 * EIP-55: a mixed-case Ethereum address encodes a checksum of itself. An
 * all-lowercase or all-uppercase address carries no checksum and is accepted as
 * given; a mixed-case one must match exactly, which is what catches a
 * transposed or altered character in a pasted receiving address.
 */
function isValidEthAddress(value) {
  const address = String(value ?? '').trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return false;
  const body = address.slice(2);
  if (body === body.toLowerCase() || body === body.toUpperCase()) return true;
  const hash = keccak256Hex(body.toLowerCase());
  for (let i = 0; i < 40; i += 1) {
    const upper = parseInt(hash[i], 16) >= 8;
    if (upper ? body[i] !== body[i].toUpperCase() : body[i] !== body[i].toLowerCase()) return false;
  }
  return true;
}

/** A Solana address is a base58-encoded 32-byte public key. */
function isValidSolAddress(value) {
  const address = String(value ?? '').trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return false;
  const bytes = base58Decode(address);
  return Boolean(bytes) && bytes.length === 32;
}

function isValidAddress(chain, value) {
  if (chain === 'ethereum') return isValidEthAddress(value);
  if (chain === 'solana') return isValidSolAddress(value);
  return false;
}

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

function firstSet(env, ...names) {
  for (const name of names) {
    const value = String(env[name] ?? '').trim();
    if (value) return value;
  }
  return '';
}

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/**
 * Reads the on-chain payment configuration out of env/secrets.
 *
 *   ETH_ADDRESS          receiving address for ETH and (unless overridden) USDT-ERC20
 *   SOL_ADDRESS          receiving address for SOL and (unless overridden) USDT-SPL
 *   USDT_ERC20_ADDRESS   optional: a different address for ERC-20 USDT
 *   USDT_SPL_ADDRESS     optional: a different address for SPL USDT
 *   CRYPTO_ASSETS        optional allowlist, e.g. "eth,sol" — default is every
 *                        asset whose address is configured
 *   ETHERSCAN_API_KEY    optional: switches Ethereum reads to Etherscan v2
 *   ETH_EXPLORER_URL     optional: any Etherscan-compatible API base
 *   SOLANA_RPC_URL       optional: a dedicated Solana RPC
 *   CRYPTO_ETH_CONFIRMATIONS  blocks before ETH/ERC-20 money counts (default 12)
 *   CRYPTO_SOL_CONFIRMATIONS  kept for symmetry; Solana reads are `finalized`,
 *                             which is already irreversible (default 1)
 *
 * An address that fails validation is DROPPED rather than used: a typo'd
 * receiving address must take its coin off the checkout page, never quietly
 * send buyers' money into a hole. `invalid` carries those rejects so the admin
 * panel can say which secret is wrong.
 */
function chainConfig(env = {}) {
  const ethAddress = firstSet(env, 'ETH_ADDRESS', 'CRYPTO_ETH_ADDRESS');
  const solAddress = firstSet(env, 'SOL_ADDRESS', 'CRYPTO_SOL_ADDRESS');

  const configured = {
    eth: ethAddress,
    sol: solAddress,
    'usdt-erc20': firstSet(env, 'USDT_ERC20_ADDRESS', 'USDT_ETH_ADDRESS') || ethAddress,
    'usdt-spl': firstSet(env, 'USDT_SPL_ADDRESS', 'USDT_SOL_ADDRESS') || solAddress,
  };

  const allowRaw = String(env.CRYPTO_ASSETS ?? '').trim().toLowerCase();
  const allow = allowRaw
    ? new Set(allowRaw.split(',').map((s) => s.trim()).filter(Boolean))
    : null;

  const assets = [];
  const invalid = [];
  for (const key of ASSET_KEYS) {
    const meta = ASSETS[key];
    const address = configured[key];
    if (!address) continue;
    if (allow && !allow.has(key)) continue;
    if (!isValidAddress(meta.chain, address)) {
      invalid.push({ key, address, reason: `not a valid ${meta.chain} address` });
      continue;
    }
    assets.push({ ...meta, address });
  }

  const apiKey = String(env.ETHERSCAN_API_KEY ?? '').trim();
  const explorerUrl = String(env.ETH_EXPLORER_URL ?? '').trim()
    || (apiKey ? ETHERSCAN_V2 : DEFAULT_ETH_EXPLORER);

  return {
    assets,
    invalid,
    byKey: Object.fromEntries(assets.map((a) => [a.key, a])),
    configured: assets.length > 0,
    eth: {
      explorerUrl: explorerUrl.replace(/\/$/, ''),
      apiKey,
      chainId: positiveInt(env.ETH_CHAIN_ID, 1),
      usdtContract: (String(env.USDT_ERC20_CONTRACT ?? '').trim() || DEFAULT_USDT_ERC20).toLowerCase(),
      confirmations: Math.max(1, positiveInt(env.CRYPTO_ETH_CONFIRMATIONS, 12)),
    },
    sol: {
      rpcUrl: (String(env.SOLANA_RPC_URL ?? '').trim() || DEFAULT_SOLANA_RPC).replace(/\/$/, ''),
      usdtMint: String(env.USDT_SPL_MINT ?? '').trim() || DEFAULT_USDT_SPL_MINT,
      confirmations: Math.max(1, positiveInt(env.CRYPTO_SOL_CONFIRMATIONS, 1)),
    },
    // How many recent transactions each scan looks back over. Bounded because
    // every scan runs inside somebody's page load.
    scanDepth: Math.min(100, Math.max(5, positiveInt(env.CRYPTO_SCAN_DEPTH, 25))),
  };
}

/** Confirmations required before an asset's money is treated as real. */
function requiredConfirmations(cfg, asset) {
  return asset.chain === 'solana' ? cfg.sol.confirmations : cfg.eth.confirmations;
}

/* ------------------------------------------------------------------ *
 * HTTP
 * ------------------------------------------------------------------ */

async function timedFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url) {
  const res = await timedFetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

async function postJson(url, body) {
  const res = await timedFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

/* ------------------------------------------------------------------ *
 * Ethereum
 * ------------------------------------------------------------------ */

function ethUrl(cfg, params) {
  const url = new URL(cfg.eth.explorerUrl);
  // Etherscan v2 multiplexes every chain behind one host and needs chainid.
  if (cfg.eth.explorerUrl.startsWith(ETHERSCAN_V2)) url.searchParams.set('chainid', String(cfg.eth.chainId));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  if (cfg.eth.apiKey) url.searchParams.set('apikey', cfg.eth.apiKey);
  return url.toString();
}

/**
 * Etherscan-style responses use status "1" for results and "0" for both "no
 * results" and hard errors, distinguished only by the message. Getting that
 * wrong in either direction is expensive: a rate-limit reply read as "no
 * transactions" would expire a paid order.
 */
function ethResult(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('explorer returned no payload');
  if (payload.error) throw new Error(String(payload.error.message || payload.error).slice(0, 160));
  const status = String(payload.status ?? '');
  const message = String(payload.message ?? '');
  if (status === '1') return Array.isArray(payload.result) ? payload.result : [];
  if (/no transactions found|no records found/i.test(message)) return [];
  const detail = typeof payload.result === 'string' ? payload.result : message;
  throw new Error(`explorer error: ${(detail || 'unknown').slice(0, 160)}`);
}

async function ethProxy(cfg, action, params = {}) {
  const payload = await getJson(ethUrl(cfg, { module: 'proxy', action, ...params }));
  if (payload && payload.error) {
    throw new Error(String(payload.error.message || payload.error).slice(0, 160));
  }
  return payload ? payload.result : null;
}

async function ethLatestBlock(cfg) {
  const hex = await ethProxy(cfg, 'eth_blockNumber');
  const n = Number.parseInt(String(hex ?? ''), 16);
  if (!Number.isFinite(n) || n <= 0) throw new Error('could not read the latest Ethereum block');
  return n;
}

const sameAddress = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

/** Sums a list of explorer rows into one { txHash -> total } map. */
function sumByTx(rows, address, valueOf, keep = () => true) {
  const totals = new Map();
  for (const row of rows) {
    if (!row || !sameAddress(row.to, address) || !keep(row)) continue;
    let value;
    try { value = BigInt(String(row.value ?? '0')); } catch { continue; }
    if (value <= 0n) continue;
    const hash = String(row.hash ?? row.transactionHash ?? '').toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(hash)) continue;
    const prev = totals.get(hash);
    const block = Number(row.blockNumber);
    totals.set(hash, {
      units: (prev ? prev.units : 0n) + value,
      block: Number.isFinite(block) ? block : (prev ? prev.block : 0),
      blockTime: Number(row.timeStamp) || (prev ? prev.blockTime : 0),
    });
  }
  return totals;
}

/**
 * Everything that has arrived at our Ethereum address for one asset recently.
 *
 * Native ETH covers both ordinary transfers and internal (contract-forwarded)
 * ones, because money sent through an exchange's or a smart wallet's forwarder
 * shows up only in the internal list — and a buyer who paid that way has still
 * paid.
 */
async function ethIncoming(cfg, asset, { sinceBlock = 0 } = {}) {
  const address = asset.address;
  const latest = await ethLatestBlock(cfg);
  const startBlock = Math.max(0, sinceBlock);

  const totals = new Map();
  let highestBlock = startBlock;
  const merge = (map) => {
    for (const [hash, entry] of map) {
      const prev = totals.get(hash);
      totals.set(hash, prev ? { ...entry, units: prev.units + entry.units } : entry);
    }
  };

  /**
   * Reads every row from `startBlock` forward, oldest first, in pages.
   *
   * The direction matters. Reading the NEWEST page and stopping meant anyone
   * could bury a real payment: transactions to a public address are not ours to
   * control, and a handful of cheap dust transfers would push a buyer's payment
   * off the only page we ever looked at — permanently, since every later scan
   * issued the same query and got the same dust. Reading forward from the
   * cursor cannot skip anything: the oldest unprocessed rows come first, and
   * the cursor only advances past what we have actually seen.
   */
  const readAll = async (action, extra, keep) => {
    let page = 1;
    let rows = [];
    for (; page <= ETH_MAX_PAGES_PER_SCAN; page += 1) {
      const batch = ethResult(await getJson(ethUrl(cfg, {
        module: 'account', action, address, ...extra,
        startblock: startBlock, endblock: 99999999,
        page, offset: ETH_PAGE_SIZE, sort: 'asc',
      })));
      rows = rows.concat(batch);
      // Track the cursor against EVERY row, not just the ones that paid us —
      // otherwise a window full of unrelated traffic never advances it.
      for (const row of batch) {
        const block = Number(row && row.blockNumber);
        if (Number.isFinite(block) && block > highestBlock) highestBlock = block;
      }
      if (batch.length < ETH_PAGE_SIZE) break;
    }
    merge(sumByTx(rows, address, null, keep));
  };

  if (asset.kind === 'native') {
    // A reverted transaction moved no money, whatever its value field says.
    await readAll('txlist', {}, (r) => String(r.isError ?? '0') === '0'
      && String(r.txreceipt_status ?? '1') !== '0');

    // Internal transfers are best-effort: not every explorer exposes them, and a
    // provider that doesn't must not fail the whole scan.
    try {
      await readAll('txlistinternal', {}, (r) => String(r.isError ?? '0') === '0');
    } catch { /* external transfers alone are still a valid scan */ }
  } else {
    await readAll('tokentx', { contractaddress: cfg.eth.usdtContract },
      (r) => sameAddress(r.contractAddress, cfg.eth.usdtContract));
  }

  const transfers = [...totals].map(([txHash, entry]) => ({
    asset: asset.key,
    txHash,
    address,
    units: entry.units,
    block: entry.block,
    blockTime: entry.blockTime,
    confirmations: entry.block > 0 ? Math.max(0, latest - entry.block + 1) : 0,
  })).sort((a, b) => b.block - a.block);

  // `latestBlock` is reported alongside the rows because the caller needs to
  // age payments it already knows about, not only the ones this window
  // returned — and it must not cost a second round trip to ask again.
  return { transfers, highestBlock, latestBlock: latest };
}

const HEX64 = /^0x[0-9a-fA-F]{64}$/;

/** Pads/normalises a 32-byte log topic into a plain 0x address. */
function topicToAddress(topic) {
  const raw = String(topic ?? '');
  if (!HEX64.test(raw)) return '';
  return `0x${raw.slice(-40)}`.toLowerCase();
}

/**
 * Looks one specific Ethereum transaction up. This is the manual escape hatch:
 * a buyer whose payment the scan hasn't picked up (a provider hiccup, an
 * address we only started watching later) pastes their transaction hash and we
 * go and read exactly that transaction.
 */
async function ethTransaction(cfg, asset, txHash) {
  const hash = String(txHash ?? '').trim().toLowerCase();
  if (!HEX64.test(hash)) return null;

  const receipt = await ethProxy(cfg, 'eth_getTransactionReceipt', { txhash: hash });
  if (!receipt || !receipt.blockNumber) return null;
  // status is absent on pre-Byzantium blocks; anything explicitly 0x0 reverted.
  if (receipt.status !== undefined && receipt.status !== null && String(receipt.status) === '0x0') return null;

  const block = Number.parseInt(String(receipt.blockNumber), 16);
  if (!Number.isFinite(block)) return null;
  const latest = await ethLatestBlock(cfg);

  let units = 0n;
  if (asset.kind === 'native') {
    const tx = await ethProxy(cfg, 'eth_getTransactionByHash', { txhash: hash });
    if (!tx || !sameAddress(tx.to, asset.address)) return null;
    try { units = BigInt(String(tx.value ?? '0x0')); } catch { return null; }
  } else {
    for (const log of Array.isArray(receipt.logs) ? receipt.logs : []) {
      if (!log || !sameAddress(log.address, cfg.eth.usdtContract)) continue;
      const topics = Array.isArray(log.topics) ? log.topics : [];
      if (topics.length < 3 || !sameAddress(topics[0], TRANSFER_TOPIC)) continue;
      if (!sameAddress(topicToAddress(topics[2]), asset.address)) continue;
      try { units += BigInt(String(log.data ?? '0x0')); } catch { /* unreadable log — skip */ }
    }
  }
  if (units <= 0n) return null;

  let blockTime = 0;
  try {
    const blockInfo = await ethProxy(cfg, 'eth_getBlockByNumber', { tag: receipt.blockNumber, boolean: 'false' });
    blockTime = Number.parseInt(String(blockInfo && blockInfo.timestamp), 16) || 0;
  } catch { /* timestamp is advisory only */ }

  return {
    asset: asset.key,
    txHash: hash,
    address: asset.address,
    units,
    block,
    blockTime,
    confirmations: Math.max(0, latest - block + 1),
  };
}

/* ------------------------------------------------------------------ *
 * Solana
 * ------------------------------------------------------------------ */

let solRequestId = 0;

async function solRpc(cfg, method, params) {
  solRequestId += 1;
  const payload = await postJson(cfg.sol.rpcUrl, {
    jsonrpc: '2.0', id: solRequestId, method, params,
  });
  if (!payload || typeof payload !== 'object') throw new Error('Solana RPC returned no payload');
  if (payload.error) {
    throw new Error(`Solana RPC ${method}: ${String(payload.error.message || payload.error.code).slice(0, 160)}`);
  }
  return payload.result;
}

/**
 * The SPL token accounts our owner address holds for a mint. USDT does not
 * arrive at the wallet address itself — it lands in an associated token account
 * owned by it — so that is what has to be watched. An owner who has never been
 * sent USDT has no such account yet, which is a legitimate empty result.
 */
async function solTokenAccounts(cfg, owner, mint) {
  const result = await solRpc(cfg, 'getTokenAccountsByOwner', [
    owner, { mint }, { encoding: 'jsonParsed', commitment: 'finalized' },
  ]);
  const list = (result && Array.isArray(result.value)) ? result.value : [];

  // Anyone can create a token account naming someone else as its owner, for the
  // price of the rent — so the length of this list is attacker-controlled, and
  // scanning all of it would let a stranger turn every scan into an arbitrarily
  // long chain of RPC calls. Watch the few that actually hold the money: real
  // payments land in the account with a balance, and a brand-new empty one is
  // covered on the next scan once it has one.
  const scored = list.map((entry) => {
    const info = entry && entry.account && entry.account.data
      && entry.account.data.parsed && entry.account.data.parsed.info;
    const amount = info && info.tokenAmount && info.tokenAmount.amount;
    let balance = 0n;
    try { balance = BigInt(String(amount ?? '0')); } catch { /* unreadable — treat as empty */ }
    return { pubkey: String(entry && entry.pubkey), balance };
  }).filter((a) => a.pubkey);

  scored.sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0));
  return scored.slice(0, MAX_TOKEN_ACCOUNTS_WATCHED).map((a) => a.pubkey);
}

/** How much of `asset` a parsed transaction moved INTO our address. */
function solCredit(cfg, asset, tx) {
  if (!tx || !tx.meta || tx.meta.err) return 0n;
  const meta = tx.meta;

  if (asset.kind === 'native') {
    const message = tx.transaction && tx.transaction.message;
    const keys = (message && message.accountKeys) || [];
    const index = keys.findIndex((k) => String(k && (k.pubkey ?? k)) === asset.address);
    if (index < 0) return 0n;
    const pre = BigInt(String((meta.preBalances || [])[index] ?? '0'));
    const post = BigInt(String((meta.postBalances || [])[index] ?? '0'));
    const delta = post - pre;
    return delta > 0n ? delta : 0n;
  }

  // SPL: compare our owner's balance for the mint before and after. Working
  // from balances rather than instructions covers every way tokens can move —
  // a plain transfer, a transferChecked, a CPI from some other program.
  const mine = (list) => (Array.isArray(list) ? list : []).reduce((sum, entry) => {
    if (!entry || String(entry.mint) !== cfg.sol.usdtMint) return sum;
    if (String(entry.owner ?? '') !== asset.address) return sum;
    const amount = entry.uiTokenAmount && entry.uiTokenAmount.amount;
    try { return sum + BigInt(String(amount ?? '0')); } catch { return sum; }
  }, 0n);

  const delta = mine(meta.postTokenBalances) - mine(meta.preTokenBalances);
  return delta > 0n ? delta : 0n;
}

async function solGetTransaction(cfg, signature) {
  return solRpc(cfg, 'getTransaction', [
    signature,
    { encoding: 'jsonParsed', commitment: 'finalized', maxSupportedTransactionVersion: 0 },
  ]);
}

/**
 * Recent incoming payments on Solana. Everything is read at `finalized`
 * commitment, which is the point at which a Solana transaction cannot be rolled
 * back — so anything this returns is already as confirmed as it will ever get.
 *
 * Unlike an Ethereum explorer, the RPC lists signatures without amounts, so
 * each unseen one costs a round trip. `known` (signatures already recorded) and
 * `limit` keep that bounded: a scan works through the backlog a slice at a
 * time instead of stalling somebody's page load.
 */
async function solIncoming(cfg, asset, { known = new Set(), limit = 12 } = {}) {
  const watched = asset.kind === 'native'
    ? [asset.address]
    : await solTokenAccounts(cfg, asset.address, cfg.sol.usdtMint);
  // Same shape as every other exit. Returning a bare array here made
  // `result.transfers` undefined in the caller, which reads as "the chain says
  // nothing arrived" — the one thing this module promises never to say.
  if (watched.length === 0) return { transfers: [], highestBlock: 0, latestBlock: 0 };

  const out = [];
  const seen = new Set();
  let lookups = 0;

  for (const account of watched) {
    const signatures = await solRpc(cfg, 'getSignaturesForAddress', [
      account, { limit: cfg.scanDepth, commitment: 'finalized' },
    ]);

    for (const entry of Array.isArray(signatures) ? signatures : []) {
      const signature = String(entry && entry.signature ? entry.signature : '');
      if (!signature || seen.has(signature)) continue;
      seen.add(signature);
      // Already looked at on an earlier scan: the caller has it recorded, and
      // re-reading it would cost a round trip to say the same thing.
      if (known.has(signature)) continue;
      // A failed transaction moved nothing, and costs nothing to dismiss.
      if (entry.err) continue;
      if (lookups >= limit) break;
      lookups += 1;

      const tx = await solGetTransaction(cfg, signature);
      // Null means not finalized yet — leave it entirely alone so the next scan
      // picks it up, rather than recording it as a signature that paid nothing.
      if (!tx) continue;

      out.push({
        asset: asset.key,
        txHash: signature,
        address: asset.address,
        // Zero is returned deliberately: the caller records it as `ignored`, so
        // an unrelated transaction touching our wallet is dismissed once rather
        // than re-fetched on every single scan.
        units: solCredit(cfg, asset, tx),
        block: Number(tx.slot) || 0,
        blockTime: Number(tx.blockTime) || 0,
        confirmations: cfg.sol.confirmations,
      });
    }
    if (lookups >= limit) break;
  }
  // Solana reads are `finalized`, so a transfer that is visible at all is
  // already as confirmed as it will ever get — there is no height to age it
  // against, and none is reported.
  return { transfers: out.sort((a, b) => b.block - a.block), highestBlock: 0, latestBlock: 0 };
}

/** One specific Solana transaction, for the paste-your-signature fallback. */
async function solTransaction(cfg, asset, signature) {
  const sig = String(signature ?? '').trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,120}$/.test(sig)) return null;
  const tx = await solGetTransaction(cfg, sig);
  if (!tx) return null;
  const units = solCredit(cfg, asset, tx);
  if (units <= 0n) return null;
  return {
    asset: asset.key,
    txHash: sig,
    address: asset.address,
    units,
    block: Number(tx.slot) || 0,
    blockTime: Number(tx.blockTime) || 0,
    confirmations: cfg.sol.confirmations,
  };
}

/* ------------------------------------------------------------------ *
 * Chain-agnostic entry points
 * ------------------------------------------------------------------ */

/**
 * Recent incoming transfers for one asset, as
 * { transfers, highestBlock, latestBlock }.
 *
 * `highestBlock` is where the caller's cursor should move to — tracked over
 * every row the provider returned, not only the ones that paid us, so a window
 * full of unrelated traffic still advances it. `latestBlock` is the chain's
 * current height (0 where the chain has no such notion), so the caller can age
 * payments it recorded earlier without paying for another round trip.
 *
 * Throws if the provider is unreachable: a failed lookup must never read as
 * "nothing was paid".
 */
function fetchIncoming(cfg, asset, cursor = {}) {
  return asset.chain === 'solana' ? solIncoming(cfg, asset, cursor) : ethIncoming(cfg, asset, cursor);
}

/** One transaction by hash/signature, or null if it doesn't pay us. */
function fetchTransaction(cfg, asset, reference) {
  return asset.chain === 'solana'
    ? solTransaction(cfg, asset, reference)
    : ethTransaction(cfg, asset, reference);
}

/** Shape check for a user-supplied transaction reference, before any network call. */
function isTransactionRef(chain, value) {
  const raw = String(value ?? '').trim();
  if (chain === 'ethereum') return HEX64.test(raw);
  return /^[1-9A-HJ-NP-Za-km-z]{64,120}$/.test(raw);
}

/** A public explorer link for a transaction, so buyers and staff can see it. */
function explorerLink(asset, txHash) {
  if (!txHash) return '';
  return asset.chain === 'solana'
    ? `https://solscan.io/tx/${encodeURIComponent(txHash)}`
    : `https://etherscan.io/tx/${encodeURIComponent(txHash)}`;
}

/**
 * A wallet deep link for the exact payment, so a phone can scan or tap it
 * instead of retyping an address: EIP-681 on Ethereum, Solana Pay on Solana.
 */
function paymentUri(cfg, asset, units) {
  const amount = fromUnits(units, asset.decimals);
  if (asset.key === 'eth') return `ethereum:${asset.address}@${cfg.eth.chainId}?value=${units.toString()}`;
  if (asset.key === 'usdt-erc20') {
    return `ethereum:${cfg.eth.usdtContract}@${cfg.eth.chainId}/transfer`
      + `?address=${asset.address}&uint256=${units.toString()}`;
  }
  if (asset.key === 'sol') return `solana:${asset.address}?amount=${amount}`;
  return `solana:${asset.address}?amount=${amount}&spl-token=${cfg.sol.usdtMint}`;
}

export {
  ASSETS, ASSET_KEYS, chainConfig, requiredConfirmations,
  isValidAddress, isValidEthAddress, isValidSolAddress, base58Decode,
  fetchIncoming, fetchTransaction, isTransactionRef, explorerLink, paymentUri,
  ethIncoming, ethTransaction, solIncoming, solTransaction, solCredit, solTokenAccounts,
  TRANSFER_TOPIC, DEFAULT_USDT_ERC20, DEFAULT_USDT_SPL_MINT, MAX_TOKEN_ACCOUNTS_WATCHED,
};
