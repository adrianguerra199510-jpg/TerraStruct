import React from 'react';
import { Block, ReportDoc } from '../report/model';

const alignCls = (a?: string) => (a === 'r' ? 'r' : a === 'c' ? 'c' : '');

/** Vista en pantalla de la memoria: es exactamente el contenido que se exporta a PDF y Word. */
export function ReportView({ doc }: { doc: ReportDoc }) {
  const heads: { b: { t: 'h1' | 'h2' | 'h3'; text: string }; i: number }[] = [];
  doc.blocks.forEach((b, i) => {
    if (b.t === 'h1' || b.t === 'h2') heads.push({ b: { t: b.t, text: b.text }, i });
  });
  const info = doc.info;
  return (
    <div className="paper">
      <div className="paper-cover">
        <div className="paper-kicker">MEMORIA DE CÁLCULO</div>
        <h1>{doc.title}</h1>
        <div className="paper-sub">{doc.subtitle}</div>
        <table className="paper-info">
          <tbody>
            {([['Proyecto', info.name], ['Cliente', info.client || '—'], ['Ubicación', info.location || '—'], ['Ingeniero responsable', info.engineer || '—'], ['Fecha', info.date], ['Revisión', info.revision || '—']] as [string, string][]).map(([k, v]) => (
              <tr key={k}>
                <th>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="paper-toc">
        <b>Contenido</b>
        {heads.map(({ b, i }) => (
          <a key={i} className={b.t === 'h2' ? 'sub' : ''} href={`#rp-${i}`} onClick={(e) => { e.preventDefault(); document.getElementById(`rp-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
            {b.text}
          </a>
        ))}
      </nav>
      {doc.blocks.map((b, i) => (
        <BlockView key={i} b={b} id={`rp-${i}`} />
      ))}
    </div>
  );
}

function BlockView({ b, id }: { b: Block; id: string }) {
  switch (b.t) {
    case 'h1':
      return <h2 id={id} className="rp-h1">{b.text}</h2>;
    case 'h2':
      return <h3 id={id} className="rp-h2">{b.text}</h3>;
    case 'h3':
      return <h4 className="rp-h3">{b.text}</h4>;
    case 'p':
      return <p className={'rp-p' + (b.small ? ' small' : '')} style={{ fontWeight: b.bold ? 700 : 400, fontStyle: b.italic ? 'italic' : 'normal', textAlign: b.align ?? 'left' }}>{b.text}</p>;
    case 'bullets':
      return <ul className="rp-ul">{b.items.map((t, i) => <li key={i}>{t}</li>)}</ul>;
    case 'kv': {
      const cols = b.cols ?? 1;
      const rows: [string, string, string?, string?][] = [];
      if (cols === 1) b.rows.forEach(([k, v]) => rows.push([k, v]));
      else for (let i = 0; i < b.rows.length; i += 2) rows.push([b.rows[i][0], b.rows[i][1], b.rows[i + 1]?.[0], b.rows[i + 1]?.[1]]);
      return (
        <div className="rp-scroll">
          <table className="rp-tbl kv">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <th>{r[0]}</th>
                  <td>{r[1]}</td>
                  {cols === 2 && <><th>{r[2] ?? ''}</th><td>{r[3] ?? ''}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case 'table':
      return (
        <div className="rp-scroll">
          {b.caption && <div className="rp-cap">{b.caption}</div>}
          <table className="rp-tbl">
            <thead>
              <tr>{b.head.map((h, i) => <th key={i} className={alignCls(b.align?.[i])}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri} className={b.boldLast && ri === b.rows.length - 1 ? 'last' : ''}>
                  {r.map((c, i) => <td key={i} className={alignCls(b.align?.[i])}>{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'eq':
      return (
        <div className="rp-eq">
          {b.title && <div className="rp-eq-t">{b.title}</div>}
          {b.lines.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      );
    case 'img':
      return (
        <figure className="rp-fig" style={{ width: `${Math.round((b.widthRatio ?? 1) * 100)}%` }}>
          <div dangerouslySetInnerHTML={{ __html: b.svg }} />
          {b.caption && <figcaption>{b.caption}</figcaption>}
        </figure>
      );
    case 'status':
      return (
        <div className="rp-scroll">
          <table className="rp-tbl">
            <thead><tr><th>Verificación</th><th>Detalle</th><th className="r">Relación</th><th className="c">Resultado</th></tr></thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>
                  <td><b>{r.name}</b></td>
                  <td>{r.detail}</td>
                  <td className="r">{isFinite(r.ratio) ? r.ratio.toFixed(2) : '>9.99'}</td>
                  <td className={'c st ' + (r.ok ? 'ok' : r.advisory ? 'warn' : 'bad')}>{r.ok ? 'CUMPLE' : r.advisory ? 'REVISAR' : 'NO CUMPLE'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'pagebreak':
      return <hr className="rp-break" />;
  }
}
