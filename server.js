'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./src/config');
const { send, readBody } = require('./src/http');
const { router, paystackWebhook } = require('./src/routes');

const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const data = fs.readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);
    req.query = url.searchParams;

    // Paystack webhook needs the raw body for signature verification.
    if (pathname === '/api/webhook/paystack' && req.method === 'POST') {
      const raw = await readBody(req, { raw: true });
      return paystackWebhook(req, res, raw);
    }

    // API + app routes.
    const matched = router.match(req.method, pathname);
    if (matched) {
      req.params = matched.params;
      return await matched.handler(req, res);
    }

    // Public checkout page: /pay/:token  -> serve the checkout SPA shell.
    if (req.method === 'GET' && /^\/pay\/[^/]+$/.test(pathname)) {
      return serveStatic(res, path.join(PUBLIC_DIR, 'pay.html'));
    }

    // Static assets.
    if (req.method === 'GET') {
      let rel = pathname === '/' ? '/index.html' : pathname;
      const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
      if (filePath.startsWith(PUBLIC_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return serveStatic(res, filePath);
      }
      // SPA fallback for the app shell.
      return serveStatic(res, path.join(PUBLIC_DIR, 'index.html'));
    }

    send(res, 404, { error: 'not found' });
  } catch (err) {
    if (err.message === 'invalid_json') return send(res, 400, { error: 'invalid json body' });
    if (err.message === 'payload_too_large') return send(res, 413, { error: 'payload too large' });
    console.error('[server] error:', err);
    if (!res.headersSent) send(res, 500, { error: 'internal server error' });
  }
});

server.listen(config.port, () => {
  console.log(`\n  LedgerLink running at ${config.baseUrl}`);
  console.log(`  Paystack: ${config.paystack.enabled ? 'LIVE' : 'DEMO mode (simulated checkout)'}`);
  console.log(`  WhatsApp: ${config.whatsapp.enabled ? 'LIVE' : 'simulated confirmations'}\n`);
});

module.exports = server;
