/* Reparto del día, entrega (con cobro o fiado), cobro de deuda y comprobantes. */
'use strict';

/* control +/- para cantidades */
const ctrlCant = (attr, v) => `<div class="cant"><button type="button" data-menos>−</button><input ${attr} inputmode="numeric" value="${v}"><button type="button" data-mas>+</button></div>`;
document.addEventListener('click', e => {
  const b = e.target.closest('.cant [data-menos], .cant [data-mas]'); if (!b) return;
  const i = b.parentElement.querySelector('input'); const n = Math.max(0, (parseInt(i.value) || 0) + (b.dataset.mas !== undefined ? 1 : -1));
  i.value = n; i.dispatchEvent(new Event('input', { bubbles: true }));
});

function nuevaEntrega(cid, luego, fecha) {
  if (!cid) return elegirCliente('¿A quién le entregás?', c => nuevaEntrega(c.id, luego, fecha));
  const c = DB.get('clientes', cid), prods = productosActivos();
  if (!prods.length) return toast('Primero cargá los productos en Configuración', true);
  if (prods.every(p => !p.precio) && !prods.some(p => (c.precios || {})[p.id])) toast('Ojo: los productos no tienen precio (Configuración)', true);
  const ped = c.pedido || {}, hayPedido = Object.values(ped).some(Boolean);
  const cantIni = p => ped[p.id] !== undefined ? ped[p.id] : (!hayPedido && p === prods[0] ? 1 : 0);
  const m = modal(`${ico('gota')} Entrega`, `<div class="fila" style="margin-bottom:6px"><div class="av">${esc(iniciales(c.nombre))}</div><div class="sp"><b>${esc(c.nombre)}</b>
      <div class="chico muted">${esc(c.direccion || '')}</div></div><span class="pill ${claseSaldo(c.saldo)}">${textoSaldo(c.saldo)}</span></div>
    ${prods.map(p => `<div class="prod-fila"><div class="tx"><b>${esc(p.nombre)}</b><div class="chico muted">Precio ${campoMonto(`data-pr="${p.id}" style="width:110px;display:inline-block;min-height:34px;padding:4px 8px"`, precioDe(c, p))}</div></div>
      ${ctrlCant(`data-ct="${p.id}"`, cantIni(p))}</div>
      ${p.retornable ? `<div class="prod-fila" style="padding-top:2px"><div class="tx chico"><b>Vacíos que te devuelve</b><div class="muted">Tenía ${envasesDe(c, p.id)} tuyos</div></div>${ctrlCant(`data-vc="${p.id}"`, Math.min(cantIni(p), envasesDe(c, p.id)))}</div>` : ''}`).join('')}
    <div id="enTot" style="font-size:22px;font-weight:900;margin:12px 0 6px"></div>
    <div class="seg" id="enModo" style="margin-bottom:10px"><button data-md="paga" class="act">Paga ahora</button><button data-md="fiado">Fiado</button>${(c.saldo || 0) > 0.009 ? '<button data-md="todo">Paga + lo que debía</button>' : ''}</div>
    <div id="enP"></div><div class="resumen-pago" id="enRes"></div>
    <div class="form" style="margin-top:10px"><div class="campo"><label>Nota (opcional)</label><input id="enN"></div><div class="campo"><label>Fecha</label><input type="date" id="enF" value="${fecha || hoy()}"></div></div>`,
    `<button class="btn" data-cerrar>Cancelar</button><button class="btn acento" id="enOk">${ico('check')} Guardar entrega</button>`, 'ancho');
  const items = () => prods.map(p => ({ producto_id: p.id, cant: parseInt($(`[data-ct="${p.id}"]`, m).value) || 0, precio: $(`[data-pr="${p.id}"]`, m).value }));
  const vacios = () => Object.fromEntries(prods.filter(p => p.retornable).map(p => [p.id, parseInt($(`[data-vc="${p.id}"]`, m).value) || 0]));
  const total = () => r2(items().reduce((s, i) => s + i.cant * n0(i.precio), 0));
  let modo = 'paga';
  const zp = zonaPagos($('#enP', m), total());
  const resumen = () => {
    const t = total(), pg = r2(zp.pagos().reduce((s, p) => s + p.monto, 0)), queda = r2((c.saldo || 0) + t - pg);
    $('#enTot', m).innerHTML = `Total: ${money2(t)}`;
    $('#enRes', m).innerHTML = `Paga ${money2(pg)} · <span class="${claseSaldo(queda)}">${Math.abs(queda) < 0.01 ? 'Queda al día' : queda > 0 ? 'Queda debiendo ' + money2(queda) : 'Queda a favor ' + money2(-queda)}</span>`;
  };
  const aplicarModo = () => { const t = total(); zp.fijar(modo === 'fiado' ? 0 : modo === 'todo' ? r2(t + Math.max(0, c.saldo || 0)) : t); $('#enP', m).hidden = modo === 'fiado'; resumen(); };
  $('#enModo', m).onclick = e => { const b = e.target.closest('[data-md]'); if (!b) return; modo = b.dataset.md; $$('#enModo button', m).forEach(x => x.classList.toggle('act', x === b)); aplicarModo(); };
  m.addEventListener('input', e => {
    if (e.target.dataset.ct) {   // al cambiar lo que entrega, se propone retirar la misma cantidad de vacíos
      const v = $(`[data-vc="${e.target.dataset.ct}"]`, m); if (v) v.value = Math.min(parseInt(e.target.value) || 0, envasesDe(c, e.target.dataset.ct) + (parseInt(e.target.value) || 0));
    }
    if (e.target.dataset.ct || e.target.dataset.pr) aplicarModo(); else resumen();
  });
  aplicarModo();
  $('#enOk', m).onclick = async () => {
    try {
      const e = await registrarEntrega({ cliente_id: c.id, items: items(), vacios: vacios(), pagos: modo === 'fiado' ? [] : zp.pagos(), fecha: val('enF', m), nota: val('enN', m) });
      m.cerrar(); toast('Entrega guardada'); luego && luego(); verEntrega(e.id, luego, true);
    } catch (er) { fallo(er); }
  };
}

