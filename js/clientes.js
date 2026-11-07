/* Clientes: lista, ficha y alta/modificación. */
'use strict';

let FILTRO_CLI = 'todos', BUSCA_CLI = '', DIA_CLI = '';
const diasTexto = c => (c.dias || []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(d => DIAS_C[d]).join('-');
const linkMapa = c => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([c.direccion, DB.cfg.ciudad].filter(Boolean).join(', '));

PANTALLAS.clientes = async (main) => {
  titulo('Clientes');
  const todos = DB.todos('clientes');
  main.innerHTML = `<div class="fila" style="margin-bottom:12px">
      <div class="buscar">${ico('buscar')}<input id="cBus" placeholder="Buscar por nombre, dirección o teléfono" value="${esc(BUSCA_CLI)}" autocomplete="off"></div>
      <select id="cDia" style="width:auto;min-width:140px">${opciones([1, 2, 3, 4, 5, 6, 0].map(d => ({ v: d, t: DIAS[d] })), DIA_CLI, 'Todos los días')}</select>
      <button class="btn acento" id="cNuevo">${ico('plus')} Cliente</button></div>
    <div class="seg" id="cFil" style="margin-bottom:12px">${[['todos', 'Todos'], ['deben', 'Deben'], ['envases', 'Con envases'], ['favor', 'A favor'], ['inactivos', 'Dados de baja']]
      .map(([k, t]) => `<button data-f="${k}" class="${FILTRO_CLI === k ? 'act' : ''}">${t}</button>`).join('')}</div>
    <div class="card" style="padding:6px 14px"><div class="lista" id="cLista"></div></div>`;
  const pintar = () => {
    let l = FILTRO_CLI === 'inactivos' ? todos.filter(c => c.activo === false) : todos.filter(c => c.activo !== false);
    if (FILTRO_CLI === 'deben') l = l.filter(c => (c.saldo || 0) > 0.009);
    if (FILTRO_CLI === 'favor') l = l.filter(c => (c.saldo || 0) < -0.009);
    if (FILTRO_CLI === 'envases') l = l.filter(c => totalEnvases(c) > 0);
    if (DIA_CLI !== '') l = l.filter(c => (c.dias || []).includes(+DIA_CLI));
    if (BUSCA_CLI) l = l.filter(c => coincide(`${c.nombre} ${c.direccion || ''} ${c.zona || ''} ${c.telefono || ''}`, BUSCA_CLI));
    l.sort((a, b) => FILTRO_CLI === 'deben' ? b.saldo - a.saldo : a.nombre.localeCompare(b.nombre, 'es'));
    $('#cLista').innerHTML = l.map(c => `<div class="it" data-cli="${c.id}"><div class="av">${esc(iniciales(c.nombre))}</div><div class="tx"><b>${esc(c.nombre)}</b>
        <small>${esc(c.direccion || 'Sin dirección')}${c.zona ? ' · ' + esc(c.zona) : ''}${c.dias && c.dias.length ? ' · ' + diasTexto(c) : ''}</small></div>
        ${totalEnvases(c) ? `<span class="pill info">${totalEnvases(c)} env.</span>` : ''}${Math.abs(c.saldo || 0) > 0.009 ? `<span class="pill ${claseSaldo(c.saldo)}">${textoSaldo(c.saldo)}</span>` : ''}</div>`).join('')
      || vacio('alumnos', todos.length ? 'No hay clientes con ese filtro' : 'Todavía no cargaste clientes. Tocá "+ Cliente".');
    if (FILTRO_CLI === 'deben' && l.length) $('#cLista').insertAdjacentHTML('afterbegin', `<div class="fila" style="padding:10px 4px;border-bottom:1px solid var(--borde)"><b class="sp">Total que te deben</b><b class="mal">${money2(l.reduce((s, c) => s + c.saldo, 0))}</b></div>`);
  };
  pintar();
  $('#cBus').oninput = debounce(e => { BUSCA_CLI = e.target.value; pintar(); }, 150);
  $('#cDia').onchange = e => { DIA_CLI = e.target.value; pintar(); };
  $('#cFil').onclick = e => { const b = e.target.closest('[data-f]'); if (!b) return; FILTRO_CLI = b.dataset.f; $$('#cFil button').forEach(x => x.classList.toggle('act', x === b)); pintar(); };
  $('#cNuevo').onclick = () => editarCliente({}, c => ir('ficha', { id: c.id }, true));
  $('#cLista').onclick = e => { const b = e.target.closest('[data-cli]'); if (b) ir('ficha', { id: +b.dataset.cli }, true); };
};

function editarCliente(c, luego) {
  const prods = productosActivos(), dias = new Set(c.dias || []);
  const m = modal(c.id ? 'Modificar cliente' : 'Nuevo cliente', `<div class="form">
      <div class="campo full"><label>Nombre (o negocio)</label><input id="ec_n" value="${esc(c.nombre || '')}" autofocus></div>
      <div class="campo full"><label>Dirección</label><input id="ec_d" value="${esc(c.direccion || '')}" placeholder="Calle y número, entre calles, color de casa…"></div>
      <div class="campo"><label>Zona / barrio</label><input id="ec_z" list="ecZonas" value="${esc(c.zona || '')}"><datalist id="ecZonas">${(DB.cfg.zonas || []).map(z => `<option value="${esc(z)}">`).join('')}</datalist></div>
      <div class="campo"><label>Teléfono / WhatsApp</label><input id="ec_t" type="tel" inputmode="tel" value="${esc(c.telefono || '')}"></div>
      <div class="campo full"><label>Días que le llevás</label><div class="pasos" id="ecDias">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button type="button" class="paso ${dias.has(d) ? 'logrado' : ''}" data-d="${d}">${DIAS_C[d]}</button>`).join('')}</div></div>
      <div class="campo full"><label>Pedido de siempre (se propone al entregar)</label>${prods.map(p => `<div class="fila" style="margin-bottom:6px"><span class="sp">${esc(p.nombre)}</span>
        <input data-ped="${p.id}" inputmode="numeric" style="width:80px;text-align:center" value="${esc((c.pedido || {})[p.id] ?? '')}" placeholder="0"></div>`).join('')}</div>
      ${prods.filter(p => p.retornable).length ? `<div class="campo full"><label>Envases nuestros que tiene ahora${c.id ? ' (corregir sólo si está mal)' : ''}</label>${prods.filter(p => p.retornable).map(p => `<div class="fila" style="margin-bottom:6px"><span class="sp">${esc(p.nombre)}</span>
        <input data-env="${p.id}" inputmode="numeric" style="width:80px;text-align:center" value="${envasesDe(c, p.id)}"></div>`).join('')}</div>` : ''}
      <div class="campo full"><label>Precio especial (opcional, vacío = precio normal)</label>${prods.map(p => `<div class="fila" style="margin-bottom:6px"><span class="sp">${esc(p.nombre)} <span class="muted chico">(normal ${money(p.precio)})</span></span>
        ${campoMonto(`data-pre="${p.id}" style="width:120px;text-align:right"`, (c.precios || {})[p.id] ?? '')}</div>`).join('')}</div>
      ${!c.id ? `<div class="campo full"><label>Si ya te debía algo (opcional)</label>${campoMonto('id="ec_sal"', '')}</div>` : ''}
      <div class="campo full"><label>Notas</label><textarea id="ec_no" placeholder="Ej. dejar en la portería, perro bravo, paga los viernes">${esc(c.notas || '')}</textarea></div>
      ${c.id ? `<div class="campo full"><label class="chk"><input type="checkbox" id="ec_ac" ${c.activo !== false ? 'checked' : ''}> Sigue siendo cliente (si lo destildás, sale del reparto)</label></div>` : ''}
    </div>`, `${c.id ? `<button class="btn rojo" id="ecBorrar">${ico('trash')} Borrar definitivamente</button>` : ''}<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" id="ecOk">${ico('check')} Guardar</button>`, 'ancho');
  $('#ecDias', m).onclick = e => { const b = e.target.closest('[data-d]'); if (!b) return; const d = +b.dataset.d; dias.has(d) ? dias.delete(d) : dias.add(d); b.classList.toggle('logrado'); };
  if ($('#ecBorrar', m)) $('#ecBorrar', m).onclick = () => { m.cerrar(); borrarClienteUI(c); };
  $('#ecOk', m).onclick = async () => {
    try {
      const nombre = val('ec_n', m).replace(/\s+/g, ' '); if (nombre.length < 2) throw new Error('Escribí el nombre');
      const pedido = {}, envases = Object.assign({}, c.envases), precios = {};
      for (const i of $$('[data-ped]', m)) { const n = parseInt(i.value) || 0; if (n < 0) throw new Error('Pedido inválido'); if (n) pedido[i.dataset.ped] = n; }
      let cambioEnv = [];
      for (const i of $$('[data-env]', m)) { const n = parseInt(i.value); if (isNaN(n) || n < 0) throw new Error('Revisá los envases'); if (n !== envasesDe(c, i.dataset.env)) cambioEnv.push(`${DB.get('productos', i.dataset.env).nombre}: ${envasesDe(c, i.dataset.env)} → ${n}`); envases[i.dataset.env] = n; }
      for (const i of $$('[data-pre]', m)) { if (!i.value.trim()) continue; const v = aNum(i.value); if (isNaN(v) || v < 0) throw new Error('Precio especial inválido'); precios[i.dataset.pre] = r2(v); }
      const nuevo = !c.id;
      if (nuevo) { const s = $('#ec_sal', m).value.trim(); c.saldo = s ? r2(n0(s)) : 0; c.alta = hoy(); c.orden = Math.max(0, ...DB.todos('clientes').map(x => x.orden || 0)) + 1; }
      Object.assign(c, { nombre, direccion: val('ec_d', m), zona: val('ec_z', m), telefono: val('ec_t', m), dias: [...dias], pedido, envases, precios, notas: val('ec_no', m),
        activo: nuevo ? true : $('#ec_ac', m).checked });
      const g = await DB.guardar('clientes', c);
      if (c.zona && !(DB.cfg.zonas || []).includes(c.zona)) await DB.setCfg('zonas', [...(DB.cfg.zonas || []), c.zona].sort());
      await DB.anotar(nuevo ? 'Cliente nuevo' : 'Cliente modificado', nombre + (cambioEnv.length && !nuevo ? ' · envases corregidos: ' + cambioEnv.join(', ') : ''));
      m.cerrar(); toast('Guardado'); luego && luego(g);
    } catch (e) { fallo(e); }
  };
}

