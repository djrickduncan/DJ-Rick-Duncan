// DJ Co-Pilot dashboard
const $ = (id) => document.getElementById(id);
let pin = localStorageGet('copilot.pin') || '';
let state = null;

function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } }
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, body, method = body ? 'POST' : 'GET') {
  const res = await fetch(`/api/${path}`, {
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

function renderSuggestions(s) {
  const list = $('sayList');
  if (!s?.say_now?.length) {
    if (!list.children.length || list.querySelector('.empty')) return;
  } else {
    list.innerHTML = s.say_now
      .map((x) => `<li class="${x.priority === 'high' ? 'high' : ''}">${esc(x.text)}
        <div class="why"><span>${esc(x.why)}${s.source === 'templates' ? ' · quick tip' : ''}</span><button data-done>Done ✓</button></div></li>`)
      .join('');
  }
  $('vibe').textContent = s?.vibe || '';
  const fact = $('trackFact');
  fact.textContent = s?.track_fact ? `💡 ${s.track_fact}` : '';
  fact.classList.toggle('hidden', !s?.track_fact);
  if (s?.chat_replies?.length) {
    $('replyList').innerHTML = s.chat_replies
      .map((r) => `<li><span>${r.to ? `<b>@${esc(r.to)}</b> ` : ''}${esc(r.text)}</span><button data-copy="${esc((r.to ? '@' + r.to + ' ' : '') + r.text)}">Copy</button></li>`)
      .join('');
  }
  if (s?.say_now?.some((x) => x.priority === 'high') && navigator.vibrate) navigator.vibrate(60);
}

$('sayList').addEventListener('click', (e) => {
  if (e.target.matches('[data-done]')) e.target.closest('li').remove();
});
$('replyList').addEventListener('click', async (e) => {
  const t = e.target.closest('[data-copy]');
  if (!t) return;
  try { await navigator.clipboard.writeText(t.dataset.copy); t.textContent = 'Copied'; } catch { t.textContent = 'Copy failed'; }
});

const ICON = { join: '👋', chat: '💬', gift: '🎁', follow: '➕', share: '🔁', likes: '❤️' };
function feedLine(f) {
  const who = f.uniqueId ? `<span class="who" data-user="${esc(f.uniqueId)}">${esc(f.nickname || f.uniqueId)}</span>` : '';
  const tag = f.regular ? `<span class="tag reg">${f.streams}× regular</span>` : f.type === 'join' ? '<span class="tag">new</span>' : '';
  let body = '';
  if (f.type === 'chat') body = `: ${esc(f.text)}`;
  else if (f.type === 'join') body = ' joined';
  else if (f.type === 'gift') body = ` sent ${esc(f.detail)}`;
  else if (f.type === 'follow') body = ' followed';
  else if (f.type === 'share') body = ' shared the live';
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

// ---------- mic: live transcript of what YOU say (browser speech recognition) ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
let micOn = false;
$('micBtn').addEventListener('click', () => (micOn ? stopMic() : startMic()));
function startMic() {
  if (!SR) { $('micLine').textContent = 'This browser has no speech recognition. Use Chrome (Android/desktop) or Safari (iPhone).'; return; }
  rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-GB';
  rec.onresult = (ev) => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) api('transcript', { text: r[0].transcript });
      else interim += r[0].transcript;
    }
    $('micLine').textContent = interim ? `“${interim}”` : $('micLine').textContent;
  };
  rec.onerror = (ev) => { $('micLine').textContent = `Mic: ${ev.error}`; };
  rec.onend = () => { if (micOn) try { rec.start(); } catch { /* restarting */ } };
  rec.start();
  micOn = true;
  $('micBtn').classList.add('on');
  $('micBtn').textContent = '🎙️ Listening…';
}
function stopMic() {
  micOn = false;
  rec?.stop();
  $('micBtn').classList.remove('on');
  $('micBtn').textContent = '🎙️ Listen to my mic';
}

// ---------- identify track from room audio ----------
$('recogBtn').addEventListener('click', async () => {
  const btn = $('recogBtn');
  try {
    btn.disabled = true;
    btn.textContent = '🎵 Listening 8s…';
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream);
    const chunks = [];
    mr.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise((r) => (mr.onstop = r));
    mr.start();
    setTimeout(() => mr.stop(), 8000);
    await done;
    stream.getTracks().forEach((t) => t.stop());
    btn.textContent = '🎵 Matching…';
    const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
    const res = await fetch('/api/recognize', { method: 'POST', headers: { 'content-type': blob.type, 'x-pin': pin }, body: blob });
    const j = await res.json();
    $('nowPlaying').textContent = j.ok ? '' : j.error;
  } catch (err) {
    $('nowPlaying').textContent = `Couldn't listen: ${err.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = '🎵 Identify track';
  }
});

// ---------- live updates ----------
let ws;
function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws?pin=${encodeURIComponent(pin)}`);
  ws.onmessage = (m) => {
    const { type, payload } = JSON.parse(m.data);
    if (type === 'status') { state.session.status = payload.status; renderStatus(payload.status, payload.detail); }
    if (type === 'viewers') { state.session.viewerCount = payload.viewerCount; renderCounts(); }
    if (type === 'feed') { if (payload.type === 'chat') state.session.counts.chats += 1; addFeed(payload); renderCounts(); }
    if (type === 'room') renderRoom(payload);
    if (type === 'suggestions') renderSuggestions(payload);
    if (type === 'nowPlaying') renderNowPlaying(payload.nowPlaying, payload.trackHistory);
    if (type === 'reset') applyState(payload);
    if (type === 'report') { $('reportText').textContent = payload.summary; $('reportDlg').showModal(); }
  };
  ws.onclose = (e) => { if (e.code === 4001) askPin(); else setTimeout(connectWs, 2000); };
}

function applyState(s) {
  state = s;
  renderStatus(s.session.status, s.session.statusDetail);
  renderCounts();
  $('feed').innerHTML = '';
  s.feed.forEach(addFeed);
  renderRoom(s.inRoom);
  renderNowPlaying(s.nowPlaying, s.trackHistory);
  if (s.suggestions) renderSuggestions(s.suggestions);
}

async function boot() {
  const s = await api('state');
  applyState(s);
  fillProfile(s.profile);
  const f = s.features;
  $('recogBtn').classList.toggle('hidden', !f.recognition);
  $('features').textContent = [
    f.claude ? 'AI suggestions on' : 'AI off: add ANTHROPIC_API_KEY for smart suggestions',
    f.demo ? 'DEMO MODE' : '',
    f.brainError ? `Last AI error: ${f.brainError}` : '',
  ].filter(Boolean).join(' · ');
  connectWs();
}
boot().catch(() => {});