function textoEntrega(e) {
  const c = DB.get('clientes', e.cliente_id), queda = r2(e.saldo_antes + e.total - e.pagado);
  return `*${DB.cfg.nombre}*\nEntrega N° ${e.id} · ${dmy(e.fecha)}\n${c ? c.nombre : ''}\n` +
    e.items.map(l => `${l.cant} x ${l.nombre} ${money2(l.precio)} = ${money2(l.subtotal)}`).join('\n') +
    (Object.values(e.vacios || {}).some(Boolean) ? `\nVacíos retirados: ${Object.entries(e.vacios).map(([pid, n]) => `${n} ${DB.get('productos', pid)?.nombre || ''}`).join(', ')}` : '') +
    `\n*Total: ${money2(e.total)}*\n` + (e.pagado ? `Pagó: ${e.pagos.map(p => `${p.medio} ${money2(p.monto)}`).join(' + ')}\n` : 'Fiado\n') +
    (Math.abs(queda) < 0.01 ? 'Quedás al día. ' : queda > 0 ? `Saldo pendiente: ${money2(queda)}\n` : `Saldo a favor: ${money2(-queda)}\n`) + '¡Gracias!';
}
function verEntrega(id, luego, recien) {
  const e = DB.get('entregas', id), c = DB.get('clientes', e.cliente_id), queda = r2(e.saldo_antes + e.total - e.pagado);
  const m = modal(`Entrega N° ${e.id}`, `<div style="text-align:center;margin-bottom:10px"><img src="img/logo-recibo.png" alt="" style="width:140px;max-width:50%"><div class="muted chico">${DB.cfg.telefono ? 'Tel. ' + esc(DB.cfg.telefono) : ''}</div></div>
    ${e.estado !== 'ACTIVO' ? `<div class="pill mal" style="margin-bottom:10px">ANULADA el ${dmy(e.anulado)}: ${esc(e.motivo)}</div>` : ''}
    <table class="t"><tr><td>Fecha</td><td class="r">${dmy(e.fecha)} ${e.fecha.slice(11)}</td></tr><tr><td>Cliente</td><td class="r"><b>${esc(c ? c.nombre : e.cliente_borrado ? 'Cliente borrado' : '')}</b></td></tr>
      ${e.items.map(l => `<tr><td>${l.cant} × ${esc(l.nombre)} <span class="muted chico">(${money(l.precio)})</span></td><td class="r">${money2(l.subtotal)}</td></tr>`).join('')}
      ${Object.entries(e.vacios || {}).filter(([, n]) => n).map(([pid, n]) => `<tr><td class="muted">Retiró ${n} vacío(s) ${esc(DB.get('productos', pid)?.nombre || '')}</td><td></td></tr>`).join('')}
      <tr class="tot"><td>Total</td><td class="r">${money2(e.total)}</td></tr>
      ${e.pagos.map(p => `<tr><td>Pagó · ${esc(p.medio)}</td><td class="r">${money2(p.monto)}</td></tr>`).join('') || '<tr><td>Fiado</td><td></td></tr>'}
      <tr><td>Saldo de la cuenta</td><td class="r"><b class="${claseSaldo(queda)}">${textoSaldo(queda)}</b></td></tr></table>${e.nota ? `<p class="muted chico">${esc(e.nota)}</p>` : ''}`,
    `${e.estado === 'ACTIVO' ? `<button class="btn rojo" id="veAn">${ico('trash')} Anular</button>` : ''}<button class="btn" id="vePr">${ico('imprimir')}</button>
     <button class="btn ${recien ? '' : 'acento'}" id="veWa">${ico('wa')} WhatsApp</button>${recien ? '<button class="btn pri" data-cerrar>Listo</button>' : ''}`);
  $('#veWa', m).onclick = () => abrirWa(c && c.telefono, textoEntrega(e));
  $('#vePr', m).onclick = () => window.print();
  if ($('#veAn', m)) $('#veAn', m).onclick = async () => {
    if (DB.cfg.pin && !DESBLOQUEADO && !await pedirPin('anular una entrega')) return;
    const mot = await pedirTexto('Anular entrega', 'Motivo (ej. se cargó mal)'); if (mot === null) return;
    try { await anularEntrega(e.id, mot); m.cerrar(); toast('Entrega anulada: se devolvió el stock, los envases y la cuenta'); luego ? luego() : recargar(); } catch (er) { fallo(er); }
  };
}

