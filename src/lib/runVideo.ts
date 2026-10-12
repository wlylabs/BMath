import { BRAND, MARK } from './brand';
import type { DayEvent } from './holderSim';

/**
 * An 8-second vertical video of one Holder Simulator run, drawn on a canvas and encoded in the
 * browser: MP4 (H.264) through Mediabunny and WebCodecs where the browser can, WebM otherwise, and
 * MediaRecorder as the last resort. The beats follow how short videos are watched:
 *
 *   0–1 s  the hook: "1 SOL → ? SOL", a question the viewer stays to see answered
 *   1–5 s  the days play out, the number climbs, big days jump
 *   5–7 s  the reveal: the rank pops in, the peak the video ends on
 *   7–8 s  the outro: the mark, $BMATH and where to play, fading back to the hook so a loop runs on
 */

export const VIDEO = { width: 1080, height: 1920, fps: 30, seconds: 8 } as const;

export interface VideoRun {
  entrySol: number;
  days: { reward: number; total: number; event: DayEvent }[];
  rank: { name: string; bg: string; fg: string };
  symbol: string;
  mintShort: string;
  url: string;
  text: {
    hookLine: string;
    day: (d: number, n: number) => string;
    bigDay: string;
    slowDay: string;
    rankLabel: string;
    rankHidden: string;
    payback: string;
    share: string;
    cta: string;
    disclaimer: string;
  };
}

// light-theme colours from globals.css: the video looks the same whatever the viewer's theme
const C = {
  bg: BRAND.lightBg,
  surface: BRAND.chalk,
  ink: BRAND.ink,
  ink2: '#3a3a3a',
  muted: '#5c5c59',
  line: '#c6c6c2',
  lineStrong: '#8e8e8a',
  cast: '#444444',
  sun: BRAND.sun,
  spot: BRAND.spot,
  teal: '#2aa7a0',
  pos: '#1e6b35',
} as const;

const DISPLAY = '"Bricolage Grotesque Variable", "Arial Narrow", Arial, sans-serif';
const MONO = '"IBM Plex Mono", ui-monospace, Consolas, monospace';

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const easeInOut = (x: number) => {
  const v = clamp01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
};
/** Overshoots a little, then settles: the pop of the reveal. */
const easeBack = (x: number) => {
  const v = clamp01(x);
  const c = 1.70158;
  return 1 + (c + 1) * (v - 1) ** 3 + c * (v - 1) ** 2;
};

/** Where the run is at a time, in days revealed (fractional while the newest bar grows); all in by 4.7 s. */
export function daysAt(time: number, days: number): number {
  return easeInOut((time - 1) / 3.7) * days;
}

/** How far the outro covers the frame, 0 to 1: in at 7 s, out again over the last quarter second. */
export function outroAt(time: number): number {
  if (time < 7) return 0;
  if (time < 7.25) return easeOut((time - 7) / 0.25);
  if (time < 7.75) return 1;
  return 1 - easeInOut((time - 7.75) / 0.25);
}

const fmtSol = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: n < 10 ? 3 : 2, maximumFractionDigits: n < 10 ? 3 : 2 });

function display(ctx: CanvasRenderingContext2D, size: number) {
  ctx.font = `800 ${size}px ${DISPLAY}`;
  // the site sets its headings at 75% width
  if ('fontStretch' in ctx) ctx.fontStretch = 'condensed';
  ctx.letterSpacing = `${-0.02 * size}px`;
}

function mono(ctx: CanvasRenderingContext2D, size: number, weight = 500) {
  ctx.font = `${weight} ${size}px ${MONO}`;
  if ('fontStretch' in ctx) ctx.fontStretch = 'normal';
  ctx.letterSpacing = '0px';
}

/** A card with the site's hard cast shadow. */
function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, shadow = 12) {
  ctx.fillStyle = C.cast;
  ctx.fillRect(x + shadow, y + shadow, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.lineWidth = 5;
  ctx.strokeStyle = C.ink;
  ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
}

function logo(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const unit = size / 20;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = C.sun;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, 1.5 * unit);
  ctx.fill();
  ctx.translate(2 * unit, 2 * unit);
  ctx.scale(unit, unit);
  ctx.fillStyle = C.ink;
  ctx.fill(new Path2D(MARK.glyph));
  ctx.fillStyle = C.spot;
  ctx.fill(new Path2D(MARK.slice));
  ctx.restore();
}

function tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, align: 'left' | 'right' = 'left', bg: string = C.ink, fg: string = C.surface) {
  mono(ctx, size, 600);
  const w = ctx.measureText(text).width + size * 1.2;
  const h = size * 1.9;
  const left = align === 'right' ? x - w : x;
  ctx.fillStyle = bg;
  ctx.fillRect(left, y, w, h);
  ctx.fillStyle = fg;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, left + size * 0.6, y + h / 2 + 1);
  return w;
}

