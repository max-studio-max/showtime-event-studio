/** Shared UI primitives: badges (text + shape, never colour alone), fields, money, panels. */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { deriveEvent, type Derived } from '../domain/derive';
import type { ShowEvent, VerificationStatus } from '../domain/types';
import { formatMoney, minorDigits, parseMoney } from '../engine/money';
import { badgeFor, type Badge as BadgeKind } from '../engine/provenance';
import { formatLength, lengthInDisplay, parseLength } from '../engine/units';
import { useStore } from '../state/store';

const BADGE_GLYPH: Record<BadgeKind, string> = {
  Verified: '✔',
  'Published/dated': '◷',
  'Source available': '↗',
  Assumption: '≈',
  Estimated: '∿',
  Missing: '∅',
  Stale: '⌛',
  Conflicted: '⚠',
  'User-entered quote': '✎',
};

export function Badge({ kind, title }: { kind: BadgeKind; title?: string }) {
  return (
    <span className={`badge badge-${kind.replace(/[^a-z]/gi, '').toLowerCase()}`} title={title}>
      <span aria-hidden>{BADGE_GLYPH[kind]}</span> {kind}
    </span>
  );
}

export const StatusBadge = ({ status, title }: { status: VerificationStatus; title?: string }) => <Badge kind={badgeFor(status)} title={title ?? status.replace(/_/g, ' ')} />;

export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warn' | 'bad' | 'good' | 'info' }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

export function Panel({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <header className="panel-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Money({ minor, currency }: { minor: number | null; currency: string }) {
  const locale = useStore((s) => s.settings.locale);
  if (minor == null) return <span className="missing">Missing</span>;
  return <span className="num">{formatMoney(minor, currency, locale)}</span>;
}

export function useFmtMoney() {
  const locale = useStore((s) => s.settings.locale);
  return (minor: number | null, currency: string) => formatMoney(minor, currency, locale);
}

/** Money input: blank means "unknown" (null), never zero. */
export function MoneyInput({ value, currency, onChange, placeholder = 'unknown', ariaLabel }: { value: number | null; currency: string; onChange: (v: number | null) => void; placeholder?: string; ariaLabel?: string }) {
  const fmt = (v: number | null) => (v == null ? '' : (v / 10 ** minorDigits(currency)).toFixed(minorDigits(currency)));
  const [text, setText] = useState(fmt(value));
  const [err, setErr] = useState(false);
  useEffect(() => setText(fmt(value)), [value, currency]); // external changes (undo, recompute)
  return (
    <span className="money-input">
      <span className="cur">{currency}</span>
      <input
        aria-label={ariaLabel}
        aria-invalid={err}
        value={text}
        placeholder={placeholder}
        inputMode="decimal"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const v = parseMoney(text, currency);
          if (text.trim() !== '' && v == null) return setErr(true);
          setErr(false);
          if (v !== value) onChange(v);
        }}
      />
    </span>
  );
}

/** Numeric input committing on blur/enter. */
export function NumInput({ value, onChange, step = 1, min, max, ariaLabel, allowNull = false, width }: { value: number | null; onChange: (v: number | null) => void; step?: number; min?: number; max?: number; ariaLabel?: string; allowNull?: boolean; width?: number }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (value == null ? '' : String(value));
  const commit = () => {
    if (text == null) return;
    const t = text.trim();
    setText(null);
    if (t === '' && allowNull) return onChange(null);
    const n = Number(t);
    if (!Number.isFinite(n)) return;
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    if (clamped !== value) onChange(clamped);
  };
  return (
    <input
      type="number"
      aria-label={ariaLabel}
      value={shown}
      step={step}
      min={min}
      max={max}
      style={width ? { width } : undefined}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}

/** Length input in the user's display units; stores metres. */
export function LengthInput({ meters, onChange, ariaLabel }: { meters: number; onChange: (m: number) => void; ariaLabel?: string }) {
  const units = useStore((s) => s.settings.units);
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? lengthInDisplay(meters, units).toFixed(3).replace(/\.?0+$/, '');
  const commit = () => {
    if (text == null) return;
    const m = parseLength(text, units);
    setText(null);
    if (m != null && Math.abs(m - meters) > 1e-12) onChange(m);
  };
  return (
    <span className="len-input">
      <input type="number" step={units === 'metric' ? 0.05 : 0.25} aria-label={ariaLabel} value={shown} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
      <span className="unit">{units === 'metric' ? 'm' : 'ft'}</span>
    </span>
  );
}

export function Len({ m }: { m: number }) {
  const units = useStore((s) => s.settings.units);
  return <span className="num">{formatLength(m, units)}</span>;
}

export function ExternalLink({ href, children }: { href: string | null | undefined; children: ReactNode }) {
  if (!href) return <span className="missing">No link</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="ext">
      {children} <span aria-hidden>↗</span>
      <span className="sr-only">(opens external site)</span>
    </a>
  );
}

export function useWorkspaceData() {
  const products = useStore((s) => s.products);
  const offers = useStore((s) => s.offers);
  const acts = useStore((s) => s.acts);
  const evidence = useStore((s) => s.evidence);
  return useMemo(() => ({ products, offers, acts, evidence }), [products, offers, acts, evidence]);
}

export function useDerived(ev: ShowEvent | null): Derived | null {
  const ws = useWorkspaceData();
  return useMemo(() => (ev ? deriveEvent(ev, ws) : null), [ev, ws]);
}

export function download(filename: string, content: string, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function Confirm({ label, onConfirm, danger, children }: { label: string; onConfirm: () => void; danger?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button className={danger ? 'btn danger ghost' : 'btn ghost'} onClick={() => setOpen(true)}>
        {children}
      </button>
    );
  return (
    <span className="confirm">
      {label}
      <button className={danger ? 'btn danger' : 'btn'} onClick={() => (setOpen(false), onConfirm())}>
        Confirm
      </button>
      <button className="btn ghost" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </span>
  );
}

export function NeedEvent({ children }: { children: (ev: ShowEvent) => ReactNode }) {
  const ev = useStore((s) => s.events.find((e) => e.id === s.activeEventId) ?? null);
  const go = useStore((s) => s.go);
  if (!ev)
    return (
      <Empty title="No event selected" action={<button className="btn" onClick={() => go('events')}>Choose or create an event</button>}>
        Every module works on one shared event. Pick one first.
      </Empty>
    );
  return <>{children(ev)}</>;
}
