/* Iron Canopy — the same sums on every browser.

   The world is rebuilt from its seed when a save loads (save.js), and the rebuilt world must match the one the game
   was saved in, to the last bit. +, −, ×, ÷ and Math.sqrt give the same answer everywhere, but Math.sin, cos, atan2,
   exp, pow and hypot do not: each engine has its own, and they change between versions (Chromium 141 and Node 22
   differ in the last bit for a few percent of inputs). One different bit can move a road or a district, and the
   save is refused.

   So world generation runs with the functions below in place of the engine's (IC.fixedMath, IC.fixedMathSteps).
   They are ports of fdlibm (the reference C library most engines started from) and use only arithmetic that
   IEEE 754 fixes exactly, so they give the same bits on every engine. Elsewhere the engine's own are faster and
   nothing needs them to agree. */
(function (IC) {
'use strict';

const F = new Float64Array(1), I = new Int32Array(F.buffer);
const HI = new Int32Array(new Float64Array([1]).buffer)[1] === 0x3ff00000 ? 1 : 0, LO = 1 - HI;   // word order
const hi = x => { F[0] = x; return I[HI]; };
const lo = x => { F[0] = x; return I[LO]; };
const make = (h, l) => { I[HI] = h; I[LO] = l; return F[0]; };
const lo0 = x => { F[0] = x; I[LO] = 0; return F[0]; };   // the low word cleared
const withHi = (x, h) => { F[0] = x; I[HI] = h; return F[0]; };
const sqrt = Math.sqrt, fabs = Math.abs;

/* ---------- sin and cos ---------- */
const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04,
  S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
function ksin(x, y, iy) {
  if ((hi(x) & 0x7fffffff) < 0x3e400000 && (x | 0) === 0) return x;
  const z = x * x, v = z * x, r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return iy === 0 ? x + v * (S1 + z * r) : x - ((z * (0.5 * y - v * r) - y) - v * S1);
}
const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05,
  C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
function kcos(x, y) {
  const ix = hi(x) & 0x7fffffff;
  if (ix < 0x3e400000 && (x | 0) === 0) return 1;
  const z = x * x, r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3fd33333) return 1 - (0.5 * z - (z * r - x * y));
  const qx = ix > 0x3fe90000 ? 0.28125 : make(ix - 0x00200000, 0);
  return (1 - qx) - ((0.5 * z - qx) - (z * r - x * y));
}
/* x − n·π/2 in two parts (Y[0] + Y[1]), and n; Cody and Waite's reduction up to |x| ≈ 2^19·π/2, exact integer
   sums (BigInt) beyond it */
const invpio2 = 6.36619772367581382433e-01, pio2_1 = 1.57079632673412561417e+00, pio2_1t = 6.07710050650619224932e-11,
  pio2_2 = 6.07710050630396597660e-11, pio2_2t = 2.02226624879595063154e-21, pio2_3 = 2.02226624871116645580e-21,
  pio2_3t = 8.47842766036889956997e-32;
const Y = [0, 0];
function remPio2(x) {
  const hx = hi(x), ix = hx & 0x7fffffff;
  if (ix < 0x4002d97c) {   // |x| < 3π/4
    if (hx > 0) {
      let z = x - pio2_1;
      if (ix !== 0x3ff921fb) { Y[0] = z - pio2_1t; Y[1] = (z - Y[0]) - pio2_1t; }
      else { z -= pio2_2; Y[0] = z - pio2_2t; Y[1] = (z - Y[0]) - pio2_2t; }
      return 1;
    }
    let z = x + pio2_1;
    if (ix !== 0x3ff921fb) { Y[0] = z + pio2_1t; Y[1] = (z - Y[0]) + pio2_1t; }
    else { z += pio2_2; Y[0] = z + pio2_2t; Y[1] = (z - Y[0]) + pio2_2t; }
    return -1;
  }
  if (ix > 0x413921fb) return remBig(x);
  const t0 = fabs(x), n = (t0 * invpio2 + 0.5) | 0, fn = n;
  let r = t0 - fn * pio2_1, w = fn * pio2_1t, y0 = r - w;
  const j = ix >> 20;
  let i = j - ((hi(y0) >> 20) & 0x7ff);
  if (i > 16) {
    let t = r; w = fn * pio2_2; r = t - w; w = fn * pio2_2t - ((t - r) - w); y0 = r - w;
    i = j - ((hi(y0) >> 20) & 0x7ff);
    if (i > 49) { t = r; w = fn * pio2_3; r = t - w; w = fn * pio2_3t - ((t - r) - w); y0 = r - w; }
  }
  const y1 = (r - y0) - w;
  if (hx < 0) { Y[0] = -y0; Y[1] = -y1; return -n; }
  Y[0] = y0; Y[1] = y1; return n;
}
/* far from zero: x·2/π worked out exactly from 1,200 bits of 2/π, keeping 120 bits after the point */
let TWO_PI_BITS = null, PIO2_BITS = null;
const TWO_M248 = make((1023 - 248) << 20, 0);
function piBits() {   // π·2^1300 by Machin's formula, once
  const S = 1300n, one = 1n << S;
  const at = inv => { let t = one / inv, s = t, k = 1n; const q = inv * inv; for (;;) { t /= q; if (t === 0n) break; k += 2n; s += (k & 2n ? -t : t) / k; } return s; };
  const pi = 16n * at(5n) - 4n * at(239n);
  TWO_PI_BITS = (1n << (1200n + 1n + S)) / pi;   // 2/π·2^1200
  PIO2_BITS = pi >> (S - 128n + 1n);               // π/2·2^128
}
function remBig(x) {
  if (!TWO_PI_BITS) piBits();
  const hx = hi(x), e = ((hx >> 20) & 0x7ff) - 1075;   // |x| = m·2^e
  const m = BigInt((hx & 0x000fffff) | 0x00100000) * 4294967296n + BigInt(lo(x) >>> 0);
  const sh = BigInt(1200 - e - 120);   // x·2/π·2^120, modulo 4·2^120
  const v = ((m * TWO_PI_BITS) >> sh) & ((4n << 120n) - 1n);
  let n = Number(v >> 120n), f = v & ((1n << 120n) - 1n);
  if (f >= (1n << 119n)) { n++; f -= 1n << 120n; }   // round to the nearest quadrant
  const P = f * PIO2_BITS, r0 = Number(P);   // (x − n·π/2)·2^248
  const y0 = r0 * TWO_M248, y1 = Number(P - BigInt(r0)) * TWO_M248;
  if (hx < 0) { Y[0] = -y0; Y[1] = -y1; return -n; }
  Y[0] = y0; Y[1] = y1; return n;
}
function sin(x) {
  x = +x;
  const ix = hi(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return ksin(x, 0, 0);
  if (ix >= 0x7ff00000) return NaN;
  switch (remPio2(x) & 3) {
    case 0: return ksin(Y[0], Y[1], 1);
    case 1: return kcos(Y[0], Y[1]);
    case 2: return -ksin(Y[0], Y[1], 1);
    default: return -kcos(Y[0], Y[1]);
  }
}
function cos(x) {
  x = +x;
  const ix = hi(x) & 0x7fffffff;
  if (ix <= 0x3fe921fb) return kcos(x, 0);
  if (ix >= 0x7ff00000) return NaN;
  switch (remPio2(x) & 3) {
    case 0: return kcos(Y[0], Y[1]);
    case 1: return -ksin(Y[0], Y[1], 1);
    case 2: return -kcos(Y[0], Y[1]);
    default: return ksin(Y[0], Y[1], 1);
  }
}

/* ---------- atan and atan2 ---------- */
const atanhi = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
const atanlo = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const aT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
  9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
  4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02];
function atan(x) {
  x = +x;
  const hx = hi(x), ix = hx & 0x7fffffff;
  let id;
  if (ix >= 0x44100000) {   // |x| ≥ 2^66
    if (x !== x) return x;
    return hx > 0 ? atanhi[3] + atanlo[3] : -atanhi[3] - atanlo[3];
  }
  if (ix < 0x3fdc0000) {   // |x| < 0.4375
    if (ix < 0x3e200000) return x;
    id = -1;
  } else {
    x = fabs(x);
    if (ix < 0x3ff30000) {
      if (ix < 0x3fe60000) { id = 0; x = (2 * x - 1) / (2 + x); } else { id = 1; x = (x - 1) / (x + 1); }
    } else if (ix < 0x40038000) { id = 2; x = (x - 1.5) / (1 + 1.5 * x); } else { id = 3; x = -1 / x; }
  }
  const z = x * x, w = z * z;
  const s1 = z * (aT[0] + w * (aT[2] + w * (aT[4] + w * (aT[6] + w * (aT[8] + w * aT[10])))));
  const s2 = w * (aT[1] + w * (aT[3] + w * (aT[5] + w * (aT[7] + w * aT[9]))));
  if (id < 0) return x - x * (s1 + s2);
  const r = atanhi[id] - ((x * (s1 + s2) - atanlo[id]) - x);
  return hx < 0 ? -r : r;
}
const pi = 3.1415926535897931160e+00, pi_o_2 = 1.5707963267948965580e+00, pi_o_4 = 7.8539816339744827900e-01, pi_lo = 1.2246467991473531772e-16;
function atan2(y, x) {
  y = +y; x = +x;
  if (x !== x || y !== y) return NaN;
  if (x === 1) return atan(y);
  const hx = hi(x), ix = hx & 0x7fffffff, hy = hi(y), iy = hy & 0x7fffffff;
  const m = ((hy >> 31) & 1) | ((hx >> 30) & 2);   // sign of y, and of x
  if (y === 0) return m < 2 ? y : m === 2 ? pi : -pi;
  if (x === 0) return hy < 0 ? -pi_o_2 : pi_o_2;
  if (ix === 0x7ff00000 && lo(x) === 0) {
    if (iy === 0x7ff00000 && lo(y) === 0) return [pi_o_4, -pi_o_4, 3 * pi_o_4, -3 * pi_o_4][m];
    return [0, -0, pi, -pi][m];
  }
  if (iy === 0x7ff00000 && lo(y) === 0) return hy < 0 ? -pi_o_2 : pi_o_2;
  const k = (iy - ix) >> 20;
  let z;
  if (k > 60) z = pi_o_2 + 0.5 * pi_lo;
  else if (hx < 0 && k < -60) z = 0;
  else z = atan(fabs(y / x));
  switch (m) {
    case 0: return z;
    case 1: return -z;
    case 2: return pi - (z - pi_lo);
    default: return (z - pi_lo) - pi;
  }
}

/* ---------- exp and log ---------- */
const ln2HI = [6.93147180369123816490e-01, -6.93147180369123816490e-01], ln2LO = [1.90821492927058770002e-10, -1.90821492927058770002e-10],
  invln2 = 1.44269504088896338700e+00, twom1000 = 9.33263618503218878990e-302,
  P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05,
  P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08;
function exp(x) {
  x = +x;
  let hx = hi(x);
  const xsb = (hx >>> 31);
  hx &= 0x7fffffff;
  let hi_ = 0, lo_ = 0, k = 0;
  if (hx >= 0x40862e42) {   // |x| ≥ 709.78
    if (hx >= 0x7ff00000) { if (x !== x) return x; return xsb === 0 ? x : 0; }
    if (x > 7.09782712893383973096e+02) return Infinity;
    if (x < -7.45133219101941108420e+02) return 0;
  }
  if (hx > 0x3fd62e42) {   // |x| > ½ ln 2
    if (hx < 0x3ff0a2b2) { hi_ = x - ln2HI[xsb]; lo_ = ln2LO[xsb]; k = 1 - xsb - xsb; }
    else { k = (invln2 * x + (xsb ? -0.5 : 0.5)) | 0; const t = k; hi_ = x - t * ln2HI[0]; lo_ = t * ln2LO[0]; }
    x = hi_ - lo_;
  } else if (hx < 0x3e300000) return 1 + x;
  const t = x * x, c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k === 0) return 1 - ((x * c) / (c - 2) - x);
  const y = 1 - ((lo_ - (x * c) / (2 - c)) - hi_);
  if (k >= -1021) return withHi(y, hi(y) + (k << 20));
  return withHi(y, hi(y) + ((k + 1000) << 20)) * twom1000;
}
const ln2_hi = 6.93147180369123816490e-01, ln2_lo = 1.90821492927058770002e-10, two54 = 1.80143985094819840000e+16,
  Lg1 = 6.666666666666735130e-01, Lg2 = 3.999999999940941908e-01, Lg3 = 2.857142874366239149e-01, Lg4 = 2.222219843214978396e-01,
  Lg5 = 1.818357216161805012e-01, Lg6 = 1.531383769920937332e-01, Lg7 = 1.479819860511658591e-01;
