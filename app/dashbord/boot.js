(function(){try{var l=localStorage.getItem('or5_lang')==='ar'?'ar':'en',t=localStorage.getItem('or5_theme')==='light'?'light':'dark',h=document.documentElement;h.lang=l;h.dir=l==='ar'?'rtl':'ltr';h.setAttribute('data-theme',t)}catch(e){}})();
/* clickjacking guard: GitHub Pages cannot send frame-ancestors / X-Frame-Options headers,
   so a page loaded inside another site's frame hides itself and tries to break out */
(function () {
  if (window.top === window.self) return;
  var h = document.documentElement; h.style.setProperty('display', 'none', 'important');
  try { window.top.location.replace(window.self.location.href); } catch (e) {}
})();
