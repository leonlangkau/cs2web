/**
 * Direct-to-wallet crypto payments: ETH, SOL and USDT.
 *
 * These drive the real router, the real matching engine and the real database
 * over a FAKE CHAIN — globalThis.fetch is replaced with a stub that speaks the
 * Etherscan and Solana JSON-RPC dialects — so everything except the network is
 * the code that runs in production. Nothing here reaches the internet.
 *
 * The properties worth protecting, in rough order of how expensive it would be
 * to get them wrong:
 *
 *   1. A payment credits exactly one membership, however many times it is seen.
 *   2. A payment that could belong to two orders credits NEITHER automatically.
 *   3. A provider outage never looks like "nobody paid".
 *   4. Amounts survive as exact integers — no float, no rounding drift.
 *   5. A mistyped receiving address takes its coin off sale rather than
 *      silently collecting money nobody can spend.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTestApp } from "./harness.mjs";
import { makeClient, signUp } from "./client.mjs";
import { decodeQr } from "./qr-decoder.mjs";
import {
  chainConfig, isValidEthAddress, isValidSolAddress, paymentUri, explorerLink,
} from "../functions/_lib/chains.js";
import { keccak256Hex } from "../functions/_lib/keccak.js";
import { toUnits, fromUnits, fiatToUnits, ceilTo } from "../functions/_lib/units.js";
import { qrMatrix, qrSvg } from "../functions/_lib/qr.js";
import { onchainConfig } from "../functions/_lib/onchain.js";

/* Real addresses in shape only — these are the well-known EIP-55 test vectors
   and the USDT mint, never anyone's actual wallet. */
const ETH_ADDRESS = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";
const SOL_ADDRESS = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const USDT_CONTRACT = "0xdac17f958d2ee523a2206206994597c13d831ec7";
const USDT_SPL_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const TX_A = `0x${"ab".repeat(32)}`;
const TX_B = `0x${"cd".repeat(32)}`;
const SOL_SIG = `5${"K".repeat(63)}`;

const BASE_ENV = {
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "admin-test-password-1",
  CAPTCHA_DIFFICULTY: "10",
  CAPTCHA_SECRET: "test-captcha-secret",
  PBKDF2_ITERATIONS: "10000",
  RATE_LIMIT_SIGNUP: "50",
  PAID_PRICE_AMOUNT: "10.00",
  PAID_PERIOD_DAYS: "30",
};

const CHAIN_ENV = {
  ...BASE_ENV,
  ETH_ADDRESS,
  SOL_ADDRESS,
  CRYPTO_SCAN_SECRET: "cron-secret-value",
};

/* ------------------------------------------------------------------ *
 * A fake chain
 * ------------------------------------------------------------------ */

/**
 * Replaces globalThis.fetch for the duration of `fn`. `chain` describes what
 * the world looks like: the ETH price, the latest block, and which transfers
 * exist. Anything the code asks for that isn't described here fails loudly
 * rather than silently returning empty — a test that accidentally hits an
 * undescribed endpoint should notice.
 */
async function withChain(chain, fn) {
  const original = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push(url);
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

    if (chain.down) throw new Error("simulated network outage");

    // --- price feed ---
    if (url.startsWith("https://api.coinbase.com/v2/prices/")) {
      const symbol = url.split("/prices/")[1].split("-")[0];
      const rate = (chain.rates || {})[symbol];
      if (!rate) return json({ errors: [{ id: "not_found" }] }, 404);
      return json({ data: { base: symbol, currency: "USD", amount: rate } });
    }
    if (url.startsWith("https://api.coingecko.com/")) return json({}, 429);

    // --- Ethereum: an Etherscan-compatible explorer ---
    if (url.startsWith("https://eth.blockscout.com/api")) {
      const q = new URL(url).searchParams;
      const action = q.get("action");
      if (action === "eth_blockNumber") {
        return json({ result: "0x" + (chain.latestBlock || 1000).toString(16) });
      }
      if (action === "eth_getTransactionReceipt") {
        const receipt = (chain.receipts || {})[String(q.get("txhash")).toLowerCase()];
        return json({ result: receipt || null });
      }
      if (action === "eth_getTransactionByHash") {
        const tx = (chain.txs || {})[String(q.get("txhash")).toLowerCase()];
        return json({ result: tx || null });
      }
      if (action === "eth_getBlockByNumber") {
        return json({ result: { timestamp: `0x${(chain.blockTime || nowSeconds()).toString(16)}` } });
      }
      const all = action === "txlist" ? (chain.txlist || [])
        : action === "txlistinternal" ? (chain.internal || [])
          : action === "tokentx" ? (chain.tokentx || []) : null;
      if (all === null) throw new Error(`unexpected explorer action: ${action}`);

      // Page and sort the way a real explorer does. This matters: reading only
      // the newest page is exactly how a payment got buried behind dust, so a
      // stub that ignores paging would hide the bug it is meant to catch.
      const sorted = [...all].sort((a, b) => (q.get("sort") === "asc"
        ? Number(a.blockNumber) - Number(b.blockNumber)
        : Number(b.blockNumber) - Number(a.blockNumber)));
      const from = Number(q.get("startblock") || 0);
      const inRange = sorted.filter((r) => Number(r.blockNumber) >= from);
      const size = Number(q.get("offset") || 100);
      const page = Number(q.get("page") || 1);
      const rows = inRange.slice((page - 1) * size, page * size);
      return rows.length
        ? json({ status: "1", message: "OK", result: rows })
        : json({ status: "0", message: "No transactions found", result: [] });
    }

    // --- Solana JSON-RPC ---
    if (url.startsWith("https://api.mainnet-beta.solana.com")) {
      const body = JSON.parse(String(init.body || "{}"));
      const reply = (result) => json({ jsonrpc: "2.0", id: body.id, result });
      if (body.method === "getTokenAccountsByOwner") {
        return reply({
          value: (chain.tokenAccounts || []).map((pubkey) => ({
            pubkey,
            account: { data: { parsed: { info: { tokenAmount: {
              amount: String((chain.balances || {})[pubkey] || "0"),
            } } } } },
          })),
        });
      }
      if (body.method === "getSignaturesForAddress") {
        return reply((chain.signatures || []).map((s) => ({
          signature: s.signature, slot: s.slot || 100, err: s.err || null,
          confirmationStatus: "finalized",
        })));
      }
      if (body.method === "getTransaction") {
        const sig = body.params[0];
        const found = (chain.signatures || []).find((s) => s.signature === sig);
        return reply(found && found.tx ? found.tx : null);
      }
      throw new Error(`unexpected Solana method: ${body.method}`);
    }

    throw new Error(`unexpected fetch to ${url}`);
  };

  try {
    return await fn({ calls });
  } finally {
    globalThis.fetch = original;
  }
}

