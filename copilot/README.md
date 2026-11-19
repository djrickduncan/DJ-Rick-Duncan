# 🎧 DJ Co-Pilot

A second-screen assistant for DJ Rick Duncan's TikTok LIVEs. You stream from the TikTok app on your phone as normal. The co-pilot watches your live, then tells you **what to say next**, so every viewer gets a real, personal welcome from you.

It **never** logs into TikTok, posts, likes, taps or shares. It only reads your public live (by username), so your account is safe.

## What it does

- **Greets people by name.** Shows who just joined and whether they're new or a regular ("Sarah, 5th stream"), with a welcome line ready to say.
- **Remembers your regulars.** Tracks every viewer across streams. Tap a name to add notes ("from Hull, loves garage"). The AI also picks up things people say about themselves.
- **Knows the music.** Type in the track (or tap *Identify track* if song recognition is on). You get memory prompts and true facts about it ("who was at an under-18s disco when this dropped?").
- **Listens to you.** Tap *Listen to my mic* and it follows what you're saying, so suggestions build on your conversation.
- **Keeps the chat going.** Answers questions first, thanks gifts/follows/shares by name, and nudges you with a fun prompt when chat goes quiet.
- **Ready-to-paste chat replies.** Copy and paste them into your live chat yourself.
- **Post-stream debrief.** Tap *End stream* for stats plus an AI write-up: which tracks got people talking, who to shout out next time, ideas for the next stream.

## Set-up (about 10 minutes, once)

You need a laptop/PC (Windows, Mac or Linux) with **Node.js 20+** (https://nodejs.org).

```bash
cd copilot
npm install
cp .env.example .env      # then open .env and paste your Claude API key
npm start
```

Open **http://localhost:3000**, fill in *About me* once, and you're set.

**Try it without going live:** `npm run demo` fills the dashboard with pretend viewers.

## On stream night

1. Go live on TikTok from your phone as usual.
2. On the laptop, open the co-pilot, check your username, and tap **Go live**. (If you're not live yet, it keeps checking every 20 s.)
3. Keep the laptop (or a tablet) where you can see it. Read the big **Say this** cards out loud, in your own words. Tap **Done ✓** when you've said one.
4. Update **Now playing** when you change track (track name is enough; artist and year help).
5. Tap **End stream & get report** when you finish.

### Using a second phone or tablet as the screen

Open `http://<your-laptop-ip>:3000` on the second device (same Wi-Fi), then tap *Share → Add to Home Screen* to install it like an app. Set `DASHBOARD_PIN` in `.env` first.

Browsers only allow the mic on `localhost` or HTTPS. So run **Listen to my mic** / **Identify track** on the laptop itself, or host the co-pilot somewhere with HTTPS (Render, Railway or Fly.io all work: set the same values from `.env` as environment variables there).

> Don't run the co-pilot on the phone you're streaming from. TikTok needs that phone's mic and screen.

## Costs

- **Claude API:** pay-as-you-go. Updates are batched (at most one every ~9 s), so a 2-hour stream is typically a few dollars at most. Set `CLAUDE_EFFORT` or `CLAUDE_MODEL` in `.env` to tune speed and cost. Without a key, it still works with simple built-in prompts.
- **AudD song recognition:** optional, has a free trial.

## Good to know

- The TikTok connection uses the unofficial `tiktok-live-connector` library, which reads the same public events your viewers see. TikTok occasionally changes things. If it stops connecting, run `npm update tiktok-live-connector`, and consider adding a free `TIKTOK_SIGN_API_KEY`.
- Viewer memory is stored on your laptop in `data/viewers.json`; debriefs go in `data/reports/`. Neither is uploaded anywhere except what's sent to Claude to write suggestions.
