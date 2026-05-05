const metrics = {
  requests: {},   // clé: "METHOD:path:STATUS" → valeur: count
  durations: {},  // clé: path → valeur: [durée1, durée2, ...]
};

function metricsMiddleware(req, res, next) {
  if (req.path === '/metrics' || req.path === '/health') return next();
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const normalizedPath = req.path.replace(/\/\d+/g, '/:id');
    const key = `${req.method}:${normalizedPath}:${res.statusCode}`;

    metrics.requests[key] = (metrics.requests[key] || 0) + 1;

    if (!metrics.durations[normalizedPath]) metrics.durations[normalizedPath] = [];
    metrics.durations[normalizedPath].push(duration);
    if (metrics.durations[normalizedPath].length > 200) metrics.durations[normalizedPath].shift();
  });
  next();
}

function generateMetrics(serviceName, extraGauges = {}) {
  let out = '';
  out += `# HELP ${serviceName}_requests_total Total HTTP requests\n# TYPE ${serviceName}_requests_total counter\n`;
  for (const [key, count] of Object.entries(metrics.requests)) {
    const [method, path, status] = key.split(':');
    out += `${serviceName}_requests_total{method="${method}",path="${path}",status="${status}"} ${count}\n`;
  }
  out += `# HELP ${serviceName}_request_duration_ms Avg duration ms\n# TYPE ${serviceName}_request_duration_ms gauge\n`;
  for (const [path, durations] of Object.entries(metrics.durations)) {
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    out += `${serviceName}_request_duration_ms{path="${path}"} ${avg.toFixed(2)}\n`;
  }
  out += `# HELP ${serviceName}_uptime_seconds Uptime\n# TYPE ${serviceName}_uptime_seconds counter\n${serviceName}_uptime_seconds ${Math.floor(process.uptime())}\n`;
  const mem = process.memoryUsage();
  out += `# HELP ${serviceName}_memory_bytes RSS memory\n# TYPE ${serviceName}_memory_bytes gauge\n${serviceName}_memory_bytes ${mem.rss}\n`;
  for (const [name, value] of Object.entries(extraGauges)) {
    out += `# HELP ${serviceName}_${name}\n# TYPE ${serviceName}_${name} gauge\n${serviceName}_${name} ${value}\n`;
  }
  return out;
}

module.exports = { metricsMiddleware, generateMetrics };
