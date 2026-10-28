import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  Plus, Trash2, Shapes, Columns3, Mountain, Layers, Settings2, Ruler, CheckCircle2, XCircle, Wand2, MoveDiagonal, Grid3x3, Eye, FileText, ListChecks, RotateCcw, Copy,
} from 'lucide-react';
import {
  FootingInput, FootingColumn, LoadCombo, CASE_KEYS, CASE_LABEL, CaseKey, analyzeFooting, defaultColumn, defaultCombos, findMinThickness, findScaleForPressure, FootingResults, casesToEnvelope, zeroLoad, LoadCase,
} from '../core/footing';
import {
  COLUMN_SHAPES, ColumnShape, FOOTING_PRESETS, FootingPreset, footingPresetPoly, defaultColumnGeom, columnPoly,
} from '../core/shapes';
import { barList, findBar } from '../core/materials';
import { makeFmt } from '../core/units';
import { Pt, polyProps, ccw } from '../core/geometry';
import { Acc, Alert, Card, Check, CheckCard, CellNum, CellText, Kpi, Num, Sel, StatusChip, Tabs, Tbl, Txt, useUnits } from './common';
import { PlanView, footingPlanSvg, footingRebarPlanSvg, footingSectionSvg, makePlanView, planPoints } from '../draw/footingDraw';
import { DARK, LIGHT, lineChart } from '../draw/svg';
import { autoSizeFooting } from '../core/footingAuto';
import { ReportButtons } from './ReportButtons';
import { ProjectInfo } from '../state';

type Tab = 'planta' | 'resultados' | 'armado' | 'memoria';

