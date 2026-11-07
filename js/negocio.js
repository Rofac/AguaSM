/* Reglas del reparto: entregas (contado o fiado), envases en poder de cada cliente, stock de llenos y vacíos, cobranzas, caja. */
'use strict';

const productosActivos = () => DB.donde('productos', p => p.activo !== false).sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.id - b.id);
const clientesActivos = () => DB.donde('clientes', c => c.activo !== false).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
const precioDe = (c, p) => { const e = c && c.precios && c.precios[p.id]; return e !== undefined && e !== null && e !== '' ? +e : +p.precio || 0; };
const envasesDe = (c, pid) => +(c && c.envases && c.envases[pid]) || 0;
const totalEnvases = c => productosActivos().filter(p => p.retornable).reduce((s, p) => s + envasesDe(c, p.id), 0);
const textoSaldo = s => Math.abs(s || 0) < 0.01 ? 'Al día' : s > 0 ? `Debe ${money(s)}` : `A favor ${money(-s)}`;
const claseSaldo = s => Math.abs(s || 0) < 0.01 ? 'ok' : s > 0 ? 'mal' : 'info';

function limpiarPagos(pagos) {
  const l = (pagos || []).map(p => ({ medio: p.medio, monto: r2(n0(p.monto)) })).filter(p => p.monto > 0);
  for (const p of l) { if (!p.medio) throw new Error('Elegí el medio de pago'); if (p.monto < 0) throw new Error('Monto inválido'); }
  return l;
}

/* ---------------------------------------------------------------- entregas */
async function registrarEntrega({ cliente_id, items, vacios, pagos, fecha, nota }) {
  DB.verificarEscritura();
  const c = DB.get('clientes', cliente_id); if (!c) throw new Error('Elegí el cliente');
  const lineas = [];
  for (const it of items || []) {
    const p = DB.get('productos', it.producto_id); const cant = parseInt(it.cant) || 0;
    if (!p || cant === 0) continue;
    if (cant < 0) throw new Error('Cantidad inválida');
    const precio = it.precio === undefined || it.precio === '' ? precioDe(c, p) : r2(n0(it.precio));
    if (precio < 0) throw new Error('Precio inválido');
    lineas.push({ producto_id: p.id, nombre: p.nombre, cant, precio, subtotal: r2(cant * precio), retornable: !!p.retornable });
  }
  const vac = {};
  for (const [pid, n] of Object.entries(vacios || {})) {
    const k = parseInt(n) || 0; if (!k) continue;
    if (k < 0) throw new Error('Cantidad de vacíos inválida');
    const p = DB.get('productos', pid); if (!p || !p.retornable) continue;
    const entrega = lineas.filter(l => l.producto_id === p.id).reduce((s, l) => s + l.cant, 0);
    if (k > envasesDe(c, p.id) + entrega) throw new Error(`Devuelve ${k} vacíos de ${p.nombre} pero tenía ${envasesDe(c, p.id)}${entrega ? ' + ' + entrega + ' de hoy' : ''}. Si tenía más, corregí sus envases en la ficha.`);
    vac[p.id] = k;
  }
  if (!lineas.length && !Object.keys(vac).length) throw new Error('Poné cuántos entregás (o cuántos vacíos retirás)');
  const lp = limpiarPagos(pagos);
  const total = r2(lineas.reduce((s, l) => s + l.subtotal, 0)), pagado = r2(lp.reduce((s, p) => s + p.monto, 0));
  const e = await DB.guardar('entregas', { fecha: (fecha || hoy()) + ahora().slice(10), cliente_id: c.id, items: lineas, vacios: vac, total, pagos: lp, pagado,
    saldo_antes: r2(c.saldo || 0), nota: (nota || '').trim(), estado: 'ACTIVO' });
  // cuenta del cliente, envases y stock
  c.saldo = r2((c.saldo || 0) + total - pagado);
  c.envases = Object.assign({}, c.envases);
  for (const l of lineas) {
    const p = DB.get('productos', l.producto_id);
    p.stock_lleno = (+p.stock_lleno || 0) - l.cant;
    if (p.retornable) c.envases[p.id] = envasesDe(c, p.id) + l.cant;
    await DB.guardar('productos', p);
  }
  for (const [pid, k] of Object.entries(vac)) {
    const p = DB.get('productos', pid);
    p.stock_vacio = (+p.stock_vacio || 0) + k; c.envases[p.id] = envasesDe(c, p.id) - k;
    await DB.guardar('productos', p);
  }
  c.ultima_compra = e.fecha.slice(0, 10);
  await DB.guardar('clientes', c);
  for (const v of DB.donde('visitas', v => v.cliente_id === c.id && v.fecha === e.fecha.slice(0, 10))) await DB.borrar('visitas', v.id);
  await DB.anotar('Entrega', `${c.nombre} · ${lineas.map(l => l.cant + ' ' + l.nombre).join(', ') || 'sólo vacíos'} · ${money2(total)}${total - pagado > 0.009 ? ' · fiado ' + money2(total - pagado) : ''}`);
  return e;
}
async function anularEntrega(id, motivo) {
  DB.verificarEscritura();
  const e = DB.get('entregas', id); if (!e || e.estado !== 'ACTIVO') throw new Error('Esa entrega no existe o ya estaba anulada');
  if (!motivo || motivo.trim().length < 3) throw new Error('Escribí el motivo');
  const c = DB.get('clientes', e.cliente_id);
  for (const l of e.items) {
    const p = DB.get('productos', l.producto_id);
    if (p) { p.stock_lleno = (+p.stock_lleno || 0) + l.cant; await DB.guardar('productos', p); }
    if (c && l.retornable) c.envases = Object.assign({}, c.envases, { [l.producto_id]: envasesDe(c, l.producto_id) - l.cant });
  }
  for (const [pid, k] of Object.entries(e.vacios || {})) {
    const p = DB.get('productos', pid);
    if (p) { p.stock_vacio = (+p.stock_vacio || 0) - k; await DB.guardar('productos', p); }
    if (c) c.envases = Object.assign({}, c.envases, { [pid]: envasesDe(c, pid) + k });
  }
  if (c) { c.saldo = r2((c.saldo || 0) - e.total + e.pagado); await DB.guardar('clientes', c); }
  e.estado = 'ANULADO'; e.anulado = ahora(); e.motivo = motivo.trim(); await DB.guardar('entregas', e);
  await DB.anotar('Entrega ANULADA', `${c ? c.nombre : ''} · ${money2(e.total)} · ${motivo}`);
}