/** Block timestamps default to now: money is only ever matched to an order that
    already existed when it arrived, so a fixture stamped in the past is a
    different scenario entirely (and has its own test below). */
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** An Ethereum transfer of `units` wei to our address, `confs` blocks deep. */
const ethTx = (hash, units, { latest = 1000, confs = 20, to = ETH_ADDRESS, at = nowSeconds(), block } = {}) => ({
  hash, to, from: "0x1111111111111111111111111111111111111111",
  value: String(units), blockNumber: String(block === undefined ? latest - confs + 1 : block),
  timeStamp: String(at), isError: "0", txreceipt_status: "1",
});

/** A Solana transfer of `units` lamports into our address. */
const solTx = (signature, units, { address = SOL_ADDRESS, at = nowSeconds() } = {}) => ({
  signature, slot: 500,
  tx: {
    slot: 500, blockTime: at,
    transaction: { message: { accountKeys: [{ pubkey: "SenderPubkey1111111111111111111111111111111" }, { pubkey: address }] } },
    meta: { err: null, preBalances: [9999999999, 0], postBalances: [9999999999 - Number(units), Number(units)] },
  },
});

/** The throttle exists to protect the upstream APIs; tests fast-forward past it. */
const elapseScanWindow = (db) => db.run("DELETE FROM settings WHERE key = 'chain_scan_at'");

/** Rates are cached for 90s. Dropping the cache is how a test says "time passed". */
const elapseRateCache = (db) => db.run("DELETE FROM settings WHERE key LIKE 'rate:%'");

/** Signs a member up and opens an order, returning the stored row. */
async function openOrder(app, db, env, username, asset = "eth") {
  const { client } = await signUp(app, env, username);
  const res = await client.post("/upgrade/crypto", { plan: "paid", asset });
  const order = await db.get(
    "SELECT * FROM chain_orders WHERE username = ? ORDER BY id DESC LIMIT 1", username
  );
  return { client, res, order };
}

/* ------------------------------------------------------------------ *
 * Configuration + validation
 * ------------------------------------------------------------------ */

test("addresses: EIP-55 catches a mistyped Ethereum address, and a bad address takes its coin off sale", () => {
  // The four vectors from EIP-55 itself.
  for (const good of [
    "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
    "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359",
    "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB",
    "0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb",
  ]) assert.ok(isValidEthAddress(good), `${good} is a valid checksummed address`);

  // Two characters transposed — the exact mistake a manual re-type makes.
  assert.ok(!isValidEthAddress("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAde"),
    "a transposed checksummed address is rejected");
  assert.ok(isValidEthAddress(ETH_ADDRESS.toLowerCase()),
    "an all-lowercase address carries no checksum and is accepted as given");
  assert.ok(!isValidEthAddress("0xdeadbeef"), "a truncated address is rejected");

  assert.ok(isValidSolAddress(SOL_ADDRESS), "a 32-byte base58 key is a valid Solana address");
  assert.ok(!isValidSolAddress("0lIO-not-base58"), "non-base58 is rejected");
  assert.ok(!isValidSolAddress("abc"), "a short key is rejected");

  // The consequence: a bad secret must remove the coin, never collect money.
  const broken = chainConfig({ ETH_ADDRESS: "0xnot-an-address", SOL_ADDRESS });
  assert.ok(!broken.byKey.eth, "a bad ETH address is not offered for sale");
  assert.ok(broken.byKey.sol, "the good Solana address is unaffected");
  assert.equal(broken.invalid.length, 2, "both ETH-side assets are reported as misconfigured");

  assert.equal(chainConfig({}).configured, false, "no addresses means nothing is on sale");
  const only = chainConfig({ ETH_ADDRESS, SOL_ADDRESS, CRYPTO_ASSETS: "eth,sol" });
  assert.deepEqual(only.assets.map((a) => a.key), ["eth", "sol"], "CRYPTO_ASSETS narrows what is offered");
});

