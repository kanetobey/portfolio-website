# How to present a feature

When something new ships, it gets handed over as a **feature log**: a single
web page with real screenshots and a plain-language explanation of what
changed, why, and what broke along the way.

The point is that you can open one link on your phone and understand what
happened without reading a diff.

There's a worked example in `feature-log/example.json` — the real config behind
the weather-mode log, with its screenshots included. It runs as-is:

```bash
python3 docs/feature-log/build.py docs/feature-log/example.json
```

Open the `example.html` it writes to see what a finished one looks like before
writing your own.

---

## When to write one

| Situation | What to do |
| --- | --- |
| New feature, or anything that changes what you see | **Feature log** |
| Bug fix, refactor, dependency bump | Plain summary in chat |
| A fix that changes appearance | **Feature log** — before and after |

If it's one line of CSS, a page is overkill. If you'd want to look at it
later, or show it to someone, it earns a log.

---

## The shape of one

Four parts, in this order.

**1. A one-sentence lede.** What this is, before any detail.

**2. Numbered stages, in the order the work actually happened.** Numbering is
honest here because a build genuinely is a sequence — don't number things that
aren't ordered.

**3. Each stage answers three questions**, always in this order:

- What changed
- Why it mattered
- What it looks like

Plain language first, technical detail second. If a stage needs a term you
wouldn't have used before this project, define it in the sentence.

**4. A footer saying how it was verified** — which browser, which screen sizes.

---

## The rules that make it worth reading

These are the difference between a log and a slideshow.

### Name the actual defect

> ~~"Fixed some CSS issues"~~
>
> "`transition: all 0.3` — no unit, so the browser threw away the whole
> declaration and the menu never animated."

The second one teaches you something. The first is noise.

### A stage that changed nothing visible should say so

Stage 02 of the weather log had **no screenshots on purpose** — it fixed bugs
and cut 4.6 MB of images without touching the design. Four stat tiles carried
it better than pictures would have, and saying "nothing changed visually, and
that was the goal" is more informative than a before/after that looks
identical.

Use stat tiles for this: `4.6 MB → 296 KB`, `446 → 408 CSS lines`.

### Show the bugs found during the build

This is the most important rule. The strongest part of the weather log was the
callout admitting that a bright midday sky made the text unreadable, and that
a crisp sun was showing through 97% cloud cover — both found by looking at the
render, both fixed.

**A log that only shows the happy path is marketing, not a handover.** If
nothing went wrong, either the work was trivial or it wasn't looked at hard
enough.

### Be explicit about what wasn't verified

Every weather screenshot came from a **stubbed** API — that's the only way to
photograph snow in a Florida August — and the log says so plainly. Same for
anything that couldn't be tested end to end.

Two hard rules:

- Never present a mockup as a render
- Never let the page imply a check that didn't happen

If something needs verifying on your machine, the log says which command to
run.

---

## Screenshots

**Real browser renders only.** Captured from the actual page, never drawn.

**Two standard sizes:** 1440×900 (desktop) and 390×844 (phone). Full-page for
layout, cropped for detail.

**Before and after, side by side**, whenever appearance changed. A single
"after" shot doesn't show you what improved.

**Caption every one** with what it's showing, not what it is. "Desktop — note
the gaps between sections" beats "Desktop screenshot".

They're compressed to WebP automatically. On the weather log that took **11 MB
of PNGs down to 400 KB**, which is the difference between a page that opens on
phone data and one that doesn't.

---

## Building one

```bash
# 1. serve the site
python3 -m http.server 8000

# 2. capture screenshots (edit the STEPS array first for specific states)
node docs/feature-log/capture.mjs http://localhost:8000 ./shots

# 3. write a config — copy example.json and change the stages
cp docs/feature-log/example.json my-feature.json

# 4. build
python3 docs/feature-log/build.py my-feature.json
```

That writes `my-feature.html` — one self-contained file, no network needed.
Open it locally, or publish it as an Artifact for a shareable link.

Needs `pip install pillow` and `npm i -D playwright` once.

### The config

Everything is one JSON file:

```json
{
  "title": "Weather mode",
  "lede": "One or two sentences on what this is.",
  "shots_dir": "shots",
  "stages": [{
    "n": "01",
    "heading": "Where it started",
    "note": "What changed and why it mattered. **Bold** and `code` work here.",
    "layout": "pair",
    "shots": [["desktop", "Desktop — note the gaps"]],
    "stats": [["4.6 MB → 296 KB", "Assets"]],
    "points": ["**display: flexbox** — not a real value"],
    "callout": ["Bugs found during the build go here."]
  }]
}
```

`layout` is one of:

| Value | Use for |
| --- | --- |
| `pair` | Two shots side by side — before/after |
| `grid` | A gallery of many states |
| `narrow` | Phone shots, which are tall and thin |
| `none` | A stage with no screenshots |

Only `heading` is required. Everything else is optional — leave out what a
stage doesn't need.

### Styling

`feature-log/template.html` holds the page shell and all the CSS. Its palette
comes from the site's own `style.css` variables, including the dark theme, so
logs look like they belong to the project and follow whatever your system is
set to.

Change colours there once and every future log follows.

---

## One thing that is NOT part of the recipe

If you look at how these were built in a cloud session, you'll see webfonts
being downloaded and inlined by hand, and a proxy being wired into Chromium.
**Neither is needed on your Mac.** Those exist because that environment blocks
font CDNs and some API hosts.

Locally, `chromium.launch()` and a normal `page.goto()` are all it takes, and
the `fonts` key in the config can be dropped entirely — the page falls back to
system fonts and still looks fine.

Don't copy a workaround into a place that doesn't need one.

---

## Checklist before sending one

- [ ] Every screenshot is a real render, at one of the two standard sizes
- [ ] Before *and* after wherever appearance changed
- [ ] Every defect named specifically, not summarised as "issues"
- [ ] Bugs found during the build are in there, not just the finished result
- [ ] Anything stubbed, mocked, or unverified is labelled as such
- [ ] Any command you still need to run yourself is written out
- [ ] Opens with no horizontal scroll at 390px
- [ ] Under a few MB, so it loads on phone data
