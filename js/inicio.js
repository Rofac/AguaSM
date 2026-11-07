/* Inicio: el día de un vistazo. */
'use strict';

function mensajeCuenta(c) {
  const env = productosActivos().filter(p => p.retornable && envasesDe(c, p.id)).map(p => `${envasesDe(c, p.id)} ${p.nombre}`).join(', ') || '0';
  return (DB.cfg.msg_deuda || CONFIG_INICIAL.msg_deuda).replace(/\{nombre\}/g, c.nombre.split(' ')[0]).replace(/\{negocio\}/g, DB.cfg.nombre)
    .replace(/\{saldo\}/g, (c.saldo || 0) > 0.009 ? `debés ${money2(c.saldo)}` : (c.saldo || 0) < -0.009 ? `tenés ${money2(-c.saldo)} a favor` : 'estás al día').replace(/\{envases\}/g, env);
}

PANTALLAS.inicio = async (main) => {
  titulo('Inicio');
  const h = hoy(), rec = recorridoDe(h), hechos = rec.filter(c => estadoVisita(c, h).hecho).length;
  const cj = caja(h, h), clientes = clientesActivos();
  const deben = clientes.filter(c => (c.saldo || 0) > 0.009).sort((a, b) => b.saldo - a.saldo);
  const totalDeuda = r2(deben.reduce((s, c) => s + c.saldo, 0));
  const stock = resumenStock(), bajo = stock.filter(x => x.llenos < (+DB.cfg.stock_minimo || 0));
  const bidonesHoy = cj.unidades.reduce((s, u) => s + u.cant, 0);
  const dormidos = clientes.filter(c => c.ultima_compra && diasEntre(c.ultima_compra, h) >= (+DB.cfg.dias_sin_comprar || 21)).sort((a, b) => a.ultima_compra.localeCompare(b.ultima_compra));
  const ocultarPlata = DB.cfg.pin && !DESBLOQUEADO;
  const diasCopia = DB.cfg.ultima_copia ? diasEntre(DB.cfg.ultima_copia.slice(0, 10), h) : null;
  const avisarCopia = clientes.length && (diasCopia === null || diasCopia >= (+DB.cfg.aviso_copia_dias || 7));
  const sinPrecio = productosActivos().some(p => !p.precio);
  main.innerHTML = `
    ${sinPrecio || !clientes.length ? `<div class="card" style="border:2px solid var(--acento)"><h2>${ico('config')} Para empezar</h2><ol style="margin:0 0 12px;padding-left:20px;line-height:1.8">
      <li>En <b>Configuración</b> poné el precio de cada producto (bidón de 20 L, etc.).</li><li>En <b>Stock</b> cargá cuántos bidones llenos y vacíos tenés.</li>
      <li>Cargá los <b>clientes</b> con su dirección, los días que les llevás y cuántos bidones tienen tuyos.</li></ol><button class="btn acento" data-ir="config">Ir a Configuración</button></div>` : ''}
    ${avisarCopia ? `<div class="card fila" style="background:var(--warn-bg);border-color:var(--warn-bg)">${ico('alerta')}<div class="sp"><b>${diasCopia === null ? 'Todavía no hiciste ninguna copia de seguridad' : `Hace ${diasCopia} días que no hacés una copia`}</b>
      <div class="chico">Si el celular se rompe o se pierde, sin copia se pierde todo. Mandala a tu Google Drive o WhatsApp.</div></div><button class="btn pri" id="inCopia">${ico('copia')} Hacer copia</button></div>` : ''}
    <div class="kpis">
      <div class="kpi oscuro" data-ir="reparto"><small>Reparto de hoy</small><b>${hechos}/${rec.length}</b><div class="sub">${rec.length ? (hechos === rec.length ? 'Terminado' : `Faltan ${rec.length - hechos}`) : 'Sin recorrido hoy'}</div></div>
      <div class="kpi"><small>Entregados hoy</small><b>${bidonesHoy}</b><div class="sub">${cj.unidades.map(u => `${u.cant} ${esc(u.nombre)}`).join(' · ') || 'unidades'}</div></div>
      <div class="kpi" data-ir="caja"><small>Cobrado hoy</small><b>${ocultarPlata ? ico('candado') : money(cj.entra)}</b><div class="sub">${cj.fiado ? 'fiado hoy ' + money(cj.fiado) : 'sin fiado hoy'}</div></div>
      <div class="kpi" id="kDeben"><small>Te deben</small><b class="${totalDeuda ? 'mal' : ''}">${ocultarPlata ? ico('candado') : money(totalDeuda)}</b><div class="sub">${deben.length} cliente${deben.length === 1 ? '' : 's'}</div></div>
    </div>
    <div class="grid g2">
      <div>
        <div class="card"><h2>${ico('camion')} Próximas paradas<span class="sp"></span><button class="btn chico" data-ir="reparto">Ver reparto</button></h2>
          ${rec.filter(c => !estadoVisita(c, h).hecho).slice(0, 6).map((c, i) => `<div class="it" data-cli="${c.id}"><div class="av">${i + 1}</div><div class="tx"><b>${esc(c.nombre)}</b><small>${esc(c.direccion || '')}${c.zona ? ' · ' + esc(c.zona) : ''}</small></div>
            <button class="btn chico acento" data-ent="${c.id}">Entregar</button></div>`).join('') || vacio('check', rec.length ? '¡Terminaste el reparto de hoy!' : 'Hoy no tenés clientes en el recorrido.')}</div>
        <div class="card"><h2>${ico('stock')} Stock<span class="sp"></span><button class="btn chico" data-ir="stock">Ver</button></h2>
          ${stock.map(x => `<div class="fila" style="margin-bottom:6px"><b class="sp">${esc(x.p.nombre)}</b><span class="pill ${x.llenos < (+DB.cfg.stock_minimo || 0) ? 'mal' : 'ok'}">${x.llenos} llenos</span>
            ${x.p.retornable ? `<span class="pill">${x.vacios} vacíos</span><span class="pill info">${x.afuera} en clientes</span>` : ''}</div>`).join('')}
          ${bajo.length ? `<p class="mal chico" style="margin:6px 0 0;font-weight:700">${ico('alerta')} Quedan pocos llenos de ${bajo.map(x => esc(x.p.nombre)).join(', ')}</p>` : ''}</div>
      </div>
      <div>
        <div class="card"><h2>${ico('caja')} Te deben</h2>
          ${deben.slice(0, 12).map(c => `<div class="it" data-cli="${c.id}"><div class="av">${esc(iniciales(c.nombre))}</div><div class="tx"><b>${esc(c.nombre)}</b><small class="mal">Debe ${money2(c.saldo)}</small></div>
            ${c.telefono ? `<button class="ib" data-wa="${c.id}" title="Mandar la cuenta por WhatsApp">${ico('wa')}</button>` : ''}</div>`).join('') || vacio('check', 'Nadie te debe')}
          ${deben.length > 12 ? `<p class="muted chico">Y ${deben.length - 12} más (Clientes > Deben).</p>` : ''}</div>
        ${dormidos.length ? `<div class="card"><h2>${ico('reloj')} Hace mucho que no compran</h2>${dormidos.slice(0, 8).map(c => `<div class="it" data-cli="${c.id}"><div class="av">${esc(iniciales(c.nombre))}</div>
          <div class="tx"><b>${esc(c.nombre)}</b><small>Última compra: ${dmy(c.ultima_compra)} (hace ${diasEntre(c.ultima_compra, h)} días)</small></div>${c.telefono ? `<button class="ib" data-hola="${c.id}">${ico('wa')}</button>` : ''}</div>`).join('')}</div>` : ''}
      </div>
    </div>`;
  if ($('#inCopia')) $('#inCopia').onclick = () => hacerCopia();
  $('#kDeben').onclick = () => { FILTRO_CLI = 'deben'; ir('clientes'); };
  main.onclick = e => {
    const b = e.target.closest('[data-cli],[data-ent],[data-wa],[data-hola]'); if (!b) return;
    if (b.dataset.ent) { e.stopPropagation(); return nuevaEntrega(+b.dataset.ent, recargar); }
    if (b.dataset.wa) { e.stopPropagation(); const c = DB.get('clientes', b.dataset.wa); return abrirWa(c.telefono, mensajeCuenta(c)); }
    if (b.dataset.hola) { e.stopPropagation(); const c = DB.get('clientes', b.dataset.hola); return abrirWa(c.telefono, `Hola ${c.nombre.split(' ')[0]}! Te escribimos de ${DB.cfg.nombre}. ¿Necesitás agua esta semana? 💧`); }
    if (b.dataset.cli) return ir('ficha', { id: +b.dataset.cli }, true);
  };
};
