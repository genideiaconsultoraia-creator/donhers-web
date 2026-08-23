// ============================================================
//  Donher's — Capa de datos sobre Supabase
//  Requiere, cargados ANTES: supabase-js (CDN) + js/config.js
//  Expone window.DB con métodos para productos, pedidos,
//  eventos (métricas) y auth del panel interno.
// ============================================================
(function () {
  const cfg = window.SUPABASE_CONFIG;
  if (!cfg || !window.supabase) {
    console.warn("[DB] Supabase no disponible — la web funciona en modo local.");
    window.DB = { ok: false };
    return;
  }

  const sb = window.supabase.createClient(cfg.url, cfg.key);

  // id anónimo de visitante (para métricas), persistente en el navegador
  function sessionId() {
    let id = localStorage.getItem("dh_sid");
    if (!id) {
      id = "s_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("dh_sid", id);
    }
    return id;
  }

  window.DB = {
    ok: true,
    client: sb,

    // ---------- PRODUCTOS ----------
    async getProductos() {
      const { data, error } = await sb
        .from("productos")
        .select("*")
        .eq("activo", true)
        .order("orden", { ascending: true });
      if (error) { console.error("[DB] getProductos", error); return []; }
      return data || [];
    },

    // ---------- PEDIDOS ----------
    // order = { id, cliente_email, cliente_nombre, total, metodo_pago, datos_envio, items:[{producto_id,nombre,precio,qty}] }
    async crearPedido(order) {
      const { error: e1 } = await sb.from("pedidos").insert({
        id: order.id,
        cliente_email: order.cliente_email || null,
        cliente_nombre: order.cliente_nombre || null,
        total: order.total || 0,
        estado: order.estado || "pendiente_pago",
        metodo_pago: order.metodo_pago || null,
        datos_envio: order.datos_envio || null,
      });
      if (e1) { console.error("[DB] crearPedido", e1); return { ok: false, error: e1 }; }

      if (Array.isArray(order.items) && order.items.length) {
        const rows = order.items.map((i) => ({
          pedido_id: order.id,
          producto_id: i.producto_id || i.id || null,
          nombre: i.nombre || i.name,
          precio: i.precio || i.price || 0,
          qty: i.qty || 1,
        }));
        const { error: e2 } = await sb.from("pedido_items").insert(rows);
        if (e2) console.error("[DB] crearPedido items", e2);
      }
      return { ok: true };
    },

    // ---------- SEGUIMIENTO DE PEDIDO (comprador, sin login) ----------
    // Devuelve el estado actual de un pedido si coinciden número + email.
    // Usa una función segura (RPC) que NO expone la tabla de pedidos.
    async estadoPedido(id, email) {
      try {
        const { data, error } = await sb.rpc("seguimiento_pedido", { p_id: id, p_email: email });
        if (error || !data || !data.length) return null;
        return data[0]; // { id, estado, total, creado_en, actualizado_en }
      } catch (e) { return null; }
    },

    // ---------- EVENTOS (métricas) ----------
    async track(tipo, extra = {}) {
      try {
        await sb.from("eventos").insert({
          tipo,
          producto_id: extra.producto_id || null,
          session_id: sessionId(),
          path: location.pathname,
          meta: extra.meta || null,
        });
      } catch (e) { /* silencioso: métricas nunca rompen la web */ }
    },

    // ---------- AUTH (panel interno) ----------
    auth: {
      async signIn(email, password) {
        return await sb.auth.signInWithPassword({ email, password });
      },
      async signUp(email, password, meta) {
        return await sb.auth.signUp({ email, password, options: { data: meta || {} } });
      },
      async signOut() { return await sb.auth.signOut(); },
      async getUser() { const { data } = await sb.auth.getUser(); return data?.user || null; },
      onChange(cb) { return sb.auth.onAuthStateChange((_e, session) => cb(session?.user || null)); },
    },

    // Registra al comprador en la tabla clientes. Va por RPC (security definer):
    // si el mail ya existe completa lo que falte en vez de duplicar la fila
    // (ver registrar-cliente.sql). Se llama al crear cuenta Y al comprar.
    async crearCliente(c) {
      try {
        await sb.rpc("registrar_cliente", {
          p_email: c.email,
          p_nombre: c.nombre || null,
          p_telefono: c.telefono || null,
        });
      } catch (e) { /* no rompe el registro ni la compra */ }
    },

    // ¿El usuario logueado tiene acceso al panel? (solo emails de la tabla admins)
    async esAdmin() {
      try { const { data, error } = await sb.rpc("es_admin"); return !error && data === true; }
      catch (e) { return false; }
    },

    // ---------- ADMIN (requieren sesión logueada Y ser admin; RLS lo exige) ----------
    async adminPedidos() {
      const { data, error } = await sb.from("pedidos").select("*").order("creado_en", { ascending: false });
      if (error) { console.error("[DB] adminPedidos", error); return []; }
      return data || [];
    },
    async adminActualizarEstadoPedido(id, estado) {
      return await sb.from("pedidos").update({ estado, actualizado_en: new Date().toISOString() }).eq("id", id);
    },
    async adminRetiros() {
      const { data, error } = await sb.from("retiros_comision").select("*").order("fecha", { ascending: false });
      if (error) { console.error("[DB] adminRetiros", error); return []; }
      return data || [];
    },
    async adminAgregarRetiro(monto, fecha, nota) {
      return await sb.from("retiros_comision").insert({ monto, fecha: fecha || new Date().toISOString().slice(0, 10), nota: nota || null });
    },
    async adminEliminarRetiro(id) {
      return await sb.from("retiros_comision").delete().eq("id", id);
    },
    async adminClientes() {
      const { data, error } = await sb.from("clientes").select("*").order("creado_en", { ascending: false });
      if (error) { console.error("[DB] adminClientes", error); return []; }
      return data || [];
    },
    // Conteo agregado en la base (evita el tope de 1000 filas de la API
    // al traer eventos crudos con .select('*') — ver agregar-conteo-eventos.sql).
    async adminConteoEventos() {
      const { data, error } = await sb.rpc("admin_conteo_eventos");
      if (error) { console.error("[DB] adminConteoEventos", error); return {}; }
      const porTipo = {};
      (data || []).forEach((r) => { porTipo[r.tipo] = Number(r.cantidad); });
      return porTipo;
    },
    async adminTopProductos(limite) {
      const { data, error } = await sb.rpc("admin_top_productos", { p_limit: limite || 6 });
      if (error) { console.error("[DB] adminTopProductos", error); return []; }
      return (data || []).map((r) => [r.producto_id, Number(r.cantidad)]);
    },
    // CRUD de productos (panel)
    async adminUpsertProducto(p) {
      return await sb.from("productos").upsert(p);
    },
    // Renombra el código (clave primaria) de un producto ya existente.
    // No rompe pedidos/eventos: guardan producto_id como texto histórico (sin FK).
    async adminCambiarCodigo(viejo, nuevo) {
      return await sb.from("productos").update({ id: nuevo }).eq("id", viejo);
    },
    // Sube una foto al bucket "productos" y devuelve la URL pública.
    // path único (timestamp + aleatorio) para no pisar al subir varias a la vez.
    async subirImagenProducto(file, id) {
      try {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
        const rnd = Math.random().toString(36).slice(2, 7);
        const path = id + "-" + Date.now() + "-" + rnd + "." + ext;
        const { error } = await sb.storage.from("productos").upload(path, file, { upsert: true, cacheControl: "3600" });
        if (error) { console.error("[DB] subirImagen", error); return null; }
        const { data } = sb.storage.from("productos").getPublicUrl(path);
        return (data && data.publicUrl) || null;
      } catch (e) { console.error("[DB] subirImagen", e); return null; }
    },
    // Sube varias fotos en orden y devuelve el array de URLs (las que fallan se omiten).
    async subirImagenesProducto(files, id) {
      const urls = [];
      for (const f of files) {
        const u = await this.subirImagenProducto(f, id);
        if (u) urls.push(u);
      }
      return urls;
    },
    async adminEliminarProducto(id) {
      return await sb.from("productos").delete().eq("id", id);
    },
    async adminTodosLosProductos() {
      const { data, error } = await sb.from("productos").select("*").order("orden", { ascending: true });
      if (error) { console.error("[DB] adminTodosLosProductos", error); return []; }
      return data || [];
    },

    // ---------- LIQUIDACIONES DE COMISIÓN ----------
    async adminLiquidaciones() {
      const { data, error } = await sb.from("liquidaciones_comision").select("*").order("fecha", { ascending: false });
      if (error) { console.error("[DB] adminLiquidaciones", error); return []; }
      return data || [];
    },
    // Sube el comprobante al bucket privado "comprobantes" y devuelve la ruta interna (no la URL pública).
    async subirComprobante(file) {
      try {
        const ext = (file.name.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "pdf";
        const path = Date.now() + "-" + Math.random().toString(36).slice(2, 7) + "." + ext;
        const { error } = await sb.storage.from("comprobantes").upload(path, file, { upsert: true, cacheControl: "3600" });
        if (error) { console.error("[DB] subirComprobante", error); return null; }
        return path;
      } catch (e) { console.error("[DB] subirComprobante", e); return null; }
    },
    // URL temporal (5 min) para ver/descargar un comprobante del bucket privado.
    async urlComprobante(path) {
      if (!path) return null;
      const { data, error } = await sb.storage.from("comprobantes").createSignedUrl(path, 300);
      if (error) { console.error("[DB] urlComprobante", error); return null; }
      return data?.signedUrl || null;
    },
    async adminCrearLiquidacion(l) {
      return await sb.from("liquidaciones_comision").insert({
        fecha: l.fecha,
        ventas_total: l.ventas_total || 0,
        comision_total: l.comision_total || 0,
        comprobante_path: l.comprobante_path || null,
        nota: l.nota || null,
      });
    },
    async adminEliminarLiquidacion(id) {
      return await sb.from("liquidaciones_comision").delete().eq("id", id);
    },

    // ---------- RESEÑAS ----------
    // Alta pública vía RPC (security definer): valida, marca "verificada" si
    // pedido+email coinciden con una compra real, y entra SIEMPRE sin aprobar.
    async crearResena(r) {
      try {
        const { data, error } = await sb.rpc("crear_resena", {
          p_producto_id: r.producto_id || null,
          p_pedido_id: r.pedido_id || null,
          p_nombre: r.nombre,
          p_email: r.email || null,
          p_estrellas: r.estrellas,
          p_texto: r.texto || null,
        });
        if (error) { console.error("[DB] crearResena", error); return { ok: false, error }; }
        return data || { ok: true };
      } catch (e) { console.error("[DB] crearResena", e); return { ok: false, error: e }; }
    },
    // Reseñas aprobadas (público). El email NUNCA se pide en el select.
    async getResenas(productoId) {
      let q = sb.from("resenas")
        .select("id, producto_id, nombre, estrellas, texto, verificada, creado_en")
        .order("creado_en", { ascending: false }).limit(60);
      if (productoId) q = q.eq("producto_id", productoId);
      const { data, error } = await q;
      if (error) { console.error("[DB] getResenas", error); return []; }
      return data || [];
    },
    // Panel: todas (pendientes + aprobadas), moderación.
    async adminResenas() {
      const { data, error } = await sb.from("resenas").select("*").order("creado_en", { ascending: false });
      if (error) { console.error("[DB] adminResenas", error); return []; }
      return data || [];
    },
    async adminAprobarResena(id, aprobada) {
      return await sb.from("resenas").update({ aprobada: !!aprobada }).eq("id", id);
    },
    async adminEliminarResena(id) {
      return await sb.from("resenas").delete().eq("id", id);
    },
  };
})();
