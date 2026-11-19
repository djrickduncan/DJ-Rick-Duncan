// Turns the Listener's audio features into "moments" worth reacting to:
// piano break, vocals coming in, breakdown, drop, tempo/genre change, crowd noise.
import { Emitter } from './emitter.js';

const INSTRUMENTS = {
  piano: { label: 'Piano', emoji: '🎹', on: 0.3, off: 0.12 },
  vocals: { label: 'Vocals', emoji: '🎤', on: 0.35, off: 0.12 },
  guitar: { label: 'Guitar', emoji: '🎸', on: 0.3, off: 0.12 },
  strings: { label: 'Strings', emoji: '🎻', on: 0.3, off: 0.1 },
  brass: { label: 'Horns/sax', emoji: '🎷', on: 0.3, off: 0.1 },
  crowd: { label: 'Crowd noise', emoji: '📣', on: 0.3, off: 0.1 },
};
const COOLDOWN_MS = 45000;

export class MusicTracker extends Emitter {
  constructor() {
    super();
    this.state = null; // latest features
    this.active = {}; // instrument -> bool
    this.lastFired = {}; // kind -> ts
    this.section = 'normal'; // normal | breakdown
    this.lowCount = 0;
    this.stableBpm = 0;
    this.bpmDrift = 0;
    this.genre = '';
    this.genreCandidate = '';
    this.genreCount = 0;
    this.moments = [];
    this.lastUpdate = 0;
  }

  get connected() {
    return Date.now() - this.lastUpdate < 15000;
  }

  fire(kind, text, urgent = false) {
    const now = Date.now();
    if (now - (this.lastFired[kind] || 0) < COOLDOWN_MS) return;
    this.lastFired[kind] = now;
    const m = { kind, text, ts: now };
    this.moments.push(m);
    if (this.moments.length > 20) this.moments.shift();
    this.emit('moment', m, urgent);
  }

  update(f) {
    this.lastUpdate = Date.now();
    const clean = {
      bpm: Math.round(Number(f.bpm) || 0),
      energy: clamp(Number(f.energy) || 0),
      energyRel: Number(f.energyRel) || 1,
      bass: clamp(Number(f.bass) || 0),
      instruments: {},
      genre: String(f.genre?.name || '').slice(0, 40),
      genreScore: clamp(Number(f.genre?.score) || 0),
      mood: String(f.mood || '').slice(0, 30),
      silent: Boolean(f.silent),
    };
    for (const k of [...Object.keys(INSTRUMENTS), 'synth', 'drums', 'speech']) {
      clean.instruments[k] = clamp(Number(f.instruments?.[k]) || 0);
    }
    this.state = clean;
    if (clean.silent) return clean;

    // Instruments coming in
    for (const [k, cfg] of Object.entries(INSTRUMENTS)) {
      const s = clean.instruments[k];
      if (!this.active[k] && s >= cfg.on) {
        this.active[k] = true;
        const hint = k === 'piano' ? 'piano break, classic hands-in-the-air moment' : k === 'vocals' ? 'vocals just came in' : k === 'crowd' ? 'crowd noise / cheering' : `${cfg.label.toLowerCase()} just came in`;
        this.fire(`${k}_in`, `${cfg.emoji} ${hint}`, k === 'piano' || k === 'vocals');
      } else if (this.active[k] && s <= cfg.off) {
        this.active[k] = false;
      }
    }

    // Breakdown -> drop
    if (clean.energyRel < 0.55) {
      this.lowCount += 1;
      if (this.lowCount >= 2 && this.section !== 'breakdown') {
        this.section = 'breakdown';
        this.fire('breakdown', '🌊 breakdown, energy has dropped right down (build anticipation)');
      }
    } else {
      this.lowCount = 0;
      if (this.section === 'breakdown' && clean.energyRel > 1.15 && clean.bass > 0.3) {
        this.section = 'normal';
        this.fire('drop', '💥 the drop just hit, bass is back in', true);
      } else if (this.section === 'breakdown' && clean.energyRel > 0.9) {
        this.section = 'normal';
      }
    }

    // Tempo change usually means a new track / mix
    if (clean.bpm >= 60) {
      if (!this.stableBpm) this.stableBpm = clean.bpm;
      else if (Math.abs(clean.bpm - this.stableBpm) > 6) {
        this.bpmDrift += 1;
        if (this.bpmDrift >= 3) {
          const from = this.stableBpm;
          this.stableBpm = clean.bpm;
          this.bpmDrift = 0;
          this.fire('tempo_change', `⏱️ tempo moved from ~${from} to ~${clean.bpm} BPM (probably a new track)`);
        }
      } else this.bpmDrift = 0;
    }

    // Genre / vibe change
    if (clean.genre && clean.genreScore > 0.15) {
      if (clean.genre === this.genreCandidate) this.genreCount += 1;
      else { this.genreCandidate = clean.genre; this.genreCount = 1; }
      if (this.genreCount >= 4 && clean.genre !== this.genre) {
        const first = !this.genre;
        this.genre = clean.genre;
        if (!first) this.fire('genre_change', `🎶 sound has shifted to ${clean.genre}`);
      }
    }
    return clean;
  }

  // Compact description for the AI
  summary() {
    if (!this.state || !this.connected) return null;
    const s = this.state;
    const now = Date.now();
    const playing = Object.entries(s.instruments)
      .filter(([k, v]) => v >= 0.2 && k !== 'speech')
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);
    return {
      bpm: s.bpm || null,
      energy: s.energy > 0.7 ? 'high' : s.energy > 0.4 ? 'medium' : 'low',
      section: this.section,
      bassHeavy: s.bass > 0.45,
      hearingNow: playing,
      djTalkingOverMusic: s.instruments.speech > 0.4,
      soundsLike: this.genre || s.genre || '',
      mood: s.mood,
      recentMusicMoments: this.moments
        .filter((m) => now - m.ts < 120000)
        .map((m) => `${Math.round((now - m.ts) / 1000)}s ago: ${m.text}`),
    };
  }

  // Demo mode: fake a track with a breakdown, piano break and drop.
  startDemo() {
    let t = 0;
    clearInterval(this.demoTimer);
    this.demoTimer = setInterval(() => {
      t = (t + 2) % 120;
      const breakdown = t >= 40 && t < 56;
      const piano = t >= 44 && t < 62;
      const vocals = t >= 70 && t < 100;
      this.update({
        bpm: t < 100 ? 126 : 132,
        energy: breakdown ? 0.3 : 0.8,
        energyRel: breakdown ? 0.4 : t >= 56 && t < 60 ? 1.4 : 1,
        bass: breakdown ? 0.1 : 0.6,
        instruments: { piano: piano ? 0.6 : 0.02, vocals: vocals ? 0.7 : 0.05, synth: 0.4, drums: breakdown ? 0.05 : 0.7 },
        genre: { name: 'House music', score: 0.4 },
        mood: 'Happy music',
      });
      this.emit('state', this.state);
    }, 2000);
  }
}

function clamp(n) {
  return Math.max(0, Math.min(1, n));
}