/* ---------------------------------------------------------------- cobranzas (pago de lo que debe, o adelanto) */
async function cobrarCliente({ cliente_id, pagos, fecha, nota }) {
  DB.verificarEscritura();
  const c = DB.get('clientes', cliente_id); if (!c) throw new Error('Elegí el cliente');
  const lp = limpiarPagos(pagos), monto = r2(lp.reduce((s, p) => s + p.monto, 0));
  if (monto <= 0) throw new Error('Poné cuánto paga');
  const x = await DB.guardar('cobranzas', { fecha: (fecha || hoy()) + ahora().slice(10), cliente_id: c.id, monto, pagos: lp, saldo_antes: r2(c.saldo || 0), nota: (nota || '').trim(), estado: 'ACTIVO' });
  c.saldo = r2((c.saldo || 0) - monto); await DB.guardar('clientes', c);
  await DB.anotar('Cobranza', `${c.nombre} · ${money2(monto)}`);
  return x;
}
async function anularCobranza(id, motivo) {
  DB.verificarEscritura();
  const x = DB.get('cobranzas', id); if (!x || x.estado !== 'ACTIVO') throw new Error('Ese cobro no existe o ya estaba anulado');
  if (!motivo || motivo.trim().length < 3) throw new Error('Escribí el motivo');
  const c = DB.get('clientes', x.cliente_id);
  if (c) { c.saldo = r2((c.saldo || 0) + x.monto); await DB.guardar('clientes', c); }
  x.estado = 'ANULADO'; x.anulado = ahora(); x.motivo = motivo.trim(); await DB.guardar('cobranzas', x);
  await DB.anotar('Cobro ANULADO', `${c ? c.nombre : ''} · ${money2(x.monto)} · ${motivo}`);
}

/* visita sin venta (no estaba, no quiso, tenía) */
async function marcarVisita(cliente_id, fecha, motivo) {
  DB.verificarEscritura();
  for (const v of DB.donde('visitas', v => v.cliente_id === cliente_id && v.fecha === fecha)) await DB.borrar('visitas', v.id);
  if (motivo) await DB.guardar('visitas', { cliente_id, fecha, motivo });
}

