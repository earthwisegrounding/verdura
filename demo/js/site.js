// Shorepine demo site
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* menu on phones */
  const toggle = $('.nav-toggle'), list = $('#nav-list');
  toggle.addEventListener('click', () => {
    const open = list.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
  });
  list.addEventListener('click', e => { if (e.target.closest('a')) { list.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); } });

  /* design vs photo-real: drag (or arrow keys) to compare; one sweep on load shows it moves */
  const cmp = $('#compare'), range = $('.compare-range', cmp);
  const setPos = v => cmp.style.setProperty('--pos', v + '%');
  let touched = false;
  range.addEventListener('input', () => { touched = true; setPos(range.value); });
  if (!still) {
    const keys = [[0, 50], [700, 22], [1500, 78], [2300, 50]];
    let t0 = null;
    const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const step = ts => {
      if (touched) return;
      t0 ??= ts;
      const t = ts - t0;
      const i = keys.findIndex(k => k[0] > t);
      if (i === -1) { setPos(50); range.value = 50; return; }
      const [ta, va] = keys[i - 1], [tb, vb] = keys[i];
      const v = va + (vb - va) * ease((t - ta) / (tb - ta));
      setPos(v); range.value = v;
      requestAnimationFrame(step);
    };
    const img = $('.compare-b', cmp);
    const start = () => setTimeout(() => requestAnimationFrame(step), 500);
    img.complete ? start() : img.addEventListener('load', start, { once: true });
  }

  /* studio features: each tab plays a clip from the real studio */
  const video = $('#feature-video'), panel = $('#feature-panel');
  const tabs = $$('.feature-list [role="tab"]');
  const select = (tab, focus) => {
    tabs.forEach(t => { t.setAttribute('aria-selected', t === tab); t.tabIndex = t === tab ? 0 : -1; });
    panel.setAttribute('aria-labelledby', tab.id);
    if (focus) tab.focus();
    if (!video.src.endsWith(tab.dataset.src)) {
      video.src = tab.dataset.src;
      if (!still) video.play().catch(() => {});
    }
  };
  tabs.forEach((tab, i) => {
    tab.tabIndex = i ? -1 : 0;
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', e => {
      const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      select(tabs[(i + d + tabs.length) % tabs.length], true);
    });
  });
  if (!still) {
    new IntersectionObserver(([en]) => { en.isIntersecting ? video.play().catch(() => {}) : video.pause(); }, { threshold: 0.35 }).observe(video);
  } else {
    video.controls = true;
  }

  /* open the live studio in place, on the showcase design */
  const launch = $('#launch'), full = $('#launch-full');
  $('#launch-btn').addEventListener('click', () => {
    const f = document.createElement('iframe');
    f.src = full.getAttribute('href');
    f.title = 'Shorepine design studio';
    f.allow = 'fullscreen';
    launch.appendChild(f);
    launch.classList.add('live');
    f.focus();
  });

  /* walkthrough chapters */
  const walk = $('#walk-video'), chapters = $$('.chapters li');
  chapters.forEach(li => {
    $('button', li).addEventListener('click', () => {
      walk.currentTime = +$('button', li).dataset.t;
      walk.play().catch(() => {});
    });
  });
  walk.addEventListener('timeupdate', () => {
    let cur = -1;
    chapters.forEach((li, i) => { if (walk.currentTime >= +$('button', li).dataset.t - 0.2) cur = i; });
    chapters.forEach((li, i) => li.classList.toggle('now', i === cur));
  });

  /* contact: this is a demo, so nothing is sent */
  const form = $('#contact-form'), note = $('.form-note', form);
  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = form.elements.name.value.trim(), reach = form.elements.reach.value.trim();
    if (!name) { note.textContent = 'Add your name so we know who to reply to.'; form.elements.name.focus(); return; }
    if (!reach) { note.textContent = 'Add an email or phone number so we can reply.'; form.elements.reach.focus(); return; }
    note.textContent = `Thanks, ${name}. This is a demo site, so your message wasn't sent anywhere.`;
    form.reset();
  });
})();
