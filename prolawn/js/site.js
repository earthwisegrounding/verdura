/* Pro Lawn Care & Landscaping — site behavior */

// Header state
const header = document.getElementById('site-header');
const onScroll = () => header.classList.toggle('scrolled', scrollY > 40);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Mobile nav
const toggle = document.getElementById('menu-toggle');
const setNav = open => {
  document.body.classList.toggle('nav-open', open);
  toggle.setAttribute('aria-expanded', String(open));
};
toggle.addEventListener('click', () => setNav(!document.body.classList.contains('nav-open')));
document.querySelectorAll('#site-nav a').forEach(a => a.addEventListener('click', () => setNav(false)));
addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.body.classList.contains('nav-open')) { setNav(false); toggle.focus(); }
});

// Reveal on scroll
const io = new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('[data-reveal]').forEach(el => io.observe(el));

// Lightbox
const lb = document.getElementById('lightbox');
const lbImg = lb.querySelector('img');
const lbCap = lb.querySelector('.lb-cap');
const figures = [...document.querySelectorAll('#gallery figure')];
let lbIndex = 0;
let lbReturn = null;

function openLb(i) {
  lbIndex = (i + figures.length) % figures.length;
  const img = figures[lbIndex].querySelector('img');
  lbImg.src = img.dataset.full || img.src;
  lbImg.alt = img.alt;
  lbCap.textContent = figures[lbIndex].querySelector('figcaption').textContent +
    '  ·  ' + (lbIndex + 1) + ' / ' + figures.length;
  if (!lb.classList.contains('open')) {
    lbReturn = document.activeElement;
    lb.classList.add('open');
    lb.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    lb.querySelector('.lb-close').focus();
  }
}
function closeLb() {
  lb.classList.remove('open');
  lb.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  if (lbReturn) lbReturn.focus();
}
figures.forEach((f, i) => {
  f.addEventListener('click', () => openLb(i));
  f.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLb(i); }
  });
});
lb.querySelector('.lb-close').addEventListener('click', closeLb);
lb.querySelector('.lb-prev').addEventListener('click', e => { e.stopPropagation(); openLb(lbIndex - 1); });
lb.querySelector('.lb-next').addEventListener('click', e => { e.stopPropagation(); openLb(lbIndex + 1); });
lb.addEventListener('click', e => { if (e.target === lb) closeLb(); });
addEventListener('keydown', e => {
  if (!lb.classList.contains('open')) return;
  if (e.key === 'Escape') closeLb();
  if (e.key === 'ArrowLeft') openLb(lbIndex - 1);
  if (e.key === 'ArrowRight') openLb(lbIndex + 1);
  if (e.key === 'Tab') { // keep focus on the viewer's buttons while it's open
    const btns = [...lb.querySelectorAll('button')];
    const i = btns.indexOf(document.activeElement);
    e.preventDefault();
    btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
  }
});

// Quote form → Formspree (falls back to the email app if it can't be reached)
const quoteForm = document.getElementById('quote-form');
quoteForm.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  const err = document.getElementById('form-err');
  const btn = f.querySelector('button[type="submit"]');
  const name = f.name.value.trim(), phone = f.phone.value.trim(), email = f.email.value.trim();
  if (!phone && !email) {
    err.textContent = 'Please add a phone number or email so we can get back to you.';
    f.phone.focus();
    return;
  }
  err.textContent = '';
  const subject = 'Quote request — ' + f.service.value + ' (' + name + ')';
  const payload = {
    name, phone, email, service: f.service.value, message: f.message.value.trim(),
    _subject: subject, _gotcha: f._gotcha.value,
  };
  if (email) payload._replyto = email;
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    const res = await fetch(f.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Formspree ' + res.status);
    const first = name.split(' ')[0];
    f.innerHTML =
      '<div class="form-done" role="status" tabindex="-1">' +
      '<h3>Thanks' + (first ? ', ' + first.replace(/[<>&"]/g, '') : '') + '!</h3>' +
      '<p>Your quote request is in. We\'ll be in touch soon — need us sooner? Call <a href="tel:17192500747">719-250-0747</a>.</p></div>';
    f.querySelector('.form-done').focus();
  } catch {
    btn.disabled = false;
    btn.textContent = 'Send quote request';
    err.textContent = 'We couldn\'t send that just now — opening your email app instead.';
    const body = 'Name: ' + name + '\nPhone: ' + phone + '\nEmail: ' + email +
      '\nService: ' + f.service.value + '\n\n' + payload.message;
    location.href = 'mailto:prolawncareco@gmail.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }
});

// Hero welcome audio
const audioBtn = document.getElementById('audio-cta');
if (audioBtn) {
  const audio = document.getElementById('welcome-audio');
  const timeEl = audioBtn.querySelector('.ac-time');
  const fmt = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  audio.addEventListener('loadedmetadata', () => { timeEl.textContent = fmt(audio.duration); });
  audioBtn.addEventListener('click', () => { audio.paused ? audio.play() : audio.pause(); });
  audio.addEventListener('play', () => { audioBtn.classList.add('playing'); audioBtn.setAttribute('aria-pressed', 'true'); });
  audio.addEventListener('pause', () => { audioBtn.classList.remove('playing'); audioBtn.setAttribute('aria-pressed', 'false'); });
  audio.addEventListener('timeupdate', () => { if (!audio.paused) timeEl.textContent = fmt(Math.max(0, audio.duration - audio.currentTime)); });
  audio.addEventListener('ended', () => { audio.currentTime = 0; timeEl.textContent = fmt(audio.duration); });
}

// Footer year
document.getElementById('year').textContent = new Date().getFullYear();
