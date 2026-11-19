// DJ Co-Pilot dashboard.
// In the Android app the whole co-pilot runs on the phone (see app/src/backend.js).
// In a normal browser it talks to the computer version (server.js).
const $ = (id) => document.getElementById(id);
const NATIVE = Boolean(window.Capacitor?.isNativePlatform?.());
let backend = null; // set in the app
let pin = localStorageGet('copilot.pin') || '';
let state = null;

function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, body, method = body ? 'POST' : 'GET') {
  if (backend) return backend.request(method, path, body);
  const res = await fetch(`api/${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-pin': pin },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { askPin(); throw new Error('PIN required'); }
  const json = await res.json();
  return res.ok ? json : { ...json, _status: res.status };
}

function askPin() {
  const dlg = $('pinDlg');
  if (!dlg.open) dlg.showModal();
}
$('pinForm').addEventListener('submit', () => {
  pin = $('pinInput').value.trim();
  localStorageSet('copilot.pin', pin);
  boot();
});

// ---------- rendering ----------
function renderStatus(status, detail) {
  const pill = $('statusPill');
  pill.className = `pill ${status}`;
  pill.textContent = { idle: 'offline', connecting: 'waiting', live: 'live', ended: 'ended', error: 'error' }[status] || status;
  $('statusDetail').textContent = detail || '';
  const active = status === 'live' || status === 'connecting';
  $('stopBtn').classList.toggle('hidden', !active);
}

function renderCounts() {
  $('viewers').textContent = state.session.viewerCount;
  $('chats').textContent = state.session.counts.chats;
}

const MAX_POSTS = 12;
const canPost = () => Boolean(state?.features?.canPost);
function emptyPosts() {
  $('postList').innerHTML = `<li class="empty">Chat posts appear here as people join, chat and the music moves. ${canPost() ? 'Tap <b>Post</b> to send one to the live chat.' : 'Tap Copy, then paste it into the live chat.'}</li>`;
}

function renderSuggestions(s) {
  if (!s) return;
  // Chat posts stack up newest-first, so nothing is lost while you're busy.
  const list = $('postList');
  if (s.chat_posts?.length) {
    list.querySelector('.empty')?.remove();
    const html = s.chat_posts
      .map((p) => `<li class="${s.source !== 'claude' ? 'quick' : ''}">
        <div class="txt">${esc(p.text)}</div>
        <div class="meta"><span class="why">${esc(p.why)}${s.source !== 'claude' ? ' · instant' : ''}</span>
        <div><button class="x" data-dismiss aria-label="Dismiss">✕</button>${canPost()
          ? `<button class="x" data-copy="${esc(p.text)}">Copy</button><button class="copy" data-post="${esc(p.text)}">Post</button>`
          : `<button class="copy" data-copy="${esc(p.text)}">Copy</button>`}</div></div></li>`)
      .join('');
    list.insertAdjacentHTML('afterbegin', html);
    while (list.children.length > MAX_POSTS) list.lastElementChild.remove();
    if (navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate(40);
  }
  if (s.say_now?.length) {
    $('sayList').innerHTML = s.say_now
      .map((x) => `<li class="${x.priority === 'high' ? 'high' : ''}">${esc(x.text)}
        <div class="why"><span>${esc(x.why)}</span><button data-done>Done ✓</button></div></li>`)
      .join('');
  }
  if (s.speech_ideas?.length) {
    $('ideas').innerHTML = s.speech_ideas.map((i) => `<li>${esc(i)}</li>`).join('');
    $('ideasBox').classList.remove('hidden');
  }
  if (s.vibe) $('vibe').textContent = s.vibe;
  if (s.music_note) {
    $('musicNote').textContent = `💡 ${s.music_note}`;
    $('musicNote').classList.remove('hidden');
  }
}

$('postList').addEventListener('click', async (e) => {
  const li = e.target.closest('li');
  if (e.target.matches('[data-dismiss]')) return li.remove();
  const postBtn = e.target.closest('[data-post]');
  if (postBtn) {
    postBtn.disabled = true;
    postBtn.textContent = 'Posting…';
    const r = await api('post', { text: postBtn.dataset.post }).catch((err) => ({ error: err.message }));
    if (r?.error) {
      postBtn.disabled = false;
      postBtn.textContent = 'Retry';
      li.querySelector('.why').textContent = `⚠️ ${r.error}`;
    } else {
      postBtn.textContent = 'Posted ✓';
      li.classList.add('posted');
    }
    return;
  }
  const t = e.target.closest('[data-copy]');
  if (!t) return;
  try {
    await (backend ? backend.copy(t.dataset.copy) : navigator.clipboard.writeText(t.dataset.copy));
    t.textContent = 'Copied ✓';
    if (!canPost()) li.classList.add('posted');
  } catch {
    t.textContent = 'Copy failed';
  }
});

function renderMusic(m) {
  const st = m?.state, sum = m?.summary;
  $('listenerState').textContent = sum ? 'Listening 🎧' : NATIVE ? 'Not listening' : 'Listener not running';
  if (!st || !sum) return;
  $('mBpm').textContent = st.bpm || '–';
  $('mEnergy').textContent = sum.section === 'breakdown' ? 'breakdown' : sum.energy;
  $('mGenre').textContent = (sum.soundsLike || '–').replace(/ music$/, '');
  $('mHearing').innerHTML = sum.hearingNow.map((h) => `<span class="chip">${esc(h)}</span>`).join('');
}

$('sayList').addEventListener('click', (e) => {
  if (e.target.matches('[data-done]')) e.target.closest('li').remove();
});

const ICON = { music: '🎶', join: '👋', chat: '💬', gift: '🎁', follow: '➕', share: '🔁', likes: '❤️' };
function feedLine(f) {
  const who = f.uniqueId ? `<span class="who" data-user="${esc(f.uniqueId)}">${esc(f.nickname || f.uniqueId)}</span>` : '';
  const tag = f.regular ? `<span class="tag reg">${f.streams}× regular</span>` : f.type === 'join' ? '<span class="tag">new</span>' : '';
  let body = '';
  if (f.type === 'chat') body = `: ${esc(f.text)}`;
  else if (f.type === 'join') body = ' joined';
  else if (f.type === 'gift') body = ` sent ${esc(f.detail)}`;
  else if (f.type === 'follow') body = ' followed';
  else if (f.type === 'share') body = ' shared the live';
  else if (f.type === 'music') body = esc(f.text);
  else if (f.type === 'likes') body = `Likes: ${esc(f.text)} (total ${esc(f.detail)})`;
  return `<li class="t-${f.type}">${ICON[f.type] || ''} ${who}${tag}${body}</li>`;
}
function addFeed(f) {
  const ul = $('feed');
  ul.insertAdjacentHTML('afterbegin', feedLine(f));
  while (ul.children.length > 150) ul.lastElementChild.remove();
}

function renderRoom(list) {
  $('roomCount').textContent = list.length ? `(${list.length})` : '';
  $('room').innerHTML = list
    .map((v) => `<li class="${v.streamsAttended > 1 ? 'reg' : ''}" data-user="${esc(v.uniqueId)}">${esc(v.nickname)}${v.streamsAttended > 1 ? ` ·${v.streamsAttended}` : ''}</li>`)
    .join('');
}

function renderNowPlaying(np, history = []) {
  $('nowPlaying').textContent = np
    ? `▶ ${np.artist ? np.artist + ' – ' : ''}${np.title}${np.year ? ` (${np.year})` : ''}${history.length > 1 ? ` · ${history.length} tracks so far` : ''}`
    : '';
}

function fillProfile(p) {
  const f = $('profileForm');
  for (const el of f.elements) {
    if (!el.name) continue;
    const v = p?.[el.name];
    el.value = Array.isArray(v) ? v.join(', ') : v || '';
  }
  if (!$('username').value) $('username').value = p?.tiktokUsername || '';
  setLiveLink(p?.tiktokUsername);
}

// ---------- viewer card ----------
let dlgUser = '';
async function openViewer(id) {
  dlgUser = id;
  const v = await api(`viewer/${encodeURIComponent(id)}`);
  $('vdName').textContent = `${v.nickname || id} (@${id})`;
  $('vdStats').textContent = v.uniqueId
    ? `${v.streamsAttended} streams · ${v.totalChats} chats · ${v.totalGifts} gifts · first seen ${v.firstSeen}${v.followedEver ? ' · follower' : ''}`
    : '';
  $('vdNotes').innerHTML = (v.notes || []).map((n) => `<li>${esc(n)}</li>`).join('') || '<li class="muted">No notes yet</li>';
  $('vdNote').value = '';
  $('viewerDlg').showModal();
}
document.body.addEventListener('click', (e) => {
  const u = e.target.closest('[data-user]');
  if (u) openViewer(u.dataset.user);
});
$('vdAdd').addEventListener('click', async (e) => {
  e.preventDefault();
  const note = $('vdNote').value.trim();
  if (!note) return;
  await api('viewer-note', { uniqueId: dlgUser, note });
  openViewer(dlgUser);
});

// ---------- actions ----------
$('connectForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await api('connect', { username: $('username').value.trim() });
  if (r.error) $('statusDetail').textContent = r.error;
});
$('stopBtn').addEventListener('click', () => api('disconnect', {}));

$('trackForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api('now-playing', { title: $('trackTitle').value.trim(), artist: $('trackArtist').value.trim(), year: $('trackYear').value.trim() });
  $('trackTitle').value = $('trackArtist').value = $('trackYear').value = '';
});

$('askForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('askInput').value.trim();
  if (!q) return;
  $('askInput').value = '';
  $('vibe').textContent = 'Thinking…';
  await api('ask', { question: q });
});

$('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  data.genres = data.genres.split(',').map((s) => s.trim()).filter(Boolean);
  data.catchphrases = data.catchphrases.split(',').map((s) => s.trim()).filter(Boolean);
  await api('profile', data, 'PUT');
  e.target.closest('details').open = false;
});

function setLiveLink(u) {
  const name = String(u || $('username').value || '').replace(/^@/, '');
  $('openLive').href = name ? `https://www.tiktok.com/@${encodeURIComponent(name)}/live` : '#';
}
$('username').addEventListener('input', () => setLiveLink());
$('openLive').addEventListener('click', (e) => {
  e.preventDefault();
  if (backend?.tiktok) return backend.tiktok.show();
  if (!$('openLive').href.endsWith('#')) window.open($('openLive').href, '_blank', 'noopener');
});

// ---------- live updates ----------
function onMessage(type, payload) {
  if (type === 'status') { state.session.status = payload.status; renderStatus(payload.status, payload.detail); }
  if (type === 'viewers') { state.session.viewerCount = payload.viewerCount; renderCounts(); }
  if (type === 'feed') { if (payload.type === 'chat') state.session.counts.chats += 1; addFeed(payload); renderCounts(); }
  if (type === 'room') renderRoom(payload);
  if (type === 'suggestions') renderSuggestions(payload);
  if (type === 'nowPlaying') renderNowPlaying(payload.nowPlaying, payload.trackHistory);
  if (type === 'reset') applyState({ ...payload, features: state?.features, music: state?.music });
  if (type === 'music') renderMusic(payload);
  if (type === 'transcript') $('micLine').textContent = `🎙️ “${payload.text}”`;
  if (type === 'speechPartial') $('micLine').textContent = `🎙️ “${payload.text}…”`;
  if (type === 'speechError') $('micLine').textContent = `🎙️ ${payload.error}`;
  if (type === 'report') { $('reportText').textContent = payload.summary; $('reportDlg').showModal(); }
  if (type === 'sourceInfo') onSourceInfo(payload);
}

let ws;
function connectWs() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?pin=${encodeURIComponent(pin)}`);
  ws.onmessage = (m) => {
    const { type, payload } = JSON.parse(m.data);
    onMessage(type, payload);
  };
  const me = ws;
  ws.onclose = (e) => { if (e.code === 4001) askPin(); else if (me === ws) setTimeout(connectWs, 2000); };
}

function applyState(s) {
  state = s;
  renderStatus(s.session.status, s.session.statusDetail);
  renderCounts();
  $('feed').innerHTML = '';
  s.feed.forEach(addFeed);
  renderRoom(s.inRoom);
  renderNowPlaying(s.nowPlaying, s.trackHistory);
  emptyPosts();
  if (s.suggestions?.chat_posts?.length || s.suggestions?.say_now?.length) renderSuggestions(s.suggestions);
  if (s.music) renderMusic(s.music);
}

async function boot() {
  if (NATIVE && !backend) {
    const mod = await import('./native/backend.js');
    backend = await mod.createNativeBackend();
    setupApp(backend);
  }
  const s = await api('state');
  applyState(s);
  fillProfile(s.profile);
  const f = s.features;
  $('features').textContent = [
    f.listener || NATIVE ? '' : 'Open /listen.html on the streaming computer to hear the music',
    f.claude ? 'AI suggestions on' : NATIVE ? 'AI off: add your Claude API key in App settings' : 'AI off: add ANTHROPIC_API_KEY for smart suggestions',
    f.demo ? 'DEMO MODE' : '',
    f.brainError ? `Last AI error: ${f.brainError}` : '',
  ].filter(Boolean).join(' · ');
  if (backend) backend.subscribe(onMessage);
  else connectWs();
}
boot().catch((err) => {
  console.error(err);
  $('features').textContent = `Couldn't start: ${err.message}`;
});

