// Listener: runs on the streaming computer. Analyses the DJ mix on-device
// (tempo, energy, bass, breakdowns, instruments, vocals, genre) and transcribes the DJ's mic.
// Only small numbers and text are sent to the co-pilot server, never audio.
import { FilesetResolver, AudioClassifier } from './vendor/mediapipe/audio_bundle.mjs';

const $ = (id) => document.getElementById(id);
let pin = '', base = '';
try { pin = localStorage.getItem('copilot.pin') || ''; base = (localStorage.getItem('copilot.server') || '').replace(/\/+$/, ''); } catch { /* private mode */ }
const NATIVE = Boolean(window.Capacitor?.isNativePlatform?.());

async function post(path, body) {
  const res = await fetch(base ? `${base}/api/${path}` : `api/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-pin': pin }, body: JSON.stringify(body) });
  if (res.status === 401) {
    pin = prompt('Dashboard PIN') || '';
    try { localStorage.setItem('copilot.pin', pin); } catch { /* ignore */ }
  }
}

if (NATIVE) $('dashHint').classList.add('hidden');
else $('dashUrl').textContent = location.hostname === 'localhost' ? `http://<this computer's IP>:${location.port || 80}` : location.origin;

// ---------- sound classes (Google YAMNet / AudioSet labels) ----------
const GROUPS = {
  piano: ['Piano', 'Electric piano'],
  vocals: ['Singing', 'Male singing', 'Female singing', 'Choir', 'Rapping', 'Vocal music', 'A capella'],
  guitar: ['Guitar', 'Electric guitar', 'Acoustic guitar', 'Strum', 'Steel guitar, slide guitar'],
  strings: ['String section', 'Violin, fiddle', 'Bowed string instrument', 'Cello', 'Orchestra'],
  brass: ['Brass instrument', 'Trumpet', 'Saxophone', 'Trombone'],
  synth: ['Synthesizer', 'Sampler'],
  drums: ['Drum machine', 'Drum kit', 'Drum', 'Bass drum'],
  speech: ['Speech', 'Male speech, man speaking', 'Female speech, woman speaking', 'Narration, monologue'],
  crowd: ['Cheering', 'Applause', 'Crowd'],
};
const GENRES = ['House music', 'Techno', 'Dubstep', 'Drum and bass', 'Electronica', 'Electronic dance music', 'Trance music',
  'Hip hop music', 'Pop music', 'Rock music', 'Rhythm and blues', 'Soul music', 'Reggae', 'Funk', 'Disco', 'Jazz',
  'Afrobeat', 'Music of Latin America', 'Ambient music', 'Gospel music', 'Rock and roll', 'Electronic music'];
const MOODS = ['Happy music', 'Sad music', 'Tender music', 'Exciting music', 'Angry music'];
const SHOW = ['piano', 'vocals', 'guitar', 'synth', 'drums', 'strings', 'brass', 'crowd'];
const EMOJI = { piano: '🎹', vocals: '🎤', guitar: '🎸', synth: '🎛️', drums: '🥁', strings: '🎻', brass: '🎷', crowd: '📣' };

$('instBars').innerHTML = SHOW.map((k) => `<div class="bar-row"><span>${EMOJI[k]} ${k}</span><div class="bar"><i id="b-${k}"></i></div></div>`).join('');

// ---------- audio capture ----------
let ctx, ring, ringPos = 0, filled = 0, sr = 48000, classifier = null, timer = null, stream = null;
const smooth = {}; const genreSmooth = {}; const moodSmooth = {};
let longRms = 0, bpmHistory = [], sendCount = 0;

async function listDevices() {
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  const sel = $('device');
  const keep = sel.value;
  sel.innerHTML = '<option value="">Default input</option>' + devs.map((d) => `<option value="${d.deviceId}">${d.label || 'Input'}</option>`).join('');
  sel.value = keep;
}
listDevices().catch(() => {});

$('musicBtn').addEventListener('click', () => (timer ? stopMusic() : startMusic()));

async function startMusic() {
  const btn = $('musicBtn');
  btn.disabled = true;
  try {
    $('musicStatus').textContent = 'Loading sound model…';
    if (!classifier) {
      const fileset = await FilesetResolver.forAudioTasks(new URL('vendor/mediapipe/wasm', location.href).href);
      classifier = await AudioClassifier.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: new URL('models/yamnet.tflite', location.href).href },
        maxResults: 40,
        scoreThreshold: 0.02,
      });
    }
    const deviceId = $('device').value;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    await listDevices();
    ctx = new AudioContext();
    sr = ctx.sampleRate;
    ring = new Float32Array(sr * 10);
    const code = `class Tap extends AudioWorkletProcessor {
      constructor(){super();this.buf=new Float32Array(4096);this.n=0;}
      process(inputs){const ch=inputs[0]&&inputs[0][0];if(ch){for(let i=0;i<ch.length;i++){this.buf[this.n++]=ch[i];if(this.n===this.buf.length){this.port.postMessage(this.buf.slice(0));this.n=0;}}}return true;}
    } registerProcessor('tap', Tap);`;
    await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'application/javascript' })));
    const src = ctx.createMediaStreamSource(stream);
    const tap = new AudioWorkletNode(ctx, 'tap');
    tap.port.onmessage = (e) => push(e.data);
    src.connect(tap);
    timer = setInterval(analyse, 1000);
    $('pill').className = 'pill live';
    $('pill').textContent = 'listening';
    $('musicStatus').textContent = `Listening to: ${stream.getAudioTracks()[0]?.label || 'input'}`;
    btn.textContent = 'Stop';
  } catch (err) {
    $('musicStatus').textContent = `Couldn't start: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

function stopMusic() {
  clearInterval(timer);
  timer = null;
  stream?.getTracks().forEach((t) => t.stop());
  ctx?.close();
  $('pill').className = 'pill idle';
  $('pill').textContent = 'off';
  $('musicBtn').textContent = 'Start listening';
  $('musicStatus').textContent = 'Stopped';
}

function push(chunk) {
  for (let i = 0; i < chunk.length; i++) {
    ring[ringPos] = chunk[i];
    ringPos = (ringPos + 1) % ring.length;
  }
  filled = Math.min(ring.length, filled + chunk.length);
}

function last(n) {
  n = Math.min(n, filled);
  const out = new Float32Array(n);
  let start = (ringPos - n + ring.length) % ring.length;
  for (let i = 0; i < n; i++) out[i] = ring[(start + i) % ring.length];
  return out;
}

// One-pole low-pass, to look at the kick/bass.
function lowpass(x, cutoff) {
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / sr);
  const y = new Float32Array(x.length);
  let v = 0;
  for (let i = 0; i < x.length; i++) { v += a * (x[i] - v); y[i] = v; }
  return y;
}

const rms = (x) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, x.length)); };

// Tempo from the autocorrelation of the bass onset envelope.
function estimateBpm(x) {
  const low = lowpass(x, 180);
  const hop = 512;
  const frames = Math.floor(low.length / hop);
  if (frames < 200) return 0;
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) e += low[i] * low[i];
    env[f] = Math.log(1e-9 + e);
  }
  const onset = new Float32Array(frames);
  let mean = 0;
  for (let f = 1; f < frames; f++) { onset[f] = Math.max(0, env[f] - env[f - 1]); mean += onset[f]; }
  mean /= frames;
  for (let f = 0; f < frames; f++) onset[f] -= mean;
  const fps = sr / hop;
  const ac = (lag) => { let s = 0; for (let f = 0; f + lag < frames; f++) s += onset[f] * onset[f + lag]; return s; };
  const zero = ac(0) || 1;
  let best = 0, bestScore = -Infinity, bestLag = 0;
  const minLag = Math.floor((60 * fps) / 180), maxLag = Math.ceil((60 * fps) / 70);
  const scores = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * fps) / lag;
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 122) / 0.6) ** 2); // dance music lives around 120-130
    const s = (ac(lag) / zero) * prior;
    scores[lag] = s;
    if (s > bestScore) { bestScore = s; bestLag = lag; }
  }
  if (bestScore < 0.05) return 0; // no clear beat
  const l = scores[bestLag - 1] ?? bestScore, r = scores[bestLag + 1] ?? bestScore;
  const shift = (l - r) / (2 * (l - 2 * bestScore + r) || 1);
  best = (60 * fps) / (bestLag + (Number.isFinite(shift) ? Math.max(-0.5, Math.min(0.5, shift)) : 0));
  return best;
}

function ema(store, key, value, a = 0.45) {
  store[key] = store[key] === undefined ? value : store[key] + a * (value - store[key]);
  return store[key];
}

function analyse() {
  if (filled < sr * 2) return;
  const oneSec = last(sr);
  const level = rms(oneSec);
  const db = 20 * Math.log10(level + 1e-9);
  const silent = db < -55;
  longRms = longRms ? longRms + (level - longRms) / 30 : level;
  const bassLevel = rms(lowpass(oneSec, 150));

  // Sound classes
  const scores = {};
  try {
    const results = classifier.classify(last(sr * 2), sr);
    for (const r of results) {
      for (const c of r.classifications?.[0]?.categories || []) {
        scores[c.categoryName] = Math.max(scores[c.categoryName] || 0, c.score);
      }
    }
  } catch (err) {
    console.warn('classify failed', err);
  }
  const instruments = {};
  for (const [k, names] of Object.entries(GROUPS)) {
    instruments[k] = ema(smooth, k, Math.max(0, ...names.map((n) => scores[n] || 0)));
  }
  for (const g of GENRES) ema(genreSmooth, g, scores[g] || 0, 0.25);
  for (const m of MOODS) ema(moodSmooth, m, scores[m] || 0, 0.25);
  const genre = Object.entries(genreSmooth).sort((a, b) => b[1] - a[1])[0] || ['', 0];
  const mood = Object.entries(moodSmooth).sort((a, b) => b[1] - a[1])[0] || ['', 0];

  // Tempo every 2s over the last 8s
  sendCount += 1;
  if (sendCount % 2 === 0) {
    const b = silent ? 0 : estimateBpm(last(sr * 8));
    if (b) bpmHistory = [...bpmHistory.slice(-4), b];
  }
  const bpm = bpmHistory.length ? [...bpmHistory].sort((a, b) => a - b)[Math.floor(bpmHistory.length / 2)] : 0;

  const features = {
    bpm,
    energy: Math.max(0, Math.min(1, (db + 50) / 45)),
    energyRel: longRms ? level / longRms : 1,
    bass: Math.min(1, level ? (bassLevel / level) * 1.2 : 0),
    instruments,
    genre: { name: genre[1] > 0.05 ? genre[0] : '', score: genre[1] },
    mood: mood[1] > 0.05 ? mood[0] : '',
    silent,
  };
  render(features);
  if (sendCount % 2 === 0) post('music', features).catch(() => {});
}

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
  if (!SR) { $('speechLine').textContent = NATIVE ? 'Voice transcription runs on the computer: open the Listener there in Chrome.' : 'This browser has no speech recognition. Use Chrome or Edge.'; return; }
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
