const express = require('express');
const httpProxy = require('http-proxy');
const logger = require('./logger'); 
const { metricsMiddleware, generateMetrics } = require('./metrics'); 
const { withRetry } = require('./retry'); 
const { rateLimiter } = require('./rate-limiter');

const app = express();
const proxy = httpProxy.createProxyServer();

const SERVICES = {
  catalogue: 'http://catalogue:3001',
  panier: 'http://panier:3002',
  commandes: 'http://commandes:3003',
  notifications: 'http://notifications:3004'
};


app.use(metricsMiddleware);


app.use((req, res, next) => {
  if (req.path === '/health' || req.path === '/metrics') return next();
  const start = Date.now();
  res.on('finish', () => {
    logger.info('Request handled', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - start,
    });
  });
  next();
});


app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(rateLimiter);


app.get('/health', async (req, res) => {
  const start = Date.now();
  const results = {};

  await Promise.all(Object.entries(SERVICES).map(async ([name, url]) => {
    const sStart = Date.now();
    try {
      await withRetry(
        async () => {
          const resp = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
          if (!resp.ok) throw new Error(`Status ${resp.status}`);
          return resp;
        },
        {
          maxAttempts: 2, 
          baseDelayMs: 100,
          onRetry: (attempt, delay) => logger.warn(`Retrying healthcheck for ${name}`, { attempt, delay_ms: Math.round(delay) })
        }
      );
      results[name] = { status: 'ok', responseTime: Date.now() - sStart };
    } catch (err) {
      results[name] = { status: 'down', responseTime: null, error: err.message };
    }
  }));

  const isDegraded = Object.values(results).some(s => s.status === 'down');
  
  res.status(isDegraded ? 503 : 200).json({
    status: isDegraded ? 'degraded' : 'ok',
    gateway: 'ok',
    services: results,
    timestamp: new Date().toISOString(),
    totalResponseTime: Date.now() - start
  });
});

app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(generateMetrics('gateway'));
});

// Proxying
app.use('/products', (req, res) => proxy.web(req, res, { target: SERVICES.catalogue }));
app.use('/cart', (req, res) => proxy.web(req, res, { target: SERVICES.panier }));
app.use('/orders', (req, res) => proxy.web(req, res, { target: SERVICES.commandes }));
app.use('/notifications', (req, res) => proxy.web(req, res, { target: SERVICES.notifications }));

proxy.on('error', (err, req, res) => {
  logger.error('Proxy error', { error: err.message, url: req.url });
  res.status(502).json({ error: 'Service temporairement indisponible' });
});


app.use((req, res) => {
  logger.warn('Route not found', { method: req.method, path: req.path });
  res.status(404).json({
    error: 'Not Found',
    message: `La route ${req.method} ${req.path} n'existe pas`,
  });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    path: req.path,
    method: req.method,
  });
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'Une erreur inattendue s\'est produite sur le Gateway',
    requestId: Date.now().toString(),
  });
});


const PORT = 3000;
const server = app.listen(PORT, () => {
  logger.info('Gateway started', { port: PORT });
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down Gateway gracefully...');
  server.close(() => {
    logger.info('Gateway closed — all connections drained');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forced shutdown for Gateway after timeout');
    process.exit(1);
  }, 10000);
});
