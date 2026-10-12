'use client';

import { useId } from 'react';
import { PRESETS, presetRules, rulesProblem, type PresetId, type Rules } from '../lib/bordrless';
import { parseAmount } from '../lib/format';
import { t } from '../lib/copy';
import { Field, Notice, NumberInput, Pills } from './ui';

export type RulesMode = PresetId | 'custom';

/** What a calculator saves for its rules: a preset, or the custom percentages as typed. */
export interface RulesState {
  mode: RulesMode;
  creator: string;
  holderBuy: string;
  holderSell: string;
  burnBuy: string;
  burnSell: string;
}

export const INITIAL_RULES: RulesState = { mode: 'plain', creator: '1', holderBuy: '0', holderSell: '0', burnBuy: '0', burnSell: '0' };

export const RULE_MODES: readonly RulesMode[] = [...PRESETS.map((p) => p.id), 'custom'];

const toBps = (v: string) => {
  const n = parseAmount(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};

export function rulesFrom(s: RulesState): Rules {
  if (s.mode !== 'custom') return presetRules(s.mode);
  return {
    creatorFeeBps: toBps(s.creator),
    holderFeeBuyBps: toBps(s.holderBuy),
    holderFeeSellBps: toBps(s.holderSell),
    burnBuyBps: toBps(s.burnBuy),
    burnSellBps: toBps(s.burnSell),
  };
}

const pctString = (bps: number) => String(bps / 100);

export function RulesPicker(props: { value: RulesState; onChange: (v: RulesState) => void }) {
  const { value: s, onChange } = props;
  const labelId = useId();
  const ids = { creator: useId(), hb: useId(), hs: useId(), bb: useId(), bs: useId() };
  const rules = rulesFrom(s);
  const problem = s.mode === 'custom' ? rulesProblem(rules) : null;
  const set = (k: keyof RulesState, v: string) => onChange({ ...s, [k]: v });

  return (
    <Field label={t.common.rules} labelId={labelId} hint={s.mode === 'custom' ? t.common.customHint : t.common.presetHint[s.mode]}>
      <Pills
        label={t.common.rules}
        labelledBy={labelId}
        options={RULE_MODES.map((m) => ({ value: m, label: m === 'custom' ? t.common.custom : t.common.presets[m] }))}
        value={s.mode}
        onChange={(mode) => {
          // switching to Custom starts from the preset that was showing
          if (mode === 'custom' && s.mode !== 'custom') {
            const r = presetRules(s.mode);
            onChange({
              mode,
              creator: pctString(r.creatorFeeBps),
              holderBuy: pctString(r.holderFeeBuyBps),
              holderSell: pctString(r.holderFeeSellBps),
              burnBuy: pctString(r.burnBuyBps),
              burnSell: pctString(r.burnSellBps),
            });
          } else onChange({ ...s, mode });
        }}
      />
      {s.mode === 'custom' && (
        <div className="enter mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1">
            <Field label={t.common.creatorFee} htmlFor={ids.creator}>
              <NumberInput id={ids.creator} value={s.creator} onChange={(v) => set('creator', v)} suffix="%" placeholder="0" invalid={problem === 'creator' || problem === 'total'} />
            </Field>
          </div>
          <Field label={t.common.holderBuy} htmlFor={ids.hb}>
            <NumberInput id={ids.hb} value={s.holderBuy} onChange={(v) => set('holderBuy', v)} suffix="%" placeholder="0" invalid={problem === 'holders'} />
          </Field>
          <Field label={t.common.holderSell} htmlFor={ids.hs}>
            <NumberInput id={ids.hs} value={s.holderSell} onChange={(v) => set('holderSell', v)} suffix="%" placeholder="0" invalid={problem === 'holders'} />
          </Field>
          <Field label={t.common.burnBuy} htmlFor={ids.bb}>
            <NumberInput id={ids.bb} value={s.burnBuy} onChange={(v) => set('burnBuy', v)} suffix="%" placeholder="0" invalid={problem === 'burn'} />
          </Field>
          <Field label={t.common.burnSell} htmlFor={ids.bs}>
            <NumberInput id={ids.bs} value={s.burnSell} onChange={(v) => set('burnSell', v)} suffix="%" placeholder="0" invalid={problem === 'burn'} />
          </Field>
          {problem && (
            <div className="col-span-2 sm:col-span-3">
              <Notice tone="warn">{t.common.rulesProblem[problem]}</Notice>
            </div>
          )}
        </div>
      )}
    </Field>
  );
}