test("keccak-256 matches the published vectors, including across the rate boundary", () => {
  assert.equal(keccak256Hex(""), "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
  assert.equal(keccak256Hex("abc"), "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45");
  assert.equal(keccak256Hex("testing"), "5f16f4c7f149ac4f9510d9cf8cf384038ad348b3bcdc01915f95de12df9d1b02");
  // 200 bytes spans more than one 136-byte absorb block.
  assert.equal(keccak256Hex("a".repeat(200)).length, 64);
});

test("amounts stay exact integers — no float anywhere near the money", () => {
  assert.equal(toUnits("1.5", 18), 1500000000000000000n);
  assert.equal(fromUnits(1500000000000000n, 18), "0.0015");
  assert.equal(toUnits("0.1", 18) + toUnits("0.2", 18), toUnits("0.3", 18),
    "0.1 + 0.2 is exactly 0.3 in base units");

  // Division always rounds UP, so a quote can never come out below the price.
  assert.equal(fiatToUnits("10.00", "3000", 18), 3333333333333334n);
  assert.equal(fiatToUnits("10.00", "1", 6), 10000000n, "USDT at parity is 10.000000");
  assert.equal(fiatToUnits("10.00", "0", 18), null, "a zero rate is refused, never treated as free");
  assert.equal(fiatToUnits("10.00", "abc", 18), null, "an unparseable rate is refused");

  // Wei amounts exceed Number.MAX_SAFE_INTEGER, which is the whole point.
  assert.ok(3333333333333334n > BigInt(Number.MAX_SAFE_INTEGER) / 3n);
  assert.equal(ceilTo(3333333333333334n, 10000000000000n), 3340000000000000n);
});

test("payment URIs are the ones wallets actually understand", () => {
  const cfg = chainConfig({ ETH_ADDRESS, SOL_ADDRESS });
  assert.equal(paymentUri(cfg, cfg.byKey.eth, 2922652014437901n),
    `ethereum:${ETH_ADDRESS}@1?value=2922652014437901`);
  assert.equal(paymentUri(cfg, cfg.byKey["usdt-erc20"], 10420000n),
    `ethereum:${USDT_CONTRACT}@1/transfer?address=${ETH_ADDRESS}&uint256=10420000`,
    "ERC-20 payments target the token contract's transfer(), per EIP-681");
  assert.equal(paymentUri(cfg, cfg.byKey.sol, 66123456n), `solana:${SOL_ADDRESS}?amount=0.066123456`);
  assert.ok(paymentUri(cfg, cfg.byKey["usdt-spl"], 10420000n).includes("spl-token="),
    "SPL payments name the mint");
  assert.ok(explorerLink(cfg.byKey.eth, "0xabc").startsWith("https://etherscan.io/tx/"));
  assert.ok(explorerLink(cfg.byKey.sol, "sig").startsWith("https://solscan.io/tx/"));
});

/* ------------------------------------------------------------------ *
 * Quoting
 * ------------------------------------------------------------------ */

test("checkout quotes the plan in the coin, and gives every live order its own amount", async () => {
  const { app, db } = await buildTestApp(CHAIN_ENV);
  await withChain({ rates: { ETH: "3000" } }, async () => {
    const a = await openOrder(app, db, CHAIN_ENV, "coin_buyer_a");
    const b = await openOrder(app, db, CHAIN_ENV, "coin_buyer_b");

    assert.equal(a.res.status, 302);
    assert.ok(a.res.headers.get("location").startsWith("/pay/"), "checkout goes to the pay page");

    for (const order of [a.order, b.order]) {
      assert.equal(order.asset, "eth");
      assert.equal(order.address, ETH_ADDRESS, "the address comes from config, not the request");
      assert.equal(order.fiat_amount, "10.00");
      assert.equal(order.rate, "3000", "the rate is frozen onto the order");
      assert.equal(order.period_days, 30);
      assert.equal(order.status, "new");
      // Never quote less than the plan is worth.
      assert.ok(BigInt(order.expected_units) >= 3333333333333334n,
        "the quote covers the price after rounding");
      assert.ok(BigInt(order.expected_units) < 3333333333333334n + 2n * 10000000000000n,
        "and overshoots by less than two discriminator bands (about six cents)");
    }

    assert.notEqual(a.order.expected_units, b.order.expected_units,
      "two live orders never share an amount — that uniqueness IS the attribution");

    // The tolerance floor is derived here, never sent by the client.
    assert.ok(BigInt(a.order.min_units) < BigInt(a.order.expected_units));
    assert.ok(BigInt(a.order.min_units) >= (BigInt(a.order.expected_units) * 99n) / 100n);
  });
});

test("with no usable exchange rate, checkout refuses rather than inventing a price", async () => {
  const { app, db } = await buildTestApp(CHAIN_ENV);
  await withChain({ rates: {} }, async () => {
    const { client } = await signUp(app, CHAIN_ENV, "no_rate_buyer");
    const res = await client.post("/upgrade/crypto", { plan: "paid", asset: "eth" });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/buy", "the buyer is sent back, not to a pay page");
    assert.equal(await db.get("SELECT id FROM chain_orders LIMIT 1"), undefined, "no order was opened");
  });
});

test("an unknown or unconfigured coin cannot be ordered", async () => {
  const { app, db } = await buildTestApp({ ...CHAIN_ENV, CRYPTO_ASSETS: "eth" });
  await withChain({ rates: { ETH: "3000" } }, async () => {
    const { client } = await signUp(app, CHAIN_ENV, "picky_buyer");
    for (const asset of ["sol", "doge", "", "eth-mainnet"]) {
      await client.post("/upgrade/crypto", { plan: "paid", asset });
    }
    assert.equal(await db.get("SELECT id FROM chain_orders LIMIT 1"), undefined,
      "only coins the operator configured can be ordered");
  });
});

/* ------------------------------------------------------------------ *
 * The happy path, end to end
 * ------------------------------------------------------------------ */

test("ETH: paying the exact amount upgrades the account automatically, exactly once", async () => {
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const chain = { rates: { ETH: "3000" }, latestBlock: 1000, txlist: [] };

  await withChain(chain, async () => {
    const { client, order } = await openOrder(app, db, CHAIN_ENV, "eth_buyer");

    const payHtml = await (await client.get(`/pay/${order.order_id}`)).text();
    assert.ok(payHtml.includes(fromUnits(BigInt(order.expected_units), 18)),
      "the pay page shows the exact amount to send");
    assert.ok(payHtml.includes(ETH_ADDRESS), "and the address to send it to");
    assert.ok(payHtml.includes("Ethereum mainnet"), "and names the network unmissably");
    assert.ok(payHtml.includes("<svg"), "and renders a scannable QR");

    // The buyer sends exactly what was asked for.
    chain.txlist = [ethTx(TX_A, order.expected_units, { confs: 20 })];
    await elapseScanWindow(db);

    const status = await (await client.get(`/pay/${order.order_id}/status`)).json();
    assert.equal(status.ok, true);
    assert.equal(status.credited, true, "enough confirmations grants the membership");
    assert.equal(status.txHash, TX_A);

    const user = await db.get("SELECT tier, paid_until FROM users WHERE username = 'eth_buyer'");
    assert.equal(user.tier, "paid");
    assert.ok(Number(user.paid_until) > Date.now(), "and the 30 days are on the account");

    // Idempotency: the same transfer seen again must not extend anything.
    for (let i = 0; i < 3; i += 1) {
      await elapseScanWindow(db);
      await client.get(`/pay/${order.order_id}/status`);
    }
    const after = await db.get("SELECT paid_until FROM users WHERE username = 'eth_buyer'");
    assert.equal(String(after.paid_until), String(user.paid_until),
      "re-scanning a credited transfer never grants a second period");
    assert.equal((await db.all("SELECT id FROM chain_transfers WHERE status = 'credited'")).length, 1,
      "and only one credited transfer row exists");
  });
});

test("a second purchase extends the membership rather than replacing it", async () => {
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const chain = { rates: { ETH: "3000" }, latestBlock: 1000, txlist: [] };

  await withChain(chain, async () => {
    const first = await openOrder(app, db, CHAIN_ENV, "renewer");
    chain.txlist = [ethTx(TX_A, first.order.expected_units, { confs: 20 })];
    await elapseScanWindow(db);
    await first.client.get(`/pay/${first.order.order_id}/status`);
    const once = await db.get("SELECT paid_until FROM users WHERE username = 'renewer'");
    assert.ok(once.paid_until, "the first 30 days land");

    await first.client.post("/upgrade/crypto", { plan: "paid", asset: "eth" });
    const second = await db.get(
      "SELECT * FROM chain_orders WHERE username = 'renewer' ORDER BY id DESC LIMIT 1"
    );
    chain.txlist = [ethTx(TX_B, second.expected_units, { confs: 20 })];
    await elapseScanWindow(db);
    await first.client.get(`/pay/${second.order_id}/status`);

    const twice = await db.get("SELECT paid_until FROM users WHERE username = 'renewer'");
    const added = Number(twice.paid_until) - Number(once.paid_until);
    assert.ok(Math.abs(added - 30 * 86400000) < 5000,
      "the second payment adds another 30 days to the existing expiry, not from now");
  });
});

test("USDT on Ethereum credits from a token transfer, priced at the stablecoin's rate", async () => {
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const chain = { rates: { USDT: "1" }, latestBlock: 1000, tokentx: [] };

  await withChain(chain, async () => {
    const { client, order } = await openOrder(app, db, CHAIN_ENV, "usdt_buyer", "usdt-erc20");
    assert.equal(order.decimals, 6);
    assert.ok(BigInt(order.expected_units) >= 10000000n, "10 USDT is at least 10000000 base units");
    assert.ok(BigInt(order.expected_units) < 10020000n, "with a discriminator worth under two cents");

    chain.tokentx = [{
      hash: TX_A, to: ETH_ADDRESS, from: "0x2222222222222222222222222222222222222222",
      contractAddress: USDT_CONTRACT, value: order.expected_units,
      blockNumber: "981", timeStamp: String(nowSeconds()), tokenSymbol: "USDT", tokenDecimal: "6",
    }];
    await elapseScanWindow(db);

    const status = await (await client.get(`/pay/${order.order_id}/status`)).json();
    assert.equal(status.credited, true, "an ERC-20 transfer of the exact amount credits");
    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'usdt_buyer'")).tier, "paid");
  });
});

test("SOL: a native transfer is read from the balance delta and credits", async () => {
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const chain = { rates: { SOL: "150" }, signatures: [] };

  await withChain(chain, async () => {
    const { client, order } = await openOrder(app, db, CHAIN_ENV, "sol_buyer", "sol");
    assert.equal(order.chain, "solana");

    chain.signatures = [solTx(SOL_SIG, order.expected_units)];
    await elapseScanWindow(db);

    const status = await (await client.get(`/pay/${order.order_id}/status`)).json();
    assert.equal(status.credited, true, "a finalized Solana transfer credits immediately");
    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'sol_buyer'")).tier, "paid");
  });
});

test("SPL USDT is watched at the owner's token account, not the wallet address", async () => {
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const ata = "TokenAccount111111111111111111111111111111";
  const chain = { rates: { USDT: "1" }, tokenAccounts: [ata], signatures: [] };

  await withChain(chain, async ({ calls }) => {
    const { client, order } = await openOrder(app, db, CHAIN_ENV, "spl_buyer", "usdt-spl");

    chain.signatures = [{
      signature: SOL_SIG, slot: 700,
      tx: {
        slot: 700, blockTime: nowSeconds(),
        transaction: { message: { accountKeys: [{ pubkey: ata }] } },
        meta: {
          err: null, preBalances: [0], postBalances: [0],
          preTokenBalances: [{ mint: USDT_SPL_MINT, owner: SOL_ADDRESS, uiTokenAmount: { amount: "0" } }],
          postTokenBalances: [{ mint: USDT_SPL_MINT, owner: SOL_ADDRESS, uiTokenAmount: { amount: order.expected_units } }],
        },
      },
    }];
    await elapseScanWindow(db);

    const status = await (await client.get(`/pay/${order.order_id}/status`)).json();
    assert.equal(status.credited, true, "an SPL transfer into the owner's token account credits");
    assert.ok(calls.some((u) => u.startsWith("https://api.mainnet-beta.solana.com")),
      "and it went through the Solana RPC");
  });
});

/* ------------------------------------------------------------------ *
 * The cases that must NOT credit
 * ------------------------------------------------------------------ */

test("a payment matching two live orders credits neither — it goes to a human", async () => {
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const chain = { rates: { ETH: "3000" }, latestBlock: 1000, txlist: [] };

  await withChain(chain, async () => {
    const a = await openOrder(app, db, CHAIN_ENV, "ambig_a");
    const b = await openOrder(app, db, CHAIN_ENV, "ambig_b");

    // An amount that clears BOTH orders' minimums but equals neither exactly.
    const higher = BigInt(a.order.expected_units) > BigInt(b.order.expected_units)
      ? BigInt(a.order.expected_units) : BigInt(b.order.expected_units);
    chain.txlist = [ethTx(TX_A, higher + 7n, { confs: 30 })];
    await elapseScanWindow(db);
    await a.client.get(`/pay/${a.order.order_id}/status`);

    assert.equal((await db.all("SELECT id FROM chain_orders WHERE credited_at IS NOT NULL")).length, 0,
      "neither buyer is credited from an ambiguous payment");
    for (const name of ["ambig_a", "ambig_b"]) {
      assert.equal((await db.get("SELECT tier FROM users WHERE username = ?", name)).tier, "user",
        `${name} was not upgraded on money that might be somebody else's`);
    }
    const transfer = await db.get("SELECT * FROM chain_transfers ORDER BY id DESC LIMIT 1");
    assert.equal(transfer.status, "ambiguous", "the money is recorded and queued for a decision");
    assert.ok(transfer.note.includes("needs a human"));
  });
});

test("an underpayment inside tolerance credits; well under it does not", async () => {
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const chain = { rates: { ETH: "3000" }, latestBlock: 1000, txlist: [] };

  await withChain(chain, async () => {
    const { client, order } = await openOrder(app, db, CHAIN_ENV, "short_buyer");
    const expected = BigInt(order.expected_units);

    // 10% short — far below the 1% floor.
    chain.txlist = [ethTx(TX_A, (expected * 90n) / 100n, { confs: 30 })];
    await elapseScanWindow(db);
    await client.get(`/pay/${order.order_id}/status`);

    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'short_buyer'")).tier, "user",
      "a 10% underpayment does not buy a membership");
    assert.equal((await db.get("SELECT status FROM chain_transfers ORDER BY id DESC LIMIT 1")).status,
      "unmatched", "but the money is on record for staff");

    // A hair under — inside the tolerance an exchange's rounding needs.
    chain.txlist = [ethTx(TX_B, expected - expected / 200n, { confs: 30 })];
    await elapseScanWindow(db);
    await client.get(`/pay/${order.order_id}/status`);

    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'short_buyer'")).tier, "paid",
      "0.5% short is within tolerance and credits");
  });
});