/** Draws the frame at `time` seconds. */
export function drawFrame(ctx: CanvasRenderingContext2D, time: number, v: VideoRun) {
  const { width: W, height: H } = VIDEO;
  const n = v.days.length;
  const outro = outroAt(time);
  // the last quarter second shows the hook again under the fading outro, so the loop is seamless
  const t = time >= 7.75 ? 0 : time;

  ctx.save();
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // header
  logo(ctx, 72, 84, 104);
  display(ctx, 84);
  ctx.fillStyle = C.ink;
  ctx.fillText('BMath', 200, 166);
  tag(ctx, 'HOLDER SIMULATOR', W - 72, 106, 30, 'right');

  // the hook, then the answer
  mono(ctx, 34, 500);
  ctx.fillStyle = C.ink2;
  ctx.fillText(v.text.hookLine, 72, 330);
  display(ctx, 190);
  ctx.fillStyle = C.ink;
  ctx.fillText(`${fmtSol(v.entrySol).replace(/\.?0+$/, '')} SOL →`, 66, 520);

  const shown = daysAt(t, n);
  const whole = Math.min(n, Math.floor(shown));
  const current = whole > 0 ? v.days[whole - 1]! : null;
  if (t < 1) {
    // the question: a blinking "?" on a sun block
    const on = Math.floor(t * 4) % 2 === 0;
    display(ctx, 190);
    ctx.fillStyle = on ? C.sun : C.bg;
    const qw = ctx.measureText('?').width;
    ctx.fillRect(66, 560, qw + 60, 190);
    ctx.fillStyle = C.ink;
    ctx.fillText('?', 96, 715);
    ctx.fillText('SOL', 66 + qw + 100, 715);
  } else {
    const value = t >= 5 ? v.days[n - 1]!.total : (current?.total ?? 0);
    display(ctx, 190);
    ctx.fillStyle = C.pos;
    ctx.fillText(`${fmtSol(value)} SOL`, 66, 715);
  }

  // the days
  const cx = 72;
  const cy = 820;
  const cw = W - 144 - 12;
  const ch = 560;
  card(ctx, cx, cy, cw, ch, C.surface);
  mono(ctx, 34, 600);
  ctx.fillStyle = C.ink;
  ctx.fillText(v.text.day(Math.max(t < 1 ? 0 : 1, Math.ceil(Math.min(shown, n))), n), cx + 40, cy + 74);

  const bx = cx + 40;
  const by = cy + ch - 120;
  const bw = cw - 80;
  const bh = 330;
  const max = Math.max(...v.days.map((d) => d.reward), 1e-12);
  const gap = n > 40 ? 2 : 6;
  const barW = (bw - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const d = v.days[i]!;
    // the newest bar grows in; a big day overshoots a touch
    const grow = d.event === 'big' ? easeBack(shown - i) : easeOut(shown - i);
    if (grow <= 0) {
      ctx.fillStyle = C.line;
      ctx.fillRect(bx + i * (barW + gap), by - 6, barW, 6);
      continue;
    }
    const h = Math.max(8, (d.reward / max) * bh) * grow;
    ctx.fillStyle = d.event === 'big' ? C.sun : d.event === 'quiet' ? C.lineStrong : C.teal;
    ctx.fillRect(bx + i * (barW + gap), by - h, barW, h);
  }
  ctx.fillStyle = C.ink;
  ctx.fillRect(bx, by, bw, 5);

  // a big day gets its own call-out while it is the newest
  if (t >= 1 && t < 5.2 && current?.event) {
    const big = current.event === 'big';
    tag(ctx, big ? v.text.bigDay : v.text.slowDay, bx, by + 34, 32, 'left', big ? C.sun : C.lineStrong, C.ink);
  }

  // the reveal: a dashed "rank ?" until it pops in
  const rx = 72;
  const ry = 1430;
  const rw = W - 144 - 12;
  const rh = 380;
  if (t < 5) {
    ctx.setLineDash([22, 16]);
    ctx.lineWidth = 5;
    ctx.strokeStyle = C.lineStrong;
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);
    display(ctx, 110);
    ctx.fillStyle = C.lineStrong;
    ctx.textAlign = 'center';
    ctx.fillText(v.text.rankHidden, rx + rw / 2, ry + rh / 2 + 38);
    ctx.textAlign = 'left';
  } else {
    const s = easeBack((t - 5) / 0.45);
    ctx.save();
    ctx.translate(rx + rw / 2, ry + rh / 2);
    ctx.scale(Math.max(0.01, s), Math.max(0.01, s));
    ctx.translate(-(rx + rw / 2), -(ry + rh / 2));
    card(ctx, rx, ry, rw, rh, v.rank.bg, 14);
    ctx.fillStyle = v.rank.fg;
    mono(ctx, 30, 600);
    ctx.fillText(v.text.rankLabel, rx + 44, ry + 72);
    display(ctx, 132);
    ctx.fillText(v.rank.name, rx + 40, ry + 196);
    mono(ctx, 32, 500);
    ctx.fillText(v.text.payback, rx + 44, ry + 278);
    ctx.fillText(v.text.share, rx + 44, ry + 328);
    ctx.restore();
  }

  // footer
  mono(ctx, 30, 600);
  ctx.fillStyle = C.ink2;
  ctx.fillText(v.url, 72, 1858);
  mono(ctx, 24, 500);
  ctx.fillStyle = C.muted;
  ctx.fillText(v.text.disclaimer, 72, 1894);

  // the outro slides up over everything
  if (outro > 0) {
    const top = H * (1 - outro);
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, top, W, H);
    ctx.save();
    ctx.translate(0, top);
    logo(ctx, W / 2 - 130, 470, 260);
    display(ctx, 220);
    ctx.fillStyle = C.surface;
    ctx.textAlign = 'center';
    ctx.fillText(`$${v.symbol}`, W / 2, 1000);
    display(ctx, 96);
    ctx.fillStyle = C.sun;
    ctx.fillText(v.text.cta, W / 2, 1180);
    mono(ctx, 40, 600);
    ctx.fillStyle = C.surface;
    ctx.fillText(v.url, W / 2, 1290);
    mono(ctx, 32, 500);
    ctx.fillStyle = C.lineStrong;
    ctx.fillText(`CA ${v.mintShort}`, W / 2, 1370);
    ctx.restore();
  }
  ctx.restore();
}