/* ---------------------------------------------------------------- stock */
async function movStock({ tipo, producto_id, cant, costo, medio, nota, llenos, vacios }) {
  DB.verificarEscritura();
  const p = DB.get('productos', producto_id); if (!p) throw new Error('Elegí el producto');
  let dl = 0, dv = 0; const n = parseInt(cant) || 0;
  if (tipo === 'LLENADO') { if (n <= 0) throw new Error('Poné cuántos llenaste'); if (p.retornable && n > (+p.stock_vacio || 0)) throw new Error(`Hay ${+p.stock_vacio || 0} vacíos en el depósito: no podés llenar ${n}`); dl = n; dv = p.retornable ? -n : 0; }
  else if (tipo === 'COMPRA') { if (n <= 0) throw new Error('Poné la cantidad'); dl = n; }                       // compra de llenos (o producto sin envase)
  else if (tipo === 'ENVASES') { if (n <= 0) throw new Error('Poné la cantidad'); dv = n; }                      // envases vacíos nuevos
  else if (tipo === 'BAJA') { if (n <= 0) throw new Error('Poné la cantidad'); dv = -n; }                        // envase roto o perdido
  else if (tipo === 'CONTEO') {
    const L = parseInt(llenos), V = parseInt(vacios);
    if (isNaN(L) || L < 0 || (p.retornable && (isNaN(V) || V < 0))) throw new Error('Poné cuántos hay');
    dl = L - (+p.stock_lleno || 0); dv = p.retornable ? V - (+p.stock_vacio || 0) : 0;
  } else throw new Error('Tipo inválido');
  costo = r2(n0(costo));
  const m = await DB.guardar('stock_movs', { fecha: ahora(), tipo, producto_id: p.id, dl, dv, costo, nota: (nota || '').trim() });
  p.stock_lleno = (+p.stock_lleno || 0) + dl; p.stock_vacio = (+p.stock_vacio || 0) + dv; await DB.guardar('productos', p);
  if (costo > 0) await movimiento({ tipo: 'GASTO', concepto: `${{ LLENADO: 'Llenado', COMPRA: 'Compra', ENVASES: 'Envases nuevos', BAJA: 'Baja', CONTEO: 'Ajuste' }[tipo]} ${n || ''} ${p.nombre}`.replace(/\s+/g, ' '),
    categoria: tipo === 'ENVASES' ? 'Envases nuevos' : 'Llenado / planta', medio: medio || DB.cfg.medios[0], monto: costo });
  await DB.anotar('Stock', `${tipo} ${p.nombre}: llenos ${dl >= 0 ? '+' : ''}${dl}, vacíos ${dv >= 0 ? '+' : ''}${dv}`);
  return m;
}
function resumenStock() {
  return productosActivos().map(p => {
    const afuera = p.retornable ? DB.todos('clientes').reduce((s, c) => s + Math.max(0, envasesDe(c, p.id)), 0) : 0;
    return { p, llenos: +p.stock_lleno || 0, vacios: +p.stock_vacio || 0, afuera, total: (+p.stock_lleno || 0) + (+p.stock_vacio || 0) + afuera };
  });
}

