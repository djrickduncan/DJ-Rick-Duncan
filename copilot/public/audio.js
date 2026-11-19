// On-device music analysis: tempo, energy, bass, breakdowns, instruments, vocals, genre and mood.
// Used by the computer Listener page and by the phone app. Audio never leaves the device.
import { FilesetResolver, AudioClassifier } from './vendor/mediapipe/audio_bundle.mjs';

// Sound classes from Google's YAMNet (AudioSet labels)
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
export const SHOW = ['piano', 'vocals', 'guitar', 'synth', 'drums', 'strings', 'brass', 'crowd'];
export const EMOJI = { piano: '🎹', vocals: '🎤', guitar: '🎸', synth: '🎛️', drums: '🥁', strings: '🎻', brass: '🎷', crowd: '📣' };

const rms = (x) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, x.length)); };

export class MusicAnalyser {
  /** @param {(features: object) => void} onFeatures called every second; `send` is true every 2s */
  constructor(onFeatures) {
    this.onFeatures = onFeatures;
    this.classifier = null;
    this.timer = null;
  }

  get running() {
    return Boolean(this.timer);
  }

  async start({ deviceId = '' } = {}) {
    if (!this.classifier) {
      const fileset = await FilesetResolver.forAudioTasks(new URL('vendor/mediapipe/wasm', location.href).href);
      this.classifier = await AudioClassifier.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: new URL('models/yamnet.tflite', location.href).href },
        maxResults: 40,
        scoreThreshold: 0.02,
      });
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.ctx = new AudioContext();
    this.sr = this.ctx.sampleRate;
    this.ring = new Float32Array(this.sr * 10);
    this.ringPos = 0;
    this.filled = 0;
    this.smooth = {};
    this.genreSmooth = {};
    this.moodSmooth = {};
    this.longRms = 0;
    this.bpmHistory = [];
    this.tick = 0;
    const code = `class Tap extends AudioWorkletProcessor {
      constructor(){super();this.buf=new Float32Array(4096);this.n=0;}
      process(inputs){const ch=inputs[0]&&inputs[0][0];if(ch){for(let i=0;i<ch.length;i++){this.buf[this.n++]=ch[i];if(this.n===this.buf.length){this.port.postMessage(this.buf.slice(0));this.n=0;}}}return true;}
    } registerProcessor('tap', Tap);`;
    await this.ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code], { type: 'application/javascript' })));
    const src = this.ctx.createMediaStreamSource(this.stream);
    const tap = new AudioWorkletNode(this.ctx, 'tap');
    tap.port.onmessage = (e) => this._push(e.data);
    src.connect(tap);
    this.timer = setInterval(() => this._analyse(), 1000);
    return this.stream.getAudioTracks()[0]?.label || 'microphone';
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
  }

  _push(chunk) {
    const { ring } = this;
    for (let i = 0; i < chunk.length; i++) {
      ring[this.ringPos] = chunk[i];
      this.ringPos = (this.ringPos + 1) % ring.length;
    }
    this.filled = Math.min(ring.length, this.filled + chunk.length);
  }

  _last(n) {
    n = Math.min(n, this.filled);
    const out = new Float32Array(n);
    const start = (this.ringPos - n + this.ring.length) % this.ring.length;
    for (let i = 0; i < n; i++) out[i] = this.ring[(start + i) % this.ring.length];
    return out;
  }

  // One-pole low-pass, to look at the kick/bass.
  _lowpass(x, cutoff) {
    const a = 1 - Math.exp((-2 * Math.PI * cutoff) / this.sr);
    const y = new Float32Array(x.length);
    let v = 0;
    for (let i = 0; i < x.length; i++) { v += a * (x[i] - v); y[i] = v; }
    return y;
  }

  // Tempo from the autocorrelation of the bass onset envelope.
  _estimateBpm(x) {
    const low = this._lowpass(x, 180);
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
    const fps = this.sr / hop;
    const ac = (lag) => { let s = 0; for (let f = 0; f + lag < frames; f++) s += onset[f] * onset[f + lag]; return s; };
    const zero = ac(0) || 1;
    let bestScore = -Infinity, bestLag = 0;
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
    return (60 * fps) / (bestLag + (Number.isFinite(shift) ? Math.max(-0.5, Math.min(0.5, shift)) : 0));
  }

  _ema(store, key, value, a = 0.45) {
    store[key] = store[key] === undefined ? value : store[key] + a * (value - store[key]);
    return store[key];
  }

  _analyse() {
    const { sr } = this;
    if (this.filled < sr * 2) return;
    const oneSec = this._last(sr);
    const level = rms(oneSec);
    const db = 20 * Math.log10(level + 1e-9);
    const silent = db < -55;
    this.longRms = this.longRms ? this.longRms + (level - this.longRms) / 30 : level;
    const bassLevel = rms(this._lowpass(oneSec, 150));

    const scores = {};
    try {
      for (const r of this.classifier.classify(this._last(sr * 2), sr)) {
        for (const c of r.classifications?.[0]?.categories || []) {
          scores[c.categoryName] = Math.max(scores[c.categoryName] || 0, c.score);
        }
      }
    } catch (err) {
      console.warn('classify failed', err);
    }
    const instruments = {};
    for (const [k, names] of Object.entries(GROUPS)) {
      instruments[k] = this._ema(this.smooth, k, Math.max(0, ...names.map((n) => scores[n] || 0)));
    }
    for (const g of GENRES) this._ema(this.genreSmooth, g, scores[g] || 0, 0.25);
    for (const m of MOODS) this._ema(this.moodSmooth, m, scores[m] || 0, 0.25);
    const genre = Object.entries(this.genreSmooth).sort((a, b) => b[1] - a[1])[0] || ['', 0];
    const mood = Object.entries(this.moodSmooth).sort((a, b) => b[1] - a[1])[0] || ['', 0];

    this.tick += 1;
    const send = this.tick % 2 === 0;
    if (send) {
      const b = silent ? 0 : this._estimateBpm(this._last(sr * 8));
      if (b) this.bpmHistory = [...this.bpmHistory.slice(-4), b];
    }
    const bpm = this.bpmHistory.length ? [...this.bpmHistory].sort((a, b) => a - b)[Math.floor(this.bpmHistory.length / 2)] : 0;

    this.onFeatures({
      bpm,
      energy: Math.max(0, Math.min(1, (db + 50) / 45)),
      energyRel: this.longRms ? level / this.longRms : 1,
      bass: Math.min(1, level ? (bassLevel / level) * 1.2 : 0),
      instruments,
      genre: { name: genre[1] > 0.05 ? genre[0] : '', score: genre[1] },
      mood: mood[1] > 0.05 ? mood[0] : '',
      silent,
    }, send);
  }
}
