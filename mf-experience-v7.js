// Donher's Monumental v7 — experiencia comercial completa sobre datos reales.
(()=>{
  const baseBind=bind;
  const styleLabel=()=>state.style&&STYLE[state.style]?STYLE[state.style].label:'';
  const imageSet=p=>Array.from(new Set((p?.images?.length?p.images:[p?.img]).filter(Boolean)));
  const productStatus=()=>loadingProducts?'Cargando catálogo…':`${products.length} ${products.length===1?'modelo':'modelos'} disponibles`;

  card=function(p){
    const saved=state.fav.includes(p.id);
    return `<article class="card product-card-v7">
      <div class="card-img" data-product="${p.id}">
        ${p.img?`<img src="${imageThumb(p.img)}" alt="${safe(p.name)}" loading="lazy" decoding="async" fetchpriority="low" onerror="this.style.display='none'">`:`<div class="card-no-image">DH</div>`}
        ${typeof ON_SALE!=='undefined'&&ON_SALE.has(p.id)?'<span class="off-badge">10% OFF</span>':''}
        <div class="card-topline"><span>${safe(p.cat)}</span><button class="heart" data-fav="${p.id}" aria-label="${saved?'Quitar de favoritos':'Guardar en favoritos'}">${saved?'♥':'♡'}</button></div>
        <div class="card-hover-action">ABRIR FICHA →</div>
      </div>
      <div class="card-body">
        <div class="card-ref">${safe(p.id)}</div>
        <h3 data-product="${p.id}">${safe(p.name)}</h3>
        <div class="card-bottom"><div class="price">${priceHTML(p)}</div><button class="card-add" data-add="${p.id}">+ AGREGAR</button></div>
      </div>
    </article>`;
  };

  catalog=function(){
    const a=filtered();
    const categories=[...new Set(products.map(p=>p.cat).filter(Boolean))];
    const loading=loadingProducts;
    return shell(`<main class="catalog catalog-v7">
      <section class="catalog-intro-v7">
        <div><div class="eyebrow">DONHER’S · CATÁLOGO</div><h1>Elegí por el reloj.</h1><p>Fotos reales, precio claro y toda la información del modelo antes de comprar.</p></div>
        <div class="catalog-status-v7"><span>${productStatus()}</span><strong>${a.length&&!loading?a.length:''}</strong></div>
      </section>
      ${state.style?`<div class="choice-banner choice-v7"><div><small>TU SELECCIÓN</small><strong>${styleLabel()}</strong><p>Ordenamos primero los modelos más cercanos a este estilo.</p></div><button class="textbtn" data-clear-style>Ver todos</button></div>`:''}
      <div class="toolbar toolbar-v7">
        <label class="search search-v7"><span>⌕</span><input id="search" placeholder="Buscar modelo o referencia" value="${safe(state.search)}" autocomplete="off"></label>
        <div class="filters">
          <select id="cat" aria-label="Categoría"><option value="all">Todas las categorías</option>${categories.map(c=>`<option value="${safe(c)}" ${state.cat===c?'selected':''}>${safe(c)}</option>`).join('')}</select>
          <select id="sort" aria-label="Orden"><option value="relevant">Orden recomendado</option><option value="asc" ${state.sort==='asc'?'selected':''}>Menor precio</option><option value="desc" ${state.sort==='desc'?'selected':''}>Mayor precio</option><option value="name" ${state.sort==='name'?'selected':''}>Nombre A–Z</option></select>
        </div>
      </div>
      ${loading?`<div class="loading-grid">${Array.from({length:8},()=>'<div class="skeleton"></div>').join('')}</div>`:a.length?`<div class="grid grid-v7">${a.map(card).join('')}</div>`:`<div class="empty empty-v7"><div class="empty-mark">DH</div><h2>No encontramos relojes con ese filtro</h2><p>Probá otra búsqueda o recorré el catálogo completo.</p><button class="btn" data-clear-style>VER TODOS</button></div>`}
    </main>`,'catalog');
  };

  detail=function(){
    const p=product(state.selected)||products[0];
    if(!p)return catalog();
    const imgs=imageSet(p);
    const selected=p._image||imgs[0]||'';
    const saved=state.fav.includes(p.id);
    return shell(`<main class="product product-v7">
      <div class="product-nav-v7"><button class="textbtn" data-go="catalog">← VOLVER A RELOJES</button><span>${safe(p.cat)} · ${safe(p.id)}</span></div>
      <section class="product-stage-v7">
        <div class="product-gallery-v7">
          <div class="thumbs thumbs-v7">${imgs.slice(0,6).map((u,i)=>`<button class="thumb ${u===selected?'active':''}" data-thumb="${i}" aria-label="Vista ${i+1}"><img src="${imageThumb(u)}" alt="${safe(p.name)} vista ${i+1}" loading="lazy" decoding="async"></button>`).join('')}</div>
          <div class="main-photo main-photo-v7">${selected?`<img src="${selected}" alt="${safe(p.name)}" decoding="async">`:`<div class="product-empty-mark">DH</div>`}<button class="zoom zoom-v7" data-zoom aria-label="Ampliar imagen">AMPLIAR ↗</button></div>
        </div>
        <aside class="product-info product-info-v7">
          <div class="eyebrow">${safe(p.cat)}</div>
          <h1>${safe(p.name)}</h1>
          <div class="product-ref-v7">REF. ${safe(p.id)}</div>
          ${typeof ON_SALE!=='undefined'&&ON_SALE.has(p.id)?'<span class="off-badge off-badge--detail">10% OFF</span>':''}
          <div class="bigprice">${priceHTML(p)}</div>
          ${p.desc?`<p class="desc">${safe(p.desc)}</p>`:`<p class="desc muted-desc">Consultanos si querés confirmar medidas, material u otra característica específica de este modelo.</p>`}
          ${state.style?`<div class="match match-v7"><small>SEGÚN TU ELECCIÓN</small><strong>${styleLabel()}</strong><span>Este modelo forma parte de la selección orientativa.</span></div>`:''}
          <div class="purchase-box-v7">
            <button class="btn gold full primary-buy-v7" data-add-open="${p.id}">AGREGAR AL CARRITO</button>
            <div class="minor minor-v7"><button data-fav="${p.id}">${saved?'♥ GUARDADO':'♡ GUARDAR'}</button><a href="${p.wa}" target="_blank" rel="noopener">CONSULTAR POR WHATSAPP ↗</a></div>
          </div>
          <div class="product-facts-v7"><div><span>Producto</span><b>Publicado por Donher’s</b></div><div><span>Pago</span><b>Mercado Pago o transferencia</b></div><div><span>Entrega</span><b>Coordinación en todo Uruguay</b></div><div><span>Seguimiento</span><b>Pedido registrado</b></div></div>
        </aside>
      </section>
      <section class="product-process-v7"><div><small>01</small><b>Elegí</b><span>Revisá fotos y detalles reales.</span></div><div><small>02</small><b>Comprá</b><span>Registramos tu pedido y forma de pago.</span></div><div><small>03</small><b>Coordinamos</b><span>Confirmamos pago y entrega.</span></div></section>
    </main>`,'catalog');
  };

  drawCart=function(){
    if(!state.cartOpen)return'';
    const list=items();
    return `<div class="overlay" data-close-cart></div><aside class="drawer cart-v7">
      <div class="drawer-head cart-head-v7"><div><small>DONHER’S</small><h2>Tu carrito</h2><span>${qty()} ${qty()===1?'reloj':'relojes'}</span></div><button class="x" data-close-cart>×</button></div>
      ${list.length?`<div class="cart-list-v7">${list.map(({p,q})=>`<div class="cart-item cart-item-v7">${p.img?`<button class="cart-image-v7" data-product="${p.id}"><img src="${imageThumb(p.img)}" alt="${safe(p.name)}" loading="lazy" decoding="async"></button>`:''}<div class="cart-copy-v7"><small>${safe(p.cat)}</small><h3>${safe(p.name)}</h3><div class="p">${priceHTML(p)}</div><div class="qty"><button data-q="${p.id}" data-d="-1">−</button><span>${q}</span><button data-q="${p.id}" data-d="1">+</button></div></div><button class="cart-remove-v7" data-remove="${p.id}">QUITAR</button></div>`).join('')}</div>
        <div class="cart-footer-v7"><div class="cart-total"><span>Total productos</span><strong>${money(total())}</strong></div><p>El costo de envío se coordina según destino.</p><button class="btn gold full" data-checkout>CONTINUAR COMPRA →</button><button class="textbtn" data-close-cart>SEGUIR MIRANDO</button></div>`:`<div class="empty cart-empty-v7"><div class="empty-mark">DH</div><h2>Tu carrito está vacío</h2><p>Explorá los relojes y agregá el modelo que quieras comprar.</p><button class="btn gold" data-go="catalog">VER RELOJES</button></div>`}
    </aside>`;
  };

  drawFav=function(){
    if(!state.favOpen)return'';
    const a=state.fav.map(product).filter(Boolean);
    return `<div class="overlay" data-close-fav></div><aside class="drawer fav-v7"><div class="drawer-head"><div><small>DONHER’S</small><h2>Guardados</h2></div><button class="x" data-close-fav>×</button></div>${a.length?`<div class="cart-list-v7">${a.map(p=>`<div class="cart-item cart-item-v7">${p.img?`<button class="cart-image-v7" data-product="${p.id}"><img src="${imageThumb(p.img)}" alt="${safe(p.name)}" loading="lazy" decoding="async"></button>`:''}<div class="cart-copy-v7"><small>${safe(p.cat)}</small><h3>${safe(p.name)}</h3><div class="p">${priceHTML(p)}</div><button class="textbtn" data-product="${p.id}">ABRIR FICHA →</button></div><button class="cart-remove-v7" data-fav="${p.id}">QUITAR</button></div>`).join('')}</div>`:`<div class="empty cart-empty-v7"><div class="empty-mark">♡</div><h2>No guardaste relojes todavía</h2><button class="btn" data-go="catalog">VER CATÁLOGO</button></div>`}</aside>`;
  };

  checkout=function(){
    if(!state.checkout)return'';
    const d=state.data,o=shipOptions();
    if(!o.some(x=>x.id===d.shipping)){d.shipping=o[0].id;d.shippingName=o[0].n}
    const names=['Datos','Entrega','Pago','Revisión','Listo'];
    return `<section class="checkout checkout-v7">
      <header class="checkout-top checkout-top-v7"><img src="${LOGO}" alt="Donher’s"><div class="checkout-progress-v7">${names.map((x,i)=>`<div class="${i+1===state.step?'active':''} ${i+1<state.step?'done':''}"><span>${i+1<state.step?'✓':i+1}</span><b>${x}</b></div>`).join('')}</div><button class="x" data-close-checkout>×</button></header>
      <div class="checkout-body checkout-body-v7">${state.step===5?confirmView():`<div class="checkout-title checkout-title-v7"><div class="eyebrow">PASO ${state.step} DE 4</div><h1>${['Tus datos','¿Cómo lo recibís?','¿Cómo pagás?','Revisá antes de confirmar'][state.step-1]}</h1><p>${['Usamos estos datos para registrar el pedido y contactarte.','Elegí la forma de entrega que te quede más cómoda.','Seleccioná el método con el que querés continuar.','Todavía no se cobra nada hasta que confirmes el pedido.'][state.step-1]}</p></div><div class="checkout-grid checkout-grid-v7"><div class="formbox formbox-v7">${stepForm()}</div><aside class="summary summary-v7"><div class="eyebrow">TU COMPRA</div><h3>${qty()} ${qty()===1?'reloj':'relojes'}</h3>${items().map(({p,q})=>`<div class="checkout-item-v7">${p.img?`<img src="${imageThumb(p.img)}" alt="${safe(p.name)}" loading="lazy" decoding="async">`:''}<div><b>${safe(p.name)}</b><span>${q} × ${money(salePrice(p))}</span></div><strong>${money(salePrice(p)*q)}</strong></div>`).join('')}<div class="sumrow total"><span>Total productos</span><strong>${money(total())}</strong></div><small>Envío a coordinar según destino.</small></aside></div><div class="checkout-actions checkout-actions-v7">${state.step>1?'<button class="btn" data-prev>← ATRÁS</button>':'<span></span>'}<button class="btn gold" ${state.step===4?'data-confirm':'data-next'}>${state.step===4?'CONFIRMAR PEDIDO':'CONTINUAR →'}</button></div>`}</div>
    </section>`;
  };

  stepForm=function(){
    const d=state.data;
    if(state.step===1)return `<div class="form-section-v7"><div class="field"><label>Email</label><input data-field="email" type="email" value="${safe(d.email)}" placeholder="tu@email.com"></div><div class="row2"><div class="field"><label>Nombre completo</label><input data-field="name" value="${safe(d.name)}" placeholder="Nombre y apellido"></div><div class="field"><label>Teléfono</label><input data-field="phone" value="${safe(d.phone)}" placeholder="09X XXX XXX"></div></div><p class="form-note-v7">No necesitás crear una cuenta para comprar.</p></div>`;
    if(state.step===2)return `<div class="form-section-v7"><div class="field"><label>Departamento</label><select data-field="dept">${['Artigas','Canelones','Cerro Largo','Colonia','Durazno','Flores','Florida','Lavalleja','Maldonado','Montevideo','Paysandú','Río Negro','Rivera','Rocha','Salto','San José','Soriano','Tacuarembó','Treinta y Tres'].map(x=>`<option ${d.dept===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="option-list-v7">${shipOptions().map(x=>`<label class="option ${d.shipping===x.id?'active':''}"><input type="radio" name="ship" value="${x.id}" data-ship-name="${x.n}" ${d.shipping===x.id?'checked':''}><div><strong>${x.n}</strong><small>${x.d}</small></div><span>○</span></label>`).join('')}</div>${d.shipping==='domicilio'?`<div class="field"><label>Dirección</label><input data-field="address" value="${safe(d.address)}" placeholder="Calle, número y apartamento"></div>`:''}<div class="row2"><div class="field"><label>Ciudad / localidad</label><input data-field="city" value="${safe(d.city)}"></div><div class="field"><label>Observaciones</label><input data-field="notes" value="${safe(d.notes)}" placeholder="Opcional"></div></div></div>`;
    if(state.step===3)return `<div class="form-section-v7"><div class="option-list-v7"><label class="option payment-option-v7 ${d.payment==='mp'?'active':''}"><input type="radio" name="pay" value="mp" ${d.payment==='mp'?'checked':''}><div><strong>Mercado Pago</strong><small>Tarjetas, débito o saldo disponible.</small></div><span>MP</span></label><label class="option payment-option-v7 ${d.payment==='transfer'?'active':''}"><input type="radio" name="pay" value="transfer" ${d.payment==='transfer'?'checked':''}><div><strong>Transferencia bancaria</strong><small>Registrás el pedido y enviás el comprobante.</small></div><span>TR</span></label></div><div class="payment-note-v7">${d.payment==='mp'?`Después de registrar el pedido vas a poder continuar a Mercado Pago.`:`Santander · Brandon Hernández<br>Cuenta: 1208321362<br>Desde otro banco: 0002001208321362 · UYU`}</div></div>`;
    return `<div class="review-v7"><section><small>CONTACTO</small><h3>${safe(d.name)}</h3><p>${safe(d.email)}<br>${safe(d.phone)}</p></section><section><small>ENTREGA</small><h3>${safe(d.shippingName)}</h3><p>${[d.address,d.city,d.dept].filter(Boolean).map(safe).join(' · ')}</p></section><section><small>PAGO</small><h3>${d.payment==='mp'?'Mercado Pago':'Transferencia bancaria'}</h3><p>El pedido quedará pendiente de verificación de pago.</p></section></div>`;
  };

  confirmView=function(){
    const pay=state.data.payment==='mp'?`<a class="btn gold" href="https://link.mercadopago.com.uy/donhers" target="_blank" rel="noopener">CONTINUAR A MERCADO PAGO ↗</a>`:`<a class="btn gold" href="https://wa.me/59892337486?text=${encodeURIComponent('Hola Donher’s, quiero enviar el comprobante del pedido '+state.order)}" target="_blank" rel="noopener">ENVIAR COMPROBANTE →</a>`;
    return `<div class="confirm confirm-v7"><div class="confirm-mark-v7">DH</div><div class="eyebrow">PEDIDO REGISTRADO</div><h1>Listo. Ya tenemos tu pedido.</h1><p>Guardá este número para consultar el estado. El despacho se coordina cuando se verifica el pago.</p><div class="ordercode-v7"><span>NÚMERO DE PEDIDO</span><strong>${safe(state.order)}</strong></div><div class="confirm-actions-v7">${pay}<button class="btn" data-service>SEGUIR PEDIDO</button></div><button class="textbtn" data-finish>VOLVER A LA TIENDA</button></div>`;
  };

  bind=function(){
    baseBind();
    document.querySelectorAll('.product-card-v7').forEach(el=>{el.addEventListener('keydown',e=>{if(e.key==='Enter')el.querySelector('[data-product]')?.click()})});
  };
})();