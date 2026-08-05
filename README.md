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
| `script.js` | The hamburger menu toggle. Nothing else |
| `assets/` | Images, icons, and the resume PDF |

## Where to change text

Everything you'd want to reword lives in `index.html`, in this order:

| Line | What it is |
| --- | --- |
| 29, 40 | Your name in the top-left corner — **change both**, one is for desktop and one is for mobile |
| 67–69 | The intro: "Hello, I'm" / your name / your job title |
| 73 | Which file the **Download CV** button opens |
| 124 | The Experience box — "3+ years / Support Specialist" |
| 133 | The Education box — your degrees |
| 138–141 | The About Me paragraph |
| 155–215 | Skills lists, split into Development and Information Technology |
| 234, 260, 288, 307 | Project names |
| 331, 342 | Contact email and LinkedIn |
| 358 | Copyright line in the footer |

The page title and the description that shows up in Google are lines 6–7.

Each `<section>` starts with a small green label and then a big heading:

```html
<p class="section__text__p1">Get To Know More</p>   <!-- small mono label -->
<h1 class="title">About Me</h1>                     <!-- the big heading -->
```

The sections are `#profile`, `#about`, `#experience`, `#projects`, `#contact`,
in that order down the page.

## Two things to watch out for

**The name appears twice.** Lines 29 and 40. There are two navigation bars —
one shows on desktop, the other on phones — so changing one leaves the other
stale.

**Editing the nav means editing it twice too.** The desktop links start at
line 31 and the mobile links at line 54. Both lists need the same items.

## Adding a project

Projects sit in rows of two. Copy an existing `details-container` block
(lines 252–277 is a complete one) and paste it inside an
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

## Deploying

Netlify is connected to this repo. Pushing to `main` deploys automatically —
there's no build step, so the site is live within about a minute.
