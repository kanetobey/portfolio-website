# Portfolio Website

My personal portfolio site — Kane Tobey. Plain HTML, CSS, and JavaScript. No
build step, no frameworks, no dependencies.

**Live:** https://kanetobey-portfolio.netlify.app

## Running it locally

Open `index.html` in a browser. That's it.

To use a local server instead (nicer for refreshing as you edit):

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## The files

| File | What's in it |
| --- | --- |
| `index.html` | All the page content and text |
| `style.css` | All the styling — colors, fonts, spacing |
| `mediaqueries.css` | Only the responsive rules (tablet and phone) |
| `script.js` | Hamburger menu + light/dark toggle |
| `weather.js` | Weather mode — the live sky. Nothing else touches it |
| `assets/` | Images, icons, and the resume PDF |
| `docs/` | How new work gets written up — see [presenting-features.md](docs/presenting-features.md) |

## Where to change text

Everything you'd want to reword lives in `index.html`, in this order:

| Line | What it is |
| --- | --- |
| 39, 77 | Your name in the top-left corner — **change both**, one is for desktop and one is for mobile |
| 133–135 | The intro: "Hello, I'm" / your name / your job title |
| 139 | Which file the **Download CV** button opens |
| 194, 198 | The Experience box — job titles and their **start dates** (see below) |
| 210 | The Education box — your degrees |
| 221–224 | The About Me paragraph |
| 238–331 | Skills lists — Development, Information Technology, Quality Assurance |
| 350, 376, 404, 423 | Project names |
| 447, 458 | Contact email and LinkedIn |
| 474 | Copyright line in the footer |

The page title and the description that shows up in Google are lines 6–7.

### Job durations update themselves

The Experience box doesn't store "3 years" as text — it stores the start date
and works the rest out, so your current role's tenure stays right without you
touching it:

```html
<span data-span-from="2024-11-04">1 year 9 months</span><br>Manual QA Engineer
<span data-span-from="2021-08-02" data-span-to="2024-11-04">3 years 3 months</span><br>Support Specialist
```

Leave off `data-span-to` and it counts to today. The text inside the span is
only a fallback for when JavaScript is off — `formatSpan()` in `script.js`
overwrites it on load. **To change a job, edit the dates, not the words.**

Each `<section>` starts with a small green label and then a big heading:

```html
<p class="section__text__p1">Get To Know More</p>   <!-- small mono label -->
<h1 class="title">About Me</h1>                     <!-- the big heading -->
```

The sections are `#profile`, `#about`, `#experience`, `#projects`, `#contact`,
in that order down the page.

## Two things to watch out for

**The name appears twice.** Lines 39 and 77. There are two navigation bars —
one shows on desktop, the other on phones — so changing one leaves the other
stale.

**Editing the nav means editing it twice too.** The desktop links start at
line 41 and the mobile links at line 119. Both lists need the same items.

## Adding a project

Projects sit in rows of two. Copy an existing `details-container` block
(lines 342–367 is a complete one) and paste it inside an
`about-containers` div, then change three things: the image path, the
`<h2>` title, and the link URLs.

If a project has no GitHub link, delete that `<a>` and leave just the Live
Demo button — that's what Sneaky Links and Pocket Bird do.

## Images

Project images go in `assets/`. Keep them around 900px wide and save as
`.webp` — the photos here are WebP because the original PNGs were 4.6 MB
between them, which is a slow load on phone data. To convert one:

```bash
python3 -c "from PIL import Image; im=Image.open('in.png'); im.save('out.webp','WEBP',quality=82)"
```

Icons are PNG and only need to be ~128px, since they display at 32px.

## Changing how it looks

**Start at the top of `style.css`.** Every colour and size is a variable in
the `:root` block, so you can restyle the whole site from about 20 lines:

```css
--accent: #0f5d52;   /* the green on buttons, labels and hover states */
--bg: #faf9f6;       /* page background */
--ink: #12161a;      /* headings */
--radius: 14px;      /* how rounded the cards are */
--container: 68rem;  /* how wide the content gets */
```

Change `--accent` and the buttons, section labels, skill tags, link hovers
and focus outlines all move together.

Below that the file follows the page: nav, hero, cards, experience,
projects, contact, footer. A few things worth knowing:

- Fonts are **Manrope** (headings and body) and **JetBrains Mono** (the small
  uppercase labels and skill tags), loaded in `index.html` line 22.
- Buttons are `.btn-color-1` (filled) and `.btn-color-2` (outlined).
- `.title` is every big section heading; `.section__text__p1` is every small
  mono label above one.
- Sections size themselves to their content. Don't put a fixed `height` on
  one — that was the old approach and it left large empty gaps.

`mediaqueries.css` has three breakpoints and only overrides what changes:

| Width | What happens |
| --- | --- |
| 60rem (960px) | Hero and About stop being two columns; text centres |
| 48rem (768px) | Desktop nav swaps to the hamburger menu |
| 34rem (544px) | Phone — cards and skills go single column |

If something looks right on desktop but broken on your phone, the fix usually
belongs in `mediaqueries.css`, not in `style.css`.

## Weather mode

The cloud button in the nav swaps the site into a live sky: real time of day,
real cloud cover, real rain and lightning for wherever the visitor is. It lives
entirely in `weather.js`.

**It is off by default and loads nothing until pressed** — no network request,
no canvas, no animation loop. A normal visit costs exactly what it did before.
Once someone turns it on, the choice is remembered in `localStorage`.

**Where the data comes from.** [Open-Meteo](https://open-meteo.com), which needs
no API key and allows browser requests. That's the whole reason it was picked —
a keyed service would mean putting a secret in `weather.js` where anyone can
read it. Location comes from the browser's geolocation prompt; if the visitor
declines, it falls back to Boca Raton.

### Changing it

Everything tunable is at the top of `weather.js`:

```js
var FALLBACK = { lat: 26.3683, lon: -80.1289, label: "BOCA RATON, FL" };
var CACHE_TTL = 10 * 60 * 1000;   // how long before it refetches
```

- **Colours** — the `SKY` array holds the gradient keyframes from deep night
  (`t: -1`) through sunrise (`t: 0`) to noon (`t: 1`). Edit those RGB triples to
  restyle the sky.
- **How dark it gets** — `drawSky()` lays a scrim over the sky scaled by how
  bright that sky actually is, so white page text stays readable at noon. If
  text ever looks washed out, raise the `0.95` multiplier there.
- **How much weather** — the intensity slider in the HUD, remembered per
  visitor. The `describe()` function maps WMO weather codes to what gets drawn.
- **Theme** — `[data-weather="on"]` in `style.css`. It's a separate attribute
  from `data-theme`, so light/dark still works underneath; it just sits below
  the dark block in the file so it wins on source order.

### Things it deliberately does

- Stops the animation loop when the tab is hidden
- Sheds particles automatically if frames actually drop, rather than assuming
  a device is slow
- Draws a static sky with no particles under `prefers-reduced-motion`
- Falls back to a clock-driven sky if the API is unreachable, rather than
  showing a broken page
- Keeps both canvases `pointer-events: none` so the page stays fully clickable
  underneath the rain

## Deploying

Netlify is connected to this repo. Pushing to `main` deploys automatically —
there's no build step, so the site is live within about a minute.
