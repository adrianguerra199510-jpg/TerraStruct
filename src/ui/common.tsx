import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { ChevronDown, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Fmt, Quantity, UnitSystem, cleanNumber, fromDisplay, makeFmt, toDisplay, unitLabel } from '../core/units';

// ---------------------------------------------------------------------------
// Contexto de unidades
// ---------------------------------------------------------------------------
interface UnitsCtx {
  sys: UnitSystem;
  fmt: Fmt;
}
export const UnitsContext = createContext<UnitsCtx>({ sys: 'SI', fmt: makeFmt('SI') });
export const useUnits = () => useContext(UnitsContext);

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------
interface NumProps {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  q?: Quantity;
  /** unidad fija (no convertible) */
  unit?: string;
  min?: number;
  max?: number;
  hint?: string;
  title?: string;
  decimals?: number;
}

function trimNum(v: number, dec: number): string {
  if (!isFinite(v)) return '';
  const s = cleanNumber(v, 7);
  const fixed = Number(s.toFixed(Math.max(dec, 0)));
  return String(Math.abs(fixed - s) < 1e-9 ? s : fixed);
}

export function Num({ label, value, onChange, q = 'none', unit, min, max, hint, title, decimals }: NumProps) {
  const { sys } = useUnits();
  const shown = unit ? value : toDisplay(sys, q, value);
  const u = unit ?? unitLabel(sys, q);
  const dec = decimals ?? 6;
  const [text, setText] = useState(trimNum(shown, dec));
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setText(trimNum(shown, dec));
  }, [shown, focus, dec]);
  return (
    <div className="field" title={title}>
      {label && <label title={typeof label === "string" ? label : undefined}>{label}</label>}
      <div className="inp">
        <input
          inputMode="decimal"
          value={text}
          onFocus={(e) => {
            setFocus(true);
            e.target.select();
          }}
          onBlur={() => {
            setFocus(false);
            let v = parseFloat(text.replace(',', '.'));
            if (!isFinite(v)) return;
            const real = unit ? v : fromDisplay(sys, q, v);
            let r = real;
            if (min !== undefined && r < min) r = min;
            if (max !== undefined && r > max) r = max;
            if (r !== real) onChange(r);
          }}
          onChange={(e) => {
            const t = e.target.value;
            setText(t);
            const v = parseFloat(t.replace(',', '.'));
            if (isFinite(v)) onChange(unit ? v : fromDisplay(sys, q, v));
          }}
        />
        {u && <span className="u">{u}</span>}
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Sel<T extends string>({ label, value, onChange, options, hint }: { label?: string; value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; hint?: string }) {
  return (
    <div className="field">
      {label && <label title={typeof label === "string" ? label : undefined}>{label}</label>}
      <div className="inp">
        <select value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Txt({ label, value, onChange, placeholder }: { label?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="field">
      {label && <label title={typeof label === "string" ? label : undefined}>{label}</label>}
      <div className="inp">
        <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

export function Check({ label, value, onChange, hint }: { label: ReactNode; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="field">
      <label className="check">
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contenedores
// ---------------------------------------------------------------------------
export function Card({ title, icon, right, children, pad = true }: { title?: ReactNode; icon?: ReactNode; right?: ReactNode; children: ReactNode; pad?: boolean }) {
  return (
    <section className="card">
      {title && (
        <div className="card-h">
          {icon && <span className="ico">{icon}</span>}
          <span>{title}</span>
          <span className="spacer" />
          {right}
        </div>
      )}
      <div className={pad ? 'card-b' : ''}>{children}</div>
    </section>
  );
}

export function Acc({ title, icon, children, open = false }: { title: ReactNode; icon?: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="card acc" open={open}>
      <summary>
        {icon && <span className="ico">{icon}</span>}
        <span>{title}</span>
        <ChevronDown size={16} className="chev" />
      </summary>
      <div className="card-b stack" style={{ gap: 12 }}>
        {children}
      </div>
    </details>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; icon?: ReactNode }[] }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((it) => (
        <button key={it.id} role="tab" aria-selected={value === it.id} className={'tab' + (value === it.id ? ' on' : '')} onClick={() => onChange(it.id)}>
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function StatusChip({ ok, advisory }: { ok: boolean; advisory?: boolean }) {
  if (ok) return <span className="chip ok"><CheckCircle2 size={13} /> Cumple</span>;
  if (advisory) return <span className="chip warn"><AlertTriangle size={13} /> Revisar</span>;
  return <span className="chip bad"><XCircle size={13} /> No cumple</span>;
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <div className="alert">
      <AlertTriangle size={16} />
      <div>{children}</div>
    </div>
  );
}

export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="kpi">
      <span>{label}</span>
      <b>{value}</b>
      {sub && <div><small>{sub}</small></div>}
    </div>
  );
}

export function Tbl({ head, rows, align, wrapStyle }: { head: ReactNode[]; rows: ReactNode[][]; align?: ('l' | 'r' | 'c')[]; wrapStyle?: React.CSSProperties }) {
  const al = (i: number) => (align?.[i] === 'r' ? 'r' : align?.[i] === 'c' ? 'c' : '');
  return (
    <div className="tbl-wrap" style={wrapStyle}>
      <table className="tbl">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className={al(i)}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={al(j)}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Celda numérica editable para tablas. */
export function CellNum({ value, onChange, q = 'none', decimals = 3 }: { value: number; onChange: (v: number) => void; q?: Quantity; decimals?: number }) {
  const { sys } = useUnits();
  const shown = toDisplay(sys, q, value);
  const [text, setText] = useState(trimNum(shown, decimals));
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setText(trimNum(shown, decimals));
  }, [shown, focus, decimals]);
  return (
    <input
      value={text}
      inputMode="decimal"
      onFocus={(e) => {
        setFocus(true);
        e.target.select();
      }}
      onBlur={() => setFocus(false)}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseFloat(e.target.value.replace(',', '.'));
        if (isFinite(v)) onChange(fromDisplay(sys, q, v));
      }}
    />
  );
}

export function CellText({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input className="t" value={value} onChange={(e) => onChange(e.target.value)} />;
}

export function Ratio({ value, ok, advisory }: { value: number; ok: boolean; advisory?: boolean }) {
  const pct = Math.min(Math.max(value, 0), 1.2) / 1.2;
  return (
    <div className={'check-card ' + (ok ? 'ok' : advisory ? 'adv' : 'bad')} style={{ display: 'none' }}>
      <div className="meter"><i style={{ width: `${pct * 100}%` }} /></div>
    </div>
  );
}

export function CheckCard({ name, ratio, detail, ok, advisory }: { name: string; ratio: number; detail: string; ok: boolean; advisory?: boolean }) {
  const r = isFinite(ratio) ? ratio : 9.99;
  const pct = Math.min(Math.max(r, 0), 1.2) / 1.2;
  return (
    <div className={'check-card ' + (ok ? 'ok' : advisory ? 'adv' : 'bad')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <b>{name}</b>
        <StatusChip ok={ok} advisory={advisory} />
      </div>
      <div className="det">{detail}</div>
      <div className="meter" title={`Demanda/capacidad = ${r.toFixed(2)}`}>
        <i style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3200);
    return () => clearTimeout(t);
  }, [msg]);
  return { msg, show: setMsg };
}
