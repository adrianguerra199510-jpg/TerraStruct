import { ICON_PNG } from '../report/iconData';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Home as HomeIcon, Building2, BrickWall, Plus, Copy, Trash2, Moon, Sun, FileText, FolderOpen, Download, ClipboardList, FileSpreadsheet, Pickaxe,
} from 'lucide-react';
import { Project, Item, loadProject, saveProject, newProject, normalizeProject, uid } from '../state';
import { FootingInput, defaultFooting } from '../core/footing';
import { WallInput, defaultWall } from '../core/wallTypes';
import { PileInput } from '../core/pileTypes';
import { defaultPileInput } from '../core/pileTypes';
import { UnitsContext, Card, Txt, useToast } from './common';
import { makeFmt } from '../core/units';
import { Home } from './Home';
import { FootingPage } from './FootingPage';
import { WallPage } from './WallPage';
import { PilePage } from './PilePage';
import { ImportDialog } from './ImportDialog';
import { ReportButtons } from './ReportButtons';

type Route = { m: 'home' } | { m: 'project' } | { m: 'footing'; id: string } | { m: 'wall'; id: string } | { m: 'pile'; id: string };

export function App() {
  const [project, setProject] = useState<Project>(() => loadProject());
  const [route, setRoute] = useState<Route>({ m: 'home' });
  const fileRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const toast = useToast();

  useEffect(() => saveProject(project), [project]);
  useEffect(() => {
    document.documentElement.dataset.theme = project.theme;
  }, [project.theme]);

  const fmt = useMemo(() => makeFmt(project.units), [project.units]);
  const ctx = useMemo(() => ({ sys: project.units, fmt }), [project.units, fmt]);

  const footing = route.m === 'footing' ? project.footings.find((f) => f.id === route.id) : undefined;
  const pile = route.m === 'pile' ? project.piles.find((w) => w.id === route.id) : undefined;
  const wall = route.m === 'wall' ? project.walls.find((w) => w.id === route.id) : undefined;

  const addFooting = (data: FootingInput = defaultFooting()) => {
    const it: Item<FootingInput> = { id: uid(), data: { ...data, name: uniqueName(data.name, project.footings.map((f) => f.data.name)) } };
    setProject((p) => ({ ...p, footings: [...p.footings, it] }));
    setRoute({ m: 'footing', id: it.id });
  };
  const addMany = (list: FootingInput[]) => {
    const names = project.footings.map((f) => f.data.name);
    const its: Item<FootingInput>[] = list.map((d) => {
      const nm = uniqueName(d.name, names);
      names.push(nm);
      return { id: uid(), data: { ...d, name: nm } };
    });
    if (!its.length) return;
    setProject((p) => ({ ...p, footings: [...p.footings, ...its] }));
    setRoute({ m: 'footing', id: its[0].id });
    toast.show(`${its.length} zapata(s) creadas`);
  };
  const addPile = (data: PileInput = defaultPileInput()) => {
    const it: Item<PileInput> = { id: uid(), data: { ...data, name: uniqueName(data.name, project.piles.map((f) => f.data.name)) } };
    setProject((p) => ({ ...p, piles: [...p.piles, it] }));
    setRoute({ m: 'pile', id: it.id });
  };
  const removePile = (id: string) => {
    setProject((p) => ({ ...p, piles: p.piles.filter((f) => f.id !== id) }));
    if (route.m === 'pile' && route.id === id) setRoute({ m: 'home' });
  };
  const addWall = (data: WallInput = defaultWall('cantilever')) => {
    const it: Item<WallInput> = { id: uid(), data: { ...data, name: uniqueName(data.name, project.walls.map((w) => w.data.name)) } };
    setProject((p) => ({ ...p, walls: [...p.walls, it] }));
    setRoute({ m: 'wall', id: it.id });
  };
  const removeFooting = (id: string) => {
    setProject((p) => ({ ...p, footings: p.footings.filter((f) => f.id !== id) }));
    if (route.m === 'footing' && route.id === id) setRoute({ m: 'home' });
  };
  const removeWall = (id: string) => {
    setProject((p) => ({ ...p, walls: p.walls.filter((w) => w.id !== id) }));
    if (route.m === 'wall' && route.id === id) setRoute({ m: 'home' });
  };

  const saveFile = () => {
    const blob = new Blob([JSON.stringify(project, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(project.info.name || 'proyecto').replace(/[^\w\-]+/g, '_')}.terrastruct.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast.show('Proyecto guardado en su carpeta de descargas');
  };
  const openFile = (f: File) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        setProject(normalizeProject(JSON.parse(String(r.result))));
        setRoute({ m: 'home' });
        toast.show('Proyecto abierto');
      } catch {
        toast.show('El archivo no es un proyecto válido');
      }
    };
    r.readAsText(f);
  };

  const title =
    route.m === 'home' ? 'Inicio' : route.m === 'project' ? 'Datos del proyecto y memoria completa' : route.m === 'footing' ? footing?.data.name ?? 'Fundación' : route.m === 'pile' ? pile?.data.name ?? 'Pilotes' : wall?.data.name ?? 'Muro';
  const sub =
    route.m === 'footing' ? 'Fundación superficial · ACI 318' : route.m === 'pile' ? 'Pilotes y cabezal · ACI 318 / AISC 360' : route.m === 'wall' ? 'Muro de retención' : route.m === 'project' ? project.info.name : 'Fundaciones y muros de retención';

  return (
    <UnitsContext.Provider value={ctx}>
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onCreate={addMany} />}
      <div className="app">
        <aside className="side">
          <div className="brand" onClick={() => setRoute({ m: 'home' })}>
            <img src={ICON_PNG} alt="TerraStruct" />
            <div>
              <b>TerraStruct</b>
              <span>Fundaciones y muros</span>
            </div>
          </div>
          <button className={'nav-btn' + (route.m === 'home' ? ' active' : '')} onClick={() => setRoute({ m: 'home' })}>
            <HomeIcon size={18} /> <span className="grow">Inicio</span>
          </button>

          <div className="nav-title">
            <span>Fundaciones</span>
            <button className="nav-mini" title="Importar zapatas desde Excel (por paquete)" onClick={() => setImportOpen(true)}><FileSpreadsheet size={15} /></button>
            <button className="nav-mini" title="Nueva fundación" onClick={() => addFooting()}><Plus size={15} /></button>
          </div>
          {project.footings.map((f) => (
            <div className="nav-item-row" key={f.id}>
              <button className={'nav-btn' + (route.m === 'footing' && route.id === f.id ? ' active' : '')} onClick={() => setRoute({ m: 'footing', id: f.id })}>
                <Building2 size={17} /> <span className="grow">{f.data.name}</span>
              </button>
              <button className="nav-mini" title="Duplicar" onClick={() => addFooting(structuredClone(f.data))}><Copy size={14} /></button>
              <button className="nav-mini" title="Eliminar" onClick={() => confirm(`¿Eliminar «${f.data.name}»?`) && removeFooting(f.id)}><Trash2 size={14} /></button>
            </div>
          ))}

          <div className="nav-title">
            <span>Pilotes y cabezales</span>
            <button className="nav-mini" title="Nuevo cabezal con pilotes" onClick={() => addPile()}><Plus size={15} /></button>
          </div>
          {project.piles.map((f) => (
            <div className="nav-item-row" key={f.id}>
              <button className={'nav-btn' + (route.m === 'pile' && route.id === f.id ? ' active' : '')} onClick={() => setRoute({ m: 'pile', id: f.id })}>
                <Pickaxe size={17} /> <span className="grow">{f.data.name}</span>
              </button>
              <button className="nav-mini" title="Duplicar" onClick={() => addPile(structuredClone(f.data))}><Copy size={14} /></button>
              <button className="nav-mini" title="Eliminar" onClick={() => confirm(`¿Eliminar «${f.data.name}»?`) && removePile(f.id)}><Trash2 size={14} /></button>
            </div>
          ))}

          <div className="nav-title">
            <span>Muros de retención</span>
            <button className="nav-mini" title="Nuevo muro" onClick={() => addWall()}><Plus size={15} /></button>
          </div>
          {project.walls.map((w) => (
            <div className="nav-item-row" key={w.id}>
              <button className={'nav-btn' + (route.m === 'wall' && route.id === w.id ? ' active' : '')} onClick={() => setRoute({ m: 'wall', id: w.id })}>
                <BrickWall size={17} /> <span className="grow">{w.data.name}</span>
              </button>
              <button className="nav-mini" title="Duplicar" onClick={() => addWall(structuredClone(w.data))}><Copy size={14} /></button>
              <button className="nav-mini" title="Eliminar" onClick={() => confirm(`¿Eliminar «${w.data.name}»?`) && removeWall(w.id)}><Trash2 size={14} /></button>
            </div>
          ))}

          <div className="nav-title"><span>Documento</span></div>
          <button className={'nav-btn' + (route.m === 'project' ? ' active' : '')} onClick={() => setRoute({ m: 'project' })}>
            <ClipboardList size={18} /> <span className="grow">Proyecto y memoria</span>
          </button>

          <div className="side-foot">
            <div className="nav-title" style={{ padding: '0 4px' }}><span>Unidades</span></div>
            <div className="seg">
              <button className={project.units === 'SI' ? 'on' : ''} onClick={() => setProject({ ...project, units: 'SI' })}>kN · kPa · MPa</button>
              <button className={project.units === 'TEC' ? 'on' : ''} onClick={() => setProject({ ...project, units: 'TEC' })}>tonf · kgf/cm²</button>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn small" style={{ flex: 1, background: 'rgba(255,255,255,.08)', color: '#dbe7f7', borderColor: 'rgba(255,255,255,.15)' }} onClick={() => fileRef.current?.click()}><FolderOpen size={14} /> Abrir</button>
              <button className="btn small" style={{ flex: 1, background: 'rgba(255,255,255,.08)', color: '#dbe7f7', borderColor: 'rgba(255,255,255,.15)' }} onClick={saveFile}><Download size={14} /> Guardar</button>
              <button className="btn small" title="Tema claro/oscuro" style={{ background: 'rgba(255,255,255,.08)', color: '#dbe7f7', borderColor: 'rgba(255,255,255,.15)' }} onClick={() => setProject({ ...project, theme: project.theme === 'dark' ? 'light' : 'dark' })}>
                {project.theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              </button>
            </div>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openFile(f); e.target.value = ''; }} />
          </div>
        </aside>

        <main className="main">
          <div className="topbar">
            <div>
              <h1>{title}</h1>
              <div className="sub">{sub}</div>
            </div>
            <span className="spacer" />
            <span className="chip"><FileText size={13} /> {project.info.name}</span>
          </div>
          <div className={'content' + (route.m === 'footing' || route.m === 'wall' || route.m === 'pile' ? ' fill' : '')}>
            {route.m === 'home' && (
              <Home
                onGo={(m) => {
                  if (m === 'project') setRoute({ m: 'project' });
                  else if (m === 'pile') (project.piles[0] ? setRoute({ m: 'pile', id: project.piles[0].id }) : addPile());
                  else if (m === 'footing') setRoute(project.footings[0] ? { m: 'footing', id: project.footings[0].id } : { m: 'home' });
                  else setRoute(project.walls[0] ? { m: 'wall', id: project.walls[0].id } : { m: 'home' });
                }}
                onAddFooting={(f) => addFooting(f)}
                onAddWall={(w) => addWall(w)}
                onAddPile={(x) => addPile(x)}
                onOpen={() => fileRef.current?.click()}
                onSave={saveFile}
                onNew={() => confirm('¿Descartar el proyecto actual y empezar uno nuevo?') && (setProject(newProject()), setRoute({ m: 'home' }))}
              />
            )}
            {route.m === 'footing' && footing && (
              <FootingPage
                key={footing.id}
                data={footing.data}
                theme={project.theme}
                info={project.info}
                onChange={(d) => setProject((p) => ({ ...p, footings: p.footings.map((f) => (f.id === footing.id ? { ...f, data: d } : f)) }))}
              />
            )}
            {route.m === 'pile' && pile && (
              <PilePage
                key={pile.id}
                data={pile.data}
                theme={project.theme}
                info={project.info}
                onChange={(d) => setProject((p) => ({ ...p, piles: p.piles.map((w) => (w.id === pile.id ? { ...w, data: d } : w)) }))}
              />
            )}
            {route.m === 'wall' && wall && (
              <WallPage
                key={wall.id}
                data={wall.data}
                theme={project.theme}
                info={project.info}
                onChange={(d) => setProject((p) => ({ ...p, walls: p.walls.map((w) => (w.id === wall.id ? { ...w, data: d } : w)) }))}
              />
            )}
            {route.m === 'project' && <ProjectPage project={project} setProject={setProject} />}
          </div>
        </main>
        {toast.msg && <div className="toast">{toast.msg}</div>}
      </div>
    </UnitsContext.Provider>
  );
}

