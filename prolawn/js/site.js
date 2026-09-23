/* Pro Lawn Care & Landscaping — site behavior */

// Header state
const header = document.getElementById('site-header');
const onScroll = () => header.classList.toggle('scrolled', scrollY > 40);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Mobile nav
const toggle = document.getElementById('menu-toggle');
toggle.addEventListener('click', () => document.body.classList.toggle('nav-open'));
document.querySelectorAll('#site-nav a').forEach(a =>
  a.addEventListener('click', () => document.body.classList.remove('nav-open')));

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

function openLb(i) {
  lbIndex = (i + figures.length) % figures.length;
  const img = figures[lbIndex].querySelector('img');
  lbImg.src = img.dataset.full || img.src;
  lbImg.alt = img.alt;
  lbCap.textContent = figures[lbIndex].querySelector('figcaption').textContent +
    '  ·  ' + (lbIndex + 1) + ' / ' + figures.length;
  lb.classList.add('open');
  lb.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}
function closeLb() {
  lb.classList.remove('open');
  lb.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}
figures.forEach((f, i) => f.addEventListener('click', () => openLb(i)));
lb.querySelector('.lb-close').addEventListener('click', closeLb);
lb.querySelector('.lb-prev').addEventListener('click', e => { e.stopPropagation(); openLb(lbIndex - 1); });
lb.querySelector('.lb-next').addEventListener('click', e => { e.stopPropagation(); openLb(lbIndex + 1); });
lb.addEventListener('click', e => { if (e.target === lb) closeLb(); });
addEventListener('keydown', e => {
  if (!lb.classList.contains('open')) return;
  if (e.key === 'Escape') closeLb();
  if (e.key === 'ArrowLeft') openLb(lbIndex - 1);
  if (e.key === 'ArrowRight') openLb(lbIndex + 1);
});

// Quote form → email app
document.getElementById('quote-form').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  const subject = encodeURIComponent('Quote request — ' + f.service.value + ' (' + f.name.value + ')');
  const body = encodeURIComponent(
    'Name: ' + f.name.value +
    '\nPhone: ' + f.phone.value +
    '\nEmail: ' + f.email.value +
    '\nService: ' + f.service.value +
    '\n\n' + f.message.value);
  location.href = 'mailto:prolawncareco@gmail.com?subject=' + subject + '&body=' + body;
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
