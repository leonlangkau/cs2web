/**
 * Shared post-permission rules, used by both the forum routes (enforcement)
 * and the views (whether to render the buttons at all).
 */
import { isStaff } from "./tiers.js";

/** Authors may edit their own posts this long after writing them; staff always can. */
const EDIT_WINDOW_MS = 30 * 60 * 1000;

function canEditPost(user, post) {
  if (!user) return false;
  if (isStaff(user)) return true;
  if (post.user_id !== user.id) return false;
  const created = new Date(`${String(post.created_at).replace(' ', 'T')}Z`).getTime();
  return Number.isFinite(created) && Date.now() - created < EDIT_WINDOW_MS;
}

export { canEditPost, EDIT_WINDOW_MS };