/* ---------------------------------------------------------------- caja */
async function movimiento({ tipo, concepto, categoria, medio, monto, fecha }) {
  DB.verificarEscritura();
  monto = r2(n0(monto));
  if (!['INGRESO', 'GASTO', 'RETIRO'].includes(tipo)) throw new Error('Tipo inválido');
  if (monto <= 0) throw new Error('Poné el importe');
  if (!medio) throw new Error('Elegí el medio');
  const m = await DB.guardar('movimientos', { fecha: (fecha || hoy()) + ahora().slice(10), tipo, concepto: (concepto || '').trim(), categoria: categoria || '', medio, monto, estado: 'ACTIVO' });
  await DB.anotar(tipo === 'INGRESO' ? 'Otro ingreso' : tipo === 'GASTO' ? 'Gasto' : 'Retiro', `${concepto || categoria} · ${money2(monto)}`);
  return m;
}
function caja(desde, hasta) {
  const en = f => f.slice(0, 10) >= desde && f.slice(0, 10) <= hasta;
  const ent = DB.donde('entregas', e => e.estado === 'ACTIVO' && en(e.fecha));
  const cob = DB.donde('cobranzas', x => x.estado === 'ACTIVO' && en(x.fecha));
  const movs = DB.donde('movimientos', m => m.estado === 'ACTIVO' && en(m.fecha));
  const medios = {}, fila = m => (medios[m] = medios[m] || { medio: m, ventas: 0, cobranzas: 0, ingresos: 0, gastos: 0, retiros: 0 });
  let ventasPagadas = 0, vendido = 0, cobranzas = 0, ingresos = 0, gastos = 0, retiros = 0;
  const unidades = {};
  for (const e of ent) {
    vendido += e.total;
    for (const p of e.pagos) { fila(p.medio).ventas += p.monto; ventasPagadas += p.monto; }
    for (const l of e.items) { const u = unidades[l.producto_id] = unidades[l.producto_id] || { nombre: l.nombre, cant: 0, pesos: 0 }; u.cant += l.cant; u.pesos += l.subtotal; }
  }
  for (const x of cob) for (const p of x.pagos) { fila(p.medio).cobranzas += p.monto; cobranzas += p.monto; }
  for (const m of movs) {
    if (m.tipo === 'INGRESO') { fila(m.medio).ingresos += m.monto; ingresos += m.monto; }
    else if (m.tipo === 'GASTO') { fila(m.medio).gastos += m.monto; gastos += m.monto; }
    else { fila(m.medio).retiros += m.monto; retiros += m.monto; }
  }
  const lista = Object.values(medios).map(x => Object.assign(x, { neto: r2(x.ventas + x.cobranzas + x.ingresos - x.gastos - x.retiros) }));
  const dias = {};
  const d = (f, k, v) => { const x = dias[f.slice(0, 10)] = dias[f.slice(0, 10)] || { dia: f.slice(0, 10), entra: 0, sale: 0, bidones: 0 }; x[k] += v; };
  for (const e of ent) { d(e.fecha, 'entra', e.pagado); d(e.fecha, 'bidones', e.items.reduce((s, l) => s + l.cant, 0)); }
  for (const x of cob) d(x.fecha, 'entra', x.monto);
  for (const m of movs) d(m.fecha, m.tipo === 'INGRESO' ? 'entra' : 'sale', m.monto);
  // "pagado" de una entrega puede incluir deuda vieja: lo fiado del período es lo vendido menos lo cobrado en ventas, si es positivo
  const fiado = r2(ent.reduce((s, e) => s + Math.max(0, e.total - e.pagado), 0));
  return { desde, hasta, entregas: ent, cobros: cob, movs, medios: lista, vendido: r2(vendido), ventasPagadas: r2(ventasPagadas), cobranzas: r2(cobranzas), ingresos: r2(ingresos),
    gastos: r2(gastos), retiros: r2(retiros), fiado, entra: r2(ventasPagadas + cobranzas + ingresos), neto: r2(ventasPagadas + cobranzas + ingresos - gastos - retiros),
    unidades: Object.values(unidades).sort((a, b) => b.cant - a.cant), dias: Object.values(dias).sort((a, b) => b.dia.localeCompare(a.dia)), nEntregas: ent.length };
}

/* ---------------------------------------------------------------- recorrido */
const recorridoDe = f => { const d = diaSemana(f); return clientesActivos().filter(c => (c.dias || []).includes(d)).sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999) || a.nombre.localeCompare(b.nombre, 'es')); };
function estadoVisita(c, f) {
  const e = DB.donde('entregas', e => e.cliente_id === c.id && e.estado === 'ACTIVO' && e.fecha.slice(0, 10) === f);
  if (e.length) return { hecho: true, entregas: e, txt: e.map(x => x.items.map(l => `${l.cant} ${l.nombre}`).join(', ') || 'retiró vacíos').join(' · ') };
  const v = DB.donde('visitas', v => v.cliente_id === c.id && v.fecha === f)[0];
  if (v) return { hecho: true, visita: v, txt: v.motivo };
  return { hecho: false };
}

/* ---------------------------------------------------------------- arranque */
async function datosIniciales() {
  if (DB.cfg.iniciado) return;
  const soloL = DB.soloLectura; DB.soloLectura = false;
  try {
    await DB.guardar('productos', { nombre: 'Bidón 20 L', precio: 0, retornable: true, stock_lleno: 0, stock_vacio: 0, orden: 1, activo: true });
    await DB.guardar('productos', { nombre: 'Bidón 12 L', precio: 0, retornable: true, stock_lleno: 0, stock_vacio: 0, orden: 2, activo: false });
    await DB.setCfg('iniciado', ahora());
  } finally { DB.soloLectura = soloL; }
}
