/* ========================================================================
   MOTION KIT — shared by the opening sequence, the career graph and the
   project drawings, so they all move on the same curves and redraw in the
   new colours the moment the theme changes.
   ======================================================================== */

const motion = (() => {
  'use strict';

  const root = document.documentElement;
  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Close fits of --ease-out and --ease-std in style.css.
  const easeOut = (t) => 1 - Math.pow(1 - t, 4);
  const easeStd = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

  // Theme tokens, re-read on every theme change. The MutationObserver fires
  // inside the View Transition's update, so canvases redraw before the new
  // snapshot is taken and ride the circular reveal like the rest of the page.
  const colors = {};
  const readColors = () => {
    const cs = getComputedStyle(root);
    ['bg', 'fg', 'fg-muted', 'fg-faint', 'line', 'line-strong'].forEach((k) => {
      colors[k] = cs.getPropertyValue('--' + k).trim();
    });
  };
  readColors();
  const themeListeners = [];
  new MutationObserver(() => {
    readColors();
    themeListeners.forEach((fn) => fn());
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  // Size a canvas to its CSS box at device resolution (capped at 2x).
  const fit = (canvas) => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const box = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(box.width));
    const h = Math.max(1, Math.round(box.height));
    if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
    if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  };

  // Seeded PRNG (mulberry32), so drawings lay out the same on every visit.
  const seeded = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Call fn once, when el is well into view.
  const whenSeen = (el, fn, threshold = 0.35) => {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); fn(); }
    }, { threshold });
    io.observe(el);
  };

  // Call fn(true/false) as el enters and leaves the viewport, and when the
  // tab is hidden, so loops never run where nobody can see them.
  const whileVisible = (el, fn) => {
    let inView = false;
    const emit = () => fn(inView && !document.hidden);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        inView = entries[entries.length - 1].isIntersecting;
        emit();
      }).observe(el);
    } else {
      inView = true;
      emit();
    }
    document.addEventListener('visibilitychange', emit);
  };

  return {
    get reduced() { return reducedQuery.matches; },
    easeOut, easeStd, clamp01, colors, fit, seeded, whenSeen, whileVisible,
    onTheme: (fn) => themeListeners.push(fn)
  };
})();


/* ========================================================================
   OPENING SEQUENCE — the name resolves out of noise, the way a diffusion
   model denoises: every point starts as pure noise and is pulled towards its
   place in the letters as the signal fraction ᾱ rises from 0 to 1
   (x_t = √ᾱ·x₀ + √(1−ᾱ)·ε). The real text then fades in under the points.

   Runs once per visit; the <head> script decides, and adds .intro before
   first paint. Skipped entirely under reduced motion.
   ======================================================================== */

(() => {
  'use strict';

  const root = document.documentElement;
  if (!root.classList.contains('intro')) return;

  const hero = document.querySelector('.hero');
  const name = hero && hero.querySelector('.hero-name');
  const text = name && name.firstChild;

  const finish = () => {
    root.classList.remove('intro', 'intro-js', 'intro-play');
    if (name) { name.style.opacity = ''; name.style.transition = ''; }
    try { sessionStorage.setItem('intro', '1'); } catch (e) {}
  };
  if (!text || text.nodeType !== 3) { finish(); return; }

  root.classList.add('intro-js'); // this script now owns the reveal; cancels the CSS failsafe

  // Our own failsafe: if no animation frame arrives in time to start (a
  // page that gets no frames, say), show the hero as it is, unanimated.
  let started = false;
  setTimeout(() => { if (!started) finish(); }, 3000);

  // Sample the name only once Inter is in, or the points land on the
  // fallback font's letters. Never wait more than 1.4s for it.
  const size = getComputedStyle(name).fontSize;
  Promise.race([
    document.fonts.load('600 ' + size + ' Inter').then(() => document.fonts.ready),
    new Promise((r) => setTimeout(r, 1400))
  ]).catch(() => {}).then(() => requestAnimationFrame(play));

  function play() {
    if (started || !root.classList.contains('intro')) return; // too late: already revealed
    started = true;
    const heroBox = hero.getBoundingClientRect();
    const nameBox = name.getBoundingClientRect();
    const cs = getComputedStyle(name);
    const fontPx = parseFloat(cs.fontSize);

    // 1. Draw each word, at exactly where the page laid it out, into an
    //    offscreen canvas (2x for clean edges).
    const S = 2, PAD = 4;
    const ow = Math.ceil(nameBox.width) + PAD * 2;
    const oh = Math.ceil(nameBox.height) + PAD * 2;
    const off = document.createElement('canvas');
    off.width = ow * S;
    off.height = oh * S;
    const o = off.getContext('2d', { willReadFrequently: true });
    o.scale(S, S);
    o.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    if ('letterSpacing' in o) o.letterSpacing = cs.letterSpacing;
    o.fillStyle = '#000';

    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    const re = /\S+/g;
    let m;
    while ((m = re.exec(text.data))) {
      const range = document.createRange();
      range.setStart(text, m.index);
      range.setEnd(text, m.index + m[0].length);
      const r = range.getBoundingClientRect();
      const met = o.measureText(m[0]);
      const asc = met.fontBoundingBoxAscent || fontPx * 0.97;
      const dsc = met.fontBoundingBoxDescent || fontPx * 0.24;
      const baseline = r.top + (r.height - asc - dsc) / 2 + asc;
      o.fillText(m[0], r.left - nameBox.left + PAD, baseline - nameBox.top + PAD);
      left = Math.min(left, r.left); right = Math.max(right, r.right);
      top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom);
    }

    // 2. Collect the inked pixels, then pick N of them at random as targets.
    const px = o.getImageData(0, 0, off.width, off.height).data;
    const ink = [];
    for (let y = 0; y < off.height; y++) {
      for (let x = 0; x < off.width; x++) {
        if (px[(y * off.width + x) * 4 + 3] > 120) ink.push(x, y);
      }
    }
    const count = ink.length / 2;
    if (!count) { finish(); return; }

    const N = Math.max(500, Math.min(window.innerWidth < 600 ? 1300 : 1900, Math.round(count / (S * S) / 3)));
    const offX = nameBox.left - heroBox.left - PAD;
    const offY = nameBox.top - heroBox.top - PAD;
    const cx = (left + right) / 2 - heroBox.left;
    const cy = (top + bottom) / 2 - heroBox.top;
    const sx = (right - left) * 0.42;
    const sy = Math.max(bottom - top, 90) * 0.85;
    const spanX = Math.max(1, right - left);

    const tx = new Float32Array(N), ty = new Float32Array(N);
    const ex = new Float32Array(N), ey = new Float32Array(N);
    const delay = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const k = (Math.random() * count) | 0;
      tx[i] = ink[k * 2] / S + offX;
      ty[i] = ink[k * 2 + 1] / S + offY;
      // ε ~ N(0, 1), by Box–Muller
      const a = Math.sqrt(-2 * Math.log(1 - Math.random()));
      const b = 2 * Math.PI * Math.random();
      ex[i] = a * Math.cos(b) * sx;
      ey[i] = a * Math.sin(b) * sy;
      // Mostly random, slightly left-to-right, so the name reads as it forms.
      delay[i] = 230 * (0.55 * Math.random() + 0.45 * ((tx[i] + heroBox.left - left) / spanX));
    }

    // 3. Overlay canvas, then hand the rest of the hero to the CSS stagger.
    const canvas = document.createElement('canvas');
    canvas.className = 'intro-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    hero.appendChild(canvas);
    const { ctx, w: W, h: H } = motion.fit(canvas);

    name.style.opacity = '0';
    root.classList.remove('intro');
    root.classList.add('intro-play');

    const DENOISE = 900;   // ms until the latest point lands
    const REVEAL = 700;    // ms when the real text starts to fade in
    const dot = Math.max(0.85, fontPx / 62);
    let t0 = 0, revealed = false;

    const tick = (now) => {
      if (!t0) t0 = now;
      const t = now - t0;

      if (!revealed && t >= REVEAL) {
        revealed = true;
        name.style.transition = 'opacity 520ms cubic-bezier(0.4, 0, 0.2, 1)';
        name.style.opacity = '1';
      }

      const alpha = Math.min(1, t / 140) *
        (t < REVEAL + 80 ? 1 : Math.max(0, 1 - (t - REVEAL - 80) / 360));

      ctx.clearRect(0, 0, W, H);
      if (t > REVEAL && alpha <= 0) { canvas.remove(); return; }

      ctx.globalAlpha = alpha;
      ctx.fillStyle = motion.colors.fg;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const u = motion.clamp01((t - delay[i]) / (DENOISE - 230));
        const ab = 1 - Math.pow(1 - u, 3);          // ᾱ, the signal fraction
        const s = Math.sqrt(ab), n = Math.sqrt(1 - ab);
        const x = cx + s * (tx[i] - cx) + n * (ex[i] + (Math.random() - 0.5) * 2.4);
        const y = cy + s * (ty[i] - cy) + n * (ey[i] + (Math.random() - 0.5) * 2.4);
        ctx.moveTo(x + dot, y);
        ctx.arc(x, y, dot, 0, 6.2832);
      }
      ctx.fill();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    // Last CSS step (the links) ends at 2.3s.
    setTimeout(() => { canvas.remove(); finish(); }, 2450);
  }
})();


