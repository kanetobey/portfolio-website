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
| 27, 38 | Your name in the top-left corner — **change both**, one is for desktop and one is for mobile |
| 65–67 | The intro: "Hello, I'm" / your name / your job title |
| 71 | Which file the **Download CV** button opens |
| 122 | The Experience box — "3+ years / Support Specialist" |
| 131 | The Education box — your degrees |
| 136–139 | The About Me paragraph |
| 158–218 | Skills lists, split into Development and Information Technology |
| 238, 264, 292, 311 | Project names |
| 341, 352 | Contact email and LinkedIn |
| 368 | Copyright line in the footer |

The page title and the description that shows up in Google are lines 6–7.

Each `<section>` starts with a small grey line and then a big heading, like this:

```html
<p class="section__text__p1">Get To Know More</p>   <!-- the small grey line -->
<h1 class="title">About Me</h1>                     <!-- the big heading -->
```

The sections are `#profile`, `#about`, `#experience`, `#projects`, `#contact`,
in that order down the page.

## Two things to watch out for

**The name appears twice.** Lines 27 and 38. There are two navigation bars —
one shows on desktop, the other on phones — so changing one leaves the other
stale.

**Editing the nav means editing it twice too.** The desktop links start at
line 29 and the mobile links at line 52. Both lists need the same items.

## Adding a project

Projects sit in rows of two. Copy an existing `details-container` block
(lines 256–281 is a complete one) and paste it inside an
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

`style.css` is ordered the same way the page is: navigation first, then each
section top to bottom. A few things worth knowing:

- The font is Poppins, loaded from Google Fonts on line 3.
- Buttons are `.btn-color-1` (filled) and `.btn-color-2` (outlined).
- `.title` is every big section heading; `.section__text__p1` is every small
  grey line above one.

`mediaqueries.css` has three breakpoints and only overrides what changes:

| Width | What happens |
| --- | --- |
| 1400px | Profile section shrinks, boxes start wrapping |
| 1200px | Desktop nav swaps to the hamburger menu |
| 600px | Phone layout — text shrinks, everything stacks |

If something looks right on desktop but broken on your phone, the fix usually
belongs in the 600px block, not in `style.css`.

## Deploying

Netlify is connected to this repo. Pushing to `main` deploys automatically —
there's no build step, so the site is live within about a minute.
