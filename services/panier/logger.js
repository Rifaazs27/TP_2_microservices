const SERVICE_NAME = process.env.SERVICE_NAME || 'unknown';

const logger = {
  _write(level, msg, extra = {}) {
    const entry = {
      level,
      service: SERVICE_NAME,
      msg,
      timestamp: new Date().toISOString(),
      ...extra
    };
    if (level === 'error') {
      process.stderr.write(JSON.stringify(entry) + '\n');
    } else {
      process.stdout.write(JSON.stringify(entry) + '\n');
    }
  },
  debug: (msg, extra) => logger._write('debug', msg, extra),
  info:  (msg, extra) => logger._write('info',  msg, extra),
  warn:  (msg, extra) => logger._write('warn',  msg, extra),
  error: (msg, extra) => logger._write('error', msg, extra),
};

module.exports = logger;
