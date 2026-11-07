/* Stock de bidones (llenos, vacíos, en clientes) e informes. */
'use strict';

const TIPOS_STOCK = {
  LLENADO: { t: 'Llené bidones', d: 'Vacíos del depósito que llenaste (en la planta o en tu filtro). Pasan de vacíos a llenos.', costo: true },
  COMPRA: { t: 'Compré llenos', d: 'Bidones llenos que compraste a otro (suman llenos).', costo: true },
  ENVASES: { t: 'Envases nuevos', d: 'Envases vacíos que compraste o te devolvieron de otro lado (suman vacíos).', costo: true },
  BAJA: { t: 'Envase roto o perdido', d: 'Envases vacíos que ya no sirven (restan vacíos).' },
  CONTEO: { t: 'Conté el depósito', d: 'Poné lo que hay de verdad y la app corrige la diferencia.' },
};
function stockUI(tipo, pid, luego) {
  const T = TIPOS_STOCK[tipo], p = DB.get('productos', pid);
  const m = modal(`${esc(T.t)} · ${esc(p.nombre)}`, `<p class="muted" style="margin-top:0">${esc(T.d)}</p>
    ${tipo === 'CONTEO' ? `<div class="form"><div class="campo"><label>Llenos que hay</label>${ctrlCant('id="skL"', +p.stock_lleno || 0)}</div>
      ${p.retornable ? `<div class="campo"><label>Vacíos que hay</label>${ctrlCant('id="skV"', +p.stock_vacio || 0)}</div>` : ''}</div>`
      : `<div class="campo"><label>Cantidad</label>${ctrlCant('id="skC"', tipo === 'LLENADO' ? Math.max(0, +p.stock_vacio || 0) : 0)}</div>`}
    ${T.costo ? `<div class="form" style="margin-top:10px"><div class="campo"><label>Cuánto pagaste (opcional, va a gastos)</label>${campoMonto('id="skCo"', '')}</div>
      <div class="campo"><label>Con qué</label><select id="skMe">${opciones(DB.cfg.medios)}</select></div></div>` : ''}
    <div class="campo" style="margin-top:10px"><label>Nota (opcional)</label><input id="skN"></div>`,
    `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" id="skOk">${ico('check')} Guardar</button>`);
  $('#skOk', m).onclick = async () => {
    try {
      await movStock({ tipo, producto_id: p.id, cant: val('skC', m), llenos: val('skL', m), vacios: p.retornable ? val('skV', m) : 0,
        costo: T.costo ? $('#skCo', m).value : 0, medio: val('skMe', m), nota: val('skN', m) });
      m.cerrar(); toast('Stock actualizado'); luego && luego();
    } catch (e) { fallo(e); }
  };
}

PANTALLAS.stock = async (main) => {
  titulo('Stock');
  const st = resumenStock(), movs = DB.todos('stock_movs').slice(-120).reverse();
  main.innerHTML = `${st.map(x => `<div class="card"><h2>${ico('gota')} ${esc(x.p.nombre)}${x.p.retornable ? `<span class="sp"></span><span class="pill">${x.total} envases en total</span>` : ''}</h2>
      <div class="stock-card"><div><b class="${x.llenos < (+DB.cfg.stock_minimo || 0) ? 'mal' : ''}">${x.llenos}</b><small>Llenos</small></div>
        ${x.p.retornable ? `<div><b>${x.vacios}</b><small>Vacíos</small></div><div><b>${x.afuera}</b><small>En clientes</small></div>` : '<div></div><div></div>'}</div>
      ${x.llenos < 0 || x.vacios < 0 ? `<p class="mal chico" style="font-weight:700">Hay números negativos: entregaste más de lo que figuraba. Tocá "Conté el depósito" y poné lo que hay.</p>` : ''}
      <div class="fila" style="margin-top:12px">${x.p.retornable ? `<button class="btn acento" data-sk="LLENADO" data-p="${x.p.id}">${ico('gota')} Llené</button>` : ''}
        <button class="btn" data-sk="COMPRA" data-p="${x.p.id}">Compré llenos</button>${x.p.retornable ? `<button class="btn" data-sk="ENVASES" data-p="${x.p.id}">Envases nuevos</button>
        <button class="btn" data-sk="BAJA" data-p="${x.p.id}">Roto / perdido</button>` : ''}<button class="btn" data-sk="CONTEO" data-p="${x.p.id}">Conté el depósito</button></div></div>`).join('')
      || `<div class="card">${vacio('stock', 'No hay productos activos. Cargalos en Configuración.')}</div>`}
    <div class="card" style="padding:6px 14px"><h2 style="margin:10px 0 4px">Movimientos de stock</h2><p class="muted chico" style="margin:0 0 6px">Las entregas y los vacíos que retirás se descuentan solos.</p>
      <div class="lista">${movs.map(s => `<div class="it" style="cursor:default"><div class="av">${s.tipo === 'CONTEO' ? '≈' : s.dl > 0 || s.dv > 0 ? '+' : '−'}</div><div class="tx"><b>${esc(TIPOS_STOCK[s.tipo]?.t || s.tipo)} · ${esc(DB.get('productos', s.producto_id)?.nombre || '')}</b>
        <small>${dmy(s.fecha)} ${s.fecha.slice(11)} · llenos ${s.dl >= 0 ? '+' : ''}${s.dl}${s.dv ? ` · vacíos ${s.dv >= 0 ? '+' : ''}${s.dv}` : ''}${s.costo ? ' · ' + money(s.costo) : ''}${s.nota ? ' · ' + esc(s.nota) : ''}</small></div></div>`).join('') || vacio('stock', 'Todavía no hay movimientos')}</div></div>`;
  const re = () => PANTALLAS.stock(main);
  main.onclick = e => { const b = e.target.closest('[data-sk]'); if (b) stockUI(b.dataset.sk, b.dataset.p, re); };
};

