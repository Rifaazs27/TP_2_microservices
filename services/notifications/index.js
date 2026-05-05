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
  labelNames: ['method', 'route', 'status_code', 'service'],
});
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'service'],
});
const notificationsSentCounter = new client.Counter({
  name: 'devshop_notifications_sent_total',
  help: 'Nombre total de notifications envoyées',
});

register.registerMetric(httpRequestCounter);
register.registerMetric(httpRequestDuration);
register.registerMetric(notificationsSentCounter);

// Middleware instrumentation
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? req.route.path : req.path;
    const labels = { method: req.method, route, status_code: res.statusCode, service: 'notifications' };
    httpRequestCounter.labels(req.method, route, res.statusCode, 'notifications').inc();
    end(labels);
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

// --- LOGIQUE MÉTIER PHASE 2 ---
let notifications = [];

const templates = {
  order_created:   { subject: "Votre commande a été reçue",       message: (d) => `Votre commande #${d.orderId} a bien été enregistrée.` },
  order_confirmed: { subject: "Commande confirmée",               message: (d) => `Votre commande #${d.orderId} est confirmée et en préparation.` },
  order_shipped:   { subject: "Votre commande est en route",      message: (d) => `Votre commande #${d.orderId} a été expédiée !` },
  order_delivered: { subject: "Commande livrée — Merci !",        message: (d) => `Votre commande #${d.orderId} a été livrée. Merci pour votre achat !` },
  order_cancelled: { subject: "Commande annulée",                 message: (d) => `Votre commande #${d.orderId} a été annulée.` },
  low_stock:       { subject: "Alerte stock faible",              message: (d) => `Alerte : le stock de ${d.productName} est faible (${d.stock} unités restantes).` },
};

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'notifications', sent: notifications.length }));

app.post('/notify', (req, res) => {
  const { type, userId, orderId, productName, stock } = req.body;
  const template = templates[type];

  if (!template) {
    return res.status(400).json({ error: "Unknown notification type", validTypes: Object.keys(templates) });
  }

  const notif = {
    id: `notif-${Date.now()}`,
    type,
    userId,
    orderId,
    subject: template.subject,
    message: template.message({ orderId, productName, stock }),
    channel: 'email',
    status: 'sent',
    sentAt: new Date().toISOString(),
  };

  notifications.push(notif);
  notificationsSentCounter.inc();

  // LOG JSON STRICT (Exigé Phase 2)
  console.log(JSON.stringify({
    level: "info",
    service: "notifications",
    msg: "Email sent",
    type,
    userId,
    subject: notif.subject
  }));

  res.status(201).json(notif);
});

app.get(['/notifications', '/'], (req, res) => {
  let filtered = [...notifications];
  if (req.query.userId) filtered = filtered.filter(n => n.userId === req.query.userId);
  if (req.query.type) filtered = filtered.filter(n => n.type === req.query.type);
  
  res.json(filtered.slice(0, parseInt(req.query.limit) || 50));
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const PORT = 3004;
app.listen(PORT, () => console.log(`[notifications] http://localhost:${PORT}`));
