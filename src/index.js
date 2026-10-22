/* nav toggle + optional real video (hero.mp4) over the live 3D dispensing scene */
(() => {
  const nav = document.getElementById('nav');
  document.getElementById('burger').onclick = () => nav.classList.toggle('open');
  document.querySelectorAll('#menu a').forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));
  const plan = document.getElementById('planWrap'), about = document.getElementById('about');
  const sLink = document.getElementById('stationLink'), aLink = document.getElementById('aboutLink');
  /* one panel at a time; clicking the active menu closes it and returns to the top */
  const panels = [[plan, sLink], [about, aLink]];
  let vw = null;
  const syncViewer = () => { if (!window.__station) return; if (!plan.hidden && !vw) vw = window.__station.mountViewer(document.getElementById('stationCanvas'), document.getElementById('hot'), document.getElementById('legend')); if (vw) vw.active = !plan.hidden; };
  const panel = (el, link, on) => {
    panels.forEach(([p, l]) => { if (p !== el) { p.hidden = true; l.classList.remove('on'); } });
    el.hidden = !on; link.classList.toggle('on', on); syncViewer();
    requestAnimationFrame(() => on ? scrollTo({ top: el.getBoundingClientRect().top + scrollY - nav.offsetHeight + 1, behavior: 'smooth' }) : scrollTo({ top: 0, behavior: 'smooth' }));
  };
  sLink.addEventListener('click', e => { e.preventDefault(); nav.classList.remove('open'); panel(plan, sLink, plan.hidden); });
  aLink.addEventListener('click', e => { e.preventDefault(); nav.classList.remove('open'); panel(about, aLink, about.hidden); });
  const solid = () => nav.classList.toggle('solid', scrollY > 40);
  addEventListener('scroll', solid, { passive: true }); solid();
  if (location.hash === '#station') panel(plan, sLink, true);
  if (location.hash === '#about') panel(about, aLink, true);
  document.getElementById('copyMail').addEventListener('click', e => {
    const b = e.currentTarget, t = 'one@oneauto.co.kr';
    const done = () => { b.textContent = '복사됨'; setTimeout(() => b.textContent = '복사', 1600); };
    try { navigator.clipboard.writeText(t).then(done, () => { getSelection().selectAllChildren(document.getElementById('mail')); }); } catch (_) { getSelection().selectAllChildren(document.getElementById('mail')); }
  });
  /* hero fills whatever the title, console button and footer leave of the first screen */
  const hero = document.getElementById('top'), st = document.getElementById('station'), ft = document.getElementById('foot');
  const fit = () => { const rest = st.offsetHeight - (plan.hidden ? 0 : plan.offsetHeight) + ft.offsetHeight; hero.style.height = Math.max(420, innerHeight - rest) + 'px'; };
  fit(); addEventListener('resize', fit); if (document.fonts) document.fonts.ready.then(fit);
  new IntersectionObserver(es => es.forEach(e => { window.__heroVisible = e.isIntersecting; })).observe(document.getElementById('top'));
  const v = document.getElementById('heroVideo');
  v.addEventListener('loadeddata', () => { v.hidden = false; document.getElementById('heroCanvas').style.visibility = 'hidden'; v.play().catch(() => {}); });
  try { v.load(); } catch (e) {}
})();
