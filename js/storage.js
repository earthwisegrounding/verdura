const KEY = 'verdura-save-v1';

export function saveLocal(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)); return true; }
  catch (e) { console.warn('saveLocal failed', e); return false; }
}

export function loadLocal() {
  try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; }
  catch (e) { console.warn('loadLocal failed', e); return null; }
}

export function hasLocal() { return !!localStorage.getItem(KEY); }

// When running as a published Claude artifact, downloads must go through the
// viewer-confirmed capability; anchor clicks are inert there. Locally the
// capability is absent and we fall back to a plain download link.
async function claudeSave(filename, data) {
  try {
    if (!window.claude || !window.claude.use) return false;
    const dl = await window.claude.use('downloads');
    if (!dl) return false;
    await dl.save({ filename, data });
    return true;
  } catch (e) {
    return !!(e && e.code === 'declined'); // viewer said no — don't re-prompt via anchor
  }
}

export async function downloadText(name, text, type = 'application/json') {
  if (await claudeSave(name, text)) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function downloadDataUrl(name, url) {
  if (window.claude && window.claude.use) {
    const blob = await (await fetch(url)).blob();
    if (await claudeSave(name, blob)) return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
}
