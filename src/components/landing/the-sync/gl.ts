/**
 * "The Sync" particle field (spec §8): raw WebGL, one draw call.
 *
 * Every particle starts on one of five "chaos" glyphs (WhatsApp, a
 * spreadsheet, email, a notebook, a calculator) and ends on the SyncEstate
 * mark. Positions are computed on the GPU from uProgress (scroll), so the
 * only per-frame CPU work is setting uniforms.
 *
 * Coordinates: x in [-aspect, aspect], y in [-1, 1], origin at the centre.
 */

const VERT = `
attribute vec2 aStart;
attribute vec2 aEnd;
attribute vec3 aSeed;
attribute float aCluster;
uniform float uProgress;
uniform float uTime;
uniform float uAspect;
uniform vec2 uMouse;
uniform float uMouseForce;
uniform float uPointSize;
uniform vec2 uMarkCentre;
uniform float uLight;
varying vec3 vColor;
varying float vAlpha;

float easeInOut(float t) { return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0; }

void main() {
  float t = uTime;
  // Per-particle stagger so the glyphs dissolve gradually.
  float lp = clamp((uProgress - 0.33 - aSeed.x * 0.14) / 0.28, 0.0, 1.0);
  float e = easeInOut(lp);

  // Chaos: jitter on the glyph plus a slow drift of the whole glyph.
  vec2 jitter = vec2(sin(t * 1.7 + aSeed.y * 6.283), cos(t * 1.3 + aSeed.z * 6.283)) * 0.006;
  vec2 drift = vec2(sin(t * 0.32 + aCluster * 1.3), cos(t * 0.27 + aCluster * 2.1)) * 0.025;
  vec2 chaos = aStart + jitter + drift;

  // Synced: the mark, breathing gently.
  float breathe = 1.0 + 0.015 * sin(t * 1.96);
  vec2 synced = uMarkCentre + (aEnd - uMarkCentre) * breathe + vec2(sin(t * 2.0 + aSeed.y * 9.0), cos(t * 2.3 + aSeed.z * 9.0)) * 0.0018;

  // The journey between: a swirl that peaks mid-flight.
  vec2 dir = synced - chaos;
  vec2 perp = vec2(-dir.y, dir.x);
  float arc = sin(e * 3.14159);
  vec2 swirl = perp * (aSeed.y - 0.5) * 0.9 * arc
             + vec2(sin(t * 0.9 + aSeed.x * 12.0), cos(t * 0.8 + aSeed.z * 12.0)) * 0.12 * arc;
  vec2 pos = mix(chaos, synced, e) + swirl;

  // Cursor: push particles away, falling off with distance.
  vec2 d = pos - uMouse;
  float dist = length(d);
  float f = uMouseForce * smoothstep(0.32, 0.0, dist);
  pos += (dist > 0.0001 ? d / dist : vec2(0.0)) * f * 0.14;

  gl_Position = vec4(pos.x / uAspect, pos.y, 0.0, 1.0);
  gl_PointSize = uPointSize * (0.75 + aSeed.z * 0.75) * mix(1.0, 0.85, e);

  // Colour: grey problems (a few flickering red) into brand green. On the
  // light theme the particles are drawn dark on light: deeper grey, and the
  // green resolves to the brand ink with the brand green as highlights.
  vec3 grey = mix(vec3(0.46, 0.51, 0.55), vec3(0.35, 0.39, 0.42), uLight);
  vec3 red = vec3(0.851, 0.176, 0.125);
  float isRed = step(0.88, aSeed.y) * step(0.0, sin(t * 7.0 + aSeed.z * 40.0));
  vec3 before = mix(grey, red, isRed);
  float bright = step(0.85, aSeed.z);
  vec3 greenDark = mix(vec3(0.608, 0.847, 0.239), vec3(0.831, 0.961, 0.604), bright);
  vec3 greenLight = mix(vec3(0.231, 0.408, 0.071), vec3(0.525, 0.769, 0.180), bright);
  vColor = mix(before, mix(greenDark, greenLight, uLight), e);
  vAlpha = mix(mix(0.75, 0.95, e), mix(0.7, 0.9, e), uLight);
}
`;