function log(x) {
  x = +x;
  let hx = hi(x), k = 0;
  if (hx < 0x00100000) {   // x < 2^-1022
    if (x === 0) return -Infinity;
    if (hx < 0 || x !== x) return NaN;
    k -= 54; x *= two54; hx = hi(x);
  }
  if (hx >= 0x7ff00000) return x + x;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  let i = (hx + 0x95f64) & 0x100000;
  x = withHi(x, hx | (i ^ 0x3ff00000));   // x or x/2 in [√2/2, √2]
  k += (i >> 20);
  const f = x - 1;
  if ((0x000fffff & (2 + hx)) < 3) {   // |f| < 2^-20
    if (f === 0) { if (k === 0) return 0; return k * ln2_hi + k * ln2_lo; }
    const R = f * f * (0.5 - 0.33333333333333333 * f);
    if (k === 0) return f - R;
    return k * ln2_hi - ((R - k * ln2_lo) - f);
  }
  const s = f / (2 + f), dk = k, z = s * s, w = z * z;
  i = hx - 0x6147a;
  const j = 0x6b851 - hx;
  const t1 = w * (Lg2 + w * (Lg4 + w * Lg6)), t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7))), R = t2 + t1;
  if ((i | j) > 0) {
    const hfsq = 0.5 * f * f;
    if (k === 0) return f - (hfsq - s * (hfsq + R));
    return dk * ln2_hi - ((hfsq - (s * (hfsq + R) + dk * ln2_lo)) - f);
  }
  if (k === 0) return f - s * (f - R);
  return dk * ln2_hi - ((s * (f - R) - dk * ln2_lo) - f);
}

