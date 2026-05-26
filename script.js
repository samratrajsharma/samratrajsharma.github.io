/* ========================================================================
   SAMRAT RAJ SHARMA — PORTFOLIO SCRIPT
   ======================================================================== */

(() => {
  'use strict';

  const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = window.matchMedia('(hover: none)').matches;

  /* ==========================================================
     1. LOADER
     ========================================================== */
  const loader = document.getElementById('loader');
  const loaderBar = document.getElementById('loader-bar');
  const loaderPct = document.getElementById('loader-percent');

  function runLoader() {
    return new Promise(resolve => {
      let p = 0;
      const tick = () => {
        p += (Math.random() * 8 + 4);
        if (p >= 100) p = 100;
        loaderBar.style.width = p + '%';
        loaderPct.textContent = String(Math.floor(p)).padStart(3, '0');
        if (p < 100) setTimeout(tick, 60 + Math.random() * 80);
        else {
          setTimeout(() => {
            loader.classList.add('is-done');
            resolve();
          }, 280);
        }
      };
      tick();
    });
  }

  /* ==========================================================
     2. PARTICLE BACKGROUND (Neural Net)
     ========================================================== */
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  let DPR = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0;
  let particles = [];
  const mouse = { x: -9999, y: -9999, vx: 0, vy: 0 };
  let scrollProgress = 0;

  // Theme accents per stage (rgba arrays)
  const stageThemes = [
    { a: [0, 240, 255], b: [123, 44, 191] },   // hero
    { a: [0, 240, 255], b: [255, 255, 255] },  // profile
    { a: [123, 44, 191], b: [0, 240, 255] },   // stack
    { a: [0, 240, 255], b: [255, 184, 0] },    // career
    { a: [255, 42, 109], b: [0, 240, 255] },   // work
    { a: [255, 184, 0], b: [123, 44, 191] },   // research
    { a: [0, 240, 255], b: [255, 42, 109] }    // contact
  ];

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    seedParticles();
  }

  function seedParticles() {
    const target = Math.min(120, Math.max(50, Math.floor((W * H) / 16000)));
    particles = [];
    for (let i = 0; i < target; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.4 + 0.5,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function currentTheme() {
    const idx = scrollProgress * 6;
    const i = Math.floor(idx);
    const t = idx - i;
    const a = stageThemes[Math.min(i, 6)];
    const b = stageThemes[Math.min(i + 1, 6)];
    return {
      a: [
        Math.round(lerp(a.a[0], b.a[0], t)),
        Math.round(lerp(a.a[1], b.a[1], t)),
        Math.round(lerp(a.a[2], b.a[2], t))
      ],
      b: [
        Math.round(lerp(a.b[0], b.b[0], t)),
        Math.round(lerp(a.b[1], b.b[1], t)),
        Math.round(lerp(a.b[2], b.b[2], t))
      ]
    };
  }

  let time = 0;
  function renderParticles() {
    time += 0.005;
    ctx.clearRect(0, 0, W, H);

    const theme = currentTheme();
    const colA = theme.a;
    const colB = theme.b;

    // Update + draw nodes
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // gentle drift
      p.x += p.vx;
      p.y += p.vy;

      // mouse repulsion (light)
      const mdx = p.x - mouse.x;
      const mdy = p.y - mouse.y;
      const md2 = mdx * mdx + mdy * mdy;
      if (md2 < 18000) {
        const f = (1 - md2 / 18000) * 0.6;
        const md = Math.sqrt(md2) || 1;
        p.vx += (mdx / md) * f * 0.04;
        p.vy += (mdy / md) * f * 0.04;
      }

      // velocity damping
      p.vx *= 0.985;
      p.vy *= 0.985;

      // edges wrap
      if (p.x < -20) p.x = W + 20;
      if (p.x > W + 20) p.x = -20;
      if (p.y < -20) p.y = H + 20;
      if (p.y > H + 20) p.y = -20;

      // ensure minimum motion
      if (Math.abs(p.vx) < 0.05) p.vx += (Math.random() - 0.5) * 0.05;
      if (Math.abs(p.vy) < 0.05) p.vy += (Math.random() - 0.5) * 0.05;

      // pulse
      const pulse = 0.6 + 0.4 * Math.sin(time * 2 + p.phase);

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * pulse, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${colA[0]}, ${colA[1]}, ${colA[2]}, ${0.7 * pulse})`;
      ctx.fill();
    }

    // Draw connections
    const maxDist = 140;
    const maxDist2 = maxDist * maxDist;
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < maxDist2) {
          const alpha = (1 - d2 / maxDist2) * 0.35;
          // mix color based on midpoint y for vertical gradient feel
          const t = (a.y + b.y) / 2 / H;
          const r = Math.round(lerp(colA[0], colB[0], t));
          const g = Math.round(lerp(colA[1], colB[1], t));
          const bl = Math.round(lerp(colA[2], colB[2], t));
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(${r}, ${g}, ${bl}, ${alpha})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }

    // Mouse cursor connections (when close)
    if (mouse.x > 0) {
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 22500) {
          const alpha = (1 - d2 / 22500) * 0.5;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.strokeStyle = `rgba(${colA[0]}, ${colA[1]}, ${colA[2]}, ${alpha})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(renderParticles);
  }

  /* ==========================================================
     3. CUSTOM CURSOR
     ========================================================== */
  const cursor = document.getElementById('cursor');
  const cursorRing = document.getElementById('cursor-ring');
  const cursorState = { x: 0, y: 0, tx: 0, ty: 0, rx: 0, ry: 0 };

  if (!isTouch) {
    window.addEventListener('mousemove', e => {
      cursorState.tx = e.clientX;
      cursorState.ty = e.clientY;
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    });

    const animateCursor = () => {
      cursorState.x = lerp(cursorState.x, cursorState.tx, 0.55);
      cursorState.y = lerp(cursorState.y, cursorState.ty, 0.55);
      cursorState.rx = lerp(cursorState.rx, cursorState.tx, 0.12);
      cursorState.ry = lerp(cursorState.ry, cursorState.ty, 0.12);
      cursor.style.transform = `translate(${cursorState.x}px, ${cursorState.y}px) translate(-50%, -50%)`;
      cursorRing.style.transform = `translate(${cursorState.rx}px, ${cursorState.ry}px) translate(-50%, -50%)`;
      requestAnimationFrame(animateCursor);
    };
    animateCursor();

    document.addEventListener('mouseover', e => {
      const el = e.target;
      if (el.closest('a, button, .magnetic, .skill-node, .project-card, .stat, .paper, .hud-dot')) {
        cursor.classList.add('is-hover');
        cursorRing.classList.add('is-hover');
      } else {
        cursor.classList.remove('is-hover');
        cursorRing.classList.remove('is-hover');
      }
    });
  }

  /* ==========================================================
     4. SCROLL CHOREOGRAPHY
     ========================================================== */
  const stages = Array.from(document.querySelectorAll('.stage'));
  const hudDots = Array.from(document.querySelectorAll('.hud-dot'));
  const hudStageNum = document.getElementById('hud-stage-num');
  const STAGE_COUNT = stages.length;

  let activeStage = -1;
  const stagesRevealed = new Set();

  function updateStages() {
    const scrollY = window.scrollY;
    const totalScroll = document.documentElement.scrollHeight - window.innerHeight;
    scrollProgress = Math.min(1, Math.max(0, scrollY / totalScroll));

    // Map progress to a stage float 0..(STAGE_COUNT-1)
    const stageFloat = scrollProgress * (STAGE_COUNT - 1);
    const newActive = Math.round(stageFloat);

    // Compute presence for each stage
    stages.forEach((stage, i) => {
      const dist = Math.abs(stageFloat - i);
      const presence = Math.max(0, 1 - dist * 2); // fade over half-stage

      if (presence > 0.01) {
        stage.style.opacity = presence;
        stage.style.visibility = 'visible';
        stage.style.pointerEvents = presence > 0.5 ? 'auto' : 'none';

        // Subtle translate/scale during transition
        const translateY = (stageFloat - i) * 40;
        const scale = 0.96 + presence * 0.04;
        stage.style.transform = `translateY(${translateY}px) scale(${scale})`;

        if (presence > 0.5 && !stagesRevealed.has(i)) {
          stagesRevealed.add(i);
          revealStage(i);
        }
      } else {
        stage.style.opacity = 0;
        stage.style.visibility = 'hidden';
        stage.style.pointerEvents = 'none';
      }
    });

    if (newActive !== activeStage) {
      activeStage = newActive;
      hudDots.forEach((d, i) => d.classList.toggle('is-active', i === newActive));
      if (hudStageNum) hudStageNum.textContent = String(newActive).padStart(2, '0');
      stages.forEach((s, i) => s.classList.toggle('is-active', i === newActive));
    }
  }

  /* ==========================================================
     5. STAGE-SPECIFIC REVEALS
     ========================================================== */
  function revealStage(i) {
    switch (i) {
      case 1: animateStats(); break;
      case 2: animateConstellation(); break;
      case 3: revealSequence('.timeline-item', 120); break;
      case 4: revealProjects(); break;
    }
  }

  function revealProjects() {
    const flagship = document.querySelector('.project-flagship');
    if (flagship) flagship.classList.add('is-revealed');
    setTimeout(() => revealSequence('.project-card', 110), 220);
  }

  /* ==========================================================
     Orchestraty — sneak-peek ticker + launch countdown
     ========================================================== */
  function startOrchestraty() {
    const feedEl = document.getElementById('orch-livefeed');

    // Sneak-peek feature teasers (high-level only)
    const messages = [
      'Multi-LLM consensus labeling at scale',
      'CLIP vision + cross-modal semantic search',
      'Schema-aware ingestion · lineage tracking',
      'One-click dataset productionization',
      'Vector store sync · drift detection',
      'Multi-source connectors · streaming-first',
      'CI/CD pipelines for data, not just code',
      'Quality gates · zero-drift guarantees',
      'Confidence scoring across annotations',
      'Auto-routing across LLM providers'
    ];

    if (feedEl) {
      let i = 0;
      feedEl.textContent = messages[0];
      setInterval(() => {
        feedEl.style.opacity = '0';
        setTimeout(() => {
          i = (i + 1) % messages.length;
          feedEl.textContent = messages[i];
          feedEl.style.opacity = '1';
        }, 280);
      }, 3600);
    }

    // Launch countdown — target Sep 1, 2026 (UTC)
    const LAUNCH = Date.UTC(2026, 8, 1, 0, 0, 0); // month is 0-indexed: 8 = September

    function flipDigit(id, value) {
      const wrap = document.getElementById(id);
      if (!wrap) return;
      const formatted = String(value).padStart(2, '0');
      const oldSpan = wrap.querySelector('.d-old');
      if (!oldSpan || oldSpan.textContent === formatted) return;
      const newSpan = wrap.querySelector('.d-new');
      newSpan.textContent = formatted;
      wrap.classList.add('is-flipping');
      setTimeout(() => {
        wrap.classList.add('no-transition');
        oldSpan.textContent = formatted;
        wrap.classList.remove('is-flipping');
        // force reflow so transition reset takes effect
        void wrap.offsetWidth;
        wrap.classList.remove('no-transition');
      }, 440);
    }

    function setDigitInitial(id, value) {
      const wrap = document.getElementById(id);
      if (!wrap) return;
      const formatted = String(value).padStart(2, '0');
      const oldSpan = wrap.querySelector('.d-old');
      const newSpan = wrap.querySelector('.d-new');
      if (oldSpan) oldSpan.textContent = formatted;
      if (newSpan) newSpan.textContent = formatted;
    }

    function computeRemaining() {
      let diff = Math.max(0, LAUNCH - Date.now());
      const days = Math.floor(diff / 86400000); diff -= days * 86400000;
      const hrs  = Math.floor(diff / 3600000);  diff -= hrs  * 3600000;
      const mins = Math.floor(diff / 60000);    diff -= mins * 60000;
      const secs = Math.floor(diff / 1000);
      return { days, hrs, mins, secs };
    }

    if (document.getElementById('countdown-ss')) {
      const r0 = computeRemaining();
      setDigitInitial('countdown-dd', r0.days);
      setDigitInitial('countdown-hh', r0.hrs);
      setDigitInitial('countdown-mm', r0.mins);
      setDigitInitial('countdown-ss', r0.secs);

      setInterval(() => {
        const r = computeRemaining();
        flipDigit('countdown-dd', r.days);
        flipDigit('countdown-hh', r.hrs);
        flipDigit('countdown-mm', r.mins);
        flipDigit('countdown-ss', r.secs);
      }, 1000);
    }
  }

  function revealSequence(selector, gap) {
    const els = document.querySelectorAll(selector);
    els.forEach((el, i) => {
      setTimeout(() => el.classList.add('is-revealed'), i * gap);
    });
  }

  /* ==========================================================
     6. STAT COUNTERS
     ========================================================== */
  function animateStats() {
    const stats = document.querySelectorAll('.stat-num');
    stats.forEach(el => {
      const target = parseInt(el.dataset.target, 10);
      const suffix = el.dataset.suffix || '';
      const prefix = el.dataset.prefix || '';
      const dur = 1400;
      const start = performance.now();
      const tick = now => {
        const t = Math.min(1, (now - start) / dur);
        const eased = 1 - Math.pow(1 - t, 3);
        const val = Math.floor(target * eased);
        el.textContent = prefix + val + suffix;
        if (t < 1) requestAnimationFrame(tick);
        else el.textContent = prefix + target + suffix;
      };
      requestAnimationFrame(tick);
    });
  }

  /* ==========================================================
     7. SKILLS CONSTELLATION
     ========================================================== */
  const SKILLS = [
    // FRONTIER — current research focus
    { name: 'Multimodal Diffusion', type: 'frontier', primary: true,  x: 0.40, y: 0.14 },
    { name: 'World Models',         type: 'frontier', primary: true,  x: 0.58, y: 0.06 },
    { name: 'VLA',                  type: 'frontier', primary: true,  x: 0.74, y: 0.14 },
    { name: 'NeRF',                 type: 'frontier', primary: false, x: 0.22, y: 0.18 },
    { name: 'Synthetic Data',       type: 'frontier', primary: false, x: 0.88, y: 0.22 },
    { name: 'Thermal · IR',         type: 'frontier', primary: false, x: 0.93, y: 0.38 },
    { name: 'Spatial Intelligence', type: 'frontier', primary: false, x: 0.08, y: 0.30 },

    // FOUNDATION
    { name: 'PYTHON',     type: 'base',   primary: true,  x: 0.50, y: 0.45 },
    { name: 'PyTorch',    type: 'base',   primary: true,  x: 0.34, y: 0.38 },
    { name: 'TensorFlow', type: 'base',   primary: false, x: 0.18, y: 0.46 },
    { name: 'C++',        type: 'base',   primary: false, x: 0.06, y: 0.58 },
    { name: 'SQL',        type: 'base',   primary: false, x: 0.10, y: 0.84 },

    // VISION
    { name: 'YOLO',       type: 'vision', primary: true,  x: 0.66, y: 0.38 },
    { name: 'ViT',        type: 'vision', primary: false, x: 0.80, y: 0.32 },
    { name: 'Jetson',     type: 'vision', primary: false, x: 0.92, y: 0.55 },
    { name: '3D Recon',   type: 'vision', primary: true,  x: 0.78, y: 0.50 },
    { name: 'TensorRT',   type: 'vision', primary: false, x: 0.94, y: 0.72 },

    // LLM / AGENTS
    { name: 'HuggingFace',type: 'llm',    primary: false, x: 0.42, y: 0.58 },
    { name: 'LangChain',  type: 'llm',    primary: true,  x: 0.55, y: 0.78 },
    { name: 'LangGraph',  type: 'llm',    primary: false, x: 0.40, y: 0.88 },
    { name: 'CrewAI',     type: 'llm',    primary: false, x: 0.68, y: 0.88 },
    { name: 'RAG',        type: 'llm',    primary: true,  x: 0.28, y: 0.66 },
    { name: 'MCP',        type: 'llm',    primary: false, x: 0.22, y: 0.94 },
    { name: 'vLLM',       type: 'llm',    primary: false, x: 0.85, y: 0.84 },
    { name: 'Ollama',     type: 'llm',    primary: false, x: 0.62, y: 0.65 },
    { name: 'FAISS',      type: 'llm',    primary: false, x: 0.52, y: 0.94 },

    // INFRA / MLOPS
    { name: 'Docker',     type: 'infra',  primary: false, x: 0.14, y: 0.58 },
    { name: 'FastAPI',    type: 'infra',  primary: true,  x: 0.78, y: 0.78 },
    { name: 'MLflow',     type: 'infra',  primary: false, x: 0.32, y: 0.78 },
    { name: 'AWS',        type: 'infra',  primary: false, x: 0.92, y: 0.94 }
  ];

  function buildConstellation() {
    const root = document.getElementById('skills-constellation');
    if (!root) return;

    // SVG layer for connections
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'constellation-svg');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('viewBox', '0 0 100 100');
    root.appendChild(svg);

    // Place nodes
    SKILLS.forEach((s, i) => {
      const node = document.createElement('div');
      node.className = 'skill-node' + (s.primary ? ' is-primary' : '');
      node.dataset.type = s.type;
      node.style.left = (s.x * 100) + '%';
      node.style.top = (s.y * 100) + '%';
      node.style.transitionDelay = (i * 18) + 'ms';
      node.textContent = s.name;
      root.appendChild(node);
    });

    // Build a sparse graph of connections (each node to its 2 nearest)
    SKILLS.forEach((a, i) => {
      const ranked = SKILLS
        .map((b, j) => ({ j, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 }))
        .filter(o => o.j !== i)
        .sort((p, q) => p.d - q.d)
        .slice(0, 2);
      ranked.forEach(({ j }) => {
        if (j < i) return; // avoid duplicate lines
        const b = SKILLS[j];
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('class', 'constellation-line');
        line.setAttribute('x1', (a.x * 100).toFixed(2));
        line.setAttribute('y1', (a.y * 100).toFixed(2));
        line.setAttribute('x2', (b.x * 100).toFixed(2));
        line.setAttribute('y2', (b.y * 100).toFixed(2));
        svg.appendChild(line);
      });
    });
  }

  function animateConstellation() {
    const root = document.getElementById('skills-constellation');
    if (!root) return;
    const nodes = root.querySelectorAll('.skill-node');
    nodes.forEach((n, i) => {
      setTimeout(() => n.classList.add('is-visible'), i * 40);
    });
    setTimeout(() => root.classList.add('is-revealed'), 300);
  }

  /* ==========================================================
     8. MAGNETIC HOVER
     ========================================================== */
  function attachMagnetic() {
    if (isTouch) return;
    const els = document.querySelectorAll('.magnetic');
    els.forEach(el => {
      el.addEventListener('mousemove', e => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - (r.left + r.width / 2);
        const y = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${x * 0.18}px, ${y * 0.18}px)`;
      });
      el.addEventListener('mouseleave', () => {
        el.style.transform = '';
      });
    });
  }

  /* ==========================================================
     9. PUBLICATIONS POPUP (2-second hover)
     ========================================================== */
  function attachPubsPopup() {
    const stat = document.getElementById('stat-pubs');
    const popup = document.getElementById('pubs-popup');
    if (!stat || !popup) return;

    let hoverTimer = null;
    let hideTimer = null;
    let isOpen = false;

    const positionPopup = () => {
      const rect = stat.getBoundingClientRect();
      const margin = 16;
      const pw = popup.offsetWidth || 460;
      const ph = popup.offsetHeight || 320;

      let top = rect.bottom + 12;
      let left = rect.left + (rect.width / 2) - (pw / 2);

      // Flip above if overflowing bottom
      if (top + ph > window.innerHeight - margin) {
        top = rect.top - ph - 12;
      }
      // Clamp horizontally
      if (left < margin) left = margin;
      if (left + pw > window.innerWidth - margin) {
        left = window.innerWidth - pw - margin;
      }
      // If popup would go above viewport when flipped, dock to right of stat
      if (top < margin) {
        top = margin;
        left = rect.right + 12;
        if (left + pw > window.innerWidth - margin) {
          left = rect.left - pw - 12;
        }
      }

      popup.style.left = left + 'px';
      popup.style.top = top + 'px';
    };

    const showPopup = () => {
      positionPopup();
      popup.classList.add('is-open');
      isOpen = true;
      // Reposition again after open in case sizes changed
      requestAnimationFrame(positionPopup);
    };

    const hidePopup = () => {
      popup.classList.remove('is-open');
      isOpen = false;
    };

    const startHover = () => {
      clearTimeout(hideTimer);
      if (isOpen) return;
      hoverTimer = setTimeout(showPopup, 2000);
    };

    const endHover = (e) => {
      clearTimeout(hoverTimer);
      // If moving directly to popup, keep open
      if (e && e.relatedTarget && (e.relatedTarget === popup || popup.contains(e.relatedTarget))) return;
      hideTimer = setTimeout(hidePopup, 250);
    };

    stat.addEventListener('mouseenter', startHover);
    stat.addEventListener('mouseleave', endHover);

    popup.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    popup.addEventListener('mouseleave', () => {
      hideTimer = setTimeout(hidePopup, 150);
    });

    // Keyboard accessibility — quicker on focus
    stat.addEventListener('focus', () => {
      clearTimeout(hideTimer);
      hoverTimer = setTimeout(showPopup, 600);
    });
    stat.addEventListener('blur', () => {
      clearTimeout(hoverTimer);
      hideTimer = setTimeout(hidePopup, 250);
    });

    // Tap on touch
    stat.addEventListener('click', () => {
      clearTimeout(hoverTimer);
      if (isOpen) hidePopup(); else showPopup();
    });

    // Reposition on scroll/resize while open
    window.addEventListener('resize', () => { if (isOpen) positionPopup(); });
    window.addEventListener('scroll', () => { if (isOpen) positionPopup(); }, { passive: true });

    // Close on Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && isOpen) hidePopup();
    });
  }

  /* ==========================================================
     10. HUD CLOCK & NAV CLICKS
     ========================================================== */
  function startClock() {
    const el = document.getElementById('hud-time');
    if (!el) return;
    const tick = () => {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      el.textContent = `${hh}:${mm}:${ss}`;
    };
    tick();
    setInterval(tick, 1000);
  }

  function attachNavClicks() {
    hudDots.forEach(dot => {
      dot.addEventListener('click', () => {
        const idx = parseInt(dot.dataset.stage, 10);
        const totalScroll = document.documentElement.scrollHeight - window.innerHeight;
        const target = (idx / (STAGE_COUNT - 1)) * totalScroll;
        window.scrollTo({ top: target, behavior: 'smooth' });
      });
    });
  }

  /* ==========================================================
     10. KEYBOARD NAV
     ========================================================== */
  function attachKeyboard() {
    window.addEventListener('keydown', e => {
      if (['ArrowDown', 'PageDown', ' '].includes(e.key)) {
        e.preventDefault();
        goToStage(Math.min(STAGE_COUNT - 1, activeStage + 1));
      } else if (['ArrowUp', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        goToStage(Math.max(0, activeStage - 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        goToStage(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        goToStage(STAGE_COUNT - 1);
      }
    });
  }

  function goToStage(idx) {
    const totalScroll = document.documentElement.scrollHeight - window.innerHeight;
    const target = (idx / (STAGE_COUNT - 1)) * totalScroll;
    window.scrollTo({ top: target, behavior: 'smooth' });
  }

  /* ==========================================================
     11. WORD-LEVEL REVEAL FOR HERO
     ========================================================== */
  function splitHero() {
    document.querySelectorAll('.hero-word').forEach((w, i) => {
      const text = w.textContent;
      w.innerHTML = '';
      [...text].forEach((char, j) => {
        const span = document.createElement('span');
        span.style.display = 'inline-block';
        span.style.transform = 'translateY(110%)';
        span.style.opacity = '0';
        span.style.transition = `transform 0.9s cubic-bezier(0.22,1,0.36,1) ${i * 0.15 + j * 0.04}s, opacity 0.9s ${i * 0.15 + j * 0.04}s`;
        span.textContent = char;
        w.appendChild(span);
      });
    });

    requestAnimationFrame(() => {
      document.querySelectorAll('.hero-word span').forEach(s => {
        s.style.transform = 'translateY(0)';
        s.style.opacity = '1';
      });
    });
  }

  /* ==========================================================
     12. REVEAL-LINE SPLIT
     ========================================================== */
  function splitRevealLines() {
    document.querySelectorAll('.reveal-line').forEach(line => {
      if (line.querySelector('span.line-inner')) return;
      const text = line.innerHTML;
      const inner = document.createElement('span');
      inner.className = 'line-inner';
      inner.innerHTML = text;
      line.innerHTML = '';
      line.appendChild(inner);
    });
  }

  /* ==========================================================
     INIT
     ========================================================== */
  function init() {
    resize();
    seedParticles();
    requestAnimationFrame(renderParticles);

    splitRevealLines();
    buildConstellation();
    startClock();
    attachNavClicks();
    attachKeyboard();
    attachMagnetic();
    attachPubsPopup();
    startOrchestraty();

    window.addEventListener('resize', resize);
    window.addEventListener('scroll', updateStages, { passive: true });

    updateStages();
    splitHero();

    // Mark hero as immediately revealed
    stagesRevealed.add(0);
  }

  // Boot sequence: loader → init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      runLoader().then(init);
    });
  } else {
    runLoader().then(init);
  }
})();
