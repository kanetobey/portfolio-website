#!/usr/bin/env python3
"""
Build a feature log: one self-contained HTML page from a JSON config plus a
folder of screenshots.

    python3 docs/feature-log/build.py my-feature.json

Writes <config-name>.html beside the config. Every image is compressed to
WebP and inlined as a data URI, so the finished file opens anywhere with no
network and can be published as an Artifact.

Requires Pillow:  pip install pillow

See ../presenting-features.md for what goes IN a log. This file only knows
how to render one.
"""

import base64
import html as html_mod
import io
import json
import pathlib
import re
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required:  pip install pillow")

HERE = pathlib.Path(__file__).parent

# Screenshots are full-page and enormous as PNG. These caps took the weather
# log from 11 MB to 400 KB, which is the difference between a page that opens
# on a phone and one that doesn't.
MAX_WIDTH = 900
MAX_HEIGHT = 2600
WEBP_QUALITY = 76


def to_data_uri(path):
    """Compress an image and return it as a base64 data URI."""
    im = Image.open(path)
    im = im.convert("RGB")
    if im.width > MAX_WIDTH:
        im = im.resize((MAX_WIDTH, round(im.height * MAX_WIDTH / im.width)), Image.LANCZOS)
    if im.height > MAX_HEIGHT:
        # full-page shots of a long site: the top is what matters
        im = im.crop((0, 0, im.width, MAX_HEIGHT))
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=WEBP_QUALITY, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()


def find_shot(shots_dir, key):
    for ext in (".png", ".webp", ".jpg", ".jpeg"):
        p = shots_dir / (key + ext)
        if p.exists():
            return p
    raise SystemExit(f"screenshot not found: {shots_dir / key}.(png|webp|jpg)")


def esc(text):
    return html_mod.escape(str(text), quote=True)


def inline_md(text):
    """The small subset of Markdown worth supporting in a config: **bold**,
    `code`, and [links](url). Everything else is escaped."""
    out = esc(text)
    out = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r'<a href="\2">\1</a>', out)
    out = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", out)
    out = re.sub(r"`(.+?)`", r"<code>\1</code>", out)
    return out


def render_stage(stage, shots_dir):
    parts = []
    num = f'<span class="num">{esc(stage["n"])}</span>' if stage.get("n") else ""
    parts.append(
        f'  <section class="stage">\n'
        f'    <div class="stage-head">{num}<h2>{esc(stage["heading"])}</h2></div>'
    )

    if stage.get("note"):
        parts.append(f'    <p class="note">{inline_md(stage["note"])}</p>')

    if stage.get("stats"):
        tiles = "".join(
            f'      <div class="stat"><b>{inline_md(value).replace("&gt;", "&gt;")}</b>'
            f"<span>{esc(label)}</span></div>\n"
            for value, label in stage["stats"]
        )
        parts.append(f'    <div class="stats">\n{tiles}    </div>')

    if stage.get("points"):
        items = "".join(f"      <li>{inline_md(p)}</li>\n" for p in stage["points"])
        parts.append(f'    <ul class="pts">\n{items}    </ul>')

    if stage.get("callout"):
        paras = "".join(f"      <p>{inline_md(p)}</p>\n" for p in stage["callout"])
        parts.append(f'    <div class="callout">\n{paras}    </div>')

    layout = stage.get("layout", "grid")
    if stage.get("shots") and layout != "none":
        figs = "".join(
            f'      <figure class="shot"><img src="{to_data_uri(find_shot(shots_dir, key))}" '
            f'alt="{esc(cap)}" loading="lazy">'
            f"<figcaption>{esc(cap)}</figcaption></figure>\n"
            for key, cap in stage["shots"]
        )
        parts.append(f'    <div class="{layout}">\n{figs}    </div>')

    parts.append("  </section>")
    return "\n".join(parts)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__.strip())

    config_path = pathlib.Path(sys.argv[1])
    cfg = json.loads(config_path.read_text())

    shots_dir = pathlib.Path(cfg.get("shots_dir") or (config_path.parent / "shots"))
    if not shots_dir.is_absolute():
        shots_dir = (config_path.parent / shots_dir).resolve()
    if not shots_dir.is_dir():
        sys.exit(f"screenshot folder not found: {shots_dir}")

    template = (HERE / "template.html").read_text()

    # Optional: a CSS file of @font-face rules with the fonts already inlined
    # as data URIs. Without it the page falls back to system fonts, which is
    # fine — see presenting-features.md on when this is worth doing.
    fonts = ""
    fonts_path = cfg.get("fonts")
    if fonts_path:
        fp = (config_path.parent / fonts_path).resolve()
        if fp.exists():
            fonts = fp.read_text()
        else:
            print(f"note: fonts file not found ({fp}), using system fonts")

    stages = "\n\n".join(render_stage(s, shots_dir) for s in cfg["stages"])

    page = (
        template.replace("{{FONTS}}", fonts)
        .replace("{{TITLE}}", esc(cfg["title"]))
        .replace("{{EYEBROW}}", esc(cfg.get("eyebrow", "Build log")))
        .replace("{{HEADING}}", esc(cfg.get("heading", cfg["title"])))
        .replace("{{LEDE}}", inline_md(cfg.get("lede", "")))
        .replace("{{STAGES}}", stages)
        .replace("{{FOOTER}}", inline_md(cfg.get("footer", "")))
    )

    out = config_path.with_suffix(".html")
    out.write_text(page)
    size = out.stat().st_size / 1024 / 1024
    print(f"built {out}  ({size:.2f} MB)")
    if size > 15:
        print("WARNING: over 15 MB — the Artifact limit is 16 MB. Drop some shots.")


if __name__ == "__main__":
    main()
