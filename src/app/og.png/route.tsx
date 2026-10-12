import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { headlineFees, presetRules } from '../../lib/bordrless';
import { pct } from '../../lib/format';
import { BRAND, MARK } from '../../lib/brand';
import { CREATOR } from '../../lib/site';

// Served as /og.png so static hosts send it with an image content type.
export const dynamic = 'force-static';

const fonts = (pkg: string, file: string) => join(process.cwd(), 'node_modules/@fontsource', pkg, 'files', file);

export async function GET() {
  const [display, body, mono] = await Promise.all([
    readFile(fonts('bricolage-grotesque', 'bricolage-grotesque-latin-800-normal.woff')),
    readFile(fonts('bricolage-grotesque', 'bricolage-grotesque-latin-400-normal.woff')),
    readFile(fonts('ibm-plex-mono', 'ibm-plex-mono-latin-600-normal.woff')),
  ]);
  const plain = headlineFees(presetRules('plain'));
  const facts = [`Plain: ${pct(plain.buyBps / 10_000)} a side`, 'Sniper 80% → 0.3%', 'Bordrless share 25%'];
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: BRAND.lightBg, padding: 64, color: BRAND.ink, fontFamily: 'Body' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div style={{ display: 'flex', border: `3px solid ${BRAND.ink}`, boxShadow: `6px 6px 0 0 #444`, background: BRAND.chalk, padding: 6 }}>
            <svg width="76" height="76" viewBox="-2 -2 20 20" shapeRendering="crispEdges">
              <rect x="-2" y="-2" width="20" height="20" rx="1.5" fill={BRAND.sun} />
              <path d={MARK.glyph} fill={BRAND.ink} />
              <path d={MARK.slice} fill={BRAND.spot} />
            </svg>
          </div>
          <div style={{ fontSize: 56, fontFamily: 'Display', letterSpacing: -2 }}>BMath</div>
          <div style={{ display: 'flex', marginLeft: 'auto', fontSize: 22, fontFamily: 'Mono', background: BRAND.ink, color: BRAND.chalk, padding: '10px 14px' }}>
            A calculator for Bordrless launches
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 96, fontFamily: 'Display', lineHeight: 0.95, letterSpacing: -4 }}>Every hook takes a cut.</div>
          <div style={{ display: 'flex', alignSelf: 'flex-start', fontSize: 46, fontFamily: 'Display', letterSpacing: -1.5, background: BRAND.ink, color: BRAND.chalk, padding: '10px 18px', boxShadow: `6px 6px 0 0 #8e8e8a` }}>
            BMath shows how much.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {facts.map((f, i) => (
            <div
              key={f}
              style={{
                display: 'flex',
                fontSize: 22,
                fontFamily: 'Mono',
                whiteSpace: 'nowrap',
                padding: '10px 16px',
                border: `2px solid ${BRAND.ink}`,
                boxShadow: '4px 4px 0 0 #444',
                background: i === 0 ? '#3dae5b' : i === 1 ? '#f28c28' : '#2aa7a0',
                color: '#151515',
              }}
            >
              {f}
            </div>
          ))}
          <div style={{ display: 'flex', marginLeft: 'auto', fontSize: 24, fontFamily: 'Mono', color: '#3a3a3a' }}>{CREATOR.handle}</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Display', data: display, weight: 800, style: 'normal' },
        { name: 'Body', data: body, weight: 400, style: 'normal' },
        { name: 'Mono', data: mono, weight: 600, style: 'normal' },
      ],
    },
  );
}
