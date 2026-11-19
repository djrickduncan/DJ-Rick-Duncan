// Live source for the phone app: TikTok's own live page in the built-in TikTok browser,
// logged in as the crew account. Emits the same events as the computer version and
// can post an approved message into the chat.
import { Emitter } from '../lib/emitter.js';
import { registerPlugin } from '../vendor/native.mjs';

const TikTokWeb = registerPlugin('TikTokWeb');
// TikTok's desktop site has the full live chat; its mobile site pushes you to the app.
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MIN_POST_GAP_MS = 3000;

export const POST_ERRORS = {
  'no-input': "Couldn't find the chat box. Make sure you're logged in, or use Settings → Teach me the chat box.",
  'could-not-type': "Couldn't type into the chat box. Try Settings → Teach me the chat box.",
  'not-sent': 'Typed it but TikTok didn\'t send it. Open TikTok to check (maybe a slow-mode or a pop-up).',
  timeout: "The TikTok page didn't answer. Is the live open? Tap Show TikTok.",
};

export class TikTokWebSource extends Emitter {
  constructor() {
    super();
    this.canPost = true;
    this.pending = new Map();
    this.queue = Promise.resolve();
    this.lastPostAt = 0;
    this.status = '';
    this.page = {};
    this.username = '';
    this.wantLive = false;
    TikTokWeb.addListener('message', ({ data }) => this._onMessage(data));
    TikTokWeb.addListener('pageLoaded', ({ url }) => { this.page.url = url; });
    TikTokWeb.addListener('hidden', () => {
      // After logging in, go back to the live if we were watching one.
      if (this.wantLive && !/\/live/.test(this.page.url || '')) this._openLive();
      this.emit('info', { type: 'hidden' });
    });
  }

  async _script() {
    if (!this.script) this.script = await (await fetch(new URL('./tiktok-page.js', import.meta.url))).text();
    return this.script;
  }

  async _openLive() {
    await TikTokWeb.open({ url: `https://www.tiktok.com/@${encodeURIComponent(this.username)}/live`, userAgent: DESKTOP_UA, script: await this._script() });
  }

  _setStatus(status, detail) {
    if (status === this.status && detail === this.statusDetail) return;
    this.status = status;
    this.statusDetail = detail;
    this.emit('status', status, detail);
  }

  async connect(username) {
    this.username = username;
    this.wantLive = true;
    this.status = '';
    this._setStatus('connecting', `Opening @${username}'s live…`);
    await this._openLive();
  }

  async disconnect() {
    this.wantLive = false;
    await TikTokWeb.close().catch(() => {});
  }

  // Login: show TikTok's login page; when you tap Back, the live re-opens.
  async login() {
    await TikTokWeb.open({ url: 'https://www.tiktok.com/login', userAgent: DESKTOP_UA, script: await this._script() });
    await TikTokWeb.show();
  }

  async logout() {
    await TikTokWeb.logout();
    if (this.wantLive) await this._openLive();
  }

  async show() {
    if (!this.page.url) {
      if (this.username) await this._openLive();
      else return this.login();
    }
    await TikTokWeb.show();
  }

  async calibrate() {
    await TikTokWeb.show();
    await TikTokWeb.evaluate({ code: 'window.__copilot && window.__copilot.calibrate()' });
  }

  async debug() {
    await TikTokWeb.evaluate({ code: 'window.__copilot && window.__copilot.debug()' });
  }

  _onMessage(json) {
    let m;
    try {
      m = JSON.parse(json);
    } catch {
      return;
    }
    if (m.type === 'event') return this.emit('event', m.event);
    if (m.type === 'postResult') {
      const resolve = this.pending.get(m.id);
      if (resolve) {
        this.pending.delete(m.id);
        resolve({ ok: m.ok, reason: POST_ERRORS[m.reason] || m.reason });
      }
      return;
    }
    if (m.type === 'state') {
      this.page = { ...this.page, ...m };
      this.emit('info', m);
      if (!this.wantLive || !m.isLivePage) return;
      if (m.ended) this._setStatus('ended', 'The live has ended');
      else if (m.chatRoot) this._setStatus('live', `Watching @${this.username}${m.loggedIn ? (m.input ? ' · ready to post' : ' · chat box not found yet') : ' · log in to post'}`);
      else this._setStatus('connecting', `Waiting for @${this.username}'s live chat… (not live yet?)`);
      if (m.viewers) this.emit('viewers', m.viewers);
      return;
    }
    if (m.type === 'calibrated' || m.type === 'debug') this.emit('info', m);
  }

  /** Post one message. Posts are queued and spaced out so the chat stays natural. */
  post(text) {
    const run = async () => {
      const wait = Math.max(0, this.lastPostAt + MIN_POST_GAP_MS - Date.now());
      if (wait) await new Promise((r) => setTimeout(r, wait));
      const id = `p${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
      const result = new Promise((resolve) => {
        this.pending.set(id, resolve);
        setTimeout(() => {
          if (this.pending.delete(id)) resolve({ ok: false, reason: POST_ERRORS.timeout });
        }, 9000);
      });
      await TikTokWeb.evaluate({ code: `window.__copilot && window.__copilot.post(${JSON.stringify(text)}, ${JSON.stringify(id)})` });
      const r = await result;
      if (r.ok) this.lastPostAt = Date.now();
      return r;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }
}
