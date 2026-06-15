// Pure scheduling helpers for blog posts — NO Vite/`import.meta` here, so this
// module is importable by plain Node (unit tests, build scripts) as well as the
// browser bundle. See TASK-263: a post's `date` is its go-live date.

/** Today as a local YYYY-MM-DD string. 'en-CA' yields ISO-ordered dates, so a
 *  plain string comparison against a post's `date` is correct. */
export function todayStr() {
  return new Date().toLocaleDateString('en-CA');
}

/** A post is live (publicly visible) when published and its date has arrived.
 *  `today` is injectable so callers/tests can pin it. */
export function isLive(post, today = todayStr()) {
  return post.status === 'published' && post.date <= today;
}
