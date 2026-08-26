# Rick Duncan / Just:DJ — Website

A production-ready, ultra-lightweight, static electronic press kit (EPK) and
booking site for Rick Duncan / Just:DJ. Plain HTML5, modern CSS and a small
amount of vanilla JavaScript. No build step, no framework, no dependencies.

**Positioning:** Modern music. Traditional DJ interface. Modern production.
Rick performs on Technics-style turntables using vinyl and DVS/control
vinyl — this is a current electronic-music DJ who chooses turntables as his
performance interface, not a retro or nostalgia act.

---

## File structure

```
/
├── index.html              Homepage (hero, showreel, USP sections, contact)
├── watch.html               Curated performance portfolio
├── about.html                "Just:DJ" — story, turntables, music, broadcast, approach
├── shows.html                Next live, recent shows, formats
├── contact.html              Booking / contact page
├── privacy.html               Privacy statement placeholder
├── accessibility.html         Accessibility statement
├── robots.txt
├── sitemap.xml
├── manifest.webmanifest
├── favicon.svg
├── css/
│   └── style.css              One stylesheet, custom properties, no framework
├── js/
│   └── main.js                 Progressive enhancement only (~a few KB)
├── images/                     Placeholder SVG imagery (see below)
├── video/                      Expected location for the showreel video file
├── assets/                     Free for any other downloadable assets (e.g. press photos, rider PDF)
└── scripts/
    └── gen_placeholders.py     One-off generator used to create the placeholder SVGs
```

Every page repeats the same header/nav/footer markup — there is no shared
templating layer, by design, so the site stays a flat, dependency-free
static build. Keep the header/nav/footer in sync across pages when editing.

---

## Main design decisions

This is an editorial, magazine-style art direction — DJ Mag/Mixmag-adjacent,
not a SaaS template — built around oversized type, asymmetric layouts and a
restrained red accent rather than cards and icon grids.

- **No framework.** Semantic HTML5 + CSS Grid/Flexbox + vanilla JS only.
- **Dark, editorial palette:** near-black background (`#0a0a0b`), off-white
  text, Just:DJ red accent (`#ee4236`) used sparingly (rules, labels, section
  numbers, tag bullets, hover states) rather than flooding sections. All
  colours/spacing/type are CSS custom properties in `css/style.css` (`:root`).
- **Numbered section system.** Every major homepage section carries a small
  mono kicker like `01 / Performance`, `02 / Vinyl`, `03 / Experience` — the
  `.kicker` + `.section-num` classes. This is the primary editorial rhythm
  device and doubles as a wayfinding aid.
- **Asymmetric split layouts** (`.split`, `.split-60-40`, `.split-40-60`)
  alternate image-left/image-right and column ratios section to section, so
  no two sections in a row share the same shape.
- **Cinematic split hero.** Image column (≈65%) + solid text panel (≈35%) at
  desktop; image-on-top, panel-below on mobile. Header is fixed and
  transparent over the hero, turning solid on scroll (`.site-header.is-solid`,
  toggled by `js/main.js`; pages without a hero are solid by default via
  `body:not(.has-hero)`).
- **Image-led tiles, not SaaS cards.** Performance/show tiles (`.tile`) are
  a single clickable image with an always-visible overlay caption — no
  hover-dependent content, square corners, a subtle image-scale on hover only.
  The show artwork gallery (`.gallery-scroll`) is a native horizontal scroll
  on mobile and a staggered CSS grid from tablet up — no carousel JS.
- **Spec-sheet typography for technical detail.** The Vinyl section's gear
  list (`.tag`/`.tag-row`) and the Broadcast section's capability list
  (`.spec-row`, numbered 01–05) read like hardware spec typography rather
  than bullet points or icon-feature grids.
- **No visible placeholder text.** Anything factual that hasn't been
  supplied (career history, follower counts, next-show details) is either
  omitted with an HTML comment marking where to add it, or the whole
  component is left commented out (social metrics) rather than shown with
  `[bracketed]` text. See "Placeholders" below for the exact list.
- **Fluid type** via `clamp()` — no separate mobile/desktop type rules for
  most headings.
- **No-JavaScript mobile navigation.** The mobile menu is a native
  `<details>/<summary>` disclosure element — fully keyboard operable and
  screen-reader friendly with zero JavaScript. JS only adds a few UX
  niceties (closing the menu after a link is clicked, closing it on
  outside-click/Escape, header solid-state, reveal-on-scroll).