/* ========================================================================
   THEME TOGGLE — circular reveal that radiates the new theme out from the
   button, via the View Transitions API. Falls back to an instant swap when
   the API is unavailable or the user prefers reduced motion.
   ======================================================================== */

(() => {
  'use strict';

  const root = document.documentElement;
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;

  const prefersReduced =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const labelFor = (theme) =>
    theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';

  // Reflect the theme set before paint by the inline <head> script.
  const initial = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  toggle.setAttribute('aria-label', labelFor(initial));

  const apply = (theme) => {
    root.setAttribute('data-theme', theme);
    toggle.setAttribute('aria-label', labelFor(theme));
    try { localStorage.setItem('theme', theme); } catch (e) {}
  };

  toggle.addEventListener('click', () => {
    const current = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';

    // No View Transitions support, or reduced motion → swap instantly.
    if (!document.startViewTransition || prefersReduced) {
      apply(next);
      return;
    }

    // Expand a circle from the centre of the toggle button.
    const rect = toggle.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const transition = document.startViewTransition(() => apply(next));

    transition.ready.then(() => {
      root.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`
          ]
        },
        {
          duration: 520,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          pseudoElement: '::view-transition-new(root)'
        }
      );
    });
  });
})();


/* ========================================================================
   SKILL CHIPS — staggered entrance as each skill row scrolls into view.

   Progressive enhancement: the `data-reveal` attribute is what makes the CSS
   hide the chips in the first place, and only this script sets it. With JS
   disabled, or reduced motion requested, the attribute is never added and
   every chip renders immediately in its final state.
   ======================================================================== */

(() => {
  'use strict';

  const skills = document.querySelector('.skills');
  if (!skills) return;

  const groups = Array.from(skills.querySelectorAll('.skill-group'));
  if (!groups.length) return;

  const prefersReduced =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // No observer support or reduced motion → leave the chips plainly visible.
  if (prefersReduced || !('IntersectionObserver' in window)) return;

  skills.setAttribute('data-reveal', '');

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('in');
        io.unobserve(entry.target); // fire once per row, never on scroll back up
      });
    },
    { threshold: 0.25, rootMargin: '0px 0px -8% 0px' }
  );

  groups.forEach((g) => io.observe(g));
})();


/* ========================================================================
   LANGUAGE SWITCHER — a custom pill that drives Google's whole-page
   translation engine, with an animated menu.
   ======================================================================== */

window.googleTranslateElementInit = function () {
  /* global google */
  new google.translate.TranslateElement(
    {
      pageLanguage: 'en',
      includedLanguages: 'en,de,fr,es,hi,ja,zh-CN,pt,it,ru,ko',
      autoDisplay: false
    },
    'google_translate_element'
  );
};

(() => {
  'use strict';

  const sw = document.getElementById('lang-switch');
  const btn = document.getElementById('lang-btn');
  const menu = document.getElementById('lang-menu');
  const codeEl = document.getElementById('lang-code');
  if (!sw || !btn || !menu) return;

  const options = Array.from(menu.querySelectorAll('.lang-option'));

  const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  // Google reads the `googtrans` cookie to decide the target language.
  const setCookie = (value, remove) => {
    const exp = remove
      ? '; expires=Thu, 01 Jan 1970 00:00:00 UTC'
      : '; expires=' + new Date(Date.now() + 365 * 864e5).toUTCString();
    const host = location.hostname;
    document.cookie = 'googtrans=' + value + exp + '; path=/';
    document.cookie = 'googtrans=' + value + exp + '; path=/; domain=' + host;
    if (host.indexOf('.') > -1) {
      document.cookie = 'googtrans=' + value + exp + '; path=/; domain=.' + host;
    }
  };

  // Drive Google's hidden <select> so it translates without a reload.
  const pushToGoogle = (lang, tries) => {
    const combo = document.querySelector('.goog-te-combo');
    if (combo) {
      combo.value = lang === 'en' ? '' : lang;
      combo.dispatchEvent(new Event('change'));
      return;
    }
    if (tries > 0) setTimeout(() => pushToGoogle(lang, tries - 1), 250);
  };

  const tagFor = (lang) => {
    const o = options.find((x) => x.dataset.lang === lang);
    return o ? o.querySelector('.lang-tag').textContent : 'EN';
  };

  const reflect = (lang) => {
    if (codeEl) codeEl.textContent = tagFor(lang);
    options.forEach((o) => o.classList.toggle('is-current', o.dataset.lang === lang));
  };

  const setLanguage = (lang, translate) => {
    write('lang', lang);
    if (lang === 'en') {
      // Google's combo can't reliably restore the original, so clear the
      // cookie and reload to the untranslated page.
      setCookie('', true);
      reflect('en');
      if (translate) location.reload();
      return;
    }
    setCookie('/en/' + lang, false);
    reflect(lang);
    if (translate) pushToGoogle(lang, 16);
  };

  /* ---- menu open / close ---- */
  const openMenu = () => { sw.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); };
  const closeMenu = () => { sw.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (sw.classList.contains('open')) closeMenu(); else openMenu();
  });
  options.forEach((opt) => {
    const choose = () => { setLanguage(opt.dataset.lang, true); closeMenu(); };
    opt.addEventListener('click', choose);
    opt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); }
    });
  });
  document.addEventListener('click', (e) => { if (!sw.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  /* ---- restore saved language on load ---- */
  const saved = read('lang', 'en');
  reflect(saved);
  if (saved === 'en') {
    setCookie('', true); // clear any stray translation cookie so English stays English
  } else {
    setCookie('/en/' + saved, false); // cookie drives Google's auto-translate on load
    pushToGoogle(saved, 20);
  }

  /* ---- suppress Google's injected top banner + page offset ----
     Google can inject its banner with high-priority styles, so we hide it
     with inline !important (beats stylesheets) and re-apply as it reappears. */
  (() => {
    const kill = () => {
      document
        .querySelectorAll('.goog-te-banner-frame, iframe.goog-te-banner-frame, iframe.skiptranslate')
        .forEach((el) => el.style.setProperty('display', 'none', 'important'));
      if (document.body) document.body.style.setProperty('top', '0px', 'important');
      document.documentElement.style.setProperty('top', '0px', 'important');
    };
    kill();
    new MutationObserver(kill).observe(document.documentElement, { childList: true, subtree: true });
    let n = 0;
    const iv = setInterval(() => { kill(); if (++n > 30) clearInterval(iv); }, 300);
  })();

})();


/* ========================================================================
   SECTION NAV — highlights whichever section is currently in view.

   Uses a rootMargin that collapses the viewport to a band just under the
   sticky header, so "active" means the section the reader is actually on
   rather than any section merely touching the viewport. Sections are kept in
   document order and the first (topmost) intersecting one wins, which keeps
   the state stable when a short section and a long one overlap in the band.
   ======================================================================== */

(() => {
  'use strict';

  const links = Array.from(document.querySelectorAll('.nav-links a'));
  if (!links.length || !('IntersectionObserver' in window)) return;

  const byId = new Map();
  const sections = [];

  links.forEach((link) => {
    const el = document.querySelector(link.getAttribute('href'));
    if (!el) return;
    byId.set(el.id, link);
    sections.push(el);
  });
  if (!sections.length) return;

  const visible = new Set();

  const paint = () => {
    // Document order, so the topmost visible section is the active one.
    const active = sections.find((s) => visible.has(s.id));
    links.forEach((l) => l.classList.remove('is-active'));
    if (active) byId.get(active.id).classList.add('is-active');
  };

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) visible.add(e.target.id);
        else visible.delete(e.target.id);
      });
      paint();
    },
    { rootMargin: '-72px 0px -65% 0px', threshold: 0 }
  );

  sections.forEach((s) => io.observe(s));
})();


/* ========================================================================
   CAREER GRAPH — the experience list drawn as time. One row per role,
   newest on top, so the bars climb to the right. A playhead sweeps the axis
   once, and each bar grows as the playhead passes it. Each bar is labelled
   company first, then position; the dates show in the readout on hover.
   Data: data-from / data-to / data-label (company) / data-role (position)
   on each .entry; no data-to means current.
   ======================================================================== */

(() => {
  'use strict';

  const fig = document.querySelector('.career-graph');
  const list = document.querySelector('.timeline');
  if (!fig || !list) return;
  const entries = Array.from(list.querySelectorAll('.entry[data-from]'));
  if (!entries.length) return;

  const NS = 'http://www.w3.org/2000/svg';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = (s) => { const [y, m] = s.split('-').map(Number); return y * 12 + (m - 1); };
  const today = new Date();
  const nowM = today.getFullYear() * 12 + today.getMonth() + (today.getDate() - 1) / 30;

  const roles = entries.map((el) => {
    const from = month(el.dataset.from);
    const current = !el.dataset.to;
    const to = current ? nowM : month(el.dataset.to) + 1;
    const fy = Math.floor(from / 12);
    const ty = Math.floor((Math.ceil(to) - 1) / 12);
    const f = MON[from % 12];
    const e = MON[(Math.ceil(to) - 1) % 12];
    const when = current ? f + ' ' + fy + ' – now'
      : fy === ty ? f + ' – ' + e + ' ' + ty
      : f + ' ' + fy + ' – ' + e + ' ' + ty;
    return {
      el, from, to, current, when,
      label: el.dataset.label || '',
      role: el.dataset.role || ''
    };
  });

  const start = Math.floor(Math.min(...roles.map((r) => r.from)) / 12) * 12;
  const end = Math.max(nowM, ...roles.map((r) => r.to)) + 1.5;
  const ROW = 26, TOP = 26, BAR = 3;
  const cur = roles.findIndex((r) => r.current);
  const first = Math.min(...roles.map((r) => r.from));
  const span = roles.length + ' roles since ' + MON[first % 12] + ' ' + Math.floor(first / 12);

  const make = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };

  let g = null;          // handles into the current drawing
  let progress = start;  // playhead position, in months

  const light = (i, fromGraph) => {
    if (!g) return;
    fig.classList.toggle('is-focus', i >= 0);
    g.rows.forEach((r, j) => r.node.classList.toggle('is-lit', j === i));
    g.readout.textContent = i >= 0 ? roles[i].role + ', ' + roles[i].label + '  ·  ' + roles[i].when : span;
    list.classList.toggle('is-focus', fromGraph && i >= 0);
    entries.forEach((e, j) => e.classList.toggle('is-lit', fromGraph && j === i));
  };

  function build() {
    const width = Math.round(fig.getBoundingClientRect().width);
    if (!width) return;
    const n = roles.length;
    const axisY = TOP + n * ROW + 8;
    const H = axisY + 20;
    const x = (m) => ((m - start) / (end - start)) * width;
    const barY = (i) => TOP + i * ROW + 16;

    fig.textContent = '';
    const svg = make('svg', { viewBox: '0 0 ' + width + ' ' + H, width, height: H, focusable: 'false' }, fig);

    const readout = make('text', { class: 'cg-readout', x: 0, y: 10 }, svg);
    readout.textContent = span;
    const axis = make('line', { class: 'cg-axis', x1: 0, y1: axisY + 0.5, x2: 0, y2: axisY + 0.5 }, svg);

    const years = [];
    for (let y = Math.ceil(start / 12); y * 12 <= end; y++) {
      const xm = Math.round(x(y * 12)) + 0.5;
      const tick = make('line', { class: 'cg-tick', x1: xm, y1: axisY, x2: xm, y2: axisY + 5 }, svg);
      const label = make('text', { class: 'cg-year', x: xm + 4, y: axisY + 15 }, svg);
      label.textContent = y;
      years.push({ m: y * 12, nodes: [tick, label] });
    }

    const nowX = x(nowM);
    const nowLine = make('line', { class: 'cg-now', x1: nowX, y1: barY(Math.max(cur, 0)) + 8, x2: nowX, y2: axisY }, svg);

    const rows = roles.map((r, i) => {
      const node = make('g', { class: 'cg-row' + (r.current ? ' is-current' : '') }, svg);
      make('rect', { class: 'cg-hit', x: 0, y: TOP + i * ROW, width, height: ROW }, node);
      // Company, then position. Labels in the right half hang off the
      // bar's end; build() clamps any label that would leave the drawing.
      const rightSide = x(r.from) > width * 0.5;
      const label = make('text', {
        class: 'cg-label',
        x: rightSide ? x(r.to) : x(r.from),
        y: barY(i) - 6,
        'text-anchor': rightSide ? 'end' : 'start'
      }, node);
      make('tspan', {}, label).textContent = r.label;
      if (r.role) make('tspan', { class: 'cg-role' }, label).textContent = '  ·  ' + r.role;
      const bar = make('rect', { class: 'cg-bar', x: x(r.from), y: barY(i), width: 0, height: BAR, rx: BAR / 2 }, node);

      node.addEventListener('mouseenter', () => light(i, true));
      node.addEventListener('mouseleave', () => light(-1, true));
      node.addEventListener('click', () => {
        r.el.scrollIntoView({ behavior: motion.reduced ? 'auto' : 'smooth', block: 'center' });
      });
      return { node, bar, r };
    });

    let head = null, pulse = null;
    if (cur >= 0) {
      pulse = make('circle', { class: 'cg-pulse', cx: nowX, cy: barY(cur) + BAR / 2, r: 3.2 }, svg);
      head = make('circle', { class: 'cg-head', cx: nowX, cy: barY(cur) + BAR / 2, r: 3.2 }, svg);
    }
    const play = make('line', { class: 'cg-play', x1: 0, y1: TOP, x2: 0, y2: axisY }, svg);

    g = { x, axis, years, rows, nowLine, head, pulse, play, readout };

    // Keep every label inside the drawing, whatever the width.
    rows.forEach(({ node }) => {
      const t = node.querySelector('.cg-label');
      const b = t.getBBox();
      if (b.x < 0) { t.setAttribute('text-anchor', 'start'); t.setAttribute('x', 0); }
      else if (b.x + b.width > width) { t.setAttribute('text-anchor', 'end'); t.setAttribute('x', width); }
    });
    paint(progress);
  }

  function paint(p) {
    if (!g) return;
    const px = g.x(Math.min(p, nowM));
    g.axis.setAttribute('x2', Math.max(0, g.x(p)));
    g.years.forEach((y) => y.nodes.forEach((n) => { n.style.opacity = p >= y.m ? 1 : 0; }));
    g.rows.forEach(({ node, bar, r }) => {
      const w = Math.max(0, g.x(Math.min(p, r.to)) - g.x(r.from));
      bar.setAttribute('width', w);
      node.classList.toggle('is-on', p >= r.from);
    });
    const arrived = p >= nowM;
    g.play.setAttribute('x1', px);
    g.play.setAttribute('x2', px);
    g.play.style.opacity = arrived || p <= start ? 0 : 1;
    g.nowLine.style.opacity = arrived ? 1 : 0;
    if (g.head) g.head.style.opacity = arrived ? 1 : 0;
    if (g.pulse) g.pulse.style.display = arrived ? '' : 'none';
  }

  fig.classList.add('is-ready');
  build();

  entries.forEach((e, i) => {
    e.addEventListener('mouseenter', () => light(i, false));
    e.addEventListener('mouseleave', () => light(-1, false));
  });

  if ('ResizeObserver' in window) {
    let lastW = 0;
    new ResizeObserver((es) => {
      const w = Math.round(es[0].contentRect.width);
      if (w && w !== lastW) { lastW = w; build(); }
    }).observe(fig);
  }

  if (motion.reduced) { progress = nowM; paint(progress); return; }

  motion.whenSeen(fig, () => {
    const DURATION = 1700;
    let t0 = 0;
    const tick = (now) => {
      if (!t0) t0 = now;
      const k = motion.easeStd(motion.clamp01((now - t0) / DURATION));
      progress = start + (nowM - start) * k;
      paint(progress);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, 0.45);
})();


/* ========================================================================
   STEP EXPLAINER — shared by the Orchestraty and smart-glasses figures.
   Plays a figure's numbered steps while it is on screen: marks the active
   step, fills its hairline, shows its sentence, and sets cumulative .s0 …
   .sN classes so the CSS can build the picture up step by step. Clicking a
   step jumps to it; hovering or focusing the figure pauses. Under reduced
   motion nothing plays: the last step shows, and steps still click.
   ======================================================================== */

const explainer = (fig, { durations, onStep, onFrame }) => {
  const buttons = Array.from(fig.querySelectorAll('.ex-steps button'));
  const says = Array.from(fig.querySelectorAll('.ex-say [data-say]'));
  const N = buttons.length;
  let cur = -1, elapsed = 0, last = 0, raf = 0, hold = false, onScreen = false;

  const set = (k) => {
    cur = k;
    elapsed = 0;
    buttons.forEach((b, j) => {
      b.classList.toggle('is-on', j === k);
      b.classList.toggle('is-done', j < k);
      b.style.setProperty('--p', 0);
      if (j === k) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    says.forEach((s, j) => s.classList.toggle('is-on', j === k));
    for (let j = 0; j < N; j++) fig.classList.toggle('s' + j, j <= k);
    if (onStep) onStep(k);
    if (onFrame) onFrame(k, motion.reduced ? durations[k] : 0, durations[k]);
  };

  const loop = (now) => {
    const dt = last ? Math.min(50, now - last) : 0;
    last = now;
    if (!hold) {
      elapsed += dt;
      buttons[cur].style.setProperty('--p', Math.min(1, elapsed / durations[cur]));
      if (elapsed >= durations[cur]) set((cur + 1) % N);
    }
    if (onFrame) onFrame(cur, Math.min(elapsed, durations[cur]), durations[cur]);
    raf = requestAnimationFrame(loop);
  };
  const run = () => {
    if (motion.reduced || raf || !onScreen) return;
    last = 0;
    raf = requestAnimationFrame(loop);
  };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  buttons.forEach((b, j) => b.addEventListener('click', () => {
    set(j);
    if (motion.reduced) buttons.forEach((x, i) => x.style.setProperty('--p', i === j ? 1 : 0));
  }));
  fig.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hold = true; });
  fig.addEventListener('pointerleave', () => { hold = false; });
  fig.addEventListener('focusin', () => { hold = true; });
  fig.addEventListener('focusout', () => { hold = false; });

  if (motion.reduced) {
    set(N - 1);
    buttons[N - 1].style.setProperty('--p', 1);
    return { redraw: () => onFrame && onFrame(cur, durations[cur], durations[cur]) };
  }
  set(0);
  motion.whileVisible(fig, (on) => {
    onScreen = on;
    if (on) run(); else stop();
  });
  return { redraw: () => onFrame && onFrame(cur, elapsed, durations[cur]) };
};


/* ========================================================================
   ORCHESTRATY — how it works, in six steps, with real code. The picture
   itself is HTML and CSS (crisp, readable text); the step controller above
   drives it. The story follows the project's README: Agent A changes a
   function's contract, Orchestraty finds Agent B's caller and leaves it a
   note before its next edit, B adapts, and both branches merge clean.
   ======================================================================== */

(() => {
  'use strict';
  const fig = document.querySelector('[data-ex="orch"]');
  if (!fig) return;
  explainer(fig, { durations: [2600, 3600, 4200, 4200, 3400, 3600] });
})();


/* ========================================================================
   SMART GLASSES — the hardware, redrawn from the project's own diagram and
   animated in four steps: the cameras and the ultrasonic pair sense, frames
   run down the woven cable to the Jetson TX2, the answer comes back up to
   the speakers, and SOS sends the GPS fix. Hovering any part or its label
   names it and says what it does.
   ======================================================================== */

(() => {
  'use strict';

  const fig = document.querySelector('[data-ex="glasses"]');
  if (!fig) return;
  const svg = fig.querySelector('.gx');
  const fx = svg.querySelector('.gx-fx');
  const fan = svg.querySelector('.gx-fan');
  const led = svg.querySelector('[data-part="led"] rect');
  const sos = svg.querySelector('[data-part="sos"] rect');
  const cable = svg.querySelector('.gx-cable');
  const outs = Array.from(svg.querySelectorAll('.gx-o'));
  const partSay = fig.querySelector('[data-part-say]');
  const NS = 'http://www.w3.org/2000/svg';
  const TAU = Math.PI * 2;
  const L = cable.getTotalLength();

  const PARTS = {
    ultrasonic: 'Ultrasonic sensor: two transducers on the bridge time an echo to measure how far away an obstacle is.',
    cameras: 'Cameras: one in each lens, feeding obstacle detection, text reading and the currency check.',
    speakers: 'Speakers: in the temples, so results are heard without blocking the ears.',
    cable: 'Woven cable: carries frames down to the box and audio back up to the glasses.',
    box: 'Processing box: everything heavy lives here, off the face, in a pocket.',
    led: 'LED indicator: power and status at a glance.',
    typec: 'Type-C port: charges the battery.',
    sd: 'SD card slot: storage for the models and the system.',
    buttons: 'Mode buttons: switch between navigation, reading, currency and assistant modes.',
    jetson: 'NVIDIA Jetson TX2: runs every model on the device itself, with no cloud.',
    gps: 'GPS module: the location sent with an SOS alert.',
    battery: 'Lithium-ion battery: 3.7 V, 4950 mAh, powering the box and the glasses.',
    sos: 'SOS button: emails an emergency contact the location and recent call records.'
  };
  const HOT = [['cameras', 'ultrasonic'], ['cable', 'jetson', 'led'], ['cable', 'speakers'], ['sos', 'gps']];
  const OUT = [
    ['sense    ›  ', 'camera frame + echo: obstacle 1.2 m ahead'],
    ['jetson   ›  ', 'person 0.92 · 2.1 m    chair 0.88 · 1.2 m, right'],
    ['speaker  ›  ', '“Chair ahead, 1.2 metres, on your right.”']
  ];
  const SOS_OUT = ['sos      ›  ', 'GPS fix + recent calls, emailed to an emergency contact'];

  let hovering = null, step = 0;

  const groups = (name) => svg.querySelectorAll('[data-part="' + name + '"]');
  const paintHot = () => {
    svg.querySelectorAll('[data-part]').forEach((g) => g.classList.remove('is-hot'));
    (hovering ? [hovering] : HOT[step]).forEach((n) => groups(n).forEach((g) => g.classList.add('is-hot')));
  };

  // A small pool of SVG shapes for the per-frame effects.
  const pool = [];
  let used = 0;
  const shape = (tag, cls) => {
    let el = pool[used];
    if (!el || el.tagName !== tag) {
      el = document.createElementNS(NS, tag);
      if (pool[used]) fx.replaceChild(el, pool[used]); else fx.appendChild(el);
      pool[used] = el;
    }
    el.setAttribute('class', cls || '');
    el.style.display = '';
    used++;
    return el;
  };
  const endFrame = () => { for (let i = used; i < pool.length; i++) pool[i].style.display = 'none'; used = 0; };

  const ring = (cx, cy, r, a) => {
    const c = shape('circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', r);
    c.style.opacity = a;
  };
  const arc = (cx, cy, r, a0, a1, a) => {
    const p = shape('path');
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    p.setAttribute('d', 'M' + x0 + ' ' + y0 + ' A' + r + ' ' + r + ' 0 0 1 ' + x1 + ' ' + y1);
    p.style.opacity = a;
  };
  const pulse = (s) => {
    const pt = cable.getPointAtLength(Math.max(0, Math.min(L, s)));
    const c = shape('circle', 'gx-pulse');
    c.setAttribute('cx', pt.x); c.setAttribute('cy', pt.y); c.setAttribute('r', 4);
    c.style.opacity = 1;
  };
  const typed = (el, prefix, text, k, now) => {
    const n = Math.round(text.length * motion.clamp01(k));
    el.textContent = prefix + text.slice(0, n);
    el.classList.toggle('is-now', !!now);
  };

  let fanA = 0, lastT = 0;
  function frame(i, t, dur) {
    const u = t / dur;
    // Fan: idles slowly, spins up while the Jetson works.
    const dt = Math.max(0, t - lastT); lastT = t;
    fanA = (fanA + dt * (i === 1 ? 0.9 : 0.12)) % 360;
    fan.setAttribute('transform', 'rotate(' + fanA.toFixed(1) + ' 927 327)');
    led.style.opacity = i === 1 ? (Math.floor(t / 180) % 2 ? 0.35 : 1) : 1;
    sos.style.opacity = i === 3 ? (Math.floor(t / 260) % 2 ? 0.45 : 1) : 1;

    if (i === 0) {
      // Sonar arcs climb off the ultrasonic pair; the cameras pulse.
      for (let k = 0; k < 3; k++) {
        const ph = (t / 1000 + k / 3) % 1;
        arc(276, 116, 16 + ph * 64, -Math.PI * 0.88, -Math.PI * 0.12, (1 - ph) * 0.8);
      }
      for (let k = 0; k < 2; k++) {
        const ph = (t / 1100 + k / 2) % 1;
        ring(160, 222, 14 + ph * 30, (1 - ph) * 0.7);
        ring(386, 236, 14 + ph * 30, (1 - ph) * 0.7);
      }
    } else if (i === 1) {
      // Frames run down the cable to the box.
      for (let k = 0; k < 3; k++) pulse(((t / 1300 + k / 3) % 1) * L);
      if (t > 1400) {
        const ph = ((t - 1400) / 900) % 1;
        ring(927, 327, 24 + ph * 18, (1 - ph) * 0.6);
      }
    } else if (i === 2) {
      // The answer runs back up, then sound leaves the speakers.
      if (u < 0.55) for (let k = 0; k < 3; k++) pulse(L - ((t / 1300 + k / 3) % 1) * L);
      if (u > 0.3) {
        for (let k = 0; k < 3; k++) {
          const ph = (t / 900 + k / 3) % 1;
          arc(568, 182, 14 + ph * 34, -Math.PI * 0.62, Math.PI * 0.02, (1 - ph) * 0.75);
          arc(432, 99, 12 + ph * 26, -Math.PI * 0.85, -Math.PI * 0.3, (1 - ph) * 0.55);
        }
      }
    } else {
      // SOS: the button pulses and the GPS module calls out.
      for (let k = 0; k < 3; k++) {
        const ph = (t / 1000 + k / 3) % 1;
        arc(846, 351, 10 + ph * 46, -Math.PI * 0.95, -Math.PI * 0.05, (1 - ph) * 0.7);
      }
      const ph = (t / 900) % 1;
      ring(984.5, 330, 22 + ph * 16, (1 - ph) * 0.5);
    }
    endFrame();

    // Output lines: each step writes its own line; earlier lines stay, dimmed.
    outs.forEach((el, j) => {
      if (i === 3) {
        if (j < 2) { el.textContent = ''; return; }
        typed(el, SOS_OUT[0], SOS_OUT[1], (t - 300) / 1400, true);
        return;
      }
      if (j > i) { el.textContent = ''; return; }
      if (j < i) { typed(el, OUT[j][0], OUT[j][1], 1, false); return; }
      typed(el, OUT[j][0], OUT[j][1], (t - (i === 2 ? 900 : 400)) / 1300, true);
    });
  }

  const ctl = explainer(fig, {
    durations: [3400, 3800, 4000, 3600],
    onStep: (k) => { step = k; lastT = 0; paintHot(); },
    onFrame: frame
  });

  svg.querySelectorAll('[data-part]').forEach((g) => {
    g.addEventListener('pointerenter', () => {
      hovering = g.dataset.part;
      partSay.textContent = PARTS[hovering] || '';
      fig.classList.add('is-part');
      paintHot();
    });
    g.addEventListener('pointerleave', () => {
      hovering = null;
      fig.classList.remove('is-part');
      paintHot();
    });
  });
  motion.onTheme(() => ctl.redraw());
})();


/* ========================================================================
   SINGLE-PIXEL CAMERA — 5% capture, full scene. The scene is a surface
   drawn as depth profiles (1,430 points across 13 rows). First 72 of those
   points arrive — 5% — and the counter climbs to 5.0%; then the full
   surface is reconstructed through them, left to right, with hidden lines
   removed. Plays once when seen; hovering the card replays it.
   ======================================================================== */

(() => {
  'use strict';

  const fig = document.querySelector('.viz-spc');
  if (!fig) return;
  const canvas = fig.querySelector('canvas');
  const pctEl = fig.querySelector('[data-v="pct"]');
  const card = fig.closest('.project');

  const ROWS = 13, COLS = 110, TOTAL = ROWS * COLS, PICK = Math.round(TOTAL * 0.05);

  // The sampled 5%, in arrival order (seeded shuffle).
  const r = motion.seeded(5);
  const order = Array.from({ length: TOTAL }, (_, i) => i);
  for (let i = TOTAL - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const rank = new Map(order.slice(0, PICK).map((idx, k) => [idx, k]));

  // The scene: two smooth objects and a low one on a gently uneven floor.
  const BUMPS = [[0.34, 0.5, 0.12, 1.0], [0.66, 0.4, 0.085, 0.72], [0.8, 0.8, 0.07, 0.42]];
  const z = (u, v) => 0.035 * Math.sin(u * 11 + v * 4) + BUMPS.reduce((s, [cx, cy, sd, a]) =>
    s + a * Math.exp(-((u - cx) ** 2 + (v - cy) ** 2) / (2 * sd * sd)), 0);

  let ctx, W = 0, H = 0, pts = [];
  let state = { dots: 0, line: 0 };

  function geometry() {
    ({ ctx, w: W, h: H } = motion.fit(canvas));
    const lift = Math.min(36, H * 0.34), top = lift * 0.8 + 3, bottom = H - 4, padX = 3;
    const mid = W / 2;
    pts = [];
    for (let j = 0; j < ROWS; j++) {
      const v = j / (ROWS - 1);              // 0 = far, 1 = near
      const base = top + v * (bottom - top);
      const spread = 0.8 + 0.2 * v;          // far rows sit narrower: perspective
      const rise = lift * (0.75 + 0.25 * v);
      const row = new Float32Array(COLS * 2);
      for (let k = 0; k < COLS; k++) {
        const u = k / (COLS - 1);
        row[k * 2] = mid + (padX + u * (W - padX * 2) - mid) * spread;
        row[k * 2 + 1] = base - z(u, v) * rise;
      }
      pts.push(row);
    }
  }

  function draw() {
    const c = motion.colors;
    const { dots, line } = state;
    ctx.clearRect(0, 0, W, H);
    const lim = line * (COLS - 1);
    const whole = Math.floor(lim), frac = lim - whole;

    for (let j = 0; j < ROWS; j++) {
      const row = pts[j];
      if (lim > 0) {
        const trace = () => {
          ctx.moveTo(row[0], row[1]);
          for (let k = 1; k <= whole; k++) ctx.lineTo(row[k * 2], row[k * 2 + 1]);
          if (whole < COLS - 1 && frac > 0) {
            ctx.lineTo(row[whole * 2] + (row[whole * 2 + 2] - row[whole * 2]) * frac,
                       row[whole * 2 + 1] + (row[whole * 2 + 3] - row[whole * 2 + 1]) * frac);
          }
        };
        // Occlude whatever lies behind this profile, then stroke it.
        ctx.beginPath();
        trace();
        const endX = row[0] + (row[(COLS - 1) * 2] - row[0]) * line;
        ctx.lineTo(endX, H);
        ctx.lineTo(row[0], H);
        ctx.closePath();
        ctx.fillStyle = c.bg;
        ctx.fill();
        ctx.beginPath();
        trace();
        ctx.globalAlpha = 0.4 + 0.6 * (j / (ROWS - 1)); // depth: far rows fainter
        ctx.strokeStyle = c['fg-muted'];
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // This row's samples, drawn before nearer rows so they occlude properly.
      ctx.fillStyle = c.fg;
      for (let k = 0; k < COLS; k++) {
        const rk = rank.get(j * COLS + k);
        if (rk === undefined || rk >= dots) continue;
        const grow = Math.min(1, dots - rk);
        ctx.beginPath();
        ctx.arc(row[k * 2], row[k * 2 + 1], 1.5 * grow, 0, 6.2832);
        ctx.fill();
      }
    }
    if (pctEl) pctEl.textContent = (Math.min(Math.floor(dots), PICK) / TOTAL * 100).toFixed(1) + '%';
  }

  let running = false;
  function play() {
    if (running) return;
    running = true;
    fig.classList.remove('is-done');
    const A = 1100, B0 = 1050, B = 1500;
    let t0 = 0;
    const tick = (now) => {
      if (!t0) t0 = now;
      const t = now - t0;
      state = {
        dots: PICK * motion.clamp01(t / A),
        line: motion.easeStd(motion.clamp01((t - B0) / B))
      };
      draw();
      if (t < B0 + B) requestAnimationFrame(tick);
      else { running = false; fig.classList.add('is-done'); }
    };
    requestAnimationFrame(tick);
  }

  geometry();
  if (motion.reduced) {
    state = { dots: PICK, line: 1 };
    fig.classList.add('is-done');
  }
  draw();

  motion.onTheme(() => draw());

  if ('ResizeObserver' in window) {
    let lastW = W;
    new ResizeObserver(() => {
      const w = Math.round(canvas.getBoundingClientRect().width);
      if (w === lastW) return;
      lastW = w;
      geometry();
      draw();
    }).observe(canvas);
  }

  if (motion.reduced) return;
  motion.whenSeen(fig, play, 0.6);
  if (card) card.addEventListener('pointerenter', () => { if (fig.classList.contains('is-done')) play(); });
})();


/* ========================================================================
   NON-LINE-OF-SIGHT IMAGING — seeing around a corner. Laser and detector on
   the left; a wall blocks their view of the scene on the right. Each pulse
   goes up to the visible relay wall, scatters down to the hidden scene,
   comes back to the wall and returns to the detector. Every return adds to
   the reconstruction until the hidden objects are recovered. The objects
   are never drawn directly until then: they appear only as recovered
   points. Plays once when seen; hovering the card replays it.
   ======================================================================== */

(() => {
  'use strict';

  const fig = document.querySelector('.viz-nlos');
  if (!fig) return;
  const canvas = fig.querySelector('canvas');
  const countEl = fig.querySelector('[data-v="pulses"]');
  const card = fig.closest('.project');

  const PULSES = 6, GAP = 470, SPEED = 0.85, TRAIL = 70; // ms, px/ms, px
  const TAU = Math.PI * 2;

  let ctx, W = 0, H = 0, g = null, END = 0;

  function geometry() {
    ({ ctx, w: W, h: H } = motion.fit(canvas));
    const floor = H - 8, wallY = 10;
    const occX = Math.round(W * 0.47) + 0.5, occTop = H * 0.42;
    const dev = [W * 0.11, floor - 7];
    const box = { x: W * 0.6, y: floor - 26, w: 26, h: 26 };
    const ball = { x: W * 0.84, y: floor - 11, r: 11 };

    // The reconstruction: points on both outlines, revealed in seeded order.
    const outline = [];
    const per = 2 * (box.w + box.h);
    for (let i = 0; i < 30; i++) {
      let s = (i / 30) * per;
      if (s < box.w) outline.push([box.x + s, box.y]);
      else if ((s -= box.w) < box.h) outline.push([box.x + box.w, box.y + s]);
      else if ((s -= box.h) < box.w) outline.push([box.x + box.w - s, box.y + box.h]);
      else outline.push([box.x, box.y + box.h - (s - box.w)]);
    }
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      outline.push([ball.x + Math.cos(a) * ball.r, ball.y + Math.sin(a) * ball.r]);
    }
    const r = motion.seeded(9);
    for (let i = outline.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [outline[i], outline[j]] = [outline[j], outline[i]];
    }

    // Pulse paths: detector → relay wall → hidden scene → relay wall → detector.
    const pulses = [];
    for (let i = 0; i < PULSES; i++) {
      const wall = [W * (0.33 + 0.36 * i / (PULSES - 1)), wallY];
      const a = -Math.PI / 2 - 0.5 + 0.25 * i;
      const hit = i % 2 === 0
        ? [box.x + 5 + i * 3, box.y]
        : [ball.x + Math.cos(a) * ball.r, ball.y + Math.sin(a) * ball.r];
      const path = [dev, wall, hit, wall, dev];
      const segs = [], cum = [];
      let L = 0;
      for (let k = 0; k < 4; k++) {
        const d = Math.hypot(path[k + 1][0] - path[k][0], path[k + 1][1] - path[k][1]);
        segs.push(d);
        L += d;
        cum.push(L);
      }
      pulses.push({ path, segs, cum, L });
    }
    END = (PULSES - 1) * GAP + pulses[PULSES - 1].L / SPEED + 500;
    g = { floor, wallY, occX, occTop, dev, box, ball, outline, pulses };
  }

  // Point at distance s along a pulse's path.
  const at = (p, s) => {
    for (let k = 0; k < p.segs.length; k++) {
      if (s <= p.segs[k] || k === p.segs.length - 1) {
        const f = Math.min(1, s / p.segs[k]);
        const a = p.path[k], b = p.path[k + 1];
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      }
      s -= p.segs[k];
    }
    return p.path[p.path.length - 1];
  };

  // Stroke the stretch of a path between distances s0 and s1.
  const trace = (p, s0, s1) => {
    if (s1 <= s0) return;
    ctx.beginPath();
    const a = at(p, s0);
    ctx.moveTo(a[0], a[1]);
    for (let k = 0; k < p.cum.length - 1; k++) {
      if (p.cum[k] > s0 && p.cum[k] < s1) ctx.lineTo(p.path[k + 1][0], p.path[k + 1][1]);
    }
    const b = at(p, s1);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  };

  function draw(t) {
    const c = motion.colors;
    const { floor, wallY, occX, occTop, dev, box, ball, outline, pulses } = g;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.lineCap = 'round';

    // The scene: floor, relay wall (hatched), the occluding wall, the device.
    ctx.lineWidth = 1;
    ctx.strokeStyle = c['line-strong'];
    ctx.beginPath();
    ctx.moveTo(0, floor + 0.5); ctx.lineTo(W, floor + 0.5);
    ctx.moveTo(W * 0.04, wallY + 0.5); ctx.lineTo(W * 0.96, wallY + 0.5);
    for (let x = W * 0.04 + 4; x < W * 0.96; x += 7) {
      ctx.moveTo(x, wallY); ctx.lineTo(x - 4, wallY - 5);
    }
    ctx.stroke();
    ctx.strokeStyle = c['fg-muted'];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(occX, floor); ctx.lineTo(occX, occTop);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = c['line-strong'];
    ctx.beginPath();
    ctx.arc(dev[0], dev[1], 6, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = c.fg;
    ctx.beginPath();
    ctx.arc(dev[0], dev[1], 2.6, 0, TAU);
    ctx.fill();

    // Pulses in flight.
    let returned = 0;
    pulses.forEach((p, i) => {
      const s = (t - i * GAP) * SPEED;
      if (s <= 0) return;
      if (s >= p.L) returned++;
      const fade = s < p.L ? 1 : Math.max(0, 1 - (s - p.L) / 260);
      ctx.strokeStyle = c.fg;
      ctx.lineWidth = 1;
      // The faint trace stays, so the finished frame still shows the
      // bounces that went around the corner.
      ctx.globalAlpha = s < p.L ? 0.16 : 0.07 + 0.09 * fade;
      trace(p, 0, Math.min(s, p.L));
      if (fade <= 0) { ctx.globalAlpha = 1; return; }
      ctx.globalAlpha = 0.85 * fade;
      trace(p, Math.max(0, s - TRAIL), Math.min(s, p.L));
      if (s < p.L) {
        const h = at(p, s);
        ctx.globalAlpha = 1;
        ctx.fillStyle = c.fg;
        ctx.beginPath();
        ctx.arc(h[0], h[1], 2, 0, TAU);
        ctx.fill();
      }
      // Scatter rings at each bounce.
      for (let k = 0; k < 3; k++) {
        const d = s - p.cum[k];
        if (d <= 0 || d >= 150) continue;
        const pt = p.path[k + 1];
        ctx.globalAlpha = 0.5 * (1 - d / 150);
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], 2 + d * 0.09, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });

    // The reconstruction grows with every return.
    const shown = Math.round(outline.length * returned / PULSES);
    ctx.fillStyle = c.fg;
    for (let i = 0; i < shown; i++) {
      ctx.beginPath();
      ctx.arc(outline[i][0], outline[i][1], 1.4, 0, TAU);
      ctx.fill();
    }
    if (returned === PULSES) {
      ctx.globalAlpha = Math.min(1, (t - (END - 500)) / 400);
      ctx.strokeStyle = c['line-strong'];
      ctx.lineWidth = 1;
      ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w, box.h);
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (countEl) countEl.textContent = returned;
  }

  let now = 0, running = false;
  function play() {
    if (running) return;
    running = true;
    fig.classList.remove('is-done');
    let t0 = 0;
    const tick = (ts) => {
      if (!t0) t0 = ts;
      now = Math.min(END, ts - t0);
      draw(now);
      if (now < END) requestAnimationFrame(tick);
      else { running = false; fig.classList.add('is-done'); }
    };
    requestAnimationFrame(tick);
  }

  geometry();
  if (motion.reduced) { now = END; fig.classList.add('is-done'); }
  draw(now);

  motion.onTheme(() => draw(now));

  if ('ResizeObserver' in window) {
    let lastW = W;
    new ResizeObserver(() => {
      const w = Math.round(canvas.getBoundingClientRect().width);
      if (w === lastW) return;
      lastW = w;
      geometry();
      if (!running && fig.classList.contains('is-done')) now = END;
      draw(now);
    }).observe(canvas);
  }

  if (motion.reduced) return;
  motion.whenSeen(fig, play, 0.6);
  if (card) card.addEventListener('pointerenter', () => { if (fig.classList.contains('is-done')) play(); });
})();


/* ========================================================================
   PUBLICATION FIGURES — one small figure per paper that shows its idea in a
   few seconds, so the context lands before the text is read:
     gnn       a molecule becomes a graph; messages pass along its bonds;
               the group that drives the toxicity call is singled out.
     obstacle  the wearer walks; the glasses see and measure an obstacle;
               the warning is spoken.
     path      a planner searches free space around obstacles, then the
               safe route is drawn, all on a Jetson TX2.
     secure    camera, audio and location data flow glasses → phone →
               cloud; a threat appears at each hop and is closed off.
   Each is drawn in a 280 × 190 design space scaled to its canvas. Plays
   once when seen, replays on hover, and shows its last frame under reduced
   motion.
   ======================================================================== */

(() => {
  'use strict';

  const figs = Array.from(document.querySelectorAll('.pub-fig[data-fig]'));
  if (!figs.length) return;

  const TAU = Math.PI * 2;
  const DW = 280, DH = 190;
  const k01 = motion.clamp01;
  const mono = (px) => px + 'px "JetBrains Mono", ui-monospace, monospace';

  const dot = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
  const circ = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); };
  const line = (ctx, x0, y0, x1, y1, f = 1) => {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f); ctx.stroke();
  };
  const text = (ctx, s, x, y, color, size, align) => {
    ctx.fillStyle = color; ctx.font = mono(size || 9.5); ctx.textAlign = align || 'left'; ctx.fillText(s, x, y);
  };

  /* ---- gnn: Decoding Toxicity ------------------------------------------ */
  const ring = Array.from({ length: 6 }, (_, k) => [110 + 34 * Math.cos(k * Math.PI / 3), 98 + 34 * Math.sin(k * Math.PI / 3)]);
  const ATOMS = [...ring, [40, 98], [182, 98], [208, 72], [208, 124]];
  const LABEL = { 7: 'N', 8: 'O', 9: 'O' };
  const BONDS = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [3, 6], [0, 7], [7, 8], [7, 9]];
  const GROUP = [7, 8, 9];

  const gnn = (ctx, t, c) => {
    const build = k01(t / 700);
    const round = k01((t - 700) / 1800) * 3;          // three rounds of message passing
    const hl = k01((t - 2500) / 700);
    const done = k01((t - 3300) / 600);

    ctx.lineWidth = 1.5;
    BONDS.forEach(([a, b], i) => {
      const f = k01(build * BONDS.length - i);
      if (f <= 0) return;
      const inGroup = GROUP.includes(a) && GROUP.includes(b) || (a === 0 && b === 7);
      ctx.strokeStyle = hl > 0 && !inGroup ? c['line-strong'] : c['fg-muted'];
      line(ctx, ATOMS[a][0], ATOMS[a][1], ATOMS[b][0], ATOMS[b][1], f);
      if (i < 6 && i % 2 === 0 && f === 1) {          // double bonds on the ring
        const mx = 110, my = 98;
        const ax = ATOMS[a][0] + (mx - ATOMS[a][0]) * 0.2, ay = ATOMS[a][1] + (my - ATOMS[a][1]) * 0.2;
        const bx = ATOMS[b][0] + (mx - ATOMS[b][0]) * 0.2, by = ATOMS[b][1] + (my - ATOMS[b][1]) * 0.2;
        line(ctx, ax, ay, bx, by);
      }
    });

    // Messages: a dot runs each way along every bond, once per round.
    if (round > 0 && round < 3) {
      const ph = round % 1;
      ctx.fillStyle = c.fg;
      BONDS.forEach(([a, b]) => {
        const [x0, y0] = ATOMS[a], [x1, y1] = ATOMS[b];
        dot(ctx, x0 + (x1 - x0) * ph, y0 + (y1 - y0) * ph, 1.8);
        dot(ctx, x1 + (x0 - x1) * ph, y1 + (y0 - y1) * ph, 1.8);
      });
    }

    // Atoms: carbons are vertices; N and O are labelled. Each round of
    // messages makes every atom's state "fuller".
    const fill = Math.floor(round) / 3;
    ATOMS.forEach(([x, y], i) => {
      if (k01(build * ATOMS.length - i) <= 0) return;
      const inGroup = GROUP.includes(i);
      const faded = hl > 0 && !inGroup;
      if (LABEL[i]) {
        ctx.fillStyle = c.bg;
        dot(ctx, x, y, 9);
        ctx.strokeStyle = faded ? c['line-strong'] : inGroup && hl > 0 ? c.fg : c['fg-muted'];
        ctx.lineWidth = 1.5;
        circ(ctx, x, y, 9);
        text(ctx, LABEL[i], x, y + 3.5, inGroup && hl > 0 ? c.fg : c['fg-muted'], 10, 'center');
      } else {
        ctx.fillStyle = faded ? c['line-strong'] : c['fg-muted'];
        dot(ctx, x, y, 2.6 + fill * 1.4);
      }
    });
    if (round > 0 && hl === 0) text(ctx, 'message passing · round ' + Math.min(3, Math.floor(round) + 1), 14, 20, c['fg-faint'], 9.5);

    // The group behind the prediction.
    if (hl > 0) {
      ctx.strokeStyle = c.fg;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.ellipse(198, 98, 32 * hl + 1, 44 * hl + 1, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (done > 0) {
      ctx.globalAlpha = done;
      text(ctx, 'prediction: toxic', 14, 20, c.fg, 10);
      text(ctx, 'driven by this group', 198, 168, c['fg-muted'], 9.5, 'center');
      ctx.strokeStyle = c['line-strong'];
      ctx.lineWidth = 1;
      line(ctx, 198, 156, 198, 144);
      ctx.globalAlpha = 1;
    }
  };

  /* ---- obstacle: Smart Glasses Using Obstacle Detection ----------------- */
  const obstacle = (ctx, t, c) => {
    const walk = motion.easeStd(k01(t / 1300));
    const wy = 176 - walk * 30, wx = 120;
    const det = k01((t - 1300) / 600);
    const say = k01((t - 2100) / 1400);
    const OB = { x: 150, y: 58, w: 30, h: 22 };

    // Floor path and a second obstacle outside the view.
    ctx.strokeStyle = c.line;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    line(ctx, wx, 186, wx, 20);
    ctx.setLineDash([]);
    ctx.strokeStyle = c['fg-faint'];
    ctx.lineWidth = 1.5;
    circ(ctx, 42, 112, 8);
    ctx.strokeRect(OB.x, OB.y, OB.w, OB.h);

    // Field of view of the cameras.
    ctx.fillStyle = c.fg;
    ctx.globalAlpha = 0.06 * k01(t / 500);
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.arc(wx, wy, 130, -Math.PI / 2 - 0.42, -Math.PI / 2 + 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // Ultrasonic echoes.
    ctx.strokeStyle = c['fg-muted'];
    ctx.lineWidth = 1;
    for (let k = 0; k < 2; k++) {
      const ph = (t / 900 + k / 2) % 1;
      if (t > 3600) break;
      ctx.globalAlpha = (1 - ph) * 0.6;
      ctx.beginPath();
      ctx.arc(wx, wy, 12 + ph * 80, -Math.PI / 2 - 0.4, -Math.PI / 2 + 0.4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // The wearer, from above: head and glasses.
    ctx.fillStyle = c.bg;
    dot(ctx, wx, wy, 8);
    ctx.strokeStyle = c.fg;
    ctx.lineWidth = 1.5;
    circ(ctx, wx, wy, 8);
    ctx.lineWidth = 2;
    line(ctx, wx - 7, wy - 7, wx + 7, wy - 7);

    // Detection: brackets settle on the obstacle; the distance is measured.
    if (det > 0) {
      const s = 1 + (1 - motion.easeOut(det)) * 0.4, pad = 5;
      const w = (OB.w + pad * 2) * s, h = (OB.h + pad * 2) * s;
      const x = OB.x + OB.w / 2 - w / 2, y = OB.y + OB.h / 2 - h / 2, a = 6;
      ctx.globalAlpha = det;
      ctx.strokeStyle = c.fg;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y + a); ctx.lineTo(x, y); ctx.lineTo(x + a, y);
      ctx.moveTo(x + w - a, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + a);
      ctx.moveTo(x + w, y + h - a); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - a, y + h);
      ctx.moveTo(x + a, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - a);
      ctx.stroke();
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1;
      line(ctx, wx, wy - 9, OB.x + OB.w / 2, OB.y + OB.h + pad);
      ctx.setLineDash([]);
      text(ctx, 'obstacle · 1.2 m', OB.x - 10, OB.y + 14, c.fg, 9.5, 'right');
      ctx.globalAlpha = 1;
    }

    // The warning, spoken.
    if (say > 0) {
      for (let k = 0; k < 3; k++) {
        const ph = (t / 700 + k / 3) % 1;
        ctx.strokeStyle = c['fg-muted'];
        ctx.globalAlpha = (1 - ph) * 0.7 * k01(say * 3);
        ctx.beginPath();
        ctx.arc(wx - 4, wy, 10 + ph * 14, Math.PI * 0.75, Math.PI * 1.25);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const msg = '“Obstacle ahead, right.”';
      text(ctx, msg.slice(0, Math.round(msg.length * say)), 14, 22, c.fg, 10);
    }
  };

  /* ---- path: Path-Planning on Jetson TX2 -------------------------------- */
  const OBS = [[100, 72, 24], [176, 120, 28], [214, 52, 17], [56, 138, 15], [140, 168, 12]];
  const START = [26, 172], GOAL = [258, 24];
  const free = (x, y) => x > 4 && x < DW - 4 && y > 4 && y < DH - 4 && OBS.every(([ox, oy, r]) => Math.hypot(x - ox, y - oy) > r + 5);
  const clear = (a, b) => {
    for (let s = 0; s <= 1; s += 0.1) if (!free(a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s)) return false;
    return true;
  };
  const tree = (() => {
    const r = motion.seeded(21);
    const nodes = [{ p: START, parent: -1 }];
    let goalAt = -1;
    for (let i = 0; i < 1400 && nodes.length < 230; i++) {
      const q = r() < 0.1 ? GOAL : [r() * DW, r() * DH];
      let best = 0, bd = Infinity;
      nodes.forEach((n, j) => { const d = Math.hypot(n.p[0] - q[0], n.p[1] - q[1]); if (d < bd) { bd = d; best = j; } });
      const from = nodes[best].p;
      const step = Math.min(14, bd);
      if (step < 1) continue;
      const p = [from[0] + (q[0] - from[0]) / bd * step, from[1] + (q[1] - from[1]) / bd * step];
      if (!free(p[0], p[1]) || !clear(from, p)) continue;
      nodes.push({ p, parent: best });
      if (goalAt < 0 && Math.hypot(p[0] - GOAL[0], p[1] - GOAL[1]) < 15 && clear(p, GOAL)) {
        nodes.push({ p: GOAL, parent: nodes.length - 1 });
        goalAt = nodes.length - 1;
      }
    }
    const raw = [];
    for (let j = goalAt; j >= 0; j = nodes[j].parent) raw.unshift(nodes[j].p);
    // Shortcut the tree's zig-zags, as a planner's smoothing pass would.
    const route = [raw[0]];
    for (let i = 0; i < raw.length - 1;) {
      let j = raw.length - 1;
      while (j > i + 1 && !clear(raw[i], raw[j])) j--;
      route.push(raw[j]);
      i = j;
    }
    return { nodes, route };
  })();

  const path = (ctx, t, c) => {
    const grow = k01(t / 2400);
    const draw = k01((t - 2400) / 900);
    const chip = k01((t - 3300) / 500);

    OBS.forEach(([x, y, r]) => {
      ctx.fillStyle = c.bg;
      dot(ctx, x, y, r);
      ctx.strokeStyle = c['fg-faint'];
      ctx.lineWidth = 1.5;
      circ(ctx, x, y, r);
    });

    // The search: the tree reaches out through free space.
    const n = Math.floor(tree.nodes.length * grow);
    ctx.strokeStyle = c['line-strong'];
    ctx.lineWidth = 1;
    ctx.globalAlpha = draw > 0 ? 1 - draw * 0.5 : 1;
    ctx.beginPath();
    for (let i = 1; i < n; i++) {
      const a = tree.nodes[i], b = tree.nodes[a.parent];
      ctx.moveTo(b.p[0], b.p[1]); ctx.lineTo(a.p[0], a.p[1]);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (grow > 0 && draw === 0) text(ctx, 'searching · ' + n + ' nodes', 14, 20, c['fg-faint'], 9.5);

    // The route.
    if (draw > 0) {
      const R = tree.route, segs = R.length - 1, upto = draw * segs;
      ctx.strokeStyle = c.fg;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(R[0][0], R[0][1]);
      for (let i = 1; i <= Math.floor(upto); i++) ctx.lineTo(R[i][0], R[i][1]);
      const f = upto % 1, i0 = Math.floor(upto);
      if (i0 < segs && f > 0) ctx.lineTo(R[i0][0] + (R[i0 + 1][0] - R[i0][0]) * f, R[i0][1] + (R[i0 + 1][1] - R[i0][1]) * f);
      ctx.stroke();
    }

    // Start and goal.
    ctx.strokeStyle = c.fg;
    ctx.lineWidth = 1.5;
    circ(ctx, START[0], START[1], 5);
    ctx.fillStyle = c.fg;
    dot(ctx, GOAL[0], GOAL[1], 4.5);
    text(ctx, 'start', START[0] + 9, START[1] + 4, c['fg-muted'], 9);
    text(ctx, 'goal', GOAL[0] + 2, GOAL[1] + 18, c['fg-muted'], 9, 'right');

    // On the device.
    if (chip > 0) {
      ctx.globalAlpha = chip;
      ctx.strokeStyle = c['fg-muted'];
      ctx.lineWidth = 1.2;
      ctx.strokeRect(14.5, 10.5, 16, 16);
      for (let k = 0; k < 3; k++) {
        line(ctx, 18 + k * 4, 7, 18 + k * 4, 10); line(ctx, 18 + k * 4, 27, 18 + k * 4, 30);
      }
      text(ctx, 'route found on the Jetson TX2', 38, 22, c.fg, 9.5);
      ctx.globalAlpha = 1;
    }
  };

  /* ---- secure: Securing Assistive Smart Glasses ------------------------- */
  const NODES = [[48, 92, 'glasses'], [140, 92, 'phone'], [232, 92, 'cloud']];
  const lock = (ctx, x, y, c) => {
    ctx.strokeStyle = c.fg;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y - 3, 4, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = c.fg;
    ctx.fillRect(x - 6, y - 3, 12, 9);
  };
  const warn = (ctx, x, y, c) => {
    ctx.strokeStyle = c.fg;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - 8); ctx.lineTo(x + 7, y + 5); ctx.lineTo(x - 7, y + 5); ctx.closePath();
    ctx.stroke();
    text(ctx, '!', x, y + 3.5, c.fg, 9, 'center');
  };
  const secure = (ctx, t, c) => {
    const flow = k01(t / 600);
    const threat = k01((t - 1700) / 700);
    const fix = k01((t - 2900) / 900);
    const end = k01((t - 3900) / 500);

    // Links.
    ctx.strokeStyle = c['line-strong'];
    ctx.lineWidth = 1.5;
    line(ctx, 66, 92, 124, 92);
    line(ctx, 156, 92, 212, 92);

    // Nodes: glasses, phone, cloud.
    ctx.strokeStyle = c['fg-muted'];
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(40, 92, 8, 6, 0, 0, TAU); ctx.moveTo(64, 92); ctx.ellipse(56, 92, 8, 6, 0, 0, TAU);
    ctx.moveTo(47, 90); ctx.quadraticCurveTo(48, 87, 49, 90);
    ctx.stroke();
    ctx.strokeRect(132.5, 76.5, 16, 30);
    ctx.beginPath();
    ctx.moveTo(220, 100); ctx.lineTo(244, 100);
    ctx.arc(244, 93, 7, Math.PI / 2, -Math.PI / 2, true);
    ctx.arc(234, 86, 9, -0.2, Math.PI + 0.6, true);
    ctx.arc(222, 94, 6, -Math.PI / 2, Math.PI / 2, true);
    ctx.stroke();
    NODES.forEach(([x, , name]) => text(ctx, name, x, 124, c['fg-faint'], 9.5, 'center'));

    // Personal data flowing out.
    text(ctx, 'camera · audio · location', 14, 30, flow > 0 ? c['fg-muted'] : c.bg, 9.5);
    for (let k = 0; k < 4; k++) {
      const ph = (t / 1400 + k / 4) % 1;
      const x = 66 + ph * (212 - 66);
      if (x > 124 && x < 156) continue;
      ctx.fillStyle = fix > 0.6 ? c.fg : c['fg-muted'];
      ctx.globalAlpha = flow * (end > 0 ? 1 - end * 0.6 : 1);
      ctx.fillRect(x - 3, 89, 6, 6);
    }
    ctx.globalAlpha = 1;

    // A threat at each hop, then a mitigation for each.
    const SPOTS = [[48, 66], [95, 74], [186, 74], [232, 64]];
    SPOTS.forEach(([x, y], i) => {
      const a = k01(threat * 4 - i);
      if (a <= 0) return;
      const b = k01(fix * 4 - i);
      ctx.globalAlpha = a * (1 - b);
      warn(ctx, x, y, c);
      ctx.globalAlpha = b;
      lock(ctx, x, y + 2, c);
      ctx.globalAlpha = 1;
    });
    if (threat > 0 && fix === 0) text(ctx, 'a threat at each hop', 14, 168, c['fg-muted'], 9.5);
    if (fix > 0) {
      ctx.globalAlpha = fix;
      text(ctx, 'a mitigation for each', 14, 168, c.fg, 9.5);
      ctx.globalAlpha = 1;
    }
  };

  const DRAW = { gnn, obstacle, path, secure };
  const TIME = { gnn: 4200, obstacle: 4000, path: 4200, secure: 4600 };

  figs.forEach((fig) => {
    const kind = fig.dataset.fig;
    const draw = DRAW[kind];
    if (!draw) return;
    const canvas = fig.querySelector('canvas');
    const T = TIME[kind];
    let ctx, W, H, now = motion.reduced ? T : 0, running = false, played = false;

    const paint = () => {
      ({ ctx, w: W, h: H } = motion.fit(canvas));
      ctx.clearRect(0, 0, W, H);
      const s = Math.min(W / DW, H / DH);
      ctx.save();
      ctx.translate((W - DW * s) / 2, (H - DH * s) / 2);
      ctx.scale(s, s);
      ctx.lineCap = 'round';
      draw(ctx, now, motion.colors);
      ctx.restore();
    };
    const play = () => {
      if (running || motion.reduced) return;
      running = true;
      let t0 = 0;
      const tick = (ts) => {
        if (!t0) t0 = ts;
        now = Math.min(T, ts - t0);
        paint();
        if (now < T) requestAnimationFrame(tick);
        else { running = false; played = true; }
      };
      requestAnimationFrame(tick);
    };

    paint();
    motion.onTheme(paint);
    if ('ResizeObserver' in window) {
      let lastW = 0;
      new ResizeObserver(() => {
        const w = Math.round(canvas.getBoundingClientRect().width);
        if (w && w !== lastW) { lastW = w; paint(); }
      }).observe(canvas);
    }
    if (motion.reduced) return;
    motion.whenSeen(fig, play, 0.6);
    const card = fig.closest('a');
    if (card) card.addEventListener('pointerenter', () => { if (played) play(); });
  });
})();