test("money that arrived BEFORE an order existed is never credited to it", async () => {
  // The scenario: somebody sends to the address with no checkout open (a manual
  // transfer, a mistake, a donation). It is recorded as unattributed. Later a
  // completely unrelated buyer opens an order — and because that stray payment
  // is larger than their quote, a naive matcher would hand it to them.
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const chain = { rates: { ETH: "3000" }, latestBlock: 1000, txlist: [] };

  await withChain(chain, async () => {
    const early = await openOrder(app, db, CHAIN_ENV, "early_bird");
    // A big deposit stamped two hours ago, well before anyone else checked out.
    chain.txlist = [ethTx(TX_A, 5000000000000000000n, {
      confs: 30, at: nowSeconds() - 7200,
    })];
    await elapseScanWindow(db);
    await early.client.get(`/pay/${early.order.order_id}/status`);

    const stray = await db.get("SELECT * FROM chain_transfers ORDER BY id DESC LIMIT 1");
    assert.equal(stray.status, "unmatched", "the stray deposit is parked, not applied");
    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'early_bird'")).tier, "user");

    // Now a new buyer opens an order the stray deposit would comfortably cover.
    const later = await openOrder(app, db, CHAIN_ENV, "late_buyer");
    await elapseScanWindow(db);
    await later.client.get(`/pay/${later.order.order_id}/status`);

    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'late_buyer'")).tier, "user",
      "somebody else's money does not upgrade whoever checks out next");
    assert.equal((await db.get("SELECT status FROM chain_transfers WHERE id = ?", stray.id)).status,
      "unmatched", "it stays in the admin queue, for a human to attribute");
  });
});