async function borrarCliente(id) {
  DB.verificarEscritura();
  const c = DB.get('clientes', id); if (!c) throw new Error('Ese cliente no existe');
  for (const v of DB.donde('visitas', v => v.cliente_id === c.id)) await DB.borrar('visitas', v.id);
  for (const t of ['entregas', 'cobranzas']) for (const x of DB.donde(t, x => x.cliente_id === c.id)) { x.cliente_id = null; x.cliente_borrado = true; await DB.guardar(t, x); }
  await DB.borrar('clientes', c.id);
  await DB.anotar('Cliente borrado definitivamente', `N° ${c.id}`);
}
async function borrarClienteUI(c) {
  if (DB.cfg.pin && !DESBLOQUEADO && !await pedirPin('borrar un cliente')) return;
  const avisos = [(c.saldo || 0) > 0.009 ? `debe ${money2(c.saldo)}` : '', totalEnvases(c) ? `tiene ${totalEnvases(c)} envase(s) tuyos` : ''].filter(Boolean);
  if (!await confirmar(`Se borran <b>para siempre</b> los datos de <b>${esc(c.nombre)}</b>. Sus ventas y cobros quedan en la caja pero sin el nombre.
      ${avisos.length ? `<br><br><b class="mal">Ojo: ${avisos.join(' y ')}.</b>` : ''}
      <br><br><span class="muted chico">Si sólo dejó de comprar, mejor destildá "Sigue siendo cliente". Las copias de seguridad hechas antes pueden seguir teniendo sus datos.</span>`, 'Borrar para siempre', true)) return;
  try { await borrarCliente(c.id); toast('Cliente borrado'); ir('clientes'); } catch (e) { fallo(e); }
}