async function loadFonts() {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all([
    document.fonts.load(`800 100px ${DISPLAY}`),
    document.fonts.load(`500 40px ${MONO}`),
    document.fonts.load(`600 40px ${MONO}`),
  ]).catch(() => undefined);
}

export interface RenderedVideo {
  blob: Blob;
  extension: 'mp4' | 'webm';
}

/** Renders the run to a video file. `onProgress` gets 0 to 1. */
export async function renderRunVideo(v: VideoRun, onProgress: (p: number) => void = () => {}): Promise<RenderedVideo> {
  const { width, height, fps, seconds } = VIDEO;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  await loadFonts();
  const frames = fps * seconds;

  const mb = await import('mediabunny').catch(() => null);
  if (mb && typeof VideoEncoder !== 'undefined') {
    // MP4 with H.264 plays everywhere, so it comes first; VP9 or VP8 in WebM where H.264 cannot be encoded
    const choices = [
      { codec: 'avc' as const, extension: 'mp4' as const },
      { codec: 'vp9' as const, extension: 'webm' as const },
      { codec: 'vp8' as const, extension: 'webm' as const },
    ];
    for (const choice of choices) {
      if (!(await mb.canEncodeVideo(choice.codec, { width, height }).catch(() => false))) continue;
      const target = new mb.BufferTarget();
      const format = choice.extension === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat();
      const output = new mb.Output({ format, target });
      const source = new mb.CanvasSource(canvas, { codec: choice.codec, bitrate: new mb.Quality('high'), keyFrameInterval: 2 });
      output.addVideoTrack(source, { frameRate: fps });
      await output.start();
      for (let f = 0; f < frames; f++) {
        drawFrame(ctx, f / fps, v);
        await source.add(f / fps, 1 / fps);
        onProgress((f + 1) / frames);
      }
      await output.finalize();
      if (!target.buffer) throw new Error('empty video');
      return { blob: new Blob([target.buffer], { type: format.mimeType }), extension: choice.extension };
    }
  }
  return recordInRealTime(canvas, ctx, v, onProgress);
}

/** The fallback: plays the video once on the canvas while MediaRecorder captures it. */
async function recordInRealTime(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, v: VideoRun, onProgress: (p: number) => void): Promise<RenderedVideo> {
  if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) throw new Error('no video support');
  const type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  if (!type) throw new Error('no video support');
  const stream = canvas.captureStream(VIDEO.fps);
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  drawFrame(ctx, 0, v);
  recorder.start();
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const time = (performance.now() - start) / 1000;
      drawFrame(ctx, Math.min(time, VIDEO.seconds - 1 / VIDEO.fps), v);
      onProgress(Math.min(1, time / VIDEO.seconds));
      if (time >= VIDEO.seconds) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  recorder.stop();
  stream.getTracks().forEach((track) => track.stop());
  await stopped;
  const extension = type.startsWith('video/mp4') ? 'mp4' : 'webm';
  return { blob: new Blob(chunks, { type: type.split(';')[0] }), extension };
}