/* ---------- pow ---------- */
const bp = [1, 1.5], dp_h = [0, 5.84962487220764160156e-01], dp_l = [0, 1.35003920212974897128e-08],
  two53 = 9007199254740992, huge = 1e300, tiny = 1e-300,
  L1 = 5.99999999999994648725e-01, L2 = 4.28571428578550184252e-01, L3 = 3.33333329818377432918e-01,
  L4 = 2.72728123808534006489e-01, L5 = 2.30660745775561754067e-01, L6 = 2.06975017800338417784e-01,
  lg2 = 6.93147180559945286227e-01, lg2_h = 6.93147182464599609375e-01, lg2_l = -1.90465429995776804525e-09,
  ovt = 8.0085662595372944372e-17, cp = 9.61796693925975554329e-01, cp_h = 9.61796700954437255859e-01,
  cp_l = -7.02846165095275826516e-09, ivln2 = 1.44269504088896338700e+00, ivln2_h = 1.44269502162933349609e+00,
  ivln2_l = 1.92596299112661746887e-08;
function scalbn(x, n) {   // x·2^n, exactly where the result is a normal number
  while (n > 1023) { x *= 8.98846567431158e307; n -= 1023; }
  while (n < -1022) { x *= 2.2250738585072014e-308; n += 1022; }
  return x * make((n + 1023) << 20, 0);
}
function pow(x, y) {
  x = +x; y = +y;
  const hx = hi(x), lx = lo(x), hy = hi(y), ly = lo(y);
  let ix = hx & 0x7fffffff;
  const iy = hy & 0x7fffffff;
  if (y === 0) return 1;
  if (x !== x || y !== y) return NaN;
  // is y an integer, odd or even? (only matters for x < 0)
  let yisint = 0;
  if (hx < 0) {
    if (iy >= 0x43400000) yisint = 2;
    else if (iy >= 0x3ff00000) {
      const k = (iy >> 20) - 0x3ff;
      if (k > 20) { const j = (ly >>> (52 - k)); if (((j << (52 - k)) >>> 0) === (ly >>> 0)) yisint = 2 - (j & 1); }
      else if (ly === 0) { const j = iy >> (20 - k); if ((j << (20 - k)) === iy) yisint = 2 - (j & 1); }
    }
  }
  if (ly === 0) {
    if (iy === 0x7ff00000) {   // y is ±∞
      if (((ix - 0x3ff00000) | lx) === 0) return NaN;   // (±1)^±∞
      if (ix >= 0x3ff00000) return hy >= 0 ? y : 0;
      return hy < 0 ? -y : 0;
    }
    if (iy === 0x3ff00000) return hy < 0 ? 1 / x : x;
    if (hy === 0x40000000) return x * x;
    if (hy === 0x3fe00000 && hx >= 0) return sqrt(x);
  }
  let ax = fabs(x);
  if (lx === 0 && (ix === 0x7ff00000 || ix === 0 || ix === 0x3ff00000)) {   // x is ±0, ±∞ or ±1
    let z = ax;
    if (hy < 0) z = 1 / z;
    if (hx < 0) {
      if (((ix - 0x3ff00000) | yisint) === 0) z = NaN;
      else if (yisint === 1) z = -z;
    }
    return z;
  }
  let n = (hx >> 31) + 1;
  if ((n | yisint) === 0) return NaN;   // (x < 0)^(not an integer)
  let s = 1;
  if ((n | (yisint - 1)) === 0) s = -1;   // (x < 0)^(odd integer)
  let t1, t2;
  if (iy > 0x41e00000) {   // |y| > 2^31
    if (iy > 0x43f00000) {
      if (ix <= 0x3fefffff) return hy < 0 ? huge * huge : tiny * tiny;
      if (ix >= 0x3ff00000) return hy > 0 ? huge * huge : tiny * tiny;
    }
    if (ix < 0x3fefffff) return hy < 0 ? s * huge * huge : s * tiny * tiny;
    if (ix > 0x3ff00000) return hy > 0 ? s * huge * huge : s * tiny * tiny;
    const t = ax - 1, w = (t * t) * (0.5 - t * (0.3333333333333333333333 - t * 0.25));
    const u = ivln2_h * t, v = t * ivln2_l - w * ivln2;
    t1 = lo0(u + v); t2 = v - (t1 - u);
  } else {
    n = 0;
    if (ix < 0x00100000) { ax *= two53; n -= 53; ix = hi(ax); }   // subnormal x
    n += (ix >> 20) - 0x3ff;
    const j = ix & 0x000fffff;
    ix = j | 0x3ff00000;
    let k;
    if (j <= 0x3988e) k = 0;
    else if (j < 0xbb67a) k = 1;
    else { k = 0; n += 1; ix -= 0x00100000; }
    ax = withHi(ax, ix);
    // log2(ax) = (s_h + s_l)·(cp…), s = (ax − bp)/(ax + bp)
    let u = ax - bp[k], v = 1 / (ax + bp[k]);
    const ss = u * v, s_h = lo0(ss);
    let t_h = make(((ix >> 1) | 0x20000000) + 0x00080000 + (k << 18), 0), t_l = ax - (t_h - bp[k]);
    const s_l = v * ((u - s_h * t_h) - s_h * t_l);
    let s2 = ss * ss, r = s2 * s2 * (L1 + s2 * (L2 + s2 * (L3 + s2 * (L4 + s2 * (L5 + s2 * L6)))));
    r += s_l * (s_h + ss);
    s2 = s_h * s_h;
    t_h = lo0(3 + s2 + r); t_l = r - ((t_h - 3) - s2);
    u = s_h * t_h; v = s_l * t_h + t_l * ss;
    const p_h = lo0(u + v), p_l = v - (p_h - u);
    const z_h = cp_h * p_h, z_l = cp_l * p_h + p_l * cp + dp_l[k];
    const t = n;
    t1 = lo0(((z_h + z_l) + dp_h[k]) + t); t2 = z_l - (((t1 - t) - dp_h[k]) - z_h);
  }
  // y·log2(x) split, then 2^that
  const y1 = lo0(y), p_l = (y - y1) * t1 + y * t2;
  let p_h = y1 * t1, z = p_l + p_h;
  let j = hi(z);
  const i0 = lo(z);
  if (j >= 0x40900000) {   // z ≥ 1024
    if (((j - 0x40900000) | i0) !== 0) return s * huge * huge;
    if (p_l + ovt > z - p_h) return s * huge * huge;
  } else if ((j & 0x7fffffff) >= 0x4090cc00) {   // z ≤ −1075
    if (j !== (0xc090cc00 | 0) || i0 !== 0) return s * tiny * tiny;
    if (p_l <= z - p_h) return s * tiny * tiny;
  }
  const i = j & 0x7fffffff;
  let k = (i >> 20) - 0x3ff;
  n = 0;
  if (i > 0x3fe00000) {   // |z| > 0.5: take the integer part
    n = j + (0x00100000 >> (k + 1));
    k = ((n & 0x7fffffff) >> 20) - 0x3ff;
    const t = make(n & ~(0x000fffff >> k), 0);
    n = ((n & 0x000fffff) | 0x00100000) >> (20 - k);
    if (j < 0) n = -n;
    p_h -= t;
  }
  const t = lo0(p_l + p_h), u = t * lg2_h, v = (p_l - (t - p_h)) * lg2 + t * lg2_l;
  z = u + v;
  const w = v - (z - u), tt = z * z, tt1 = z - tt * (P1 + tt * (P2 + tt * (P3 + tt * (P4 + tt * P5))));
  const r = (z * tt1) / (tt1 - 2) - (w + z * w);
  z = 1 - (r - z);
  j = hi(z) + (n << 20);
  z = (j >> 20) <= 0 ? scalbn(z, n) : withHi(z, j);
  return s * z;
}