test("a transfer to some other address is never credited to us", async () => {
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const chain = { rates: { ETH: "3000" }, latestBlock: 1000, txlist: [] };

  await withChain(chain, async () => {
    const { client, order } = await openOrder(app, db, CHAIN_ENV, "spoof_buyer");
    // Right amount, wrong recipient.
    chain.txlist = [ethTx(TX_A, order.expected_units, {
      confs: 30, to: "0x9999999999999999999999999999999999999999",
    })];
    await elapseScanWindow(db);
    await client.get(`/pay/${order.order_id}/status`);

    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'spoof_buyer'")).tier, "user",
      "money that never reached our address grants nothing");
    assert.equal(await db.get("SELECT id FROM chain_transfers LIMIT 1"), undefined,
      "and it is not even recorded as an incoming transfer");
  });
});

test("too few confirmations shows progress but grants nothing yet", async () => {
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const chain = { rates: { ETH: "3000" }, latestBlock: 1000, txlist: [] };

  await withChain(chain, async () => {
    const { client, order } = await openOrder(app, db, CHAIN_ENV, "slow_buyer");

    chain.txlist = [ethTx(TX_A, order.expected_units, { confs: 3 })];
    await elapseScanWindow(db);
    let status = await (await client.get(`/pay/${order.order_id}/status`)).json();
    assert.equal(status.credited, false, "3 of 12 confirmations is not enough");
    assert.equal(status.confirmations, 3);
    assert.equal(status.needed, 12);

    const html = await (await client.get(`/pay/${order.order_id}`)).text();
    assert.ok(html.includes("3 of") && html.includes("confirmations"),
      "and the buyer is told exactly where it has got to");

    // The same transaction, now buried deep enough.
    chain.latestBlock = 1030;
    chain.txlist = [ethTx(TX_A, order.expected_units, { latest: 1030, confs: 33 })];
    await elapseScanWindow(db);
    status = await (await client.get(`/pay/${order.order_id}/status`)).json();
    assert.equal(status.credited, true, "and it credits once it is deep enough");
  });
});

test("a provider outage never looks like 'nobody paid'", async () => {
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const chain = { rates: { ETH: "3000" }, latestBlock: 1000, txlist: [] };

  await withChain(chain, async () => {
    const { client, order } = await openOrder(app, db, CHAIN_ENV, "outage_buyer");

    chain.down = true;
    await elapseScanWindow(db);
    const status = await (await client.get(`/pay/${order.order_id}/status`)).json();
    assert.equal(status.ok, true, "the page still answers");
    assert.equal(status.credited, false);
    assert.ok(status.scanError, "and says plainly that the network could not be reached");

    const after = await db.get("SELECT * FROM chain_orders WHERE id = ?", order.id);
    assert.equal(after.status, "new", "an outage leaves the order exactly as it was");
    assert.equal(after.credited_at, null);

    // And when the provider comes back, the payment that was there all along lands.
    chain.down = false;
    chain.txlist = [ethTx(TX_A, order.expected_units, { confs: 30 })];
    await elapseScanWindow(db);
    const recovered = await (await client.get(`/pay/${order.order_id}/status`)).json();
    assert.equal(recovered.credited, true, "nothing was lost by the outage");
  });
});

/* ------------------------------------------------------------------ *
 * Spoofing: taking somebody else's payment, or paying less than the price
 * ------------------------------------------------------------------ */

test("a payment credits the person it was quoted to, even after they cancel", async () => {
  // The amount is the only thing tying an anonymous transfer to an account, so
  // it has to stay bound to whoever was quoted it — including once their order
  // stops being live. Matching against only the LIVE set answered "who is still
  // waiting?" instead of "who paid?", and handed Alice's money to Bob.
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const chain = { rates: { ETH: "3000" }, latestBlock: 1000, txlist: [] };

  await withChain(chain, async () => {
    const alice = await openOrder(app, db, CHAIN_ENV, "alice");
    await alice.client.post(`/pay/${alice.order.order_id}/cancel`);
    assert.equal((await db.get("SELECT status FROM chain_orders WHERE id = ?", alice.order.id)).status,
      "cancelled");

    // Bob checks out and is now the only order still open.
    const bob = await openOrder(app, db, CHAIN_ENV, "bob");

    // Alice's exchange withdrawal lands anyway, for the amount SHE was quoted.
    chain.txlist = [ethTx(TX_A, alice.order.expected_units, { confs: 30 })];
    await elapseScanWindow(db);
    await bob.client.get(`/pay/${bob.order.order_id}/status`);

    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'bob'")).tier, "user",
      "Bob is not upgraded on Alice's money");
    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'alice'")).tier, "paid",
      "Alice paid exactly what she was quoted, so Alice gets the membership");
  });
});

test("a payment that arrives after the matching window still belongs to its buyer", async () => {
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const chain = { rates: { ETH: "3000" }, latestBlock: 1000, txlist: [] };

  await withChain(chain, async () => {
    const late = await openOrder(app, db, CHAIN_ENV, "late_payer");
    // Push their order past match_until, so it is no longer live.
    await db.run("UPDATE chain_orders SET match_until = ? WHERE id = ?", Date.now() - 1000, late.order.id);

    const other = await openOrder(app, db, CHAIN_ENV, "other_buyer");
    chain.txlist = [ethTx(TX_A, late.order.expected_units, { confs: 30 })];
    await elapseScanWindow(db);
    await other.client.get(`/pay/${other.order.order_id}/status`);

    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'other_buyer'")).tier, "user",
      "a stranger is never credited with a late payer's money");
    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'late_payer'")).tier, "paid",
      "and the late payer is not robbed of what they paid for");
  });
});

