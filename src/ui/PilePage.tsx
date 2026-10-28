import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, Settings2, Layers, Columns3, Mountain, Shapes, Eye, ListChecks, Grid3x3, FileText, CheckCircle2, XCircle, Wand2, Pickaxe, Network, Waves } from 'lucide-react';
import { PileInput, PileKind, CAP_SHAPES, CapShape, PILE_KINDS, HP_SHAPES, defaultPile, defaultCombos, defaultLayers, standardLayout, SoilLayer, PileCombo } from '../core/pileTypes';
import { analyzePile, autoSizePile, findCapDesign, PileResults } from '../core/pile';
import { barList } from '../core/materials';
import { FootingColumn, defaultColumn } from '../core/footing';
import { Acc, Alert, Card, Check, CheckCard, CellNum, CellText, Kpi, Num, Sel, Tabs, Tbl, Txt, useUnits } from './common';
import { DARK, LIGHT } from '../draw/svg';
import { pilePlanSvg, pileRebarPlanSvg, pileSectionSvg, pileStmElevationSvg, pileStmPlanSvg, pileProfileSvg, liquefactionChartSvg, settlementChartSvg } from '../draw/pileDraw';
import { ColumnEditor } from './FootingPage';
import { ReportButtons } from './ReportButtons';
import { ProjectInfo } from '../state';

type Tab = 'planta' | 'resultados' | 'stm' | 'suelo' | 'armado' | 'memoria';