/* ---------- hypot ---------- */
function hypot(a, b) {
  if (arguments.length !== 2) {
    let m = 0, nan = false;
    for (let i = 0; i < arguments.length; i++) { const v = fabs(+arguments[i]); if (v === Infinity) return Infinity; if (v !== v) nan = true; else if (v > m) m = v; }
    if (nan) return NaN;
    if (m === 0) return 0;
    let s = 0;
    for (let i = 0; i < arguments.length; i++) { const v = (+arguments[i]) / m; s += v * v; }
    return sqrt(s) * m;
  }
  a = fabs(+a); b = fabs(+b);
  if (a === Infinity || b === Infinity) return Infinity;
  if (a > 1e150 || b > 1e150 || (a < 1e-150 && b < 1e-150)) {   // out of range for squaring: scale by a power of two
    const sc = a > 1e150 || b > 1e150 ? 4.149515568880993e-181 : 2.409919865102884e180;
    a *= sc; b *= sc;
    return sqrt(a * a + b * b) / sc;
  }
  return sqrt(a * a + b * b);
}

/* ---------- swapping them in ---------- */
IC.FIXED_MATH = { sin, cos, atan, atan2, exp, log, pow, hypot };
const KEYS = Object.keys(IC.FIXED_MATH), NATIVE = {};
for (const k of KEYS) NATIVE[k] = Math[k];
IC.NATIVE_MATH = NATIVE;
let depth = 0;
const on = () => { if (depth++ === 0) for (const k of KEYS) Math[k] = IC.FIXED_MATH[k]; };
const off = () => { if (--depth === 0) for (const k of KEYS) Math[k] = NATIVE[k]; };
/* fn() with the fixed functions in Math */
IC.fixedMath = fn => { on(); try { return fn(); } finally { off(); } };
/* a generator whose every step runs with them (world generation in stages: the page draws between steps with its own) */
IC.fixedMathSteps = function* (g) {
  for (;;) {
    let r;
    on(); try { r = g.next(); } finally { off(); }
    if (r.done) return r.value;
    yield r.value;
  }
};

})(window.IC);
