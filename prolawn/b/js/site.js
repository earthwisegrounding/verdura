/* Pro Lawn Care & Landscaping — Option B behavior */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- header state + mobile menu ---------- */
  const hdr = $('#hdr');
  const onScroll = () => hdr.classList.toggle('stuck', hdr.getBoundingClientRect().top <= 0 && scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const burger = $('#burger');
  const setMenu = open => {
    document.body.classList.toggle('menu', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  burger.addEventListener('click', () => setMenu(!document.body.classList.contains('menu')));
  $$('#nav a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

  /* ---------- scrollspy ---------- */
  const navLinks = $$('#nav a[href^="#"]');
  const spy = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      // the hero has no nav link, so reaching it clears the highlight
      const href = e.target.id ? '#' + e.target.id : null;
      navLinks.forEach(a => a.classList.toggle('on', a.getAttribute('href') === href));
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  spy.observe($('.hero'));
  ['services', 'studio', 'work', 'about', 'faq', 'contact'].forEach(id => spy.observe(document.getElementById(id)));

  /* ---------- reveal ---------- */
  const rev = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); rev.unobserve(e.target); }
  }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });
  $$('[data-r]').forEach((el, i) => {
    // stagger siblings that reveal together
    const sibs = [...el.parentElement.children].filter(c => c.hasAttribute('data-r'));
    el.style.transitionDelay = (sibs.indexOf(el) * 0.08) + 's';
    rev.observe(el);
  });

  /* ---------- hero parallax ---------- */
  const par = $$('[data-par]');
  if (par.length && !reduced) {
    let ticking = false;
    const apply = () => {
      ticking = false;
      if (scrollY > innerHeight * 1.2) return;
      for (const el of par) el.style.transform = `translate3d(0, ${scrollY * parseFloat(el.dataset.par)}px, 0)`;
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(apply); } }, { passive: true });
  }

  /* ---------- voice note ---------- */
  const PEAKS = [0.82,0.81,0.81,0.68,0.25,0.08,0.84,0.65,0.59,0.41,0.61,0.08,0.08,1.0,0.58,0.68,0.32,0.69,0.35,0.26,0.84,0.45,0.86,0.66,0.28,0.79,0.66,0.44,0.46,0.16,0.29,0.63,0.39,0.1,0.23,0.51,0.42,0.34,0.4,0.4,0.44,0.37,0.51,0.39,0.42,0.08,0.73,0.53,0.48,0.49,0.45,0.17,0.08,0.57,0.5,0.57,0.32,0.33,0.08,0.28,0.61,0.49,0.49,0.08];
  const voice = $('#voice');
  if (voice) {
    const audio = $('audio', voice);
    const wave = $('.v-wave', voice);
    const time = $('.v-time', voice);
    const bars = PEAKS.map(p => `<i style="height:${Math.round(18 + p * 82)}%"></i>`).join('');
    $$('.v-bars', voice).forEach(b => { b.innerHTML = bars; });
    const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
    const dur = () => (isFinite(audio.duration) ? audio.duration : 31);
    const paint = () => {
      const p = audio.currentTime / dur();
      wave.style.setProperty('--p', (p * 100).toFixed(2) + '%');
      wave.setAttribute('aria-valuenow', Math.round(audio.currentTime));
      time.textContent = audio.currentTime > 0 ? fmt(audio.currentTime) + ' / ' + fmt(dur()) : fmt(dur());
    };
    audio.addEventListener('loadedmetadata', () => { wave.setAttribute('aria-valuemax', Math.round(dur())); paint(); });
    audio.addEventListener('timeupdate', paint);
    audio.addEventListener('play', () => voice.classList.add('playing'));
    audio.addEventListener('pause', () => voice.classList.remove('playing'));
    audio.addEventListener('ended', () => { audio.currentTime = 0; paint(); });
    $('.v-play', voice).addEventListener('click', () => (audio.paused ? audio.play() : audio.pause()));
    const seekTo = t => { audio.currentTime = Math.max(0, Math.min(dur() - 0.05, t)); paint(); };
    wave.addEventListener('click', e => {
      const r = wave.getBoundingClientRect();
      seekTo(((e.clientX - r.left) / r.width) * dur());
      if (audio.paused) audio.play();
    });
    wave.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { seekTo(audio.currentTime + 3); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { seekTo(audio.currentTime - 3); e.preventDefault(); }
      if (e.key === ' ' || e.key === 'Enter') { audio.paused ? audio.play() : audio.pause(); e.preventDefault(); }
    });
  }

  /* ---------- services tabs ---------- */
  const tabs = $$('.svc-tab');
  const panels = $$('.svc-panel');
  const select = (i, focus) => {
    tabs.forEach((t, j) => {
      const on = i === j;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      panels[j].classList.toggle('on', on);
    });
    if (focus) tabs[i].focus();
    if (matchMedia('(max-width: 920px)').matches) tabs[i].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  };
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(i));
    if (finePointer) t.addEventListener('mouseenter', () => select(i));
    t.addEventListener('keydown', e => {
      const k = e.key;
      if (['ArrowDown', 'ArrowRight'].includes(k)) { select((i + 1) % tabs.length, true); e.preventDefault(); }
      if (['ArrowUp', 'ArrowLeft'].includes(k)) { select((i - 1 + tabs.length) % tabs.length, true); e.preventDefault(); }
      if (k === 'Home') { select(0, true); e.preventDefault(); }
      if (k === 'End') { select(tabs.length - 1, true); e.preventDefault(); }
    });
  });

  /* ---------- live 3D studio embed ---------- */
  const embed = $('#embed');
  $('#launch').addEventListener('click', () => {
    if (matchMedia('(max-width: 600px)').matches) { location.href = 'designer.html'; return; }
    embed.classList.add('loading');
    const f = document.createElement('iframe');
    f.src = 'designer.html';
    f.title = 'Pro Lawn Design Studio';
    f.allow = 'fullscreen';
    f.addEventListener('load', () => {
      embed.classList.remove('loading');
      embed.classList.add('live');
      f.focus();
    }, { once: true });
    $('.embed-body', embed).appendChild(f);
  });

  /* ---------- gallery filter + lightbox ---------- */
  const tiles = $$('.tile');
  const chips = $$('.chip');
  chips.forEach(c => {
    const f = c.dataset.f;
    $('.ct', c).textContent = f === 'all' ? tiles.length : tiles.filter(t => t.dataset.cats.split(' ').includes(f)).length;
    c.addEventListener('click', () => {
      chips.forEach(x => x.setAttribute('aria-pressed', String(x === c)));
      tiles.forEach(t => {
        const show = f === 'all' || t.dataset.cats.split(' ').includes(f);
        t.classList.toggle('hide', !show);
        t.classList.remove('pop');
        if (show) { void t.offsetWidth; t.classList.add('pop'); }
      });
    });
  });

  const lb = $('#lb');
  const lbImg = $('img', lb);
  const lbCap = $('figcaption', lb);
  let list = [], idx = 0, lastFocus = null;
  const show = i => {
    idx = (i + list.length) % list.length;
    const img = $('img', list[idx]);
    lbImg.src = img.dataset.full;
    lbImg.alt = img.alt;
    lbCap.textContent = img.alt + '  ·  ' + (idx + 1) + ' / ' + list.length;
  };
  const open = tile => {
    list = tiles.filter(t => !t.classList.contains('hide'));
    lastFocus = document.activeElement;
    show(list.indexOf(tile));
    lb.hidden = false;
    requestAnimationFrame(() => lb.classList.add('open'));
    document.body.style.overflow = 'hidden';
    $('.lb-x', lb).focus();
  };
  const close = () => {
    lb.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => { lb.hidden = true; }, 250);
    if (lastFocus) lastFocus.focus();
  };
  tiles.forEach(t => {
    t.addEventListener('click', () => open(t));
    t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { open(t); e.preventDefault(); } });
  });
  $('.lb-x', lb).addEventListener('click', close);
  $('.lb-prev', lb).addEventListener('click', () => show(idx - 1));
  $('.lb-next', lb).addEventListener('click', () => show(idx + 1));
  lb.addEventListener('click', e => { if (e.target === lb) close(); });
  addEventListener('keydown', e => {
    if (lb.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(idx - 1);
    if (e.key === 'ArrowRight') show(idx + 1);
    if (e.key === 'Tab') { // keep focus inside the dialog
      const f = $$('button', lb);
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
  });

  /* ---------- quote form -> Formspree (email app as fallback) ---------- */
  const form = $('#quote');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#form-err');
    const name = form.elements.name;
    const phone = form.elements.phone.value.trim();
    const email = form.elements.email.value.trim();
    name.removeAttribute('aria-invalid');
    if (!name.value.trim()) {
      name.setAttribute('aria-invalid', 'true');
      err.textContent = 'Please add your name so we know who to reach.';
      name.focus();
      return;
    }
    if (!phone && !email) {
      err.textContent = 'Please add a phone number or email so we can get back to you.';
      form.elements.phone.focus();
      return;
    }
    err.textContent = '';
    const needs = $$('input[name="need"]:checked', form).map(i => i.value);
    const subject = 'Quote request' + (needs.length ? ' — ' + needs.join(', ') : '') + ' (' + name.value.trim() + ')';
    const body =
      'Name: ' + name.value.trim() +
      '\nPhone: ' + phone +
      '\nEmail: ' + email +
      '\nInterested in: ' + (needs.join(', ') || '—') +
      '\n\n' + form.elements.message.value.trim();
    const payload = {
      name: name.value.trim(), phone, email,
      interested_in: needs.join(', ') || '—',
      message: form.elements.message.value.trim(),
      _subject: subject, _gotcha: form.elements._gotcha.value,
    };
    if (email) payload._replyto = email;
    const btn = $('button[type="submit"]', form);
    const btnHTML = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Formspree ' + res.status);
      const first = name.value.trim().split(' ')[0].replace(/[<>&"]/g, '');
      form.innerHTML =
        '<div class="form-done" role="status" tabindex="-1">' +
        '<h3>Thanks' + (first ? ', ' + first : '') + '!</h3>' +
        '<p class="sub">Your quote request is in. We\'ll be in touch soon — need us sooner? Call <a href="tel:17192500747">719-250-0747</a>.</p></div>';
      $('.form-done', form).focus();
    } catch {
      btn.disabled = false;
      btn.innerHTML = btnHTML;
      err.textContent = 'We couldn\'t send that just now — opening your email app instead.';
      location.href = 'mailto:prolawncareco@gmail.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    }
  });

  $('#yr').textContent = new Date().getFullYear();
})();
