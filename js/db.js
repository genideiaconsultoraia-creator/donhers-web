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

  // ---------- OPTIMIZACIÓN DE IMÁGENES ----------
  // Las fotos de producto se comprimen EN EL NAVEGADOR antes de subirlas.
  // Guardamos 2 variantes por foto:
  //   - full:  hasta 1400 px (ficha / zoom)
  //   - thumb: hasta 640 px  (catálogo / carrito / miniaturas)
  // Ambas en WebP y con cache de 1 año. Los nombres son únicos, por lo que
  // podemos usar una cache larga sin riesgo de mostrar una versión vieja.
  const IMAGE_CACHE_SECONDS = "31536000";
  const FULL_MAX = 1400;
  const THUMB_MAX = 640;
  const FULL_QUALITY = 0.82;
  const THUMB_QUALITY = 0.78;

  function esImagenOptimizada(url) {
    return /-(?:full|thumb)\.webp(?:\?|$)/i.test(String(url || ""));
  }

  function urlMiniaturaProducto(url) {
    const s = String(url || "");
    return /-full\.webp(?:\?|$)/i.test(s) ? s.replace(/-full\.webp(\?|$)/i, "-thumb.webp$1") : s;
  }

  function urlFullProducto(url) {
    const s = String(url || "");
    return /-thumb\.webp(?:\?|$)/i.test(s) ? s.replace(/-thumb\.webp(\?|$)/i, "-full.webp$1") : s;
  }

  function storagePathFromPublicUrl(url) {
    try {
      const u = new URL(String(url || ""));
      const marker = "/storage/v1/object/public/productos/";
      const i = u.pathname.indexOf(marker);
      if (i < 0) return null;
      return decodeURIComponent(u.pathname.slice(i + marker.length));
    } catch (_) { return null; }
  }

  async function cargarBitmap(fileOrBlob) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(fileOrBlob, { imageOrientation: "from-image" }); }
      catch (_) { try { return await createImageBitmap(fileOrBlob); } catch (_) {} }
    }
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(fileOrBlob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  async function aWebp(fileOrBlob, maxEdge, quality) {
    const bitmap = await cargarBitmap(fileOrBlob);
    const sw = bitmap.width || bitmap.naturalWidth || 1;
    const sh = bitmap.height || bitmap.naturalHeight || 1;
    const scale = Math.min(1, maxEdge / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });
    // Fondo blanco evita transparencias accidentales en fotos de producto.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) try { bitmap.close(); } catch (_) {}
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => b ? resolve(b) : reject(new Error("No se pudo comprimir la imagen")), "image/webp", quality);
    });
    return blob;
  }

  async function subirParOptimizado(fileOrBlob, id) {
    const originalBytes = Number(fileOrBlob && fileOrBlob.size) || 0;
    const [fullBlob, thumbBlob] = await Promise.all([
      aWebp(fileOrBlob, FULL_MAX, FULL_QUALITY),
      aWebp(fileOrBlob, THUMB_MAX, THUMB_QUALITY),
    ]);
    const rnd = Math.random().toString(36).slice(2, 8);
    const base = String(id || "producto").replace(/[^a-z0-9_-]/gi, "-") + "-" + Date.now() + "-" + rnd;
    const fullPath = base + "-full.webp";
    const thumbPath = base + "-thumb.webp";

    const upFull = await sb.storage.from("productos").upload(fullPath, fullBlob, {
      upsert: false,
      cacheControl: IMAGE_CACHE_SECONDS,
      contentType: "image/webp",
    });
    if (upFull.error) throw upFull.error;

    const upThumb = await sb.storage.from("productos").upload(thumbPath, thumbBlob, {
      upsert: false,
      cacheControl: IMAGE_CACHE_SECONDS,
      contentType: "image/webp",
    });
    if (upThumb.error) {
      // Evitar dejar un full huérfano si falla la miniatura.
      try { await sb.storage.from("productos").remove([fullPath]); } catch (_) {}
      throw upThumb.error;
    }

    const fullUrl = sb.storage.from("productos").getPublicUrl(fullPath).data?.publicUrl || null;
    const thumbUrl = sb.storage.from("productos").getPublicUrl(thumbPath).data?.publicUrl || null;
    return {
      fullUrl, thumbUrl,
      fullPath, thumbPath,
      originalBytes,
      optimizedBytes: fullBlob.size + thumbBlob.size,
    };
  }

  async function optimizarDesdeUrl(url, id) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("No se pudo descargar la imagen actual (" + r.status + ")");
    const blob = await r.blob();
    if (!blob.type || !blob.type.startsWith("image/")) throw new Error("El archivo actual no es una imagen válida");
    return await subirParOptimizado(blob, id);
  }

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
    // Sube una foto optimizada y devuelve ambas variantes.
    async subirImagenProductoOptimizada(file, id) {
      try {
        if (!file || !String(file.type || "").startsWith("image/")) throw new Error("El archivo no es una imagen");
        return await subirParOptimizado(file, id);
      } catch (e) { console.error("[DB] subirImagenProductoOptimizada", e); return null; }
    },
    // Sube varias fotos optimizadas en orden.
    async subirImagenesProductoOptimizadas(files, id) {
      const out = [];
      for (const f of files) {
        const r = await this.subirImagenProductoOptimizada(f, id);
        if (r) out.push(r);
      }
      return out;
    },
    // Compatibilidad con código anterior: devuelve la URL full.
    async subirImagenProducto(file, id) {
      const r = await this.subirImagenProductoOptimizada(file, id);
      return r?.fullUrl || null;
    },
    async subirImagenesProducto(files, id) {
      const out = await this.subirImagenesProductoOptimizadas(files, id);
      return out.map((x) => x.fullUrl).filter(Boolean);
    },
    // Helpers para usar miniaturas y migrar/eliminar archivos antiguos.
    urlMiniaturaProducto,
    urlFullProducto,
    esImagenOptimizada,
    async optimizarImagenProductoDesdeUrl(url, id) {
      try { return await optimizarDesdeUrl(url, id); }
      catch (e) { console.error("[DB] optimizarImagenProductoDesdeUrl", e); return null; }
    },
    async eliminarImagenesProducto(urls) {
      const paths = new Set();
      (Array.isArray(urls) ? urls : [urls]).filter(Boolean).forEach((url) => {
        const p = storagePathFromPublicUrl(url);
        if (!p) return;
        paths.add(p);
        if (/-full\.webp$/i.test(p)) paths.add(p.replace(/-full\.webp$/i, "-thumb.webp"));
        if (/-thumb\.webp$/i.test(p)) paths.add(p.replace(/-thumb\.webp$/i, "-full.webp"));
      });
      if (!paths.size) return { ok: true };
      const { error } = await sb.storage.from("productos").remove(Array.from(paths));
      if (error) { console.warn("[DB] eliminarImagenesProducto", error); return { ok: false, error }; }
      return { ok: true };
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
