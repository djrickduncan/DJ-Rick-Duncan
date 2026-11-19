// Read-only connection to a TikTok LIVE. It needs only the username: no login,
// no password, and it cannot post, like, tap or share anything.
import { EventEmitter } from 'node:events';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

const userOf = (d) => ({ uniqueId: d?.user?.uniqueId || '', nickname: d?.user?.nickname || d?.user?.uniqueId || '' });

export class LiveSource extends EventEmitter {
  constructor() {
    super();
    this.conn = null;
    this.username = '';
    this.retryTimer = null;
    this.wantConnected = false;
  }

  async connect(username) {
    await this.disconnect();
    this.username = String(username || '').replace(/^@/, '').trim();
    if (!this.username) throw new Error('No TikTok username set');
    this.wantConnected = true;
    if (process.env.DEMO === '1') return this.startDemo();
    this._open();
  }

  async _open() {
    clearTimeout(this.retryTimer);
    this.emit('status', 'connecting', `Looking for @${this.username}'s live…`);
    const conn = new TikTokLiveConnection(this.username, {
      enableExtendedGiftInfo: true,
      ...(process.env.TIKTOK_SIGN_API_KEY ? { signApiKey: process.env.TIKTOK_SIGN_API_KEY } : {}),
    });
    this.conn = conn;

    conn.on(WebcastEvent.MEMBER, (d) => this.emit('event', { type: 'join', ...userOf(d) }));
    conn.on(WebcastEvent.CHAT, (d) => this.emit('event', { type: 'chat', ...userOf(d), text: d.comment || '' }));
    conn.on(WebcastEvent.GIFT, (d) => {
      if (d.giftDetails?.giftType === 1 && !d.repeatEnd) return; // wait for the streak to finish
      const name = d.giftDetails?.giftName || d.extendedGiftInfo?.name || 'gift';
      const count = d.repeatCount || 1;
      this.emit('event', { type: 'gift', ...userOf(d), detail: count > 1 ? `${count}x ${name}` : name });
    });
    conn.on(WebcastEvent.FOLLOW, (d) => this.emit('event', { type: 'follow', ...userOf(d) }));
    conn.on(WebcastEvent.SHARE, (d) => this.emit('event', { type: 'share', ...userOf(d) }));
    conn.on(WebcastEvent.LIKE, (d) =>
      this.emit('event', { type: 'like', ...userOf(d), count: d.likeCount || 0, total: d.totalLikeCount || 0 }),
    );
    conn.on(WebcastEvent.ROOM_USER, (d) => this.emit('viewers', d.viewerCount || 0));
    conn.on(WebcastEvent.STREAM_END, () => {
      this.wantConnected = false;
      this.emit('status', 'ended', 'Stream ended');
    });
    conn.on(ControlEvent.DISCONNECTED, () => {
      if (this.wantConnected) this._retry('Connection dropped, reconnecting…');
    });
    conn.on(ControlEvent.ERROR, (e) => console.error('[tiktok]', e?.message || e));

    try {
      await conn.connect();
      this.emit('status', 'live', `Connected to @${this.username}`);
    } catch (err) {
      const msg = err?.message || String(err);
      const offline = /offline|not live|LIVE has ended|isn't online/i.test(msg);
      this._retry(offline ? `@${this.username} isn't live yet. Checking again shortly…` : `Couldn't connect: ${msg}`);
    }
  }

  _retry(detail) {
    this.emit('status', 'connecting', detail);
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.wantConnected && this._open(), 20000);
  }

  async disconnect() {
    this.wantConnected = false;
    clearTimeout(this.retryTimer);
    clearInterval(this.demoTimer);
    if (this.conn) {
      const c = this.conn;
      this.conn = null;
      c.removeAllListeners?.();
      try { await c.disconnect(); } catch { /* already closed */ }
    }
  }

  // ---------- demo mode: fake events so you can try the dashboard without going live ----------
  startDemo() {
    const people = [
      ['sarah_k', 'Sarah K'], ['dazzaleeds', 'Dazza'], ['raverjen90', 'Jen'], ['mikeyb', 'Mikey B'],
      ['garagegaz', 'Gaz'], ['lou.from.hull', 'Louise'], ['tommo_88', 'Tommo'], ['bex_dances', 'Bex'],
    ];
    const lines = [
      'evening rick!!', 'this takes me back 😭', 'can you play some garage?', 'tuning in from Leeds',
      'first time here, loving it', 'where are you playing next?', 'TUNE 🔥🔥', 'my mum used to play this in the car',
      'what year was this?', 'shout out to Sheffield!',
    ];
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    let viewers = 3;
    this.emit('status', 'live', `DEMO MODE: pretending @${this.username} is live`);
    this.demoTimer = setInterval(() => {
      const [uniqueId, nickname] = pick(people);
      const r = Math.random();
      if (r < 0.25) { viewers += 1; this.emit('event', { type: 'join', uniqueId, nickname }); }
      else if (r < 0.7) this.emit('event', { type: 'chat', uniqueId, nickname, text: pick(lines) });
      else if (r < 0.78) this.emit('event', { type: 'follow', uniqueId, nickname });
      else if (r < 0.84) this.emit('event', { type: 'share', uniqueId, nickname });
      else if (r < 0.9) this.emit('event', { type: 'gift', uniqueId, nickname, detail: pick(['Rose', '5x Rose', 'Finger Heart', 'Galaxy']) });
      else this.emit('event', { type: 'like', uniqueId, nickname, count: 15, total: 0 });
      this.emit('viewers', viewers);
    }, 4000 + Math.random() * 3000);
  }
}
