// Listener (computer version): analyses the DJ mix on-device and transcribes the DJ's mic.
// Only small numbers and text are sent to the co-pilot server, never audio.
import { MusicAnalyser, SHOW, EMOJI } from './audio.js';

const $ = (id) => document.getElementById(id);
let pin = '';
try { pin = localStorage.getItem('copilot.pin') || ''; } catch { /* private mode */ }

async function post(path, body) {
  const res = await fetch(`api/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-pin': pin }, body: JSON.stringify(body) });
  if (res.status === 401) {
    pin = prompt('Dashboard PIN') || '';
    try { localStorage.setItem('copilot.pin', pin); } catch { /* ignore */ }
  }
}

$('dashUrl').textContent = location.hostname === 'localhost' ? `http://<this computer's IP>:${location.port || 80}` : location.origin;
$('instBars').innerHTML = SHOW.map((k) => `<div class="bar-row"><span>${EMOJI[k]} ${k}</span><div class="bar"><i id="b-${k}"></i></div></div>`).join('');

const analyser = new MusicAnalyser((f, send) => {
  render(f);
  if (send) post('music', f).catch(() => {});
});

async function listDevices() {
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  const sel = $('device');
  const keep = sel.value;
  sel.innerHTML = '<option value="">Default input</option>' + devs.map((d) => `<option value="${d.deviceId}">${d.label || 'Input'}</option>`).join('');
  sel.value = keep;
}
listDevices().catch(() => {});

$('musicBtn').addEventListener('click', async () => {
  const btn = $('musicBtn');
  if (analyser.running) {
    analyser.stop();
    $('pill').className = 'pill idle';
    $('pill').textContent = 'off';
    btn.textContent = 'Start listening';
    $('musicStatus').textContent = 'Stopped';
    return;
  }
  btn.disabled = true;
  try {
    $('musicStatus').textContent = 'Loading sound model…';
    const label = await analyser.start({ deviceId: $('device').value });
    await listDevices();
    $('pill').className = 'pill live';
    $('pill').textContent = 'listening';
    $('musicStatus').textContent = `Listening to: ${label}`;
    btn.textContent = 'Stop';
  } catch (err) {
    $('musicStatus').textContent = `Couldn't start: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
});

function render(f) {
  $('bpm').textContent = f.bpm ? Math.round(f.bpm) : '–';
  $('genre').textContent = f.silent ? 'silence' : (f.genre.name || 'music').replace(/ music$/, '');
  $('mood').textContent = f.mood ? f.mood.replace(/ music$/, '').toLowerCase() : 'sound';
  $('section').textContent = f.energyRel < 0.55 ? 'breakdown' : f.energyRel > 1.2 ? 'lifting' : 'groove';
  $('energyBar').style.width = `${Math.round(f.energy * 100)}%`;
  $('bassBar').style.width = `${Math.round(f.bass * 100)}%`;
  for (const k of SHOW) $(`b-${k}`).style.width = `${Math.round((f.instruments[k] || 0) * 100)}%`;
}

// ---------- speech ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, speechOn = false;
$('speechBtn').addEventListener('click', () => (speechOn ? stopSpeech() : startSpeech()));
function startSpeech() {
  if (!SR) { $('speechLine').textContent = 'This browser has no speech recognition. Use Chrome or Edge.'; return; }
  rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-GB';
  rec.onresult = (ev) => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) { post('transcript', { text: r[0].transcript }).catch(() => {}); $('speechLine').textContent = `“${r[0].transcript}”`; }
      else interim += r[0].transcript;
    }
    if (interim) $('speechLine').textContent = `“${interim}…”`;
  };
  rec.onerror = (ev) => { if (ev.error !== 'no-speech') $('speechLine').textContent = `Mic: ${ev.error}`; };
  rec.onend = () => { if (speechOn) setTimeout(() => { try { rec.start(); } catch { /* already running */ } }, 250); };
  rec.start();
  speechOn = true;
  $('speechBtn').classList.add('on');
  $('speechBtn').textContent = '🎙️ Transcribing… (tap to stop)';
}
function stopSpeech() {
  speechOn = false;
  rec?.stop();
  $('speechBtn').classList.remove('on');
  $('speechBtn').textContent = '🎙️ Transcribe my mic';
}
