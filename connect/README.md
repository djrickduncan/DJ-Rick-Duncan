# Follow-Up (`/connect/`)

A private app for your phone that helps you follow up with people you meet at shows.
It isn't linked from the public site and is excluded from search engines.

**All contacts are stored only on the phone that uses it** (IndexedDB). There is no
server and no LinkedIn login. The page's code is public on GitHub Pages, but your data never leaves the device.

## Install on Android
1. Open `https://<your-pages-site>/connect/` in Chrome.
2. Menu (⋮) → **Add to Home screen / Install app**.
3. Open it from the home screen, then go to **Settings** and add your LinkedIn URL (used for "My QR").
4. On the Due tab, tap **Turn on** to get reminder notifications.

## At a show
- Tap the event bar and set the event name (e.g. "ADE 2026"). Every new contact is tagged with it.
- **Met someone**, then **Scan their QR code**. In their LinkedIn app they tap the QR icon
  in the search bar to show it. Add a note and a photo, choose a follow-up date, and tap Save.
- Or show **My QR** so they can scan you.
- Or, in the LinkedIn app, open their profile, tap **Share → Follow-Up**.

## The next day
- **Due** lists overdue and today's follow-ups first.
- Open a contact, tap **Write follow-up message**, then **Copy & open LinkedIn**. Tap Message on their
  profile and paste. The contact is marked *Messaged*, and a chase-up is set for a week later.
- **Add to calendar** creates a Google Calendar event for the follow-up date. Use it if you want
  a reminder that will definitely fire.

## Lists, tags and bulk actions
- **All** tab: tap tag chips under the filters to show only people with those tags. Pick several to
  narrow down (they must have all of them). **No tags** shows people you haven't sorted yet.
- Tap **Select**, or long-press a contact, to pick several people. Then use **Tag / list** to add or
  remove tags, or create a new list (e.g. "Target: Ibiza promoters"). **Follow-up** gives everyone
  the same date, **Status** changes them all, and **Delete** removes them (with undo).
  **Select all** picks everyone currently shown, so you can filter first and then select.

## LinkedIn import (optional)
LinkedIn → Settings → Data privacy → Get a copy of your data → Connections. Load
`Connections.csv` in Settings. It fills in names and companies for people you scanned, and can
add recent connections you forgot to scan.

## Limits
- LinkedIn doesn't let other apps read your connections or send messages, so the app copies
  the message and opens LinkedIn for you to paste and send.
- Background reminders use Chrome's periodic background sync. It only works when the app is installed, and
  Android decides the exact time (about once a day). Calendar events are the guaranteed option.
- Data stays on one phone. Use **Settings → Export backup** regularly.