export function PilePage({ data, onChange, theme, info }: { data: PileInput; onChange: (f: PileInput) => void; theme: 'light' | 'dark'; info: ProjectInfo }) {
  const { fmt } = useUnits();
  const [tab, setTab] = useState<Tab>('planta');
  const [comboId, setComboId] = useState('');
  const [busy, setBusy] = useState('');
  const res = useMemo(() => {
    try {
      return analyzePile(data);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [data]);
  const th = theme === 'dark' ? DARK : LIGHT;
  const set = (patch: Partial<PileInput>) => onChange({ ...data, ...patch });
  const setPile = (patch: Partial<PileInput['pile']>) => set({ pile: { ...data.pile, ...patch } });
  const setCap = (patch: Partial<PileInput['cap']>) => set({ cap: { ...data.cap, ...patch } });
  const setGeo = (patch: Partial<PileInput['geo']>) => set({ geo: { ...data.geo, ...patch } });
  const setLay = (patch: Partial<PileInput['layout']>) => set({ layout: { ...data.layout, ...patch } });
  const p = data.pile;
  const combo = res?.service.find((s) => s.combo.id === comboId) ?? (res ? res.service.reduce<any>((a, b) => (!a || b.ratioC > a.ratioC ? b : a), null) : null);
  const bars = barList(data.cap.barSystem).map((b) => ({ id: b.id, label: b.label }));
  const pseudoCol: FootingColumn = { ...defaultColumn('c', 'Columna'), geom: data.column.geom, x: data.column.x, y: data.column.y };

  const run = (key: string, fn: () => void) => {
    setBusy(key);
    setTimeout(() => {
      try { fn(); } finally { setBusy(''); }
    }, 20);
  };

  return (
    <div className="split">
      <div className="left stack">
        <Acc title="Datos generales" icon={<Settings2 size={18} />} open>
          <Txt label="Nombre" value={data.name} onChange={(v) => set({ name: v })} />
        </Acc>

        <Acc title="Pilote" icon={<Pickaxe size={18} />} open>
          <Sel label="Tipo de pilote" value={p.kind} onChange={(k: PileKind) => set({ pile: { ...defaultPile(k), L: p.L, Lu: p.Lu, nh: p.nh, head: p.head, yAllow: p.yAllow } })} options={PILE_KINDS} />
          <div className="grid2">
            {p.kind === 'concrete' && (
              <>
                <Sel label="Sección" value={p.shape} onChange={(v) => setPile({ shape: v })} options={[{ id: 'circle', label: 'Circular' }, { id: 'square', label: 'Cuadrada' }]} />
                <Num label={p.shape === 'circle' ? 'Diámetro' : 'Lado'} q="lencm" value={p.D} onChange={(v) => setPile({ D: v })} min={0.2} />
                <Num label="f′c" q="stress" value={p.fc} onChange={(v) => setPile({ fc: v })} min={14} />
                <Num label="fy" q="stress" value={p.fy} onChange={(v) => setPile({ fy: v })} min={240} />
                <Num label="N.º de barras" value={p.nBars} onChange={(v) => setPile({ nBars: Math.max(4, Math.round(v)) })} min={4} />
                <Sel label="Barra longitudinal" value={p.bar} onChange={(v) => setPile({ bar: v })} options={bars} />
                <Sel label="Refuerzo transversal" value={p.spiral ? 's' : 'e'} onChange={(v) => setPile({ spiral: v === 's' })} options={[{ id: 's', label: 'Espiral (φ = 0.75)' }, { id: 'e', label: 'Estribos (φ = 0.65)' }]} />
                <Sel label="Barra transversal" value={p.tieBar} onChange={(v) => setPile({ tieBar: v })} options={bars} />
                <Num label="Paso / separación" q="lencm" value={p.tieS} onChange={(v) => setPile({ tieS: v })} min={0.03} />
                <Num label="Recubrimiento" q="lencm" value={p.cover} onChange={(v) => setPile({ cover: v })} min={0.04} />
              </>
            )}
            {p.kind === 'pipe' && (
              <>
                <Num label="Diámetro exterior" q="lencm" value={p.D} onChange={(v) => setPile({ D: v })} min={0.1} />
                <Num label="Espesor de pared" unit="mm" value={+(p.t * 1000).toFixed(2)} onChange={(v) => setPile({ t: v / 1000 })} min={3} />
              </>
            )}
            {p.kind === 'hpile' && (
              <>
                <Sel label="Perfil HP" value={p.hp} onChange={(v) => setPile({ hp: v })} options={HP_SHAPES.map((h) => ({ id: h.id, label: h.id }))} />
                <Sel label="Eje de flexión" value={p.axis} onChange={(v) => setPile({ axis: v })} options={[{ id: 'weak', label: 'Eje débil' }, { id: 'strong', label: 'Eje fuerte' }]} />
              </>
            )}
            {p.kind !== 'concrete' && (
              <>
                <Num label="Fy del acero" q="stress" value={p.Fy} onChange={(v) => setPile({ Fy: v })} min={200} />
                <Num label="Corrosión por cara" unit="mm" value={+(p.tc * 1000).toFixed(2)} onChange={(v) => setPile({ tc: v / 1000 })} min={0} />
                <div style={{ gridColumn: '1 / -1' }}>
                  <Check label="Tapón de suelo en la punta" value={p.plug} onChange={(v) => setPile({ plug: v })} hint="Tubo abierto o perfil H: la punta trabaja con el área total" />
                </div>
              </>
            )}
            <Sel label="Instalación" value={p.install} onChange={(v) => setPile({ install: v })} options={[{ id: 'bored', label: 'Preexcavado / vaciado in situ' }, { id: 'driven', label: 'Hincado' }]} />
            <Num label="Longitud embebida L" q="len" value={p.L} onChange={(v) => setPile({ L: v })} min={2} />
            <Num label="Longitud libre sobre el terreno" q="len" value={p.Lu} onChange={(v) => setPile({ Lu: v })} min={0} />
            {p.kind !== 'concrete' && <Num label="K (pandeo)" value={p.K} onChange={(v) => setPile({ K: v })} min={0.5} />}
            {p.kind !== 'concrete' && <Num label="Pernos Ø19 en el cabezal" value={p.studs} onChange={(v) => setPile({ studs: Math.max(0, Math.round(v)) })} min={0} hint="Transfieren la tracción del pilote al cabezal" />}
            <Sel label="Cabeza del pilote" value={p.head} onChange={(v) => setPile({ head: v })} options={[{ id: 'fixed', label: 'Empotrada en el cabezal' }, { id: 'free', label: 'Libre (articulada)' }]} />
            <Num label="nh (suelo lateral)" unit="kN/m³" value={p.nh} onChange={(v) => setPile({ nh: v })} min={100} hint="Arena suelta ≈ 2000, media ≈ 5000, densa ≈ 12000; arcilla blanda ≈ 500" />
            <Num label="Deflexión lateral adm." unit="mm" value={+(p.yAllow * 1000).toFixed(2)} onChange={(v) => setPile({ yAllow: v / 1000 })} min={1} />
          </div>
        </Acc>

        <Acc title="Distribución de los pilotes" icon={<Shapes size={18} />} open>
          <div className="grid2">
            <Sel label="Disposición" value={data.layout.mode} onChange={(v) => setLay({ mode: v })} options={[{ id: 'grid', label: 'Malla rectangular' }, { id: 'ring', label: 'Anillo (+ centro)' }, { id: 'custom', label: 'Coordenadas libres' }]} />
            {data.layout.mode === 'grid' && (
              <>
                <Num label="Pilotes en X" value={data.layout.nx} onChange={(v) => setLay({ nx: Math.max(1, Math.round(v)) })} min={1} />
                <Num label="Pilotes en Y" value={data.layout.ny} onChange={(v) => setLay({ ny: Math.max(1, Math.round(v)) })} min={1} />
                <Num label="Separación en X" q="len" value={data.layout.sx} onChange={(v) => setLay({ sx: v })} min={0.3} />
                <Num label="Separación en Y" q="len" value={data.layout.sy} onChange={(v) => setLay({ sy: v })} min={0.3} />
              </>
            )}
            {data.layout.mode === 'ring' && (
              <>
                <Num label="Pilotes en el anillo" value={data.layout.nRing} onChange={(v) => setLay({ nRing: Math.max(3, Math.round(v)) })} min={3} />
                <Num label="Radio del anillo" q="len" value={data.layout.R} onChange={(v) => setLay({ R: v })} min={0.3} />
                <div style={{ gridColumn: '1 / -1' }}><Check label="Pilote central" value={data.layout.center} onChange={(v) => setLay({ center: v })} /></div>
              </>
            )}
          </div>
          {data.layout.mode === 'custom' && (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>#</th><th className="r">x ({fmt.l('len')})</th><th className="r">y ({fmt.l('len')})</th><th /></tr></thead>
                <tbody>
                  {data.layout.pts.map((q, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td><CellNum q="len" value={q.x} onChange={(x) => setLay({ pts: data.layout.pts.map((w, j) => (j === i ? { ...w, x } : w)) })} /></td>
                      <td><CellNum q="len" value={q.y} onChange={(y) => setLay({ pts: data.layout.pts.map((w, j) => (j === i ? { ...w, y } : w)) })} /></td>
                      <td><button className="icon-btn danger" onClick={() => setLay({ pts: data.layout.pts.filter((_, j) => j !== i) })}><Trash2 size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn small" onClick={() => setLay({ pts: [...data.layout.pts, { x: 0, y: 0 }] })}><Plus size={14} /> Pilote</button>
            </div>
          )}
          <div className="hint">Distribuciones usuales con separación 3·D:</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button key={n} className="btn small ghost" onClick={() => set({ layout: standardLayout(n, Math.ceil((3 * (res?.props.Dp ?? p.D)) / 0.05) * 0.05) })}>{n}</button>
            ))}
          </div>
        </Acc>

        <Acc title="Cabezal" icon={<Layers size={18} />} open>
          <div className="grid2">
            <Num label="Espesor h" q="len" value={data.cap.h} onChange={(v) => setCap({ h: v })} min={0.4} />
            <Sel label="Forma del cabezal" value={data.cap.shape} onChange={(v: CapShape) => setCap({ shape: v })} options={CAP_SHAPES.map((c) => ({ id: c.id, label: c.label }))} />
            {CAP_SHAPES.find((c) => c.id === data.cap.shape)?.auto ? (
              <>
                <Num label="Vuelo desde el eje del pilote" q="len" value={data.cap.edge} onChange={(v) => setCap({ edge: v })} min={0.2} />
                {data.cap.shape === 'ngon' && <Num label="Lados" value={data.cap.nSides} onChange={(v) => setCap({ nSides: Math.max(3, Math.round(v)) })} min={3} max={24} />}
                <div style={{ gridColumn: '1 / -1' }}>
                  <Check label="Dimensiones manuales" value={data.cap.manualSize} onChange={(v) => setCap({ manualSize: v, B: res?.capRect.B ?? data.cap.B, L: res?.capRect.L ?? data.cap.L, preset: { ...data.cap.preset, D: Math.max(res?.capRect.B ?? 2, res?.capRect.L ?? 2) } })} />
                </div>
                {data.cap.manualSize && (data.cap.shape === 'circle' || data.cap.shape === 'ngon') && <Num label="Diámetro circunscrito" q="len" value={data.cap.preset.D} onChange={(v) => setCap({ preset: { ...data.cap.preset, D: v } })} min={0.5} />}
                {data.cap.manualSize && data.cap.shape === 'rect' && (
                  <>
                    <Num label="B (x)" q="len" value={data.cap.B} onChange={(v) => setCap({ B: v })} min={0.5} />
                    <Num label="L (y)" q="len" value={data.cap.L} onChange={(v) => setCap({ L: v })} min={0.5} />
                  </>
                )}
              </>
            ) : (
              <>
                {data.cap.shape !== 'poly' && (
                  <>
                    <Num label="Ancho B (x)" q="len" value={data.cap.preset.B} onChange={(v) => setCap({ preset: { ...data.cap.preset, B: v } })} min={0.5} />
                    <Num label="Largo L (y)" q="len" value={data.cap.preset.L} onChange={(v) => setCap({ preset: { ...data.cap.preset, L: v } })} min={0.5} />
                    {(data.cap.shape === 'L' || data.cap.shape === 'T') && <Num label={data.cap.shape === 'L' ? 'Espesor ala x' : 'Espesor alma'} q="len" value={data.cap.preset.t1} onChange={(v) => setCap({ preset: { ...data.cap.preset, t1: v } })} min={0.3} />}
                    {(data.cap.shape === 'L' || data.cap.shape === 'T') && <Num label={data.cap.shape === 'L' ? 'Espesor ala y' : 'Espesor ala'} q="len" value={data.cap.preset.t2} onChange={(v) => setCap({ preset: { ...data.cap.preset, t2: v } })} min={0.3} />}
                    {data.cap.shape === 'trapezoid' && <Num label="Ancho superior" q="len" value={data.cap.preset.b2} onChange={(v) => setCap({ preset: { ...data.cap.preset, b2: v } })} min={0.3} />}
                  </>
                )}
                <Num label="Desplazamiento en x" q="len" value={data.cap.dx} onChange={(v) => setCap({ dx: v })} hint="del centro de la forma" />
                <Num label="Desplazamiento en y" q="len" value={data.cap.dy} onChange={(v) => setCap({ dy: v })} />
                {data.cap.shape === 'poly' && (
                  <div className="tbl-wrap" style={{ gridColumn: '1 / -1' }}>
                    <table className="tbl">
                      <thead><tr><th>#</th><th className="r">x ({fmt.l('len')})</th><th className="r">y ({fmt.l('len')})</th><th /></tr></thead>
                      <tbody>
                        {data.cap.vertices.map((q, i) => (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            <td><CellNum q="len" value={q.x} onChange={(x) => setCap({ vertices: data.cap.vertices.map((w, j) => (j === i ? { ...w, x } : w)) })} /></td>
                            <td><CellNum q="len" value={q.y} onChange={(y) => setCap({ vertices: data.cap.vertices.map((w, j) => (j === i ? { ...w, y } : w)) })} /></td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              <button className="icon-btn" title="Insertar vértice después" onClick={() => { const a = data.cap.vertices[i], b = data.cap.vertices[(i + 1) % data.cap.vertices.length]; const nv = [...data.cap.vertices]; nv.splice(i + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }); setCap({ vertices: nv }); }}><Plus size={14} /></button>
                              {data.cap.vertices.length > 3 && <button className="icon-btn danger" title="Quitar vértice" onClick={() => setCap({ vertices: data.cap.vertices.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn small" title="Convierte el contorno actual en vértices que puede editar" onClick={() => res && setCap({ shape: 'poly', vertices: simplifyPoly(res.capPoly).map((q) => ({ x: +q.x.toFixed(3), y: +q.y.toFixed(3) })), dx: 0, dy: 0 })}><Shapes size={14} /> Convertir a vértices editables</button>
            </div>
            {res && (
              <div className="kpis" style={{ gridColumn: '1 / -1' }}>
                <Kpi label="Área del cabezal" value={`${res.capArea.toFixed(2)} m²`} sub={`caja ${res.capRect.B.toFixed(2)} × ${res.capRect.L.toFixed(2)} m`} />
                <Kpi label="Volumen / peso" value={`${res.concreteVolume.toFixed(2)} m³`} sub={fmt.u('force', res.Wcap, 0)} />
              </div>
            )}
            <Num label="Recubrimiento" q="lencm" value={data.cap.cover} onChange={(v) => setCap({ cover: v })} min={0.05} />
            <Num label="Penetración del pilote" q="lencm" value={data.cap.embed} onChange={(v) => setCap({ embed: v })} min={0.05} />
            <Sel label="Barras" value={data.cap.barSystem} onChange={(v) => setCap({ barSystem: v, barX: barList(v)[5].id, barY: barList(v)[5].id, barTopX: barList(v)[2].id, barTopY: barList(v)[2].id })} options={[{ id: 'astm', label: 'ASTM (#)' }, { id: 'metric', label: 'Métricas (mm)' }]} />
            <Sel label="Capa inferior" value={data.cap.lowerLayer} onChange={(v) => setCap({ lowerLayer: v })} options={[{ id: 'x', label: 'Barras en X abajo' }, { id: 'y', label: 'Barras en Y abajo' }]} />
            <Sel label="Barras en X" value={data.cap.barX} onChange={(v) => setCap({ barX: v })} options={bars} />
            <Sel label="Barras en Y" value={data.cap.barY} onChange={(v) => setCap({ barY: v })} options={bars} />
            <div style={{ gridColumn: '1 / -1' }}><Check label="Con acero superior" value={data.cap.topSteel} onChange={(v) => setCap({ topSteel: v })} hint="Se diseña con los momentos negativos (pilotes en tracción)" /></div>
            {data.cap.topSteel && (
              <>
                <Sel label="Superior en X" value={data.cap.barTopX} onChange={(v) => setCap({ barTopX: v })} options={bars} />
                <Sel label="Superior en Y" value={data.cap.barTopY} onChange={(v) => setCap({ barTopY: v })} options={bars} />
              </>
            )}
            <div style={{ gridColumn: '1 / -1' }}><Check label="Ajustar el acero manualmente (separaciones)" value={data.cap.manual.on} onChange={(v) => setCap({ manual: { ...data.cap.manual, on: v } })} /></div>
            {data.cap.manual.on && (
              <>
                <Num label="Sep. inferior X" q="lencm" value={data.cap.manual.sBotX} onChange={(v) => setCap({ manual: { ...data.cap.manual, sBotX: v } })} min={0.05} />
                <Num label="Sep. inferior Y" q="lencm" value={data.cap.manual.sBotY} onChange={(v) => setCap({ manual: { ...data.cap.manual, sBotY: v } })} min={0.05} />
                {data.cap.topSteel && (
                  <>
                    <Num label="Sep. superior X" q="lencm" value={data.cap.manual.sTopX} onChange={(v) => setCap({ manual: { ...data.cap.manual, sTopX: v } })} min={0.05} />
                    <Num label="Sep. superior Y" q="lencm" value={data.cap.manual.sTopY} onChange={(v) => setCap({ manual: { ...data.cap.manual, sTopY: v } })} min={0.05} />
                  </>
                )}
                <div style={{ gridColumn: '1 / -1' }}>
                  <button className="btn small" onClick={() => {
                    const r = analyzePile({ ...data, cap: { ...data.cap, manual: { ...data.cap.manual, on: false } } });
                    const rd = (v: number | undefined, d: number) => (v && isFinite(v) ? Math.round(v * 200) / 200 : d);
                    setCap({ manual: { ...data.cap.manual, sBotX: rd(r.flexX?.det.spacing, 0.15), sBotY: rd(r.flexY?.det.spacing, 0.15), sTopX: rd(r.flexX?.top?.det.spacing, 0.2), sTopY: rd(r.flexY?.top?.det.spacing, 0.2) } });
                  }}><Wand2 size={14} /> Copiar valores del cálculo automático</button>
                </div>
              </>
            )}
            <div style={{ gridColumn: '1 / -1' }}><Check label="Armadura de control de fisuración en puntales (≥ 0.003)" value={data.cap.crackMesh} onChange={(v) => setCap({ crackMesh: v })} hint="Malla lateral que permite βs = 0.75 (si no, 0.60)" /></div>
            <Num label="f′c del cabezal" q="stress" value={data.cap.fc} onChange={(v) => setCap({ fc: v })} min={14} />
            <Num label="fy" q="stress" value={data.cap.fy} onChange={(v) => setCap({ fy: v })} min={240} />
            <Sel label="Norma de cortante" value={data.cap.code} onChange={(v) => setCap({ code: v })} options={[{ id: 'ACI318_14', label: 'ACI 318-14 / NSR-10' }, { id: 'ACI318_19', label: 'ACI 318-19' }]} />
          </div>
        </Acc>

        <Acc title="Columna" icon={<Columns3 size={18} />}>
          <ColumnEditor col={pseudoCol} setCol={(patch) => set({ column: { geom: patch.geom ?? data.column.geom, x: patch.x ?? data.column.x, y: patch.y ?? data.column.y } })} />
        </Acc>

        <Acc title="Cargas (envolvente ES / EU)" icon={<Layers size={18} />} open>
          <CombosEditor data={data} onChange={onChange} />
        </Acc>

        <Acc title="Suelo y capacidad del pilote" icon={<Mountain size={18} />}>
          <GeoEditor data={data} onChange={onChange} />
        </Acc>
      </div>

      <div className="stack right" style={{ minWidth: 0 }}>
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { id: 'planta', label: 'Planta y reacciones', icon: <Eye size={16} /> },
            { id: 'resultados', label: 'Resultados', icon: <ListChecks size={16} /> },
            { id: 'stm', label: 'Puntales y tirantes', icon: <Network size={16} /> },
            { id: 'suelo', label: 'Suelo y efectos', icon: <Waves size={16} /> },
            { id: 'armado', label: 'Armado', icon: <Grid3x3 size={16} /> },
            { id: 'memoria', label: 'Memoria de cálculo', icon: <FileText size={16} /> },
          ]}
        />
        {!res && <Alert>No fue posible calcular con los datos actuales.</Alert>}
        {res && tab === 'planta' && (
          <>
            <div className="draw">
              <div className="draw-tools">
                <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <span className="hint">Combinación</span>
                  <div className="inp" style={{ minWidth: 190 }}>
                    <select value={combo?.combo.id ?? ''} onChange={(e) => setComboId(e.target.value)}>
                      {res.service.map((s) => <option key={s.combo.id} value={s.combo.id}>{s.combo.name}</option>)}
                    </select>
                  </div>
                </label>
                <span className="spacer" />
                <span className="hint">Verde = poco cargado · rojo = en el límite · azul = tracción</span>
              </div>
              <div dangerouslySetInnerHTML={{ __html: pilePlanSvg(data, res, { W: 820, H: 560, theme: th, fmt, combo }) }} />
            </div>
            <div className="draw"><div dangerouslySetInnerHTML={{ __html: pileSectionSvg(data, res, { W: 820, H: 480, theme: th, fmt }) }} /></div>
          </>
        )}
        {res && tab === 'resultados' && (
          <>
            <div className={'banner ' + (res.ok ? 'ok' : 'bad')}>
              {res.ok ? <CheckCircle2 /> : <XCircle />}
              {res.ok ? 'El grupo de pilotes y el cabezal cumplen todas las verificaciones.' : 'Alguna verificación NO se cumple.'}
              <span className="spacer" />
              <button className="btn small primary" disabled={!!busy} title="Elige n.º de pilotes, espesor y acero" onClick={() => run('a', () => { const r = autoSizePile(data); onChange(r.input); if (!r.ok) alert(r.note); })}>
                <Wand2 size={14} /> Dimensionar automáticamente
              </button>
              <button className="btn small" disabled={!!busy} onClick={() => run('h', () => { const h = findCapDesign(data, true); if (h) set({ cap: { ...data.cap, h: h.h, barX: h.bar, barY: h.bar, barTopX: h.bar, barTopY: h.bar } }); else alert('No se encontró un espesor que cumpla hasta 3.5 m.'); })}>
                <Wand2 size={14} /> Espesor mínimo del cabezal
              </button>
            </div>
            {res.warnings.length > 0 && <div className="stack" style={{ gap: 8 }}>{res.warnings.map((w, i) => <Alert key={i}>{w}</Alert>)}</div>}
            <Card title="Verificaciones" icon={<ListChecks size={18} />}>
              <div className="checks">{res.checks.map((c, i) => <CheckCard key={i} name={c.name} ratio={c.ratio} ok={c.ok} detail={c.detail} advisory={c.advisory} />)}</div>
            </Card>
            <TensionCard res={res} data={data} />
            <PileResultTables res={res} data={data} />
          </>
        )}
        {res && tab === 'stm' && res.stm && (
          <>
            <div className={'banner ' + (res.deep ? 'ok' : 'ok')} style={{ background: res.deep ? undefined : undefined }}>
              <Network />
              {res.deep ? `Cabezal profundo (a/d = ${res.stm.aOverD.toFixed(2)} < 2): rige el método de puntales y tirantes (ACI 318-19, cap. 23).` : `Cabezal no profundo (a/d = ${res.stm.aOverD.toFixed(2)}): modelo de puntales y tirantes informativo.`}
            </div>
            <div className="grid3" style={{ gap: 12 }}>
              <Kpi label="Brazo interno z" value={fmt.u('len', res.stm.z, 2)} sub={`nodo superior ${fmt.n('len', res.stm.ay, 2)} m`} />
              <Kpi label="Tirantes Tx / Ty" value={`${fmt.n('force', res.stm.tieX.T, 0)} / ${fmt.n('force', res.stm.tieY.T, 0)}`} sub={fmt.l('force')} />
              <Kpi label="Combinación" value={res.stm.combo} sub={`βs ${res.stm.betaS.toFixed(2)} · βn pilote ${res.stm.betaNPile}`} />
            </div>
            <div className="draw"><div dangerouslySetInnerHTML={{ __html: pileStmElevationSvg(data, res, { axis: 'x', W: 820, H: 470, theme: th, fmt }) }} /></div>
            <div className="draw"><div dangerouslySetInnerHTML={{ __html: pileStmElevationSvg(data, res, { axis: 'y', W: 820, H: 470, theme: th, fmt }) }} /></div>
            <div className="draw"><div dangerouslySetInnerHTML={{ __html: pileStmPlanSvg(data, res, { W: 820, H: 560, theme: th, fmt }) }} /></div>
            <Card title="Puntales" icon={<Network size={18} />}>
              <Tbl
                head={['Pilote', `R (${fmt.l('force')})`, 'θ (°)', `C (${fmt.l('force')})`, 'Acs col (m²)', 'Acs pilote (m²)', `φFns (${fmt.l('force')})`, 'Relación']}
                align={['c', 'r', 'r', 'r', 'r', 'r', 'r', 'r']}
                rows={res.stm.struts.map((q) => [String(q.i + 1), fmt.n('force', q.R, 0), ((q.theta * 180) / Math.PI).toFixed(1), fmt.n('force', q.C, 0), q.AcsCol.toFixed(3), q.AcsPile.toFixed(3), fmt.n('force', q.phiFns, 0), q.ratio.toFixed(2)])}
              />
            </Card>
            <Card title="Tirantes (bandas de pilotes)" icon={<Grid3x3 size={18} />}>
              <Tbl
                head={['Tirante', 'Posición (m)', `T (${fmt.l('force')})`, 'Ancho (m)', 'As colocado (cm²)', `φTn (${fmt.l('force')})`, 'Relación']}
                align={['l', 'r', 'r', 'r', 'r', 'r', 'r']}
                rows={[res.stm.tieX, res.stm.tieY].flatMap((t) => t.bands.map((b) => [t.axis.toUpperCase(), b.pos.toFixed(2), fmt.n('force', b.T, 0), b.width.toFixed(2), b.asProv.toFixed(1), fmt.n('force', b.phiTn, 0), b.ratio.toFixed(2)]))}
              />
            </Card>
          </>
        )}
        {res && tab === 'suelo' && (
          <>
            <div className="draw"><div dangerouslySetInnerHTML={{ __html: pileProfileSvg(data, res, { W: 760, H: 520, theme: th, fmt }) }} /></div>
            <Card title="Asentamiento" icon={<Waves size={18} />}>
              {res.settle ? (
                <>
                  <div className="grid3" style={{ gap: 12 }}>
                    <Kpi label="Grupo" value={`${(res.settle.group.total * 1000).toFixed(1)} mm`} sub={`admisible ${(data.geo.sAllow * 1000).toFixed(0)} mm`} />
                    <Kpi label="Pilote individual" value={`${(res.settle.pile.total * 1000).toFixed(1)} mm`} sub={`elást. ${(res.settle.pile.de * 1000).toFixed(1)} · punta ${(res.settle.pile.dp * 1000).toFixed(1)} · fuste ${(res.settle.pile.ds * 1000).toFixed(1)}`} />
                    <Kpi label="Zapata equivalente" value={`${res.settle.group.Beq.toFixed(1)} × ${res.settle.group.Leq.toFixed(1)} m`} sub={`a ${res.settle.group.zRaft.toFixed(1)} m`} />
                  </div>
                  <div className="draw" style={{ marginTop: 10 }}><div dangerouslySetInnerHTML={{ __html: settlementChartSvg(res, { W: 640, H: 380, theme: th, fmt }) }} /></div>
                </>
              ) : <Alert>Agregue estratos para calcular el asentamiento.</Alert>}
            </Card>
            <Card title="Fricción negativa" icon={<Mountain size={18} />}>
              {res.geo.mode === 'static' && res.geo.Qneg > 0 ? (
                <div className="grid3" style={{ gap: 12 }}>
                  <Kpi label="Qneg" value={fmt.u('force', res.geo.Qneg, 0)} sub={`plano neutro a ${(data.geo.neutralFrac * 100).toFixed(0)} % de L`} />
                  <Kpi label="Qa bajo el plano neutro" value={fmt.u('force', res.geo.QaDD, 0)} sub={`Qa normal ${fmt.n('force', res.geo.QaC, 0)}`} />
                </div>
              ) : <span className="hint">Marque «arrastre» en los estratos que se consolidan o rellenan para considerar la fricción negativa.</span>}
            </Card>
            <Card title="Licuación" icon={<Waves size={18} />}>
              {res.liq.enabled && res.liq.rows.length ? (
                <>
                  <Tbl
                    head={['Estrato', 'z (m)', 'CSR', '(N1)60cs', 'CRR·MSF', 'FS', 'Resultado']}
                    align={['l', 'r', 'r', 'r', 'r', 'r', 'c']}
                    rows={res.liq.rows.map((r) => [r.name, r.zGround.toFixed(1), r.CSR.toFixed(3), r.N1cs.toFixed(1), (r.CRR * r.MSF).toFixed(3), r.FS.toFixed(2), r.liquefies ? 'Licúa' : 'No licúa'])}
                  />
                  <div className="hint" style={{ margin: '8px 0' }}>Espesor licuable {res.liq.Lliq.toFixed(1)} m · asentamiento del terreno ≈ {(res.liq.settlement * 1000).toFixed(0)} mm</div>
                  <div className="draw"><div dangerouslySetInnerHTML={{ __html: liquefactionChartSvg(res, { W: 640, H: 400, theme: th }) }} /></div>
                </>
              ) : <span className="hint">Active «Evaluar licuación» en «Suelo y capacidad del pilote» y marque los estratos susceptibles.</span>}
            </Card>
            <Card title="Efecto de grupo lateral (p-múltiples)" icon={<Layers size={18} />}>
              {(() => {
                const lat = res.ultimate.filter((q) => q.H > 0).reduce<any>((a, b) => (!a || b.Mmax > a.Mmax ? b : a), null);
                return lat ? (
                  <>
                    <div className="hint" style={{ marginBottom: 6 }}>{lat.combo.name}: H = {fmt.u('force', lat.H, 1)} · Mu máx = {fmt.u('moment', lat.Mmax, 1)}</div>
                    <Tbl head={['Pilote', 'p', `H (${fmt.l('force')})`]} align={['c', 'r', 'r']} rows={lat.pm.map((m: number, i: number) => [String(i + 1), m.toFixed(2), fmt.n('force', lat.Hi[i], 1)])} />
                  </>
                ) : <span className="hint">Sin cargas horizontales.</span>;
              })()}
            </Card>
          </>
        )}
        {res && tab === 'armado' && (
          <>
            <Card title="Cuadro de armado" icon={<Grid3x3 size={18} />}>
              <Tbl
                head={['Elemento', 'Armado', 'As (cm²)']}
                align={['l', 'l', 'r']}
                rows={[
                  ['Cabezal — inferior X', res.flexX!.det.text, res.flexX!.asProv.toFixed(1)],
                  ['Cabezal — inferior Y', res.flexY!.det.text, res.flexY!.asProv.toFixed(1)],
                  ...(res.flexX?.top ? [['Cabezal — superior X', res.flexX.top.det.text, res.flexX.top.asProv.toFixed(1)], ['Cabezal — superior Y', res.flexY!.top!.det.text, res.flexY!.top!.asProv.toFixed(1)]] : []),
                  p.kind === 'concrete' ? ['Pilote — longitudinal', `${p.nBars} ${p.bar}`, res.conc!.ratio.Ast.toFixed(1)] : ['Pilote', res.props.label, (res.props.A * 1e4).toFixed(1)],
                  ...(p.kind === 'concrete' ? [['Pilote — transversal', `${p.tieBar} @ ${(p.tieS * 100).toFixed(0)} cm (${p.spiral ? 'espiral' : 'estribos'})`, '—']] : []),
                ]}
              />
            </Card>
            <div className="draw"><div dangerouslySetInnerHTML={{ __html: pileRebarPlanSvg(data, res, { W: 820, H: 560, theme: th, fmt }) }} /></div>
            {data.cap.topSteel && <div className="draw"><div dangerouslySetInnerHTML={{ __html: pileRebarPlanSvg(data, res, { W: 820, H: 560, theme: th, fmt, layer: 'top' }) }} /></div>}
          </>
        )}
        {res && tab === 'memoria' && <ReportButtons kind="pile" pile={data} info={info} />}
      </div>
    </div>
  );
}

function TensionCard({ res, data }: { res: PileResults; data: PileInput }) {
  const { fmt } = useUnits();
  const t = res.tension;
  return (
    <Card title="Revisión de pilotes en tracción" icon={<Pickaxe size={18} />}>
      {!t.any ? (
        <span className="hint">Ningún pilote trabaja a tracción en las combinaciones ingresadas. Si hay momentos grandes o cargas de levantamiento, aparecerá aquí la revisión.</span>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          <Tbl
            head={['Combinación (servicio)', `T máx (${fmt.l('force')})`, `Qta adm. (${fmt.l('force')})`, 'Relación']}
            align={['l', 'r', 'r', 'r']}
            rows={t.service.map((r) => [r.name, fmt.n('force', r.T, 0), fmt.n('force', r.Qta, 0), r.ratio.toFixed(2)])}
          />
          <Tbl
            head={['Verificación', 'Demanda', 'Capacidad', 'Relación']}
            align={['l', 'r', 'r', 'r']}
            rows={[
              ['Tracción pura del pilote (última)', fmt.u('force', t.Tu, 0), fmt.u('force', t.phiTn, 0), t.ratioTn.toFixed(2)],
              data.pile.kind === 'concrete'
                ? ['Anclaje de barras en el cabezal', `ld ${(t.anchor.ld! * 100).toFixed(0)} / ldh ${(t.anchor.ldh! * 100).toFixed(0)} cm`, `disp. ${(t.anchor.avail! * 100).toFixed(0)} cm`, t.anchor.ratio.toFixed(2)]
                : ['Pernos de transferencia Ø19', `${Math.ceil(t.anchor.req ?? 0)} requeridos`, `${t.anchor.prov} colocados`, t.anchor.ratio.toFixed(2)],
              ...(t.pull ? [[`Extracción por punzonamiento (pilote ${t.pull.pile})`, `${t.pull.vu.toFixed(2)} MPa`, `${t.pull.phivc.toFixed(2)} MPa`, t.pull.ratio.toFixed(2)]] : []),
              ...(t.block ? [[`Levantamiento del grupo (${t.block.combo})`, fmt.u('force', t.block.Tgroup, 0), fmt.u('force', t.block.resist, 0), t.block.ratio.toFixed(2)]] : []),
            ]}
          />
          {t.anchor.kind === 'bars' && <span className="hint">{t.anchor.text}</span>}
        </div>
      )}
    </Card>
  );
}

/** Elimina vértices colineales o casi colineales (p. ej. al convertir un círculo). */
function simplifyPoly(p: { x: number; y: number }[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const a = p[(i + n - 1) % n], b = p[i], c = p[(i + 1) % n];
    const cr = Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x));
    if (cr > 1e-6) out.push(b);
  }
  if (out.length > 24) return out.filter((_, i) => i % Math.ceil(out.length / 24) === 0);
  return out.length >= 3 ? out : p;
}

function PileResultTables({ res, data }: { res: PileResults; data: PileInput }) {
  const { fmt } = useUnits();
  return (
    <>
      <div className="grid3" style={{ gap: 12 }}>
        <Kpi label="Pilotes" value={`${res.n} × ${res.props.label}`} sub={`L = ${data.pile.L} m`} />
        <Kpi label="Qa por pilote" value={fmt.u('force', res.QaCeff, 0)} sub={res.geo.mode === 'static' ? `Qs ${fmt.n('force', res.geo.Qs, 0)} + Qb ${fmt.n('force', res.geo.Qb, 0)}` : 'ingresada'} />
        <Kpi label="Cabezal" value={`${res.capRect.B.toFixed(2)} × ${res.capRect.L.toFixed(2)} × ${data.cap.h.toFixed(2)} m`} sub={`${res.concreteVolume.toFixed(1)} m³`} />
      </div>
      <Card title="Reacciones de servicio" icon={<Mountain size={18} />}>
        <Tbl
          head={['Combinación', `Ptot (${fmt.l('force')})`, `R máx (${fmt.l('force')})`, `R mín (${fmt.l('force')})`, `Qa adm. (${fmt.l('force')})`, 'R máx / Qa']}
          align={['l', 'r', 'r', 'r', 'r', 'r']}
          rows={res.service.map((s) => [s.combo.name, fmt.n('force', s.Ptot, 0), fmt.n('force', s.Rmax, 0), fmt.n('force', s.Rmin, 0), fmt.n('force', res.QaCeff * s.combo.qaFactor, 0), s.ratioC.toFixed(2)])}
        />
      </Card>
      <Card title="Reacciones últimas y flexión del pilote" icon={<Layers size={18} />}>
        <Tbl
          head={['Combinación', `Pu máx (${fmt.l('force')})`, `Pu mín (${fmt.l('force')})`, `Hu/pilote (${fmt.l('force')})`, `Mu cabeza (${fmt.l('moment')})`]}
          align={['l', 'r', 'r', 'r', 'r']}
          rows={res.ultimate.map((s) => [s.combo.name, fmt.n('force', s.Pu?.max ?? 0, 0), fmt.n('force', s.Pu?.min ?? 0, 0), fmt.n('force', s.Hpile, 1), fmt.n('moment', s.Mu ?? 0, 1)])}
        />
      </Card>
      <Card title="Cabezal: flexión, cortante y punzonamiento" icon={<Grid3x3 size={18} />}>
        <Tbl
          head={['Verificación', 'Demanda', 'Capacidad / provisto', 'Relación']}
          align={['l', 'r', 'r', 'r']}
          rows={[
            ...([['X', res.flexX], ['Y', res.flexY]] as const).map(([a, f]) => [`Flexión ${a}: ${f!.det.text}`, `Mu ${fmt.n('moment', f!.Mpos, 0)} ${fmt.l('moment')}`, `As ${f!.AsReq.toFixed(1)} → ${f!.asProv.toFixed(1)} cm²`, f!.ratio.toFixed(2)]),
            ...([['X', res.shearX], ['Y', res.shearY]] as const).map(([a, s]) => [`Cortante ${a}`, `Vu ${fmt.n('force', s!.Vu, 0)} ${fmt.l('force')}`, `φVc ${fmt.n('force', s!.phiVc, 0)}`, s!.ratio.toFixed(2)]),
            ...(res.punch ? [['Punzonamiento columna', `vu ${res.punch.vu.toFixed(2)} MPa`, `φvc ${res.punch.phivc.toFixed(2)} MPa`, res.punch.ratio.toFixed(2)]] : []),
          ]}
        />
      </Card>
    </>
  );
}

function CombosEditor({ data, onChange }: { data: PileInput; onChange: (f: PileInput) => void }) {
  const { fmt } = useUnits();
  const upd = (id: string, patch: Partial<PileCombo>) => onChange({ ...data, combos: data.combos.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const add = (kind: 'service' | 'ultimate') => onChange({ ...data, combos: [...data.combos, { id: 'C' + Date.now().toString(36), name: kind === 'service' ? 'ES nueva' : 'EU nueva', kind, P: 0, Vx: 0, Vy: 0, Mx: 0, My: 0, qaFactor: 1 }] });
  return (
    <>
      <div className="hint">Cargas de la columna en la cara superior del cabezal. <b>ES</b> (servicio): capacidad del suelo y deflexión; <b>EU</b> (última): diseño estructural. P positiva hacia abajo; Mx / My aumentan la reacción hacia +y / +x.</div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Combinación</th><th>Tipo</th><th className="r">P ({fmt.l('force')})</th><th className="r">Vx</th><th className="r">Vy</th><th className="r">Mx ({fmt.l('moment')})</th><th className="r">My</th><th className="r">Qa×</th><th title="Combinación con sismo (condición licuada)">Sismo</th><th /></tr>
          </thead>
          <tbody>
            {data.combos.map((c) => (
              <tr key={c.id}>
                <td><CellText value={c.name} onChange={(v) => upd(c.id, { name: v })} /></td>
                <td>
                  <select value={c.kind} onChange={(e) => upd(c.id, { kind: e.target.value as any })} style={{ border: 0, background: 'transparent' }}>
                    <option value="service">ES</option>
                    <option value="ultimate">EU</option>
                  </select>
                </td>
                <td><CellNum q="force" value={c.P} onChange={(v) => upd(c.id, { P: v })} decimals={1} /></td>
                <td><CellNum q="force" value={c.Vx} onChange={(v) => upd(c.id, { Vx: v })} decimals={1} /></td>
                <td><CellNum q="force" value={c.Vy} onChange={(v) => upd(c.id, { Vy: v })} decimals={1} /></td>
                <td><CellNum q="moment" value={c.Mx} onChange={(v) => upd(c.id, { Mx: v })} decimals={1} /></td>
                <td><CellNum q="moment" value={c.My} onChange={(v) => upd(c.id, { My: v })} decimals={1} /></td>
                <td>{c.kind === 'service' ? <CellNum value={c.qaFactor} onChange={(v) => upd(c.id, { qaFactor: v })} decimals={2} /> : '—'}</td>
                <td style={{ textAlign: 'center' }}><input type="checkbox" checked={!!c.eq} onChange={(e) => upd(c.id, { eq: e.target.checked })} /></td>
                <td><button className="icon-btn danger" onClick={() => onChange({ ...data, combos: data.combos.filter((x) => x.id !== c.id) })}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn small" onClick={() => add('service')}><Plus size={14} /> ES (servicio)</button>
        <button className="btn small" onClick={() => add('ultimate')}><Plus size={14} /> EU (última)</button>
        <button className="btn small ghost" onClick={() => onChange({ ...data, combos: defaultCombos() })}>Restablecer</button>
      </div>
    </>
  );
}

function GeoEditor({ data, onChange }: { data: PileInput; onChange: (f: PileInput) => void }) {
  const g = data.geo;
  const set = (patch: Partial<typeof g>) => onChange({ ...data, geo: { ...g, ...patch } });
  const updL = (i: number, patch: Partial<SoilLayer>) => set({ layers: g.layers.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  // estratos contraídos por defecto para que la lista no se alargue
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const toggle = (i: number) => setOpen((o) => ({ ...o, [i]: !o[i] }));
  const setAll = (v: boolean) => setOpen(Object.fromEntries(g.layers.map((_, i) => [i, v])));
  const kindLabel = (l: SoilLayer) => (l.kind === 'cohesive' ? `cohesivo, su = ${l.su}` : l.kind === 'granular' ? `granular, φ = ${l.phi}°` : l.kind === 'rock' ? `roca, qu = ${l.qu} MPa` : `fs = ${l.fs}`);
  return (
    <>
      <Sel label="Capacidad del pilote" value={g.mode} onChange={(v) => set({ mode: v })} options={[{ id: 'static', label: 'Método estático (estratos)' }, { id: 'user', label: 'Admisible dada por el estudio de suelos' }]} />
      {g.mode === 'user' ? (
        <div className="grid2">
          <Num label="Qa a compresión" q="force" value={g.QaC} onChange={(v) => set({ QaC: v })} min={10} />
          <Num label="Qta a tracción" q="force" value={g.QaT} onChange={(v) => set({ QaT: v })} min={0} />
        </div>
      ) : (
        <>
          <div className="grid2">
            <Num label="FS a compresión" value={g.FS} onChange={(v) => set({ FS: v })} min={1} />
            <Num label="FS a tracción" value={g.FSt} onChange={(v) => set({ FSt: v })} min={1} />
            <Num label="η fricción en tracción" value={g.etaT} onChange={(v) => set({ etaT: v })} min={0} max={1} />
            <Num label="Prof. base del cabezal Df" q="len" value={g.Df} onChange={(v) => set({ Df: v })} min={0} />
            <Num label="qb máximo" q="press" value={g.qbMax} onChange={(v) => set({ qbMax: v })} min={100} />
            <Num label="Asentamiento admisible del grupo" unit="mm" value={+(g.sAllow * 1000).toFixed(1)} onChange={(v) => set({ sAllow: v / 1000 })} min={5} />
            <Num label="Punta en roca: fracción movilizada" value={g.socketQbMob} onChange={(v) => set({ socketQbMob: v })} min={0} max={1} hint="Compatibilidad fuste–punta en servicio" />
            <Num label="Plano neutro (fracción de L)" value={g.neutralFrac} onChange={(v) => set({ neutralFrac: v })} min={0.3} max={1} hint="Fricción negativa en estratos marcados «arrastre»" />
          </div>
          <Check label="Evaluar licuación (Seed–Idriss)" value={g.liqOn} onChange={(v) => set({ liqOn: v })} hint="Marque los estratos arenosos susceptibles e ingrese (N1)60 y finos" />
          {g.liqOn && (
            <div className="grid3">
              <Num label="Nivel freático (desde el terreno)" q="len" value={g.gwt} onChange={(v) => set({ gwt: v })} min={0} />
              <Num label="amax" unit="g" value={g.amax} onChange={(v) => set({ amax: v })} min={0.05} max={1} />
              <Num label="Magnitud Mw" value={g.Mw} onChange={(v) => set({ Mw: v })} min={5} max={9} />
              <Num label="FS mínimo" value={g.fsLiq} onChange={(v) => set({ fsLiq: v })} min={1} />
              <Num label="Fricción residual licuada" value={g.liqResid} onChange={(v) => set({ liqResid: v })} min={0} max={1} hint="Fracción de fs que se conserva" />
            </div>
          )}
          {g.layers.map((l, i) => (
            <div key={i} className="card" style={{ padding: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="icon-btn" title={open[i] ? 'Contraer' : 'Expandir'} onClick={() => toggle(i)}>{open[i] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                <div style={{ flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={() => !open[i] && toggle(i)}>
                  {open[i] ? <Txt label={`Estrato ${i + 1}`} value={l.name} onChange={(v) => updL(i, { name: v })} /> : (
                    <div>
                      <b style={{ fontSize: 13 }}>{i + 1}. {l.name}</b>
                      <div className="hint">{l.thk} m · {kindLabel(l)}{l.downdrag ? ' · arrastre' : ''}{g.liqOn && l.liq ? ' · licuable' : ''}</div>
                    </div>
                  )}
                </div>
                <button className="icon-btn danger" title="Quitar" onClick={() => set({ layers: g.layers.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
              </div>
              {open[i] && (<>
              <div className="grid3">
                <Sel label="Tipo" value={l.kind} onChange={(v) => updL(i, { kind: v })} options={[{ id: 'cohesive', label: 'Cohesivo (α·su)' }, { id: 'granular', label: 'Granular (K·tanδ)' }, { id: 'rock', label: 'Roca (socket)' }, { id: 'direct', label: 'fs directo' }]} />
                <Num label="Espesor" q="len" value={l.thk} onChange={(v) => updL(i, { thk: v })} min={0.5} />
                <Num label="γ efectivo" q="uw" value={l.gamma} onChange={(v) => updL(i, { gamma: v })} min={1} />
                {l.kind === 'cohesive' && (
                  <>
                    <Num label="su" q="press" value={l.su} onChange={(v) => updL(i, { su: v })} min={1} />
                    <Num label="α (0 = API)" value={l.alpha} onChange={(v) => updL(i, { alpha: v })} min={0} max={1.2} />
                  </>
                )}
                {l.kind === 'granular' && (
                  <>
                    <Num label="φ" unit="°" value={l.phi} onChange={(v) => updL(i, { phi: v })} min={20} max={45} />
                    <Num label="K" value={l.K} onChange={(v) => updL(i, { K: v })} min={0.2} />
                    <Num label="Nq (0 = auto)" value={l.Nq} onChange={(v) => updL(i, { Nq: v })} min={0} />
                  </>
                )}
                {l.kind === 'rock' && (
                  <>
                    <Num label="qu (roca intacta)" q="stress" value={l.qu} onChange={(v) => updL(i, { qu: v })} min={1} />
                    <Num label="RQD" unit="%" value={l.rqd} onChange={(v) => updL(i, { rqd: v })} min={0} max={100} />
                    <Sel label="Superficie del socket" value={l.rough ? 'r' : 's'} onChange={(v) => updL(i, { rough: v === 'r' })} options={[{ id: 'r', label: 'Rugosa (Horvath–Kenney)' }, { id: 's', label: 'Lisa (Rowe–Armitage)' }]} />
                    <Num label="Espaciamiento de juntas" q="len" value={l.jointS} onChange={(v) => updL(i, { jointS: v })} min={0.02} />
                    <Num label="Abertura de juntas" unit="mm" value={l.aperture} onChange={(v) => updL(i, { aperture: v })} min={0} />
                  </>
                )}
                {l.kind === 'direct' && (
                  <>
                    <Num label="fs" q="press" value={l.fs} onChange={(v) => updL(i, { fs: v })} min={0} />
                    <Num label="qb (si es la punta)" q="press" value={l.qb} onChange={(v) => updL(i, { qb: v })} min={0} />
                  </>
                )}
                <Num label="fs máx" q="press" value={l.fsMax} onChange={(v) => updL(i, { fsMax: v })} min={5} />
                <Num label={l.kind === 'rock' ? 'Em (macizo rocoso)' : 'Es (deformación)'} q="press" value={l.Es} onChange={(v) => updL(i, { Es: v })} min={500} />
                <Num label="Cc (0 = usar Es)" value={l.Cc} onChange={(v) => updL(i, { Cc: v })} min={0} />
                <Num label="e0" value={l.e0} onChange={(v) => updL(i, { e0: v })} min={0.2} />
                {g.liqOn && l.liq && (
                  <>
                    <Num label="(N1)60" value={l.N160} onChange={(v) => updL(i, { N160: v })} min={0} />
                    <Num label="Finos FC" unit="%" value={l.FC} onChange={(v) => updL(i, { FC: v })} min={0} max={100} />
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 6 }}>
                <Check label="Arrastre (fricción negativa)" value={l.downdrag} onChange={(v) => updL(i, { downdrag: v })} />
                {g.liqOn && <Check label="Susceptible a licuación" value={l.liq} onChange={(v) => updL(i, { liq: v })} />}
              </div>
              </>)}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn small" onClick={() => { setOpen((o) => ({ ...o, [g.layers.length]: true })); set({ layers: [...g.layers, { ...defaultLayers()[1], name: `Estrato ${g.layers.length + 1}` }] }); }}><Plus size={14} /> Estrato</button>
            <button className="btn small ghost" onClick={() => setAll(false)}>Contraer todos</button>
            <button className="btn small ghost" onClick={() => setAll(true)}>Expandir todos</button>
          </div>
        </>
      )}
      <Check label="Aplicar eficiencia de grupo (Converse–Labarre)" value={g.groupEff} onChange={(v) => set({ groupEff: v })} hint="Recomendado para pilotes de fricción en arcilla" />
    </>
  );
}