function cobrarUI(cid, luego) {
  if (!cid) return elegirCliente('¿Quién te paga?', c => cobrarUI(c.id, luego));
  const c = DB.get('clientes', cid), debe = Math.max(0, c.saldo || 0);
  const m = modal(`${ico('caja')} Cobrar`, `<p style="margin-top:0"><b>${esc(c.nombre)}</b> · <span class="${claseSaldo(c.saldo)}">${textoSaldo(c.saldo)}</span></p>
    <div class="campo"><label>Cuánto paga</label>${campoMonto('id="coM" autofocus', debe || '')}</div><div id="coP" style="margin-top:8px"></div>
    <div class="resumen-pago" id="coR"></div><div class="campo" style="margin-top:8px"><label>Nota (opcional)</label><input id="coN"></div>`,
    `<button class="btn" data-cerrar>Cancelar</button><button class="btn acento" id="coOk">${ico('check')} Cobrar</button>`);
  const zp = zonaPagos($('#coP', m), debe);
  const res = () => { const q = r2((c.saldo || 0) - zp.pagos().reduce((s, p) => s + p.monto, 0)); $('#coR', m).innerHTML = `Después del pago: <span class="${claseSaldo(q)}">${textoSaldo(q)}</span>`; };
  $('#coM', m).addEventListener('input', () => { zp.fijar(n0($('#coM', m).value)); res(); });
  $('#coP', m).addEventListener('input', res); res();
  $('#coOk', m).onclick = async () => { try { const x = await cobrarCliente({ cliente_id: c.id, pagos: zp.pagos(), nota: val('coN', m) }); m.cerrar(); toast('Cobrado'); luego && luego(); verCobranza(x.id, luego, true); } catch (e) { fallo(e); } };
}
function textoCobranza(x) {
  const c = DB.get('clientes', x.cliente_id), q = r2(x.saldo_antes - x.monto);
  return `*${DB.cfg.nombre}*\nRecibo de pago N° ${x.id} · ${dmy(x.fecha)}\n${c ? c.nombre : ''}\nRecibimos ${money2(x.monto)} (${x.pagos.map(p => p.medio).join(' + ')})\n` +
    (Math.abs(q) < 0.01 ? 'Quedás al día.' : q > 0 ? `Saldo pendiente: ${money2(q)}` : `Saldo a favor: ${money2(-q)}`) + '\n¡Gracias!';
}
function verCobranza(id, luego, recien) {
  const x = DB.get('cobranzas', id), c = DB.get('clientes', x.cliente_id), q = r2(x.saldo_antes - x.monto);
  const m = modal(`Recibo de pago N° ${x.id}`, `<div style="text-align:center;margin-bottom:10px"><img src="img/logo-recibo.png" alt="" style="width:140px;max-width:50%"></div>
    ${x.estado !== 'ACTIVO' ? `<div class="pill mal" style="margin-bottom:10px">ANULADO el ${dmy(x.anulado)}: ${esc(x.motivo)}</div>` : ''}
    <table class="t"><tr><td>Fecha</td><td class="r">${dmy(x.fecha)} ${x.fecha.slice(11)}</td></tr><tr><td>Cliente</td><td class="r"><b>${esc(c ? c.nombre : 'Cliente borrado')}</b></td></tr>
      <tr><td>Debía</td><td class="r">${textoSaldo(x.saldo_antes)}</td></tr>${x.pagos.map(p => `<tr><td>${esc(p.medio)}</td><td class="r">${money2(p.monto)}</td></tr>`).join('')}
      <tr class="tot"><td>Pagó</td><td class="r">${money2(x.monto)}</td></tr><tr><td>Queda</td><td class="r"><b class="${claseSaldo(q)}">${textoSaldo(q)}</b></td></tr></table>${x.nota ? `<p class="muted chico">${esc(x.nota)}</p>` : ''}`,
    `${x.estado === 'ACTIVO' ? `<button class="btn rojo" id="vxAn">${ico('trash')} Anular</button>` : ''}<button class="btn" id="vxPr">${ico('imprimir')}</button>
     <button class="btn ${recien ? '' : 'acento'}" id="vxWa">${ico('wa')} WhatsApp</button>${recien ? '<button class="btn pri" data-cerrar>Listo</button>' : ''}`);
  $('#vxWa', m).onclick = () => abrirWa(c && c.telefono, textoCobranza(x));
  $('#vxPr', m).onclick = () => window.print();
  if ($('#vxAn', m)) $('#vxAn', m).onclick = async () => {
    if (DB.cfg.pin && !DESBLOQUEADO && !await pedirPin('anular un cobro')) return;
    const mot = await pedirTexto('Anular cobro', 'Motivo (ej. se cargó mal)'); if (mot === null) return;
    try { await anularCobranza(x.id, mot); m.cerrar(); toast('Cobro anulado: la deuda volvió a la cuenta'); luego ? luego() : recargar(); } catch (e) { fallo(e); }
  };
}

