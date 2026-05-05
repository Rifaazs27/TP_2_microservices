const express = require('express');
const httpProxy = require('http-proxy');
const { rateLimiter } = require('./rate-limiter');
const client = require('prom-client');

const app = express();
const proxy = httpProxy.createProxyServer();
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const SERVICES = {
  catalogue: 'http://catalogue:3001',
  panier: 'http://panier:3002',
  commandes: 'http://commandes:3003',
  notifications: 'http://notifications:3004'
};

app.use(rateLimiter);

// Health Check Agrégé
app.get('/health', async (req, res) => {
  const start = Date.now();
  const results = {};
  
  await Promise.all(Object.entries(SERVICES).map(async ([name, url]) => {
    const sStart = Date.now();
    try {
      const resp = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
      results[name] = { status: resp.ok ? 'ok' : 'down', responseTime: Date.now() - sStart };
    } catch (err) {
      results[name] = { status: 'down', responseTime: null, error: err.code };
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

// Proxying automatique vers les services
app.use('/products', (req, res) => proxy.web(req, res, { target: SERVICES.catalogue }));
app.use('/cart', (req, res) => proxy.web(req, res, { target: SERVICES.panier }));
app.use('/orders', (req, res) => proxy.web(req, res, { target: SERVICES.commandes }));
app.use('/notifications', (req, res) => proxy.web(req, res, { target: SERVICES.notifications }));

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.listen(3000, () => console.log('🚀 Gateway running on port 3000'));
