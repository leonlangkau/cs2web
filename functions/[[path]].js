/**
 * Catch-all Pages Function: handles every dynamic route except "/", which has
 * its own dedicated functions/index.js. Both delegate to the shared handler.
 */
import { handle } from "./_lib/handler.js";

export const onRequest = handle;
