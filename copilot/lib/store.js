// Live session state + long-term viewer memory (who your regulars are).
// Runs on the computer (saving to files) and inside the phone app (saving to phone storage):
// the `persist` object passed in decides where things are saved.
const FEED_LIMIT = 300;
const TRANSCRIPT_WINDOW_MS = 3 * 60 * 1000;

export class Store {
  constructor(persist, { remember = true } = {}) {
    this.persist = persist;
    this.remember = remember; // false in demo mode: pretend viewers aren't saved
    this.viewers = persist.loadViewers() || {}; // uniqueId -> long-term record
    this.profile = persist.loadProfile() || {};
    this._saveTimer = null;
    this.resetSession();
  }

  resetSession(streamer = '') {
    this.session = {
      streamer,
      status: 'idle', // idle | connecting | live | ended | error
      statusDetail: '',
      startedAt: Date.now(),
      viewerCount: 0,
      peakViewers: 0,
      totalLikes: 0,
      counts: { joins: 0, chats: 0, gifts: 0, follows: 0, shares: 0 },
      lastChatAt: Date.now(),
    };
    this.feed = [];
    this.transcript = [];
    this.nowPlaying = null; // { title, artist, year, source, since }
    this.trackHistory = [];
    this.inRoom = new Map(); // uniqueId -> { nickname, joinedAt, lastActiveAt, chats }
    this.suggestions = { say_now: [], chat_replies: [], vibe: '', at: 0, source: '' };
  }

  // ---------- viewers ----------
  touchViewer(user, kind) {
    if (!user?.uniqueId) return null;
    const id = user.uniqueId;
    const now = Date.now();
    let v = this.viewers[id];
    const isNewEver = !v;
    if (!v) {
      v = this.viewers[id] = {
        uniqueId: id,
        nickname: user.nickname || id,
        firstSeen: now,
        lastSeen: 0,
        streams: 0,
        chats: 0,
        gifts: 0,
        follows: 0,
        shares: 0,
        notes: [],
      };
    }
    if (user.nickname) v.nickname = user.nickname;

    let room = this.inRoom.get(id);
    const isNewThisStream = !room;
    if (!room) {
      room = { nickname: v.nickname, joinedAt: now, lastActiveAt: now, chats: 0 };
      this.inRoom.set(id, room);
      v.streams += 1;
    }
    room.lastActiveAt = now;
    v.lastSeen = now;
    if (kind === 'chat') { v.chats += 1; room.chats += 1; }
    if (kind === 'gift') v.gifts += 1;
    if (kind === 'follow') v.follows += 1;
    if (kind === 'share') v.shares += 1;
    this.scheduleSave();
    return { viewer: v, isNewEver, isNewThisStream };
  }

  addViewerNote(uniqueId, note) {
    const v = this.viewers[uniqueId];
    if (!v || !note) return;
    if (v.notes.some((n) => n.toLowerCase() === note.toLowerCase())) return;
    v.notes.push(note.slice(0, 160));
    if (v.notes.length > 12) v.notes.shift();
    this.scheduleSave();
  }

  viewerSummary(uniqueId) {
    const v = this.viewers[uniqueId];
    if (!v) return null;
    return {
      uniqueId: v.uniqueId,
      nickname: v.nickname,
      streamsAttended: v.streams,
      totalChats: v.chats,
      totalGifts: v.gifts,
      followedEver: v.follows > 0,
      sharedEver: v.shares > 0,
      firstSeen: new Date(v.firstSeen).toISOString().slice(0, 10),
      notes: v.notes,
    };
  }

  scheduleSave() {
    if (this._saveTimer || !this.remember) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.persist.saveViewers(this.viewers);
    }, 2000);
  }

  // ---------- feed / transcript / music ----------
  pushFeed(item) {
    const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now(), ...item };
    this.feed.push(entry);
    if (this.feed.length > FEED_LIMIT) this.feed.shift();
    return entry;
  }

  addTranscript(text) {
    const clean = String(text || '').trim();
    if (!clean) return;
    const now = Date.now();
    this.transcript.push({ text: clean.slice(0, 500), ts: now });
    this.transcript = this.transcript.filter((t) => now - t.ts < TRANSCRIPT_WINDOW_MS);
  }

  recentTranscript() {
    const now = Date.now();
    return this.transcript.filter((t) => now - t.ts < TRANSCRIPT_WINDOW_MS).map((t) => t.text).join(' ');
  }

  setNowPlaying(track) {
    if (!track?.title) return false;
    const same =
      this.nowPlaying &&
      this.nowPlaying.title.toLowerCase() === track.title.toLowerCase() &&
      (this.nowPlaying.artist || '').toLowerCase() === (track.artist || '').toLowerCase();
    if (same) return false;
    this.nowPlaying = { ...track, since: Date.now() };
    this.trackHistory.push(this.nowPlaying);
    if (this.trackHistory.length > 60) this.trackHistory.shift();
    return true;
  }

  saveProfile(profile) {
    this.profile = profile;
    this.persist.saveProfile(profile);
  }

  saveReport(report) {
    return this.persist.saveReport(report);
  }

  snapshot() {
    return {
      session: this.session,
      nowPlaying: this.nowPlaying,
      trackHistory: this.trackHistory.slice(-10),
      feed: this.feed.slice(-80),
      suggestions: this.suggestions,
      inRoom: this.inRoomList(),
      profile: this.profile,
    };
  }

  inRoomList() {
    return [...this.inRoom.entries()]
      .map(([id, r]) => {
        const v = this.viewers[id];
        return {
          uniqueId: id,
          nickname: r.nickname,
          chatsThisStream: r.chats,
          streamsAttended: v?.streams ?? 1,
          lastActiveAt: r.lastActiveAt,
        };
      })
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
      .slice(0, 50);
  }
}
