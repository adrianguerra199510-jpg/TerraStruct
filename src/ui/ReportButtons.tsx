import React, { useState } from 'react';
import { FileText, FileDown, Loader2, FileType2, Eye } from 'lucide-react';
import { FootingInput } from '../core/footing';
import { WallInput } from '../core/wallTypes';
import { Project, ProjectInfo } from '../state';
import { Card, Alert, useUnits } from './common';
import { reportForFooting, reportForProject, reportForWall, renderReport, downloadBlob, safeFile, Format } from '../report';

export function ReportButtons({ kind, footing, wall, project, info: infoProp }: { kind: 'footing' | 'wall' | 'project'; footing?: FootingInput; wall?: WallInput; project?: Project; info: ProjectInfo }) {
  const { fmt } = useUnits();
  const [busy, setBusy] = useState<Format | 'preview' | null>(null);
  const [error, setError] = useState('');
  const info = project?.info ?? infoProp;

  const make = async (format: Format, preview = false) => {
    setBusy(preview ? 'preview' : format);
    setError('');
    try {
      await new Promise((r) => setTimeout(r, 30));
      const inf = info;
      const doc = kind === 'footing' ? reportForFooting(footing!, fmt, inf) : kind === 'wall' ? reportForWall(wall!, fmt, inf) : reportForProject(project!, fmt);
      const blob = await renderReport(doc, format);
      const name = safeFile(kind === 'footing' ? `Memoria_${footing!.name}` : kind === 'wall' ? `Memoria_${wall!.name}` : `Memoria_${inf.name}`) + (format === 'pdf' ? '.pdf' : '.docx');
      if (preview) window.open(URL.createObjectURL(blob), '_blank');
      else downloadBlob(blob, name);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  };

  const what =
    kind === 'footing'
      ? 'datos de entrada, hipótesis, presiones sobre el suelo, deslizamiento y volcamiento, diseño a flexión, cortante y punzonamiento con las fórmulas y los valores sustituidos, figuras y cuadro de armado.'
      : kind === 'wall'
        ? 'datos, coeficientes de empuje, fuerzas y momentos, verificaciones de estabilidad, diseño estructural de cada elemento con fórmulas y valores, figuras y cuadro de armado.'
        : 'carátula con los datos del proyecto, resumen y la memoria de todas las fundaciones y muros del proyecto.';
  return (
    <Card title="Memoria de cálculo" icon={<FileText size={18} />}>
      <div className="stack">
        <p style={{ margin: 0 }}>
          Genera un documento profesional con carátula, contenido, {what} Se usan las unidades seleccionadas ({fmt.sys === 'SI' ? 'kN · kPa · MPa' : 'tonf · kgf/cm²'}). Complete antes los datos del proyecto en «Proyecto y memoria».
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn primary" disabled={!!busy} onClick={() => make('pdf')}>
            {busy === 'pdf' ? <Loader2 size={17} className="spin" /> : <FileDown size={17} />} Descargar PDF
          </button>
          <button className="btn accent" disabled={!!busy} onClick={() => make('docx')}>
            {busy === 'docx' ? <Loader2 size={17} className="spin" /> : <FileType2 size={17} />} Descargar Word (.docx)
          </button>
          <button className="btn" disabled={!!busy} onClick={() => make('pdf', true)}>
            {busy === 'preview' ? <Loader2 size={17} className="spin" /> : <Eye size={17} />} Vista previa del PDF
          </button>
        </div>
        {busy && <span className="hint">Generando el documento…</span>}
        {error && <Alert>No se pudo generar el documento: {error}</Alert>}
      </div>
    </Card>
  );
}
