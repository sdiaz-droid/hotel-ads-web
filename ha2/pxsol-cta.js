/* ═══════════════════════════════════════════════════════════════════════
   pxsol-cta.js — Los CALL TO ACTION del sitio público
   ───────────────────────────────────────────────────────────────────────
   Vanilla JS y autocontenido, igual que `pxsol-track.js`. Monta en cualquier
   página del sitio (www.pxsol.com, lp.pxsol.com, agencias.pxsol.com…) los CTAs
   que Marketing publicó desde /marketing/cta para ESE dominio, esa ruta y ese
   país.

   ── POR QUÉ ES UN ARCHIVO SUELTO Y NO UN COMPONENTE ────────────────────
   El sitio se sirve por dos caminos distintos y el CTA tiene que salir por los
   dos: las páginas NATIVAS las renderiza Next (y ahí lo monta el layout raíz con
   <CtasSitioPublico>), y las ~400 del CMS y del blog son HTML estático servido
   desde Cloudflare Pages, donde no hay React (ahí se inyecta la etiqueta en el
   deploy, con `injectCtasSitio`). Un componente de React sólo cubriría la mitad
   del sitio, y la mitad que falta no avisa: la página carga perfecto y el CTA no
   está. Es el mismo agujero que ya se pagó con las etiquetas de medición.

   ── QUÉ HACE ───────────────────────────────────────────────────────────
   1. Le pregunta a /api/cta/publicas qué CTAs le tocan a esta visita (host +
      ruta + país de la IP). Ese endpoint NO se cachea nunca: si la respuesta
      viajara dentro del HTML, el borde de Cloudflare le fijaría a todos el país
      del primero que entró.
   2. Respeta el retraso y la frecuencia (una vez por sesión / por día), que se
      guardan en el navegador de cada persona.
   3. Monta el CTA en un <iframe srcdoc> con el documento que armó el servidor.
      El iframe es lo que hace que el diseño se vea EXACTAMENTE como se diseñó:
      el CSS del sitio no entra y el del CTA no se derrama.
   4. Escucha el puente del iframe: cierre (incluido el diseño que se esconde
      solo), clic y alto real del contenido.
   5. Mide: visualización, clic y cierre van a /api/cta/track.

   ── VISTA PREVIA ───────────────────────────────────────────────────────
   Cualquier URL del sitio con `?px_cta_preview=<id>` muestra ESE CTA aunque esté
   en borrador, sin respetar dominio, país, ruta ni frecuencia, y sin medir. Es la
   forma de ver el CTA en la página de verdad antes de publicarlo.

   ── PARA DEPURAR ───────────────────────────────────────────────────────
   Agregar `?px_cta_debug=1` a la URL, o llamar a `window.pxsolCta.debug()`:
   imprime el host y la ruta con la que se preguntó, el país que resolvió el
   servidor, los CTAs que llegaron y por qué se mostró o no cada uno.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ───────── Guarda de doble carga ─────────
     La etiqueta la puede traer el HTML del CMS (inyectada en el deploy) y además
     montarla el layout raíz en una página nativa. Correr dos veces mostraría el
     CTA dos veces y contaría dos visualizaciones por visita. */
  if (window.__pxsolCtaCargado) return;
  window.__pxsolCtaCargado = true;

  var API = '/api/cta/publicas';
  var API_TRACK = '/api/cta/track';
  var PREFIJO_CAP = 'pxcta_visto_';
  var Z = 2147483000;

  var params = new URLSearchParams(window.location.search);
  var preview = (params.get('px_cta_preview') || params.get('pxcta') || '').trim();
  var debug = params.get('px_cta_debug') === '1';
  var estado = { host: '', ruta: '', pais: null, ctas: [], motivos: [], montado: null };

  function log() {
    if (!debug) return;
    var args = ['[pxsol-cta]'].concat([].slice.call(arguments));
    console.log.apply(console, args);
  }

  /* Dentro de un iframe no se monta nada: el CMS de Nexus previsualiza las páginas
     en un iframe (`/s/<slug>`), y ahí el CTA aparecería DOS veces (una por la
     página de adentro y otra por la de afuera). Con `?px_cta_preview` sí, porque
     ese es justamente el caso de querer verlo. */
  if (window.top !== window.self && !preview) {
    log('adentro de un iframe: no se monta');
    return;
  }

  /* ───────── Frecuencia (por navegador) ─────────
     Es una optimización de experiencia, no una barrera: si el navegador bloquea el
     storage, el CTA se muestra igual. Lo que no puede pasar es que reviente. */
  function claveCap(id) { return PREFIJO_CAP + id; }
  function yaSeMostro(cta) {
    if (preview) return false;
    if (cta.frecuencia === 'siempre') return false;
    try {
      if (cta.frecuencia === 'una-vez-por-sesion') {
        return sessionStorage.getItem(claveCap(cta.id)) === '1';
      }
      var iso = localStorage.getItem(claveCap(cta.id));
      return !!iso && iso.slice(0, 10) === new Date().toISOString().slice(0, 10);
    } catch (e) { return false; }
  }
  function marcarMostrado(cta) {
    if (preview) return;
    try {
      if (cta.frecuencia === 'una-vez-por-sesion') sessionStorage.setItem(claveCap(cta.id), '1');
      else if (cta.frecuencia === 'una-vez-por-dia') localStorage.setItem(claveCap(cta.id), new Date().toISOString());
    } catch (e) { /* storage bloqueado: no capea y no rompe */ }
  }

  /* ───────── Medición ─────────
     `sendBeacon` para que el evento salga incluso si la persona se va de la página
     en el mismo clic (que es justo lo que hace el clic al botón del CTA). */
  function medir(id, evento) {
    if (preview) { log('preview: no se mide', evento); return; }
    try {
      var body = JSON.stringify({ ctaId: id, event: evento });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(API_TRACK, new Blob([body], { type: 'application/json' }));
      } else {
        fetch(API_TRACK, { method: 'POST', body: body, headers: { 'Content-Type': 'application/json' }, keepalive: true });
      }
    } catch (e) { /* la medición nunca puede romper la página */ }
  }

  /* ───────── Montaje ───────── */
  var contenedor = null;
  var iframe = null;
  var cerrado = {};

  function posicionar(caja, cta) {
    var s = caja.style;
    s.position = 'fixed';
    s.zIndex = String(Z);
    if (cta.pantallaCompleta) {
      s.inset = '0';
      s.width = '100%';
      s.height = '100%';
      return;
    }
    var w = 'min(' + cta.ancho + 'px, calc(100vw - 32px))';
    s.width = w;
    if (cta.tipo === 'emergente' || cta.posicion === 'centro') {
      s.top = '50%'; s.left = '50%'; s.transform = 'translate(-50%,-50%)';
    } else if (cta.posicion === 'arriba') {
      s.top = '16px'; s.left = '50%'; s.transform = 'translateX(-50%)';
    } else if (cta.posicion === 'abajo-izquierda') {
      s.bottom = '16px'; s.left = '16px';
    } else if (cta.posicion === 'abajo-centro') {
      s.bottom = '16px'; s.left = '50%'; s.transform = 'translateX(-50%)';
    } else {
      s.bottom = '16px'; s.right = '16px';
    }
  }

  function cerrar(cta, medirlo) {
    if (cerrado[cta.id]) return;
    cerrado[cta.id] = true;
    if (medirlo) medir(cta.id, 'close');
    if (contenedor && contenedor.parentNode) contenedor.parentNode.removeChild(contenedor);
    contenedor = null;
    iframe = null;
  }

  function botonCerrar(cta) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Cerrar');
    b.innerHTML = '&#10005;';
    b.style.cssText = [
      'position:absolute', 'right:12px', 'top:12px', 'z-index:2',
      'width:32px', 'height:32px', 'border:0', 'border-radius:50%',
      'background:rgba(255,255,255,.94)', 'color:#475467', 'font-size:15px',
      'line-height:1', 'cursor:pointer', 'display:flex', 'align-items:center',
      'justify-content:center', 'box-shadow:0 2px 8px rgba(16,24,40,.25)',
      'font-family:system-ui,sans-serif', 'padding:0'
    ].join(';');
    b.addEventListener('click', function () { cerrar(cta, true); });
    return b;
  }

  function montar(cta) {
    // Embebido: va DENTRO del contenido, en el lugar que la página reservó. Sin ese
    // lugar no se puede inventar uno (quedaría encima de algo), así que no se monta.
    var anfitrion = null;
    if (cta.tipo === 'embebido') {
      anfitrion = document.querySelector('[data-pxsol-cta]');
      if (!anfitrion) {
        log('embebido sin contenedor [data-pxsol-cta] en la página: no se monta', cta.id);
        return;
      }
    }

    contenedor = document.createElement('div');
    contenedor.setAttribute('data-pxsol-cta-host', cta.id);
    iframe = document.createElement('iframe');
    iframe.title = 'Mensaje de Pxsol';
    iframe.setAttribute('scrolling', 'no');
    // `allow-same-origin` es lo que deja funcionar el puente (postMessage) y
    // `allow-top-navigation-by-user-activation` lo que deja que el botón del CTA
    // navegue la PÁGINA y no el iframe. Sin el segundo, el clic al botón abre el
    // destino adentro del recuadro del CTA.
    iframe.setAttribute(
      'sandbox',
      'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-forms'
    );
    iframe.style.cssText = 'display:block;width:100%;height:100%;border:0;background:transparent;color-scheme:normal';
    iframe.srcdoc = cta.doc;

    if (anfitrion) {
      contenedor.style.cssText = 'position:relative;width:100%;max-width:' + cta.ancho + 'px;margin:24px auto';
      iframe.style.height = (cta.alto || 160) + 'px';
      contenedor.appendChild(iframe);
      if (cta.cerrarSuperpuesto) contenedor.appendChild(botonCerrar(cta));
      anfitrion.appendChild(contenedor);
    } else {
      posicionar(contenedor, cta);
      if (!cta.pantallaCompleta) contenedor.style.height = (cta.alto || 160) + 'px';
      contenedor.appendChild(iframe);
      if (cta.cerrarSuperpuesto) contenedor.appendChild(botonCerrar(cta));
      document.body.appendChild(contenedor);
    }

    estado.montado = cta.id;
    marcarMostrado(cta);
    medir(cta.id, 'view');
    log('montado', cta.id, cta.pantallaCompleta ? '(pantalla completa)' : '(' + cta.posicion + ')');

    // El puente del documento: cierre, clic y alto real.
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (!d || d.__pxcta !== 1) return;
      if (!iframe || e.source !== iframe.contentWindow) return;
      if (d.tipo === 'close') { cerrar(cta, true); return; }
      if (d.tipo === 'click') { medir(cta.id, 'click'); return; }
      if (d.tipo === 'alto' && !cta.pantallaCompleta && contenedor) {
        var alto = Math.max(60, Math.min(Number(d.alto) || 0, Math.round(window.innerHeight * 0.9)));
        contenedor.style.height = alto + 'px';
        return;
      }
      if (d.tipo === 'imagen-rota') {
        // Se avisa por consola SIEMPRE, no sólo en modo debug: una imagen del CTA
        // que no carga se ve igual que "no le puse imagen" y no falla nada.
        console.warn('[pxsol-cta] imagen que no carga en el CTA ' + cta.id + ':', d.src);
      }
    });
  }

  /* ───────── Arranque ───────── */
  function elegir(ctas) {
    for (var i = 0; i < ctas.length; i++) {
      if (yaSeMostro(ctas[i])) { estado.motivos.push(ctas[i].id + ': ya se mostró (frecuencia)'); continue; }
      return ctas[i];
    }
    return null;
  }

  function arrancar() {
    estado.host = window.location.hostname;
    estado.ruta = window.location.pathname;
    var url = API + '?host=' + encodeURIComponent(estado.host) + '&path=' + encodeURIComponent(estado.ruta);
    if (preview) url += '&preview=' + encodeURIComponent(preview);

    fetch(url, { cache: 'no-store', credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j) { log('el endpoint no contestó'); return; }
        estado.pais = j.pais;
        estado.ctas = j.ctas || [];
        log('respuesta', { pais: j.pais, preview: j.preview, ctas: estado.ctas.length });
        if (estado.ctas.length === 0) return;
        var cta = elegir(estado.ctas);
        if (!cta) { log('ninguno para mostrar', estado.motivos); return; }
        var ms = Math.max(0, Number(cta.delaySegundos) || 0) * 1000;
        if (preview) ms = 0; // en vista previa se ve al instante
        setTimeout(function () { montar(cta); }, ms);
      })
      .catch(function (e) { log('falló el pedido', e); });
  }

  window.pxsolCta = {
    debug: function () { console.log('[pxsol-cta] estado', estado); return estado; },
    cerrar: function () { if (estado.montado) cerrar({ id: estado.montado }, false); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();
})();
