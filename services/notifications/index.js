const express = require('express');
const client = require('prom-client');
const app = express();
app.use(express.json());

// --- CONFIGURATION PROMETHEUS ---
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});
const notificationsSentCounter = new client.Counter({
  name: 'devshop_notifications_sent_total',
  help: 'Nombre total de notifications envoyées',
});

register.registerMetric(httpRequestCounter);
register.registerMetric(httpRequestDuration);
register.registerMetric(notificationsSentCounter);

app.use(express.json());

// Middleware instrumentation
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? req.route.path : req.path;
    httpRequestCounter.labels(req.method, route, res.statusCode).inc();
    end({ method: req.method, route, status_code: res.statusCode });
  });
  next();
});

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

let notifications = [];

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'notifications', sent: notifications.length }));

app.post('/notify', (req, res) => {
  const { orderId, total } = req.body;
  if (!orderId) return res.status(400).json({ error: 'orderId requis' });

  const notif = {
    id: notifications.length + 1,
    orderId,
    message: `Commande #${orderId} confirmée — Total : ${total} €`,
    sentAt: new Date().toISOString(),
  };
  notifications.push(notif);
  notificationsSentCounter.inc();
  console.log('[notifications] 📧', notif.message);
  res.status(201).json(notif);
});

app.get('/notifications', (req, res) => res.json(notifications));

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const PORT = 3004;
app.listen(PORT, () => console.log(`[notifications] http://localhost:${PORT}`));