// ---------- phone app only ----------
function onSourceInfo(info) {
  if (info.type === 'state') {
    const bits = [];
    bits.push(info.loggedIn ? '✅ Logged in' : '🔑 Not logged in: tap Log in to TikTok');
    if (info.isLivePage) bits.push(info.input ? '✅ Chat box found' : '⚠️ Chat box not found');
    $('tiktokState').textContent = bits.join(' · ');
  }
  if (info.type === 'calibrated') {
    $('appMsg').textContent = info.editable ? '✅ Got it, the chat box is saved.' : '⚠️ That didn\'t look like a text box. Try again and tap right where you type.';
  }
  if (info.type === 'debug') {
    const text = JSON.stringify(info.data, null, 1);
    backend.copy(text).catch(() => {});
    $('reportText').textContent = `Debug info (copied to clipboard, so you can paste it to whoever is fixing the app):\n\n${text}`;
    $('reportDlg').showModal();
  }
}

function setupApp(b) {
  document.body.classList.add('native');
  for (const id of ['appBar', 'appListen', 'appSettingsCard']) $(id).classList.remove('hidden');
  $('listenLink').classList.add('hidden');

  const s = b.settings;
  $('setKey').value = s.apiKey || '';
  $('setEffort').value = s.effort || 'high';
  $('setDemo').checked = Boolean(s.demo);
  $('appSettings').addEventListener('submit', (e) => {
    e.preventDefault();
    b.saveSettings({ apiKey: $('setKey').value.trim(), effort: $('setEffort').value, demo: $('setDemo').checked });
  });

  const tt = b.tiktok;
  const needTikTok = (fn) => async () => {
    if (!tt) { $('appMsg').textContent = 'Turn off demo mode in App settings to use TikTok.'; return; }
    try { await fn(); } catch (err) { $('appMsg').textContent = err.message; }
  };
  $('loginBtn').addEventListener('click', needTikTok(() => tt.login()));
  $('showBtn').addEventListener('click', needTikTok(() => tt.show()));
  $('teachBtn').addEventListener('click', needTikTok(async () => {
    $('appMsg').textContent = 'Tap the chat box on the TikTok page…';
    await tt.calibrate();
  }));
  $('logoutBtn').addEventListener('click', needTikTok(async () => { await tt.logout(); $('appMsg').textContent = 'Logged out of TikTok.'; }));
  $('debugBtn').addEventListener('click', needTikTok(() => tt.debug()));
  $('reportsBtn').addEventListener('click', () => {
    const list = b.reports().slice().reverse();
    $('reportText').textContent = list.length
      ? list.map((r) => `${new Date(r.at).toLocaleString()}\n${r.summary}`).join('\n\n———\n\n')
      : 'No stream reports yet.';
    $('reportDlg').showModal();
  });

  $('listenBtn').addEventListener('click', async () => {
    const btn = $('listenBtn');
    if (b.listening) {
      b.stopListening();
      btn.textContent = '🎧 Start listening';
      btn.classList.remove('on');
      return;
    }
    btn.disabled = true;
    btn.textContent = '🎧 Loading…';
    try {
      await b.startListening();
      btn.textContent = '🎧 Listening (tap to stop)';
      btn.classList.add('on');
    } catch (err) {
      btn.textContent = '🎧 Start listening';
      $('micLine').textContent = `Couldn't listen: ${err.message}`;
    } finally {
      btn.disabled = false;
    }
  });
  $('voiceBtn').addEventListener('click', async () => {
    const btn = $('voiceBtn');
    if (b.speechOn) {
      await b.stopSpeech();
      btn.textContent = '🎙️ Hear my voice';
      btn.classList.remove('on');
      return;
    }
    try {
      await b.startSpeech();
      btn.textContent = '🎙️ Hearing you (tap to stop)';
      btn.classList.add('on');
    } catch (err) {
      $('micLine').textContent = `🎙️ ${err.message}`;
    }
  });
}

// Keep the screen awake in a normal browser too (the app does this natively).
let wakeLock = null;
async function keepAwake() {
  try { if (!NATIVE && 'wakeLock' in navigator && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen'); } catch { /* not allowed */ }
}
document.addEventListener('visibilitychange', keepAwake);
document.addEventListener('click', () => { if (!wakeLock) keepAwake(); }, { once: true });