test("paying twice does not buy a stranger a membership", async () => {
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const chain = { rates: { ETH: "3000" }, latestBlock: 1000, txlist: [] };

  await withChain(chain, async () => {
    const buyer = await openOrder(app, db, CHAIN_ENV, "double_payer");
    chain.txlist = [ethTx(TX_A, buyer.order.expected_units, { confs: 30 })];
    await elapseScanWindow(db);
    await buyer.client.get(`/pay/${buyer.order.order_id}/status`);
    const once = await db.get("SELECT tier, paid_until FROM users WHERE username = 'double_payer'");
    assert.equal(once.tier, "paid");

    // Somebody else is now the only open order.
    const bystander = await openOrder(app, db, CHAIN_ENV, "bystander");

    // The buyer's wallet sends a SECOND transaction for the same amount.
    chain.txlist.push(ethTx(TX_B, buyer.order.expected_units, { confs: 30 }));
    await elapseScanWindow(db);
    await bystander.client.get(`/pay/${bystander.order.order_id}/status`);

    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'bystander'")).tier, "user",
      "the duplicate does not become somebody else's membership");
    const after = await db.get("SELECT paid_until FROM users WHERE username = 'double_payer'");
    assert.equal(String(after.paid_until), String(once.paid_until),
      "nor a second period for the payer");
    const dup = await db.get("SELECT * FROM chain_transfers WHERE tx_hash = ?", TX_B);
    assert.equal(dup.status, "unmatched", "it is queued for a human");
    assert.ok(/already paid|duplicate/i.test(dup.note || ""), "and labelled as the duplicate it is");
  });
});

test("a large overpayment is held for a human, not silently sold one membership", async () => {
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const chain = { rates: { ETH: "3000" }, latestBlock: 1000, txlist: [] };

  await withChain(chain, async () => {
    const { client, order } = await openOrder(app, db, CHAIN_ENV, "fat_finger");
    // A misplaced decimal point: fifty times the price.
    chain.txlist = [ethTx(TX_A, BigInt(order.expected_units) * 50n, { confs: 30 })];
    await elapseScanWindow(db);
    await client.get(`/pay/${order.order_id}/status`);

    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'fat_finger'")).tier, "user",
      "fifty times the price does not quietly become one month");
    assert.equal((await db.get("SELECT status FROM chain_transfers ORDER BY id DESC LIMIT 1")).status,
      "unmatched", "it waits for someone to decide what to do with it");

  });
});

test("a modest overpayment is ordinary and still credits", async () => {
  // Its own store, because with two orders open at once a non-exact amount sits
  // inside both of their ranges and is correctly refused as ambiguous — the
  // deliberate trade this design makes, and the reason wallets are told to send
  // the exact figure.
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const chain = { rates: { ETH: "3000" }, latestBlock: 1000, txlist: [] };

  await withChain(chain, async () => {
    const { client, order } = await openOrder(app, db, CHAIN_ENV, "rounder");
    chain.txlist = [ethTx(TX_A, (BigInt(order.expected_units) * 105n) / 100n, { confs: 30 })];
    await elapseScanWindow(db);
    await client.get(`/pay/${order.order_id}/status`);
    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'rounder'")).tier, "paid",
      "5% over is just an overpayment");
  });
});

test("an expired quote cannot be paid at yesterday's price once the coin falls", async () => {
  // Otherwise the quote is a free option: open an order, wait, and pay the
  // frozen amount only if the market moved in your favour.
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const chain = { rates: { ETH: "3000" }, latestBlock: 1000, txlist: [] };

  await withChain(chain, async () => {
    const { client, order } = await openOrder(app, db, CHAIN_ENV, "optioner");
    // The pay window closes...
    await db.run("UPDATE chain_orders SET expires_at = ? WHERE id = ?", Date.now() - 3600_000, order.id);
    // ...and ETH halves, so the quoted amount is now worth half the plan price.
    chain.rates.ETH = "1500";
    chain.txlist = [ethTx(TX_A, order.expected_units, { confs: 30 })];
    await elapseScanWindow(db);
    await elapseRateCache(db);
    await client.get(`/pay/${order.order_id}/status`);

    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'optioner'")).tier, "user",
      "a stale quote does not buy a membership at half price");
    const held = await db.get("SELECT * FROM chain_transfers ORDER BY id DESC LIMIT 1");
    assert.equal(held.status, "unmatched");
    assert.ok(/expired/i.test(held.note || ""), "and says why it is being held");
  });
});

test("an expired quote still pays when the price has not moved against us", async () => {
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const chain = { rates: { ETH: "3000" }, latestBlock: 1000, txlist: [] };

  await withChain(chain, async () => {
    const { client, order } = await openOrder(app, db, CHAIN_ENV, "slow_but_honest");
    await db.run("UPDATE chain_orders SET expires_at = ? WHERE id = ?", Date.now() - 3600_000, order.id);
    chain.txlist = [ethTx(TX_A, order.expected_units, { confs: 30 })];
    await elapseScanWindow(db);
    await client.get(`/pay/${order.order_id}/status`);

    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'slow_but_honest'")).tier,
      "paid", "someone who simply paid late is not punished for it");
  });
});

test("cheap dust cannot bury a real payment", async () => {
  // Transactions to a public address are not ours to control. Reading only the
  // newest page meant a handful of dust transfers pushed a buyer's payment out
  // of view — permanently, since every later scan issued the same query.
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const chain = { rates: { ETH: "3000" }, latestBlock: 1000, txlist: [] };

  await withChain(chain, async () => {
    const { client, order } = await openOrder(app, db, CHAIN_ENV, "buried");

    const dust = Array.from({ length: 120 }, (_, i) =>
      ethTx(`0x${(i + 16).toString(16).padStart(2, "0").repeat(32)}`, 1n, { block: 900 + i + 1 }));
    chain.txlist = [ethTx(TX_A, order.expected_units, { block: 900 }), ...dust];
    await elapseScanWindow(db);
    await client.get(`/pay/${order.order_id}/status`);

    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'buried'")).tier, "paid",
      "the payment is found underneath 120 later transactions");
  });
});

test("outsiders cannot inflate a Solana scan by creating token accounts we own", async () => {
  // Anyone can create an SPL token account naming someone else as its owner for
  // the price of the rent, so the length of that list is attacker-controlled.
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const real = "RealTokenAccount1111111111111111111111111";
  const chain = {
    rates: { USDT: "1" },
    tokenAccounts: [real, ...Array.from({ length: 200 }, (_, i) => `Spam${String(i).padStart(38, "0")}`)],
    signatures: [],
  };

  await withChain(chain, async ({ calls }) => {
    const { client, order } = await openOrder(app, db, CHAIN_ENV, "spl_target", "usdt-spl");
    chain.balances = { [real]: order.expected_units };
    chain.signatures = [{
      signature: SOL_SIG, slot: 700,
      tx: {
        slot: 700, blockTime: nowSeconds(),
        transaction: { message: { accountKeys: [{ pubkey: real }] } },
        meta: {
          err: null, preBalances: [0], postBalances: [0],
          preTokenBalances: [{ mint: USDT_SPL_MINT, owner: SOL_ADDRESS, uiTokenAmount: { amount: "0" } }],
          postTokenBalances: [{ mint: USDT_SPL_MINT, owner: SOL_ADDRESS, uiTokenAmount: { amount: order.expected_units } }],
        },
      },
    }];
    const before = calls.length;
    await elapseScanWindow(db);
    await client.get(`/pay/${order.order_id}/status`);

    const rpcCalls = calls.length - before;
    assert.ok(rpcCalls < 20, `a scan stays bounded regardless of the spam (made ${rpcCalls} calls)`);
    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'spl_target'")).tier, "paid",
      "and the real payment, in the account that holds the balance, still lands");
  });
});

