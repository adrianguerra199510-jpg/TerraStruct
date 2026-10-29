import React, { useMemo, useState } from 'react';
import {
  Settings2, Wand2, Mountain, Waves, Activity, Layers, Ruler, ListChecks, CheckCircle2, XCircle, Eye, Grid3x3, FileText, BrickWall, Boxes, Scale, Hammer, Plus, Trash2,
} from 'lucide-react';
import { BLOCKS, gabionWidths, WallInput, WALL_TYPES, WallType, defaultWall, hasHeelSlab, canPool, isCounterfort, isGravity, isMasonry, isMasonryStem, cfInternal, defaultCrownBeam, CrownBeam } from '../core/wallTypes';
import { analyzeWall, WallResults } from '../core/wall';
import { barList } from '../core/materials';
import { Acc, Alert, Card, Check, CheckCard, Kpi, Num, Sel, StatusChip, Tabs, Tbl, Txt, useUnits } from './common';
import { wallDiagramFigures, wallElevationSvg, wallPlanSvg, wallSectionSvg, wallTypeIcon } from '../draw/wallDraw';
import { DARK, LIGHT, lineChart } from '../draw/svg';
import { ReportButtons } from './ReportButtons';
import { ProjectInfo } from '../state';
import { CaseResult } from '../core/wallStability';

const SPACINGS = [{ id: '0', label: 'Automática' }, ...[0.2, 0.4, 0.6, 0.8, 1.0, 1.2].map((v) => ({ id: String(v), label: `${v * 100} cm` }))];

type Tab = 'seccion' | 'estabilidad' | 'diseno' | 'diagramas' | 'armado' | 'memoria';