PANTALLAS.ficha = async (main, { id }) => {
  const c = DB.get('clientes', id); if (!c) { main.innerHTML = vacio('alumnos', 'Ese cliente no existe'); return; }
  titulo(c.nombre);
  const ret = productosActivos().filter(p => p.retornable);
  const movs = [...DB.donde('entregas', e => e.cliente_id === c.id).map(e => ({ f: e.fecha, t: 'E', x: e })), ...DB.donde('cobranzas', x => x.cliente_id === c.id).map(x => ({ f: x.fecha, t: 'C', x })),
    ...DB.donde('visitas', v => v.cliente_id === c.id).map(v => ({ f: v.fecha + ' 99', t: 'V', x: v }))].sort((a, b) => b.f.localeCompare(a.f)).slice(0, 80);
  main.innerHTML = `<div class="card"><div class="ficha-cab"><div class="av g">${esc(iniciales(c.nombre))}</div><div class="tx"><h2>${esc(c.nombre)}</h2>
      <div class="muted chico">${esc(c.direccion || 'Sin dirección')}${c.zona ? ' · ' + esc(c.zona) : ''}</div>
      <div class="muted chico">${c.dias && c.dias.length ? 'Reparto: ' + diasTexto(c) : 'Sin días de reparto'}${c.activo === false ? ' · <b class="mal">Dado de baja</b>' : ''}</div></div>
      <div class="fila">${c.direccion ? `<a class="btn" href="${linkMapa(c)}" target="_blank" rel="noopener">${ico('mapa')} Mapa</a>` : ''}${c.telefono ? `<a class="btn" href="tel:${esc(c.telefono)}">${ico('tel')}</a><button class="btn" id="fWa">${ico('wa')}</button>` : ''}
        <button class="btn" id="fEd">${ico('lapiz')} Modificar</button></div></div>
      ${c.notas ? `<p class="muted" style="margin:10px 0 0;white-space:pre-wrap">${esc(c.notas)}</p>` : ''}</div>
    <div class="estado-cuota ${claseSaldo(c.saldo) === 'info' ? 'ok' : claseSaldo(c.saldo)}" style="margin-bottom:14px"><div class="tx"><b>${textoSaldo(c.saldo)}</b>
      <div class="chico">${ret.map(p => `${envasesDe(c, p.id)} ${esc(p.nombre)}`).join(' · ') || ''}${ret.length ? ' (envases tuyos que tiene)' : ''}</div></div>
      ${c.telefono ? `<button class="btn" id="fCuenta">${ico('wa')} Mandar cuenta</button>` : ''}<button class="btn" id="fCob">${ico('caja')} Cobrar</button><button class="btn acento" id="fEnt">${ico('gota')} Entrega</button></div>
    <div class="card" style="padding:6px 14px"><h2 style="margin:10px 0 4px">Movimientos</h2><div class="lista">${movs.map(m => {
      if (m.t === 'V') return `<div class="it" style="cursor:default"><div class="av">–</div><div class="tx"><b>Visita sin venta</b><small>${dmy(m.x.fecha)} · ${esc(m.x.motivo)}</small></div></div>`;
      if (m.t === 'C') return `<div class="it" data-cb="${m.x.id}" style="${m.x.estado !== 'ACTIVO' ? 'opacity:.5' : ''}"><div class="av">$</div><div class="tx"><b>Pagó</b><small>${dmy(m.x.fecha)} · ${m.x.pagos.map(p => esc(p.medio)).join(' + ')}${m.x.estado !== 'ACTIVO' ? ' · ANULADO' : ''}</small></div><b class="num ok">${money2(m.x.monto)}</b></div>`;
      const e = m.x, deja = r2(e.total - e.pagado);
      return `<div class="it" data-en="${e.id}" style="${e.estado !== 'ACTIVO' ? 'opacity:.5' : ''}"><div class="av">${ico('gota')}</div><div class="tx"><b>${e.items.map(l => `${l.cant} ${esc(l.nombre)}`).join(', ') || 'Retiró vacíos'}</b>
        <small>${dmy(e.fecha)}${Object.values(e.vacios || {}).some(Boolean) ? ' · retiró ' + Object.values(e.vacios).reduce((s, n) => s + n, 0) + ' vacío(s)' : ''} · ${deja > 0.009 ? 'fiado ' + money(deja) : deja < -0.009 ? 'pagó también ' + money(-deja) + ' de antes' : 'pagado'}${e.estado !== 'ACTIVO' ? ' · ANULADA' : ''}</small></div><b class="num">${money2(e.total)}</b></div>`; }).join('')
      || vacio('gota', 'Todavía no tiene movimientos')}</div></div>`;
  const re = () => ir('ficha', { id }, false).then(() => { $('#btnAtras').hidden = !PILA.length; });
  $('#fEd').onclick = () => editarCliente(c, re);
  if ($('#fWa')) $('#fWa').onclick = () => abrirWa(c.telefono, `Hola ${c.nombre.split(' ')[0]}! `);
  if ($('#fCuenta')) $('#fCuenta').onclick = () => abrirWa(c.telefono, mensajeCuenta(c));
  $('#fCob').onclick = () => cobrarUI(c.id, re);
  $('#fEnt').onclick = () => nuevaEntrega(c.id, re);
  main.onclick = e => { const a = e.target.closest('[data-en]'), b = e.target.closest('[data-cb]'); if (a) verEntrega(+a.dataset.en, re); if (b) verCobranza(+b.dataset.cb, re); };
};