const FRAG = `
precision mediump float;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.1, d) * vAlpha;
  gl_FragColor = vec4(vColor * a, a);
}
`;

/** The five chaos glyphs, as 24-unit SVG paths drawn with a round stroke. */
const GLYPHS: string[] = [
  // WhatsApp-style chat bubble with a tick.
  "M7.9 20A9 9 0 1 0 4 16.1L2 22Z M8 12l3 3 5-6",
  // Spreadsheet grid.
  "M3 3h18v18H3z M3 9h18 M3 15h18 M9 3v18 M15 3v18",
  // Envelope.
  "M2 4h20v16H2z M22 6l-10 7L2 6",
  // Ruled notebook with binding.
  "M5 2h13a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5z M9 7h7 M9 11h7 M9 15h5 M3 6h4 M3 10h4 M3 14h4 M3 18h4",
  // Calculator.
  "M4 2h16v20H4z M8 6h8v4H8z M8 14h.01 M12 14h.01 M16 14h.01 M8 18h.01 M12 18h.01 M16 18h.01",
];

export type Layout = {
  aspect: number;
  clusters: { x: number; y: number }[];
  glyphSize: number;
  markCentre: { x: number; y: number };
  markHeight: number;
};

/**
 * Where the glyphs and the mark sit for a given canvas shape. Wide stages put
 * the field on the right, beside the copy; narrow stages put it above the
 * copy, where `reserveBottom` is the share of the height the copy covers.
 * Either way the field keeps clear of the floating nav and shrinks to fit
 * short screens (landscape phones, small phones).
 */
export function layoutFor(width: number, height: number, reserveBottom = 0): Layout {
  const aspect = width / height;
  const wide = aspect > 1;
  let cx = wide ? aspect * 0.42 : 0;
  let r = wide ? 0.56 : Math.min(0.5, aspect * 0.6);
  let glyphSize = wide ? 0.36 : Math.min(0.34, aspect * 0.4);
  let markHeight = wide ? 1.0 : Math.min(0.9, aspect * 1.5);
  const preferredY = wide ? 0 : 0.28;

  // Room between the nav (about 84px down) and the copy or the bottom edge.
  const top = Math.max(0.4, 1 - (2 * 84) / height);
  const floor = wide ? -0.95 : -1 + 2 * Math.min(0.7, Math.max(0, reserveBottom)) + 0.04;
  // How far the pentagon reaches above and below its centre, captions (drawn
  // under each glyph) included.
  const up = r + glyphSize * 0.5;
  const down = 0.81 * r + glyphSize * 0.62 + 0.08;
  const k = Math.min(1, (top - floor) / (up + down));
  r *= k;
  glyphSize *= k;
  const cy = Math.min(top - up * k, Math.max(floor + down * k, preferredY));
  markHeight = Math.min(markHeight, 2 * Math.min(top - cy, cy - floor) * 0.92);
  cx = wide ? cx : 0;

  const clusters = Array.from({ length: 5 }, (_, i) => {
    const ang = (-90 + i * 72) * (Math.PI / 180);
    return { x: cx + r * Math.cos(ang), y: cy - r * Math.sin(ang) };
  });
  return { aspect, clusters, glyphSize, markCentre: { x: cx, y: cy }, markHeight };
}

function samplePixels(draw: (ctx: CanvasRenderingContext2D, size: number) => void, size = 200): [number, number][] {
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  draw(ctx, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const pts: [number, number][] = [];
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      if (data[(y * size + x) * 4 + 3] > 110) pts.push([x / size - 0.5, 0.5 - y / size]);
    }
  }
  return pts;
}

