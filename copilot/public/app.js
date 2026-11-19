// DJ Co-Pilot dashboard
const $ = (id) => document.getElementById(id);
// Inside the Android app the dashboard talks to the co-pilot server on your computer.
const NATIVE = Boolean(window.Capacitor?.isNativePlatform?.());
const Plugins = window.Capacitor?.Plugins || {};
let base = (localStorageGet('copilot.server') || '').replace(/\/+$/, '');
let pin = localStorageGet('copilot.pin') || '';
let state = null;

function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, body, method = body ? 'POST' : 'GET') {
  const res = await fetch(`${base}/api/${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-pin': pin },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { askPin(); throw new Error('PIN required'); }
  return res.json();
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
let postSeq = 0;
function renderSuggestions(s) {
  if (!s) return;
  // Chat posts stack up newest-first, so nothing is lost while you're pasting.
  const list = $('postList');
  if (s.chat_posts?.length) {
    list.querySelector('.empty')?.remove();
    const html = s.chat_posts
      .map((p) => `<li class="${s.source !== 'claude' ? 'quick' : ''}" data-id="${++postSeq}">
        <div class="txt">${esc(p.text)}</div>
        <div class="meta"><span>${esc(p.why)}${s.source !== 'claude' ? ' · instant' : ''}</span>
        <div><button class="x" data-dismiss>✕</button><button class="copy" data-copy="${esc(p.text)}">Copy</button></div></div></li>`)
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
  const t = e.target.closest('[data-copy]');
  if (!t) return;
  try {
    await copyText(t.dataset.copy);
    t.textContent = 'Copied ✓';
    li.classList.add('posted');
    if (NATIVE && $('jumpToggle').checked) setTimeout(openLive, 250);
  } catch {
    t.textContent = 'Copy failed';
  }
});

function renderMusic(m) {
  const st = m?.state, sum = m?.summary;
  $('listenerState').textContent = sum ? 'Listening 🎧' : 'Listener not running';
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
    : 'Set the track so your co-pilot can talk about it.';
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

// ---------- live updates ----------
let ws;
function connectWs() {
  const wsBase = base ? base.replace(/^http/, 'ws') : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
  ws = new WebSocket(`${wsBase}/ws?pin=${encodeURIComponent(pin)}`);
  ws.onmessage = (m) => {
    const { type, payload } = JSON.parse(m.data);
    if (type === 'status') { state.session.status = payload.status; renderStatus(payload.status, payload.detail); }
    if (type === 'viewers') { state.session.viewerCount = payload.viewerCount; renderCounts(); }
    if (type === 'feed') { if (payload.type === 'chat') state.session.counts.chats += 1; addFeed(payload); renderCounts(); }
    if (type === 'room') renderRoom(payload);
    if (type === 'suggestions') renderSuggestions(payload);
    if (type === 'nowPlaying') renderNowPlaying(payload.nowPlaying, payload.trackHistory);
    if (type === 'reset') applyState(payload);
    if (type === 'music') renderMusic(payload);
    if (type === 'transcript') $('micLine').textContent = `🎙️ “${payload.text}”`;
    if (type === 'report') { $('reportText').textContent = payload.summary; $('reportDlg').showModal(); }
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
  $('postList').innerHTML = '';
  if (s.suggestions?.chat_posts?.length || s.suggestions?.say_now?.length) renderSuggestions(s.suggestions);
  else $('postList').innerHTML = '<li class="empty">Chat posts appear here as people join, chat and the music moves. Tap Copy, then paste into the live chat.</li>';
  if (s.music) renderMusic(s.music);
}

async function boot() {
  if (NATIVE && !base) return showServerDialog();
  const s = await api('state');
  applyState(s);
  fillProfile(s.profile);
  const f = s.features;
  $('features').textContent = [
    f.listener ? '' : 'Open /listen.html on the streaming computer to hear the music',
    f.claude ? 'AI suggestions on' : 'AI off: add ANTHROPIC_API_KEY for smart suggestions',
    f.demo ? 'DEMO MODE' : '',
    f.brainError ? `Last AI error: ${f.brainError}` : '',
  ].filter(Boolean).join(' · ');
  connectWs();
}
boot().catch(() => { if (NATIVE) showServerDialog("Couldn't reach the co-pilot on your computer. Check the address and that it's running."); });

function setLiveLink(u) {
  const name = String(u || $('username').value || '').replace(/^@/, '');
  $('openLive').href = name ? `https://www.tiktok.com/@${encodeURIComponent(name)}/live` : '#';
}
$('username').addEventListener('input', () => setLiveLink());

async function copyText(text) {
  if (Plugins.Clipboard) return Plugins.Clipboard.write({ string: text });
  return navigator.clipboard.writeText(text);
}

// In the app, leaving for TikTok opens the TikTok app on the live.
function openLive() {
  const href = $('openLive').href;
  if (!href || href.endsWith('#')) return;
  if (NATIVE) location.href = href;
  else window.open(href, '_blank', 'noopener');
}
$('openLive').addEventListener('click', (e) => { e.preventDefault(); openLive(); });

// ---------- app: connect to the computer ----------
function showServerDialog(msg = '') {
  $('serverAddr').value = base.replace(/^http:\/\//, '');
  $('serverPin').value = pin;
  $('serverMsg').textContent = msg;
  if (!$('serverDlg').open) $('serverDlg').showModal();
}
$('serverForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  let addr = $('serverAddr').value.trim().replace(/\/+$/, '');
  if (!addr) return;
  if (!/^https?:\/\//.test(addr)) addr = `http://${addr}`;
  if (!/:\d+$/.test(addr.replace(/^https?:\/\//, '')) && addr.startsWith('http://')) addr += ':3000';
  const tryPin = $('serverPin').value.trim();
  $('serverMsg').textContent = 'Connecting…';
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${addr}/api/state`, { headers: { 'x-pin': tryPin }, signal: ctrl.signal });
    if (res.status === 401) throw new Error('Wrong PIN');
    if (!res.ok) throw new Error(`Server said ${res.status}`);
    base = addr;
    pin = tryPin;
    localStorageSet('copilot.server', base);
    localStorageSet('copilot.pin', pin);
    $('serverDlg').close();
    try { ws?.close(); } catch { /* not open */ }
    boot();
  } catch (err) {
    $('serverMsg').textContent = `Couldn't connect: ${err.name === 'AbortError' ? 'no answer (same Wi-Fi? co-pilot running?)' : err.message}`;
  }
});
$('changeServer').addEventListener('click', () => showServerDialog());
if (NATIVE) {
  $('appOnly').classList.remove('hidden');
  $('jumpToggle').checked = localStorageGet('copilot.jump') !== '0';
  $('jumpToggle').addEventListener('change', (e) => localStorageSet('copilot.jump', e.target.checked ? '1' : '0'));
  Plugins.KeepAwake?.keepAwake().catch(() => {});
}

// Keep the phone screen awake while the dashboard is open.
let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen'); } catch { /* not allowed */ }
}
document.addEventListener('visibilitychange', keepAwake);
document.addEventListener('click', () => { if (!wakeLock) keepAwake(); }, { once: true });
