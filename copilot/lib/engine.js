// The co-pilot engine: wires the live source (TikTok or demo), the music tracker,
// the viewer store and the AI brain together. The computer server and the phone app
// both run this; they only differ in where data is saved and how the live is read.
import { Emitter } from './emitter.js';
import { Store } from './store.js';
import { Brain } from './brain.js';
import { MusicTracker } from './music.js';

export class Engine extends Emitter {
  /**
   * @param {object} o
   * @param {object} o.persist        where to save viewers/profile/reports
   * @param {object} o.source         live source: emits status/event/viewers; connect(), disconnect(), optional post()
   * @param {object} [o.brainOptions] { client, model, effort, minGapMs, quietMs }
   * @param {boolean} [o.demo]
   */
  constructor({ persist, source, brainOptions = {}, demo = false }) {
    super();
    this.demo = demo;
    this.source = source;
    this.store = new Store(persist, { remember: !demo });
    this.music = new MusicTracker();
    this.brain = new Brain(this.store, this.music, (s, src) => this._suggestions(s, src), brainOptions);
    this.likeBuffer = new Map();
    this.recentlyPosted = []; // { text, ts } so our own posts aren't treated as viewer chat
    this.lastMusicBroadcast = 0;
    this._wire();
  }

  broadcast(type, payload) {
    this.emit('broadcast', type, payload);
  }

  _suggestions(sugg, source) {
    if (!sugg.say_now?.length && !sugg.chat_posts?.length && !sugg.speech_ideas?.length && !sugg.music_note) return;
    this.store.suggestions = { ...sugg, at: Date.now(), source };
    this.broadcast('suggestions', this.store.suggestions);
  }

  _broadcastMusic() {
    if (Date.now() - this.lastMusicBroadcast < 1500) return;
    this.lastMusicBroadcast = Date.now();
    this.broadcast('music', { state: this.music.state, summary: this.music.summary() });
  }

  _isOwnPost(e) {
    if (e.own) return true;
    const crew = String(this.store.profile.crewAccount || '').replace(/^@/, '').toLowerCase();
    if (crew && String(e.uniqueId || '').toLowerCase() === crew) return true;
    const now = Date.now();
    this.recentlyPosted = this.recentlyPosted.filter((p) => now - p.ts < 120000);
    return this.recentlyPosted.some((p) => p.text.trim() === String(e.text || '').trim());
  }

