/**
 * Homepage Pages Function ("/").
 *
 * A dedicated route file for the root is guaranteed to run; relying on the
 * catch-all alone left "/" unserved in production (no static index.html exists,
 * so it 404'd). Shares one implementation with the catch-all.
 */
import { handle } from "./_lib/handler.js";

export const onRequest = handle;
