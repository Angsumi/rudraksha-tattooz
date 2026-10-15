(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const WA = '919362355247';

  /* ---------- Preloader (counts to 108, the beads of a mala) ---------- */
  document.body.classList.add('is-loading');
  const loader = $('#loader'), num = $('#loadNum');
  let done = false;
  const finish = () => {
    if (done) return; done = true;
    loader.classList.add('is-done');
    document.body.classList.remove('is-loading');
    document.documentElement.classList.add('loaded');
    document.dispatchEvent(new Event('site:loaded'));
    setTimeout(() => loader.remove(), 1200);
  };
  if (reduce) { finish(); } else {
    const t0 = performance.now(), LEN = 1300;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / LEN);
      num.textContent = String(Math.round(108 * (1 - Math.pow(1 - k, 3)))).padStart(3, '0');
      if (k < 1) requestAnimationFrame(tick); else setTimeout(finish, 300);
    };
    requestAnimationFrame(tick);
    setTimeout(finish, 2600); // never block the page
  }

  /* ---------- Hero: stencil → ink ---------- */
  (() => {
    const skin = $('#skin'); if (!skin) return;
    const ink = $('#inkCanvas'), red = $('#redCanvas'), needle = $('#needle');
    const pctEl = $('#inkPct'), hint = $('#skinHint'), forever = $('#forever');
    const ictx = ink.getContext('2d'), rctx = red.getContext('2d');
    const mask = document.createElement('canvas'), mctx = mask.getContext('2d');
    const probe = document.createElement('canvas'), pctx = probe.getContext('2d', { willReadFrequently: true });
    const photo = new Image(); photo.src = 'assets/img/hero-ink.webp';
    const IW = 900, IH = 1781;
    // forearm outline traced from the photo, in image pixels: [y, left, right]
    const P = [[0,200,750],[200,200,750],[400,200,740],[600,210,730],[800,200,690],[1000,190,670],[1200,180,640],[1300,190,628],[1400,210,610],[1600,240,590],[1781,260,580]];
    const edge = y => {
      for (let i = 1; i < P.length; i++) if (y <= P[i][0]) {
        const a = P[i - 1], b = P[i], t = (y - a[0]) / (b[0] - a[0]);
        return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      }
      return [P[P.length - 1][1], P[P.length - 1][2]];
    };
    const Y0 = 150, Y1 = 1690; // stencil spans roughly this band
    let W = 0, H = 0, dpr = 1, k = 1, dirty = true;

    const resize = () => {
      const r = skin.getBoundingClientRect();
      if (!r.width) return;
      const old = document.createElement('canvas');
      old.width = mask.width; old.height = mask.height;
      if (mask.width) old.getContext('2d').drawImage(mask, 0, 0);
      dpr = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height; k = W / IW;
      [ink, red, mask].forEach(c => { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); });
      if (old.width) mctx.drawImage(old, 0, 0, mask.width, mask.height);
      dirty = true;
    };
    resize();
    new ResizeObserver(resize).observe(skin);

    // probe grid for coverage (inside the forearm only)
    const PW = 45, PH = 89; probe.width = PW; probe.height = PH;
    const inside = [];
    for (let y = 0; y < PH; y++) {
      const iy = (y + .5) / PH * IH;
      if (iy < Y0 || iy > Y1) continue;
      const [lo, hi] = edge(iy);
      for (let x = 0; x < PW; x++) { const ix = (x + .5) / PW * IW; if (ix > lo + 25 && ix < hi - 25) inside.push(y * PW + x); }
    }

    /* brush */
    const stamp = (x, y, s = 1) => { // css px within skin
      const R = W * .06 * s;
      const X = x * dpr, Yp = y * dpr, RR = R * dpr;
      let g = mctx.createRadialGradient(X, Yp, 0, X, Yp, RR);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(.55, 'rgba(0,0,0,.7)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      mctx.fillStyle = g; mctx.beginPath(); mctx.arc(X, Yp, RR, 0, 7); mctx.fill();
      g = rctx.createRadialGradient(X, Yp, 0, X, Yp, RR * 1.25);
      g.addColorStop(0, 'rgba(214,60,38,.10)'); g.addColorStop(1, 'rgba(214,60,38,0)');
      rctx.fillStyle = g; rctx.beginPath(); rctx.arc(X, Yp, RR * 1.25, 0, 7); rctx.fill();
      dirty = true; redUntil = performance.now() + 2600;
    };
    const stroke = (x0, y0, x1, y1, s) => {
      const d = Math.hypot(x1 - x0, y1 - y0), step = Math.max(2, W * .012), n = Math.ceil(d / step);
      for (let i = 1; i <= n; i++) stamp(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, s);
    };

    /* needle position (tip), smoothed */
    let nx = W * .9, ny = H * .2, tx = nx, ty = ny, lastNx = nx, buzzing = false, redUntil = 0;
    const tipX = 14 / 160, tipY = 146 / 160;

    /* auto shading path — packs grey wash in sweeping rows, top to bottom */
    let doneAt = 0, unink = 0, autoOn = false, ay = Y0, ax = 0, adir = 1, aT = 0, lastUser = -1e9, done = false, finishing = 0;
    const autoStep = dt => {
      const [lo, hi] = edge(ay);
      ax += adir * dt * 2.6; aT += dt;
      if (adir > 0 && ax > hi - 40) { ax = hi - 40; adir = -1; ay += 46; }
      if (adir < 0 && ax < lo + 40) { ax = lo + 40; adir = 1; ay += 46; }
      if (ay > Y1) { ay = Y0; } // loop until covered
      const wob = Math.sin(aT / 38) * 22;
      return [ax * k, (ay + wob) * k];
    };

    /* user input */
    let userActive = false, px = null, py = null;
    const local = e => { const r = skin.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    // on touch, only the forearm zone inks; the rest of the hero scrolls as normal
    const touchOff = e => e.pointerType !== 'mouse' && !e.target.closest('.skin__zone');
    const onMove = e => {
      if (e.pointerType === 'touch' && !e.isPrimary) return;
      if (touchOff(e)) return;
      const [x, y] = local(e);
      tx = x; ty = y; userActive = true; lastUser = performance.now();
      if (px !== null && !done) stroke(px, py, x, y, 1);
      px = x; py = y;
      hideHint();
    };
    skin.addEventListener('pointermove', onMove);
    skin.addEventListener('pointerdown', e => { if (touchOff(e)) return; const [x, y] = local(e); px = x; py = y; if (!done) stamp(x, y, 1.1); onMove(e); });
    skin.addEventListener('pointerleave', () => { px = py = null; userActive = false; });
    skin.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') { px = py = null; userActive = false; } });
    skin.addEventListener('pointercancel', () => { px = py = null; userActive = false; });

    let hinted = false;
    const showHint = () => { if (hinted) return; hinted = true; hint.textContent = matchMedia('(hover:none)').matches ? 'Rub the arm to ink it' : 'Take the needle — move over the stencil'; hint.classList.add('show'); };
    const hideHint = () => hint.classList.remove('show');

    /* coverage */
    let pct = 0, lastProbe = 0;
    const measure = () => {
      pctx.clearRect(0, 0, PW, PH); pctx.drawImage(mask, 0, 0, PW, PH);
      const d = pctx.getImageData(0, 0, PW, PH).data; let c = 0;
      for (const i of inside) if (d[i * 4 + 3] > 120) c++;
      pct = c / inside.length;
      pctEl.textContent = String(Math.min(100, Math.round(pct * 100 / .96))).padStart(2, '0');
      if (pct > .93 && !done) complete();
      if (pct > .12) showHint();
    };
    const complete = () => {
      done = true; finishing = doneAt = performance.now(); autoOn = false;
      pctEl.textContent = '100';
      setTimeout(() => forever.classList.add('show'), 500);
      setTimeout(() => forever.classList.remove('show'), 4200);
    };

    /* sound — a synthesized coil-machine hum, off by default */
    let ac = null, vol = null;
    const buzzBtn = $('#buzz');
    buzzBtn.addEventListener('click', () => {
      const on = buzzBtn.getAttribute('aria-pressed') !== 'true';
      buzzBtn.setAttribute('aria-pressed', on); buzzBtn.textContent = `♪ Buzz: ${on ? 'on' : 'off'}`;
      if (on && !ac) {
        try {
          ac = new (window.AudioContext || window.webkitAudioContext)();
          const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 96;
          const lfo = ac.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 48;
          const lg = ac.createGain(); lg.gain.value = .5; lfo.connect(lg);
          const amp = ac.createGain(); amp.gain.value = .5; lg.connect(amp.gain);
          const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100;
          vol = ac.createGain(); vol.gain.value = 0;
          o.connect(amp); amp.connect(f); f.connect(vol); vol.connect(ac.destination); o.start(); lfo.start();
        } catch (e) { ac = null; }
      }
      if (ac) ac.resume();
      if (!on && vol) vol.gain.setTargetAtTime(0, ac.currentTime, .03);
    });
    const soundOn = () => ac && buzzBtn.getAttribute('aria-pressed') === 'true';

    /* restencil */
    $('#restencil').addEventListener('click', () => {
      mctx.clearRect(0, 0, mask.width, mask.height); rctx.clearRect(0, 0, red.width, red.height);
      done = false; pct = 0; ay = Y0; adir = 1; ax = edge(Y0)[0] + 40; autoOn = true; lastUser = -1e9;
      forever.classList.remove('show'); pctEl.textContent = '00'; dirty = true;
    });

    /* main loop */
    let visible = true, last = performance.now();
    new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(skin);
    const frame = now => {
      const dt = Math.min(250, now - last); last = now;
      if (visible) {
        const idle = now - lastUser > 2200;
        let inking = false;
        if (autoOn && idle && !done) {
          const near = Math.hypot(nx - tx, ny - ty) < W * .08;
          for (let left = dt; left > 0; left -= 16) { // sub-step so slow devices ink at the same pace
            const [x, y] = autoStep(Math.min(16, left));
            if (near) stroke(tx, ty, x, y, .9);
            tx = x; ty = y;
          }
          if (near) { nx = tx; ny = ty; inking = true; }
        } else if (userActive && !idle) inking = !done;
        if (done && finishing) { // bloom to full colour
          mctx.globalAlpha = .07; mctx.fillStyle = '#000'; mctx.fillRect(0, 0, mask.width, mask.height); mctx.globalAlpha = 1; dirty = true;
          if (now - finishing > 1600) finishing = 0;
        }
        if (done && !finishing && !unink && !reduce && now - doneAt > 9000 && now - lastUser > 9000) unink = now;
        if (unink) { // fade back to the stencil, then start a new session
          mctx.globalCompositeOperation = 'destination-out'; mctx.globalAlpha = .08;
          mctx.fillRect(0, 0, mask.width, mask.height);
          mctx.globalCompositeOperation = 'source-over'; mctx.globalAlpha = 1; dirty = true;
          if (now - unink > 1400) { unink = 0; $('#restencil').click(); }
        }
        const f = (autoOn && idle) ? .5 : .35;
        nx += (tx - nx) * f; ny += (ty - ny) * f;
        const vx = nx - lastNx; lastNx = nx;
        const sz = needle.offsetWidth;
        needle.style.transform = `translate(${nx - sz * tipX}px,${ny - sz * tipY}px) rotate(${Math.max(-14, Math.min(14, vx * .9))}deg)`;
        const b = inking && Math.abs(vx) + 0.001 > 0;
        if (b !== buzzing) { buzzing = b; needle.classList.toggle('buzzing', b); }
        if (soundOn()) vol.gain.setTargetAtTime(buzzing ? .05 : 0, ac.currentTime, .04);

        if (dirty && photo.complete && photo.naturalWidth) {
          ictx.globalCompositeOperation = 'source-over';
          ictx.clearRect(0, 0, ink.width, ink.height);
          ictx.drawImage(photo, 0, 0, ink.width, ink.height);
          ictx.globalCompositeOperation = 'destination-in';
          ictx.drawImage(mask, 0, 0);
          ictx.globalCompositeOperation = 'source-over';
          dirty = false;
        }
        if (now < redUntil) { // fresh-ink redness fades
          rctx.globalCompositeOperation = 'destination-out'; rctx.fillStyle = 'rgba(0,0,0,.05)';
          rctx.fillRect(0, 0, red.width, red.height); rctx.globalCompositeOperation = 'source-over';
        } else if (now - redUntil < 50) rctx.clearRect(0, 0, red.width, red.height);
        if (now - lastProbe > 350) { lastProbe = now; measure(); }
      }
      requestAnimationFrame(frame);
    };
    photo.onload = () => { dirty = true; };

    const start = () => {
      needle.classList.add('on');
      if (reduce) { mctx.fillRect(0, 0, mask.width, mask.height); done = true; dirty = true; pctEl.textContent = '100'; return; }
      ax = edge(Y0)[0] + 40; tx = ax * k; ty = Y0 * k; autoOn = true;
    };
    requestAnimationFrame(frame);
    if (document.documentElement.classList.contains('loaded')) setTimeout(start, 300);
    else document.addEventListener('site:loaded', () => setTimeout(start, 900), { once: true });
  })();

  /* ---------- Cursor ---------- */
  const cur = $('#cursor'), dot = $('#cursorDot');
  if (matchMedia('(hover:hover) and (pointer:fine)').matches) {
    let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
    addEventListener('mousemove', e => { x = e.clientX; y = e.clientY; dot.style.transform = `translate(${x}px,${y}px)`; });
    (function loop() {
      cx += (x - cx) * .18; cy += (y - cy) * .18;
      cur.style.transform = `translate(${cx}px,${cy}px)`;
      requestAnimationFrame(loop);
    })();
    document.addEventListener('mouseover', e => {
      const t = e.target;
      const onSkin = !!t.closest('.skin'); cur.classList.toggle('is-gone', onSkin); dot.classList.toggle('is-gone', onSkin);
      cur.classList.toggle('is-view', !!t.closest('.card, .polaroid'));
      cur.classList.toggle('is-link', !t.closest('.card, .polaroid') && !!t.closest('a, button, summary'));
    });
  }

  /* ---------- Nav ---------- */
  const nav = $('#nav'), burger = $('#burger'), links = $('#navLinks');
  let lastY = 0;
  addEventListener('scroll', () => {
    const y = scrollY;
    nav.classList.toggle('is-scrolled', y > 40);
    nav.classList.toggle('is-hidden', y > 500 && y > lastY && !links.classList.contains('is-open'));
    lastY = y;
  }, { passive: true });
  burger.addEventListener('click', () => {
    const open = links.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', open);
    document.body.style.overflow = open ? 'hidden' : '';
  });
  $$('a', links).forEach(a => a.addEventListener('click', () => {
    links.classList.remove('is-open'); burger.setAttribute('aria-expanded', false); document.body.style.overflow = '';
  }));

  /* ---------- Mala progress: 27 beads + guru bead ---------- */
  const mala = $('#mala');
  const BEADS = 27;
  for (let i = 0; i < BEADS; i++) mala.appendChild(document.createElement('i'));
  const guru = document.createElement('i'); guru.className = 'guru'; mala.appendChild(guru);
  mala.appendChild(document.createElement('b'));
  const beads = $$('i', mala);

  /* ---------- Manifesto: split into words that ink in ---------- */
  const ink = $('#inkText');
  const hl = ['rudraksha', 'tear', "shiva's", 'lifetime', 'you'];
  ink.innerHTML = ink.textContent.trim().split(/\s+/).map(w => {
    const k = w.toLowerCase().replace(/[^a-z']/g, '');
    return `<span class="w${hl.includes(k) ? ' hl' : ''}">${w}</span>`;
  }).join(' ');
  const words = $$('.w', ink);

  /* ---------- Session scrub: an image sequence on canvas ----------
     Phones seek video frames slowly, so scrubbing a <video> stutters. Swapping
     pre-decoded stills is instant everywhere. All frames start downloading
     when the page opens: a coarse pass first, then the gaps fill in. */
  const ritual = $('#ritual'), scv = $('#scrub'), sctx = scv.getContext('2d'), bar = $('#scrubBar'), time = $('#scrubTime');
  const steps = $$('#steps li');
  const FRAMES = 150, dur = 29.1;
  const frames = new Array(FRAMES);
  let target = 0, shown = 0, drawn = -1, loadedN = 0;
  const frameSrc = i => `assets/frames/f${String(i).padStart(3, '0')}.webp`;
  const order = [];
  [16, 8, 4, 2, 1].forEach(st => { for (let i = 0; i < FRAMES; i += st) if (!order.includes(i)) order.push(i); });
  const loadFrames = () => {
    let next = 0;
    const pump = () => {
      if (next >= order.length) return;
      const i = order[next++], img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const done = () => { frames[i] = img; loadedN++; drawn = -1; pump(); };
        img.decode ? img.decode().then(done, done) : done();
      };
      img.onerror = pump;
      img.src = frameSrc(i);
    };
    for (let c = 0; c < 6; c++) pump();
  };
  if (document.readyState === 'complete') setTimeout(loadFrames, 300);
  else addEventListener('load', () => setTimeout(loadFrames, 300), { once: true });

  const nearest = i => {
    for (let d = 0; d < FRAMES; d++) {
      if (frames[i - d]) return frames[i - d];
      if (frames[i + d]) return frames[i + d];
    }
    return null;
  };
  const sizeScrub = () => {
    const r = scv.getBoundingClientRect(), dp = Math.min(2, devicePixelRatio || 1);
    scv.width = Math.round(r.width * dp); scv.height = Math.round(r.height * dp); drawn = -1;
  };
  sizeScrub(); addEventListener('resize', sizeScrub);
  (function scrubLoop() {
    shown += (target - shown) * .25;
    const fi = Math.max(0, Math.min(FRAMES - 1, Math.round(shown / dur * (FRAMES - 1))));
    if (fi !== drawn) {
      const img = nearest(fi);
      if (img) {
        const cw = scv.width, ch = scv.height, s = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
        const w = img.naturalWidth * s, h = img.naturalHeight * s;
        sctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
        if (frames[fi]) drawn = fi;
      }
    }
    requestAnimationFrame(scrubLoop);
  })();

  const onScroll = () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    const p = h > 0 ? scrollY / h : 0;
    const lit = Math.round(p * (BEADS + 1));
    beads.forEach((b, i) => b.classList.toggle('on', i < lit));

    // manifesto ink
    const r = ink.getBoundingClientRect();
    const mp = Math.min(1, Math.max(0, (innerHeight * .85 - r.top) / (r.height + innerHeight * .35)));
    const count = Math.floor(mp * words.length * 1.05);
    words.forEach((w, i) => w.classList.toggle('on', i < count));

    // ritual scrub
    const rr = ritual.getBoundingClientRect();
    const rp = Math.min(1, Math.max(0, -rr.top / (rr.height - innerHeight)));
    target = rp * (dur - .1);
    bar.style.width = (rp * 100) + '%';
    const s = Math.floor(target);
    time.textContent = `00:${String(s).padStart(2, '0')}`;
    steps.forEach(li => li.classList.toggle('on', target >= +li.dataset.from && target < +li.dataset.to));
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  /* ---------- Reveal on view ---------- */
  const rvTargets = $$('.section-head, .card, .flash__item, .rq, .reviews__score, .artist__text > *, .book__left, .form, .visit__info > *, .faq details, .heal');
  rvTargets.forEach(el => el.classList.add('rv'));
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: .12, rootMargin: '0px 0px -40px 0px' });
  rvTargets.forEach((el, i) => { el.style.transitionDelay = (i % 4) * 70 + 'ms'; io.observe(el); });

  /* ---------- Flash sheet: ink follows the pointer ---------- */
  $$('.flash__item').forEach(el => el.addEventListener('pointerenter', e => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    el.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }));

  /* ---------- Gallery filter ---------- */
  const filters = $$('.filter'), cards = $$('.card');
  filters.forEach(f => f.addEventListener('click', () => {
    filters.forEach(x => { x.classList.toggle('is-active', x === f); x.setAttribute('aria-selected', x === f); });
    const cat = f.dataset.filter;
    cards.forEach(c => {
      const show = cat === 'all' || c.dataset.cat === cat;
      if (show) { c.classList.remove('is-hidden'); c.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: 'cubic-bezier(.2,.7,.1,1)' }); }
      else c.classList.add('is-hidden');
    });
  }));

  /* ---------- Lightbox ---------- */
  const works = [
    { img: ['shiva-kali', 'shiva-kali-2'] },
    { img: ['poseidon', 'zeus-stencil'], altLabel: ['Finished', 'Stencil stage'] },
    { img: ['guardian-lion', 'guardian-lion-2'] },
    { img: ['rooted-man', 'rooted-man-2'] },
    { img: ['mahadev-trishul'] },
    { img: ['atlas-mind'] },
    { img: ['shears-rose'] },
  ];
  const lb = $('#lightbox'), lbImg = $('#lbImg'), lbNo = $('#lbNo'), lbTitle = $('#lbTitle'), lbMeta = $('#lbMeta'), lbAlt = $('#lbAlt');
  let cur_i = 0, cur_v = 0, lastFocus;
  const visible = () => cards.filter(c => !c.classList.contains('is-hidden')).map(c => +c.dataset.idx);
  const render = () => {
    const w = works[cur_i], card = cards[cur_i];
    lbImg.src = `assets/img/${w.img[cur_v]}.webp`;
    lbImg.alt = $('img', card).alt;
    lbNo.textContent = $('.card__no', card).textContent;
    lbTitle.textContent = $('b', card).textContent;
    lbMeta.textContent = $('figcaption .mono:last-child', card).textContent;
    if (w.img.length > 1) {
      const labels = w.altLabel || ['Angle 1', 'Angle 2'];
      lbAlt.textContent = `View ${labels[(cur_v + 1) % w.img.length]}`;
    } else lbAlt.textContent = '';
    lbImg.animate([{ opacity: 0, transform: 'scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 400 });
  };
  const open = i => { lastFocus = document.activeElement; cur_i = i; cur_v = 0; render(); lb.hidden = false; lb.classList.add('show'); document.body.style.overflow = 'hidden'; $('#lbClose').focus(); };
  const close = () => { lb.hidden = true; document.body.style.overflow = ''; lastFocus && lastFocus.focus(); };
  const step = d => { const v = visible(); const k = v.indexOf(cur_i); cur_i = v[(k + d + v.length) % v.length]; cur_v = 0; render(); };
  cards.forEach(c => {
    c.tabIndex = 0; c.setAttribute('role', 'button');
    c.addEventListener('click', () => open(+c.dataset.idx));
    c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(+c.dataset.idx); } });
  });
  $('#lbClose').addEventListener('click', close);
  $('#lbPrev').addEventListener('click', () => step(-1));
  $('#lbNext').addEventListener('click', () => step(1));
  lbAlt.addEventListener('click', () => { cur_v = (cur_v + 1) % works[cur_i].img.length; render(); });
  lb.addEventListener('click', e => { if (e.target === lb) close(); });
  addEventListener('keydown', e => {
    if (lb.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });
  let tx = 0;
  lb.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => { const d = e.changedTouches[0].clientX - tx; if (Math.abs(d) > 50) step(d < 0 ? 1 : -1); });

  /* ---------- Aftercare tabs ---------- */
  const tabs = $$('.heal__tab'), panels = $$('.heal__panel'), healLine = $('#healLine');
  tabs.forEach((t, i) => t.addEventListener('click', () => {
    tabs.forEach((x, j) => x.classList.toggle('is-active', j === i));
    panels.forEach((x, j) => x.classList.toggle('is-active', j === i));
    healLine.style.left = (i * 25) + '%';
  }));

  /* ---------- Booking → WhatsApp ---------- */
  $$('.chips').forEach(group => group.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $$('button', group).forEach(x => x.classList.toggle('on', x === b && !b.classList.contains('on')));
  }));
  const form = $('#bookForm'), note = $('#formNote');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = form.name.value.trim(), idea = form.idea.value.trim();
    $$('.field', form).forEach(f => f.classList.remove('err'));
    if (!name || !idea) {
      if (!name) form.name.closest('.field').classList.add('err');
      if (!idea) form.idea.closest('.field').classList.add('err');
      note.textContent = 'Add your name and idea first.';
      return;
    }
    note.textContent = '';
    const pick = k => { const b = $(`.chips[data-name="${k}"] button.on`, form); return b ? b.textContent : 'Not sure'; };
    const date = form.date.value ? new Date(form.date.value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Flexible';
    const msg = `Hi Rud! I'd like to book a tattoo at Rudraksha Tattooz.\n\n` +
      `Name: ${name}\nIdea: ${idea}\nPlacement: ${pick('placement')}\nSize: ${pick('size')}\nPreferred date: ${date}\n\n(Sent from the website)`;
    window.open(`https://wa.me/${WA}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  });

  /* ---------- Hours: show live open/closed (closes 10:30 pm) ---------- */
  const hours = $('.visit__hours');
  if (hours) {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const mins = now.getHours() * 60 + now.getMinutes();
    if (mins > 22 * 60 + 30) { hours.lastChild.textContent = ' Closed now · back tomorrow'; hours.querySelector('i').style.background = 'var(--sindoor)'; hours.querySelector('i').style.animation = 'none'; }
  }

  $('#yr').textContent = new Date().getFullYear();
})();
