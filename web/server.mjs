// ─── Nina Automation Monorepo Gateway & Process Orchestrator ───────────────
// Spawns and manages both Instagram Automation and WhatsApp Automation services
// on a single unified Render deployment.

import http from 'node:http';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load single shared .env for all services
const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envPath);
  console.log('📄 Loaded single shared environment from web/.env');
}

const isDev = process.argv.includes('dev');
const publicPort = Number(process.env.PORT || 10000);
const instagramPort = 3000;
const whatsappPort = 3001;

console.log('🚀 Starting Nina Automation Monorepo Gateway...');
console.log(`📡 Public Gateway Port: ${publicPort}`);
console.log(`📸 Instagram Service Port: ${instagramPort}`);
console.log(`💬 WhatsApp Service Port: ${whatsappPort}`);

// ── Spawn Child Processes ──────────────────────────────────────────────────

function startService(name, dir, port, command, args) {
  const child = spawn(command, args, {
    cwd: path.resolve(__dirname, dir),
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      PORT: String(port),
    },
  });

  child.on('error', (err) => {
    console.error(`❌ [${name}] Failed to start:`, err);
  });

  child.on('exit', (code, signal) => {
    console.log(`⚠️ [${name}] Exited with code ${code} / signal ${signal}`);
  });

  return child;
}

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const instagramService = startService(
  'Instagram',
  'instagram',
  instagramPort,
  npxCmd,
  isDev ? ['next', 'dev', '--port', String(instagramPort)] : ['next', 'start', '--port', String(instagramPort)]
);

const whatsappService = startService(
  'WhatsApp',
  'whatsapp',
  whatsappPort,
  npxCmd,
  isDev ? ['next', 'dev', '--port', String(whatsappPort), '--webpack'] : ['next', 'start', '--port', String(whatsappPort)]
);

// ── Reverse Proxy Gateway ──────────────────────────────────────────────────

function routeTarget(urlPath) {
  if (
    urlPath.startsWith('/whatsapp') ||
    urlPath.startsWith('/catalog') ||
    urlPath.startsWith('/api/whatsapp') ||
    urlPath.startsWith('/api/connect') ||
    urlPath.startsWith('/_next/static/whatsapp')
  ) {
    return { host: '127.0.0.1', port: whatsappPort };
  }
  return { host: '127.0.0.1', port: instagramPort };
}

const server = http.createServer((req, res) => {
  const target = routeTarget(req.url || '/');

  const proxyReq = http.request(
    {
      host: target.host,
      port: target.port,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        'x-forwarded-for': req.socket.remoteAddress,
        'x-forwarded-proto': req.headers['x-forwarded-proto'] || 'https',
        'x-forwarded-host': req.headers.host,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    }
  );

  proxyReq.on('error', (err) => {
    // If services are still booting, provide a friendly loading response
    if (res.headersSent) return;
    res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html>
        <body style="background:#090d16;color:#e2e8f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;padding:32px;background:#111827;border-radius:12px;border:1px solid #1f2937;max-width:440px;">
            <div style="font-size:28px;margin-bottom:12px;">⏳ Booting Nina Automation Services...</div>
            <p style="color:#94a3b8;font-size:14px;line-height:1.5;">
              Both Instagram and WhatsApp services are initializing. Please refresh in a few moments.
            </p>
          </div>
        </body>
      </html>
    `);
  });

  req.pipe(proxyReq, { end: true });
});

// WebSocket upgrade handling for Hot Module Reloading & live sockets
server.on('upgrade', (req, socket, head) => {
  const target = routeTarget(req.url || '/');
  const proxyReq = http.request({
    host: target.host,
    port: target.port,
    path: req.url,
    method: req.method,
    headers: req.headers,
  });

  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
        Object.entries(proxyRes.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n') +
        `\r\n\r\n`
    );
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });

  proxyReq.on('error', () => {
    socket.destroy();
  });

  proxyReq.end();
});

server.listen(publicPort, () => {
  console.log(`✅ Gateway active on port ${publicPort}`);
});

// Clean shutdown
process.on('SIGINT', () => {
  instagramService.kill();
  whatsappService.kill();
  process.exit();
});

process.on('SIGTERM', () => {
  instagramService.kill();
  whatsappService.kill();
  process.exit();
});