export function FootingPage({ data, onChange, theme, info }: { data: FootingInput; onChange: (f: FootingInput) => void; theme: 'light' | 'dark'; info: ProjectInfo }) {
  const { fmt, sys } = useUnits();
  const [tab, setTab] = useState<Tab>('planta');
  const [selCol, setSelCol] = useState<string>(data.columns[0]?.id ?? '');
  const [comboId, setComboId] = useState<string>('');
  const [showPressure, setShowPressure] = useState(true);
  const [showCritical, setShowCritical] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const res = useMemo(() => {
    try {
      return analyzeFooting(data);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [data]);
  useEffect(() => {
    if (!data.columns.some((c) => c.id === selCol)) setSelCol(data.columns[0]?.id ?? '');
  }, [data.columns, selCol]);
  const set = (patch: Partial<FootingInput>) => onChange({ ...data, ...patch });
  const col = data.columns.find((c) => c.id === selCol) ?? data.columns[0];
  const setCol = (patch: Partial<FootingColumn>) => onChange({ ...data, columns: data.columns.map((c) => (c.id === col.id ? { ...c, ...patch } : c)) });
  const th = theme === 'dark' ? DARK : LIGHT;
  const serviceCombos = res?.service ?? [];
  const combo = serviceCombos.find((s) => s.combo.id === comboId) ?? res?.govPressure ?? serviceCombos[0] ?? null;

  return (
    <div className="split">
      <div className="left stack">
        <Acc title="Datos generales" icon={<Settings2 size={18} />} open>
          <Txt label="Nombre de la zapata" value={data.name} onChange={(v) => set({ name: v })} />
          <div className="grid2">
            <Num label="Espesor h" q="len" value={data.h} onChange={(v) => set({ h: v })} min={0.15} />
            <Num label="Profundidad de desplante Df" q="len" value={data.Df} onChange={(v) => set({ Df: v })} min={0.15} hint="Del terreno a la base de la zapata" />
            <Num label="Recubrimiento" q="lencm" value={data.cover} onChange={(v) => set({ cover: v })} min={0.03} />
            <Sel label="Barras" value={data.barSystem} onChange={(v) => set({ barSystem: v, barX: barList(v)[3].id, barY: barList(v)[3].id })} options={[{ id: 'astm', label: 'ASTM (#)' }, { id: 'metric', label: 'Métricas (mm)' }]} />
            <Sel label="Barras dirección X" value={data.barX} onChange={(v) => set({ barX: v })} options={barList(data.barSystem).map((b) => ({ id: b.id, label: b.label }))} />
            <Sel label="Barras dirección Y" value={data.barY} onChange={(v) => set({ barY: v })} options={barList(data.barSystem).map((b) => ({ id: b.id, label: b.label }))} />
            <Sel label="Capa exterior (abajo y arriba)" value={data.lowerLayer} onChange={(v) => set({ lowerLayer: v })} options={[{ id: 'x', label: 'Barras en X abajo' }, { id: 'y', label: 'Barras en Y abajo' }]} />
            <Sel label="Norma de cortante" value={data.code} onChange={(v) => set({ code: v })} options={[{ id: 'ACI318_14', label: 'ACI 318-14 / NSR-10' }, { id: 'ACI318_19', label: 'ACI 318-19 (efecto tamaño)' }]} />
            <div style={{ gridColumn: '1 / -1' }}>
              <Check label="Con acero superior (parrilla superior)" value={data.topSteel} onChange={(v) => set({ topSteel: v })} hint="Se diseña con los momentos negativos; sin ella se verifica el concreto simple" />
            </div>
            {data.topSteel && (
              <>
                <Sel label="Barras superiores en X" value={data.barTopX} onChange={(v) => set({ barTopX: v })} options={barList(data.barSystem).map((b) => ({ id: b.id, label: b.label }))} />
                <Sel label="Barras superiores en Y" value={data.barTopY} onChange={(v) => set({ barTopY: v })} options={barList(data.barSystem).map((b) => ({ id: b.id, label: b.label }))} />
              </>
            )}
            <div style={{ gridColumn: '1 / -1' }}>
              <Check label="Ajustar el acero manualmente (separaciones)" value={data.manual.on} onChange={(v) => set({ manual: { ...data.manual, on: v } })} hint="Elige las barras y la separación; el programa verifica resistencia, acero mínimo y separación máxima" />
            </div>
            {data.manual.on && (
              <>
                <Num label="Separación inf. en X" q="lencm" value={data.manual.sBotX} onChange={(v) => set({ manual: { ...data.manual, sBotX: v } })} min={0.05} />
                <Num label="Separación inf. en Y" q="lencm" value={data.manual.sBotY} onChange={(v) => set({ manual: { ...data.manual, sBotY: v } })} min={0.05} />
                {data.topSteel && (
                  <>
                    <Num label="Separación sup. en X" q="lencm" value={data.manual.sTopX} onChange={(v) => set({ manual: { ...data.manual, sTopX: v } })} min={0.05} />
                    <Num label="Separación sup. en Y" q="lencm" value={data.manual.sTopY} onChange={(v) => set({ manual: { ...data.manual, sTopY: v } })} min={0.05} />
                  </>
                )}
                <div style={{ gridColumn: '1 / -1' }}>
                  <button
                    className="btn small"
                    onClick={() => {
                      const r = analyzeFooting({ ...data, manual: { ...data.manual, on: false } });
                      const rd = (v?: number, d = data.manual.sBotX) => (v && isFinite(v) ? Math.round(v * 200) / 200 : d);
                      set({ manual: { ...data.manual, sBotX: rd(r.flexX?.det.spacing), sBotY: rd(r.flexY?.det.spacing), sTopX: rd(r.flexTopX?.det.spacing, data.manual.sTopX), sTopY: rd(r.flexTopY?.det.spacing, data.manual.sTopY) } });
                    }}
                  >
                    <Wand2 size={14} /> Copiar valores del cálculo automático
                  </button>
                </div>
              </>
            )}
            <Num label="f′c" q="stress" value={data.fc} onChange={(v) => set({ fc: v })} min={14} />
            <Num label="fy" q="stress" value={data.fy} onChange={(v) => set({ fy: v })} min={240} />
          </div>
        </Acc>

        <Acc title="Geometría de la zapata" icon={<Shapes size={18} />} open>
          <FootingShapeEditor data={data} onChange={onChange} />
        </Acc>

        <Acc title="Columnas y cargas" icon={<Columns3 size={18} />} open>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {data.columns.map((c) => (
              <button key={c.id} className={'btn small' + (c.id === col.id ? ' primary' : '')} onClick={() => setSelCol(c.id)}>
                {c.name}
              </button>
            ))}
            <button
              className="btn small ghost"
              onClick={() => {
                const n = data.columns.length + 1;
                const c = defaultColumn('c' + Date.now().toString(36), 'C' + n, 0.6 * n, 0.6 * n);
                onChange({ ...data, columns: [...data.columns, c] });
                setSelCol(c.id);
              }}
            >
              <Plus size={14} /> Columna
            </button>
            {data.columns.length > 1 && (
              <button
                className="icon-btn danger"
                title="Eliminar columna"
                onClick={() => {
                  const cols = data.columns.filter((c) => c.id !== col.id);
                  onChange({ ...data, columns: cols });
                  setSelCol(cols[0].id);
                }}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
          <ColumnEditor col={col} setCol={setCol} />
          <Sel
            label="Ingreso de cargas"
            value={data.loadMode}
            onChange={(v) => {
              if (v === 'envelope' && data.loadMode === 'cases') onChange(casesToEnvelope(data));
              else set({ loadMode: v });
            }}
            options={[{ id: 'cases', label: 'Por casos (D, L, W, E) + combinaciones' }, { id: 'envelope', label: 'Envolvente de servicio y última' }]}
            hint={data.loadMode === 'envelope' ? 'Cargas finales por combinación; no se aplican factores' : undefined}
          />
          {data.loadMode === 'envelope' ? <EnvelopeEditor data={data} col={col} onChange={onChange} /> : <LoadsEditor col={col} setCol={setCol} />}
        </Acc>

        <Acc title="Suelo y estabilidad" icon={<Mountain size={18} />}>
          <div className="grid2">
            <Num label="Esfuerzo admisible qa" q="press" value={data.qa} onChange={(v) => set({ qa: v })} min={10} />
            <Num label="Peso unit. del relleno" q="uw" value={data.gammaS} onChange={(v) => set({ gammaS: v })} />
            <Num label="Sobrecarga en el terreno" q="press" value={data.surcharge} onChange={(v) => set({ surcharge: v })} min={0} />
            <Num label="Peso unit. del concreto" q="uw" value={data.gammaC} onChange={(v) => set({ gammaC: v })} />
            <Num label="Fricción base–suelo μ" value={data.mu} onChange={(v) => set({ mu: v })} min={0} max={1.2} />
            <Num label="Adhesión base–suelo" q="press" value={data.adhesion} onChange={(v) => set({ adhesion: v })} min={0} />
            <Num label="FS deslizamiento mín." value={data.fsSliding} onChange={(v) => set({ fsSliding: v })} min={1} />
            <Num label="FS volcamiento mín." value={data.fsOverturning} onChange={(v) => set({ fsOverturning: v })} min={1} />
          </div>
        </Acc>

        {data.loadMode === 'cases' && (
          <Acc title="Combinaciones de carga" icon={<Layers size={18} />}>
            <CombosEditor data={data} onChange={onChange} />
          </Acc>
        )}
      </div>

      <div className="stack right" style={{ minWidth: 0 }}>
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { id: 'planta', label: 'Planta y presiones', icon: <Eye size={16} /> },
            { id: 'resultados', label: 'Resultados', icon: <ListChecks size={16} /> },
            { id: 'armado', label: 'Armado', icon: <Grid3x3 size={16} /> },
            { id: 'memoria', label: 'Memoria de cálculo', icon: <FileText size={16} /> },
          ]}
        />
        {!res && <Alert>No fue posible calcular con los datos actuales. Revise la geometría y las cargas.</Alert>}
        {res && tab === 'planta' && (
          <>
            <div className="draw">
              <div className="draw-tools">
                <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <span className="hint">Combinación</span>
                  <div className="inp" style={{ minWidth: 190 }}>
                    <select value={combo?.combo.id ?? ''} onChange={(e) => setComboId(e.target.value)}>
                      {serviceCombos.map((s) => (
                        <option key={s.combo.id} value={s.combo.id}>
                          {s.combo.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>
                <Check label="Presiones" value={showPressure} onChange={setShowPressure} />
                <Check label="Perímetro de punzonamiento" value={showCritical} onChange={setShowCritical} />
                <Check label="Numerar vértices" value={showLabels} onChange={setShowLabels} />
                <span className="spacer" />
                <span className="hint">Arrastre vértices y columnas para modificar la geometría</span>
              </div>
              <PlanCanvas data={data} res={res} combo={combo} theme={th} showPressure={showPressure} showCritical={showCritical} showLabels={showLabels} selCol={col.id} onSelectCol={setSelCol} onChange={onChange} />
            </div>
            <ThumbSummary res={res} data={data} />
            <div className="draw">
              <div dangerouslySetInnerHTML={{ __html: footingSectionSvg(data, res, { fmt, theme: th, dir: 'x', W: 820, H: 340 }) }} />
            </div>
          </>
        )}
        {res && tab === 'resultados' && <FootingResultsView data={data} res={res} onChange={onChange} theme={th} />}
        {res && tab === 'armado' && <FootingArmado data={data} res={res} theme={th} />}
        {res && tab === 'memoria' && <ReportButtons kind="footing" footing={data} info={info} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lienzo interactivo de la planta
// ---------------------------------------------------------------------------
function PlanCanvas({
  data, res, combo, theme, showPressure, showCritical, showLabels, selCol, onSelectCol, onChange,
}: {
  data: FootingInput; res: FootingResults; combo: ReturnType<typeof analyzeFooting>['service'][number] | null; theme: typeof LIGHT; showPressure: boolean; showCritical: boolean; showLabels: boolean;
  selCol: string; onSelectCol: (id: string) => void; onChange: (f: FootingInput) => void;
}) {
  const { fmt } = useUnits();
  const W = 820, H = 560;
  const frozen = useRef<PlanView | null>(null);
  const [dragging, setDragging] = useState<{ kind: 'v' | 'c'; i: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const view = useMemo(() => (dragging && frozen.current ? frozen.current : makePlanView(planPoints(data), W, H)), [data, dragging]);
  const html = useMemo(
    () => footingPlanSvg(data, res, { W, H, theme, fmt, view, combo, showPressure, showCritical, showVertexLabels: showLabels, selectedColumn: selCol, idPrefix: 'live' }),
    [data, res, theme, fmt, view, combo, showPressure, showCritical, showLabels, selCol],
  );
  const snap = (v: number) => Math.round(v / 0.05) * 0.05;
  const toWorld = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const p = pt.matrixTransform(m.inverse());
    const w = view.toWorld(p.x, p.y);
    return { x: +snap(w.x).toFixed(3), y: +snap(w.y).toFixed(3) };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const w = toWorld(e);
    if (!w) return;
    if (dragging.kind === 'v') {
      const vs = data.vertices.map((v, i) => (i === dragging.i ? w : v));
      onChange({ ...data, vertices: vs, preset: 'poly' });
    } else {
      onChange({ ...data, columns: data.columns.map((c, i) => (i === dragging.i ? { ...c, x: w.x, y: w.y } : c)) });
    }
  };
  const start = (e: React.PointerEvent, kind: 'v' | 'c', i: number) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    frozen.current = view;
    setDragging({ kind, i });
    if (kind === 'c') onSelectCol(data.columns[i].id);
  };
  const end = () => {
    setDragging(null);
    frozen.current = null;
  };
  return (
    <div style={{ position: 'relative' }}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <svg ref={svgRef} className="overlay" viewBox={`0 0 ${W} ${H}`} onPointerMove={onMove} onPointerUp={end} onPointerCancel={end} style={{ touchAction: 'none' }}>
        {data.vertices.map((v, i) => {
          const p = view.toSvg(v.x, v.y);
          return <circle key={'v' + i} cx={p.x} cy={p.y} r={7} fill="#fff" stroke="#1d63c7" strokeWidth={2.5} style={{ cursor: 'grab' }} onPointerDown={(e) => start(e, 'v', i)} />;
        })}
        {data.columns.map((c, i) => {
          const p = view.toSvg(c.x, c.y);
          return <rect key={'c' + i} x={p.x - 6} y={p.y - 6} width={12} height={12} rx={3} fill="#d9822b" stroke="#fff" strokeWidth={2} style={{ cursor: 'move' }} onPointerDown={(e) => start(e, 'c', i)} />;
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editores
// ---------------------------------------------------------------------------
function FootingShapeEditor({ data, onChange }: { data: FootingInput; onChange: (f: FootingInput) => void }) {
  const pp = data.presetParams;
  const apply = (preset: FootingPreset, params = pp) => onChange({ ...data, preset, presetParams: params, vertices: footingPresetPoly(preset, params) });
  const setP = (patch: Partial<typeof pp>) => apply(data.preset === 'poly' ? 'rect' : data.preset, { ...pp, ...patch });
  const p = data.preset;
  const props = polyProps(ccw(data.vertices));
  const { fmt } = useUnits();
  return (
    <>
      <Sel label="Forma" value={p} onChange={(v) => apply(v)} options={FOOTING_PRESETS} />
      {p !== 'poly' && (
        <div className="grid3">
          {(p === 'rect' || p === 'L' || p === 'T' || p === 'trapezoid' || p === 'triangle') && <Num label="Ancho B (x)" q="len" value={pp.B} onChange={(v) => setP({ B: v })} min={0.4} />}
          {(p === 'rect' || p === 'L' || p === 'T' || p === 'trapezoid' || p === 'triangle') && <Num label="Largo L (y)" q="len" value={pp.L} onChange={(v) => setP({ L: v })} min={0.4} />}
          {(p === 'circle' || p === 'ngon') && <Num label="Diámetro D" q="len" value={pp.D} onChange={(v) => setP({ D: v })} min={0.4} />}
          {p === 'ngon' && <Num label="Lados n" value={pp.n} onChange={(v) => setP({ n: Math.round(v) })} min={3} max={24} />}
          {(p === 'L' || p === 'T') && <Num label={p === 'L' ? 'Espesor ala x' : 'Espesor alma'} q="len" value={pp.t1} onChange={(v) => setP({ t1: v })} min={0.2} />}
          {(p === 'L' || p === 'T') && <Num label={p === 'L' ? 'Espesor ala y' : 'Espesor ala'} q="len" value={pp.t2} onChange={(v) => setP({ t2: v })} min={0.2} />}
          {p === 'trapezoid' && <Num label="Ancho superior" q="len" value={pp.b2} onChange={(v) => setP({ b2: v })} min={0.2} />}
        </div>
      )}
      <details>
        <summary className="hint" style={{ cursor: 'pointer' }}>Tabla de vértices ({data.vertices.length}) — edición libre</summary>
        <div style={{ marginTop: 8 }} className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th className="r">x</th>
                <th className="r">y</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.vertices.map((v, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td><CellNum q="len" value={v.x} onChange={(x) => onChange({ ...data, preset: 'poly', vertices: data.vertices.map((w, j) => (j === i ? { ...w, x } : w)) })} /></td>
                  <td><CellNum q="len" value={v.y} onChange={(y) => onChange({ ...data, preset: 'poly', vertices: data.vertices.map((w, j) => (j === i ? { ...w, y } : w)) })} /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="icon-btn" title="Insertar vértice después" onClick={() => {
                      const a = data.vertices[i], b = data.vertices[(i + 1) % data.vertices.length];
                      const nv = [...data.vertices];
                      nv.splice(i + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
                      onChange({ ...data, preset: 'poly', vertices: nv });
                    }}><Plus size={14} /></button>
                    {data.vertices.length > 3 && (
                      <button className="icon-btn danger" title="Quitar vértice" onClick={() => onChange({ ...data, preset: 'poly', vertices: data.vertices.filter((_, j) => j !== i) })}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <div className="kpis">
        <Kpi label="Área" value={fmt.d(props.A, 3) + ' m²'} />
        <Kpi label="Centroide" value={`${fmt.d(props.cx, 2)} ; ${fmt.d(props.cy, 2)}`} sub="m" />
      </div>
    </>
  );
}

function ColumnEditor({ col, setCol }: { col: FootingColumn; setCol: (p: Partial<FootingColumn>) => void }) {
  const g = col.geom;
  const setG = (patch: Partial<typeof g>) => setCol({ geom: { ...g, ...patch } });
  const s = g.shape;
  return (
    <>
      <div className="grid2">
        <Txt label="Nombre" value={col.name} onChange={(v) => setCol({ name: v })} />
        <Sel label="Forma de la columna" value={s} onChange={(v: ColumnShape) => setG({ ...defaultColumnGeom(v), vertices: g.vertices, rotation: g.rotation, shape: v })} options={COLUMN_SHAPES} />
      </div>
      <div className="grid3">
        {(s === 'rect' || s === 'L' || s === 'T' || s === 'I' || s === 'cross') && <Num label="b (x)" q="lencm" value={g.b} onChange={(v) => setG({ b: v })} min={0.1} />}
        {(s === 'rect' || s === 'L' || s === 'T' || s === 'I' || s === 'cross') && <Num label="h (y)" q="lencm" value={g.h} onChange={(v) => setG({ h: v })} min={0.1} />}
        {(s === 'circle' || s === 'ngon') && <Num label="Diámetro" q="lencm" value={g.D} onChange={(v) => setG({ D: v })} min={0.1} />}
        {s === 'ngon' && <Num label="Lados" value={g.n} onChange={(v) => setG({ n: Math.round(v) })} min={3} max={24} />}
        {(s === 'L' || s === 'T' || s === 'I') && <Num label={s === 'L' ? 'Espesor patas' : 'Espesor ala'} q="lencm" value={g.t} onChange={(v) => setG({ t: v })} min={0.05} />}
        {(s === 'T' || s === 'I' || s === 'cross') && <Num label="Espesor alma" q="lencm" value={g.tw} onChange={(v) => setG({ tw: v })} min={0.05} />}
        <Num label="Giro" unit="°" value={g.rotation} onChange={(v) => setG({ rotation: v })} />
        <Num label="Posición x" q="len" value={col.x} onChange={(v) => setCol({ x: v })} hint="del centroide" />
        <Num label="Posición y" q="len" value={col.y} onChange={(v) => setCol({ y: v })} />
      </div>
      {s === 'poly' && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>#</th><th className="r">x local</th><th className="r">y local</th><th /></tr></thead>
            <tbody>
              {g.vertices.map((v, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td><CellNum q="lencm" value={v.x} onChange={(x) => setG({ vertices: g.vertices.map((w, j) => (j === i ? { ...w, x } : w)) })} /></td>
                  <td><CellNum q="lencm" value={v.y} onChange={(y) => setG({ vertices: g.vertices.map((w, j) => (j === i ? { ...w, y } : w)) })} /></td>
                  <td>
                    <button className="icon-btn" onClick={() => setG({ vertices: [...g.vertices.slice(0, i + 1), { x: v.x + 0.05, y: v.y + 0.05 }, ...g.vertices.slice(i + 1)] })}><Plus size={14} /></button>
                    {g.vertices.length > 3 && <button className="icon-btn danger" onClick={() => setG({ vertices: g.vertices.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function LoadsEditor({ col, setCol }: { col: FootingColumn; setCol: (p: Partial<FootingColumn>) => void }) {
  const { fmt } = useUnits();
  const upd = (k: CaseKey, f: keyof typeof col.loads.D, v: number) => setCol({ loads: { ...col.loads, [k]: { ...col.loads[k], [f]: v } } });
  return (
    <div>
      <div className="hint" style={{ marginBottom: 6 }}>
        Cargas en el nivel del terreno. P positiva hacia abajo. Mx / My: momento que aumenta la presión hacia +y / +x.
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Caso</th>
              <th className="r">P ({fmt.l('force')})</th>
              <th className="r">Vx ({fmt.l('force')})</th>
              <th className="r">Vy ({fmt.l('force')})</th>
              <th className="r">Mx ({fmt.l('moment')})</th>
              <th className="r">My ({fmt.l('moment')})</th>
            </tr>
          </thead>
          <tbody>
            {CASE_KEYS.map((k) => (
              <tr key={k}>
                <td>{CASE_LABEL[k]}</td>
                <td><CellNum q="force" value={col.loads[k].P} onChange={(v) => upd(k, 'P', v)} decimals={2} /></td>
                <td><CellNum q="force" value={col.loads[k].Vx} onChange={(v) => upd(k, 'Vx', v)} decimals={2} /></td>
                <td><CellNum q="force" value={col.loads[k].Vy} onChange={(v) => upd(k, 'Vy', v)} decimals={2} /></td>
                <td><CellNum q="moment" value={col.loads[k].Mx} onChange={(v) => upd(k, 'Mx', v)} decimals={2} /></td>
                <td><CellNum q="moment" value={col.loads[k].My} onChange={(v) => upd(k, 'My', v)} decimals={2} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EnvelopeEditor({ data, col, onChange }: { data: FootingInput; col: FootingColumn; onChange: (f: FootingInput) => void }) {
  const { fmt } = useUnits();
  const updCombo = (id: string, patch: Partial<LoadCombo>) => onChange({ ...data, combos: data.combos.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const updLoad = (id: string, f: keyof LoadCase, v: number) =>
    onChange({ ...data, columns: data.columns.map((c) => (c.id === col.id ? { ...c, env: { ...(c.env ?? {}), [id]: { ...zeroLoad(), ...(c.env?.[id] ?? {}), [f]: v } } } : c)) });
  const add = (kind: 'service' | 'ultimate') => {
    const id = 'E' + Date.now().toString(36);
    onChange({ ...data, combos: [...data.combos, { id, name: kind === 'service' ? 'ES nueva' : 'EU nueva', kind, D: 0, L: 0, W: 0, E: 0, qaFactor: 1 }] });
  };
  const del = (id: string) => onChange({ ...data, combos: data.combos.filter((c) => c.id !== id) });
  return (
    <div>
      <div className="hint" style={{ marginBottom: 6 }}>
        Columna {col.name}. Una fila por combinación de la envolvente: <b>ES</b> (servicio: suelo, deslizamiento, volcamiento) y <b>EU</b> (última: diseño del concreto). Cargas en el nivel del terreno; P positiva hacia abajo.
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Combinación</th>
              <th>Tipo</th>
              <th className="r">P ({fmt.l('force')})</th>
              <th className="r">Vx ({fmt.l('force')})</th>
              <th className="r">Vy ({fmt.l('force')})</th>
              <th className="r">Mx ({fmt.l('moment')})</th>
              <th className="r">My ({fmt.l('moment')})</th>
              <th className="r">qa×</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.combos.map((c) => {
              const l = col.env?.[c.id] ?? zeroLoad();
              return (
                <tr key={c.id}>
                  <td><CellText value={c.name} onChange={(v) => updCombo(c.id, { name: v })} /></td>
                  <td>
                    <select value={c.kind} onChange={(e) => updCombo(c.id, { kind: e.target.value as any })} style={{ border: 0, background: 'transparent' }}>
                      <option value="service">ES</option>
                      <option value="ultimate">EU</option>
                    </select>
                  </td>
                  <td><CellNum q="force" value={l.P} onChange={(v) => updLoad(c.id, 'P', v)} decimals={2} /></td>
                  <td><CellNum q="force" value={l.Vx} onChange={(v) => updLoad(c.id, 'Vx', v)} decimals={2} /></td>
                  <td><CellNum q="force" value={l.Vy} onChange={(v) => updLoad(c.id, 'Vy', v)} decimals={2} /></td>
                  <td><CellNum q="moment" value={l.Mx} onChange={(v) => updLoad(c.id, 'Mx', v)} decimals={2} /></td>
                  <td><CellNum q="moment" value={l.My} onChange={(v) => updLoad(c.id, 'My', v)} decimals={2} /></td>
                  <td>{c.kind === 'service' ? <CellNum value={c.qaFactor} onChange={(v) => updCombo(c.id, { qaFactor: v })} decimals={2} /> : '—'}</td>
                  <td><button className="icon-btn danger" onClick={() => del(c.id)}><Trash2 size={14} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        <button className="btn small" onClick={() => add('service')}><Plus size={14} /> ES (servicio)</button>
        <button className="btn small" onClick={() => add('ultimate')}><Plus size={14} /> EU (última)</button>
      </div>
    </div>
  );
}

function CombosEditor({ data, onChange }: { data: FootingInput; onChange: (f: FootingInput) => void }) {
  const upd = (id: string, patch: Partial<LoadCombo>) => onChange({ ...data, combos: data.combos.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  return (
    <>
      <div className="hint">Servicio (suelo, deslizamiento, volcamiento) y últimas (diseño del concreto). Edite los factores libremente.</div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th className="r">D</th>
              <th className="r">L</th>
              <th className="r">W</th>
              <th className="r">E</th>
              <th className="r">qa×</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.combos.map((c) => (
              <tr key={c.id}>
                <td><CellText value={c.name} onChange={(v) => upd(c.id, { name: v })} /></td>
                <td>
                  <select value={c.kind} onChange={(e) => upd(c.id, { kind: e.target.value as any })} style={{ border: 0, background: 'transparent' }}>
                    <option value="service">Servicio</option>
                    <option value="ultimate">Última</option>
                  </select>
                </td>
                <td><CellNum value={c.D} onChange={(v) => upd(c.id, { D: v })} decimals={3} /></td>
                <td><CellNum value={c.L} onChange={(v) => upd(c.id, { L: v })} decimals={3} /></td>
                <td><CellNum value={c.W} onChange={(v) => upd(c.id, { W: v })} decimals={3} /></td>
                <td><CellNum value={c.E} onChange={(v) => upd(c.id, { E: v })} decimals={3} /></td>
                <td>{c.kind === 'service' ? <CellNum value={c.qaFactor} onChange={(v) => upd(c.id, { qaFactor: v })} decimals={2} /> : '—'}</td>
                <td><button className="icon-btn danger" onClick={() => onChange({ ...data, combos: data.combos.filter((x) => x.id !== c.id) })}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn small" onClick={() => onChange({ ...data, combos: [...data.combos, { id: 'C' + Date.now().toString(36), name: 'Nueva', kind: 'ultimate', D: 1.2, L: 1.6, W: 0, E: 0, qaFactor: 1 }] })}><Plus size={14} /> Combinación</button>
        <button className="btn small ghost" onClick={() => onChange({ ...data, combos: defaultCombos() })}><RotateCcw size={14} /> Restablecer</button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Resumen rápido bajo la planta
// ---------------------------------------------------------------------------
function ThumbSummary({ res, data }: { res: FootingResults; data: FootingInput }) {
  const { fmt } = useUnits();
  const g = res.govPressure;
  return (
    <div className="kpis">
      <Kpi label="Área de la zapata" value={`${fmt.d(res.area, 2)} m²`} sub={`Volumen de concreto ${fmt.d(res.concreteVolume, 2)} m³`} />
      <Kpi label="Presión máxima" value={g ? fmt.u('press', g.sol.qmax, 1) : '—'} sub={g ? `${g.combo.name} · adm. ${fmt.u('press', g.qaAllow, 1)}` : ''} />
      <Kpi label="Contacto con el suelo" value={g ? `${(100 * g.sol.contactArea / g.sol.area).toFixed(0)} %` : '—'} sub={g?.sol.uplift ? 'Hay levantamiento' : 'Contacto total'} />
      <Kpi label="Acero estimado" value={`${res.steelKg.toFixed(0)} kg`} sub={`${(res.steelKg / Math.max(res.concreteVolume, 1e-6)).toFixed(0)} kg/m³`} />
      <Kpi label="Estado" value={res.ok ? 'Cumple' : 'No cumple'} sub={`${res.checks.filter((c) => !c.ok).length} verificaciones fallidas`} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------
function FootingResultsView({ data, res, onChange, theme }: { data: FootingInput; res: FootingResults; onChange: (f: FootingInput) => void; theme: typeof LIGHT }) {
  const { fmt } = useUnits();
  const [busy, setBusy] = useState('');
  const th = theme;
  return (
    <>
      <div className={'banner ' + (res.ok ? 'ok' : 'bad')}>
        {res.ok ? <CheckCircle2 /> : <XCircle />}
        {res.ok ? 'La fundación cumple todas las verificaciones.' : 'La fundación NO cumple alguna verificación. Aumente el espesor o las dimensiones.'}
        <span className="spacer" />
        <button
          className="btn small primary"
          disabled={!!busy}
          title="Calcula dimensiones, espesor y acero (columna 1)"
          onClick={() => {
            setBusy('a');
            setTimeout(() => {
              const r = autoSizeFooting(data);
              setBusy('');
              onChange(r.input);
              if (!r.ok) alert(r.note);
            }, 20);
          }}
        >
          <Wand2 size={14} /> Dimensionar automáticamente
        </button>
        <button
          className="btn small"
          disabled={!!busy}
          onClick={() => {
            setBusy('h');
            setTimeout(() => {
              const h = findMinThickness(data);
              setBusy('');
              if (h) onChange({ ...data, h });
              else alert('No se encontró un espesor que cumpla hasta 2.5 m. Amplíe la zapata.');
            }, 20);
          }}
        >
          <Wand2 size={14} /> Espesor mínimo
        </button>
        <button
          className="btn small"
          disabled={!!busy}
          onClick={() => {
            setBusy('s');
            setTimeout(() => {
              const s = findScaleForPressure(data);
              setBusy('');
              if (s && s > 1.0001) {
                const p = polyProps(ccw(data.vertices));
                onChange({ ...data, preset: 'poly', vertices: ccw(data.vertices).map((v) => ({ x: +(p.cx + (v.x - p.cx) * s).toFixed(3), y: +(p.cy + (v.y - p.cy) * s).toFixed(3) })) });
              } else if (!s) alert('No se logró cumplir presión con ampliación uniforme hasta ×3.');
            }, 20);
          }}
        >
          <MoveDiagonal size={14} /> Ampliar por presión
        </button>
      </div>
      {res.warnings.length > 0 && <div className="stack" style={{ gap: 8 }}>{res.warnings.map((w, i) => <Alert key={i}>{w}</Alert>)}</div>}
      <Card title="Verificaciones" icon={<ListChecks size={18} />}>
        <div className="checks">
          {res.checks.map((c, i) => (
            <CheckCard key={i} name={c.name} ratio={c.ratio} ok={c.ok} detail={c.detail} />
          ))}
        </div>
      </Card>
      <Card title="Presiones en el suelo y estabilidad (servicio)" icon={<Mountain size={18} />}>
        <Tbl
          head={['Combinación', `P total (${fmt.l('force')})`, 'ex (m)', 'ey (m)', `q máx (${fmt.l('press')})`, `q mín (${fmt.l('press')})`, 'Contacto', `q adm (${fmt.l('press')})`, 'q/qa', 'FS desl.', 'FS volc.', '']}
          align={['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'c']}
          rows={res.service.map((s) => [
            s.combo.name,
            fmt.n('force', s.Ptot, 1),
            s.ex.toFixed(3),
            s.ey.toFixed(3),
            s.sol.ok ? fmt.n('press', s.sol.qmax, 1) : '—',
            s.sol.ok ? fmt.n('press', s.sol.qmin, 1) : '—',
            s.sol.ok ? `${((100 * s.sol.contactArea) / s.sol.area).toFixed(0)} %` : '—',
            fmt.n('press', s.qaAllow, 1),
            s.sol.ok ? s.ratio.toFixed(2) : '—',
            isFinite(s.FSsl) ? s.FSsl.toFixed(2) : '∞',
            isFinite(s.FSot) ? s.FSot.toFixed(2) : '∞',
            <StatusChip key="s" ok={s.ok} />,
          ])}
        />
      </Card>
      <Card title="Flexión y cortante en una dirección" icon={<Layers size={18} />}>
        <Tbl
          head={['Dir.', 'Combinación', `Mu (${fmt.l('moment')})`, 'Cara', 'd (m)', 'Ancho (m)', 'As req (cm²/m)', 'As mín (cm²/m)', 'Armado', 'As prov (cm²/m)', 'Mu/φMn', `Vu (${fmt.l('force')})`, `φVc (${fmt.l('force')})`, 'Vu/φVc']}
          align={['c', 'l', 'r', 'l', 'r', 'r', 'r', 'r', 'l', 'r', 'r', 'r', 'r', 'r']}
          rows={(['x', 'y'] as const).map((d) => {
            const f = d === 'x' ? res.flexX : res.flexY;
            const s = d === 'x' ? res.shearX : res.shearY;
            return [
              d.toUpperCase(), f?.comboName ?? '—', f ? fmt.n('moment', f.Mu, 1) : '—', f?.face ?? '—', f ? f.d.toFixed(3) : '—', f ? f.chord.toFixed(2) : '—',
              f ? f.AsReq.toFixed(2) : '—', f ? f.AsMin.toFixed(2) : '—', f?.det.text ?? '—', f ? f.det.asProv.toFixed(2) : '—', f ? f.ratio.toFixed(2) : '—',
              s ? fmt.n('force', s.Vu, 1) : '—', s ? fmt.n('force', s.phiVc, 1) : '—', s ? s.ratio.toFixed(2) : '—',
            ];
          })}
        />
      </Card>
      <Card title="Punzonamiento" icon={<Columns3 size={18} />}>
        <Tbl
          head={['Columna', 'Combinación', `Vu (${fmt.l('force')})`, 'bo (m)', 'β', 'αs', 'vu (MPa)', 'φvc (MPa)', 'vu/φvc', 'Estado']}
          align={['l', 'l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'c']}
          rows={res.punching.map((p) => [
            p.col.name, p.comboName, p.applicable ? fmt.n('force', p.Vu, 1) : '—', p.applicable ? p.bo.toFixed(2) : '—', p.beta.toFixed(2), p.alphaS, p.applicable ? p.vuMax.toFixed(3) : '—',
            p.applicable ? p.phiVc.toFixed(3) : '—', p.applicable ? p.ratio.toFixed(2) : '—', <StatusChip key="s" ok={p.ok} />,
          ])}
        />
      </Card>
      <div className="grid2">
        {(['x', 'y'] as const).map((d) => {
          const f = d === 'x' ? res.flexX : res.flexY;
          if (!f) return null;
          const svg = lineChart({
            w: 520, h: 250, theme: th, xLabel: `Posición ${d} (m)`, yLabel: `Momento (${fmt.l('moment')})`, title: `Momento flector — dirección ${d.toUpperCase()}`,
            series: [{ name: 'M', xs: f.diagram.pos, ys: f.diagram.M.map((m) => fmt.sys === 'SI' ? m : m / 9.80665), color: th.accent }], fillArea: true,
          });
          return <div className="draw" key={d}><div dangerouslySetInnerHTML={{ __html: svg }} /></div>;
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Armado
// ---------------------------------------------------------------------------
function FootingArmado({ data, res, theme }: { data: FootingInput; res: FootingResults; theme: typeof LIGHT }) {
  const { fmt } = useUnits();
  return (
    <>
      <div className="draw"><div dangerouslySetInnerHTML={{ __html: footingRebarPlanSvg(data, res, { fmt, theme, W: 820, H: 520 }) }} /></div>
      {data.topSteel && <div className="draw"><div dangerouslySetInnerHTML={{ __html: footingRebarPlanSvg(data, res, { fmt, theme, W: 820, H: 520, layer: 'top' }) }} /></div>}
      <div className="grid2">
        <div className="draw"><div dangerouslySetInnerHTML={{ __html: footingSectionSvg(data, res, { fmt, theme, dir: 'x', W: 600, H: 320 }) }} /></div>
        <div className="draw"><div dangerouslySetInnerHTML={{ __html: footingSectionSvg(data, res, { fmt, theme, dir: 'y', W: 600, H: 320 }) }} /></div>
      </div>
      <Card title="Cuadro de armado" icon={<Grid3x3 size={18} />}>
        <Tbl
          head={['Elemento', 'Armado', 'As prov (cm²/m)', 'As req (cm²/m)', 'Observación']}
          align={['l', 'l', 'r', 'r', 'l']}
          rows={[
            ...(['x', 'y'] as const).map((d) => {
              const f = d === 'x' ? res.flexX : res.flexY;
              return [
                `Barras en ${d.toUpperCase()}${(data.lowerLayer === d) ? ' (capa inferior)' : ' (capa superior de la malla)'}`, f?.det.text ?? '—', f ? f.det.asProv.toFixed(2) : '—', f ? f.AsReq.toFixed(2) : '—',
                f ? (f.hookNeeded ? `Usar gancho estándar (ldh ≥ ${f.hookLen.toFixed(2)} m)` : `Desarrollo recto ld = ${f.ldReq.toFixed(2)} m ≤ disponible ${isFinite(f.ldAvail) ? f.ldAvail.toFixed(2) : '—'} m`) : '',
              ];
            }),
            ...(data.topSteel
              ? (['x', 'y'] as const).map((d) => {
                  const f = d === 'x' ? res.flexTopX : res.flexTopY;
                  return [`Barras superiores en ${d.toUpperCase()}`, f?.det.text ?? '—', f ? f.det.asProv.toFixed(2) : '—', f ? f.AsReq.toFixed(2) : '—', f ? (f.Mu > 0 ? `Momento negativo Mu = ${fmt.u('moment', f.Mu, 1)}` : 'Acero mínimo (sin momento negativo)') : ''];
                })
              : [['Acero superior', 'No se coloca', '—', '—', 'Concreto simple en tracción superior']]),
            ...res.punching.map((p) => [`Barras de espera de ${p.col.name}`, '—', '—', '—', `As ≥ 0.005·Ag = ${p.dowelAs.toFixed(1)} cm² (ACI 16.3.4.1)`]),
          ]}
        />
      </Card>
      <div className="kpis">
        <Kpi label="Concreto" value={`${fmt.d(res.concreteVolume, 2)} m³`} />
        <Kpi label="Acero (estimado)" value={`${res.steelKg.toFixed(0)} kg`} sub="sin ganchos ni traslapes" />
        <Kpi label="Cuantía de acero" value={`${(res.steelKg / Math.max(res.concreteVolume, 1e-6)).toFixed(0)} kg/m³`} />
        <Kpi label="d promedio" value={`${(res.dAvg * 100).toFixed(1)} cm`} sub={res.thicknessOk ? 'cumple ≥ 15 cm' : 'menor que 15 cm'} />
      </div>
    </>
  );
}

void Copy;
void findBar;
void makeFmt;
void Ruler;