  _wire() {
    const { store, brain, music, source } = this;

    music.on('moment', (m, urgent) => {
      this.broadcast('feed', store.pushFeed({ type: 'music', text: m.text }));
      brain.note({ kind: 'music', musicKind: m.kind, text: m.text, urgent, instant: urgent });
    });
    music.on('state', () => this._broadcastMusic());

    source.on('status', (status, detail) => {
      store.session.status = status;
      store.session.statusDetail = detail;
      this.broadcast('status', { status, detail });
      if (status === 'ended') this.finishStream();
    });

    source.on('viewers', (n) => {
      store.session.viewerCount = n;
      store.session.peakViewers = Math.max(store.session.peakViewers, n);
      this.broadcast('viewers', { viewerCount: n, peakViewers: store.session.peakViewers });
    });

    source.on('event', (e) => this._onEvent(e));

    // Other sources (e.g. the phone's TikTok page) can report diagnostics.
    source.on('info', (info) => this.broadcast('sourceInfo', info));

    this.likeTimer = setInterval(() => {
      if (!this.likeBuffer.size) return;
      const top = [...this.likeBuffer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      this.broadcast('feed', store.pushFeed({
        type: 'likes',
        text: top.map(([id, n]) => `${store.viewers[id]?.nickname || id} ×${n}`).join(', '),
        detail: String(store.session.totalLikes),
      }));
      this.likeBuffer = new Map();
    }, 8000);
  }

  _onEvent(e) {
    const { store, brain } = this;
    const s = store.session;
    if (e.type === 'chat' && this._isOwnPost(e)) return;
    if (e.type === 'like') {
      s.totalLikes = e.total || s.totalLikes + (e.count || 0);
      if (e.uniqueId) this.likeBuffer.set(e.uniqueId, (this.likeBuffer.get(e.uniqueId) || 0) + (e.count || 0));
      store.touchViewer(e, 'like');
      return;
    }
    const touched = store.touchViewer(e, e.type);
    if (e.type === 'join') {
      s.counts.joins += 1;
      if (touched && !touched.isNewThisStream) return; // rejoin noise
    }
    if (e.type === 'chat') { s.counts.chats += 1; s.lastChatAt = Date.now(); }
    if (e.type === 'gift') s.counts.gifts += 1;
    if (e.type === 'follow') s.counts.follows += 1;
    if (e.type === 'share') s.counts.shares += 1;

    const v = touched?.viewer;
    this.broadcast('feed', store.pushFeed({
      type: e.type,
      uniqueId: e.uniqueId,
      nickname: e.nickname,
      text: e.text || '',
      detail: e.detail || '',
      regular: v ? v.streams > 1 : false,
      streams: v?.streams || 1,
    }));
    this.broadcast('room', store.inRoomList());

    const urgent = e.type === 'gift' || e.type === 'share' || (e.type === 'chat' && /\?|rick|play|request/i.test(e.text || ''));
    brain.note({ kind: e.type, uniqueId: e.uniqueId, nickname: e.nickname, text: e.text, detail: e.detail, urgent });
  }

  async finishStream() {
    try {
      const report = await this.brain.streamReport();
      const file = this.store.saveReport(report);
      this.broadcast('report', { ...report, file });
    } catch (err) {
      console.error('[report]', err?.message || err);
    }
  }

  state(extraFeatures = {}) {
    return {
      ...this.store.snapshot(),
      music: { state: this.music.state, summary: this.music.summary() },
      features: {
        claude: this.brain.enabled,
        listener: this.music.connected,
        demo: this.demo,
        canPost: Boolean(this.source.canPost),
        brainError: this.brain.lastError,
        ...extraFeatures,
      },
    };
  }

  /** One entry point for every dashboard action. Returns { status, body }. */
  async handle(method, path, body = {}) {
    const { store, brain, music, source } = this;
    const ok = (b = { ok: true }) => ({ status: 200, body: b });
    const bad = (error, status = 400) => ({ status, body: { error } });
    const route = `${method.toUpperCase()} ${path.replace(/^\/+/, '')}`;

    if (route === 'GET state') return ok(this.state());

    if (route === 'POST connect') {
      const username = String(body.username || store.profile.tiktokUsername || '').replace(/^@/, '').trim();
      if (!username) return bad('Enter the TikTok username to watch');
      store.resetSession(username);
      this.broadcast('reset', store.snapshot());
      try {
        await source.connect(username);
        if (this.demo) music.startDemo();
        return ok();
      } catch (err) {
        return bad(err.message);
      }
    }

    if (route === 'POST disconnect') {
      await source.disconnect();
      clearInterval(music.demoTimer);
      store.session.status = 'ended';
      this.broadcast('status', { status: 'ended', detail: 'Stopped' });
      this.finishStream();
      return ok();
    }

    if (route === 'POST post') {
      const text = String(body.text || '').trim().slice(0, 150);
      if (!text) return bad('Nothing to post');
      if (!source.canPost || !source.post) return bad('Posting is only available in the phone app');
      this.recentlyPosted.push({ text, ts: Date.now() });
      const result = await source.post(text);
      if (!result?.ok) return bad(result?.reason || "Couldn't post", 409);
      brain.recentPosts.push(text);
      brain.recentPosts = brain.recentPosts.slice(-12);
      return ok({ ok: true });
    }

    if (route === 'POST now-playing') {
      const { title, artist = '', year = '' } = body;
      if (!title) return bad('Need a title');
      const changed = store.setNowPlaying({ title: String(title).slice(0, 120), artist: String(artist).slice(0, 120), year: String(year).slice(0, 4), source: 'manual' });
      this.broadcast('nowPlaying', { nowPlaying: store.nowPlaying, trackHistory: store.trackHistory.slice(-10) });
      if (changed) brain.note({ kind: 'track_change', text: `${artist ? artist + ' - ' : ''}${title}`, urgent: true });
      return ok();
    }

    if (route === 'POST music') {
      music.update(body || {});
      this._broadcastMusic();
      return ok();
    }

    if (route === 'POST transcript') {
      const text = String(body.text || '').trim().slice(0, 300);
      if (!text) return ok();
      store.addTranscript(text);
      brain.note({ kind: 'dj_spoke', text });
      this.broadcast('transcript', { text });
      return ok();
    }

    if (route === 'POST ask') {
      const q = String(body.question || '').slice(0, 500);
      if (!q) return bad('Empty question');
      brain.ask(q);
      return ok();
    }

    if (route === 'POST viewer-note') {
      store.addViewerNote(body.uniqueId, String(body.note || '').trim());
      return ok({ ok: true, viewer: store.viewerSummary(body.uniqueId) });
    }

    const viewerMatch = route.match(/^GET viewer\/(.+)$/);
    if (viewerMatch) return ok(store.viewerSummary(decodeURIComponent(viewerMatch[1])) || {});

    if (route === 'PUT profile') {
      store.saveProfile({ ...store.profile, ...body });
      return ok({ ok: true, profile: store.profile });
    }

    return bad('Not found', 404);
  }

  async destroy() {
    clearInterval(this.likeTimer);
    clearInterval(this.music.demoTimer);
    this.brain.stop();
    await this.source.disconnect();
    this.removeAllListeners();
  }
}
