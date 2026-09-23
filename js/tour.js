/* Guided tour for customers in quote mode: spotlights the real controls one
   at a time. Opens once on a visitor's first visit (after the scene's models
   are in); the ? button beside "Send my design" replays it. */

const KEY = 'verdura-tour-seen-v1';
const touch = matchMedia('(pointer: coarse)').matches;
const narrow = () => matchMedia('(max-width: 760px)').matches; // tools live behind ☰
const tap = touch ? 'tap' : 'click';
const Tap = touch ? 'Tap' : 'Click';
const tapping = touch ? 'tapping' : 'clicking';
const inMenu = () => (narrow() ? ' (open ☰ to find them)' : '');

const $ = s => document.querySelector(s);
const drawGrid = () => {
  const h = [...document.querySelectorAll('#palette-groups h3')].find(x => x.textContent.startsWith('Draw'));
  return h && h.nextElementSibling;
};
const sidebarOr = el => () => (narrow() ? $('#menu-btn') : el());

function steps(business) {
  return [
    {
      title: 'Welcome to your Design Studio',
      body: `Sketch your yard in 3D, then send it to ${business} for a free quote. This quick tour takes about a minute.`,
      next: 'Show me',
    },
    {
      target: () => $('#viewport'),
      center: true,
      title: 'Look around',
      body: touch
        ? 'Drag with one finger to turn your view. Use two fingers to slide around and zoom in or out.'
        : 'Drag to turn your view. Right-drag to slide around, and scroll to zoom in or out.',
    },
    {
      target: sidebarOr(() => $('#palette-groups .palette-grid')),
      title: 'Add trees, plants & more',
      body: `Pick a tree, shrub, rock or feature from the list${inMenu()}, then ${tap} the ground to place it. Keep ${tapping} to add more — pick it again in the list when you're done.`,
    },
    {
      target: sidebarOr(() => $('[data-tool="select"]')),
      title: 'Move and adjust',
      body: `Choose Select, then ${tap} anything in your yard to move, turn, resize, copy or delete it. Made a mistake? ↩ Undo at the top steps back.`,
    },
    {
      target: sidebarOr(() => $('#paints')),
      title: 'Paint the ground',
      body: `Choose rock mulch, soil or turf${inMenu()}, then drag across the ground to paint it. The Brush size slider makes strokes wider or narrower.`,
    },
    {
      target: sidebarOr(drawGrid),
      title: 'Walls, walkways & fences',
      body: `Pick one${inMenu()}, ${tap} points along the ground to lay it out, then press ✓ Done.`,
    },
    {
      target: () => $('#quote-send'),
      title: 'Send it for a free quote',
      body: `Happy with your yard? ${Tap} here to send it. We'll see your design in 3D and get back to you with a free quote.`,
    },
    {
      target: () => $('#tour-btn'),
      title: "That's it!",
      body: `You can replay this tour anytime with the ? button. Have fun designing!`,
      next: 'Start designing',
    },
  ];
}

let root, spot, card, list, idx = 0, lastFocus = null;

function build() {
  root = document.createElement('div');
  root.id = 'tour';
  root.hidden = true;
  root.innerHTML = `
    <div class="tour-spot"></div>
    <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body">
      <button type="button" class="tour-x" aria-label="Close tour">✕</button>
      <p class="tour-count"></p>
      <h2 id="tour-title"></h2>
      <p id="tour-body"></p>
      <div class="tour-nav">
        <button type="button" class="tour-back">Back</button>
        <button type="button" class="tour-next"></button>
      </div>
    </div>`;
  document.body.appendChild(root);
  spot = root.querySelector('.tour-spot');
  card = root.querySelector('.tour-card');
  root.querySelector('.tour-x').addEventListener('click', close);
  root.querySelector('.tour-back').addEventListener('click', () => show(idx - 1));
  root.querySelector('.tour-next').addEventListener('click', () => (idx < list.length - 1 ? show(idx + 1) : close()));
  root.addEventListener('keydown', e => {
    e.stopPropagation(); // keep the studio's own shortcuts out of it
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight' && idx < list.length - 1) show(idx + 1);
    else if (e.key === 'ArrowLeft' && idx > 0) show(idx - 1);
    else if (e.key === 'Tab') { // keep focus inside the card
      const f = [...card.querySelectorAll('button:not([hidden])')];
      const i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });
  addEventListener('resize', () => { if (!root.hidden) place(); });
}

function show(i) {
  idx = Math.max(0, Math.min(list.length - 1, i));
  const s = list[idx];
  root.querySelector('.tour-count').textContent = idx ? `${idx} of ${list.length - 1}` : '';
  root.querySelector('#tour-title').textContent = s.title;
  root.querySelector('#tour-body').textContent = s.body;
  const back = root.querySelector('.tour-back');
  back.hidden = idx === 0;
  const next = root.querySelector('.tour-next');
  next.textContent = s.next || 'Next';
  const el = s.target && s.target();
  if (el && !s.center) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  place();
  next.focus();
}

function place() {
  const s = list[idx];
  const el = s.target && s.target();
  const vw = innerWidth, vh = innerHeight, gap = 12;
  if (!el) { // welcome: dim everything, card in the middle
    spot.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0`;
    card.style.left = `${Math.max(12, (vw - card.offsetWidth) / 2)}px`;
    card.style.top = `${Math.max(12, (vh - card.offsetHeight) / 2)}px`;
    return;
  }
  const r = el.getBoundingClientRect();
  const pad = s.center ? -8 : 6;
  const box = { l: r.left - pad, t: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 };
  spot.style.cssText = `left:${box.l}px;top:${box.t}px;width:${box.w}px;height:${box.h}px`;
  const cw = card.offsetWidth, ch = card.offsetHeight;
  let left, top;
  if (s.center) { left = box.l + (box.w - cw) / 2; top = box.t + (box.h - ch) / 2; }
  else if (box.t + box.h + gap + ch <= vh - 8) { top = box.t + box.h + gap; left = box.l; } // below
  else if (box.t - gap - ch >= 8) { top = box.t - gap - ch; left = box.l + box.w - cw; }   // above
  else if (box.l + box.w + gap + cw <= vw - 8) { left = box.l + box.w + gap; top = box.t; } // right
  else { left = (vw - cw) / 2; top = vh - ch - 16; }
  card.style.left = `${Math.min(Math.max(12, left), vw - cw - 12)}px`;
  card.style.top = `${Math.min(Math.max(12, top), vh - ch - 12)}px`;
}

export function openTour() {
  if (!root) build();
  lastFocus = document.activeElement;
  document.body.classList.remove('sidebar-open');
  root.hidden = false;
  show(0);
}

function close() {
  root.hidden = true;
  try { localStorage.setItem(KEY, '1'); } catch {}
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

export function initTour({ business = 'us' } = {}) {
  list = steps(business);
  const bar = $('#quote-bar');
  if (bar && !$('#tour-btn')) {
    const b = document.createElement('button');
    b.id = 'tour-btn';
    b.type = 'button';
    b.textContent = '?';
    b.title = 'How to use the studio';
    b.setAttribute('aria-label', 'How to use the studio');
    b.addEventListener('click', openTour);
    bar.prepend(b);
  }
  let seen = false;
  try { seen = localStorage.getItem(KEY) === '1'; } catch {}
  if (seen || location.hash.startsWith('#design=')) return; // shared-design links are for the business
  const go = () => setTimeout(openTour, 400);
  if (window.__verduraReady) go();
  else addEventListener('verdura:ready', go, { once: true });
}
