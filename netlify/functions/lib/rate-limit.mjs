const buckets = new Map();

/**
 * In-memory IP rate limiter for Netlify functions.
 * Returns { allowed, remaining, resetMs } so callers never mis-read a boolean.
 */
export function allow(request, limit = 40, windowMs = 10 * 60_000) {
  const key =
    request.headers.get("x-nf-client-connection-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "anonymous";
  const now = Date.now();
  const bucket = buckets.get(key) || { count: 0, reset: now + windowMs };
  if (bucket.reset <= now) {
    bucket.count = 0;
    bucket.reset = now + windowMs;
  }
  bucket.count += 1;
  buckets.set(key, bucket);
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetMs: Math.max(0, bucket.reset - now),
    count: bucket.count,
    limit
  };
}
