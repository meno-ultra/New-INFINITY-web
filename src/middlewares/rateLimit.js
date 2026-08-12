/**
 * Lightweight in-memory rate limiter for password-reset endpoints.
 */
const buckets = new Map();

function cleanupBuckets() {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
        if (now > bucket.resetAt) buckets.delete(key);
    }
}

setInterval(cleanupBuckets, 60 * 1000).unref();

function getClientIp(req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length) {
        return forwarded.split(",")[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || "unknown";
}

function rateLimit({ windowMs, max, keyFn, message }) {
    return (req, res, next) => {
        const key = keyFn(req);
        const now = Date.now();
        let bucket = buckets.get(key);
        if (!bucket || now > bucket.resetAt) {
            bucket = { count: 0, resetAt: now + windowMs };
            buckets.set(key, bucket);
        }
        bucket.count += 1;
        if (bucket.count > max) {
            return res.status(429).json({
                error: message || "Too many attempts. Please try again later."
            });
        }
        next();
    };
}

function emailIpKey(prefix) {
    return (req) => {
        const email = String(req.body?.email || "").toLowerCase().trim();
        const ip = getClientIp(req);
        return `${prefix}:${email || "no-email"}:${ip}`;
    };
}

module.exports = {
    rateLimit,
    emailIpKey,
    getClientIp,
};
