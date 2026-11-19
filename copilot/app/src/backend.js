// The phone app's "backend": runs the whole co-pilot on the phone. No computer needed.
import { Engine } from '../lib/engine.js';
import { DemoSource } from '../lib/demo.js';
import { MusicAnalyser } from '../audio.js';
import { TikTokWebSource } from './tiktok-source.js';
import { Anthropic, Clipboard, KeepAwake, SpeechRecognition } from '../vendor/native.mjs';

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage full or blocked */ } },
  json(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } },
};

export function loadSettings() {
  return { apiKey: '', effort: 'high', demo: false, ...ls.json('copilot.settings', {}) };
}

export async function createNativeBackend() {
  const settings = loadSettings();
  const defaultProfile = await fetch('profile.example.json').then((r) => r.json()).catch(() => ({}));
  const persist = {
    loadViewers: () => ls.json('copilot.viewers', {}),
    saveViewers: (v) => ls.set('copilot.viewers', JSON.stringify(v)),
    loadProfile: () => ls.json('copilot.profile', null) || defaultProfile,
    saveProfile: (p) => ls.set('copilot.profile', JSON.stringify(p)),
    saveReport: (r) => {
      const list = ls.json('copilot.reports', []);
      list.push({ at: Date.now(), summary: r.summary, data: r.data });
      ls.set('copilot.reports', JSON.stringify(list.slice(-20)));
      return `report-${list.length}`;
    },
  };

  const tiktok = settings.demo ? null : new TikTokWebSource();
  const engine = new Engine({
    persist,
    demo: settings.demo,
    source: tiktok || new DemoSource(),
    brainOptions: {
      client: settings.apiKey ? new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true }) : null,
      effort: settings.effort,
    },
  });

  // ---------- listening: music through the phone mic ----------
  const analyser = new MusicAnalyser((features, send) => {
    if (send) engine.handle('POST', 'music', features);
    listeners.forEach((fn) => fn('localMusic', features));
  });
  const listeners = new Set();
  engine.on('broadcast', (type, payload) => listeners.forEach((fn) => fn(type, payload)));

  // ---------- your voice: Android speech recognition ----------
  let speechOn = false;
  let lastPartial = '';
  SpeechRecognition.addListener('partialResults', (d) => {
    lastPartial = d.matches?.[0] || lastPartial;
    listeners.forEach((fn) => fn('speechPartial', { text: lastPartial }));
  });
  SpeechRecognition.addListener('listeningState', (d) => {
    if (d.status !== 'stopped') return;
    if (lastPartial) engine.handle('POST', 'transcript', { text: lastPartial });
    lastPartial = '';
    if (speechOn) setTimeout(() => startRecognizer(), 300);
  });
  async function startRecognizer() {
    try {
      await SpeechRecognition.start({ language: 'en-GB', maxResults: 1, partialResults: true, popup: false });
    } catch (err) {
      listeners.forEach((fn) => fn('speechError', { error: err?.message || String(err) }));
      if (speechOn) setTimeout(() => startRecognizer(), 1500);
    }
  }

  KeepAwake.keepAwake().catch(() => {});

  return {
    native: true,
    settings,
    tiktok,
    async request(method, path, body) {
      const { status, body: b } = await engine.handle(method, path, body || {});
      return status >= 400 ? { ...b, _status: status } : b;
    },
    subscribe(fn) {
      listeners.add(fn);
    },
    copy: (text) => Clipboard.write({ string: text }),
    saveSettings(next) {
      ls.set('copilot.settings', JSON.stringify({ ...settings, ...next }));
      location.reload();
    },
    get listening() {
      return analyser.running;
    },
    async startListening() {
      return analyser.start();
    },
    stopListening() {
      analyser.stop();
    },
    get speechOn() {
      return speechOn;
    },
    async startSpeech() {
      const { available } = await SpeechRecognition.available();
      if (!available) throw new Error('Speech recognition is not available on this phone');
      const perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== 'granted') throw new Error('Microphone permission was not given');
      speechOn = true;
      startRecognizer();
    },
    async stopSpeech() {
      speechOn = false;
      await SpeechRecognition.stop().catch(() => {});
    },
    reports: () => ls.json('copilot.reports', []),
  };
}
