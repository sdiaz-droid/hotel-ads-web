/* Alternativa 2 · «Un sistema que trae reservas» */
(function(){
  var AX = window.AX, $ = AX.$, $$ = AX.$$;
  var NS = 'http://www.w3.org/2000/svg';

  /* ---------- SIMULADOR DE PLANES (funciona aun sin GSAP) ---------- */
  var G = '/alternativas/assets/google-g.svg', M = '/alternativas/assets/meta.png';
  var PLANS = [
    {max:499,  nm:'Plan Starter',      rg:'USD 100 a 499',     pr:'ARS 160.000',   ch:[[G,'Search de marca y genérico, y Hotel Ads']]},
    {max:3000, nm:'Plan Professional', rg:'USD 500 a 3.000',   pr:'ARS 399.500',   ch:[[G,'Search, Hotel Ads y Performance Max'],[M,'Alcance y Retargeting']]},
    {max:5000, nm:'Plan Enterprise',   rg:'USD 3.001 a 5.000', pr:'ARS 1.277.000', ch:[[G,'Search, Hotel Ads, Performance Max y Remarketing'],[M,'Alcance, Retargeting, Nativas, Promociones y Eventos especiales']]}
  ];
  var inv = $('#a2-inv'), cur = -1;
  function planFor(v){ for(var i=0;i<PLANS.length;i++){ if(v<=PLANS[i].max) return i; } return 2; }
  function render(){
    var v = +inv.value, i = planFor(v), p = PLANS[i];
    $('#a2-val').textContent = 'USD ' + AX.fmt(v);
    $('#a2-fill').style.width = ((v-100)/4900*100) + '%';
    $$('.a2-pick button').forEach(function(b,k){ b.setAttribute('aria-pressed', k===i ? 'true' : 'false'); });
    if(i === cur) return;
    cur = i;
    var sw = $('.a2-plan .sw');
    function fill(){
      $('#a2-plan-nm').textContent = p.nm; $('#a2-plan-rg').textContent = p.rg;
      $('#a2-plan-pr').innerHTML = p.pr + ' <small>/mes</small>';
      $('#a2-plan-ch').innerHTML = p.ch.map(function(c){
        return '<div class="ch"><span class="ax-logo"><img src="'+c[0]+'" alt=""></span>'+c[1]+'</div>';
      }).join('');
    }
    if(window.gsap && !AX.rm){ gsap.to(sw,{opacity:0,duration:.14,onComplete:function(){ fill(); gsap.to(sw,{opacity:1,duration:.2}); }}); }
    else fill();
  }
  if(inv){
    inv.addEventListener('input', render);
    $$('.a2-pick button').forEach(function(b){
      b.addEventListener('click', function(){
        var to = +b.getAttribute('data-v');
        if(window.gsap && !AX.rm){ var o={v:+inv.value}; gsap.to(o,{v:to,duration:.6,onUpdate:function(){ inv.value = Math.round(o.v/50)*50; render(); }}); }
        else { inv.value = to; render(); }
      });
    });
    render();
  }

  /* ---------- PESTAÑAS de roles (avance solo hasta que el usuario toca) ---------- */
  var tabs = $$('.a2-tab'), panes = $$('.a2-pane'), ti = 0, auto = true, tAuto = null, barTw = null;
  function show(i, user){
    ti = i;
    tabs.forEach(function(t,k){ t.setAttribute('aria-selected', k===i ? 'true':'false'); t.tabIndex = k===i ? 0 : -1; });
    panes.forEach(function(p,k){ p.hidden = k!==i; });
    var pane = panes[i];
    if(window.gsap && !AX.rm){
      gsap.fromTo(pane.querySelectorAll('.ax-h3, p.d, .lst li, .viz .m'),{opacity:0,y:10},{opacity:1,y:0,duration:.5,stagger:.08});
      var n = pane.querySelector('.viz .m-notif');
      if(n) gsap.fromTo(n,{opacity:0,y:16,scale:.96},{opacity:1,y:0,scale:1,duration:.55,delay:.9});
    }
    if(user){ auto = false; if(barTw) barTw.kill(); $$('.a2-tab .bar').forEach(function(b){ b.style.transform='scaleX(0)'; }); }
    if(auto) runBar();
  }
  function runBar(){
    if(!window.gsap || AX.rm) return;
    $$('.a2-tab .bar').forEach(function(b){ b.style.transform='scaleX(0)'; });
    var bar = tabs[ti].querySelector('.bar');
    if(barTw) barTw.kill();
    barTw = gsap.fromTo(bar,{scaleX:0},{scaleX:1,duration:7,ease:'none',paused:!inView,onComplete:function(){ if(auto) show((ti+1)%tabs.length); }});
  }
  var inView = false;
  tabs.forEach(function(t,k){
    t.addEventListener('click', function(){ show(k, true); });
    t.addEventListener('keydown', function(e){
      var d = e.key==='ArrowRight' ? 1 : e.key==='ArrowLeft' ? -1 : 0;
      if(d){ e.preventDefault(); var n=(k+d+tabs.length)%tabs.length; show(n,true); tabs[n].focus(); }
    });
  });

  if(!window.gsap){ return; }

  ScrollTrigger.create({trigger:'.a2-panels',start:'top 80%',end:'bottom 20%',onToggle:function(self){
    inView = self.isActive;
    if(!barTw && auto && inView){ show(0); return; }
    if(barTw) inView ? barTw.play() : barTw.pause();
  }});

  /* ---------- PROCESO: la línea se pinta con el scroll y no retrocede ---------- */
  var ln = $('#a2-ln');
  if(ln){
    var L = ln.getTotalLength();
    ln.style.strokeDasharray = L; ln.style.strokeDashoffset = AX.rm ? 0 : L;
    if(!AX.rm) ScrollTrigger.create({trigger:'#a2-steps',start:'top 80%',end:'bottom 60%',
      onUpdate:AX.monotonic(function(p){ ln.style.strokeDashoffset = L*(1-p); })});
  }

  /* ---------- HERO: fibras de luz que confluyen en tu sitio ---------- */
  var flow = $('#a2-flow'), svg = $('#a2-fib');
  var srcs = $$('.a2-s', flow), hub = $('.a2-hub', flow), out = $('#a2-out');
  var paths = [], outPath = null;
  function rel(el){ var r = el.getBoundingClientRect(), f = flow.getBoundingClientRect(); return {x:r.left-f.left, y:r.top-f.top, w:r.width, h:r.height}; }
  function draw(){
    while(svg.firstChild) svg.removeChild(svg.firstChild);
    paths = [];
    var H = rel(hub), mob = AX.mobile();
    var hc = {x:H.x+H.w/2, y:H.y+H.h/2};
    srcs.forEach(function(s){
      var r = rel(s), a, b, d;
      if(mob){ a = {x:r.x+r.w/2, y:r.y+r.h}; b = {x:hc.x, y:H.y+4};
        d = 'M'+a.x+' '+a.y+' C '+a.x+' '+(a.y+40)+', '+b.x+' '+(b.y-50)+', '+b.x+' '+b.y; }
      else { a = {x:r.x+r.w, y:r.y+r.h/2}; b = {x:H.x+6, y:hc.y};
        d = 'M'+a.x+' '+a.y+' C '+(a.x+90)+' '+a.y+', '+(b.x-90)+' '+b.y+', '+b.x+' '+b.y; }
      var p = document.createElementNS(NS,'path'); p.setAttribute('class','fb'); p.setAttribute('d',d);
      svg.appendChild(p); paths.push(p);
    });
    var o = rel(out), a2, b2, d2;
    if(mob){ a2 = {x:hc.x, y:H.y+H.h-4}; b2 = {x:hc.x, y:o.y+o.h-90}; }
    else { a2 = {x:H.x+H.w-6, y:hc.y}; b2 = {x:o.x-4, y:hc.y}; }
    d2 = 'M'+a2.x+' '+a2.y+' L '+b2.x+' '+b2.y;
    outPath = document.createElementNS(NS,'path'); outPath.setAttribute('class','fb out'); outPath.setAttribute('d',d2);
    svg.appendChild(outPath);
  }
  function pulse(path, red){
    var L = path.getTotalLength(), h = document.createElementNS(NS,'circle'), c = document.createElementNS(NS,'circle');
    h.setAttribute('r', 11); h.setAttribute('class','plh'+(red?' r':'')); c.setAttribute('r', 4.5); c.setAttribute('class','pl'+(red?' r':''));
    svg.appendChild(h); svg.appendChild(c);
    var o = {p:0};
    return gsap.timeline({onComplete:function(){ h.remove(); c.remove(); }})
      .fromTo([h,c],{opacity:0},{opacity:1,duration:.2})
      .to(o,{p:1,duration:red?.6:1.25,ease:'power1.inOut',onUpdate:function(){
        var pt = path.getPointAtLength(L*o.p);
        c.setAttribute('cx',pt.x); c.setAttribute('cy',pt.y); h.setAttribute('cx',pt.x); h.setAttribute('cy',pt.y);
      }},0)
      .to([h,c],{opacity:0,duration:.2},'-=.15');
  }
  /* pila de avisos tipo iPhone */
  var notes = $$('.m-notif', out), shown = 0;
  function stack(){
    notes.forEach(function(el,i){
      var k = shown-1-i;
      if(i >= shown){ gsap.set(el,{opacity:0,y:30,scale:.95}); return; }
      gsap.to(el,{opacity:k>2?0:1,y:-k*16,scale:1-k*.05,zIndex:10-k,duration:.55});
    });
  }
  draw();
  window.addEventListener('resize', function(){ draw(); });
  if(AX.rm){ shown = notes.length; stack(); return; }
  stack();
  var order = [0,1,2], ftl = gsap.timeline({repeat:-1,paused:true,delay:.6});
  order.forEach(function(k,i){
    ftl.call(function(){ srcs[k].classList.add('on'); }, null, i*2.6)
       .add(function(){ pulse(paths[k]); }, i*2.6+.2)
       .call(function(){ srcs[k].classList.remove('on'); hub.classList.add('on'); }, null, i*2.6+1.45)
       .add(function(){ pulse(outPath, true); }, i*2.6+1.45)
       .call(function(){ shown = Math.min(notes.length, shown+1); stack(); }, null, i*2.6+2.05);
  });
  ftl.call(function(){}, null, '+=2.6')
     .call(function(){ shown = 0; notes.forEach(function(el){ gsap.to(el,{opacity:0,y:-10,duration:.4}); }); })
     .call(function(){}, null, '+=.6');
  /* los avisos aparecen en orden: el más nuevo adelante */
  ScrollTrigger.create({trigger:flow,start:'top 90%',end:'bottom top',onToggle:function(self){ self.isActive ? ftl.play() : ftl.pause(); }});
  ScrollTrigger.addEventListener('refresh', draw);
})();
