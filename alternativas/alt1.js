/* Alternativa 1 · «El camino del huésped» */
(function(){
  var AX = window.AX, $ = AX.$, $$ = AX.$$;
  if(!window.gsap){ return; }

  /* ---------- HERO: el punto recorre el camino y cada momento se enciende ---------- */
  var path = $('#a1-p'), lit = $('#a1-pl'), dot = $('#a1-d'), dh = $('#a1-dh');
  var L = path.getTotalLength();
  var steps = $$('.a1-mo'), notif = $('#a1-not .m-notif'), heart = $('.a1-ig .heart');
  /* largo del camino en cada momento (medido sobre el path) */
  var stops = [0, .30, .64, 1];
  function at(p){
    var pt = path.getPointAtLength(L*p);
    dot.setAttribute('cx',pt.x); dot.setAttribute('cy',pt.y);
    dh.setAttribute('cx',pt.x); dh.setAttribute('cy',pt.y);
    lit.style.strokeDashoffset = L*(1-p);
  }
  lit.style.strokeDasharray = L;
  function on(i){ steps.forEach(function(s,k){ s.classList.toggle('on',k===i); }); }

  if(AX.rm){
    at(1); on(1); heart.classList.add('on');
    gsap.set(notif,{opacity:1,y:0,scale:1});
  } else {
    var st = {p:0};
    gsap.set(notif,{opacity:0,y:18,scale:.96});
    gsap.set([dot,dh],{opacity:0});
    var tl = gsap.timeline({repeat:-1,delay:.9,defaults:{ease:'pxs'}});
    tl.call(function(){ at(0); on(0); })
      .to([dot,dh],{opacity:1,duration:.3})
      .call(function(){ heart.classList.add('on'); },null,'+=.5')
      .to(st,{p:stops[1],duration:1.3,ease:'power1.inOut',onUpdate:function(){ at(st.p); }},'+=1.2')
      .call(function(){ on(1); })
      .to(st,{p:stops[2],duration:1.3,ease:'power1.inOut',onUpdate:function(){ at(st.p); }},'+=2.4')
      .call(function(){ on(2); })
      .to(st,{p:stops[3],duration:1.1,ease:'power1.inOut',onUpdate:function(){ at(st.p); }},'+=2.2')
      .call(function(){ on(-1); })
      .to(notif,{opacity:1,y:0,scale:1,duration:.55},'-=.1')
      /* vida: quieto. Cierre en orden inverso para que el loop no salte */
      .to(notif,{opacity:0,y:10,duration:.45},'+=3.2')
      .to([dot,dh],{opacity:0,duration:.3},'<')
      .call(function(){ heart.classList.remove('on'); })
      .to(st,{p:0,duration:.6,onUpdate:function(){ lit.style.strokeDashoffset = L*(1-st.p); }});
    /* fuera de vista no corre */
    ScrollTrigger.create({trigger:'#a1-scene',start:'top bottom',end:'bottom top',
      onToggle:function(self){ self.isActive ? tl.play() : tl.pause(); }});
  }

  /* ---------- CAMINO: la línea se pinta con el scroll y no retrocede ---------- */
  var rail = $('#a1-rail');
  if(rail){
    var RL = rail.getTotalLength();
    rail.style.strokeDasharray = RL; rail.style.strokeDashoffset = RL;
    if(AX.rm){ rail.style.strokeDashoffset = 0; }
    else ScrollTrigger.create({trigger:'#a1-road',start:'top 80%',end:'bottom 70%',
      onUpdate:AX.monotonic(function(p){ rail.style.strokeDashoffset = RL*(1-p); })});
  }

  /* ---------- ÓRBITA: puntos naranjas de sincronización hacia tu motor ---------- */
  var g = $('#a1-sync'), NS = 'http://www.w3.org/2000/svg';
  var wires = ['#a1-w0','#a1-w1','#a1-w2'].map(function(id){ return $(id); });
  if(g && !AX.rm){
    var dots = wires.map(function(w,i){
      var h = document.createElementNS(NS,'circle'); h.setAttribute('r',10); h.setAttribute('class','sync-h');
      var c = document.createElementNS(NS,'circle'); c.setAttribute('r',4.5); c.setAttribute('class','sync');
      g.appendChild(h); g.appendChild(c);
      return {w:w,len:w.getTotalLength(),c:c,h:h,o:{p:0}};
    });
    var otl = gsap.timeline({repeat:-1,paused:true});
    dots.forEach(function(d,i){
      gsap.set([d.c,d.h],{opacity:0});
      otl.add(gsap.timeline()
        .set([d.c,d.h],{opacity:1})
        .fromTo(d.o,{p:0},{p:1,duration:1.4,ease:'power1.inOut',onUpdate:function(){
          var pt = d.w.getPointAtLength(d.len*d.o.p);
          d.c.setAttribute('cx',pt.x); d.c.setAttribute('cy',pt.y);
          d.h.setAttribute('cx',pt.x); d.h.setAttribute('cy',pt.y);
        }})
        .to([d.c,d.h],{opacity:0,duration:.25}), i*1.6);
    });
    otl.to({}, {duration:.6});
    var rows = $$('.a1-core .row');
    ScrollTrigger.create({trigger:'#a1-orbit',start:'top 85%',end:'bottom top',
      onToggle:function(self){ self.isActive ? otl.play() : otl.pause(); }});
    /* las filas del motor se encienden cuando llega cada punto */
    otl.eventCallback('onUpdate',function(){
      var t = otl.time();
      rows.forEach(function(r,i){
        var k = [1,2,0][i]; var s = k*1.6+1.25;
        r.style.boxShadow = (t>s && t<s+1.2) ? '0 0 0 2px rgba(255,115,22,.45)' : 'none';
      });
    });
  }

  /* ---------- CIERRE: pila de avisos tipo iPhone ---------- */
  var stack = $$('#a1-stack .m-notif');
  function layout(n){
    /* n = cuántos llegaron; el último va adelante y abajo, los anteriores asoman atrás */
    stack.forEach(function(el,i){
      var k = n-1-i; /* 0 = el más nuevo */
      if(i >= n){ gsap.set(el,{opacity:0,y:-30,scale:.94,zIndex:0}); return; }
      gsap.to(el,{opacity:k>2?0:1,y:-k*62,scale:1-k*.04,zIndex:10-k,duration:.55,bottom:0});
    });
  }
  stack.forEach(function(el){ el.style.bottom='0'; });
  if(AX.rm){ layout(stack.length); }
  else {
    layout(0);
    ScrollTrigger.create({trigger:'#a1-stack',start:'top 80%',once:true,onEnter:function(){
      stack.forEach(function(_,i){ setTimeout(function(){ layout(i+1); }, 250+i*700); });
    }});
  }
})();
