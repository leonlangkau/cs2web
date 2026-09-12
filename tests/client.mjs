/**
 * Test client: a cookie jar over app.fetch, plus the proof-of-work CAPTCHA
 * solver that signup needs.
 *
 * tests/smoke.test.mjs carries its own older copies of these — it predates this
 * module and has 65 call sites bound to its own ENV — so this is where new test
 * files get them from.
 */
import crypto from "node:crypto";
import { leadingZeroBits } from "../functions/_lib/captcha.js";

/** Cookie-jar client over app.fetch, bound to one env. */
export function makeClient(app, env) {
  const jar = new Map();
  const store = (res) => {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim();
      const v = pair.slice(i + 1).trim();
      if (v === "") jar.delete(k); else jar.set(k, v);
    }
  };
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const req = async (method, path, body, extraHeaders = {}) => {
    const headers = { cookie: cookieHeader(), ...extraHeaders };
    let payload;
    if (body) {
      headers["content-type"] = "application/x-www-form-urlencoded";
      payload = new URLSearchParams(body).toString();
      headers["content-length"] = String(Buffer.byteLength(payload));
    }
    const res = await app.fetch(new Request("http://local" + path, { method, headers, body: payload }), env);
    store(res);
    return res;
  };
  /**
   * Multipart POST, for the routes that accept file uploads. req() above
   * hardcodes urlencoded, so this builds the Request itself — FormData sets
   * its own content-type boundary and must not be overridden.
   */
  const postForm = async (path, fields = {}, files = [], extraHeaders = {}) => {
    const form = new FormData();
    form.append("_csrf", jar.get("ghcsrf") || "");
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    for (const { field, name, bytes, type } of files) {
      form.append(field || "files", new File([bytes], name, { type: type || "application/octet-stream" }));
    }
    const res = await app.fetch(
      new Request("http://local" + path, {
        method: "POST",
        headers: { cookie: cookieHeader(), ...extraHeaders },
        body: form,
      }),
      env
    );
    store(res);
    return res;
  };

  return {
    jar,
    get: (p, extraHeaders) => req("GET", p, undefined, extraHeaders),
    post: (p, b = {}, extraHeaders) => req("POST", p, { _csrf: jar.get("ghcsrf") || "", ...b }, extraHeaders),
    postForm,
    raw: (m, p, b, extraHeaders) => req(m, p, b, extraHeaders),
  };
}

/**
 * Solves the proof-of-work CAPTCHA the signup form requires. The pause is not
 * padding: the server rejects a solution that arrives implausibly fast, which
 * is most of what the check is for.
 */
export async function solveCaptcha(client) {
  const challenge = await (await client.get("/captcha/challenge")).json();
  let counter = 0;
  for (;;) {
    const digest = crypto.createHash("sha256").update(`${challenge.nonce}:${counter}`).digest("hex");
    if (leadingZeroBits(digest) >= challenge.difficulty) break;
    counter += 1;
  }
  await new Promise((r) => setTimeout(r, 850));
  return { captcha_token: challenge.token, captcha_solution: String(counter) };
}

/** Signs a fresh account up and returns its client. */
export async function signUp(app, env, username, email = `${username}@example.com`) {
  const client = makeClient(app, env);
  await client.get("/auth/signup");
  const res = await client.post("/auth/signup", {
    username, email, password: "supersecret1", confirm: "supersecret1",
    ...(await solveCaptcha(client)),
  });
  return { client, res };
}
