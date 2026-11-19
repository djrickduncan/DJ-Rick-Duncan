// Read-only connection to a TikTok LIVE. It needs only the username: no login,
// no password, and it cannot post, like, tap or share anything.
import { Emitter } from './emitter.js';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';

const userOf = (d) => ({ uniqueId: d?.user?.uniqueId || '', nickname: d?.user?.nickname || d?.user?.uniqueId || '' });

export class LiveSource extends Emitter {
  constructor({ signApiKey = '' } = {}) {
    super();
    this.signApiKey = signApiKey;
    this.canPost = false;
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
    this._open();
  }

  async _open() {
    clearTimeout(this.retryTimer);
    this.emit('status', 'connecting', `Looking for @${this.username}'s live…`);
    const conn = new TikTokLiveConnection(this.username, {
      enableExtendedGiftInfo: true,
      ...(this.signApiKey ? { signApiKey: this.signApiKey } : {}),
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
    if (this.conn) {
      const c = this.conn;
      this.conn = null;
      c.removeAllListeners?.();
      try { await c.disconnect(); } catch { /* already closed */ }
    }
  }
}
