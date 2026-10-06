/* The share of the screen where the map is seen unobstructed (docs/focus/round-3.md). Run in the page:
   page.evaluate(require('./mapshare').src) returns { free, w, h } with free 0–1. A point counts as covered when
   anything drawn sits over the map canvas there: a box with a background (glass panels, the top bar's shade,
   buttons, the minimap), or text. Points are sampled every 8 px; elements are hit-tested with pointer events forced
   on so that click-through layers count too. Canvas-drawn labels on the map itself are map, not interface. */
exports.src = `(() => {
  const st = document.createElement('style'); st.textContent = '*{pointer-events:auto!important}'; document.head.appendChild(st);
  const map = document.getElementById('map'), W = innerWidth, H = innerHeight, memo = new Map();
  const solid = el => {
    if (memo.has(el)) return memo.get(el);
    const c = getComputedStyle(el); let v = false;
    if (c.visibility === 'hidden' || +c.opacity < 0.05) v = false;
    else if (/^(BUTTON|CANVAS|IMG|svg|INPUT|SELECT)$/.test(el.tagName)) v = true;
    else if (c.backgroundImage !== 'none') v = true;
    else { const m = /rgba?\\(([^)]+)\\)/.exec(c.backgroundColor); const a = m ? m[1].split(',').map(Number) : [0, 0, 0, 0]; v = (a.length < 4 ? 1 : a[3]) > 0.08; }
    if (!v) for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { v = true; break; }
    memo.set(el, v); return v;
  };
  let free = 0, n = 0;
  for (let y = 4; y < H; y += 8) for (let x = 4; x < W; x += 8) {
    n++;
    const L = document.elementsFromPoint(x, y); let cov = false, seen = false;
    for (const el of L) { if (el === map) { seen = true; break; } if (solid(el)) { cov = true; break; } }
    if (seen && !cov) free++;
  }
  st.remove();
  return { free: free / n, w: W, h: H };
})()`;