/* ---------------------------------------------------------------- informes */
let PER_INF = 'mes';
PANTALLAS.informes = async (main) => {
  titulo('Informes');
  const h = hoy(), m1 = h.slice(0, 8) + '01';
  const [d, hasta, nom] = PER_INF === 'mes' ? [m1, h, 'Este mes'] : PER_INF === 'mesant' ? [sumarMeses(m1, -1), sumarDias(m1, -1), 'Mes anterior'] : PER_INF === 'anio' ? [h.slice(0, 4) + '-01-01', h, 'Este año'] : [sumarDias(h, -89), h, 'Últimos 90 días'];
  const r = caja(d, hasta);
  // por mes (últimos 12)
  const meses = [];
  for (let i = 11; i >= 0; i--) { const ini = sumarMeses(m1, -i), fin = i ? sumarDias(sumarMeses(m1, -i + 1), -1) : h, x = caja(ini, fin);
    meses.push({ ini, unid: x.unidades.reduce((s, u) => s + u.cant, 0), vendido: x.vendido, entra: x.entra, gastos: x.gastos }); }
  const maxU = Math.max(1, ...meses.map(x => x.unid));
  // por cliente
  const porCli = {};
  for (const e of r.entregas) { const k = e.cliente_id || 0; const x = porCli[k] = porCli[k] || { id: k, unid: 0, pesos: 0, n: 0 }; x.unid += e.items.reduce((s, l) => s + l.cant, 0); x.pesos += e.total; x.n++; }
  const top = Object.values(porCli).sort((a, b) => b.unid - a.unid).slice(0, 15);
  const gastosCat = {};
  for (const g of r.movs.filter(x => x.tipo === 'GASTO')) gastosCat[g.categoria || 'Otros'] = (gastosCat[g.categoria || 'Otros'] || 0) + g.monto;
  const clientes = clientesActivos(), deuda = clientes.reduce((s, c) => s + Math.max(0, c.saldo || 0), 0);
  const conEnv = clientes.filter(c => totalEnvases(c)).sort((a, b) => totalEnvases(b) - totalEnvases(a));
  main.innerHTML = `<div class="seg" id="inP" style="margin-bottom:12px">${[['mes', 'Este mes'], ['mesant', 'Mes anterior'], ['90', '90 días'], ['anio', 'Año']].map(([k, t]) => `<button data-p="${k}" class="${PER_INF === k ? 'act' : ''}">${t}</button>`).join('')}</div>
    <div class="kpis"><div class="kpi oscuro"><small>Vendido · ${esc(nom)}</small><b>${money(r.vendido)}</b><div class="sub">${r.unidades.map(u => `${u.cant} ${esc(u.nombre)}`).join(' · ') || 'sin ventas'}</div></div>
      <div class="kpi"><small>Cobrado</small><b>${money(r.entra)}</b><div class="sub">incluye deudas viejas</div></div>
      <div class="kpi"><small>Gastos</small><b>${money(r.gastos)}</b><div class="sub">retiros aparte ${money(r.retiros)}</div></div>
      <div class="kpi"><small>Ganancia aprox.</small><b class="${r.entra - r.gastos < 0 ? 'mal' : 'ok'}">${money(r.entra - r.gastos)}</b><div class="sub">cobrado − gastos</div></div></div>
    <div class="grid g2"><div>
      <div class="card"><h2>${ico('informe')} Bidones por mes</h2>${meses.map(x => `<div class="fila" style="margin-bottom:6px;flex-wrap:nowrap"><span style="width:62px" class="chico">${MESES[+x.ini.slice(5, 7) - 1].slice(0, 3)} ${x.ini.slice(2, 4)}</span>
        <div class="barra sp" style="height:14px"><i style="width:${Math.round(x.unid * 100 / maxU)}%"></i></div><b style="width:44px;text-align:right">${x.unid}</b><span class="chico muted" style="width:96px;text-align:right">${money(x.vendido)}</span></div>`).join('')}</div>
      <div class="card"><h2>${ico('caja')} Gastos por tipo</h2><table class="t">${Object.entries(gastosCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r">${money2(v)}</td></tr>`).join('') || '<tr><td class="muted">Sin gastos en el período</td></tr>'}</table></div>
    </div><div>
      <div class="card"><h2>${ico('alumnos')} Los que más compran</h2><table class="t">${top.map(x => `<tr><td>${esc(DB.get('clientes', x.id)?.nombre || 'Cliente borrado')}</td><td class="r">${x.unid} u.</td><td class="r">${money(x.pesos)}</td></tr>`).join('') || '<tr><td class="muted">Sin ventas</td></tr>'}</table></div>
      <div class="card"><h2>${ico('stock')} Envases en clientes</h2><p class="muted chico" style="margin-top:0">Total: ${conEnv.reduce((s, c) => s + totalEnvases(c), 0)} envases en ${conEnv.length} clientes · Te deben en total ${money(deuda)}</p>
        <table class="t">${conEnv.slice(0, 30).map(c => `<tr><td>${esc(c.nombre)}</td><td class="r"><b>${totalEnvases(c)}</b></td><td class="r chico muted">${c.ultima_compra ? 'compró ' + dm(c.ultima_compra) : ''}</td></tr>`).join('') || '<tr><td class="muted">Ningún cliente tiene envases</td></tr>'}</table></div>
    </div></div>`;
  $('#inP').onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; PER_INF = b.dataset.p; PANTALLAS.informes(main); };
};
