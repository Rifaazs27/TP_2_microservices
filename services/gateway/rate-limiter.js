const store = {}; 
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 100;

function rateLimiter(req, res, next) {
  const ip = req.ip || 'unknown';
  const now = Date.now();

  if (!store[ip] || now > store[ip].resetAt) {
    store[ip] = { count: 0, resetAt: now + WINDOW_MS };
  }

  store[ip].count++;

  res.setHeader('X-RateLimit-Limit', MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, MAX_REQUESTS - store[ip].count));
  res.setHeader('X-RateLimit-Reset', store[ip].resetAt);

  if (store[ip].count > MAX_REQUESTS) {
    return res.status(429).json({ error: "Too Many Requests" });
  }
  next();
}


setInterval(() => {
  const now = Date.now();
  Object.keys(store).forEach(ip => {
    if (now > store[ip].resetAt) delete store[ip];
  });
}, 5*60*1000);

module.exports = { rateLimiter };