- **Restrained motion.** A small `IntersectionObserver` in `js/main.js` adds
  a fade/translate-in (`.reveal` → `.is-visible`) to major section blocks.
  Content is visible immediately with JS disabled or under
  `prefers-reduced-motion: reduce` — this is decoration, never a gate on
  content.
- **System font stack** — no web font downloads.
- **A persistent "Book / Contact" button** in the header on every page,
  without dominating the navigation visually.

---

## Accessibility measures

- One `<h1>` per page, logical heading order (h1 → h2 → h3).
- Semantic landmarks: `<header>`, `<nav>`, `<main>`, `<footer>`.
- Skip-to-content link, visible on keyboard focus.
- Visible focus states (`:focus-visible`) on all interactive elements.
- Colour contrast checked against the dark palette (off-white on near-black,
  red accent used only for large text/labels/borders, not small body copy).
- Descriptive `alt` text on every meaningful image; the site currently has
  no purely decorative images, so none use empty `alt`, but that convention
  is documented here for future images that are decorative.
- Accessible forms: every input has an explicit associated `<label>`.
- `prefers-reduced-motion` respected — smooth scrolling and any transitions
  are disabled for users who request reduced motion.
- No autoplaying audio or video anywhere on the site.
- Duplicate-looking link text (e.g. repeated "Watch set" / "Watch episode"
  links across cards) carries an additional visually-hidden span so each
  link is unambiguous out of context for screen reader users.
- Native `<details>/<summary>` mobile menu — operable with only a keyboard,
  no custom ARIA menu pattern required.

---

## Performance optimisations

- Single CSS file, no unused framework rules, custom properties instead of
  a preprocessor.
- JS is a single small file, deferred, and limited to progressive
  enhancement (menu behaviour, footer year). No hydration, no client-side
  rendering, no dependencies.
- All images are lightweight inline-style SVG placeholders (under ~1KB
  each) with explicit `width`/`height` to prevent layout shift.
- The hero/LCP image is **not** lazy-loaded and uses `fetchpriority="high"`.
  Every other image below the fold uses native `loading="lazy"`.
- The showreel video uses `preload="none"` and a poster image — nothing is
  downloaded until a visitor presses play, and there is no autoplaying
  audio.
- No render-blocking third-party scripts, no web fonts, no icon libraries,
  no carousels/sliders.

---

## SEO / AI-readability measures

- Unique `<title>` and meta description per page.
- Canonical link placeholders on every page (update the domain — see
  below).
- Open Graph and Twitter/X card metadata on every page.
- All primary page content is static HTML — nothing is rendered
  client-side, so search engines and AI crawlers see the full copy with no
  JavaScript execution required.
- `robots.txt` and `sitemap.xml` included.
- Schema.org JSON-LD included on relevant pages (Person, WebSite, WebPage,
  VideoObject, ProfilePage, ContactPage) — see "Update metadata" below for
  how to keep this accurate. No Event schema is included yet, since there
  is no confirmed future date; add one only once a real show is scheduled.
- Copy is written factually (turntables, DVS, manual mixing, genres) rather
  than vaguely, and naturally covers the target terms in the brief (vinyl
  DJ, DVS DJ, Technics DJ, turntable DJ, broadcast DJ, etc.) without
  keyword stuffing.

---

## Placeholders Rick needs to replace

**Domain / URLs**
- Every `https://www.example.com` canonical/OG/Twitter URL and the
  `Sitemap:` line in `robots.txt` — replace with the real production
  domain.

**Images** (all in `/images/`, currently lightweight placeholder SVGs —
see dimensions below; replace with real photography/artwork in the same
filenames, or update the `src`/`srcset` attributes if you rename them):

| File | Purpose | Recommended dimensions |
|---|---|---|
| `hero-placeholder.svg` | Homepage hero (LCP image) | 1920×1200 |
| `showreel-poster.svg` | Showreel video poster | 1920×1080 |
| `studio-placeholder.svg` | Broadcast studio / OBS output | 1600×1000 |
| `vinyl-placeholder.svg` | Turntables + DVS detail | 1600×1000 |
| `intro-turntables.svg`, `intro-mixer.svg`, `intro-hands.svg`, `intro-broadcast.svg` | "What is Just:DJ?" 2×2 grid | 800×600 each |
| `performance-01.svg` … `performance-08.svg` | Performance thumbnails (homepage + watch.html) | 1280×720 each |
| `show-01.svg` … `show-08.svg` | Show artwork tiles (Frequency, Solar State, N:Pulse, Four Four, Transmission, Hyper Drive, Trance Arena, Viva Bounce) | 1200×1200 each — **use existing real show artwork, do not generate new artwork** |

