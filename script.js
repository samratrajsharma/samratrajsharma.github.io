/* ========================================================================
   SAMRAT RAJ SHARMA — PORTFOLIO
   Progressive enhancement only: highlight the active nav link while
   scrolling. The page is fully functional without this file.
   ======================================================================== */

(() => {
  'use strict';

  const links = Array.from(document.querySelectorAll('.nav-links a'));
  if (!links.length || !('IntersectionObserver' in window)) return;

  const byId = new Map();
  links.forEach(link => {
    const id = link.getAttribute('href').slice(1);
    const section = document.getElementById(id);
    if (section) byId.set(section, link);
  });

  let current = null;
  const setActive = link => {
    if (link === current) return;
    if (current) current.classList.remove('is-active');
    if (link) link.classList.add('is-active');
    current = link;
  };

  const observer = new IntersectionObserver(entries => {
    // Pick the visible section closest to the top of the viewport.
    const visible = entries
      .filter(e => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible.length) setActive(byId.get(visible[0].target));
  }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });

  byId.forEach((_, section) => observer.observe(section));
})();
