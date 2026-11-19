// Pretend live stream: fake viewers, chat, gifts, follows and shares, so you can
// try the co-pilot without going live. Nothing touches TikTok.
import { Emitter } from './emitter.js';

const PEOPLE = [
  ['sarah_k', 'Sarah K'], ['dazzaleeds', 'Dazza'], ['raverjen90', 'Jen'], ['mikeyb', 'Mikey B'],
  ['garagegaz', 'Gaz'], ['lou.from.hull', 'Louise'], ['tommo_88', 'Tommo'], ['bex_dances', 'Bex'],
];
const LINES = [
  'evening rick!!', 'this takes me back 😭', 'can you play some garage?', 'tuning in from Leeds',
  'first time here, loving it', 'where are you playing next?', 'TUNE 🔥🔥', 'my mum used to play this in the car',
  'what year was this?', 'shout out to Sheffield!',
];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class DemoSource extends Emitter {
  constructor() {
    super();
    this.canPost = true; // pretend posting so the Post button can be tried
  }

  async connect(username) {
    await this.disconnect();
    let viewers = 3;
    this.emit('status', 'live', `DEMO MODE: pretending @${username} is live`);
    this.timer = setInterval(() => {
      const [uniqueId, nickname] = pick(PEOPLE);
      const r = Math.random();
      if (r < 0.25) { viewers += 1; this.emit('event', { type: 'join', uniqueId, nickname }); }
      else if (r < 0.7) this.emit('event', { type: 'chat', uniqueId, nickname, text: pick(LINES) });
      else if (r < 0.78) this.emit('event', { type: 'follow', uniqueId, nickname });
      else if (r < 0.84) this.emit('event', { type: 'share', uniqueId, nickname });
      else if (r < 0.9) this.emit('event', { type: 'gift', uniqueId, nickname, detail: pick(['Rose', '5x Rose', 'Finger Heart', 'Galaxy']) });
      else this.emit('event', { type: 'like', uniqueId, nickname, count: 15, total: 0 });
      this.emit('viewers', viewers);
    }, 4000 + Math.random() * 3000);
  }

  async post(text) {
    await new Promise((r) => setTimeout(r, 400));
    return { ok: true, demo: true, text };
  }

  async disconnect() {
    clearInterval(this.timer);
  }
}
