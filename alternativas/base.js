/* Hotel Ads · replanteo integral · motion compartido
   Lenis + GSAP locales (tokens.md §4b.2.10). Reveals una sola vez, progreso que no retrocede,
   reduced-motion deja todo en su estado final. */
(function(){
  var AX = window.AX = {};
  var root = document.querySelector('.ax');
  root.classList.remove('no-js');
  var rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  AX.rm = rm;
  AX.$ = function(s,c){ return (c||document).querySelector(s); };
  AX.$$ = function(s,c){ return Array.prototype.slice.call((c||document).querySelectorAll(s)); };
  AX.mobile = function(){ return window.matchMedia('(max-width:900px)').matches; };
  if(rm || !window.gsap){ root.classList.add('rm'); }

  /* número con separador de miles a la argentina */
  AX.fmt = function(n){ return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.'); };

  if(!window.gsap){ return; }
  gsap.registerPlugin(ScrollTrigger, CustomEase);
  CustomEase.create('pxs','0.22,0.61,0.36,1');
  gsap.defaults({ease:'pxs'});

  /* scroll suave: lerp 0.1, como la landing de temporada */
  if(!rm && window.Lenis){
    var lenis = AX.lenis = new Lenis({lerp:0.1, smoothWheel:true});
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function(t){ lenis.raf(t*1000); });
    gsap.ticker.lagSmoothing(0);
  }
  /* anclas internas con el scroll suave */
  AX.$$('a[href^="#"]').forEach(function(a){
    a.addEventListener('click', function(e){
      var id = a.getAttribute('href'); if(id.length < 2) return;
      var t = document.querySelector(id); if(!t) return;
      e.preventDefault();
      if(AX.lenis){ AX.lenis.scrollTo(t,{offset:-80,duration:1.3}); }
      else { t.scrollIntoView({behavior:rm?'auto':'smooth'}); }
    });
  });

  /* progreso monótono: lo que cae, cae una vez */
  AX.monotonic = function(fn){
    var max = 0, cur = {p:0};
    return function(self){
      if(self.progress <= max) return;
      max = self.progress;
      gsap.to(cur,{p:max,duration:.9,overwrite:true,onUpdate:function(){ fn(cur.p); }});
    };
  };

  /* contadores */
  AX.count = function(el, delay){
    var to = parseFloat(el.getAttribute('data-count')), o = {v:0};
    var pre = el.getAttribute('data-pre')||'', suf = el.getAttribute('data-suf')||'';
    if(rm){ el.textContent = pre+AX.fmt(to)+suf; return; }
    el.textContent = pre+'0'+suf;
    gsap.to(o,{v:to,duration:1.6,delay:delay||0,ease:'power2.out',onUpdate:function(){ el.textContent = pre+AX.fmt(o.v)+suf; }});
  };

  if(rm){
    AX.$$('[data-count]').forEach(function(el){ AX.count(el); });
    return;
  }

  /* reveals: fade + 8–14 px, una sola vez, al 20 % del bloque */
  AX.$$('[data-r]').forEach(function(el){
    var d = parseFloat(el.getAttribute('data-r')) || 0;
    ScrollTrigger.create({trigger:el,start:'top 88%',once:true,onEnter:function(){
      gsap.to(el,{opacity:1,y:0,duration:.6,delay:d});
    }});
  });
  AX.$$('[data-count]').forEach(function(el){
    if(el.hasAttribute('data-manual')) return;
    ScrollTrigger.create({trigger:el,start:'top 90%',once:true,onEnter:function(){ AX.count(el,.15); }});
  });

  /* marquee con inercia: acelera con la velocidad del scroll */
  AX.$$('.ax-marquee .tr').forEach(function(tr){
    var x = 0, w = tr.scrollWidth/2, v = 0;
    if(AX.lenis) AX.lenis.on('scroll',function(e){ v = e.velocity; });
    gsap.ticker.add(function(){
      x -= .45 + Math.min(Math.abs(v),40)*.18;
      if(-x >= w) x += w;
      tr.style.transform = 'translate3d('+x+'px,0,0)';
      v *= .92;
    });
  });
})();
