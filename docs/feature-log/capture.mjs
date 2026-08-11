/**
 * Screenshot helper for feature logs.
 *
 *   npm i -D playwright        # once
 *   node docs/feature-log/capture.mjs http://localhost:8000 ./shots
 *
 * Takes the two standard viewports (desktop + phone) and writes PNGs that
 * build.py will compress. Edit the STEPS array to capture specific states —
 * a menu open, a toggle on, a stubbed API response.
 *
 * Screenshots in a feature log must be REAL renders. Never hand-draw a
 * mockup and present it as one.
 */

import { chromium } from "playwright";
import { mkdirSync } from "fs";

const URL = process.argv[2] || "http://localhost:8000";
const OUT = process.argv[3] || "./shots";

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

/**
 * Each step is: a name, a viewport, and an optional setup function that runs
 * before the shot. Add to this per feature.
 */
const STEPS = [
  { name: "desktop", vp: DESKTOP },
  { name: "phone", vp: PHONE },

  // Example — capture a state that needs a click first:
  // {
  //   name: "weather-on",
  //   vp: DESKTOP,
  //   async setup(page) {
  //     await page.click("#desktop-nav .weather-toggle");
  //     await page.waitForSelector(".weather-hud__cond:not(:empty)");
  //     await page.waitForTimeout(2000);   // let particles populate
  //   },
  // },

  // Example — force a state that depends on an external API. This is how
  // the weather log photographed snow and lightning in a Florida August.
  // Say so in the config when a shot is stubbed rather than live.
  // {
  //   name: "thunderstorm",
  //   vp: DESKTOP,
  //   route: ["**/api.open-meteo.com/**", { current: { weather_code: 95 } }],
  //   async setup(page) { await page.click("#desktop-nav .weather-toggle"); },
  // },
];

mkdirSync(OUT, { recursive: true });

// On a normal machine this is all you need. The executablePath and proxy
// juggling some environments require are NOT part of the recipe — see
// presenting-features.md.
const browser = await chromium.launch();
const problems = [];

for (const step of STEPS) {
  const ctx = await browser.newContext({
    viewport: step.vp,
    reducedMotion: step.reduced ? "reduce" : "no-preference",
    colorScheme: step.dark ? "dark" : "light",
    ...(step.geo
      ? { permissions: ["geolocation"], geolocation: step.geo }
      : {}),
  });
  const page = await ctx.newPage();

  page.on("pageerror", (e) => problems.push(`[${step.name}] ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[${step.name}] console: ${m.text()}`);
  });

  if (step.route) {
    const [pattern, json] = step.route;
    await page.route(pattern, (r) => r.fulfill({ json }));
  }

  await page.goto(URL, { waitUntil: "networkidle" });
  if (step.setup) await step.setup(page);

  // A log that shows a horizontally-scrolling page is showing a bug. Catch
  // it here rather than in the screenshot.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  if (overflow > 0) problems.push(`[${step.name}] horizontal overflow ${overflow}px`);

  await page.screenshot({ path: `${OUT}/${step.name}.png`, fullPage: step.fullPage !== false });
  console.log(`captured ${step.name.padEnd(18)} ${step.vp.width}x${step.vp.height}  overflow=${overflow}px`);
  await ctx.close();
}

await browser.close();

if (problems.length) {
  console.log("\nPROBLEMS (fix these before writing the log):\n" + problems.join("\n"));
  process.exit(1);
}
console.log("\nno console errors, no overflow");
