'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { HALF_LIFE, halfLifeFeePpm } from '../lib/bordrless';
import { pct } from '../lib/format';
import { t } from '../lib/copy';

const MAX_H = HALF_LIFE.zeroAfterSecs / 3_600;
const STEP_H = HALF_LIFE.halfLifeSecs / 3_600;
const TOP = (HALF_LIFE.maxFeePpm / 1e6) * 100;
const feeAt = (h: number) => halfLifeFeePpm(h * 3_600) / 1e4;

// the curve is linear inside each half-life, so its corners are the whole line
const CORNERS: [number, number][] = [];
for (let h = 0; h < MAX_H; h += STEP_H) CORNERS.push([h, feeAt(h)]);
CORNERS.push([MAX_H - 1 / 3_600, feeAt(MAX_H - 1 / 3_600)], [MAX_H, 0]);

const PAD = { top: 14, right: 14, bottom: 30, left: 40 };
const H = 230;

/** Half-Life's exit fee from 0 to 48 hours held, with where you are and where waiting takes you. */
export function HalfLifeChart({ hours, later }: { hours: number; later: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const iw = width - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const x = (h: number) => PAD.left + (Math.min(h, MAX_H) / MAX_H) * iw;
  const y = (f: number) => PAD.top + (1 - f / TOP) * ih;
  const d = CORNERS.map(([h, f], i) => `${i ? 'L' : 'M'}${x(h).toFixed(1)} ${y(f).toFixed(1)}`).join('');

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const h = ((e.clientX - r.left - PAD.left) / iw) * MAX_H;
    setHover(Math.max(0, Math.min(MAX_H, Math.round(h * 4) / 4)));
  };

  const markers = [
    { h: hours, label: t.halflife.markerNow, filled: true },
    ...(later !== hours ? [{ h: later, label: t.halflife.markerLater, filled: false }] : []),
  ];

  return (
    <div ref={wrap} className="relative">
      <svg
        width={width}
        height={H}
        role="img"
        aria-label={t.halflife.chartLabel}
        className="block touch-pan-y select-none"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {/* recessive grid: every 5% and every half-life */}
        {[0, 5, 10, 15, 20].map((f) => (
          <g key={f}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(f)} y2={y(f)} stroke="var(--line)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(f) + 4} textAnchor="end" className="fill-muted font-mono text-[11px]">
              {f}%
            </text>
          </g>
        ))}
        {Array.from({ length: MAX_H / STEP_H + 1 }, (_, i) => i * STEP_H).map((h) => (
          <text key={h} x={x(h)} y={H - PAD.bottom + 16} textAnchor="middle" className="fill-muted font-mono text-[11px]">
            {h}h
          </text>
        ))}
        <text x={width - PAD.right} y={H - 2} textAnchor="end" className="fill-muted font-mono text-[10px]">
          {t.halflife.hoursAxis}
        </text>
        <path d={d} fill="none" stroke="var(--chart)" strokeWidth={2} strokeLinejoin="round" />
        {markers.map((m) => (
          <g key={m.label}>
            <line x1={x(m.h)} x2={x(m.h)} y1={y(feeAt(m.h))} y2={H - PAD.bottom} stroke="var(--ink)" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={x(m.h)} cy={y(feeAt(m.h))} r={5} fill={m.filled ? 'var(--ink)' : 'var(--surface)'} stroke={m.filled ? 'var(--surface)' : 'var(--ink)'} strokeWidth={2} />
            {/* the label sits beside the marker, clear of the falling line */}
            <text
              x={x(m.h) + (x(m.h) > width - 110 ? -9 : 9)}
              y={y(feeAt(m.h)) - 7}
              textAnchor={x(m.h) > width - 110 ? 'end' : 'start'}
              className="fill-ink font-mono text-[11px] font-semibold"
            >
              {m.label} {pct(feeAt(m.h) / 100)}
            </text>
          </g>
        ))}
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--line-strong)" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(feeAt(hover))} r={4} fill="var(--chart)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hover !== null && (
        <div
          className="label pointer-events-none absolute top-1 rounded border border-ink bg-surface px-2 py-1 text-ink shadow-[2px_2px_0_0_var(--cast)]"
          style={{ left: Math.min(Math.max(x(hover) - 50, 0), width - 110) }}
        >
          {t.common.hours(hover)} · <span className="font-semibold">{pct(feeAt(hover) / 100)}</span>
        </div>
      )}
      <table className="sr-only">
        <caption>{t.halflife.tableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{t.halflife.colHours}</th>
            <th scope="col">{t.halflife.colFee}</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: MAX_H / STEP_H + 1 }, (_, i) => i * STEP_H).map((h) => (
            <tr key={h}>
              <td>{h}</td>
              <td>{pct(feeAt(h) / 100)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
