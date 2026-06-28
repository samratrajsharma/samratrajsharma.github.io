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
   LANGUAGE SWITCHER — a custom pill that drives Google's whole-page
   translation engine, with an animated menu and a first-visit hint.
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
  const openMenu = () => { sw.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); dismissHint(); };
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

  /* ---- first-visit hint: cycling greetings + arrow to the pill ---- */
  const hint = document.getElementById('lang-hint');
  const greetEl = document.getElementById('lang-hint-greet');
  const typeEl = document.getElementById('lang-hint-text');
  const hintReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let greetTimer = null, hideTimer = null, dismissed = false;

  function dismissHint() {
    if (dismissed) return;
    dismissed = true;
    write('langHintSeen', '1');
    clearInterval(greetTimer);
    clearTimeout(hideTimer);
    if (hint) hint.setAttribute('hidden', '');
  }

  if (hint && greetEl && read('langHintSeen', '') !== '1') {
    const greetings = ['Hello', 'Hallo', 'Bonjour', 'Hola', 'नमस्ते', 'こんにちは', '你好', 'Olá'];
    let i = 0;
    const message = 'Please select your preferred language';
    setTimeout(() => {
      if (dismissed) return;
      hint.removeAttribute('hidden');
      greetEl.textContent = greetings[0];
      greetTimer = setInterval(() => {
        i = (i + 1) % greetings.length;
        greetEl.style.opacity = '0';
        setTimeout(() => { greetEl.textContent = greetings[i]; greetEl.style.opacity = '1'; }, 180);
      }, 1400);
      // Typewriter: write the instruction one character at a time.
      if (typeEl) {
        if (hintReduced) {
          typeEl.textContent = message;
        } else {
          let t = 0;
          const type = () => {
            if (dismissed) return;
            typeEl.textContent = message.slice(0, t);
            if (t < message.length) { t += 1; setTimeout(type, 42); }
          };
          type();
        }
      }
      hideTimer = setTimeout(dismissHint, 10000);
    }, 1200);
    window.addEventListener('scroll', dismissHint, { once: true, passive: true });
  }
})();