export function WallPage({ data, onChange, theme, info }: { data: WallInput; onChange: (w: WallInput) => void; theme: 'light' | 'dark'; info: ProjectInfo }) {
  const [tab, setTab] = useState<Tab>('seccion');
  const [poolView, setPoolView] = useState<'vacia' | 'llena' | 'llenaSinRelleno'>('llena');
  const res = useMemo(() => {
    try {
      return analyzeWall(data, poolView);
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [data, poolView]);
  const set = (patch: Partial<WallInput>) => onChange({ ...data, ...patch });
  const th = theme === 'dark' ? DARK : LIGHT;
  const t = data.type;
  const bars = barList(data.mat.barSystem).map((b) => ({ id: b.id, label: b.label }));
  const setMat = (p: Partial<WallInput['mat']>) => set({ mat: { ...data.mat, ...p } });
  const setFill = (p: Partial<WallInput['fill']>) => set({ fill: { ...data.fill, ...p } });
  const setFound = (p: Partial<WallInput['found']>) => set({ found: { ...data.found, ...p } });
  const setFac = (p: Partial<WallInput['factors']>) => set({ factors: { ...data.factors, ...p } });
  const setMesh = (p: Partial<WallInput['mat']['mesh']>) => set({ mat: { ...data.mat, mesh: { ...data.mat.mesh, ...p } } });
  const setRb = (p: Partial<WallInput['cf']['rb']>) => set({ cf: { ...data.cf, rb: { ...data.cf.rb, ...p } } });
  const setGab = (p: Partial<WallInput['gab']>) => set({ gab: { ...data.gab, ...p } });

  return (
    <div className="split">
      <div className="left stack">
        <Acc title="Tipología del muro" icon={<BrickWall size={18} />} open>
          <div className="type-grid">
            {WALL_TYPES.map((w) => (
              <button
                key={w.id}
                className={'type-card' + (t === w.id ? ' on' : '')}
                onClick={() => {
                  const d = defaultWall(w.id);
                  // se conservan nombre, suelos, sismo y materiales; se cambia la geometría
                  onChange({ ...d, name: data.name, fill: data.fill, found: data.found, hw: data.hw, seismic: data.seismic, passive: data.passive, mat: { ...d.mat, fc: data.mat.fc, fy: data.mat.fy, barSystem: data.mat.barSystem, code: data.mat.code } });
                }}
              >
                <div dangerouslySetInnerHTML={{ __html: wallTypeIcon(w.id) }} />
                <b>{w.short}</b>
                <span>{w.desc}</span>
              </button>
            ))}
          </div>
          <Txt label="Nombre del muro" value={data.name} onChange={(v) => set({ name: v })} />
        </Acc>

        <Acc title="Geometría" icon={<Ruler size={18} />} open>
          {t === 'gabion' ? (
            <>
              <div className="grid2">
                <Num label="Número de cuerpos" value={data.gab.n} onChange={(v) => setGab({ n: Math.max(1, Math.round(v)) })} min={1} max={12} />
                <Num label="Altura de cada cuerpo" q="len" value={data.gab.hc} onChange={(v) => setGab({ hc: v })} min={0.3} hint="Usual: 0.5 o 1.0 m" />
                <Num label="Ancho del cuerpo inferior" q="len" value={data.gab.b0} onChange={(v) => setGab({ b0: v })} min={0.5} />
                <Num label="Reducción de ancho por cuerpo" q="len" value={data.gab.step} onChange={(v) => setGab({ step: v })} min={0} />
                <Sel label="Escalonado" value={data.gab.side} onChange={(v) => setGab({ side: v })} options={[{ id: 'front', label: 'En el frente (dorso vertical)' }, { id: 'back', label: 'En el dorso (frente vertical)' }, { id: 'both', label: 'En ambos lados' }]} />
                <Num label="Altura de terreno al frente Df" q="len" value={data.Df} onChange={(v) => set({ Df: v })} min={0} hint="Empotramiento del primer cuerpo" />
              </div>
              <div className="hint"><b>Material de las canastas</b></div>
              <div className="grid2">
                <Num label="Peso unitario de la piedra" q="uw" value={data.gab.gammaStone} onChange={(v) => setGab({ gammaStone: v })} />
                <Num label="Porosidad del relleno" value={data.gab.porosity} onChange={(v) => setGab({ porosity: v })} min={0.1} max={0.6} hint="Usual 0.30–0.40" />
                <Num label="Esfuerzo admisible de la sección" q="press" value={data.gab.sigmaAllow} onChange={(v) => setGab({ sigmaAllow: v })} min={50} />
                <Num label="Fricción entre cuerpos μ" value={data.gab.muG} onChange={(v) => setGab({ muG: v })} min={0.2} max={1} />
                <Num label="Cohesión entre cuerpos" q="press" value={data.gab.cG} onChange={(v) => setGab({ cG: v })} min={0} />
                <Num label="FS deslizamiento entre cuerpos" value={data.gab.fsSlide} onChange={(v) => setGab({ fsSlide: v })} min={1} />
                <Num label="Excentricidad admisible / ancho" value={data.gab.eFrac} onChange={(v) => setGab({ eFrac: v })} min={0.1} max={0.5} hint="1/6 = tercio medio; 1/3 usual en gaviones" />
              </div>
              <div className="hint">Altura total H = {data.gab.n * data.gab.hc} m; peso unitario del gavión = γ·(1 − n) = {(data.gab.gammaStone * (1 - data.gab.porosity)).toFixed(1)} kN/m³. Sin zapata: los cuerpos apoyan directamente sobre el suelo.</div>
            </>
          ) : (
            <>
          <div className="grid2">
            <Num label="Altura de la pantalla H" q="len" value={data.H} onChange={(v) => set({ H: v })} min={0.5} hint="De la cara superior de la zapata a la corona" />
 {isMasonryStem(t) ? (
              <>
                <Sel label="Tipo de bloque" value={data.block} onChange={(v) => set({ block: v })} options={BLOCKS.map((b) => ({ id: b.id, label: b.label }))} hint="El espesor de la pantalla es el del bloque" />
              </>
            ) : (
              <>
                <Num label="Espesor en la corona" q="len" value={data.tTop} onChange={(v) => set({ tTop: v })} min={0.1} />
                <Num label="Espesor en la base" q="len" value={data.tBot} onChange={(v) => set({ tBot: v })} min={0.1} />
              </>
            )}
            {!isMasonryStem(t) && <Sel label="Cara que se mantiene vertical" value={data.stemFace} onChange={(v) => set({ stemFace: v })} options={[{ id: 'front', label: 'Frontal (talud en el dorso)' }, { id: 'back', label: 'Posterior (talud al frente)' }, { id: 'free', label: 'Ninguna (libre)' }]} />}
            {!isMasonryStem(t) && data.stemFace === 'free' && <Num label="Desplazamiento de la cara frontal" q="len" value={data.fb} onChange={(v) => set({ fb: v })} hint="+ hacia el relleno" />}
            <Num label="Altura de terreno al frente Df" q="len" value={data.Df} onChange={(v) => set({ Df: v })} min={0} hint="Sobre la cara inferior de la zapata" />
          </div>
          <div className="grid2">
            <Num label={isGravity(t) ? 'Pie (0 = sin zapata)' : 'Longitud del pie'} q="len" value={data.Lt} onChange={(v) => set({ Lt: v })} min={0} />
            <Num label="Longitud del talón" q="len" value={data.Lh} onChange={(v) => set({ Lh: v })} min={0} />
            <Num label={isGravity(t) ? 'Espesor de zapata (0 = sin zapata)' : 'Espesor de la zapata'} q="len" value={data.hb} onChange={(v) => set({ hb: v, hbTip: Math.min(data.hbTip || v, v) || v })} min={0} />
            <Num label="Espesor en la punta del pie" q="len" value={data.hbTip} onChange={(v) => set({ hbTip: v })} min={0} hint="Menor o igual al de la zapata" />
          </div>
          {isCounterfort(t) && (
            <>
              <div className="hint"><b>{cfInternal(t) ? 'Contrafuertes internos (en el relleno)' : 'Contrafuertes externos (cara visible)'}{isMasonryStem(t) ? ' — de bloque con celdas inyectadas' : ''}</b></div>
              <div className="grid2">
                <Num label="Separación entre ejes s" q="len" value={data.cf.s} onChange={(v) => set({ cf: { ...data.cf, s: v } })} min={1} />
                <Num label="Espesor del contrafuerte" q="len" value={data.cf.t} onChange={(v) => set({ cf: { ...data.cf, t: v } })} min={0.15} />
                <Num label="Proyección en la base" q="len" value={data.cf.proj} onChange={(v) => set({ cf: { ...data.cf, proj: v } })} min={0.3} />
                <Num label="Proyección en la corona" q="len" value={data.cf.projTop} onChange={(v) => set({ cf: { ...data.cf, projTop: v } })} min={0} />
              </div>
            </>
          )}
          <Check label="Llave de corte bajo la zapata" value={data.key.enabled} onChange={(v) => set({ key: { ...data.key, enabled: v } })} />
          {data.key.enabled && (
            <div className="grid3">
              <Num label="Posición x (desde la punta)" q="len" value={data.key.x} onChange={(v) => set({ key: { ...data.key, x: v } })} min={0} />
              <Num label="Ancho" q="len" value={data.key.b} onChange={(v) => set({ key: { ...data.key, b: v } })} min={0.2} />
              <Num label="Profundidad" q="len" value={data.key.d} onChange={(v) => set({ key: { ...data.key, d: v } })} min={0.2} />
            </div>
          )}
                    </>
          )}
        </Acc>

        <Acc title="Suelos, agua y empuje" icon={<Mountain size={18} />} open>
          <div className="hint"><b>Relleno detrás del muro</b></div>
          <div className="grid3">
            <Num label="Peso unitario γ" q="uw" value={data.fill.gamma} onChange={(v) => setFill({ gamma: v })} />
            <Num label="γ saturado" q="uw" value={data.fill.gammaSat} onChange={(v) => setFill({ gammaSat: v })} />
            <Num label="Ángulo de fricción φ" unit="°" value={data.fill.phi} onChange={(v) => setFill({ phi: v })} min={10} max={45} />
            <Num label="Talud del relleno β" unit="°" value={data.fill.beta} onChange={(v) => setFill({ beta: v })} min={0} max={data.fill.phi - 1} />
            <Num label="Sobrecarga q" q="press" value={data.fill.q} onChange={(v) => setFill({ q: v })} min={0} />
            <Num label="Nivel freático" q="len" value={data.hw} onChange={(v) => set({ hw: v })} min={0} hint="Altura sobre la base del muro (0 = sin agua)" />
          </div>
          <div className="hint"><b>Suelo de cimentación y suelo frontal</b></div>
          <div className="grid3">
            <Num label="Peso unitario γ" q="uw" value={data.found.gamma} onChange={(v) => setFound({ gamma: v })} />
            <Num label="Fricción φ" unit="°" value={data.found.phi} onChange={(v) => setFound({ phi: v })} min={0} max={45} />
            <Num label="Cohesión c" q="press" value={data.found.c} onChange={(v) => setFound({ c: v })} min={0} />
            <Sel label="Capacidad portante" value={data.found.bearingMode} onChange={(v) => setFound({ bearingMode: v })} options={[{ id: 'qa', label: 'Dato: q admisible' }, { id: 'calc', label: 'Calcular (Meyerhof/Vesic)' }]} />
            {data.found.bearingMode === 'qa' ? <Num label="q admisible" q="press" value={data.found.qa} onChange={(v) => setFound({ qa: v })} min={10} /> : <Num label="FS capacidad portante" value={data.found.fsBearing} onChange={(v) => setFound({ fsBearing: v })} min={1.5} />}
            <Num label="Fricción base μ" value={data.found.mu} onChange={(v) => setFound({ mu: v })} min={0} max={1.2} hint="tan δ de la base" />
            <Num label="Adhesión base" q="press" value={data.found.ca} onChange={(v) => setFound({ ca: v })} min={0} />
          </div>
          {data.key.enabled && <Check label="Con llave: usar fricción suelo–suelo (tan φ, c)" value={data.found.useSoilFriction} onChange={(v) => setFound({ useSoilFriction: v })} />}
          <Check label="Considerar empuje pasivo frontal" value={data.passive.use} onChange={(v) => set({ passive: { ...data.passive, use: v } })} />
          {data.passive.use && (
            <div className="grid2">
              <Num label="Factor de reducción del pasivo" value={data.passive.factor} onChange={(v) => set({ passive: { ...data.passive, factor: v } })} min={0} max={1} />
              <Num label="Profundidad ignorada" q="len" value={data.passive.ignoreTop} onChange={(v) => set({ passive: { ...data.passive, ignoreTop: v } })} min={0} hint="Suelo superficial no confiable" />
            </div>
          )}
          {isGravity(t) && (
            <div className="grid2">
              <Sel label="Teoría de empuje" value={data.theory} onChange={(v) => set({ theory: v })} options={[{ id: 'coulomb', label: 'Coulomb (cara real)' }, { id: 'rankine', label: 'Rankine (plano virtual)' }]} />
              {data.theory === 'coulomb' && <Num label="Fricción muro–suelo δ" unit="°" value={data.delta} onChange={(v) => set({ delta: v })} min={0} max={data.fill.phi} />}
            </div>
          )}
          <Check label="Ignorar el peso de la sobrecarga en volcamiento y deslizamiento" value={data.ignoreSurchargeWeight} onChange={(v) => set({ ignoreSurchargeWeight: v })} hint="Criterio conservador usual" />
          <Check label="Incluir el suelo sobre el pie" value={data.includeToeSoil} onChange={(v) => set({ includeToeSoil: v })} />
          {canPool(t) && (
            <>
              <Check label="Piscina: agua en el lado interior (frente del muro)" value={data.pool.on} onChange={(v) => set({ pool: { ...data.pool, on: v } })} hint="Se evalúan tres condiciones: piscina vacía (relleno + flotación), piscina llena (agua + relleno, con presión hidrodinámica si hay sismo) y piscina llena sin relleno (caso más desfavorable para la cara frontal)" />
              {data.pool.on && (
                <>
                  <div className="grid2">
                    <Num label="Nivel del agua (sobre la zapata)" q="len" value={data.pool.hwi} onChange={(v) => set({ pool: { ...data.pool, hwi: Math.min(Math.max(v, 0.1), data.H) } })} min={0.1} hint="Hasta la altura de la pantalla" />
                  </div>
                  <Check label="Recinto cerrado (paredes en ambos lados)" value={data.pool.closed !== false} onChange={(v) => set({ pool: { ...data.pool, closed: v } })} hint="El empuje del agua es interno: lo equilibra la pared opuesta a través del fondo (tirante) y no afecta el deslizamiento ni el volcamiento. Desactívelo para tratar la pared como muro aislado" />
                  <div className="hint">Con la piscina activa se ignoran el suelo sobre el pie y el empuje pasivo (el frente es el interior de la piscina). El agua llena genera un momento invertido (tracción en la cara frontal) que se verifica con el acero de esa cara.</div>
                </>
              )}
            </>
          )}
        </Acc>

        <Acc title="Sismo (Mononobe–Okabe)" icon={<Activity size={18} />}>
          <Check label="Verificar con sismo" value={data.seismic.on} onChange={(v) => set({ seismic: { ...data.seismic, on: v } })} />
          {data.seismic.on && (
            <div className="grid2">
              <Num label="kh" value={data.seismic.kh} onChange={(v) => set({ seismic: { ...data.seismic, kh: v } })} min={0} max={0.6} hint="Coeficiente sísmico horizontal" />
              <Num label="kv" value={data.seismic.kv} onChange={(v) => set({ seismic: { ...data.seismic, kv: v } })} min={0} max={0.4} hint="Coeficiente vertical (0 = ignorar)" />
            </div>
          )}
        </Acc>

        {t !== 'gabion' && <Acc title="Materiales y armado" icon={<Boxes size={18} />}>
          <div className="grid2">
            {!isMasonry(t) || isMasonryStem(t) ? (
              <>
                <Num label="f′c del concreto" q="stress" value={data.mat.fc} onChange={(v) => setMat({ fc: v })} min={10} />
                <Num label="fy del acero" q="stress" value={data.mat.fy} onChange={(v) => setMat({ fy: v })} min={240} />
              </>
            ) : null}
            <Num label="Peso unit. concreto" q="uw" value={data.mat.gammaC} onChange={(v) => setMat({ gammaC: v })} />
            <Sel label="Norma de cortante" value={data.mat.code} onChange={(v) => setMat({ code: v })} options={[{ id: 'ACI318_14', label: 'ACI 318-14 / NSR-10' }, { id: 'ACI318_19', label: 'ACI 318-19' }]} />
            {!isMasonryStem(t) && <Num label="Recubrimiento pantalla" q="lencm" value={data.mat.cover} onChange={(v) => setMat({ cover: v })} min={0.02} />}
            <Num label="Recubrimiento zapata" q="lencm" value={data.mat.coverFound} onChange={(v) => setMat({ coverFound: v })} min={0.04} />
          </div>
          {isMasonry(t) && (
            <div className="grid2">
              <Num label="f′m de la mampostería" q="stress" value={data.mat.fm} onChange={(v) => setMat({ fm: v })} min={1} />
              <Num label="Peso unit. mampostería" q="uw" value={data.mat.gammaM} onChange={(v) => setMat({ gammaM: v })} />
              {t === 'gravityMasonry' && (
                <>
                  <Num label="Compresión admisible / f′m" value={data.mat.fcAllowRatio} onChange={(v) => setMat({ fcAllowRatio: v })} min={0.05} max={0.5} />
                  <Num label="Tracción admisible en juntas" q="stress" value={data.mat.ftAllow} onChange={(v) => setMat({ ftAllow: v })} min={0} />
                  <Num label="Cohesión de juntas" q="stress" value={data.mat.cJ} onChange={(v) => setMat({ cJ: v })} min={0} />
                  <Num label="Fricción de juntas μ" value={data.mat.muJ} onChange={(v) => setMat({ muJ: v })} min={0} />
                </>
              )}
            </div>
          )}
          {t !== 'gravityConcrete' && t !== 'gravityMasonry' && (
            <>
              <Sel label="Sistema de barras" value={data.mat.barSystem} onChange={(v) => setMat({ barSystem: v, barStem: barList(v)[2].id, barStemH: barList(v)[1].id, barHeel: barList(v)[2].id, barToe: barList(v)[2].id, barKey: barList(v)[2].id })} options={[{ id: 'astm', label: 'ASTM (#)' }, { id: 'metric', label: 'Métricas (mm)' }]} />
              <div className="grid3">
                <Sel label="Pantalla (vertical)" value={data.mat.barStem} onChange={(v) => setMat({ barStem: v })} options={bars} />
                <Sel label="Horizontal / amarres" value={data.mat.barStemH} onChange={(v) => setMat({ barStemH: v })} options={bars} />
                {data.key.enabled && <Sel label="Llave" value={data.mat.barKey} onChange={(v) => setMat({ barKey: v })} options={bars} />}
              </div>
              {(t === 'cantilever' || t === 'masonryReinforced') && (
                <>
                  <div className="hint"><b>Armadura de la pantalla</b></div>
                  <div className="grid2">
                    {t === 'masonryReinforced' && data.block === '6' ? (
                      <div className="hint" style={{ alignSelf: 'end' }}>Bloque de 6″: solo cabe una barra vertical, al centro de la celda.</div>
                    ) : (
                      <Sel label="Capas de acero vertical" value={String(data.mat.stemLayers)} onChange={(v) => setMat({ stemLayers: v === '2' ? 2 : 1 })} options={[{ id: '1', label: t === 'masonryReinforced' ? 'Una capa (barra al centro)' : 'Una capa (cara del relleno)' }, { id: '2', label: 'Dos capas (ambas caras)' }]} />
                    )}
                    {t === 'masonryReinforced' ? (
                      <Sel label="Separación de las barras verticales" value={String(data.mat.stemVertS)} onChange={(v) => setMat({ stemVertS: parseFloat(v) })} options={SPACINGS} />
                    ) : (
                      <Num label="Separación vertical (0 = automática)" q="lencm" value={data.mat.stemVertS} onChange={(v) => setMat({ stemVertS: v })} min={0} hint="Se verifica con el momento" />
                    )}
                  </div>
                  {t === 'cantilever' && data.mat.stemLayers === 2 && (
                    <div className="grid2">
                      <Sel label="Barra de la 2.ª capa (cara frontal)" value={data.mat.barStemF ?? ''} onChange={(v) => setMat({ barStemF: v })} options={[{ id: '', label: 'Automática' }, ...bars]} />
                      <Num label="Separación 2.ª capa (0 = automática)" q="lencm" value={data.mat.stemFrontS ?? 0} onChange={(v) => setMat({ stemFrontS: v })} min={0} hint="Acero de la cara frontal" />
                    </div>
                  )}
                  <Check label="Con barras horizontales" value={data.mat.horizOn} onChange={(v) => setMat({ horizOn: v })} hint={t === 'masonryReinforced' ? 'Vigas de amarre en las hiladas' : 'Retracción y temperatura'} />
                  {data.mat.horizOn && (t === 'masonryReinforced' ? (
                    <Sel label="Separación de las barras horizontales" value={String(data.mat.horizS)} onChange={(v) => setMat({ horizS: parseFloat(v) })} options={SPACINGS} />
                  ) : (
                    <Num label="Separación horizontal (0 = automática)" q="lencm" value={data.mat.horizS} onChange={(v) => setMat({ horizS: v })} min={0} hint="Por capa" />
                  ))}
                </>
              )}
              {isCounterfort(t) && (
                <>
                  <div className="hint"><b>Armado del contrafuerte y de la pantalla (definido por usted)</b></div>
                  <div className="grid3">
                    <Sel label="Acero principal (barra)" value={data.cf.rb.mainBar} onChange={(v) => setRb({ mainBar: v })} options={bars} />
                    <Num label="Número de barras" value={data.cf.rb.nMain} onChange={(v) => setRb({ nMain: Math.max(1, Math.round(v)) })} min={1} />
                    <span />
                    <Sel label="Estribos (2 ramas)" value={data.cf.rb.stirBar} onChange={(v) => setRb({ stirBar: v })} options={bars} />
                    <Num label="Separación" q="lencm" value={data.cf.rb.stirS} onChange={(v) => setRb({ stirS: v })} min={0.05} />
                    <span />
                    <Sel label="Amarres pantalla–contrafuerte" value={data.cf.rb.tieStemBar} onChange={(v) => setRb({ tieStemBar: v })} options={bars} />
                    <Num label="Separación" q="lencm" value={data.cf.rb.tieStemS} onChange={(v) => setRb({ tieStemS: v })} min={0.05} />
                    <span />
                    <Sel label="Amarres zapata–contrafuerte" value={data.cf.rb.tieSlabBar} onChange={(v) => setRb({ tieSlabBar: v })} options={bars} />
                    <Num label="Separación" q="lencm" value={data.cf.rb.tieSlabS} onChange={(v) => setRb({ tieSlabS: v })} min={0.05} />
                    <span />
                    <Sel label={isMasonryStem(t) ? "Pantalla horizontal (vigas de amarre)" : "Pantalla horizontal (cada cara)"} value={data.cf.rb.stemHBar} onChange={(v) => setRb({ stemHBar: v })} options={bars} />
                    <Num label="Separación" q="lencm" value={data.cf.rb.stemHS} onChange={(v) => setRb({ stemHS: v })} min={0.05} />
                    <span />
                    <Sel label={isMasonryStem(t) ? "Pantalla vertical (celdas inyectadas)" : "Pantalla vertical (cada cara)"} value={data.cf.rb.stemVBar} onChange={(v) => setRb({ stemVBar: v })} options={bars} />
                    <Num label="Separación" q="lencm" value={data.cf.rb.stemVS} onChange={(v) => setRb({ stemVS: v })} min={0.05} />
                  </div>
                  {res?.design.counterfort && (
                    <button className="btn small" onClick={() => { const c = res.design.counterfort!.suggest; set({ cf: { ...data.cf, rb: { ...data.cf.rb, nMain: c.nMain, stirS: c.stirS, tieStemS: c.tieStemS, tieSlabS: c.tieSlabS, stemHS: c.stemHS, stemVS: c.stemVS } }, mat: { ...data.mat, mesh: { ...data.mat.mesh, longS: c.slabLongS } } }); }}>
                      <Wand2 size={14} /> Sugerir armado del contrafuerte según el cálculo
                    </button>
                  )}
                </>
              )}
              {isCounterfort(t) && (
                <>
                  <div className="hint"><b>Vigas corona de concreto (de contrafuerte a contrafuerte)</b></div>
                  {data.beams.map((bm, i) => {
                    const bd = res?.design.counterfort?.beams[i];
                    const upd = (patch: Partial<CrownBeam>) => set({ beams: data.beams.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                    return (
                      <div key={i} className="card" style={{ padding: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <b style={{ fontSize: 13 }}>Viga corona {i + 1}</b>
                          {bd && <StatusChip ok={bd.ok} />}
                          <span className="spacer" />
                          {bd && <button className="btn small ghost" title="Calcula las barras y los estribos necesarios" onClick={() => upd({ nBack: bd.suggest.nBack, nFront: bd.suggest.nFront, stirS: bd.suggest.stirS })}><Wand2 size={13} /> Sugerir armado</button>}
                          <button className="icon-btn danger" title="Quitar" onClick={() => set({ beams: data.beams.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
                        </div>
                        <div className="grid3">
                          <Num label="Altura (cara sup.)" q="len" value={bm.y} onChange={(v) => upd({ y: Math.min(Math.max(v, 0.1), data.H) })} min={0.1} hint="Sobre la zapata" />
                          <Num label="Ancho b (espesor)" q="lencm" value={bm.b} onChange={(v) => upd({ b: v })} min={0.1} />
                          <Num label="Alto h" q="lencm" value={bm.h} onChange={(v) => upd({ h: v })} min={0.1} />
                          <Num label="N.º barras relleno" value={bm.nBack} onChange={(v) => upd({ nBack: Math.max(1, Math.round(v)) })} min={1} />
                          <Sel label="Barra relleno" value={bm.barBack} onChange={(v) => upd({ barBack: v })} options={bars} />
                          <span />
                          <Num label="N.º barras frontal" value={bm.nFront} onChange={(v) => upd({ nFront: Math.max(1, Math.round(v)) })} min={1} />
                          <Sel label="Barra frontal" value={bm.barFront} onChange={(v) => upd({ barFront: v })} options={bars} />
                          <span />
                          <Sel label="Estribos (2 ramas)" value={bm.stirBar} onChange={(v) => upd({ stirBar: v })} options={bars} />
                          <Num label="Separación" q="lencm" value={bm.stirS} onChange={(v) => upd({ stirS: v })} min={0.05} />
                        </div>
                        {bd && <div className="hint" style={{ marginTop: 4 }}>Franja tributaria {bd.trib.toFixed(2)} m · w = {bd.w.toFixed(1)} kN/m · Mu(−) {bd.Mneg.toFixed(1)} / Mu(+) {bd.Mpos.toFixed(1)} kN·m · req. {bd.AsReqBack.toFixed(1)} / {bd.AsReqFront.toFixed(1)} cm² (prov. {bd.AsProvBack.toFixed(1)} / {bd.AsProvFront.toFixed(1)})</div>}
                      </div>
                    );
                  })}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn small" onClick={() => set({ beams: [...data.beams, defaultCrownBeam(data.beams.length ? Math.max(data.H * 0.5, 0.3) : data.H, data.tBot)] })}><Plus size={14} /> Agregar viga corona</button>
                  </div>
                </>
              )}
              <div className="hint"><b>Malla de la zapata corrida (definida por usted)</b></div>
              <div className="grid3">
                <Sel label="Transv. inf. (barra)" value={data.mat.mesh.botBar} onChange={(v) => setMesh({ botBar: v })} options={bars} />
                <Num label="Separación" q="lencm" value={data.mat.mesh.botS} onChange={(v) => setMesh({ botS: v })} min={0.05} />
              </div>
              <Check label="Transversal superior" value={data.mat.mesh.topOn} onChange={(v) => setMesh({ topOn: v })} />
              {data.mat.mesh.topOn && (
                <div className="grid3">
                  <Sel label="Transv. sup. (barra)" value={data.mat.mesh.topBar} onChange={(v) => setMesh({ topBar: v })} options={bars} />
                  <Num label="Separación" q="lencm" value={data.mat.mesh.topS} onChange={(v) => setMesh({ topS: v })} min={0.05} />
                </div>
              )}
              <Check label="Longitudinal (paralela al muro)" value={data.mat.mesh.longOn} onChange={(v) => setMesh({ longOn: v })} hint="En cada capa de la malla" />
              {data.mat.mesh.longOn && (
                <div className="grid3">
                  <Sel label="Longitudinal (barra)" value={data.mat.mesh.longBar} onChange={(v) => setMesh({ longBar: v })} options={bars} />
                  <Num label="Separación" q="lencm" value={data.mat.mesh.longS} onChange={(v) => setMesh({ longS: v })} min={0.05} />
                </div>
              )}
              {res?.design.suggest && (
                <button className="btn small" onClick={() => { const g = res.design.suggest!.mesh; setMesh({ botS: g.botS, topS: g.topS, topOn: g.topOn, longS: g.longS }); }}>
                  <Wand2 size={14} /> Sugerir separaciones según el cálculo
                </button>
              )}
              <div className="hint">El programa no diseña la zapata: verifica pie y talón con esta malla (transversal) y, en muros con contrafuertes, la losa entre contrafuertes (longitudinal).</div>
            </>
          )}
        </Acc>}

        <Acc title="Factores de seguridad y de carga" icon={<Scale size={18} />}>
          <div className="grid2">
            <Num label="FS volcamiento (estático)" value={data.factors.fsOT} onChange={(v) => setFac({ fsOT: v })} min={1} />
            <Num label="FS deslizamiento (estático)" value={data.factors.fsSL} onChange={(v) => setFac({ fsSL: v })} min={1} />
            <Num label="FS volcamiento (sismo)" value={data.factors.fsOTe} onChange={(v) => setFac({ fsOTe: v })} min={1} />
            <Num label="FS deslizamiento (sismo)" value={data.factors.fsSLe} onChange={(v) => setFac({ fsSLe: v })} min={1} />
            <Num label="Aumento de qa con sismo" value={data.factors.qaIncE} onChange={(v) => setFac({ qaIncE: v })} min={1} />
            <Num label="Factor de carga muerta" value={data.factors.dead} onChange={(v) => setFac({ dead: v })} min={1} />
            <Num label="Carga muerta (mínima)" value={data.factors.deadMin} onChange={(v) => setFac({ deadMin: v })} min={0.5} />
            <Num label="Factor sobrecarga" value={data.factors.live} onChange={(v) => setFac({ live: v })} min={1} />
            <Num label="Factor empuje de tierra H" value={data.factors.lateral} onChange={(v) => setFac({ lateral: v })} min={1} />
            <Num label="Factor de sismo E" value={data.factors.eq} onChange={(v) => setFac({ eq: v })} min={0.5} />
          </div>
        </Acc>
      </div>

      <div className="stack right" style={{ minWidth: 0 }}>
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { id: 'seccion', label: 'Sección', icon: <Eye size={16} /> },
            { id: 'estabilidad', label: 'Estabilidad', icon: <Scale size={16} /> },
            { id: 'diseno', label: 'Diseño estructural', icon: <Layers size={16} /> },
            { id: 'diagramas', label: 'Diagramas', icon: <Activity size={16} /> },
            { id: 'armado', label: 'Armado', icon: <Grid3x3 size={16} /> },
            { id: 'memoria', label: 'Memoria de cálculo', icon: <FileText size={16} /> },
          ]}
        />
        {res?.pool && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="hint">Condición mostrada</span>
            {(['vacia', 'llena', 'llenaSinRelleno'] as const).map((k) => {
              const st = res.pool!.states.find((q) => q.id === k)!;
              return (
                <button key={k} className={'btn small' + (poolView === k ? ' primary' : '')} onClick={() => setPoolView(k)}>
                  {st.label} {st.res.ok ? '✓' : '✗'}
                </button>
              );
            })}
            <span className="hint">h agua = {res.pool.hwi.toFixed(2)} m</span>
          </div>
        )}
        {!res && <Alert>No fue posible calcular con los datos actuales.</Alert>}
        {res && tab === 'seccion' && <WallSection res={res} theme={th} />}
        {res && tab === 'estabilidad' && <WallStability res={res} />}
        {res && tab === 'diseno' && <WallDesignView res={res} theme={th} />}
        {res && tab === 'diagramas' && <WallDiagramTab res={res} theme={th} />}
        {res && tab === 'armado' && <WallArmado res={res} theme={th} />}
        {res && tab === 'memoria' && <ReportButtons kind="wall" wall={data} info={info} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Summary({ res }: { res: WallResults }) {
  const { fmt } = useUnits();
  const c = res.staticCase;
  return (
    <>
      <div className={'banner ' + (res.ok ? 'ok' : 'bad')}>
        {res.ok ? <CheckCircle2 /> : <XCircle />}
        {res.ok ? 'El muro cumple todas las verificaciones.' : 'El muro NO cumple alguna verificación: ajuste la geometría.'}
      </div>
      {res.pool && (
        <div className="kpis">
          {res.pool.states.map((q) => (
            <Kpi key={q.id} label={q.label} value={q.res.ok ? 'Cumple' : 'No cumple'} sub={`FS vol. ${isFinite(q.res.staticCase.FSot) ? q.res.staticCase.FSot.toFixed(2) : '∞'} · FS desl. ${isFinite(q.res.staticCase.FSsl) ? q.res.staticCase.FSsl.toFixed(2) : '∞'} · q máx. ${isFinite(q.res.staticCase.qmax) ? q.res.staticCase.qmax.toFixed(0) : '—'} kPa`} />
          ))}
        </div>
      )}
      {res.warnings.length > 0 && <div className="stack" style={{ gap: 8 }}>{res.warnings.map((w, i) => <Alert key={i}>{w}</Alert>)}</div>}
      <div className="kpis">
        <Kpi label="FS volcamiento" value={isFinite(c.FSot) ? c.FSot.toFixed(2) : '∞'} sub={`mín. ${c.fsOTreq}`} />
        <Kpi label="FS deslizamiento" value={isFinite(c.FSsl) ? c.FSsl.toFixed(2) : '∞'} sub={`mín. ${c.fsSLreq}`} />
        <Kpi label="Presión máxima" value={isFinite(c.qmax) ? fmt.u('press', c.qmax, 1) : '—'} sub={`adm. ${fmt.u('press', c.qaAllow, 1)}`} />
        <Kpi label="Base B" value={fmt.u('len', res.geom.B, 2)} sub={`e = ${c.e.toFixed(2)} m`} />
        <Kpi label={res.inp.type === 'gabion' ? 'Gavión (piedra + malla)' : 'Concreto'} value={`${(res.inp.type === 'gabion' ? res.geom.parts[0].area : res.concreteVolume).toFixed(2)} m³/m`} sub={`Peso ${fmt.u('lforce', res.weightWall, 1)}`} />
      </div>
    </>
  );
}

function WallSection({ res, theme }: { res: WallResults; theme: typeof LIGHT }) {
  const { fmt } = useUnits();
  const [seis, setSeis] = useState(false);
  const useSeis = seis && !!res.seismicCase;
  return (
    <>
      <Summary res={res} />
      <div className="draw">
        <div className="draw-tools">
          {res.seismicCase && <Check label="Mostrar caso sísmico" value={seis} onChange={setSeis} />}
          <span className="spacer" />
          <span className="hint">Presión de contacto, empujes y cotas por metro de muro</span>
        </div>
        <div dangerouslySetInnerHTML={{ __html: wallSectionSvg(res, { fmt, theme, W: 860, H: 580, seismic: useSeis }) }} />
      </div>
      {isCounterfort(res.inp.type) && (
        <div className="draw"><div dangerouslySetInnerHTML={{ __html: wallPlanSvg(res, { fmt, theme }) }} /></div>
      )}
      {isCounterfort(res.inp.type) && res.inp.beams.length > 0 && (
        <div className="draw"><div dangerouslySetInnerHTML={{ __html: wallElevationSvg(res, { fmt, theme }) }} /></div>
      )}
      <Card title="Verificaciones" icon={<ListChecks size={18} />}>
        <div className="checks">
          {res.checks.map((c, i) => (
            <CheckCard key={i} name={c.name} ratio={c.ratio} ok={c.ok} advisory={c.advisory} detail={c.detail} />
          ))}
        </div>
      </Card>
    </>
  );
}

function ForcesTable({ c }: { c: CaseResult }) {
  const { fmt } = useUnits();
  return (
    <div className="grid2">
      <Tbl
        head={['Fuerza vertical', `V (${fmt.l('lforce')})`, 'x (m)', `M (${fmt.l('lmoment')})`]}
        align={['l', 'r', 'r', 'r']}
        rows={[
          ...c.v.map((f) => [f.name, fmt.n('lforce', f.V, 2), f.x.toFixed(3), fmt.n('lmoment', f.M, 2)]),
          [<b key="s">Σ</b>, <b key="a">{fmt.n('lforce', c.SumV, 2)}</b>, '', <b key="m">{fmt.n('lmoment', c.Mres, 2)}</b>],
        ]}
      />
      <Tbl
        head={['Fuerza horizontal', `H (${fmt.l('lforce')})`, 'y (m)', `M (${fmt.l('lmoment')})`]}
        align={['l', 'r', 'r', 'r']}
        rows={[
          ...c.h.map((f) => [f.name, fmt.n('lforce', f.H, 2), f.y.toFixed(3), fmt.n('lmoment', f.M, 2)]),
          [<b key="s">Σ</b>, <b key="a">{fmt.n('lforce', c.SumH, 2)}</b>, '', <b key="m">{fmt.n('lmoment', c.Mot, 2)}</b>],
        ]}
      />
    </div>
  );
}

function WallStability({ res }: { res: WallResults }) {
  const { fmt } = useUnits();
  const cases = [res.staticCase, ...(res.seismicCase ? [res.seismicCase] : [])];
  return (
    <>
      <Summary res={res} />
      <Card title="Coeficientes de empuje" icon={<Mountain size={18} />}>
        <div className="kpis">
          <Kpi label="Teoría" value={res.earth.mode === 'virtual' ? 'Rankine' : 'Coulomb'} sub={res.earth.theoryLabel} />
          <Kpi label="Ka" value={res.earth.Ka.toFixed(4)} />
          {res.earth.Kae !== null && res.earthSeismic && <Kpi label="Kae (M–O)" value={(res.earthSeismic.Kae ?? NaN).toFixed(4)} />}
          <Kpi label="Kp (frente)" value={res.earth.kpFront.toFixed(3)} />
          <Kpi label="Altura del plano de empuje" value={fmt.u('len', res.earth.Hv, 2)} />
        </div>
      </Card>
      {cases.map((c) => (
        <Card key={c.label} title={c.label} icon={<Scale size={18} />}>
          <div className="stack">
            <ForcesTable c={c} />
            {c.passive && (
              <div className="formula">
                Empuje pasivo (Kp = {c.passive.Kp.toFixed(2)}): Pp = {fmt.u('lforce', c.passive.Fall, 1)} × factor {res.inp.passive.factor} = {fmt.u('lforce', c.passive.F, 1)} (solo en deslizamiento)
              </div>
            )}
            <div className="checks">
              <CheckCard name="Volcamiento" ratio={c.fsOTreq / c.FSot} ok={c.ok.ot} detail={`FS = ${isFinite(c.FSot) ? c.FSot.toFixed(2) : '∞'} = ΣMr / ΣMo = ${fmt.n('lmoment', c.Mres, 1)} / ${fmt.n('lmoment', c.Mot, 1)} (mín. ${c.fsOTreq})`} />
              <CheckCard name="Deslizamiento" ratio={c.fsSLreq / c.FSsl} ok={c.ok.sl} detail={`FS = (μΣV + c·B + Pp) / ΣH = (${fmt.n('lforce', c.Rfric, 1)} + ${fmt.n('lforce', c.Rcoh, 1)} + ${fmt.n('lforce', c.Rpass, 1)}) / ${fmt.n('lforce', c.SumH, 1)} = ${isFinite(c.FSsl) ? c.FSsl.toFixed(2) : '∞'}`} />
              <CheckCard name="Presión sobre el suelo" ratio={c.qmax / c.qaAllow} ok={c.ok.q} detail={`x̄ = ${c.xbar.toFixed(3)} m, e = ${c.e.toFixed(3)} m; qmax = ${isFinite(c.qmax) ? fmt.u('press', c.qmax, 1) : '∞'}, qmin = ${fmt.u('press', c.qmin, 1)}`} />
            </div>
            {c.bearing && (
              <div className="formula">
                Capacidad portante (Meyerhof–Vesic): B′ = {c.bearing.Bp.toFixed(2)} m; Nq = {c.bearing.Nq.toFixed(2)}, Nc = {c.bearing.Nc.toFixed(2)}, Nγ = {c.bearing.Ng.toFixed(2)}; qult = {fmt.u('press', c.bearing.qult, 1)} → qa = qult/FS = {fmt.u('press', c.bearing.qa, 1)}
              </div>
            )}
          </div>
        </Card>
      ))}
    </>
  );
}

function WallDesignView({ res, theme }: { res: WallResults; theme: typeof LIGHT }) {
  const { fmt } = useUnits();
  const d = res.design;
  const th = theme;
  const conv = (m: number) => (fmt.sys === 'SI' ? m : m / 9.80665);
  return (
    <>
      <Summary res={res} />
      {d.stem && (
        <Card title={d.stem.masonry ? 'Pantalla de mampostería reforzada' : 'Pantalla'} icon={<Layers size={18} />}>
          <div className="stack">
            <div className="kpis">
              <Kpi label={d.stem.centered ? 'Armado vertical (al centro)' : d.stem.layers === 2 ? 'Armado vertical (cada cara)' : 'Armado vertical (cara del relleno)'} value={d.stem.base.text} sub={`As = ${d.stem.base.asProv.toFixed(2)} cm²/m${d.stem.vertAuto ? ' · automático' : ' · elegido'}`} />
              <Kpi label={`Horizontal${d.stem.horizOn && d.stem.horizLayers === 2 ? ' (cada cara)' : ''}`} value={d.stem.horizontalDet.text} sub={d.stem.horizOn ? `Requerido ${d.stem.AsH.toFixed(2)} cm²/m` : 'Sin barras horizontales'} />
              {!d.stem.masonry && d.stem.layers === 2 && <Kpi label="Vertical cara frontal" value={d.stem.frontVertDet.text} />}
              <Kpi label="Cortante crítico" value={`${(d.stem.critical.ratio * 100).toFixed(0)} %`} sub={`Vu ${fmt.n('lforce', d.stem.critical.Vu, 1)} / φVc ${fmt.n('lforce', d.stem.critical.phiVc, 1)}`} />
            </div>
            <div className="hint">{d.stem.cutNote}</div>
            <Tbl
              head={['y (m)', 't (m)', 'd (m)', `Mu (${fmt.l('lmoment')})`, `Vu (${fmt.l('lforce')})`, 'As req (cm²/m)', 'As mín', 'As diseño', `φMn (${fmt.l('lmoment')})`]}
              align={['r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r']}
              rows={d.stem.sections.filter((_, i) => i % 2 === 0).map((s) => [s.y.toFixed(2), s.t.toFixed(3), s.d.toFixed(3), fmt.n('lmoment', s.Mu, 1), fmt.n('lforce', s.Vu, 1), s.AsReq.toFixed(2), s.AsMin.toFixed(2), s.AsDes.toFixed(2), fmt.n('lmoment', s.phiMn, 1)])}
            />
            <div className="draw">
              <div dangerouslySetInnerHTML={{
                __html: lineChart({
                  w: 640, h: 260, theme: th, xLabel: 'Altura sobre la base de la pantalla y (m)', yLabel: `Momento (${fmt.l('lmoment')})`, title: 'Momento último vs. capacidad con el armado de la base',
                  series: [
                    { name: 'Mu', xs: d.stem.sections.map((s) => s.y), ys: d.stem.sections.map((s) => conv(s.Mu)), color: th.accent },
                    { name: 'φMn', xs: d.stem.sections.map((s) => s.y), ys: d.stem.sections.map((s) => conv(s.phiMn)), color: th.ok, dash: '6 4' },
                  ],
                }),
              }} />
            </div>
          </div>
        </Card>
      )}
      {d.gravity && (
        <Card title={`Secciones de la pantalla — ${d.gravityMaterial === 'mamposteria' ? 'mampostería sin refuerzo (esfuerzos de servicio)' : d.gravityMaterial === 'gaviones' ? 'gaviones (base de cada cuerpo, esfuerzos de servicio)' : 'concreto simple (resistencia)'}`} icon={<BrickWall size={18} />}>
          <Tbl
            head={['y (m)', 't (m)', `N (${fmt.l('lforce')})`, `M (${fmt.l('lmoment')})`, `V (${fmt.l('lforce')})`, `σ dorso (${fmt.l('press')})`, `σ frente (${fmt.l('press')})`, 'Compr.', d.gravityMaterial === 'gaviones' ? 'Excentr.' : 'Tracc.', 'Cort.', '']}
            align={['r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'c']}
            rows={d.gravity.map((s) => [s.y.toFixed(2), s.t.toFixed(2), fmt.n('lforce', s.N, 1), fmt.n('lmoment', s.M, 1), fmt.n('lforce', s.V, 1), fmt.n('press', s.sigBack, 1), fmt.n('press', s.sigFront, 1), s.ratioC.toFixed(2), isFinite(s.ratioT) ? s.ratioT.toFixed(2) : '∞', s.ratioV.toFixed(2), <StatusChip key="k" ok={s.ok} />])}
          />
        </Card>
      )}
      {d.baseCheck && d.baseCheck.length > 0 && (
        <Card title="Zapata (concreto simple / mampostería)" icon={<Hammer size={18} />}>
          <Tbl head={['Elemento', 'Relación', 'Detalle']} rows={d.baseCheck.map((b) => [b.name, b.ratio.toFixed(2), b.detail])} align={['l', 'r', 'l']} />
        </Card>
      )}
      {(d.toe || d.heel) && (
        <div className="grid2">
          {[d.toe, d.heel].map((s) => s && (
            <Card key={s.name} title={s.name} icon={<Layers size={18} />} right={<StatusChip ok={s.sectionOk && s.ratioM <= 1 && s.ratioV <= 1} />}>
              <div className="kpis">
                <Kpi label="Armado" value={s.det.text} sub={`Cara ${s.face} · As = ${s.det.asProv.toFixed(2)} cm²/m`} />
                <Kpi label="Mu" value={fmt.u('lmoment', s.Mu, 1)} sub={`φMn ${fmt.n('lmoment', s.phiMn, 1)}`} />
                <Kpi label="Vu" value={fmt.u('lforce', s.Vu, 1)} sub={`φVc ${fmt.n('lforce', s.phiVc, 1)}`} />
              </div>
              <div className="hint" style={{ marginTop: 8 }}>Combinación: {s.caseLabel}. Barras longitudinales (paralelas al muro): {s.shrinkDet.text} en cada cara. {s.hook ? 'Gancho estándar necesario.' : ''}</div>
            </Card>
          ))}
        </div>
      )}
      {d.key && (
        <Card title="Llave de corte" icon={<Hammer size={18} />} right={<StatusChip ok={d.key.slab.sectionOk} />}>
          <div className="kpis">
            <Kpi label="Armado vertical" value={d.key.slab.det.text} sub={`As = ${d.key.slab.det.asProv.toFixed(2)} cm²/m`} />
            <Kpi label="Empuje pasivo sobre la llave" value={fmt.u('lforce', d.key.Pp, 1)} sub={`Usado ${fmt.u('lforce', d.key.PpUsed, 1)}`} />
            <Kpi label="Mu" value={fmt.u('lmoment', d.key.slab.Mu, 1)} />
          </div>
        </Card>
      )}
      {d.counterfort && <CounterfortView res={res} />}
      {d.notes.map((n, i) => <div className="hint" key={i}>{n}</div>)}
    </>
  );
}

function CounterfortView({ res }: { res: WallResults }) {
  const { fmt } = useUnits();
  const c = res.design.counterfort!;
  return (
    <>
      <Card title={`Contrafuerte ${c.kind}`} icon={<Layers size={18} />} right={<StatusChip ok={c.sectionOk} />}>
        <div className="kpis">
          <Kpi label="Acero principal" value={`${c.nBars} × ${c.bar.id}`} sub={`As prov ${c.AsProv.toFixed(1)} cm² ≥ ${c.AsMax.toFixed(1)}`} />
          <Kpi label="Estribos horizontales" value={`2 ramas ${c.stirrup.id} @ ${(c.stirrupSpacing * 100).toFixed(1)} cm`} />
          <Kpi label="Amarres pantalla–contrafuerte" value={c.tieStem.text} />
          <Kpi label="Amarres zapata–contrafuerte" value={c.tieSlab.text} sub={`T = ${fmt.n('lforce', c.tieSlabForce, 1)} por metro`} />
        </div>
        <Tbl
          head={['y (m)', 'Proyección (m)', 'd (m)', `Mu (${fmt.l('moment')})`, `Vu (${fmt.l('force')})`, 'As horiz. (cm²)', 'As inclinada (cm²)']}
          align={['r', 'r', 'r', 'r', 'r', 'r', 'r']}
          rows={c.sections.filter((_, i) => i % 2 === 0).map((s) => [s.y.toFixed(2), s.proj.toFixed(2), s.dcf.toFixed(2), fmt.n('moment', s.Mcf, 1), fmt.n('force', s.Vcf, 1), s.AsReq.toFixed(2), s.AsIncl.toFixed(2)])}
        />
      </Card>
      {c.beams.length > 0 && (
        <Card title="Vigas corona" icon={<Layers size={18} />}>
          <Tbl
            head={['Viga', 'Altura (m)', 'b × h (cm)', 'Franja (m)', 'w (kN/m)', `Mu(−)/Mu(+) (${fmt.l('moment')})`, 'Cara relleno', 'Cara frontal', 'Estribos', 'Estado']}
            align={['l', 'r', 'r', 'r', 'r', 'r', 'l', 'l', 'l', 'c']}
            rows={c.beams.map((b) => [`VC${b.i + 1}`, b.y.toFixed(2), `${(b.b * 100).toFixed(0)} × ${(b.h * 100).toFixed(0)}`, b.trib.toFixed(2), b.w.toFixed(1), `${fmt.n('moment', b.Mneg, 1)} / ${fmt.n('moment', b.Mpos, 1)}`, `${b.textBack} (req. ${b.AsReqBack.toFixed(1)} cm²)`, `${b.textFront} (req. ${b.AsReqFront.toFixed(1)} cm²)`, b.textStir, b.ok ? 'Cumple' : 'No cumple'])}
          />
        </Card>
      )}
      <Card title="Verificación del armado definido" icon={<ListChecks size={18} />}>
        <Tbl
          head={['Elemento', 'Adoptado', 'Requerido', 'Relación', '']}
          align={['l', 'l', 'r', 'r', 'c']}
          rows={[
            ['Acero principal del contrafuerte', `${c.nBars} × ${c.bar.id} = ${c.AsProv.toFixed(1)} cm²`, `${c.req.AsMain.toFixed(1)} cm²`, c.ratios.main],
            ['Estribos horizontales (2 ramas)', `${c.stirrup.id} @ ${(c.stirrupSpacing * 100).toFixed(0)} cm`, `Vu ${fmt.n('force', c.critical.Vu, 1)} ≤ φVn ${fmt.n('force', c.critical.phiVc, 1)}`, Math.max(c.ratios.stirrup, c.ratios.stirMin)],
            ['Amarres pantalla–contrafuerte', c.tieStem.text, `${c.req.tieStem.toFixed(2)} cm²/m`, c.ratios.tieStem],
            ['Amarres zapata–contrafuerte', c.tieSlab.text, `${c.req.tieSlab.toFixed(2)} cm²/m`, c.ratios.tieSlab],
            ['Pantalla horizontal (cada cara)', c.stemNegDet.text, `${Math.max(c.req.stemNeg, c.req.stemPos).toFixed(2)} cm²/m`, Math.max(c.ratios.stemNeg, c.ratios.stemPos)],
            ['Pantalla vertical (cada cara)', c.vertDet.text, `${c.req.vert.toFixed(2)} cm²/m`, c.ratios.vert],
            [`${c.slabLabel}: longitudinal`, c.slabPosDet.text, `${Math.max(c.req.slabNeg, c.req.slabPos).toFixed(2)} cm²/m`, Math.max(c.ratios.slabNeg, c.ratios.slabPos)],
          ].map((r) => [r[0] as string, r[1] as string, r[2] as string, isFinite(r[3] as number) ? (r[3] as number).toFixed(2) : '∞', <StatusChip key={r[0] as string} ok={(r[3] as number) <= 1.0001} />])}
        />
      </Card>
      <Card title="Pantalla entre contrafuertes (losa horizontal)" icon={<Layers size={18} />}>
        <div className="kpis">
          <Kpi label="Luz libre" value={fmt.u('len', c.Ls, 2)} />
          <Kpi label={`Acero horizontal — ${c.stemFacePos}`} value={c.stemPosDet.text} />
          <Kpi label={`Acero horizontal — ${c.stemFaceNeg}`} value={c.stemNegDet.text} />
          <Kpi label="Vertical (cada cara)" value={c.vertDet.text} sub={`franja inferior: ${c.vertBottomDet.text}`} />
        </div>
        <Tbl
          head={['y (m)', 't (m)', `wu (${fmt.l('press')})`, `Mu⁻ (${fmt.l('lmoment')})`, `Mu⁺ (${fmt.l('lmoment')})`, 'As⁻ (cm²/m)', 'As⁺ (cm²/m)']}
          align={['r', 'r', 'r', 'r', 'r', 'r', 'r']}
          rows={c.stemSlab.filter((_, i) => i % 2 === 0).map((s) => [s.y.toFixed(2), s.t.toFixed(2), fmt.n('press', s.wu, 1), fmt.n('lmoment', s.MuNeg, 1), fmt.n('lmoment', s.MuPos, 1), s.AsNeg.toFixed(2), s.AsPos.toFixed(2)])}
        />
      </Card>
      <Card title={`${c.slabLabel} (losa entre contrafuertes)`} icon={<Layers size={18} />}>
        <div className="kpis">
          <Kpi label={`Acero — ${c.slabFacePos}`} value={c.slabPosDet.text} />
          <Kpi label={`Acero — ${c.slabFaceNeg}`} value={c.slabNegDet.text} />
        </div>
      </Card>
      {c.notes.map((n, i) => <div className="hint" key={i}>{n}</div>)}
    </>
  );
}

function WallDiagramTab({ res, theme }: { res: WallResults; theme: typeof LIGHT }) {
  const { fmt } = useUnits();
  const figs = wallDiagramFigures(res, { theme, fmt, W: 820 });
  if (!figs.length) return <Alert>Este tipo de muro no tiene diagramas de esfuerzos que mostrar.</Alert>;
  return (
    <>
      <div className="hint">Esfuerzos con las cargas mayoradas (cargas de servicio en muros de gravedad y gaviones). Los diagramas de la pantalla y del contrafuerte van de la corona (arriba) a la zapata (abajo); los de la zapata, de la punta del pie al extremo del talón.</div>
      <div className="grid2" style={{ gap: 12 }}>
        {res.design.diagrams?.stem && (
          <>
            <Kpi label="Momento máx. de la pantalla" value={fmt.u('lmoment', Math.max(...res.design.diagrams.stem.Mst, ...(res.design.diagrams.stem.seismic ? res.design.diagrams.stem.Mse : [0])), 1)} sub="en la base de la pantalla" />
            <Kpi label="Cortante máx. de la pantalla" value={fmt.u('lforce', Math.max(...res.design.diagrams.stem.Vst, ...(res.design.diagrams.stem.seismic ? res.design.diagrams.stem.Vse : [0])), 1)} sub="en la base de la pantalla" />
          </>
        )}
      </div>
      {figs.map((f) => <div className="draw" key={f.id}><div dangerouslySetInnerHTML={{ __html: f.svg }} /></div>)}
    </>
  );
}

function WallArmado({ res, theme }: { res: WallResults; theme: typeof LIGHT }) {
  const { fmt } = useUnits();
  const d = res.design;
  const rows: React.ReactNode[][] = [];
  if (d.stem) {
    rows.push([d.stem.centered ? 'Pantalla — vertical (barra al centro)' : d.stem.layers === 2 ? 'Pantalla — vertical (cara del relleno)' : 'Pantalla — vertical (una capa, cara del relleno)', d.stem.base.text, d.stem.base.asProv.toFixed(2), d.stem.cutNote]);
    if (d.stem.layers === 2) rows.push(['Pantalla — vertical (cara frontal)', d.stem.masonry ? d.stem.base.text : d.stem.frontVertDet.text, (d.stem.masonry ? d.stem.base : d.stem.frontVertDet).asProv.toFixed(2), d.stem.masonry ? 'Segunda capa, igual a la del relleno' : 'Acero de la cara frontal']);
    rows.push([`Pantalla — horizontal${d.stem.horizOn ? (d.stem.horizLayers === 2 ? ' (cada cara)' : '') : ''}`, d.stem.horizontalDet.text, d.stem.horizOn ? (d.stem.horizontalDet.asProv * d.stem.horizLayers).toFixed(2) : '—', d.stem.horizOn ? `Requerido ${d.stem.AsH.toFixed(2)} cm²/m; ${d.stem.horizAuto ? 'separación automática' : 'separación elegida'}` : 'Sin barras horizontales']);
    rows.push(['Anclaje de barras verticales en la zapata', d.stem.anchorage.ok ? 'Gancho estándar' : 'Insuficiente', '—', `ldh = ${(d.stem.anchorage.ldh * 100).toFixed(0)} cm; disponible ${(d.stem.anchorage.available * 100).toFixed(0)} cm (espesor − recubrimiento); espesor mínimo ${((d.stem.anchorage.ldh + res.inp.mat.coverFound) * 100).toFixed(0)} cm`]);
  }
  if (d.mesh) {
    const mm = d.mesh;
    const mx = res.inp.mat.mesh;
    rows.push(['Zapata — transversal inferior', mm.botDet.text, mm.botDet.asProv.toFixed(2), `Perpendicular al muro; mínimo ${(0.0018 * res.geom.hb * 1e4).toFixed(2)} cm²/m`]);
    rows.push(['Zapata — transversal superior', mm.top ? mm.top.det.text : 'No se coloca', mm.top ? mm.top.det.asProv.toFixed(2) : '—', mm.top ? 'Perpendicular al muro' : 'Sin malla superior']);
    rows.push(['Zapata — longitudinal (cada capa)', mm.long ? mm.long.det.text : 'No se coloca', mm.long ? mm.long.det.asProv.toFixed(2) : '—', mm.long ? `Paralela al muro; ${mm.long.layers} capa(s), total ${mm.long.AsTotal.toFixed(2)} cm²/m (mín. ${mm.long.AsMin.toFixed(2)})` : 'Sin acero longitudinal']);
    void mx;
  }
  if (d.key) rows.push(['Llave de corte', d.key.slab.det.text, d.key.slab.det.asProv.toFixed(2), 'Barras verticales ancladas en la zapata']);
  if (d.counterfort) {
    const c = d.counterfort;
    rows.push(['Contrafuerte — acero principal', `${c.nBars} × ${c.bar.id}`, c.AsProv.toFixed(2), 'Sigue el borde inclinado']);
    rows.push(['Contrafuerte — estribos horizontales', `${c.stirrup.id} @ ${(c.stirrupSpacing * 100).toFixed(1)} cm`, '—', '2 ramas']);
    rows.push([`Pantalla — horizontal (${c.stemFacePos})`, c.stemPosDet.text, c.stemPosDet.asProv.toFixed(2), '']);
    rows.push([`Pantalla — horizontal (${c.stemFaceNeg})`, c.stemNegDet.text, c.stemNegDet.asProv.toFixed(2), '']);
    rows.push(['Pantalla — vertical (cada cara)', c.vertDet.text, c.vertDet.asProv.toFixed(2), `Franja inferior: ${c.vertBottomDet.text}`]);
    rows.push([`${c.slabLabel} — ${c.slabFacePos}`, c.slabPosDet.text, c.slabPosDet.asProv.toFixed(2), '']);
    rows.push([`${c.slabLabel} — ${c.slabFaceNeg}`, c.slabNegDet.text, c.slabNegDet.asProv.toFixed(2), '']);
    rows.push(['Amarres pantalla–contrafuerte', c.tieStem.text, c.tieStem.asProv.toFixed(2), 'Horizontales']);
    rows.push(['Amarres zapata–contrafuerte', c.tieSlab.text, c.tieSlab.asProv.toFixed(2), 'Verticales']);
    for (const b of c.beams) {
      rows.push([`Viga corona ${b.i + 1} (${(b.b * 100).toFixed(0)}×${(b.h * 100).toFixed(0)} cm, a ${b.y.toFixed(2)} m)`, `Cara relleno ${b.textBack}; cara frontal ${b.textFront}`, (b.AsProvBack + b.AsProvFront).toFixed(2), `Estribos ${b.textStir} (2 ramas); barras continuas entre contrafuertes`]);
    }
  }
  if (res.inp.type === 'gabion') {
    const gw = gabionWidths(res.inp.gab);
    gw.forEach((w, k) => rows.push([`Cuerpo ${k + 1}`, `${w.toFixed(2)} × ${res.inp.gab.hc.toFixed(2)} m`, '—', `Piedra: ${(w * res.inp.gab.hc).toFixed(2)} m³ por metro de muro; diafragmas cada 1.0 m`]));
  } else if (d.gravity) rows.push(['Sin refuerzo estructural', '—', '—', 'Muro de gravedad: se verifica por esfuerzos. Puede añadirse acero de retracción.']);
  return (
    <>
      <div className="draw"><div dangerouslySetInnerHTML={{ __html: wallSectionSvg(res, { fmt, theme, W: 860, H: 580, showRebar: true, showPressure: false, showLoads: false }) }} /></div>
      {isCounterfort(res.inp.type) && <div className="draw"><div dangerouslySetInnerHTML={{ __html: wallPlanSvg(res, { fmt, theme }) }} /></div>}
      {isCounterfort(res.inp.type) && res.inp.beams.length > 0 && <div className="draw"><div dangerouslySetInnerHTML={{ __html: wallElevationSvg(res, { fmt, theme }) }} /></div>}
      <Card title="Cuadro de armado (por metro de muro)" icon={<Grid3x3 size={18} />}>
        <Tbl head={['Elemento', 'Armado', 'As prov (cm²/m)', 'Observación']} align={['l', 'l', 'r', 'l']} rows={rows} />
      </Card>
    </>
  );
}

void Waves;
void Settings2;
void hasHeelSlab;
void Txt;
