# 🎧 DJ Co-Pilot

An engagement co-pilot for DJ Rick Duncan's TikTok LIVEs.

- **The stream** runs as normal from the computer through OBS.
- **The Listener** runs in a browser tab on that same computer. It hears the mix and your mic.
- **The phone** is the engagement screen. It shows ready-to-post chat messages for your crew account (for example, `@rickscrew`), and lines for you to say on the mic.

It never logs into TikTok, and it never posts, likes, taps or shares by itself. It reads your public live by username only. Whoever holds the phone copies each message and posts it from the crew account. That keeps every message a real person's choice, and keeps both accounts safe.

## What it does

- **Hears the music.** Using an on-device Google sound model, it works out tempo (BPM), energy, bass, breakdowns and drops, and what can be heard: piano, vocals, guitar, synth, strings, horns, crowd noise. It also tells broad styles apart, such as house, techno, soul, disco and hip hop.
- **Reacts to musical moments.** A piano break → "hands in the air 🙌🎹". A breakdown → "hold tight… 👀". The drop → 💥. Vocals coming in → "who knows the words? 🎤". Instant chat posts appear straight away, then richer AI ones follow.
- **Uses what you say.** It transcribes your mic. If you mention a place, a year, a club or a story, it turns that into chat posts and ideas ("Rick's on about Ayia Napa 2001, who else was there? 🌴").
- **Welcomes people by name.** It knows who's new and who's a regular ("welcome back @sarah_k"), using notes it remembers across streams.
- **Keeps the chat alive.** It thanks gifts, follows and shares, answers questions, and suggests a game when chat goes quiet. It asks for shares only now and then, never for gifts.
- **Gives you a debrief after the stream.** Stats, musical moments, regulars, and ideas for next time.

## Set-up (once)

On the **streaming computer** (needs Node.js 20+, from https://nodejs.org):

```bash
cd copilot
npm install
cp .env.example .env      # paste your Claude API key in here, and set a DASHBOARD_PIN
npm start
```

**Try it first without going live:** `npm run demo` (pretend viewers and a pretend track).

## On stream night

1. **Start OBS and go live** as usual.
2. **On the computer**, open **http://localhost:3000/listen.html** in Chrome or Edge:
   - Choose the input that carries your mix: your DJ controller/mixer input, a virtual audio cable from OBS (e.g. VB-Cable), "Stereo Mix", or just a mic near the speakers. Then tap **Start listening**.
   - Tap **Transcribe my mic** (uses the computer's default mic).
   - Leave the tab open.
3. **On the phone** (same Wi-Fi), open `http://<computer's IP>:3000`, enter the PIN, and tap **Start**. Tip: *Share → Add to Home Screen* makes it open like an app, and the screen stays awake while it's open.
4. On the phone, have TikTok open on your live, logged in as the **crew account**. When a good post appears, tap **Copy**, switch to TikTok and paste. **Open the live ↗** jumps straight there.
5. When you're done, tap **End stream & get report**.

Fill in **Settings** on the phone once: the crew account name, how it talks, and a bit about you. The AI uses it to sound right.

### Phone not on the same Wi-Fi?

Run a free Cloudflare tunnel on the computer to get a secure web address for the phone:
`cloudflared tunnel --url http://localhost:3000` (install from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/). Always set `DASHBOARD_PIN` when you do this.

## Settings (`.env`)

| Setting | What it does |
|---|---|
| `ANTHROPIC_API_KEY` | Turns on the AI. Without it you get simple built-in posts. |
| `DASHBOARD_PIN` | Locks the dashboard. |
| `TIKTOK_SIGN_API_KEY` | Optional free key (eulerstream.com) that makes connecting to TikTok more reliable. |
| `CLAUDE_EFFORT` | `high` (default) gives rich, natural posts. `medium` or `low` are quicker. |
| `SUGGEST_MIN_GAP_MS` | Minimum gap between AI updates (default 12 s). |

**Cost:** Claude is pay-as-you-go. The rich setting with updates every ~12 s typically costs a few pounds for a 2-hour stream, depending on how busy it is. The music analysis runs on your computer and is free.

## Good to know

- Only numbers (tempo, energy, instruments) and your transcribed words leave the Listener, never audio.
- The TikTok connection uses the unofficial `tiktok-live-connector` library. If TikTok changes something and it stops connecting, run `npm update tiktok-live-connector`.
- Viewer memory lives in `data/viewers.json` and debriefs in `data/reports/`, both on your computer.
- Keep the crew account clearly labelled as Rick's crew (in its name or bio). Post at a natural pace, so it stays a host in the chat rather than spam.
