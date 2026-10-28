import React, { useRef, useState } from 'react';
import { FileSpreadsheet, X, Download, Upload, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { FootingInput, defaultFooting } from '../core/footing';
import { autoSizeFooting } from '../core/footingAuto';
import { ImportOptions, ImportResult, ImportedFooting, buildTemplate, defaultImportOptions, footingFromImport, parseExcelBuffer } from '../import/excel';
import { Alert, Num, Sel } from './common';

interface Row {
  it: ImportedFooting;
  input?: FootingInput;
  ok?: boolean;
  note?: string;
}

export function ImportDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (items: FootingInput[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const bufRef = useRef<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState('');
  const [opt, setOpt] = useState<ImportOptions>(defaultImportOptions());
  const [base, setBase] = useState<FootingInput>(defaultFooting());
  const [res, setRes] = useState<ImportResult | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(0);
  const [err, setErr] = useState('');

  const parse = (buf: ArrayBuffer | null, o: ImportOptions) => {
    if (!buf) return;
    try {
      setRes(parseExcelBuffer(buf, o));
      setRows(null);
      setErr('');
    } catch (e: any) {
      setErr('No se pudo leer el archivo: ' + (e?.message ?? e));
    }
  };
  const load = (f: File) => {
    const r = new FileReader();
    r.onload = () => {
      bufRef.current = r.result as ArrayBuffer;
      setFileName(f.name);
      parse(bufRef.current, opt);
    };
    r.readAsArrayBuffer(f);
  };
  const template = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buildTemplate()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = 'plantilla_zapatas.xlsx';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const run = async () => {
    if (!res) return;
    const out: Row[] = res.items.map((it) => ({ it }));
    setRows([...out]);
    for (let i = 0; i < out.length; i++) {
      setBusy(i + 1);
      await new Promise((r) => setTimeout(r, 15));
      const it = out[i].it;
      if (it.warnings.length && (!it.service.length || !it.ultimate.length || (!it.b && !it.D))) {
        out[i] = { it, ok: false, note: it.warnings.join('; ') };
      } else {
        try {
          const r = autoSizeFooting(footingFromImport(it, base));
          out[i] = { it, input: r.input, ok: r.ok, note: r.note };
        } catch (e: any) {
          out[i] = { it, ok: false, note: 'Error: ' + (e?.message ?? e) };
        }
      }
      setRows([...out]);
    }
    setBusy(0);
  };
  const created = rows?.filter((r) => r.input) ?? [];
  const working = busy > 0;
  const dim = (r: Row) => (r.input ? `${r.input.presetParams.B.toFixed(2)} × ${r.input.presetParams.L.toFixed(2)} × h ${r.input.h.toFixed(2)} m · ${r.input.barX}` : '—');
  const colDim = (it: ImportedFooting) => (it.shape === 'circle' ? `Ø${(it.D * 100).toFixed(0)}` : `${(it.b * 100).toFixed(0)}×${(it.h * 100).toFixed(0)}`);

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: 'min(1000px, 96vw)', height: 'min(86vh, 800px)' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <FileSpreadsheet size={18} /> <span>Importar zapatas desde Excel (dimensionamiento por paquete)</span>
          <span className="spacer" />
          <button className="icon-btn" title="Cerrar" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ padding: 14, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="hint">
            Una hoja con las columnas (Zapata, Forma, b, h o D, opcional qa y Df) y otra con las cargas (Zapata, Tipo <b>ES</b> o <b>EU</b>, Caso, P, Vx, Vy, Mx, My, opcional «qa x» en servicio).
            El programa dimensiona cada zapata (área, espesor y armado) y luego usted ajusta espesor y acero en cada una.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={template}><Download size={15} /> Descargar plantilla</button>
            <button className="btn primary" onClick={() => fileRef.current?.click()}><Upload size={15} /> {fileName || 'Elegir archivo .xlsx'}</button>
            <input ref={fileRef} type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ''; }} />
          </div>
          <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' }}>
            <Sel label="Unidad de las cargas" value={opt.forceUnit} onChange={(v) => { const o = { ...opt, forceUnit: v }; setOpt(o); parse(bufRef.current, o); }} options={[{ id: 'kN', label: 'kN, kN·m' }, { id: 'tonf', label: 'tonf, tonf·m' }]} />
            <Sel label="Dimensiones de columna" value={opt.lenUnit} onChange={(v) => { const o = { ...opt, lenUnit: v }; setOpt(o); parse(bufRef.current, o); }} options={[{ id: 'auto', label: 'Automático (cm si > 3)' }, { id: 'cm', label: 'cm' }, { id: 'm', label: 'm' }]} />
            <Num label="qa por defecto" q="press" value={base.qa} onChange={(v) => setBase({ ...base, qa: v })} min={10} />
            <Num label="Df por defecto" q="len" value={base.Df} onChange={(v) => setBase({ ...base, Df: v })} min={0.15} />
            <Num label="f′c" q="stress" value={base.fc} onChange={(v) => setBase({ ...base, fc: v })} min={14} />
            <Num label="fy" q="stress" value={base.fy} onChange={(v) => setBase({ ...base, fy: v })} min={240} />
            <Num label="Peso unit. relleno" q="uw" value={base.gammaS} onChange={(v) => setBase({ ...base, gammaS: v })} />
            <Num label="Fricción μ" value={base.mu} onChange={(v) => setBase({ ...base, mu: v })} min={0} max={1.2} />
          </div>
          {err && <Alert>{err}</Alert>}
          {res?.errors.map((e, i) => <Alert key={i}>{e}</Alert>)}
          {res && res.items.length > 0 && (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr><th>Zapata</th><th>Columna (cm)</th><th className="r">ES</th><th className="r">EU</th><th>Observaciones</th><th>Resultado del dimensionamiento</th><th /></tr>
                </thead>
                <tbody>
                  {res.items.map((it, i) => {
                    const r = rows?.[i];
                    return (
                      <tr key={it.name}>
                        <td><b>{it.name}</b></td>
                        <td>{colDim(it)}</td>
                        <td className="r">{it.service.length}</td>
                        <td className="r">{it.ultimate.length}</td>
                        <td>{it.warnings.join('; ') || '—'}</td>
                        <td>{r?.input ? dim(r) : r?.note ?? (working && busy === i + 1 ? 'Calculando…' : '—')}</td>
                        <td>{r?.ok === true ? <CheckCircle2 size={16} color="#1a9d5b" /> : r?.ok === false ? <span title={r.note}><XCircle size={16} color="#d33" /></span> : busy === i + 1 ? <Loader2 size={16} className="spin" /> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn primary" disabled={!res?.items.length || working} onClick={run}>
              {working ? <Loader2 size={15} className="spin" /> : <FileSpreadsheet size={15} />} Dimensionar {res?.items.length ?? 0} zapata(s)
            </button>
            <button className="btn" disabled={!created.length || working} onClick={() => { onCreate(created.map((r) => r.input!)); onClose(); }}>
              Crear {created.length} zapata(s) en el proyecto
            </button>
            {rows && !working && <span className="hint">{rows.filter((r) => r.ok).length} cumplen · {rows.filter((r) => r.input && !r.ok).length} con observaciones (se crean igualmente para que las ajuste) · {rows.filter((r) => !r.input).length} sin datos suficientes</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
