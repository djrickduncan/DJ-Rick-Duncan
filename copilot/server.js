// DJ Co-Pilot server: the optional computer version. The Android app runs the same
// engine on the phone by itself; this lets you use the dashboard in any browser instead.
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import Anthropic from '@anthropic-ai/sdk';
import { Engine } from './lib/engine.js';
import { filePersist } from './lib/persist-fs.js';
import { LiveSource } from './lib/tiktok.js';
import { DemoSource } from './lib/demo.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// Minimal .env loader so you don't need extra packages.
const envFile = path.join(here, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.PORT || 3000);
const PIN = process.env.DASHBOARD_PIN || '';
const DEMO = process.env.DEMO === '1';
const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

const engine = new Engine({
  persist: filePersist,
  demo: DEMO,
  source: DEMO ? new DemoSource() : new LiveSource({ signApiKey: process.env.TIKTOK_SIGN_API_KEY }),
  brainOptions: {
    client: hasKey ? new Anthropic() : null,
    model: process.env.CLAUDE_MODEL,
    effort: process.env.CLAUDE_EFFORT,
    minGapMs: process.env.SUGGEST_MIN_GAP_MS,
    quietMs: process.env.QUIET_CHAT_MS,
  },
});
// The computer version can't post into TikTok; the phone app does that.
if (DEMO) engine.source.canPost = false;

const sockets = new Set();
engine.on('broadcast', (type, payload) => {
  const msg = JSON.stringify({ type, payload });
  for (const ws of sockets) if (ws.readyState === 1) ws.send(msg);
});

// ---------- HTTP ----------
const app = express();
app.use(express.json({ limit: '256kb' }));

app.use('/api', (req, res, next) => {
  if (!PIN || req.get('x-pin') === PIN) return next();
  res.status(401).json({ error: 'Wrong PIN' });
});

app.all('/api/*splat', async (req, res) => {
  try {
    const { status, body } = await engine.handle(req.method, req.path.replace(/^\/api\//, ''), req.body || {});
    res.status(status).json(body);
  } catch (err) {
    console.error('[api]', err);
    res.status(500).json({ error: err.message });
  }
});

app.use('/vendor/mediapipe', express.static(path.join(here, 'node_modules', '@mediapipe', 'tasks-audio')));
app.use(express.static(path.join(here, 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  const pin = new URL(req.url, 'http://x').searchParams.get('pin') || '';
  if (PIN && pin !== PIN) return ws.close(4001, 'Wrong PIN');
  sockets.add(ws);
  ws.on('close', () => sockets.delete(ws));
});

server.listen(PORT, () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`\n🎧 DJ Co-Pilot (computer version) running`);
  console.log(`   Dashboard:  http://localhost:${PORT}   or from a phone browser: ${ips.map((ip) => `http://${ip}:${PORT}`).join('  ') || '(this computer\'s IP)'}`);
  console.log(`   Listener (open on THIS computer): http://localhost:${PORT}/listen.html`);
  console.log(`   Claude suggestions: ${hasKey ? 'ON' : 'OFF (set ANTHROPIC_API_KEY; using simple templates)'}`);
  if (DEMO) console.log('   DEMO MODE: fake viewers, nothing connects to TikTok');
  if (!PIN) console.log('   Tip: set DASHBOARD_PIN if this is reachable from the internet.');
});
