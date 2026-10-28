(function(){
  var cur = document.currentScript;
  var widgetId = cur && cur.getAttribute('data-widget');
  if(!widgetId){ console.error('[PXI] Falta el atributo data-widget en el <script>.'); return; }
  var ORIGIN = "https://nexus.getpxsol.com";

  // OJO: acá adentro no van expresiones regulares — se comen los escapes al
  // emitirse y parten el script entero. Ver el aviso del route handler, arriba.
  // ── "Excluir de:" (configurado en /marketing/widget) ──────────────────────
  // Las reglas llegan ya interpretadas por el servidor (host, subdominios, path,
  // prefijo). Acá sólo se comparan strings — ver el comentario del route handler.
  // Se corta ANTES de la guarda de instancia única: una página excluida no puede
  // quedar marcada como "ya cargada" y bloquear un widget legítimo si algo la
  // reinyecta.
  var REGLAS = ({"cmqhgcm9a08fqla01h90tn3q8":[{"h":"lp.pxsol.com","s":false,"p":"","x":true},{"h":"lp.pxsol.com","s":false,"p":"/agentes","x":false},{"h":"www.pxsol.com","s":false,"p":"/links","x":false}]})[widgetId] || [];
  if (REGLAS.length) {
    var h = String(location.hostname || '').toLowerCase().split(':')[0];
    while (h.slice(-1) === '.') h = h.slice(0, -1);
    var ruta = String(location.pathname || '').toLowerCase();
    while (ruta.length > 1 && ruta.slice(-1) === '/') ruta = ruta.slice(0, -1);
    for (var i = 0; i < REGLAS.length; i++) {
      var R = REGLAS[i];
      if (R.h) {
        var okHost = R.s ? (h === R.h || h.slice(-(R.h.length + 1)) === '.' + R.h) : h === R.h;
        if (!okHost) continue;
      }
      // Regla de sólo dominio: cae todo ese dominio.
      if (!R.p) return;
      if (R.x ? (ruta === R.p || ruta.indexOf(R.p + '/') === 0) : ruta === R.p) return;
    }
  }

  if (window.__pxiWidgetLoaded) return; window.__pxiWidgetLoaded = true;

  // NOTA DE UBICACIÓN: este corte va DESPUÉS del flag y no antes, porque el test
  // 'widget-sitio.test.ts' recorta la guarda de exclusiones desde 'var REGLAS' hasta
  // esta misma línea y la evalúa con 'new Function' en Node, donde no existe
  // 'window'. Cualquier cosa que se meta en el medio y toque el DOM rompe 13 tests
  // que no tienen nada que ver con el cambio.


  // ── El widget de esta página, para que la PÁGINA pueda usar su cerebro ──────
  // Lo publica el loader porque es el único que sabe las dos cosas a la vez: QUÉ
  // widget le toca a este dominio (viaja en el data-widget, y desde el 24/08/2026
  // depende del host: agencias.pxsol.com lleva el suyo) y el ORIGIN público de
  // Nexus, que es de donde hay que pedirle las respuestas.
  //
  // Lo usa el chat que la landing de Pxsol Agencias trae DENTRO de la página: era
  // un guion de respuestas fijas y ahora contesta con el mismo cerebro que este
  // widget, así la página no tiene dos Pxi que saben distinto. Cualquier página
  // puede leerlo igual; si el widget está apagado, el global no existe y el que lo
  // usa cae a lo que hacía antes.
  window.PXI_WIDGET = {
    widgetId: widgetId,
    origin: ORIGIN,
    chat: ORIGIN + '/api/widget/pxi-chat',
    lead: ORIGIN + '/api/widget/lead'
  };

  // ── En pantalla chica el widget NO se monta ────────────────────────────────
  //
  // Decisión de Sofi del 12/09/2026 ("si es mejor sacar el widget en modo mobile
  // saquemoslo"), para que PageSpeed mobile apruebe. Es la palanca más grande que
  // tiene la home: medido con Lighthouse mobile sobre www.pxsol.com/es-ar,
  // bloquear este origen movía el score de 52 a 68.
  //
  // El costo no es el iframe: es lo que hay ADENTRO. '/w/pxi' es una app Next
  // completa (180 KB de JS, 52 KB de CSS, 15 chunks, el avatar y un ping de
  // monitoreo) que en un teléfono se descarga entera para mostrar una barra de
  // 480×150 abajo de todo.
  //
  // El corte va por ANCHO DE VIEWPORT y no por user-agent: un user-agent miente,
  // se queda viejo y no dice nada del tamaño en el que se está pintando. 768 px es
  // el mismo corte que usa el sitio para el menú mobile.
  //
  // ⚠ Esto aplica a TODA superficie que embeba el loader, no sólo a pxsol.com. Si
  // algún cliente necesita el chat en teléfono, esto tiene que pasar a ser un
  // campo del widget en /marketing/widget y no una constante — hoy no hay ningún
  // caso que lo pida, y se prefirió el corte parejo antes que un flag que nadie
  // configura.
  var ANCHO_MINIMO_PARA_EL_CHAT = 768;
  if (window.innerWidth < ANCHO_MINIMO_PARA_EL_CHAT) return;

  var iframe = document.createElement('iframe');
  iframe.src = ORIGIN + '/w/pxi?w=' + encodeURIComponent(widgetId);
  iframe.title = 'PXI · IA de Pxsol';
  iframe.setAttribute('allow', 'clipboard-write');
  iframe.setAttribute('aria-label', 'Asistente PXI de Pxsol');
  // allowtransparency + frameBorder 0: SIN esto el iframe compone su contenido
  // sobre una base OPACA propia; con el documento de fondo transparente esa base
  // asoma como un marco (negro bajo esquema oscuro) detrás del panel del chat.
  // Con allowtransparency, el body transparente de /w/pxi compone directo sobre
  // la web del cliente y no queda ningún rectángulo de fondo.
  iframe.setAttribute('allowtransparency', 'true');
  iframe.setAttribute('frameBorder', '0');
  var S = iframe.style;
  // Nace invisible: se muestra recién con el saludo del widget (ver abajo). NO se
  // usa display:none ni width:0 — el iframe tiene que cargar y ejecutar para poder
  // saludar, y con visibility:hidden carga igual.
  S.visibility = 'hidden';
  S.position = 'fixed';
  S.border = '0';
  S.zIndex = '2147483647';
  S.background = 'transparent';
  S.backgroundColor = 'transparent';
  // 'light' (no 'normal'): si el visitante tiene el navegador en modo oscuro,
  // 'normal' hace que el iframe pinte su lienzo de fondo NEGRO detrás del panel
  // transparente → aparece un borde/marco negro alrededor del chat. Forzando
  // 'light' el backdrop del iframe queda claro/transparente. (También se declara
  // color-scheme:light dentro del documento /w/pxi.)
  S.colorScheme = 'light';
  S.maxWidth = '100vw';

  // Posición elegida por el usuario al arrastrar. Se persiste por widget anclada
  // al borde INFERIOR del iframe (left + bottom, donde bottom = distancia del
  // borde inferior al tope del viewport). Anclar por abajo es clave: al abrir el
  // chat el iframe pasa de 150px a 792px de alto, y queremos que crezca HACIA
  // ARRIBA dejando el borde inferior donde el usuario lo dejó — no que el panel
  // salte para arriba. null = posición por defecto según el estado.
  var POS_KEY = 'pxiPos:' + widgetId;
  var pos = null;
  try {
    var raw = localStorage.getItem(POS_KEY);
    if(raw){
      var p = JSON.parse(raw);
      if(p && typeof p.left === 'number' && typeof p.bottom === 'number'){ pos = { left: p.left, bottom: p.bottom }; }
      else if(p && typeof p.left === 'number' && typeof p.top === 'number'){ pos = { left: p.left, bottom: p.top + 150 }; } /* migra formato viejo (caja de reposo de 150px) */
    }
  } catch(e){}

  // Tamaño numérico actual del iframe (lo necesitamos para el clamp del drag).
  var curW = 0, curH = 0;
  function dims(state){
    /* El iframe del panel es bastante más grande que la tarjeta (416×640) a
       propósito: deja un margen transparente generoso alrededor para que la
       sombra del panel (box-shadow difuso) se desvanezca DENTRO del iframe. Si
       el iframe la cortara, la sombra quedaría truncada en un rectángulo con
       borde duro = la "aureola" oscura alrededor del chat. */
    if(state === 'panel'){ return [Math.min(560, window.innerWidth), Math.min(792, window.innerHeight)]; }
    if(state === 'avatar'){ return [150, 150]; }
    if(state === 'launcher'){ return [96, 96]; }
    return [Math.min(480, window.innerWidth), 150]; /* bar */
  }
  // Aplica la posición anclada por abajo SIN mutar pos: el top se deriva del
  // borde inferior y el alto actual, y se clampea sólo para mostrar (así abrir y
  // cerrar el chat siempre vuelve exacto a la posición que el usuario eligió).
  function applyPos(){
    if(!pos) return;
    var maxL = Math.max(8, window.innerWidth - curW - 8);
    var maxT = Math.max(8, window.innerHeight - curH - 8);
    var left = Math.max(8, Math.min(maxL, pos.left));
    var top = Math.max(8, Math.min(maxT, pos.bottom - curH));
    S.left = left + 'px'; S.top = top + 'px';
    S.right = 'auto'; S.bottom = 'auto'; S.transform = 'none';
  }

  var lastState = 'bar';
  function setBox(state){
    lastState = state;
    var d = dims(state);
    curW = d[0]; curH = d[1];
    S.width = curW + 'px'; S.height = curH + 'px';
    if(pos){ applyPos(); return; }
    if(state === 'panel'){
      S.left = '50%'; S.right = 'auto'; S.top = 'auto'; S.transform = 'translateX(-50%)'; S.bottom = '0';
    } else if(state === 'avatar' || state === 'launcher'){
      S.right = '0'; S.left = 'auto'; S.top = 'auto'; S.transform = 'none'; S.bottom = '0';
    } else { /* bar */
      S.left = '50%'; S.right = 'auto'; S.top = 'auto'; S.transform = 'translateX(-50%)'; S.bottom = '0';
    }
  }
  setBox('bar');

  // ── Mostrar el iframe SOLO cuando el widget de adentro contesta ───────────
  // 'pxi:state' lo emite el widget en su componentDidMount, o sea apenas monta. Si
  // el marco quedó bloqueado (CSP, X-Frame-Options, red), este mensaje no llega
  // nunca y el iframe se queda invisible en vez de dibujar un rectángulo roto.
  var visible = false;
  function mostrar(){ if(visible) return; visible = true; S.visibility = 'visible'; }

  // Si el bloqueo es por CSP el navegador nos lo dice: sacamos el nodo muerto.
  document.addEventListener('securitypolicyviolation', function(e){
    if(visible) return;
    if(!e || !e.blockedURI || e.blockedURI.indexOf(ORIGIN) !== 0) return;
    if(iframe.parentNode){ iframe.parentNode.removeChild(iframe); }
    console.warn('[PXI] El chat no se muestra en esta pagina: el CSP la bloquea (' + (e.violatedDirective || 'frame-src') + ').');
  });

  function mount(){ if(document.body){ document.body.appendChild(iframe); } else { setTimeout(mount, 50); } }

  // ── El iframe se monta DESPUÉS del 'load', y es performance medida ──────────
  //
  // El loader va 'async', así que corría apenas llegaba y creaba el iframe a los
  // ~580 ms de navegación. Adentro de '/w/pxi' hay una app Next COMPLETA (180 KB
  // de JS, 52 KB de CSS, 15 chunks, el avatar y el ping de monitoreo), y todo eso
  // sale por un origen distinto —o sea DNS + TLS aparte— compitiendo por la red
  // con el hero de la página que lo hospeda, en el momento exacto en que esa
  // página se está pintando.
  //
  // Medido con Lighthouse mobile sobre www.pxsol.com/es-ar el 12/09/2026,
  // bloqueando 'nexus.getpxsol.com': score 52 → 68, FCP 7,0 s → 2,6 s y
  // LCP 22,0 s → 5,2 s. Es la palanca más grande de la home, por lejos.
  //
  // Nadie abre el chat en el primer segundo, así que el iframe espera al 'load' y
  // a que el hilo principal quede ocioso. Lo demás del loader NO cambia: el iframe
  // sigue naciendo 'visibility:hidden' y mostrándose sólo con el saludo
  // 'pxi:state' (la barrera del rectángulo roto de arriba sigue intacta).
  //
  // El aviso de "no cargó en 10 s" arranca recién ACÁ y no al principio: contando
  // desde el arranque avisaría por la espera deliberada en vez de por una falla, y
  // una alarma que suena cuando todo está bien es una alarma que nadie mira.
  function arrancar(){
    mount();
    // Y si simplemente nunca saludó, que quede dicho en la consola: un widget que
    // no aparece es invisible para todo el mundo, incluido quien lo va a debuggear.
    setTimeout(function(){
      if(!visible){ console.warn('[PXI] El chat no llego a cargar en 10s y queda oculto (nunca se muestra roto).'); }
    }, 10000);
  }
  var ocioso = window.requestIdleCallback || function(cb){ return setTimeout(cb, 200); };
  if(document.readyState === 'complete'){ ocioso(arrancar); }
  else { window.addEventListener('load', function(){ ocioso(arrancar); }, { once: true }); }

  // Base del arrastre: posición del iframe al apretar el handle (en coords de
  // página). El widget manda deltas en coords de PANTALLA (estables aunque el
  // iframe se mueva bajo el cursor), y acá los sumamos sobre esta base.
  var dragBase = null;
  window.addEventListener('message', function(e){
    if(iframe.contentWindow && e.source !== iframe.contentWindow) return;
    var d = e.data || {};
    if(!d || typeof d.type !== 'string') return;
    if(d.type === 'pxi:state'){ mostrar(); setBox(d.state); }
    else if(d.type === 'pxi:move-start'){
      var r = iframe.getBoundingClientRect();
      dragBase = { left: r.left, bottom: r.bottom };
    }
    else if(d.type === 'pxi:move'){
      if(!dragBase){ var r2 = iframe.getBoundingClientRect(); dragBase = { left: r2.left, bottom: r2.bottom }; }
      pos = { left: dragBase.left + (d.dx || 0), bottom: dragBase.bottom + (d.dy || 0) };
      applyPos();
    }
    else if(d.type === 'pxi:move-end'){
      dragBase = null;
      if(pos){ try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch(err){} }
    }
  });

  // Si cambia el viewport, re-clampeamos para que nunca quede fuera de pantalla.
  window.addEventListener('resize', function(){ if(pos){ var d = dims(lastState); curW = d[0]; curH = d[1]; applyPos(); } });
})();