For real photography, export as WebP/AVIF with a JPEG fallback if needed,
keep the same `width`/`height` attributes (update them if the aspect ratio
changes) and keep the hero image un-lazy-loaded.

**Video**
- `/video/showreel-placeholder.mp4` does not exist yet — add the real
  60-second showreel at that path (or update the `<source>` path in
  `index.html`). Recommended: H.264 MP4, 1920×1080, with a separate poster
  frame saved as `images/showreel-poster.svg` (replace with a real JPEG/WebP
  poster and update the `poster` attribute's file extension accordingly).

**Favicon / branding**
- `favicon.svg` is a simple placeholder mark, not the real Just:DJ logo —
  replace it with the real brand mark (SVG preferred).
- `apple-touch-icon.png` (180×180) is referenced but not included — add a
  real PNG export of the logo.
- `manifest.webmanifest` icons array currently only lists the SVG; add
  192×192 and 512×512 PNG icons for broader home-screen support once real
  artwork exists.

**Copy / factual content** — unknown facts are never shown publicly on this
build. Instead, look for HTML comments marking where real content goes, and
add it there (never invent this data):
- `<!-- ADD CAREER HISTORY HERE -->` — homepage Experience section
  (`index.html`, "05 / Experience") and `about.html`'s "The Story" — add
  venues/events, radio experience, residencies and notable appearances as
  real prose or a list once supplied.
- The homepage **Social / Audience metrics section is currently commented
  out entirely** (search `index.html` for "SOCIAL / AUDIENCE" — it sits
  between the show-artwork gallery and "Available for"). Do not uncomment
  it with placeholder numbers; once real follower counts exist, rebuild it
  using `.metric-card` / `.metric-value` / `.metric-platform` (still defined
  in `css/style.css`) with real figures and real profile links.
- Social profile URLs — every `href="#"` on a social icon/link across all
  pages needs the real profile URL.
- `bookings@[DOMAIN].com` — replace with the real booking email address in
  every page (search for `bookings@example.com`). This one *is* shown as a
  literal on-page placeholder by design (it's the primary contact CTA) —
  swap the whole string for the real address.
- `watch.html` and `shows.html` carry `<!-- ADD SET/EPISODE DETAILS HERE -->`
  and `<!-- ADD FEATURED PERFORMANCE DETAILS HERE -->` comments next to each
  tile group — add real titles, durations, dates and platform links there,
  and swap each tile's `href="#"` for the real video/stream URL.
- `shows.html` "Next Live" currently reads "No show is currently scheduled."
  — replace that paragraph with the real show name/day/date/time once one
  is booked, and add a matching `Event` JSON-LD block (see the HTML comment
  directly above that section for what's expected).
- JSON-LD blocks (`index.html`, `about.html`) — update `url`, `image`,
  `email` and `sameAs` (only with genuine profile URLs) once known.

---

## Local preview

No build step or server-side dependency is required. Any of the following
work:

```bash
# Option 1 — Python's built-in server
python3 -m http.server 8000
# then open http://localhost:8000/

# Option 2 — Node's http-server (if installed)
npx http-server -p 8000

# Option 3 — just open index.html directly in a browser
# (works for browsing, but the video/manifest/service-worker-style
# features behave more accurately over http://, so a local server is
# recommended)
```

---

## Deployment to standard web hosting

This is a flat static site — it deploys to any standard host with no
special configuration:

1. Upload the entire project root (all files and folders as-is) to your
   host's public web root (e.g. `public_html`, `www`, or your static
   host's deploy directory).
2. Make sure `index.html` is served as the directory index at `/`.
3. Point your DNS/domain at the host, then update every
   `https://www.example.com` placeholder in the HTML files, `robots.txt`
   and `sitemap.xml` to the real domain.
4. Works unmodified on: any shared LAMP/Nginx host, Netlify, Vercel
   (static), GitHub Pages, Cloudflare Pages, S3 + CloudFront, etc. No
   environment variables or server runtime are required.
5. Once analytics or the contact form are wired up (see below), re-check
   `privacy.html` and update it to match reality.

### How to edit navigation

The primary nav appears identically in the `<header>` of every page as a
`<ul>` inside `<nav class="site-nav">`. To add/remove/rename a nav item,
edit that `<ul>` in **every** HTML file (there is no shared include, by
design, to keep this a dependency-free static build). Mark the current
page's link with `aria-current="page"`.

### How to replace image placeholders

Swap the file in `/images/` for a real photo/artwork of the same name (or
change the `src` attribute if you use a new filename). Keep the `width`
and `height` attributes matched to the real image's aspect ratio to avoid
layout shift. See the placeholder table above for expected dimensions.

### How to replace video placeholders

Add the real file at `/video/showreel-placeholder.mp4` (or update the
`<source src="...">` in `index.html` to point at your real filename).
Replace `images/showreel-poster.svg` with a real poster frame (JPEG or
WebP) and update the `poster="..."` attribute's extension.

### How to update social metrics

The homepage has no metrics section right now — it's commented out in
`index.html` (search for "SOCIAL / AUDIENCE") rather than shown with
placeholder numbers, per the brand rule that unverified figures are never
displayed publicly. When real follower counts are available: uncomment that
block, replace it with a `.grid.grid-5` of `.metric-card` elements (value in
`.metric-value`, platform name in `.metric-platform`, real profile link),
and update each social link's `href="#"` across the site to the real
profile URL. Never fabricate a number — leave the section hidden until real
data exists.

### How to update metadata

Each page's `<title>`, meta description, canonical link, Open Graph tags,
Twitter/X card tags and JSON-LD blocks are all in the `<head>` (metadata)
and near the closing `</body>` (JSON-LD). Update the domain, descriptions
and JSON-LD `sameAs`/`image`/`email` fields as real information becomes
available.

### How to connect the contact form

Both `index.html` and `contact.html` contain a plain HTML `<form>` with
`action="#"` — this is a non-functional placeholder by design (no fake
functionality has been wired up). To make it work, pick one of:

- **Form backend service** (simplest): sign up with a service such as
  Formspree, Getform, Basin, or similar, and set `action` to the endpoint
  they give you, keeping `method="post"`.
- **Your own endpoint**: point `action` at a server-side script/serverless
  function you control that accepts a POST of the named fields (`name`,
  `email`, `organisation`, `enquiry_type`, `message`) and sends/stores
  them.
- **mailto fallback** (not recommended for production, but zero-dependency):
  `action="mailto:bookings@yourdomain.com"` — unreliable across browsers,
  only suitable as a stopgap.

After connecting the form, update `privacy.html` to describe what happens
to submitted data.

### How the site could later be converted into a lightweight custom WordPress theme

This HTML is deliberately clean and section-based so it maps onto WordPress
template parts with minimal rework:

- `header.php` / `footer.php` — lift the `<header class="site-header">`
  and `<footer class="site-footer">` blocks directly; replace the
  hard-coded nav `<ul>` with `wp_nav_menu()`.
- `front-page.php` — homepage sections map to a sequence of `get_template_part()`
  calls, one per `<section class="section">` block (hero, showreel, intro,
  vinyl-difference, watch, experience, broadcast, show-artwork, social,
  available-for, contact).
- `page-watch.php`, `page-about.php`, `page-shows.php`, `page-contact.php`
  — one template per existing page; performance/show cards become a
  custom post type (`performance`, `show_episode`) with ACF/native custom
  fields for genre, duration, date, thumbnail and platform, looped with
  `WP_Query` instead of hard-coded markup.
- Keep `css/style.css` as `style.css` in the theme root (with the required
  WordPress theme header comment added) and enqueue it (and `main.js`) via
  `wp_enqueue_style()` / `wp_enqueue_script()` in `functions.php` — do not
  inline them.
- Use native WordPress functions (`the_title()`, `the_content()`,
  `wp_get_attachment_image()` with `srcset` support built in, the Customizer
  or ACF Options for social links/follower counts) rather than a page
  builder.
- **Do not** introduce Elementor, Divi, or similar page builders — they
  work against the "ultra-lightweight" requirement this build was made to
  satisfy. A minimal set of plugins (e.g. an SEO plugin, a lightweight
  forms plugin) is fine; a page builder is not.
- WordPress is not a dependency of the current build — this recommendation
  only applies if/when a CMS is wanted later.

---

## Regenerating placeholder images

`scripts/gen_placeholders.py` is a one-off helper (not loaded by the site)
that generated the SVGs in `/images/`. Run `python3 scripts/gen_placeholders.py`
again only if you want to regenerate the placeholders from scratch (e.g.
after changing the brand palette) — real photography should replace these
files rather than relying on the generator long-term.