function elegirCliente(tituloV, luego) {
  const m = modal(tituloV, `<div class="buscar" style="margin-bottom:10px">${ico('buscar')}<input id="elB" placeholder="Nombre o dirección" autofocus autocomplete="off"></div><div class="lista" id="elL"></div>`,
    `<button class="btn" data-cerrar>Cancelar</button><button class="btn" id="elN">${ico('plus')} Cliente nuevo</button>`);
  const p = q => {
    let l = clientesActivos(); if (q) l = l.filter(c => coincide(`${c.nombre} ${c.direccion || ''} ${c.zona || ''}`, q));
    $('#elL', m).innerHTML = l.slice(0, 60).map(c => `<div class="it" data-el="${c.id}"><div class="av">${esc(iniciales(c.nombre))}</div><div class="tx"><b>${esc(c.nombre)}</b><small>${esc(c.direccion || '')}</small></div>
      ${Math.abs(c.saldo || 0) > 0.009 ? `<span class="pill ${claseSaldo(c.saldo)}">${textoSaldo(c.saldo)}</span>` : ''}</div>`).join('') || vacio('alumnos', 'No hay clientes');
  };
  p('');
  $('#elB', m).oninput = e => p(e.target.value);
  $('#elL', m).onclick = e => { const b = e.target.closest('[data-el]'); if (b) { m.cerrar(); luego(DB.get('clientes', b.dataset.el)); } };
  $('#elN', m).onclick = () => { m.cerrar(); editarCliente({}, luego); };
}
