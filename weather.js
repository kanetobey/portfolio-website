/* ==========================================================================
   SKYLINE — live weather mode

   Toggling it on fetches the visitor's real local weather and paints their
   actual sky behind (and over) the page: time of day from real sunrise and
   sunset, cloud density from real cover, rain and lightning from real
   conditions.

   Nothing in here runs until the toggle is pressed, so a normal visit pays
   none of the cost. Data comes from Open-Meteo, which needs no API key —
   the deciding factor for a static site, since any key would be readable
   by anyone viewing source.
   ========================================================================== */

(function () {
  "use strict";

  // Boca Raton — used when geolocation is denied, unavailable, or times out.
  var FALLBACK = { lat: 26.3683, lon: -80.1289, label: "BOCA RATON, FL" };

  var STORE_KEY = "weather";           // "on" / "off"
  var INTENSITY_KEY = "weather:intensity";
  var CACHE_KEY = "weather:cache";
  var CACHE_TTL = 10 * 60 * 1000;      // 10 minutes
  var GEO_TIMEOUT = 7000;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var state = {
    on: false,
    data: null,          // normalised weather, or null while loading/failed
    raf: null,
    lastFrame: 0,
    frameTimes: [],
    budget: 1,           // 0..1, trimmed by the frame-rate watchdog
    intensity: 1,        // 0.35 .. 2.0, from the slider
    pointer: { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: false },
    drops: [],
    puffs: [],
    stars: [],
    flash: 0,
    bolt: null,
    nextStrike: 0,
    clock: ""
  };

  var el = {};   // canvases + HUD nodes, created on first enable

  /* ----------------------------------------------------------------------
     Weather codes -> what to draw
     WMO codes, as published by Open-Meteo.
     ---------------------------------------------------------------------- */

  function describe(code) {
    if (code === 0) return { label: "CLEAR", precip: null, rate: 0, storm: false };
    if (code === 1) return { label: "MAINLY CLEAR", precip: null, rate: 0, storm: false };
    if (code === 2) return { label: "PARTLY CLOUDY", precip: null, rate: 0, storm: false };
    if (code === 3) return { label: "OVERCAST", precip: null, rate: 0, storm: false };
    if (code === 45 || code === 48) return { label: "FOG", precip: null, rate: 0, storm: false, fog: true };
    if (code >= 51 && code <= 57) return { label: "DRIZZLE", precip: "rain", rate: 0.35, storm: false };
    if (code >= 61 && code <= 67) return { label: "RAIN", precip: "rain", rate: 0.7, storm: false };
    if (code >= 71 && code <= 77) return { label: "SNOW", precip: "snow", rate: 0.6, storm: false };
    if (code >= 80 && code <= 82) return { label: "RAIN SHOWERS", precip: "rain", rate: 1, storm: false };
    if (code === 85 || code === 86) return { label: "SNOW SHOWERS", precip: "snow", rate: 0.9, storm: false };
    if (code >= 95) return { label: "THUNDERSTORM", precip: "rain", rate: 1, storm: true };
    return { label: "UNKNOWN", precip: null, rate: 0, storm: false };
  }

  /* ----------------------------------------------------------------------
     Location + data
     ---------------------------------------------------------------------- */

  function resolveLocation() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve(FALLBACK);
      var settled = false;
      var done = function (v) { if (!settled) { settled = true; resolve(v); } };
      // Some browsers never fire either callback if the prompt is dismissed.
      setTimeout(function () { done(FALLBACK); }, GEO_TIMEOUT);
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          done({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: null });
        },
        function () { done(FALLBACK); },
        { timeout: GEO_TIMEOUT, maximumAge: 15 * 60 * 1000 }
      );
    });
  }

  function readCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (Date.now() - parsed.at > CACHE_TTL) return null;
      return parsed.data;
    } catch (e) { return null; }
  }

  function writeCache(data) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: data }));
    } catch (e) { /* private mode, quota — not worth failing over */ }
  }

  function fetchWeather(loc) {
    var url =
      "https://api.open-meteo.com/v1/forecast" +
      "?latitude=" + loc.lat.toFixed(4) +
      "&longitude=" + loc.lon.toFixed(4) +
      "&current=temperature_2m,apparent_temperature,is_day,precipitation," +
      "weather_code,cloud_cover,wind_speed_10m,relative_humidity_2m" +
      "&daily=sunrise,sunset&timezone=auto" +
      "&temperature_unit=fahrenheit&wind_speed_unit=mph&forecast_days=1";

    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error("weather " + r.status);
        return r.json();
      })
      .then(function (json) {
        var c = json.current || {};
        var d = json.daily || {};
        return {
          label: loc.label || "YOUR LOCATION",
          temp: Math.round(c.temperature_2m),
          feels: Math.round(c.apparent_temperature),
          humidity: Math.round(c.relative_humidity_2m),
          wind: Math.round(c.wind_speed_10m),
          cloud: typeof c.cloud_cover === "number" ? c.cloud_cover / 100 : 0.2,
          code: c.weather_code,
          isDay: c.is_day === 1,
          sunrise: d.sunrise && d.sunrise[0] ? new Date(d.sunrise[0]).getTime() : null,
          sunset: d.sunset && d.sunset[0] ? new Date(d.sunset[0]).getTime() : null,
          timezone: json.timezone || null,
          ok: true
        };
      });
  }

  // Never leave the visitor staring at a broken screen: if the request fails,
  // fall back to a sky driven purely by the device clock.
  function offlineData() {
    var h = new Date().getHours();
    return {
      label: "WEATHER UNAVAILABLE",
      temp: null, feels: null, humidity: null, wind: 0,
      cloud: 0.25, code: 0, isDay: h > 6 && h < 19,
      sunrise: null, sunset: null, timezone: null, ok: false
    };
  }

  /* ----------------------------------------------------------------------
     Sky colour — driven by real sun position where we have it
     Returns -1 (deep night) .. 0 (horizon) .. 1 (noon)
     ---------------------------------------------------------------------- */

  function sunFactor(data) {
    var now = Date.now();
    if (data.sunrise && data.sunset && data.sunset > data.sunrise) {
      if (now >= data.sunrise && now <= data.sunset) {
        return Math.sin(Math.PI * ((now - data.sunrise) / (data.sunset - data.sunrise)));
      }
      // Night: 0 just after dusk / before dawn, -1 in the middle of it.
      var night = 24 * 3600e3 - (data.sunset - data.sunrise);
      var since = now > data.sunset ? now - data.sunset : now - (data.sunrise - night);
      var p = Math.min(Math.max(since / night, 0), 1);
      return -Math.sin(Math.PI * p);
    }
    return data.isDay ? 0.7 : -0.7;   // no sun times, use the coarse flag
  }

  var SKY = [
    { t: -1.0, top: [7, 11, 26],    mid: [12, 18, 38],   low: [20, 26, 50] },
    { t: -0.2, top: [14, 20, 48],   mid: [30, 38, 76],   low: [66, 60, 104] },
    { t: 0.0,  top: [38, 46, 96],   mid: [122, 84, 128], low: [226, 128, 96] },
    { t: 0.25, top: [50, 108, 178], mid: [104, 156, 208], low: [176, 200, 226] },
    { t: 1.0,  top: [26, 92, 176],  mid: [78, 146, 214], low: [158, 202, 232] }
  ];

  function lerp(a, b, k) { return a + (b - a) * k; }

  function skyColours(t) {
    var i = 0;
    while (i < SKY.length - 2 && t > SKY[i + 1].t) i++;
    var a = SKY[i], b = SKY[i + 1];
    var k = Math.min(Math.max((t - a.t) / (b.t - a.t), 0), 1);
    var mix = function (key) {
      return [
        Math.round(lerp(a[key][0], b[key][0], k)),
        Math.round(lerp(a[key][1], b[key][1], k)),
        Math.round(lerp(a[key][2], b[key][2], k))
      ];
    };
    return { top: mix("top"), mid: mix("mid"), low: mix("low") };
  }

  function rgb(c, alpha) {
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (alpha === undefined ? 1 : alpha) + ")";
  }

  /* ----------------------------------------------------------------------
     Particle populations — rebuilt on resize, on data change, or when the
     watchdog trims the budget
     ---------------------------------------------------------------------- */

  function area() { return window.innerWidth * window.innerHeight; }

  function rebuild() {
    var d = state.data;
    if (!d) return;
    var cond = describe(d.code);
    var scale = area() / (1440 * 900);
    var k = state.intensity * state.budget;

    // Precipitation
    state.drops = [];
    if (cond.precip && !reduceMotion) {
      var n = Math.round((cond.precip === "snow" ? 220 : 420) * cond.rate * scale * k);
      for (var i = 0; i < n; i++) state.drops.push(newDrop(cond.precip));
    }

    // Clouds: two depths so parallax has something to separate
    state.puffs = [];
    var puffCount = Math.round((10 + d.cloud * 46) * scale * Math.min(k, 1.4));
    for (var j = 0; j < puffCount; j++) {
      var depth = j % 2 === 0 ? 0.35 : 1;
      state.puffs.push({
        x: Math.random(),
        y: Math.random() * (depth === 1 ? 0.55 : 0.42),
        r: (depth === 1 ? 170 : 110) * (0.6 + Math.random() * 0.9),
        // The near layer passes over the page text, so it stays much fainter
        // than the far layer — wisps drifting across, not a white blanket.
        a: (depth === 1 ? 0.14 : 0.3) * (0.45 + d.cloud * 0.75),
        v: (0.0000075 + Math.random() * 0.000016) * (depth === 1 ? 1 : 0.55),
        depth: depth
      });
    }

    // Stars, only worth building for a night sky
    state.stars = [];
    if (sunFactor(d) < 0.05) {
      var starCount = Math.round(180 * scale * (1 - d.cloud * 0.75));
      for (var s = 0; s < starCount; s++) {
        state.stars.push({
          x: Math.random(),
          y: Math.random() * 0.75,
          r: Math.random() * 1.3 + 0.3,
          tw: Math.random() * Math.PI * 2
        });
      }
    }
  }

  function newDrop(kind, atTop) {
    var snow = kind === "snow";
    return {
      x: Math.random(),
      y: atTop ? -0.05 - Math.random() * 0.1 : Math.random(),
      z: 0.4 + Math.random() * 0.6,
      len: snow ? 0 : 10 + Math.random() * 22,
      r: snow ? 1 + Math.random() * 2.4 : 0,
      sp: snow ? 0.00016 + Math.random() * 0.00022 : 0.0011 + Math.random() * 0.0016,
      sway: Math.random() * Math.PI * 2,
      kind: kind
    };
  }

  /* ----------------------------------------------------------------------
     Rendering
     ---------------------------------------------------------------------- */

  function sizeCanvas(c) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.floor(window.innerWidth * dpr);
    c.height = Math.floor(window.innerHeight * dpr);
    c.style.width = window.innerWidth + "px";
    c.style.height = window.innerHeight + "px";
    var ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function drawSky(ctx, w, h, now) {
    var d = state.data;
    var t = sunFactor(d);
    var col = skyColours(t);

    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, rgb(col.top));
    g.addColorStop(0.55, rgb(col.mid));
    g.addColorStop(1, rgb(col.low));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    var px = (state.pointer.x - 0.5), py = (state.pointer.y - 0.5);

    // Stars
    if (state.stars.length) {
      var fade = Math.min(Math.max(-t * 2.2, 0), 1);
      for (var i = 0; i < state.stars.length; i++) {
        var st = state.stars[i];
        var tw = reduceMotion ? 1 : 0.55 + Math.sin(now * 0.0013 + st.tw) * 0.45;
        ctx.globalAlpha = fade * tw * 0.9;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(st.x * w - px * 14, st.y * h - py * 10, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Far cloud layer
    drawPuffs(ctx, w, h, now, 0.35);

    // Fog sits on the horizon rather than through the whole frame
    if (describe(d.code).fog) {
      var f = ctx.createLinearGradient(0, h * 0.45, 0, h);
      f.addColorStop(0, "rgba(190,196,204,0)");
      f.addColorStop(1, "rgba(190,196,204,0.55)");
      ctx.fillStyle = f;
      ctx.fillRect(0, h * 0.45, w, h * 0.55);
    }

    // The page text is near-white, so a bright midday sky would leave it
    // unreadable. Veil the sky by however bright it actually is: noon gets
    // a heavy scrim, midnight gets almost none. Keeps contrast honest at
    // every hour instead of only looking right at night.
    var lum = (col.mid[0] * 0.299 + col.mid[1] * 0.587 + col.mid[2] * 0.114) / 255;
    var veil = Math.min(0.68, Math.max(0.12, lum * 0.95));
    var v = ctx.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, "rgba(6,10,22," + (veil * 0.85).toFixed(3) + ")");
    v.addColorStop(1, "rgba(6,10,22," + veil.toFixed(3) + ")");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);

    // Sun or moon LAST, placed by real progress through the day. It draws
    // after the scrim on purpose — the sun is the brightest thing in the
    // sky, so veiling it looked wrong.
    if (d.sunrise && d.sunset) {
      var p, body;
      if (Date.now() >= d.sunrise && Date.now() <= d.sunset) {
        p = (Date.now() - d.sunrise) / (d.sunset - d.sunrise);
        body = { c: "#fff6dd", glow: "rgba(255,228,168,", r: 32 };
      } else {
        var night = 24 * 3600e3 - (d.sunset - d.sunrise);
        var since = Date.now() > d.sunset ? Date.now() - d.sunset : Date.now() - (d.sunrise - night);
        p = Math.min(Math.max(since / night, 0), 1);
        body = { c: "#eef3ff", glow: "rgba(190,210,255,", r: 22 };
      }
      var bx = p * w - px * 26;
      var by = h * 0.72 - Math.sin(Math.PI * p) * h * 0.55 - py * 18;

      // You don't see a crisp sun through an overcast sky — fade the disc as
      // real cloud cover rises, leaving only the diffuse glow behind it.
      var clarity = Math.max(0, 1 - d.cloud * 1.15);

      ctx.globalCompositeOperation = "lighter";
      var halo = ctx.createRadialGradient(bx, by, 0, bx, by, body.r * 7);
      halo.addColorStop(0, body.glow + (0.42 * Math.max(clarity, 0.2)).toFixed(3) + ")");
      halo.addColorStop(1, body.glow + "0)");
      ctx.fillStyle = halo;
      ctx.fillRect(bx - body.r * 7, by - body.r * 7, body.r * 14, body.r * 14);
      ctx.globalCompositeOperation = "source-over";

      if (clarity > 0.02) {
        ctx.globalAlpha = clarity;
        ctx.fillStyle = body.c;
        ctx.beginPath();
        ctx.arc(bx, by, body.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawPuffs(ctx, w, h, now, depth) {
    var px = (state.pointer.x - 0.5), py = (state.pointer.y - 0.5);
    var drift = depth === 1 ? 46 : 20;
    for (var i = 0; i < state.puffs.length; i++) {
      var p = state.puffs[i];
      if (p.depth !== depth) continue;
      if (!reduceMotion) {
        p.x += p.v * (1 + state.data.wind / 22);
        if (p.x > 1.25) p.x = -0.25;
      }
      var cx = p.x * w - px * drift;
      var cy = p.y * h - py * (drift * 0.6);

      // A soft radial blob reads as cloud without the cost of real noise
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, p.r);
      var lit = p.a;
      if (state.pointer.active && !reduceMotion) {
        var dx = cx - state.pointer.x * w, dy = cy - state.pointer.y * h;
        var dist = Math.sqrt(dx * dx + dy * dy);
        lit = p.a + Math.max(0, 1 - dist / 340) * (depth === 1 ? 0.07 : 0.2);
      }
      var cap = depth === 1 ? 0.3 : 0.72;
      g.addColorStop(0, "rgba(255,255,255," + Math.min(lit, cap) + ")");
      g.addColorStop(0.55, "rgba(240,244,250," + Math.min(lit * 0.5, cap * 0.7) + ")");
      g.addColorStop(1, "rgba(230,236,246,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawWeather(ctx, w, h, now, dt) {
    ctx.clearRect(0, 0, w, h);
    var d = state.data;
    var cond = describe(d.code);

    // Near clouds drift over the page content
    drawPuffs(ctx, w, h, now, 1);

    // Precipitation
    if (state.drops.length) {
      var windX = (d.wind / 60) * 0.5;
      ctx.strokeStyle = "rgba(190,215,240,0.55)";
      ctx.fillStyle = "rgba(235,242,252,0.85)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();

      for (var i = 0; i < state.drops.length; i++) {
        var p = state.drops[i];
        p.y += p.sp * dt * p.z;
        p.x += windX * p.sp * dt * 2;
        if (p.kind === "snow") p.x += Math.sin(now * 0.0008 + p.sway) * 0.00035;

        // Drops veer around the cursor, like wind off a hand
        if (state.pointer.active && !reduceMotion) {
          var dx = p.x - state.pointer.x, dy = p.y - state.pointer.y;
          var dist2 = dx * dx + dy * dy;
          if (dist2 < 0.012 && dist2 > 0.000001) {
            var push = (0.012 - dist2) * 5;
            p.x += dx * push;
            p.y += dy * push * 0.4;
          }
        }

        if (p.y > 1.05 || p.x < -0.2 || p.x > 1.2) {
          state.drops[i] = newDrop(p.kind, true);
          continue;
        }

        var x = p.x * w, y = p.y * h;
        if (p.kind === "snow") {
          ctx.moveTo(x + p.r, y);
          ctx.arc(x, y, p.r * p.z, 0, Math.PI * 2);
        } else {
          ctx.moveTo(x, y);
          ctx.lineTo(x + windX * p.len, y + p.len * p.z);
        }
      }
      if (state.drops[0] && state.drops[0].kind === "snow") ctx.fill();
      else ctx.stroke();
    }

    // Lightning
    if (cond.storm && !reduceMotion) {
      if (now > state.nextStrike) {
        state.flash = 1;
        state.bolt = makeBolt(w, h);
        state.nextStrike = now + 4000 + Math.random() * 9000;
      }
      if (state.flash > 0) {
        ctx.fillStyle = "rgba(214,232,255," + state.flash * 0.5 + ")";
        ctx.fillRect(0, 0, w, h);
        if (state.bolt && state.flash > 0.45) {
          ctx.strokeStyle = "rgba(255,255,255," + state.flash + ")";
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(state.bolt[0].x, state.bolt[0].y);
          for (var b = 1; b < state.bolt.length; b++) ctx.lineTo(state.bolt[b].x, state.bolt[b].y);
          ctx.stroke();
        }
        state.flash -= dt * 0.004;
        if (state.flash < 0) state.flash = 0;
      }
    }
  }

  function makeBolt(w, h) {
    var pts = [{ x: Math.random() * w, y: -10 }];
    var y = 0, x = pts[0].x;
    while (y < h * 0.62) {
      y += h * (0.05 + Math.random() * 0.09);
      x += (Math.random() - 0.5) * w * 0.09;
      pts.push({ x: x, y: y });
    }
    return pts;
  }

  /* ----------------------------------------------------------------------
     Frame loop + watchdog
     ---------------------------------------------------------------------- */

  function frame(now) {
    if (!state.on) return;
    var dt = Math.min(now - (state.lastFrame || now), 50);
    state.lastFrame = now;

    var w = window.innerWidth, h = window.innerHeight;

    // ease the pointer so parallax glides instead of snapping
    state.pointer.x += (state.pointer.tx - state.pointer.x) * 0.06;
    state.pointer.y += (state.pointer.ty - state.pointer.y) * 0.06;

    if (state.data) {
      drawSky(el.skyCtx, w, h, now);
      drawWeather(el.fxCtx, w, h, now, dt);
    }

    watchdog(dt);
    updateClock();
    state.raf = requestAnimationFrame(frame);
  }

  // If frames are genuinely dropping, shed particles rather than let the
  // page stutter. Only fires on real measured slowness, not on a guess
  // about the device.
  function watchdog(dt) {
    if (reduceMotion) return;
    state.frameTimes.push(dt);
    if (state.frameTimes.length < 120) return;
    var sorted = state.frameTimes.slice().sort(function (a, b) { return a - b; });
    var median = sorted[Math.floor(sorted.length / 2)];
    state.frameTimes = [];
    if (median > 24 && state.budget > 0.3) {          // below ~42fps
      state.budget = Math.max(0.3, state.budget - 0.2);
      rebuild();
    }
  }

  /* ----------------------------------------------------------------------
     DOM
     ---------------------------------------------------------------------- */

  function build() {
    if (el.sky) return;

    el.sky = document.createElement("canvas");
    el.sky.className = "weather-canvas weather-canvas--sky";
    el.sky.setAttribute("aria-hidden", "true");

    el.fx = document.createElement("canvas");
    el.fx.className = "weather-canvas weather-canvas--fx";
    el.fx.setAttribute("aria-hidden", "true");

    el.hud = document.createElement("div");
    el.hud.className = "weather-hud";
    el.hud.setAttribute("aria-hidden", "true");
    el.hud.innerHTML =
      '<button type="button" class="weather-hud__more" aria-expanded="false">' +
      '<span class="weather-hud__chev" aria-hidden="true"></span>' +
      '<span class="weather-sr">Weather details</span>' +
      "</button>" +
      '<div class="weather-hud__place"></div>' +
      '<div class="weather-hud__time"></div>' +
      '<div class="weather-hud__cond"></div>' +
      '<dl class="weather-hud__grid"></dl>' +
      '<label class="weather-hud__slider">' +
      '<span>INTENSITY</span>' +
      '<input type="range" min="35" max="200" step="5">' +
      "</label>";

    // On a phone the panel would otherwise sit on top of the hero buttons,
    // so the detail rows collapse behind this until asked for.
    var more = el.hud.querySelector(".weather-hud__more");
    more.addEventListener("click", function () {
      var open = el.hud.classList.toggle("is-open");
      more.setAttribute("aria-expanded", String(open));
    });

    // Screen readers get one clear announcement instead of a ticking clock
    el.live = document.createElement("p");
    el.live.className = "weather-sr";
    el.live.setAttribute("role", "status");

    document.body.appendChild(el.sky);
    document.body.appendChild(el.fx);
    document.body.appendChild(el.hud);
    document.body.appendChild(el.live);

    el.range = el.hud.querySelector("input");
    el.range.value = Math.round(state.intensity * 100);
    el.range.addEventListener("input", function () {
      state.intensity = Number(el.range.value) / 100;
      try { localStorage.setItem(INTENSITY_KEY, String(state.intensity)); } catch (e) {}
      rebuild();
    });

    el.skyCtx = sizeCanvas(el.sky);
    el.fxCtx = sizeCanvas(el.fx);
  }

  function destroy() {
    ["sky", "fx", "hud", "live"].forEach(function (k) {
      if (el[k] && el[k].parentNode) el[k].parentNode.removeChild(el[k]);
    });
    el = {};
  }

  function updateClock() {
    if (!state.data) return;
    var opts = { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false };
    if (state.data.timezone) opts.timeZone = state.data.timezone;
    var t;
    try {
      t = new Date().toLocaleTimeString([], opts);
    } catch (e) {
      // an unrecognised IANA zone throws — fall back to the device clock
      t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    }
    if (t === state.clock) return;
    state.clock = t;
    var node = el.hud && el.hud.querySelector(".weather-hud__time");
    if (node) node.textContent = t;
  }

  function paintHUD() {
    if (!el.hud || !state.data) return;
    var d = state.data;
    var cond = describe(d.code);

    el.hud.querySelector(".weather-hud__place").textContent = d.label;
    el.hud.querySelector(".weather-hud__cond").textContent =
      cond.label + (d.temp !== null && !isNaN(d.temp) ? "  ·  " + d.temp + "°F" : "");

    var rows = [];
    if (d.feels !== null && !isNaN(d.feels)) rows.push(["FEELS", d.feels + "°"]);
    if (d.humidity !== null && !isNaN(d.humidity)) rows.push(["HUMIDITY", d.humidity + "%"]);
    rows.push(["WIND", d.wind + " MPH"]);
    rows.push(["CLOUD", Math.round(d.cloud * 100) + "%"]);

    el.hud.querySelector(".weather-hud__grid").innerHTML = rows
      .map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>"; })
      .join("");

    if (el.live) {
      el.live.textContent = d.ok
        ? "Weather mode on. " + d.label.toLowerCase() + ", " + cond.label.toLowerCase() +
          (d.temp !== null && !isNaN(d.temp) ? ", " + d.temp + " degrees." : ".")
        : "Weather mode on. Live weather unavailable, showing local time.";
    }
  }

  /* ----------------------------------------------------------------------
     Enable / disable
     ---------------------------------------------------------------------- */

  function load() {
    var cached = readCache();
    if (cached) {
      state.data = cached;
      rebuild();
      paintHUD();
      return Promise.resolve();
    }
    return resolveLocation()
      .then(fetchWeather)
      .then(function (data) {
        state.data = data;
        writeCache(data);
      })
      .catch(function () {
        state.data = offlineData();
      })
      .then(function () {
        rebuild();
        paintHUD();
      });
  }

  function enable() {
    state.on = true;
    document.documentElement.setAttribute("data-weather", "on");
    syncToggles(true);
    try { localStorage.setItem(STORE_KEY, "on"); } catch (e) {}
    build();
    syncThemeColour();
    load().then(function () {
      if (!state.on) return;
      state.lastFrame = 0;
      if (reduceMotion) {
        // one static frame, no loop
        drawSky(el.skyCtx, window.innerWidth, window.innerHeight, 0);
        drawWeather(el.fxCtx, window.innerWidth, window.innerHeight, 0, 0);
        updateClock();
        setInterval(updateClock, 1000);
      } else if (!state.raf) {
        state.raf = requestAnimationFrame(frame);
      }
    });
  }

  function disable() {
    state.on = false;
    document.documentElement.removeAttribute("data-weather");
    syncToggles(false);
    try { localStorage.setItem(STORE_KEY, "off"); } catch (e) {}
    if (state.raf) { cancelAnimationFrame(state.raf); state.raf = null; }
    destroy();
    syncThemeColour();
  }

  // The page has two navs (desktop + hamburger), so there are two buttons
  // and both have to reflect the same state.
  function syncToggles(on) {
    var buttons = document.querySelectorAll(".weather-toggle");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute("aria-pressed", String(on));
    }
  }

  // Keeps mobile browser chrome matching whatever is actually on screen.
  // Defers to the existing light/dark logic when weather mode is off.
  function syncThemeColour() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    if (state.on) {
      meta.setAttribute("content", "#0b1020");
    } else if (typeof window.syncThemeColor === "function") {
      window.syncThemeColor(document.documentElement.getAttribute("data-theme"));
    }
  }

  function toggle() { state.on ? disable() : enable(); }

  /* ----------------------------------------------------------------------
     Wiring
     ---------------------------------------------------------------------- */

  try {
    var savedIntensity = parseFloat(localStorage.getItem(INTENSITY_KEY));
    if (!isNaN(savedIntensity)) state.intensity = savedIntensity;
  } catch (e) {}

  document.addEventListener("click", function (ev) {
    if (!ev.target.closest) return;
    if (ev.target.closest(".weather-toggle")) {
      toggle();
    } else if (ev.target.closest(".theme-toggle") && state.on) {
      // script.js just repainted theme-color for light/dark; while the sky is
      // showing, the sky is what the browser chrome should match.
      syncThemeColour();
    }
  });

  window.addEventListener("pointermove", function (ev) {
    if (!state.on) return;
    state.pointer.tx = ev.clientX / window.innerWidth;
    state.pointer.ty = ev.clientY / window.innerHeight;
    state.pointer.active = true;
  }, { passive: true });

  window.addEventListener("pointerleave", function () { state.pointer.active = false; });

  // Touch devices get tilt parallax instead of a cursor.
  window.addEventListener("deviceorientation", function (ev) {
    if (!state.on || ev.gamma === null) return;
    state.pointer.tx = 0.5 + Math.max(-1, Math.min(1, ev.gamma / 45)) * 0.5;
    state.pointer.ty = 0.5 + Math.max(-1, Math.min(1, (ev.beta - 45) / 45)) * 0.5;
  }, { passive: true });

  var resizeTimer;
  window.addEventListener("resize", function () {
    if (!state.on) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!el.sky) return;
      el.skyCtx = sizeCanvas(el.sky);
      el.fxCtx = sizeCanvas(el.fx);
      rebuild();
    }, 150);
  });

  // Don't burn frames the visitor cannot see.
  document.addEventListener("visibilitychange", function () {
    if (!state.on || reduceMotion) return;
    if (document.hidden) {
      if (state.raf) { cancelAnimationFrame(state.raf); state.raf = null; }
    } else if (!state.raf) {
      state.lastFrame = 0;
      state.raf = requestAnimationFrame(frame);
    }
  });

  // Restore a previous choice. Default is off, so a first visit is untouched.
  try {
    if (localStorage.getItem(STORE_KEY) === "on") {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", enable);
      } else {
        enable();
      }
    }
  } catch (e) {}

  window.toggleWeather = toggle;
})();
