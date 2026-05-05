// retry.js — À compléter
async function withRetry(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseDelayMs = 200,
    maxDelayMs = 5000,
    onRetry = null,
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Ne pas retenter si c'est une erreur client (4xx)
      if (err.response && err.response.status >= 400 && err.response.status < 500) {
        throw err;
      }

      if (attempt === maxAttempts) break;

      // Backoff exponentiel avec jitter
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.random() * exponentialDelay * 0.3;
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

      if (onRetry) onRetry(attempt, delay, err.message);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

module.exports = { withRetry };