function glyphPoints(path: string): [number, number][] {
  return samplePixels((ctx, size) => {
    const s = size / 24;
    ctx.setTransform(s * 0.86, 0, 0, s * 0.86, size * 0.07, size * 0.07);
    ctx.lineWidth = 2.1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#fff";
    ctx.stroke(new Path2D(path));
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function markPoints(): Promise<[number, number][]> {
  const img = await loadImage("/brand/mark.svg");
  return samplePixels((ctx, size) => {
    // The mark is 103×120: fit by height, centred.
    const h = size * 0.98;
    const w = (h * 103) / 120;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  }, 240);
}

function pick<T>(arr: T[], n: number, rand: () => number): T[] {
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(rand() * arr.length)]);
  return out;
}

/** Small seeded PRNG so the field looks the same on every visit. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "compile");
  return sh;
}

export type SyncField = {
  resize(width: number, height: number, dpr: number, reserveBottom?: number): Layout;
  /** light: draw dark particles with normal blending for the light theme. */
  render(progress: number, time: number, mouse: { x: number; y: number; force: number }, light: boolean): void;
  dispose(): void;
};

export async function createSyncField(canvas: HTMLCanvasElement, count: number): Promise<SyncField | null> {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const rand = mulberry32(20261103);
  const glyphs = GLYPHS.map(glyphPoints);
  const mark = await markPoints();
  if (!mark.length || glyphs.some((g) => !g.length)) return null;

  // Unit-space samples, laid out per canvas shape in resize().
  const perGlyph = Math.ceil(count / 5);
  const startUnit: [number, number][] = [];
  const clusterOf: number[] = [];
  for (let k = 0; k < 5; k++) {
    for (const p of pick(glyphs[k], perGlyph, rand)) {
      startUnit.push(p);
      clusterOf.push(k);
    }
  }
  const n = startUnit.length;
  const endUnit = pick(mark, n, rand);
  const seeds = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) seeds[i] = rand();
  const clusters = new Float32Array(clusterOf);

  const buf = (data: Float32Array, name: string, size: number) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return b;
  };
  const startBuf = buf(new Float32Array(n * 2), "aStart", 2);
  const endBuf = buf(new Float32Array(n * 2), "aEnd", 2);
  const seedBuf = buf(seeds, "aSeed", 3);
  const clusterBuf = buf(clusters, "aCluster", 1);

  const u = (name: string) => gl.getUniformLocation(program, name);
  const uProgress = u("uProgress");
  const uTime = u("uTime");
  const uAspect = u("uAspect");
  const uMouse = u("uMouse");
  const uMouseForce = u("uMouseForce");
  const uPointSize = u("uPointSize");
  const uMarkCentre = u("uMarkCentre");
  const uLight = u("uLight");

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.clearColor(0, 0, 0, 0);

  let pointSize = 2;

  return {
    resize(width, height, dpr, reserveBottom = 0) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      const L = layoutFor(width, height, reserveBottom);
      const s = new Float32Array(n * 2);
      const e = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        const c = L.clusters[clusterOf[i]];
        s[i * 2] = c.x + startUnit[i][0] * L.glyphSize;
        s[i * 2 + 1] = c.y + startUnit[i][1] * L.glyphSize;
        // markPoints samples a unit square with the mark fit to its height.
        e[i * 2] = L.markCentre.x + endUnit[i][0] * L.markHeight;
        e[i * 2 + 1] = L.markCentre.y + endUnit[i][1] * L.markHeight;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, startBuf);
      gl.bufferData(gl.ARRAY_BUFFER, s, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, endBuf);
      gl.bufferData(gl.ARRAY_BUFFER, e, gl.STATIC_DRAW);
      gl.uniform1f(uAspect, L.aspect);
      gl.uniform2f(uMarkCentre, L.markCentre.x, L.markCentre.y);
      pointSize = Math.max(1.5, Math.min(3.2, (height / 900) * 2.6)) * dpr;
      return L;
    },
    render(progress, time, mouse, light) {
      // Additive glow on dark; ordinary "over" blending on light, where
      // adding colour would wash out to white.
      if (light) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      else gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniform1f(uLight, light ? 1 : 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uProgress, progress);
      gl.uniform1f(uTime, time);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform1f(uMouseForce, mouse.force);
      gl.uniform1f(uPointSize, pointSize);
      gl.drawArrays(gl.POINTS, 0, n);
    },
    dispose() {
      [startBuf, endBuf, seedBuf, clusterBuf].forEach((b) => gl.deleteBuffer(b));
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