function uniqueName(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base;
  const m = base.match(/^(.*?)(\d+)$/);
  const stem = m ? m[1] : base + ' ';
  let n = m ? parseInt(m[2], 10) + 1 : 2;
  while (existing.includes(stem + n)) n++;
  return stem + n;
}

function ProjectPage({ project, setProject }: { project: Project; setProject: (p: Project) => void }) {
  const i = project.info;
  const set = (patch: Partial<Project['info']>) => setProject({ ...project, info: { ...i, ...patch } });
  return (
    <div className="stack" style={{ maxWidth: 980 }}>
      <Card title="Datos del proyecto (aparecen en la carátula de la memoria)" icon={<ClipboardList size={18} />}>
        <div className="grid2">
          <Txt label="Nombre del proyecto" value={i.name} onChange={(v) => set({ name: v })} />
          <Txt label="Cliente / propietario" value={i.client} onChange={(v) => set({ client: v })} />
          <Txt label="Ubicación" value={i.location} onChange={(v) => set({ location: v })} />
          <Txt label="Ingeniero responsable" value={i.engineer} onChange={(v) => set({ engineer: v })} />
          <Txt label="Matrícula / registro profesional" value={i.license} onChange={(v) => set({ license: v })} />
          <Txt label="Fecha" value={i.date} onChange={(v) => set({ date: v })} />
          <Txt label="Revisión" value={i.revision} onChange={(v) => set({ revision: v })} />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>Notas generales de la memoria</label>
          <div className="inp">
            <textarea rows={3} style={{ width: '100%', border: 0, background: 'transparent', padding: 8, resize: 'vertical' }} value={i.notes} onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </div>
      </Card>
      <ReportButtons kind="project" project={project} info={project.info} />
    </div>
  );
}