/* ------------------------------------------------------------------ *
 * Buyer-submitted transaction hashes
 * ------------------------------------------------------------------ */

test("a buyer's transaction hash is a hint about where to look, not a claim we trust", async () => {
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const chain = { rates: { ETH: "3000" }, latestBlock: 1000, txlist: [], receipts: {}, txs: {} };

  await withChain(chain, async () => {
    const { client, order } = await openOrder(app, db, CHAIN_ENV, "manual_buyer");
    await client.get(`/pay/${order.order_id}`);

    // Garbage in the field costs nothing and grants nothing.
    await client.post(`/pay/${order.order_id}/tx`, { txid: "not-a-hash" });
    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'manual_buyer'")).tier, "user");

    // A hash naming a transaction that paid a DIFFERENT address grants nothing.
    chain.receipts[TX_B] = { status: "0x1", blockNumber: "0x3d5", logs: [] };
    chain.txs[TX_B] = { to: "0x9999999999999999999999999999999999999999", value: "0xde0b6b3a7640000" };
    await client.post(`/pay/${order.order_id}/tx`, { txid: TX_B });
    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'manual_buyer'")).tier, "user",
      "a transaction that never paid us is not accepted just because it was pasted");

    // The buyer's real transaction: right address, right amount.
    chain.receipts[TX_A] = { status: "0x1", blockNumber: "0x3d5", logs: [] };
    chain.txs[TX_A] = { to: ETH_ADDRESS, value: `0x${BigInt(order.expected_units).toString(16)}` };
    await client.post(`/pay/${order.order_id}/tx`, { txid: TX_A });
    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'manual_buyer'")).tier, "paid",
      "reading the named transaction off the chain credits it");

    // The same hash pasted by somebody else buys them nothing.
    const thief = await openOrder(app, db, CHAIN_ENV, "hash_thief");
    await thief.client.get(`/pay/${thief.order.order_id}`);
    await thief.client.post(`/pay/${thief.order.order_id}/tx`, { txid: TX_A });
    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'hash_thief'")).tier, "user",
      "a transaction already credited elsewhere cannot be reused");
  });
});

/* ------------------------------------------------------------------ *
 * Access control + the cron endpoint
 * ------------------------------------------------------------------ */

test("orders are private to their buyer, and cancelling is safe", async () => {
  const { app, db } = await buildTestApp(CHAIN_ENV);
  await withChain({ rates: { ETH: "3000" } }, async () => {
    const mine = await openOrder(app, db, CHAIN_ENV, "owner_user");
    const { client: nosy } = await signUp(app, CHAIN_ENV, "nosy_user");

    assert.equal((await nosy.get(`/pay/${mine.order.order_id}`)).status, 404,
      "another member cannot open someone's payment page");
    assert.equal((await (await nosy.get(`/pay/${mine.order.order_id}/status`)).json()).error, "not_found");

    const anon = makeClient(app, CHAIN_ENV);
    assert.equal((await anon.get(`/pay/${mine.order.order_id}`)).status, 302,
      "and a signed-out visitor is sent to log in");

    await mine.client.post(`/pay/${mine.order.order_id}/cancel`);
    assert.equal((await db.get("SELECT status FROM chain_orders WHERE id = ?", mine.order.id)).status,
      "cancelled");
  });
});

test("an order with money against it cannot be cancelled out from under the payment", async () => {
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const chain = { rates: { ETH: "3000" }, latestBlock: 1000, txlist: [] };

  await withChain(chain, async () => {
    const { client, order } = await openOrder(app, db, CHAIN_ENV, "cancel_racer");
    chain.txlist = [ethTx(TX_A, order.expected_units, { confs: 2 })];
    await elapseScanWindow(db);
    await client.get(`/pay/${order.order_id}/status`);
    await client.post(`/pay/${order.order_id}/cancel`);

    assert.notEqual((await db.get("SELECT status FROM chain_orders WHERE id = ?", order.id)).status,
      "cancelled", "a payment is already in flight — cancelling would strand the money");
  });
});

test("the cron scan endpoint is useless without the secret", async () => {
  const { app } = await buildTestApp(CHAIN_ENV);
  const client = makeClient(app, CHAIN_ENV);

  await withChain({ rates: { ETH: "3000" } }, async () => {
    assert.equal((await client.get("/api/crypto/scan")).status, 401, "no key");
    assert.equal((await client.get("/api/crypto/scan?key=wrong")).status, 401, "wrong key");

    const ok = await client.get("/api/crypto/scan?key=cron-secret-value");
    assert.equal(ok.status, 200, "the configured secret works");
    assert.equal((await ok.json()).ok, true);

    const viaHeader = await client.get("/api/crypto/scan", { "x-crypto-scan-secret": "cron-secret-value" });
    assert.equal(viaHeader.status, 200, "and so does the header form");
  });

  // With no secret configured the endpoint refuses outright rather than opening up.
  const env = { ...BASE_ENV, ETH_ADDRESS };
  const { app: noSecret } = await buildTestApp(env);
  assert.equal((await makeClient(noSecret, env).get("/api/crypto/scan")).status, 503,
    "an unset secret closes the endpoint, it does not disable the check");
});

test("an external cron can credit a payment with nobody on the site", async () => {
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const chain = { rates: { ETH: "3000" }, latestBlock: 1000, txlist: [] };

  await withChain(chain, async () => {
    const { order } = await openOrder(app, db, CHAIN_ENV, "away_buyer");
    chain.txlist = [ethTx(TX_A, order.expected_units, { confs: 20 })];

    // Nobody loads a page — only the cron endpoint fires.
    const res = await makeClient(app, CHAIN_ENV).get("/api/crypto/scan?key=cron-secret-value");
    assert.equal(res.status, 200);
    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'away_buyer'")).tier, "paid",
      "the watcher works whether or not the buyer is still on the site");
  });
});

/* ------------------------------------------------------------------ *
 * The store and admin surfaces
 * ------------------------------------------------------------------ */

