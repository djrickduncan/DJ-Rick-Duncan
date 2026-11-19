# 🎧 DJ Co-Pilot

A standalone Android app that sits beside DJ Rick Duncan's TikTok LIVEs and runs the chat from a crew account (for example, `@rickscrew`).

- You stream as normal (OBS on the computer, or anything else).
- The phone runs **DJ Co-Pilot**, logged into TikTok as the crew account. It watches the live, listens to the music and your voice through its mic, and writes chat posts.
- Each post has a **Post** button. One tap sends it into the live chat. Nothing is posted, liked or tapped without you.

No computer or server is needed for the app. (There's also an optional computer version, described at the end.)

## What it does

- **Hears the music** through the phone's mic using an on-device Google sound model. It works out tempo (BPM), energy, bass, breakdowns and drops, and what can be heard: piano, vocals, guitar, synth, strings, horns, crowd noise. It also tells broad styles apart (house, techno, soul, disco, hip hop…).
- **Reacts to musical moments.** A piano break → "hands in the air 🙌🎹". A breakdown → "hold tight… 👀". The drop → 💥. Vocals coming in → "who knows the words? 🎤". Instant posts appear straight away, then richer AI ones follow.
- **Uses what you say.** "Hear my voice" picks up your mic talk. If you mention a place, a year, a club or a story, it turns that into chat posts ("Rick's on about Ayia Napa 2001, who else was there? 🌴").
- **Welcomes people by name**, remembers regulars across streams, thanks gifts, follows and shares, answers questions, and gets the chat going when it goes quiet. It asks for shares only now and then, never for gifts.
- **Gives you a debrief** after each stream (App settings → Past reports).

## Install

1. On your Android phone, open **https://github.com/djrickduncan/DJ-Rick-Duncan/releases/tag/copilot-android**.
2. Tap **DJ-CoPilot.apk** to download it, then open the download.
3. Allow "Install unknown apps" for your browser when asked, then tap **Install**. If Play Protect warns it doesn't recognise the developer, tap **More details → Install anyway** (normal for apps not from the Play Store).

New versions install over the top and keep your settings.

## First-time setup (5 minutes)

1. Open **DJ Co-Pilot → App settings**. Paste your **Claude API key** (from https://console.anthropic.com → API keys). Leave reply style on **Rich and natural**. Tap **Save & restart**.
2. Tap **🔑 Log in to TikTok** and log in as the **crew account**. Use username/email/phone and password. "Continue with Google" doesn't work inside apps. Tap **◀ Back to Co-Pilot** when done.
3. Open **Settings: about you & the crew account**. Fill in the crew account name, how it talks, and a bit about you, then tap **Save**.
4. Want to try it first? Turn on **Demo mode** in App settings for pretend viewers and music.

## On stream night

1. Go live as usual.
2. On the phone: check the username is yours, tap **Start**. The app opens your live in the background and starts reading the chat.
3. Tap **🎧 Start listening** (phone near the speakers) and, if you like, **🎙️ Hear my voice**.
4. When a good post appears, tap **Post**. Posts are spaced at least 3 seconds apart. **✕** dismisses one, **Copy** copies it.
5. **📺 Show TikTok** shows the live itself. **Back to Co-Pilot** (or the phone's back button) returns.
6. Tap **End stream & get report** when you finish.

The line under the Start button shows ✅ Logged in · ✅ Chat box found when everything's ready.

## If posting doesn't work

TikTok changes its website often, so the app finds the chat box automatically and has a fallback:

- **App settings → 👆 Teach me the chat box:** the live page appears; tap the box where you'd type a comment. It's remembered.
- **App settings → 🐞 Copy debug info:** copies what the app can see on TikTok's page. Paste it to whoever maintains the app so the detection can be fixed.

## Things to know

- **TikTok's rules:** TikTok doesn't officially support apps posting into live chat. Every message here is your choice and one tap, but it still uses the crew account through the app. Keep that account clearly labelled as Rick's crew, post at a natural pace, and accept there's some risk to that account.
- **The mic:** "Start listening" and "Hear my voice" both use the phone's mic. On some phones only one can use it at a time; if the music meters freeze while your voice is on, that's why.
- **Your data:** the Claude API key, viewer memory and reports are stored only on the phone. The music is analysed on the phone; audio is never uploaded. Chat, your transcribed words and music stats are sent to Claude to write posts.
- **Cost:** Claude is pay-as-you-go. "Rich and natural" with updates every ~12 seconds typically costs a few pounds for a 2-hour stream.

---

## Optional: computer version

The same co-pilot can also run on a computer, with the dashboard in any browser. It reads the live through `tiktok-live-connector`, and the Listener page uses the computer's audio. It can't post; you copy and paste.

```bash
cd copilot
npm install
cp .env.example .env      # add ANTHROPIC_API_KEY (and DASHBOARD_PIN)
npm start                 # or: npm run demo
```

Open http://localhost:3000, and http://localhost:3000/listen.html for music and voice.

## For developers

- `lib/`: the shared co-pilot engine (runs on the phone and on the computer).
- `public/`: the dashboard and the music analyser.
- `app/`: the Android app (Capacitor). `app/src/` holds the phone-only code: `backend.js` runs the engine on the phone, `tiktok-source.js` drives the built-in TikTok browser, and `tiktok-page.js` runs inside TikTok's page to read chat and post. The native TikTok browser is `app/android/app/src/main/java/com/djrickduncan/copilot/TikTokWebPlugin.java`.
- GitHub Actions (`.github/workflows/copilot-android.yml`) builds the APK on every change under `copilot/` and publishes it to the `copilot-android` release. To build locally (needs Android Studio): `cd copilot/app && npm install && npm run apk`.
- The app is signed with a fixed personal key (`app/android/app/copilot-debug.keystore`) so updates install over the top. Fine for your own phone; make a proper release key before ever publishing to the Play Store.
