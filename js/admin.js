// ============================================================
//  Donher's — Panel interno (admin)
//  Requiere: supabase-js + js/config.js + js/db.js
// ============================================================
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const money = (n) => "$" + Number(n || 0).toLocaleString("es-UY");
  const fecha = (iso) => { if (!iso) return "—"; const d = new Date(iso); return d.toLocaleDateString("es-UY", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" }); };

  const ESTADOS = ["pendiente_pago", "confirmado", "en_preparacion", "enviado", "entregado", "cancelado"];
  const ESTADO_LABEL = { pendiente_pago: "Pendiente de pago", confirmado: "Confirmado", en_preparacion: "En preparación", enviado: "Enviado", entregado: "Entregado", cancelado: "Cancelado" };

  let PRODUCTOS = []; // cache para nombres en stats

  // ---------- AUTH ----------
  async function init() {
    if (!window.DB || !window.DB.ok) { $("login-msg").textContent = "No se pudo conectar con la base."; $("login-msg").className = "msg error"; return; }
    const user = await DB.auth.getUser();
    if (user) mostrarPanel(user); else mostrarLogin();
    DB.auth.onChange((u) => { if (u) mostrarPanel(u); else mostrarLogin(); });
  }

  function mostrarLogin() { $("panel").classList.add("hidden"); $("login-screen").classList.remove("hidden"); }
  async function mostrarPanel(user) {
    // Verificar que la cuenta sea admin (no alcanza con estar logueado)
    if (DB.esAdmin) {
      const ok = await DB.esAdmin();
      if (!ok) {
        await DB.auth.signOut();
        $("login-msg").textContent = "Esta cuenta no tiene acceso al panel interno.";
        $("login-msg").className = "msg error";
        mostrarLogin();
        return;
      }
    }
    $("login-screen").classList.add("hidden");
    $("panel").classList.remove("hidden");
    $("who").textContent = user.email || "";
    cargarSeccion("stats");
  }

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("login-btn"), msg = $("login-msg");
    btn.disabled = true; btn.textContent = "Ingresando..."; msg.textContent = "";
    const { data, error } = await DB.auth.signIn($("email").value.trim(), $("password").value);
    btn.disabled = false; btn.textContent = "Ingresar";
    if (error) {
      const m = (error.message || "").toLowerCase();
      let txt = "No se pudo ingresar: " + (error.message || "error desconocido");
      if (m.includes("not confirmed") || m.includes("email")) txt = "El usuario existe pero el email NO está confirmado. En Supabase → Authentication → tu usuario → confirmalo (o recrealo tildando 'Auto Confirm User').";
      else if (m.includes("invalid")) txt = "Email o contraseña incorrectos, o el usuario no existe todavía.";
      msg.textContent = txt; msg.className = "msg error";
    }
    else if (data && data.user) mostrarPanel(data.user);
  });

  $("logout-btn").addEventListener("click", async () => { await DB.auth.signOut(); mostrarLogin(); });

  // ---------- TABS ----------
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    ["stats", "pedidos", "productos", "clientes", "resenas"].forEach((s) => $("sec-" + s).classList.toggle("hidden", s !== t.dataset.sec));
    cargarSeccion(t.dataset.sec);
  }));

  function cargarSeccion(s) {
    if (s === "stats") renderStats();
    else if (s === "pedidos") renderPedidos();
    else if (s === "productos") renderProductos();
    else if (s === "clientes") renderClientes();
    else if (s === "resenas") renderResenas();
  }

  // ---------- COMISIÓN GENIDEIA (15%) ----------
  // Se calcula solo sobre pedidos con pago confirmado (no pendientes ni cancelados).
  // El "período actual" son los pedidos posteriores a la última liquidación marcada como pagada:
  // al marcar una liquidación, el contador vuelve a arrancar en $0.
  const COMISION = 0.15;
  function comisionHTML(pedidos, liquidaciones) {
    const pagados = pedidos.filter((p) => p.estado !== "pendiente_pago" && p.estado !== "cancelado");
    const ultima = liquidaciones[0] || null; // ya vienen ordenadas por fecha desc
    const corte = ultima ? new Date(ultima.fecha + "T23:59:59") : null;
    const actuales = corte ? pagados.filter((p) => new Date(p.creado_en) > corte) : pagados;

    const ventasTotal = actuales.reduce((s, p) => s + Number(p.total || 0), 0);
    const comisionTotal = Math.round(ventasTotal * COMISION);

    const filasHist = liquidaciones.map((l) =>
      '<tr data-id="' + esc(l.id) + '">' +
      '<td>' + new Date(l.fecha + "T00:00:00").toLocaleDateString("es-UY", { day: "2-digit", month: "short", year: "numeric" }) + '</td>' +
      '<td>' + money(l.ventas_total) + '</td>' +
      '<td style="color:var(--gold-soft);font-weight:600">' + money(l.comision_total) + '</td>' +
      '<td>' + (l.nota ? esc(l.nota) : '<span style="color:var(--muted)">—</span>') + '</td>' +
      '<td>' + (l.comprobante_path ? '<button class="mini ver-comprobante" data-path="' + esc(l.comprobante_path) + '">Ver comprobante</button>' : '<span style="color:var(--muted)">Sin comprobante</span>') + '</td>' +
      '<td class="row-actions"><button class="mini del liq-borrar" data-id="' + esc(l.id) + '">×</button></td></tr>'
    ).join("");

    return '<div class="card" style="border:1px solid var(--gold)">' +
      '<div class="card-h">Comisión GENIDEIA (15%) <span style="font-size:12px;color:var(--muted);font-family:\'DM Sans\',sans-serif;font-weight:400">· período actual' + (ultima ? " · desde " + new Date(ultima.fecha + "T00:00:00").toLocaleDateString("es-UY", { day: "2-digit", month: "short" }) : "") + '</span></div>' +
      '<div class="cards" style="margin-bottom:14px">' +
      '<div class="stat"><div class="lbl">Ventas del período</div><div class="num">' + money(ventasTotal) + '</div></div>' +
      '<div class="stat" style="border-color:var(--gold)"><div class="lbl">Comisión a transferir</div><div class="num" style="color:var(--gold-soft)">' + money(comisionTotal) + '</div></div>' +
      '<div class="stat"><div class="lbl">Pedidos del período</div><div class="num">' + actuales.length + '</div></div>' +
      '</div>' +
      (actuales.length
        ? '<div style="padding:0 16px 16px"><button class="btn" id="marcar-pagada" style="width:auto;padding:10px 18px">Marcar comisión como pagada hoy</button></div>'
        : '<div class="empty">Todavía no hay ventas pendientes de liquidar en este período.</div>') +
      '<div id="form-liquidacion" class="hidden" style="padding:0 16px 16px">' +
      '<div class="form-grid" style="border:none;padding:12px;background:var(--panel2);border-radius:10px">' +
      '<input class="field" id="liq-fecha" type="date" style="margin:0">' +
      '<input class="field" id="liq-nota" placeholder="Nota (opcional)" style="margin:0">' +
      '<label class="mini up" style="text-align:center;line-height:2.4">＋ Adjuntar comprobante<input type="file" id="liq-comprobante" accept="image/*,.pdf" style="display:none"></label>' +
      '<button class="btn" id="liq-confirmar" style="width:auto;padding:11px 16px">Confirmar</button>' +
      '</div><p id="liq-archivo-nombre" style="font-size:12px;color:var(--muted);margin-top:6px"></p>' +
      '<p id="liq-msg" style="font-size:13px;margin-top:6px"></p>' +
      '</div>' +
      '<div class="card-h" style="border-top:1px solid var(--line)">Historial de liquidaciones' +
      (liquidaciones.length ? '' : '') + '</div>' +
      (liquidaciones.length
        ? '<table><thead><tr><th>Fecha</th><th>Ventas</th><th>Comisión pagada</th><th>Nota</th><th>Comprobante</th><th></th></tr></thead><tbody>' + filasHist + '</tbody></table>'
        : '<div class="empty">Todavía no se marcó ninguna comisión como pagada.</div>') +
      '</div>';
  }

  function wireComision(el, pedidos, liquidaciones) {
    const btnAbrir = el.querySelector("#marcar-pagada");
    const formBox = el.querySelector("#form-liquidacion");
    if (btnAbrir) btnAbrir.addEventListener("click", () => {
      formBox.classList.toggle("hidden");
      el.querySelector("#liq-fecha").value = new Date().toISOString().slice(0, 10);
    });

    let archivoElegido = null;
    const inputFile = el.querySelector("#liq-comprobante");
    if (inputFile) inputFile.addEventListener("change", () => {
      archivoElegido = inputFile.files && inputFile.files[0] ? inputFile.files[0] : null;
      el.querySelector("#liq-archivo-nombre").textContent = archivoElegido ? "Adjunto: " + archivoElegido.name : "";
    });

    const btnConfirmar = el.querySelector("#liq-confirmar");
    if (btnConfirmar) btnConfirmar.addEventListener("click", async () => {
      const fecha = el.querySelector("#liq-fecha").value;
      const nota = el.querySelector("#liq-nota").value.trim();
      const msg = el.querySelector("#liq-msg");
      if (!fecha) { msg.textContent = "Elegí una fecha."; msg.style.color = "var(--danger)"; return; }

      const ultima = liquidaciones[0] || null;
      const corte = ultima ? new Date(ultima.fecha + "T23:59:59") : null;
      const pagados = pedidos.filter((p) => p.estado !== "pendiente_pago" && p.estado !== "cancelado");
      const actuales = corte ? pagados.filter((p) => new Date(p.creado_en) > corte) : pagados;
      const ventasTotal = actuales.reduce((s, p) => s + Number(p.total || 0), 0);
      const comisionTotal = Math.round(ventasTotal * COMISION);

      btnConfirmar.disabled = true; btnConfirmar.textContent = "Guardando…"; msg.textContent = "";
      let comprobantePath = null;
      if (archivoElegido) {
        comprobantePath = await DB.subirComprobante(archivoElegido);
        if (!comprobantePath) { msg.textContent = "No se pudo subir el comprobante. Probá de nuevo."; msg.style.color = "var(--danger)"; btnConfirmar.disabled = false; btnConfirmar.textContent = "Confirmar"; return; }
      }
      const r = await DB.adminCrearLiquidacion({ fecha, ventas_total: ventasTotal, comision_total: comisionTotal, comprobante_path: comprobantePath, nota });
      btnConfirmar.disabled = false; btnConfirmar.textContent = "Confirmar";
      if (r && r.error) { msg.textContent = "Error al guardar: " + r.error.message; msg.style.color = "var(--danger)"; return; }
      renderStats();
    });

    el.querySelectorAll(".ver-comprobante").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true; const prev = b.textContent; b.textContent = "…";
      const url = await DB.urlComprobante(b.dataset.path);
      b.disabled = false; b.textContent = prev;
      if (url) window.open(url, "_blank"); else alert("No se pudo abrir el comprobante.");
    }));

    el.querySelectorAll(".liq-borrar").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("¿Eliminar esta liquidación del historial? Los pedidos que cubría volverán a contarse como pendientes.")) return;
      b.disabled = true;
      await DB.adminEliminarLiquidacion(b.dataset.id);
      renderStats();
    }));
  }

  // ---------- ESTADÍSTICAS ----------
  async function renderStats() {
    const el = $("sec-stats");
    el.innerHTML = '<div class="loading">Cargando métricas…</div>';
    const conteo = await DB.adminConteoEventos();
    const pedidos = await DB.adminPedidos();
    const liquidaciones = await DB.adminLiquidaciones();
    if (!PRODUCTOS.length) PRODUCTOS = await DB.adminTodosLosProductos();
    const nombre = (id) => { const p = PRODUCTOS.find((x) => x.id === id); return p ? p.nombre : id; };
    const cont = (tipo) => conteo[tipo] || 0;

    // top productos por vistas + agregados al carrito
    const top = await DB.adminTopProductos(6);
    const max = top.length ? top[0][1] : 1;

    el.innerHTML =
      comisionHTML(pedidos, liquidaciones) +
      '<div class="cards">' +
      stat("Visitas", cont("visita")) +
      stat("Vistas de producto", cont("ver_producto")) +
      stat("Agregados al carrito", cont("add_carrito")) +
      stat("Checkouts", cont("checkout")) +
      stat("Clics a WhatsApp", cont("click_whatsapp")) +
      '</div>' +
      '<div class="card"><div class="card-h">Productos con más interés</div>' +
      (top.length ? '<div class="bars">' + top.map(([id, v]) =>
        '<div class="bar-row"><span class="name">' + esc(nombre(id)) + '</span><span class="bar-track"><span class="bar-fill" style="width:' + Math.round(v / max * 100) + '%"></span></span><span class="val">' + v + '</span></div>'
      ).join("") + '</div>' : '<div class="empty">Todavía no hay datos de interacción.</div>') +
      '</div>';

    wireComision(el.querySelector(".card"), pedidos, liquidaciones);
  }
  const stat = (lbl, num) => '<div class="stat"><div class="lbl">' + lbl + '</div><div class="num">' + num + '</div></div>';

  // ---------- PEDIDOS ----------
  async function renderPedidos() {
    const el = $("sec-pedidos");
    el.innerHTML = '<div class="loading">Cargando pedidos…</div>';
    const pedidos = await DB.adminPedidos();
    if (!pedidos.length) { el.innerHTML = '<div class="card"><div class="empty">Todavía no hay pedidos.</div></div>'; return; }
    el.innerHTML = '<div class="card"><div class="card-h">Pedidos (' + pedidos.length + ')</div>' +
      '<table><thead><tr><th>Fecha</th><th>N°</th><th>Cliente</th><th>Total</th><th>Pago</th><th>Estado</th></tr></thead><tbody>' +
      pedidos.map((p) =>
        '<tr><td>' + fecha(p.creado_en) + '</td><td>' + esc(p.id) + '</td>' +
        '<td>' + esc(p.cliente_nombre || "—") + '<br><span style="color:var(--muted);font-size:12px">' + esc(p.cliente_email || "") + '</span></td>' +
        '<td>' + money(p.total) + '</td><td><span class="pill">' + esc(p.metodo_pago || "—") + '</span></td>' +
        '<td><select class="estado" data-id="' + esc(p.id) + '">' +
        ESTADOS.map((s) => '<option value="' + s + '"' + (s === p.estado ? " selected" : "") + '>' + ESTADO_LABEL[s] + '</option>').join("") +
        '</select></td></tr>'
      ).join("") + '</tbody></table></div>';

    el.querySelectorAll("select.estado").forEach((sel) => sel.addEventListener("change", async () => {
      sel.disabled = true;
      await DB.adminActualizarEstadoPedido(sel.dataset.id, sel.value);
      sel.disabled = false;
    }));
  }

  // ---------- PRODUCTOS ----------
  async function renderProductos() {
    const el = $("sec-productos");
    el.innerHTML = '<div class="loading">Cargando productos…</div>';
    PRODUCTOS = await DB.adminTodosLosProductos();

    const imgsDe = (p) => (Array.isArray(p.imagenes) && p.imagenes.length) ? p.imagenes : (p.img_url ? [p.img_url] : []);
    const portada = (p) => p.img_url || imgsDe(p)[0] || "";
    const miniUrl = (u) => (DB.urlMiniaturaProducto ? DB.urlMiniaturaProducto(u) : u);
    const galeriaThumbs = (imgs) => (!imgs || !imgs.length)
      ? '<span class="g-empty">Sin fotos todavía — agregá abajo 👇</span>'
      : imgs.map((u, i) => '<span class="gthumb' + (i === 0 ? ' es-portada' : '') + '"><img src="' + esc(miniUrl(u)) + '" loading="lazy" decoding="async"><button class="gthumb-x" data-i="' + i + '" title="Quitar">×</button>' + (i === 0 ? '<em>portada</em>' : '') + '</span>').join('');

    const filas = PRODUCTOS.map((p) =>
      '<tr data-id="' + esc(p.id) + '">' +
      '<td><input class="cell" data-f="id" value="' + esc(p.id) + '" style="width:90px;font-family:monospace"></td>' +
      '<td class="foto-cell">' + (portada(p) ? '<img class="foto-mini" src="' + esc(portada(p)) + '" alt="">' : '<span style="color:var(--muted);font-size:11px">sin foto</span>') +
        '<button class="mini det-toggle" type="button">🖼 ' + imgsDe(p).length + ' · Detalle</button></td>' +
      '<td><input class="cell" data-f="nombre" value="' + esc(p.nombre) + '" style="width:150px"></td>' +
      '<td><input class="cell" data-f="precio" type="number" value="' + Number(p.precio) + '" style="width:80px"></td>' +
      '<td><select class="cell" data-f="categoria"><option value="caballeros"' + (p.categoria === "caballeros" ? " selected" : "") + '>Caballeros</option><option value="damas"' + (p.categoria === "damas" ? " selected" : "") + '>Damas</option></select></td>' +
      '<td><input type="checkbox" data-f="activo"' + (p.activo ? " checked" : "") + '></td>' +
      '<td class="row-actions"><button class="mini guardar">Guardar</button><button class="mini del eliminar">×</button></td></tr>' +
      '<tr class="detalle-row hidden" data-detalle="' + esc(p.id) + '"><td colspan="7"><div class="detalle-box">' +
        '<div class="det-col det-galeria"><div class="det-lbl">Galería del producto <span>· la 1ª foto es la portada</span></div>' +
          '<div class="galeria-admin">' + galeriaThumbs(imgsDe(p)) + '</div>' +
          '<label class="mini up">＋ Agregar fotos<input type="file" accept="image/*" multiple class="galeria-input" style="display:none"></label></div>' +
        '<div class="det-col det-desc"><div class="det-lbl">Descripción <span>· la ve el cliente en el detalle</span></div>' +
          '<textarea class="cell desc-input" rows="5" placeholder="Material, medidas, detalles del modelo…">' + esc(p.descripcion || "") + '</textarea>' +
          '<button class="mini guardar-detalle" type="button">Guardar descripción</button></div>' +
      '</div></td></tr>'
    ).join("");

    const pendientesOpt = PRODUCTOS.filter((p) => imgsDe(p).some((u) => DB.esImagenOptimizada && !DB.esImagenOptimizada(u))).length;
    el.innerHTML = '<div class="card"><div class="card-h" style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap"><span>Productos (' + PRODUCTOS.length + ') <span style="font-size:12px;color:var(--muted);font-family:\'DM Sans\',sans-serif;font-weight:400">· las nuevas fotos se comprimen automáticamente</span></span>' +
      '<span style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span id="img-opt-status" style="font-size:11px;color:var(--muted);font-family:\'DM Sans\',sans-serif;font-weight:400">' + (pendientesOpt ? pendientesOpt + ' producto(s) con fotos antiguas' : '✓ imágenes optimizadas') + '</span>' +
      (pendientesOpt ? '<button class="mini up" id="optimizar-imagenes" type="button">⚡ Optimizar fotos actuales</button>' : '') + '</span></div>' +
      '<div class="form-grid" id="nuevo-prod">' +
      '<input class="field" id="np-id" placeholder="Código (DON00XX) *" style="margin:0">' +
      '<input class="field" id="np-nombre" placeholder="Nombre *" style="margin:0">' +
      '<input class="field" id="np-precio" type="number" placeholder="Precio" style="margin:0">' +
      '<select class="field" id="np-cat" style="margin:0"><option value="caballeros">Caballeros</option><option value="damas">Damas</option></select>' +
      '<button class="btn" id="np-add" style="width:auto;padding:11px 16px">Agregar</button></div>' +
      '<table><thead><tr><th>Código</th><th>Foto</th><th>Nombre</th><th>Precio</th><th>Categoría</th><th>Activo</th><th></th></tr></thead><tbody>' + filas + '</tbody></table></div>';

    // guardar fila
    el.querySelectorAll(".guardar").forEach((b) => b.addEventListener("click", async () => {
      const tr = b.closest("tr"), idOrig = tr.dataset.id;
      const orig = PRODUCTOS.find((x) => x.id === idOrig) || {};
      const idNuevo = tr.querySelector('[data-f="id"]').value.trim();
      if (!idNuevo) { alert("El código no puede quedar vacío."); return; }
      b.disabled = true; b.textContent = "…";
      // si cambió el código (clave primaria), renombrarlo antes de guardar el resto
      if (idNuevo !== idOrig) {
        const r = await DB.adminCambiarCodigo(idOrig, idNuevo);
        if (r && r.error) {
          b.disabled = false; b.textContent = "Guardar";
          alert(r.error.code === "23505"
            ? "Ya existe un producto con el código " + idNuevo + ". Elegí otro."
            : "No se pudo cambiar el código: " + r.error.message);
          return;
        }
      }
      const upd = Object.assign({}, orig, {
        id: idNuevo,
        nombre: tr.querySelector('[data-f="nombre"]').value.trim(),
        precio: parseInt(tr.querySelector('[data-f="precio"]').value, 10) || 0,
        categoria: tr.querySelector('[data-f="categoria"]').value,
        activo: tr.querySelector('[data-f="activo"]').checked,
      });
      await DB.adminUpsertProducto(upd);
      // reflejar el código nuevo en la fila y en memoria, para sucesivos guardados
      tr.dataset.id = idNuevo;
      const idx = PRODUCTOS.findIndex((x) => x.id === idOrig);
      if (idx >= 0) PRODUCTOS[idx] = upd;
      b.textContent = "✓"; setTimeout(() => { b.textContent = "Guardar"; b.disabled = false; }, 1200);
    }));
    // eliminar (saca también la fila de detalle hermana)
    el.querySelectorAll(".eliminar").forEach((b) => b.addEventListener("click", async () => {
      const tr = b.closest("tr"), id = tr.dataset.id;
      if (!confirm("¿Eliminar el producto " + id + "?")) return;
      await DB.adminEliminarProducto(id);
      const det = tr.nextElementSibling;
      if (det && det.classList.contains("detalle-row")) det.remove();
      tr.remove();
    }));

    // re-pinta galería + portada + contador de un producto sin recargar todo
    function refreshGaleria(id) {
      const p = PRODUCTOS.find((x) => x.id === id); if (!p) return;
      const imgs = Array.isArray(p.imagenes) ? p.imagenes : [];
      const det = el.querySelector('.detalle-row[data-detalle="' + id + '"]');
      const row = el.querySelector('tr[data-id="' + id + '"]');
      if (det) det.querySelector(".galeria-admin").innerHTML = galeriaThumbs(imgs);
      if (row) {
        const fc = row.querySelector(".foto-cell"), port = p.img_url || imgs[0] || "";
        let mini = fc.querySelector(".foto-mini");
        if (port) { if (!mini) { mini = document.createElement("img"); mini.className = "foto-mini"; fc.prepend(mini); } mini.src = port; }
        else if (mini) mini.remove();
        const tg = fc.querySelector(".det-toggle"); if (tg) tg.textContent = "🖼 " + imgs.length + " · Detalle";
      }
    }

    // abrir/cerrar el panel de detalle
    el.querySelectorAll(".det-toggle").forEach((b) => b.addEventListener("click", () => {
      const det = b.closest("tr").nextElementSibling;
      if (det && det.classList.contains("detalle-row")) det.classList.toggle("hidden");
    }));

    // agregar varias fotos a la galería
    el.querySelectorAll(".galeria-input").forEach((inp) => inp.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []); if (!files.length) return;
      const id = inp.closest(".detalle-row").dataset.detalle;
      const p = PRODUCTOS.find((x) => x.id === id); if (!p) return;
      const txt = inp.closest("label").firstChild, prev = txt.textContent;
      txt.textContent = "Optimizando…";
      const optimizadas = DB.subirImagenesProductoOptimizadas
        ? await DB.subirImagenesProductoOptimizadas(files, id)
        : (await DB.subirImagenesProducto(files, id)).map((u) => ({ fullUrl: u, thumbUrl: u }));
      if (!optimizadas.length) { txt.textContent = "Error al subir"; setTimeout(() => txt.textContent = prev, 1500); return; }
      const urls = optimizadas.map((x) => x.fullUrl).filter(Boolean);
      p.imagenes = (Array.isArray(p.imagenes) ? p.imagenes : []).concat(urls);
      p.img_url = p.imagenes[0] ? miniUrl(p.imagenes[0]) : "";
      await DB.adminUpsertProducto({ id, imagenes: p.imagenes, img_url: p.img_url });
      refreshGaleria(id); txt.textContent = prev; inp.value = "";
    }));

    // quitar una foto (delegado en el contenedor, que sobrevive al repintado de thumbs)
    el.querySelectorAll(".galeria-admin").forEach((cont) => cont.addEventListener("click", async (e) => {
      const x = e.target.closest(".gthumb-x"); if (!x) return;
      const id = cont.closest(".detalle-row").dataset.detalle;
      const p = PRODUCTOS.find((y) => y.id === id); if (!p) return;
      const imgs = Array.isArray(p.imagenes) ? p.imagenes.slice() : [];
      const removed = imgs.splice(parseInt(x.dataset.i, 10), 1)[0];
      p.imagenes = imgs; p.img_url = imgs[0] ? miniUrl(imgs[0]) : "";
      await DB.adminUpsertProducto({ id, imagenes: imgs, img_url: p.img_url });
      refreshGaleria(id);
      if (removed && DB.eliminarImagenesProducto) DB.eliminarImagenesProducto([removed]);
    }));

    // Optimización única de fotos que ya estaban guardadas antes de este fix.
    const optBtn = $("optimizar-imagenes");
    if (optBtn) optBtn.addEventListener("click", async () => {
      const status = $("img-opt-status");
      const pendientes = PRODUCTOS.filter((p) => imgsDe(p).some((u) => DB.esImagenOptimizada && !DB.esImagenOptimizada(u)));
      if (!pendientes.length) { status.textContent = "✓ imágenes optimizadas"; optBtn.remove(); return; }
      if (!confirm("Se van a comprimir las fotos actuales y reemplazar sus URLs. No cambia el diseño ni la calidad visible. Puede tardar unos minutos.")) return;
      optBtn.disabled = true;
      let fotosHechas = 0, bytesAntes = 0, bytesDespues = 0;
      const totalFotos = pendientes.reduce((n, p) => n + imgsDe(p).filter((u) => !DB.esImagenOptimizada(u)).length, 0);
      try {
        for (let pi = 0; pi < PRODUCTOS.length; pi++) {
          const p = PRODUCTOS[pi];
          const actuales = imgsDe(p).filter(Boolean);
          if (!actuales.length) continue;
          const nuevas = [];
          const antiguasParaBorrar = [];
          let cambio = false;

          for (let ii = 0; ii < actuales.length; ii++) {
            const u = actuales[ii];
            if (DB.esImagenOptimizada(u)) {
              nuevas.push(DB.urlFullProducto ? DB.urlFullProducto(u) : u);
              continue;
            }
            status.textContent = "Optimizando " + p.id + " · foto " + (ii + 1) + "/" + actuales.length + " · " + fotosHechas + "/" + totalFotos;
            const r = await DB.optimizarImagenProductoDesdeUrl(u, p.id);
            if (!r || !r.fullUrl) throw new Error("No se pudo optimizar una foto de " + p.id);
            nuevas.push(r.fullUrl);
            antiguasParaBorrar.push(u);
            bytesAntes += r.originalBytes || 0;
            bytesDespues += r.optimizedBytes || 0;
            fotosHechas++;
            cambio = true;
          }

          const portadaNueva = nuevas[0] ? miniUrl(nuevas[0]) : "";
          if (cambio || p.img_url !== portadaNueva) {
            const { error } = await DB.adminUpsertProducto({ id: p.id, imagenes: nuevas, img_url: portadaNueva });
            if (error) throw error;
            p.imagenes = nuevas;
            p.img_url = portadaNueva;
            if (antiguasParaBorrar.length && DB.eliminarImagenesProducto) await DB.eliminarImagenesProducto(antiguasParaBorrar);
          }
        }
        const ahorro = bytesAntes > 0 ? Math.max(0, Math.round((1 - bytesDespues / bytesAntes) * 100)) : 0;
        status.textContent = "✓ Listo · " + fotosHechas + " fotos optimizadas" + (bytesAntes ? " · ~" + ahorro + "% menos peso" : "");
        optBtn.remove();
        setTimeout(renderProductos, 1200);
      } catch (err) {
        console.error("[Admin] optimización de imágenes", err);
        status.textContent = "Error: " + (err.message || "no se pudo completar");
        status.style.color = "var(--danger)";
        optBtn.disabled = false;
      }
    });

    // guardar descripción
    el.querySelectorAll(".guardar-detalle").forEach((b) => b.addEventListener("click", async () => {
      const id = b.closest(".detalle-row").dataset.detalle;
      const p = PRODUCTOS.find((x) => x.id === id); if (!p) return;
      const desc = b.closest(".detalle-row").querySelector(".desc-input").value;
      b.disabled = true; b.textContent = "…";
      p.descripcion = desc;
      await DB.adminUpsertProducto({ id, descripcion: desc });
      b.textContent = "✓"; setTimeout(() => { b.textContent = "Guardar descripción"; b.disabled = false; }, 1200);
    }));

    // agregar nuevo
    $("np-add").addEventListener("click", async () => {
      const id = $("np-id").value.trim(), nombre = $("np-nombre").value.trim();
      if (!id || !nombre) { alert("Código y nombre son obligatorios."); return; }
      await DB.adminUpsertProducto({ id, nombre, precio: parseInt($("np-precio").value, 10) || 0, categoria: $("np-cat").value, activo: true, orden: (PRODUCTOS.length + 1) * 10 });
      renderProductos();
    });
  }

  // ---------- CLIENTES ----------
  async function renderClientes() {
    const el = $("sec-clientes");
    el.innerHTML = '<div class="loading">Cargando clientes…</div>';
    const cs = await DB.adminClientes();
    if (!cs.length) { el.innerHTML = '<div class="card"><div class="empty">Todavía no hay clientes registrados.</div></div>'; return; }
    el.innerHTML = '<div class="card"><div class="card-h">Clientes (' + cs.length + ')</div>' +
      '<table><thead><tr><th>Fecha</th><th>Nombre</th><th>Email</th><th>Teléfono</th></tr></thead><tbody>' +
      cs.map((c) => '<tr><td>' + fecha(c.creado_en) + '</td><td>' + esc(c.nombre || "—") + '</td><td>' + esc(c.email || "") + '</td><td>' + esc(c.telefono || "—") + '</td></tr>').join("") +
      '</tbody></table></div>';
  }

  // ---------- RESEÑAS ----------
  const estrellasTxt = (n) => "★".repeat(n) + "☆".repeat(5 - n);
  async function renderResenas() {
    const el = $("sec-resenas");
    el.innerHTML = '<div class="loading">Cargando reseñas…</div>';
    const rs = await DB.adminResenas();
    if (!PRODUCTOS.length) PRODUCTOS = await DB.adminTodosLosProductos();
    const nombreProd = (id) => { if (!id) return "—"; const p = PRODUCTOS.find((x) => x.id === id); return p ? p.nombre : id; };
    if (!rs.length) { el.innerHTML = '<div class="card"><div class="empty">Todavía no llegaron reseñas. Cuando un cliente deje la suya en la web, aparece acá para que la apruebes.</div></div>'; return; }

    const pendientes = rs.filter((r) => !r.aprobada).length;
    el.innerHTML = '<div class="card"><div class="card-h">Reseñas (' + rs.length + ')' +
      (pendientes ? ' <span style="font-size:12px;color:var(--gold-soft);font-family:\'DM Sans\',sans-serif;font-weight:400">· ' + pendientes + ' pendiente' + (pendientes === 1 ? "" : "s") + ' de aprobar</span>' : '') +
      ' <span style="font-size:12px;color:var(--muted);font-family:\'DM Sans\',sans-serif;font-weight:400">· solo las aprobadas se muestran en la web</span></div>' +
      '<table><thead><tr><th>Fecha</th><th>Cliente</th><th>Puntaje</th><th>Reseña</th><th>Producto</th><th>Verificada</th><th>Estado</th><th></th></tr></thead><tbody>' +
      rs.map((r) =>
        '<tr' + (!r.aprobada ? ' style="background:rgba(185,154,82,.05)"' : '') + '>' +
        '<td>' + fecha(r.creado_en) + '</td>' +
        '<td>' + esc(r.nombre) + (r.email ? '<br><span style="color:var(--muted);font-size:12px">' + esc(r.email) + '</span>' : '') + '</td>' +
        '<td style="color:var(--gold-soft);white-space:nowrap">' + estrellasTxt(r.estrellas) + '</td>' +
        '<td style="max-width:280px">' + esc(r.texto || "—") + '</td>' +
        '<td>' + esc(nombreProd(r.producto_id)) + (r.pedido_id ? '<br><span style="color:var(--muted);font-size:12px">Pedido ' + esc(r.pedido_id) + '</span>' : '') + '</td>' +
        '<td>' + (r.verificada ? '<span class="pill" style="color:var(--gold-soft)">✓ compra real</span>' : '—') + '</td>' +
        '<td><span class="pill">' + (r.aprobada ? "Publicada" : "Pendiente") + '</span></td>' +
        '<td class="row-actions" style="white-space:nowrap">' +
          '<button class="mini res-aprobar" data-id="' + r.id + '" data-a="' + (r.aprobada ? 0 : 1) + '">' + (r.aprobada ? "Ocultar" : "Aprobar") + '</button>' +
          '<button class="mini del res-borrar" data-id="' + r.id + '">×</button></td></tr>'
      ).join("") + '</tbody></table></div>';

    el.querySelectorAll(".res-aprobar").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      await DB.adminAprobarResena(b.dataset.id, b.dataset.a === "1");
      renderResenas();
    }));
    el.querySelectorAll(".res-borrar").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("¿Eliminar esta reseña? No se puede deshacer.")) return;
      b.disabled = true;
      await DB.adminEliminarResena(b.dataset.id);
      renderResenas();
    }));
  }

  init();
})();
