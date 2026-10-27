import { ICON_PNG } from '../report/iconData';
import React from 'react';
import { Building2, BrickWall, FilePlus2, FolderOpen, Download, ArrowRight, FileText, Shapes, ShieldCheck, Sparkles } from 'lucide-react';
import { Card } from './common';
import { exampleFootings, exampleWalls } from '../state';
import { WALL_TYPES } from '../core/wallTypes';
import { FootingInput } from '../core/footing';
import { WallInput } from '../core/wallTypes';

export function Home({
  onGo, onAddFooting, onAddWall, onOpen, onSave, onNew,
}: {
  onGo: (m: 'footing' | 'wall' | 'project') => void;
  onAddFooting: (f: FootingInput) => void;
  onAddWall: (w: WallInput) => void;
  onOpen: () => void;
  onSave: () => void;
  onNew: () => void;
}) {
  const ex = exampleFootings();
  const exw = exampleWalls();
  return (
    <div className="stack" style={{ maxWidth: 1180, margin: '0 auto' }}>
      <div className="hero">
        <div>
          <h1>TerraStruct</h1>
          <p>
            Análisis y diseño de <b>fundaciones</b> de cualquier geometría y <b>muros de retención</b> de cualquier tipología. Calcule, verifique y exporte su <b>memoria de cálculo</b> en PDF o Word.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn accent" onClick={() => onGo('footing')}><Building2 size={17} /> Diseñar una fundación</button>
            <button className="btn" onClick={() => onGo('wall')} style={{ background: 'rgba(255,255,255,.12)', color: '#fff', borderColor: 'rgba(255,255,255,.35)' }}><BrickWall size={17} /> Diseñar un muro</button>
          </div>
        </div>
        <img src={ICON_PNG} alt="" />
      </div>

      <div className="big-cards">
        <div className="card big-card" onClick={() => onGo('footing')}>
          <div className="bub" style={{ background: 'linear-gradient(135deg,#1d63c7,#2c8ae6)' }}><Building2 size={28} /></div>
          <div>
            <h3>Fundaciones</h3>
            <p className="hint" style={{ fontSize: 13, margin: '4px 0 0' }}>
              Zapatas aisladas o combinadas con forma poligonal libre, columnas rectangulares, circulares, en L, T, I, cruz o libres. Presiones sin tracción, deslizamiento, volcamiento, flexión, cortante y punzonamiento (ACI 318).
            </p>
          </div>
        </div>
        <div className="card big-card" onClick={() => onGo('wall')}>
          <div className="bub" style={{ background: 'linear-gradient(135deg,#d9822b,#f0a050)' }}><BrickWall size={28} /></div>
          <div>
            <h3>Muros de retención</h3>
            <p className="hint" style={{ fontSize: 13, margin: '4px 0 0' }}>
              Voladizo, gravedad de concreto o mampostería, mampostería reforzada, con contrafuertes internos o externos, con llave de corte, agua, talud, sobrecarga y sismo (Mononobe–Okabe).
            </p>
          </div>
        </div>
        <div className="card big-card" onClick={() => onGo('project')}>
          <div className="bub" style={{ background: 'linear-gradient(135deg,#138a48,#33b36b)' }}><FileText size={28} /></div>
          <div>
            <h3>Memoria de cálculo</h3>
            <p className="hint" style={{ fontSize: 13, margin: '4px 0 0' }}>
              Un documento profesional con datos, hipótesis, fórmulas con valores sustituidos, figuras y cuadro de armado. Exportable a PDF y Word, por elemento o del proyecto completo.
            </p>
          </div>
        </div>
      </div>

      <Card title="Empezar con un ejemplo" icon={<Sparkles size={18} />}>
        <div className="grid2" style={{ gap: 18 }}>
          <div className="stack" style={{ gap: 8 }}>
            <b style={{ fontSize: 13 }}>Fundaciones</b>
            {ex.map((e) => (
              <button key={e.title} className="btn ghost" style={{ justifyContent: 'space-between', textAlign: 'left' }} onClick={() => onAddFooting(e.make())}>
                <span><b>{e.title}</b><br /><span className="hint">{e.desc}</span></span>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <b style={{ fontSize: 13 }}>Muros de retención</b>
            {exw.map((e) => {
              const t = WALL_TYPES.find((w) => w.id === e.type)!;
              return (
                <button key={e.type} className="btn ghost" style={{ justifyContent: 'space-between', textAlign: 'left' }} onClick={() => onAddWall(e.make())}>
                  <span><b>{t.label}</b><br /><span className="hint">{t.desc}</span></span>
                  <ArrowRight size={16} />
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <Card title="Proyecto" icon={<FolderOpen size={18} />}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn" onClick={onNew}><FilePlus2 size={16} /> Nuevo proyecto</button>
          <button className="btn" onClick={onOpen}><FolderOpen size={16} /> Abrir proyecto (.json)</button>
          <button className="btn" onClick={onSave}><Download size={16} /> Guardar proyecto (.json)</button>
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          <ShieldCheck size={13} style={{ verticalAlign: -2 }} /> Todo se calcula en su equipo; los datos se guardan automáticamente en este navegador. Los resultados son una ayuda de cálculo: deben ser revisados y firmados por un ingeniero responsable.
        </p>
      </Card>
      <p className="hint" style={{ textAlign: 'center' }}><Shapes size={12} style={{ verticalAlign: -1 }} /> TerraStruct v1.0</p>
    </div>
  );
}