test("the store offers exactly the coins that are configured and payable", async () => {
  const { app } = await buildTestApp(CHAIN_ENV);
  const { client } = await signUp(app, CHAIN_ENV, "store_browser");
  const html = await (await client.get("/buy")).text();
  for (const label of ["Ethereum mainnet", "Solana mainnet", "Ethereum (ERC-20)", "Solana (SPL)"]) {
    assert.ok(html.includes(label), `the store offers ${label}`);
  }
  assert.ok(html.includes('action="/upgrade/crypto"'), "each coin posts to the on-chain checkout");

  // With no addresses set, none of it appears and the page stays honest.
  const { app: bare } = await buildTestApp(BASE_ENV);
  const bareHtml = await (await makeClient(bare, BASE_ENV).get("/buy")).text();
  assert.ok(!bareHtml.includes('action="/upgrade/crypto"'), "no addresses, no coin buttons");
});

test("admin: unattributed money is surfaced for a decision and can be assigned", async () => {
  const { app, db } = await buildTestApp(CHAIN_ENV);
  const chain = { rates: { ETH: "3000" }, latestBlock: 1000, txlist: [] };

  await withChain(chain, async () => {
    const { client, order } = await openOrder(app, db, CHAIN_ENV, "admin_case");

    // A payment that no live order can account for: half the quote is well
    // under the tolerance floor, so it is real money with no obvious owner.
    // (An OVERpayment, by contrast, covers the order and credits by itself.)
    chain.txlist = [ethTx(TX_A, BigInt(order.expected_units) / 2n, { confs: 30 })];
    await elapseScanWindow(db);
    await client.get(`/pay/${order.order_id}/status`);

    const admin = makeClient(app, CHAIN_ENV);
    await admin.get("/auth/login");
    await admin.post("/auth/login", { identifier: "admin", password: BASE_ENV.ADMIN_PASSWORD });

    chain.txlist = [];
    const html = await (await admin.get("/admin/crypto")).text();
    assert.ok(html.includes("Payments needing a decision"), "the queue is on the page");
    assert.ok(html.includes(ETH_ADDRESS), "and so is the address money is arriving at");
    assert.ok(html.includes("admin_case"), "with the order it could be assigned to");

    const transfer = await db.get("SELECT * FROM chain_transfers ORDER BY id DESC LIMIT 1");
    assert.equal(transfer.status, "unmatched", "it is waiting for a decision, not credited");
    await admin.post(`/admin/crypto/transfers/${transfer.id}/assign`, { order: order.order_id });

    assert.equal((await db.get("SELECT tier FROM users WHERE username = 'admin_case'")).tier, "paid",
      "assigning the payment grants the membership");
    assert.ok((await db.get("SELECT credited_at FROM chain_orders WHERE id = ?", order.id)).credited_at,
      "and the order is closed out");
    assert.ok(await db.get(
      "SELECT id FROM ip_logs WHERE event = 'admin_action' AND detail LIKE '%assigned%'"),
      "the manual attribution is audited");
  });
});

test("admin: a misconfigured address is reported rather than silently dropped", async () => {
  const env = { ...BASE_ENV, ETH_ADDRESS: "0xnot-a-real-address", SOL_ADDRESS };
  const { app } = await buildTestApp(env);
  const admin = makeClient(app, env);
  await admin.get("/auth/login");
  const login = await admin.post("/auth/login", { identifier: "admin", password: env.ADMIN_PASSWORD });
  assert.equal(login.status, 302, "the seeded admin signs in");

  const html = await (await admin.get("/admin/crypto")).text();
  assert.ok(html.includes("Rejected:"), "the admin page names the broken secret");
  assert.ok(html.includes("not a valid ethereum address"));
  assert.ok(html.includes("Solana mainnet"), "while the coin that IS valid stays on sale");
});

/* ------------------------------------------------------------------ *
 * QR
 * ------------------------------------------------------------------ */

test("QR codes round-trip through an independent decoder and scan in either theme", () => {
  const cfg = chainConfig({ ETH_ADDRESS, SOL_ADDRESS });
  const payloads = [
    paymentUri(cfg, cfg.byKey.eth, 2922652014437901n),
    paymentUri(cfg, cfg.byKey["usdt-erc20"], 10420000n),
    paymentUri(cfg, cfg.byKey.sol, 66123456n),
    paymentUri(cfg, cfg.byKey["usdt-spl"], 10420000n),
  ];
  for (const payload of payloads) {
    const matrix = qrMatrix(payload);
    assert.ok(matrix, `a QR fits ${payload.slice(0, 24)}…`);
    assert.equal(decodeQr(matrix), payload, "and decodes back to exactly the payment URI");
  }

  const svg = qrSvg(payloads[3], { size: 200 });
  // style-src is 'self' with no unsafe-inline, so an inline style would simply
  // not render — and a QR that renders as light-on-dark does not scan reliably.
  assert.ok(!/style\s*=/.test(svg) && !/<style/.test(svg), "no inline styles — the CSP forbids them");
  assert.ok(/#fff|white/i.test(svg), "the QR paints its own light background, whatever the theme");
  assert.equal(qrSvg("x".repeat(5000)), "", "a payload too big for a QR yields no markup, not a broken one");
});

/* ------------------------------------------------------------------ *
 * Config plumbing
 * ------------------------------------------------------------------ */

test("payment settings come from env, with safe defaults", () => {
  const d = onchainConfig({ ETH_ADDRESS });
  assert.equal(d.eth.confirmations, 12);
  assert.equal(d.toleranceBp, 100, "1% by default");
  assert.equal(d.payWindowMinutes, 60);
  assert.equal(d.matchHours, 48);
  assert.equal(d.currency, "USD");

  const tuned = onchainConfig({
    ETH_ADDRESS, PAID_PRICE_CURRENCY: "eur",
    CRYPTO_ETH_CONFIRMATIONS: "3", CRYPTO_UNDERPAY_TOLERANCE_PCT: "0.5",
    CRYPTO_PAY_WINDOW_MINUTES: "15", CRYPTO_MATCH_HOURS: "72",
  });
  assert.equal(tuned.eth.confirmations, 3);
  assert.equal(tuned.toleranceBp, 50);
  assert.equal(tuned.payWindowMinutes, 15);
  assert.equal(tuned.matchHours, 72);
  assert.equal(tuned.currency, "EUR");

  // Nonsense never widens anything.
  const junk = onchainConfig({ ETH_ADDRESS, CRYPTO_ETH_CONFIRMATIONS: "-5", CRYPTO_UNDERPAY_TOLERANCE_PCT: "999" });
  assert.ok(junk.eth.confirmations >= 1, "confirmations never drop below one");
  assert.ok(junk.toleranceBp <= 2000, "tolerance is capped at 20%");
});
