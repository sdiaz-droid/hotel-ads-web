/* ═══════════════════════════════════════════════════════════════════════
   pxsol-track.js — El pixel de ATRIBUCIÓN del sitio público
   ───────────────────────────────────────────────────────────────────────
   Vanilla JS y autocontenido. Nació para las landings de Paid Media (implementa
   el "Spec de Tracking de Landings") y desde el 12/08/2026 corre en TODA página
   del sitio: lo monta el layout raíz con `<PixelAtribucion>`, y el HTML estático
   del CMS y del blog lo recibe en el deploy (`injectPixelAtribucion`).

   ── LAS TRES REGLAS QUE IMPLEMENTA ──────────────────────────────────────
   1. PERSISTENCIA. El UTM con el que la persona entró la acompaña por toda la
      navegación, y sigue vigente si vuelve más tarde.
   2. CAMBIO SOLO POR FUENTE NUEVA. Se actualiza únicamente cuando llega otro
      UTM/click-id en la URL, o sea cuando la persona llegó desde otro canal.
      Navegar el sitio no lo mueve.
   3. NO VENCE. Se mantiene hasta que llegue esa fuente nueva o hasta que la
      persona borre el caché de su navegador.
   Las fija `lib/web/pxsol-track-persistencia.test.ts`, que ejecuta el pixel.

   QUÉ HACE
   - Captura los 5 UTM + gclid/fbclid/ttclid (+ gbraid/wbraid de Google) de la
     URL, tomando el "primer valor no vacío" (ignora el set vacío de Pmax).
   - Guarda FIRST-TOUCH (no se pisa; su click-id se COMPLETA si estaba vacío y
     llega un clic pago — ver el bloque 2) y CONVERSION-TOUCH (siempre el
     actual), más landingUrl, referrer y journey (recorrido de páginas).
   - Guarda en localStorage Y en una cookie de `.pxsol.com`, para que el UTM
     cruce entre subdominios (lp → www) y no solo entre páginas.
   - NO le cuelga los UTM a la URL de la navegación interna: eso rompería la
     atribución de GA4. Solo decora el link que sale a un dominio nuestro que la
     cookie no alcanza (ver el bloque 6).
   - Expone window.pxsolTrack.submitLead(slug, data) que postea a Nexus con
     TODO estructurado + una copia espejo dentro de `data` (catch-all → cero
     pérdida aunque a Nexus le falte una columna), y dispara las conversiones
     de GA4 / Google Ads / Meta.
   - Trackea clics a WhatsApp y teléfono como eventos de conversión.
   - Inicializa Consent Mode v2 y el dataLayer para GTM.

   PARA VERIFICARLO (QA)
     Con la URL limpia, "¿me sigue el UTM?" ya no se contesta mirando la barra de
     direcciones. Se abre cualquier página del sitio con `?pxdebug=1`, o se llama
     a `pxsolTrack.debug()` en la consola: imprime el UTM vigente, el first-touch,
     el last-touch, la cookie y el recorrido.

   USO EN UN FORMULARIO
     <script>
       document.getElementById('lead-form').addEventListener('submit', async (e) => {
         e.preventDefault();
         const data = { ...campos del form... };
         const r = await window.pxsolTrack.submitLead('demo-pms', data);
         if (r.ok) { ...mostrar exito o redirigir... }
       });
     </script>
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ───────── Guarda de doble carga ─────────
     El pixel se monta UNA sola vez, desde el layout raíz (`PixelAtribucion`), pero
     el HTML estático del CMS y del blog lo trae inyectado en el `<head>`
     (`injectTagsMedicion`), así que una página puede terminar con dos etiquetas.
     Correrlo dos veces duplica la entrada del recorrido en cada visita.

     La marca va en el PROPIO `<script>` y no en un flag de `window`, a propósito:
     los tests ejecutan el pixel con `new Function(PIXEL)()` para simular visitas
     sucesivas de la misma persona, y ahí `document.currentScript` es null — o sea
     que para ellos esta guarda no existe y siguen midiendo lo que tienen que medir. */
  var MARCA_CARGA = 'data-pxsol-track-cargado';
  if (document.querySelector('script[' + MARCA_CARGA + ']')) return;
  if (document.currentScript) document.currentScript.setAttribute(MARCA_CARGA, '1');

  var CONFIG = {
    endpoint: '/api/web-forms/submit',     // proxeado same-origin → nexus.getpxsol.com
    // GA4 (G-VXWWWSF7N1), Google Ads (AW-643559125) y Meta los dispara GTM
    // (GTM-PJN2D9CG) a partir de los eventos del dataLayer — NO desde acá
    // (así no hay doble conteo).
    ownDomains: /(^|\.)pxsol\.com$|(^|\.)getpxsol\.com$|^localhost$/,
    journeyMax: 15,
    consentDefault: 'granted'              // LATAM: granted por defecto; el banner puede revocar
  };

  var UTM_KEYS   = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  /* ttclid = click-id de TikTok Ads. Estaba faltando y era la ÚNICA fuga real de
     captura en las páginas nativas: Nexus ya tiene su columna (leads.ttclid) y
     /api/web-forms/submit ya lo acepta y lo persiste, pero este pixel — el que
     corre en las 12 páginas de producto y en /crearcuenta — no lo miraba, así
     que un lead de TikTok llegaba sin prueba de clic pago y caía en el default
     ORGANIC_SEARCH. El otro pixel (px-track.js, el snippet para los sitios de
     los clientes) sí lo capturaba: eran dos juegos de claves distintos.
     Sumarlo acá también lo hace contar en `hasClickId`, y eso importa: un clic de
     TikTok que llega solo con ttclid (sin utm_*) antes no marcaba first-touch ni
     conversion-touch pago. */
  var CLICK_KEYS = ['gclid', 'fbclid', 'ttclid', 'gbraid', 'wbraid'];
  var K_FIRST    = 'pxsol_first_touch';   // first-touch (no se pisa; el click-id vacío sí se completa)
  var K_LAST     = 'pxsol_last_touch';    // último touch con UTM (fallback)
  var K_JOURNEY  = 'pxsol_journey';       // recorrido de páginas

  /* ═══════════ ALMACENAMIENTO ═══════════
     Dos soportes para el mismo dato, y cada uno cubre lo que al otro le falta:

       · `localStorage` es el primario. No vence nunca, que es exactamente la
         regla: el UTM se mantiene hasta que llegue una fuente nueva o hasta que
         la persona borre el caché de su navegador.
       · una COOKIE en `.pxsol.com` es el puente entre subdominios. `localStorage`
         está partido por ORIGEN, así que lo que guarda `lp.pxsol.com` —donde
         aterriza la pauta— es invisible para `www.pxsol.com`, que es a donde la
         persona sigue navegando. Sin la cookie, cruzar de un subdominio a otro
         pierde la atribución igual que la perdía cambiar de página.

     La cookie es SOLO el transporte: se lee para hidratar `localStorage` cuando
     este viene vacío (primera visita a ese subdominio) y se reescribe con lo que
     quede vigente. Ante discrepancia manda `localStorage`, que es el que tiene el
     dato completo — la cookie viaja recortada (ver `aCookie`) porque tiene un tope
     duro de 4 KB y `landingUrl` puede ser una URL de anuncio larguísima. */
  var COOKIE_KEY  = 'pxsol_attr';
  /* Dos años: es el techo que los navegadores le respetan a una cookie de primera
     parte. No es un vencimiento de la atribución —`localStorage` no vence— sino el
     límite de cuánto dura el PUENTE entre subdominios. */
  var COOKIE_TTL  = 60 * 60 * 24 * 730;
  var COOKIE_MAX  = 3500;   // margen contra el tope de 4 KB por cookie
  var URL_MAX     = 300;    // recorte de landingUrl/referrer dentro de la cookie

  /* Espejo en memoria: hay navegadores que tiran al tocar `localStorage` (Safari en
     privado, y cualquier vista embebida en un iframe de tercero). Sin esto, ahí el
     pixel pierde el dato dentro de la MISMA página, y no solo entre páginas. */
  var memoria = {};

  function read(key) {
    try {
      var v = localStorage.getItem(key);
      if (v !== null) return JSON.parse(v) || null;
    } catch (e) {}
    return memoria[key] || null;
  }
  function write(key, val) {
    memoria[key] = val;
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
    escribirCookie();
  }

  /* El dominio en el que se planta la cookie: el registrable, para que la compartan
     todos los subdominios. En `localhost` (y en cualquier host que no sea nuestro)
     se omite el atributo, que es lo mismo que decir "solo este host". */
  function dominioCookie() {
    var h = (location.hostname || '').toLowerCase();
    if (/(^|\.)pxsol\.com$/.test(h))    return '.pxsol.com';
    if (/(^|\.)getpxsol\.com$/.test(h)) return '.getpxsol.com';
    return null;
  }

  function recorta(v) { return typeof v === 'string' && v.length > URL_MAX ? v.slice(0, URL_MAX) : v; }

  /* Versión liviana de un touch para viajar en la cookie. Los UTM y los click-id
     van enteros —son el dato que importa— y las URLs recortadas. */
  function aCookie(t) {
    if (!t) return undefined;
    var o = {};
    if (t.utm   && Object.keys(t.utm).length)   o.utm = t.utm;
    if (t.click && Object.keys(t.click).length) o.click = t.click;
    if (t.landingUrl) o.landingUrl = recorta(t.landingUrl);
    if (t.referrer)   o.referrer   = recorta(t.referrer);
    if (t.ts)      o.ts = t.ts;
    if (t.clickTs) o.clickTs = t.clickTs;
    if (t.url)     o.url = recorta(t.url);
    return o;
  }

  function leerCookie() {
    try {
      var m = document.cookie.match(new RegExp('(?:^|; )' + COOKIE_KEY + '=([^;]*)'));
      if (!m) return null;
      var v = JSON.parse(decodeURIComponent(m[1]));
      return v && typeof v === 'object' ? v : null;
    } catch (e) { return null; }
  }

  function escribirCookie() {
    try {
      var payload = {};
      var f = read(K_FIRST), l = read(K_LAST);
      if (f) payload.f = aCookie(f);
      if (l) payload.l = aCookie(l);
      if (!payload.f && !payload.l) return;

      var valor = encodeURIComponent(JSON.stringify(payload));
      /* Si no entra, se manda solo el first-touch: entre los dos, el que no se
         puede reconstruir es ese (el last-touch vuelve con el próximo clic). */
      if (valor.length > COOKIE_MAX && payload.l) {
        delete payload.l;
        valor = encodeURIComponent(JSON.stringify(payload));
      }
      if (valor.length > COOKIE_MAX) return;

      var dom = dominioCookie();
      document.cookie = COOKIE_KEY + '=' + valor +
        ';path=/;max-age=' + COOKIE_TTL + ';samesite=lax' +
        (dom ? ';domain=' + dom : '') +
        (location.protocol === 'https:' ? ';secure' : '');
    } catch (e) {}
  }

  /* Hidrata `localStorage` desde la cookie cuando este subdominio todavía no vio a
     la persona. NUNCA pisa lo que ya haya local: el first-touch no se pisa, y esta
     es la misma regla vista desde el otro soporte. */
  function hidratarDesdeCookie() {
    var c = leerCookie();
    if (!c) return;
    if (c.f && !read(K_FIRST)) { memoria[K_FIRST] = c.f; try { localStorage.setItem(K_FIRST, JSON.stringify(c.f)); } catch (e) {} }
    if (c.l && !read(K_LAST))  { memoria[K_LAST]  = c.l; try { localStorage.setItem(K_LAST,  JSON.stringify(c.l));  } catch (e) {} }
  }

  /* "primer valor no vacío" — clave para Pmax, que agrega un 2º set con utm_campaign vacío */
  function firstNonEmpty(params, key) {
    var all = params.getAll(key);
    for (var i = 0; i < all.length; i++) {
      if (all[i] && all[i].trim() !== '') return all[i].trim();
    }
    return undefined;
  }

  /* ───────── 0) Traer lo que se haya guardado en otro subdominio ─────────
     Va ANTES de todo lo demás: el first-touch que escribe el bloque 2 se decide
     mirando si ya hay uno, y si la persona aterrizó del anuncio en `lp.pxsol.com`
     el que hay vive en la cookie, no en el `localStorage` de este origen. */
  hidratarDesdeCookie();

  /* ───────── 1) Capturar de la URL ───────── */
  var params  = new URLSearchParams(location.search);
  var fromUrl = {};
  UTM_KEYS.concat(CLICK_KEYS).forEach(function (k) {
    var v = firstNonEmpty(params, k);
    if (v) fromUrl[k] = v;
  });
  var hasFreshUtm = UTM_KEYS.some(function (k) { return fromUrl[k]; });
  var hasClickId  = CLICK_KEYS.some(function (k) { return fromUrl[k]; });

  /* ───────── 2) First-touch (no se pisa) ───────── */
  var firstTouch = read(K_FIRST);
  if (!firstTouch && (hasFreshUtm || hasClickId || !document.referrer || isExternal(document.referrer))) {
    firstTouch = {
      utm:        pick(fromUrl, UTM_KEYS),
      click:      pick(fromUrl, CLICK_KEYS),
      landingUrl: location.href,
      referrer:   document.referrer || '',
      ts:         new Date().toISOString()
    };
    write(K_FIRST, firstTouch);
  } else if (firstTouch && hasClickId && !tieneClickId(firstTouch)) {
    /* Primer contacto PAGO — completa el click-id de un first-touch que no tiene
       ninguno.

       Sin esto, un visitante que YA estuvo en el sitio pierde el click-id. El
       agujero salía de la combinación de dos reglas que por separado están bien:
       una visita orgánica ya escribe un first-touch (entra por la rama
       `!document.referrer || isExternal(referrer)`) con `click:{}`, ese
       first-touch no se pisa nunca, y `currentClickIds()` resuelve
       URL → first-touch **sin mirar el last-touch**. Entonces el que entró
       orgánico, volvió por un anuncio y navegó el sitio antes de convertir
       enviaba el formulario con los UTM completos y SIN gclid — aunque el dato
       estaba guardado en `pxsol_last_touch`. Verificado en producción el
       06/08/2026 (spec/prueba-e2e-alta-antes-del-cutover.md §14.3).

       Era silencioso: el lead tiene utm_source/medium/campaign, así que ningún
       informe lo cantaba; solo faltaba la prueba de clic pago. Y sin gclid en el
       lead no se puede subir el negocio ganado a Google Ads como conversión
       offline.

       `!tieneClickId(firstTouch)` es la guarda que conserva la intención
       original: un click-id ya guardado NO se pisa nunca — si hubo un primer
       contacto pago, ese manda, y no se mezcla el gclid de una campaña con el
       fbclid de otra. Esto solo llena un hueco. */
    firstTouch.click   = pick(fromUrl, CLICK_KEYS);
    firstTouch.clickTs = new Date().toISOString();
    write(K_FIRST, firstTouch);
  }

  /* ───────── 3) Conversion/last-touch (se actualiza si llega UTM/click nuevo) ───────── */
  if (hasFreshUtm || hasClickId) {
    write(K_LAST, {
      utm:   pick(fromUrl, UTM_KEYS),
      click: pick(fromUrl, CLICK_KEYS),
      url:   location.href,
      ts:    new Date().toISOString()
    });
  }

  /* ───────── 4) Journey (recorrido, capado) ───────── */
  (function () {
    var j = read(K_JOURNEY) || [];
    j.push({ url: location.pathname + location.search, ts: new Date().toISOString() });
    if (j.length > CONFIG.journeyMax) j = j.slice(-CONFIG.journeyMax);
    write(K_JOURNEY, j);
  })();

  /* ───────── 5) Consent Mode v2 + dataLayer para GTM ───────── */
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  if (!window.__pxsolConsentSet) {
    gtag('consent', 'default', {
      ad_storage:         CONFIG.consentDefault,
      ad_user_data:       CONFIG.consentDefault,
      ad_personalization: CONFIG.consentDefault,
      analytics_storage:  CONFIG.consentDefault
    });
    window.__pxsolConsentSet = true;
  }

  /* ═══════════ 6) Propagación entre páginas ═══════════

     El UTM persigue a la persona por TODO el sitio, pero **guardado, no colgado de
     la URL**. Que la navegación interna vaya limpia es una decisión, no un olvido,
     y tiene dos motivos:

       1. **GA4 vuelve a atribuir campaña cada vez que ve `utm_*` en una vista de
          página.** Con los UTM pegados a cada link interno, un visitante que mira
          seis páginas se cuenta como seis arranques de campaña: las sesiones se
          parten y la fuente se infla. Es medición rota, y muda.
       2. **Google indexa URLs con parámetros.** Cada UTM vigente multiplica las
          variantes de una misma página.

     Lo que la persona ve en la barra de direcciones al aterrizar del anuncio no se
     toca: los parámetros con los que entró siguen ahí. De la segunda página en
     adelante la URL va limpia y el UTM viaja por `localStorage` + la cookie de
     `.pxsol.com`, que es lo que después se le adjunta al lead convierta donde
     convierta.

     ── Lo único que se sigue decorando ──────────────────────────────────────────
     El link que sale a un dominio NUESTRO que la cookie no alcanza (hoy:
     `pxsol.com` → `getpxsol.com` y viceversa). Ahí el query string es el único
     transporte que queda: son orígenes distintos, con `localStorage` distinto y sin
     cookie compartida. Un link dentro del mismo dominio registrable no se toca
     nunca — la cookie ya lo cubre. */
  function mismoDominioRegistrable(hostname) {
    var aca = dominioCookie();
    if (!aca) return true;   // localhost y afines: nada que cruzar
    var suf = aca.replace(/^\./, '');
    var h = (hostname || '').toLowerCase();
    return h === suf || h.slice(-(suf.length + 1)) === '.' + suf;
  }

  function decorate(a) {
    var src = currentUtms();
    if (!Object.keys(src).length) return;
    var raw = a.getAttribute('href');
    if (!raw || raw.charAt(0) === '#' || /^(mailto:|tel:|javascript:|https:\/\/wa\.me)/i.test(raw)) return;
    var url;
    try { url = new URL(a.href, location.href); } catch (e) { return; }
    if (!CONFIG.ownDomains.test(url.hostname)) return;  // dominio ajeno: no se le regala atribución
    if (mismoDominioRegistrable(url.hostname)) return;  // la cookie ya lo persigue → URL limpia
    if (url.searchParams.has('utm_source')) return;     // el link ya trae sus UTMs → respetar
    UTM_KEYS.forEach(function (k) { if (src[k]) url.searchParams.set(k, src[k]); });
    a.href = url.href;
  }
  ['click', 'auxclick'].forEach(function (evt) {
    document.addEventListener(evt, function (e) {
      var a = e.target && e.target.closest && e.target.closest('a[href]');
      if (a) { decorate(a); trackContact(a); }
    }, true);
  });

  /* ───────── 7) WhatsApp / teléfono como conversión ───────── */
  function trackContact(a) {
    var href = (a.getAttribute('href') || '').toLowerCase();
    if (/^https:\/\/wa\.me|api\.whatsapp\.com|^whatsapp:/.test(href)) {
      fireEvent('contact_whatsapp', { link_url: a.href });
    } else if (/^tel:/.test(href)) {
      fireEvent('contact_phone', { link_url: a.href });
    }
  }

  /* ───────── utilidades ───────── */
  function pick(obj, keys) { var o = {}; keys.forEach(function (k) { if (obj[k]) o[k] = obj[k]; }); return o; }
  function isExternal(ref) { try { return !CONFIG.ownDomains.test(new URL(ref).hostname); } catch (e) { return true; } }
  /* ¿el touch guardado ya trae algún click-id? (guarda del "no se pisa" — ver el bloque 2) */
  function tieneClickId(t) { return Boolean(t && t.click && CLICK_KEYS.some(function (k) { return t.click[k]; })); }

  /* UTM vigentes: URL → last-touch → first-touch */
  function currentUtms() {
    var last = read(K_LAST) || {}, first = read(K_FIRST) || {};
    var out = {};
    UTM_KEYS.forEach(function (k) {
      var v = fromUrl[k] || (last.utm && last.utm[k]) || (first.utm && first.utm[k]);
      if (v) out[k] = v;
    });
    return out;
  }
  /* click-ids vigentes: URL → first-touch, EN BLOQUE (nunca mezclados).
   *
   * Los click-id se resuelven como un conjunto que viene de UN solo toque, no
   * clave por clave. La versión anterior completaba cada clave por separado
   * (`fromUrl[k] || first.click[k]`), y eso mezclaba plataformas: quien hizo clic
   * en un anuncio de Google en julio, no convirtió, y en agosto convierte por un
   * anuncio de Meta, salía con el `fbclid` nuevo Y el `gclid` viejo pegado.
   * Reproducido en producción el 13/08/2026 (contacto de prueba con
   * `utm_source=facebook`, `fbclid` de esa visita y `gclid` de una del 10/08).
   *
   * Por qué importa y no es cosmético: ese `gclid` es el que se sube a Google Ads
   * como conversión offline cuando el negocio se gana. Con la mezcla, le
   * acreditábamos a Google un lead que trajo Meta — y encima el informe se ve
   * consistente, porque los UTM sí eran de Meta.
   *
   * La regla: si la URL trae ALGÚN click-id, esa visita es la que trajo la
   * conversión y manda entera. Si no trae ninguno, se cae al first-touch completo
   * —que por construcción ya es de un solo toque, porque se escribe de una sola
   * llegada—. Eso CONSERVA el arreglo del 06/08 (spec §14.3): el que entró
   * orgánico, volvió por un anuncio y convirtió navegando sigue mandando su
   * click-id, porque en esa conversión la URL viene sin ninguno. */
  function currentClickIds() {
    var deUrl = pick(fromUrl, CLICK_KEYS);
    if (Object.keys(deUrl).length) return deUrl;
    var first = read(K_FIRST) || {};
    return pick(first.click || {}, CLICK_KEYS);
  }

  /* Dispara evento a GA4 (gtag), dataLayer (GTM) y Meta (fbq) si están presentes */
  function fireEvent(name, props) {
    props = props || {};
    window.dataLayer.push(Object.assign({ event: name }, props));
    if (typeof window.gtag === 'function') window.gtag('event', name, props);
  }

  /* ───────── API pública ───────── */
  window.pxsolTrack = {
    /* Devuelve el bloque de tracking completo (para inspección/debug) */
    params: function () {
      var first = read(K_FIRST) || {};
      return {
        utm:        currentUtms(),
        click:      currentClickIds(),
        landingUrl: first.landingUrl || location.href,
        referrer:   first.referrer || document.referrer || '',
        journey:    read(K_JOURNEY) || []
      };
    },

    /* Postea un lead a Nexus con tracking completo + catch-all, y dispara conversiones.
       Devuelve { ok:boolean, status:number }. */
    submitLead: function (slug, data, opts) {
      opts = opts || {};
      var t = this.params();
      var utm = t.utm, click = t.click;

      /* catch-all: TODO el tracking espejado dentro de `data` → nada se pierde
         aunque Nexus aún no tenga la columna dedicada */
      var mirror = {
        utm_source:   utm.utm_source,   utm_medium:  utm.utm_medium,
        utm_campaign: utm.utm_campaign, utm_term:    utm.utm_term,
        utm_content:  utm.utm_content,
        gclid: click.gclid, fbclid: click.fbclid, ttclid: click.ttclid,
        /* gbraid/wbraid viajan SOLO acá (dentro de `data`), a propósito: son los
           click-id que usa Google cuando no hay gclid (iOS/app) y Nexus no tiene
           columna para ellos. El espejo es su lugar correcto, no una pérdida. */
        gbraid: click.gbraid, wbraid: click.wbraid,
        landing_url: t.landingUrl, referrer_url: t.referrer,
        conversion_url: location.href
      };
      var dataWithTracking = Object.assign({}, data);
      Object.keys(mirror).forEach(function (k) { if (mirror[k]) dataWithTracking[k] = mirror[k]; });

      var payload = {
        slug: slug,
        data: dataWithTracking,
        utmSource:   utm.utm_source   || undefined,
        utmMedium:   utm.utm_medium   || undefined,
        utmCampaign: utm.utm_campaign || undefined,
        utmTerm:     utm.utm_term     || undefined,
        utmContent:  utm.utm_content  || undefined,
        gclid:       click.gclid      || undefined,
        fbclid:      click.fbclid     || undefined,
        ttclid:      click.ttclid     || undefined,
        conversionUrl: location.href,
        referrerUrl:   t.referrer || undefined,
        landingUrl:    t.landingUrl || undefined,
        journey:       t.journey,
        /* El submit exige captcha a todo formulario desde el 07/10/2026: quien
           tenga un token de reCAPTCHA v3 lo pasa en opts.captchaToken. */
        captchaToken:  opts.captchaToken || undefined
      };

      return fetch(CONFIG.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (res.ok) {
          /* Conversión SOLO si el lead se guardó bien. Empujamos el evento al
             dataLayer; GTM (GTM-PJN2D9CG) es dueño de disparar GA4, Google Ads
             y Meta a partir del evento `generate_lead`. La landing avisa, GTM
             dispara → sin doble conteo. */
          var convProps = { form_slug: slug, currency: 'USD' };
          if (data && data.email) convProps.email = data.email;   // para Enhanced Conversions (se activa en GTM)
          fireEvent('generate_lead', convProps);
        }
        return { ok: res.ok, status: res.status };
      }).catch(function () {
        return { ok: false, status: 0 };
      });
    },

    /* Para trackear conversiones que no son form (ej. botón que abre WhatsApp) */
    trackEvent: fireEvent,

    /* ── QA: qué atribución lleva la persona en ESTA página ──────────────────
       Con la URL limpia, "¿me sigue el UTM?" ya no se contesta mirando la barra
       de direcciones, así que hace falta una forma de verlo que no sea abrir la
       consola y adivinar el nombre de una clave. Se abre con `?pxdebug=1` en
       cualquier página del sitio, o llamando a `pxsolTrack.debug()`.

       Es solo lectura y no toca nada de lo guardado: mirar no puede cambiar lo
       que se está midiendo. */
    debug: function () {
      var first = read(K_FIRST), last = read(K_LAST);
      var info = {
        utmVigente:  currentUtms(),
        clickVigente: currentClickIds(),
        firstTouch:  first,
        lastTouch:   last,
        enLaUrl:     Object.keys(fromUrl).length ? fromUrl : null,
        cookie:      leerCookie(),
        dominioCookie: dominioCookie(),
        recorrido:   read(K_JOURNEY) || []
      };
      if (window.console && window.console.table && info.utmVigente) {
        window.console.log('%cPXSOL · atribución vigente', 'font-weight:bold');
        window.console.table(info.utmVigente);
        window.console.log(info);
      }
      return info;
    }
  };

  /* `?pxdebug=1` → lo imprime solo, apenas carga la página. */
  if (params.get('pxdebug') === '1') window.pxsolTrack.debug();
})();