/* ---------------------------------------------------------------- pantalla Reparto */
let FECHA_REP = null, ORDENAR = false;
const MOTIVOS = ['No estaba', 'No necesitaba (tiene agua)', 'Pidió que pase otro día'];
PANTALLAS.reparto = async (main) => {
  titulo('Reparto');
  const f = FECHA_REP || hoy(), rec = recorridoDe(f), est = rec.map(c => ({ c, e: estadoVisita(c, f) }));
  const hechos = est.filter(x => x.e.hecho).length, pend = est.filter(x => !x.e.hecho);
  const fuera = DB.donde('entregas', e => e.estado === 'ACTIVO' && e.fecha.slice(0, 10) === f && !rec.some(c => c.id === e.cliente_id));
  const cj = caja(f, f), vac = cj.entregas.reduce((s, e) => s + Object.values(e.vacios || {}).reduce((a, n) => a + n, 0), 0);
  const llevar = {};
  for (const { c } of pend) for (const [pid, n] of Object.entries(c.pedido || {})) llevar[pid] = (llevar[pid] || 0) + n;
  const txtLlevar = Object.entries(llevar).filter(([, n]) => n).map(([pid, n]) => `${n} ${esc(DB.get('productos', pid)?.nombre || '')}`).join(' · ');
  main.innerHTML = `<div class="fila" style="margin-bottom:12px"><button class="ib" id="rpAnt" title="Día anterior">${ico('flecha')}</button>
      <div class="sp" style="text-align:center"><b style="font-size:18px">${f === hoy() ? 'Hoy, ' : ''}${fechaLarga(f)}</b></div>
      <button class="ib" id="rpSig" title="Día siguiente">${ico('flecha')}</button></div>
    <div class="card"><div class="fila" style="margin-bottom:8px"><b class="sp">${rec.length ? `${hechos} de ${rec.length} paradas` : 'No hay clientes para este día'}</b>
      <button class="btn chico" id="rpOrd">${ORDENAR ? ico('check') + ' Listo' : 'Cambiar orden'}</button><button class="btn chico acento" id="rpOtro">${ico('plus')} Otro cliente</button></div>
      <div class="barra"><i style="width:${rec.length ? Math.round(hechos * 100 / rec.length) : 0}%"></i></div>
      ${txtLlevar && pend.length ? `<p class="chico" style="margin:10px 0 0">${ico('camion')} <b>Para cargar:</b> ${txtLlevar} <span class="muted">(pedido de siempre de los que faltan)</span></p>` : ''}
      <div class="lista" id="rpL">${est.map(({ c, e }, i) => `<div class="parada ${e.hecho ? (e.visita ? 'nada' : 'hecha') : ''}" data-id="${c.id}">
        <div class="num">${e.hecho ? (e.visita ? '–' : '✓') : i + 1}</div>
        <div class="tx"><b>${esc(c.nombre)}</b><small>${esc(c.direccion || 'Sin dirección')}${c.zona ? ' · ' + esc(c.zona) : ''}</small>
          ${e.hecho ? `<small><b>${esc(e.txt)}</b></small>` : `<small>${Object.entries(c.pedido || {}).filter(([, n]) => n).map(([pid, n]) => `${n} ${esc(DB.get('productos', pid)?.nombre || '')}`).join(', ') || 'Sin pedido fijo'}${totalEnvases(c) ? ` · tiene ${totalEnvases(c)} env.` : ''}</small>`}
          ${Math.abs(c.saldo || 0) > 0.009 ? `<small class="${claseSaldo(c.saldo)}" style="font-weight:700">${textoSaldo(c.saldo)}</small>` : ''}${c.notas && !e.hecho ? `<small>📝 ${esc(c.notas)}</small>` : ''}
          ${ORDENAR ? `<div class="acc"><button class="btn chico" data-sube="${i}" ${i ? '' : 'disabled'}>${ico('subir2')} Subir</button><button class="btn chico" data-baja="${i}" ${i < est.length - 1 ? '' : 'disabled'}>${ico('bajar')} Bajar</button></div>`
            : `<div class="acc">${e.hecho ? (e.visita ? `<button class="btn chico acento" data-ent>Entregar igual</button><button class="btn chico" data-desh>Deshacer</button>` : `<button class="btn chico" data-ent>Otra entrega</button>`)
              : `<button class="btn acento" data-ent>${ico('gota')} Entregar</button><button class="btn chico" data-nada>No compró</button>`}
              ${c.direccion ? `<a class="btn chico" href="${linkMapa(c)}" target="_blank" rel="noopener">${ico('mapa')}</a>` : ''}${c.telefono ? `<a class="btn chico" href="tel:${esc(c.telefono)}">${ico('tel')}</a>` : ''}
              <button class="btn chico" data-ficha>${ico('usuario')}</button></div>`}</div></div>`).join('') || vacio('camion', 'Para armar el recorrido, en cada cliente marcá los días que le llevás.')}</div></div>
    ${fuera.length ? `<div class="card" style="padding:6px 14px"><h2 style="margin:10px 0 4px">Fuera del recorrido</h2><div class="lista">${Object.values(fuera.reduce((g, e) => { const x = g[e.cliente_id] = g[e.cliente_id] || { id: e.cliente_id, u: 0, t: 0, n: 0, ult: e.id }; x.u += e.items.reduce((s, l) => s + l.cant, 0); x.t += e.total; x.n++; x.ult = e.id; return g; }, {}))
      .map(x => `<div class="it" ${x.n === 1 ? `data-ve="${x.ult}"` : `data-fc="${x.id}"`}><div class="av">${ico('gota')}</div><div class="tx"><b>${esc(DB.get('clientes', x.id)?.nombre || '')}</b><small>${x.u} unidad(es)${x.n > 1 ? ` en ${x.n} entregas` : ''}</small></div><b class="num">${money(x.t)}</b></div>`).join('')}</div></div>` : ''}
    <div class="kpis"><div class="kpi oscuro"><small>Entregados</small><b>${cj.unidades.reduce((s, u) => s + u.cant, 0)}</b><div class="sub">${cj.nEntregas} entrega(s)</div></div>
      <div class="kpi"><small>Vacíos retirados</small><b>${vac}</b><div class="sub">volvieron al depósito</div></div>
      <div class="kpi"><small>Cobrado</small><b>${DB.cfg.pin && !DESBLOQUEADO ? ico('candado') : money(cj.entra)}</b><div class="sub">ventas y deudas</div></div>
      <div class="kpi"><small>Fiado</small><b class="${cj.fiado ? 'warn' : ''}">${money(cj.fiado)}</b><div class="sub">quedó debiendo</div></div></div>`;
  $('#rpAnt').style.transform = 'scaleX(-1)';
  const re = () => PANTALLAS.reparto(main);
  $('#rpAnt').onclick = () => { FECHA_REP = sumarDias(f, -1); re(); };
  $('#rpSig').onclick = () => { FECHA_REP = sumarDias(f, 1); re(); };
  $('#rpOrd').onclick = () => { ORDENAR = !ORDENAR; re(); };
  $('#rpOtro').onclick = () => nuevaEntrega(null, re, f);
  main.onclick = async e => {
    const ve = e.target.closest('[data-ve]'); if (ve) return verEntrega(+ve.dataset.ve, re);
    const fc = e.target.closest('[data-fc]'); if (fc) return ir('ficha', { id: +fc.dataset.fc }, true);
    const p = e.target.closest('.parada'); if (!p) return;
    const c = DB.get('clientes', p.dataset.id);
    const sb = e.target.closest('[data-sube],[data-baja]');
    if (sb) {
      const i = +(sb.dataset.sube ?? sb.dataset.baja), j = sb.dataset.sube !== undefined ? i - 1 : i + 1;
      try { const lista = rec.map(x => x); [lista[i], lista[j]] = [lista[j], lista[i]];
        const ords = rec.map(x => x.orden ?? 0).sort((a, b) => a - b); const usados = new Set();
        for (let k = 0; k < lista.length; k++) { let o = ords[k]; while (usados.has(o)) o += 0.001; usados.add(o); if (lista[k].orden !== o) { lista[k].orden = o; await DB.guardar('clientes', lista[k]); } }
        re(); } catch (er) { fallo(er); }
      return;
    }
    if (e.target.closest('[data-ent]')) return nuevaEntrega(c.id, re, f);
    if (e.target.closest('[data-ficha]')) return ir('ficha', { id: c.id }, true);
    if (e.target.closest('[data-desh]')) { try { await marcarVisita(c.id, f, ''); re(); } catch (er) { fallo(er); } return; }
    if (e.target.closest('[data-nada]')) {
      const m = modal('No compró', `<p style="margin-top:0"><b>${esc(c.nombre)}</b></p><div class="lista">${MOTIVOS.map(x => `<div class="it" data-mo="${esc(x)}"><div class="tx"><b>${esc(x)}</b></div></div>`).join('')}</div>
        <div class="campo" style="margin-top:8px"><label>Otro motivo</label><input id="moO"></div>`, `<button class="btn" data-cerrar>Cancelar</button><button class="btn pri" id="moOk">Guardar</button>`);
      const guardar = async t => { try { await marcarVisita(c.id, f, t || 'No compró'); m.cerrar(); re(); } catch (er) { fallo(er); } };
      $('.lista', m).onclick = ev => { const b = ev.target.closest('[data-mo]'); if (b) guardar(b.dataset.mo); };
      $('#moOk', m).onclick = () => guardar(val('moO', m));
    }
  };
};
