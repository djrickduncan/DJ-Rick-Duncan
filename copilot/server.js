// DJ Co-Pilot server. Run on a laptop/PC (or a cloud host) while you stream from the TikTok app.
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { Store } from './lib/store.js';
import { Brain } from './lib/brain.js';
import { LiveSource } from './lib/tiktok.js';
import { recognizeClip, recognitionEnabled } from './lib/recognize.js';

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

const store = new Store();
const live = new LiveSource();
const sockets = new Set();

function broadcast(type, payload) {
  const msg = JSON.stringify({ type, payload });
  for (const ws of sockets) if (ws.readyState === 1) ws.send(msg);
}

const brain = new Brain(store, (sugg, source) => {
  if (!sugg.say_now?.length && !sugg.chat_replies?.length && !sugg.track_fact) return;
  store.suggestions = { ...sugg, at: Date.now(), source };
  broadcast('suggestions', store.suggestions);
});

// ---------- TikTok events -> state + brain ----------
live.on('status', (status, detail) => {
  store.session.status = status;
  store.session.statusDetail = detail;
  broadcast('status', { status, detail });
  if (status === 'ended') finishStream();
});

live.on('viewers', (n) => {
  store.session.viewerCount = n;
  store.session.peakViewers = Math.max(store.session.peakViewers, n);
  broadcast('viewers', { viewerCount: n, peakViewers: store.session.peakViewers });
});

let likeBuffer = new Map();
live.on('event', (e) => {
  const s = store.session;
  if (e.type === 'like') {
    // Likes are very frequent; fold them into one feed line every few seconds.
    s.totalLikes = e.total || s.totalLikes + (e.count || 0);
    likeBuffer.set(e.uniqueId, (likeBuffer.get(e.uniqueId) || 0) + (e.count || 0));
    store.touchViewer(e, 'like');
    return;
  }
  const touched = store.touchViewer(e, e.type);
  if (e.type === 'join') {
    s.counts.joins += 1;
    if (!touched?.isNewThisStream) return; // rejoin noise
  }
  if (e.type === 'chat') { s.counts.chats += 1; s.lastChatAt = Date.now(); }
  if (e.type === 'gift') s.counts.gifts += 1;
  if (e.type === 'follow') s.counts.follows += 1;
  if (e.type === 'share') s.counts.shares += 1;

  const v = touched?.viewer;
  const entry = store.pushFeed({
    type: e.type,
    uniqueId: e.uniqueId,
    nickname: e.nickname,
    text: e.text || '',
    detail: e.detail || '',
    regular: v ? v.streams > 1 : false,
    streams: v?.streams || 1,
  });
  broadcast('feed', entry);
  broadcast('room', store.inRoomList());

  const urgent = e.type === 'gift' || e.type === 'share' || (e.type === 'chat' && /\?|rick|play|request/i.test(e.text || ''));
  brain.note({ kind: e.type, uniqueId: e.uniqueId, nickname: e.nickname, text: e.text, detail: e.detail, urgent });
});

setInterval(() => {
  if (!likeBuffer.size) return;
  const top = [...likeBuffer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const entry = store.pushFeed({
    type: 'likes',
    text: top.map(([id, n]) => `${store.viewers[id]?.nickname || id} ×${n}`).join(', '),
    detail: String(store.session.totalLikes),
  });
  likeBuffer = new Map();
  broadcast('feed', entry);
}, 8000);

async function finishStream() {
  try {
    const report = await brain.streamReport();
    const file = store.saveReport(report);
    broadcast('report', { ...report, file });
  } catch (err) {
    console.error('[report]', err.message);
  }
}

// ---------- HTTP ----------
const app = express();
app.use(express.json({ limit: '256kb' }));

app.use('/api', (req, res, next) => {
  if (!PIN || req.get('x-pin') === PIN) return next();
  res.status(401).json({ error: 'Wrong PIN' });
});

app.get('/api/state', (req, res) =>
  res.json({ ...store.snapshot(), features: { claude: brain.enabled, recognition: recognitionEnabled(), demo: process.env.DEMO === '1', brainError: brain.lastError } }),
);

app.post('/api/connect', async (req, res) => {
  const username = req.body?.username || store.profile.tiktokUsername;
  store.resetSession(username);
  broadcast('reset', store.snapshot());
  try {
    await live.connect(username);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/disconnect', async (req, res) => {
  await live.disconnect();
  store.session.status = 'ended';
  broadcast('status', { status: 'ended', detail: 'Stopped' });
  finishStream();
  res.json({ ok: true });
});

app.post('/api/now-playing', (req, res) => {
  const { title, artist = '', year = '' } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Need a title' });
  const changed = store.setNowPlaying({ title: String(title).slice(0, 120), artist: String(artist).slice(0, 120), year: String(year).slice(0, 4), source: 'manual' });
  broadcast('nowPlaying', { nowPlaying: store.nowPlaying, trackHistory: store.trackHistory.slice(-10) });
  if (changed) brain.note({ kind: 'track_change', text: `${artist ? artist + ' - ' : ''}${title}`, urgent: true });
  res.json({ ok: true });
});

app.post('/api/recognize', express.raw({ type: () => true, limit: '3mb' }), async (req, res) => {
  try {
    const track = await recognizeClip(req.body, req.get('content-type') || 'audio/webm');
    if (!track) return res.json({ ok: false, error: "Couldn't recognise that one" });
    const changed = store.setNowPlaying(track);
    broadcast('nowPlaying', { nowPlaying: store.nowPlaying, trackHistory: store.trackHistory.slice(-10) });
    if (changed) brain.note({ kind: 'track_change', text: `${track.artist} - ${track.title} (${track.year})`, urgent: true });
    res.json({ ok: true, track });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/transcript', (req, res) => {
  store.addTranscript(req.body?.text);
  brain.note({ kind: 'dj_spoke', text: String(req.body?.text || '').slice(0, 300) });
  res.json({ ok: true });
});

app.post('/api/ask', (req, res) => {
  const q = String(req.body?.question || '').slice(0, 500);
  if (!q) return res.status(400).json({ error: 'Empty question' });
  brain.ask(q);
  res.json({ ok: true });
});

app.post('/api/viewer-note', (req, res) => {
  store.addViewerNote(req.body?.uniqueId, String(req.body?.note || '').trim());
  res.json({ ok: true, viewer: store.viewerSummary(req.body?.uniqueId) });
});

app.get('/api/viewer/:id', (req, res) => res.json(store.viewerSummary(req.params.id) || {}));

app.put('/api/profile', (req, res) => {
  store.saveProfile({ ...store.profile, ...req.body });
  res.json({ ok: true, profile: store.profile });
});

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
  console.log(`\n🎧 DJ Co-Pilot running → http://localhost:${PORT}`);
  console.log(`   Claude suggestions: ${brain.enabled ? 'ON' : 'OFF (set ANTHROPIC_API_KEY; using simple templates)'}`);
  console.log(`   Song recognition:   ${recognitionEnabled() ? 'ON' : 'off (optional AUDD_API_TOKEN)'}`);
  if (process.env.DEMO === '1') console.log('   DEMO MODE: fake viewers, nothing connects to TikTok');
  if (!PIN) console.log('   Tip: set DASHBOARD_PIN if this is reachable from the internet.');
});
