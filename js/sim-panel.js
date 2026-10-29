// Bottom-centre simulation panel shared by ONE BUILDER (console.html) and ONE MONITOR (console2.html):
// play/pause, current step, step picker, speed, restart and a seekable progress bar with time.
// The host owns the simulation; the panel only shows state (update) and reports clicks (callbacks).
(() => {
  const css = `
  .spnl{position:absolute;left:50%;bottom:28px;transform:translateX(-50%);z-index:7;width:min(560px,calc(100% - 48px));
    display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;align-items:center;gap:4px 12px;padding:10px 12px 10px 10px;
    background:rgba(16,16,18,.58);border:1px solid rgba(255,255,255,.12);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.3);
    font-family:var(--sans,system-ui,sans-serif);color:var(--fg,#ececec);backdrop-filter:blur(14px) saturate(1.2);-webkit-backdrop-filter:blur(14px) saturate(1.2)}
  .spnl button{font:inherit;color:inherit;cursor:pointer}
  .spnl .sp-play{width:38px;height:38px;border-radius:50%;border:0;background:var(--accent,#eec539);color:var(--accent-ink,#1d1600);display:grid;place-items:center;transition:transform .12s;box-shadow:0 0 0 4px rgba(238,197,57,.16)}
  .spnl .sp-play:hover{transform:scale(1.06)}
  .spnl .sp-play svg{width:14px;height:14px;fill:currentColor}
  .spnl .sp-mid{display:grid;gap:3px;min-width:0}
  .spnl .sp-top{display:flex;align-items:baseline;gap:10px;font-family:var(--mono,ui-monospace,monospace);font-size:10px;letter-spacing:.08em;color:rgba(255,255,255,.62)}
  .spnl .sp-eye{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
  .spnl .sp-time{margin-left:auto;font-variant-numeric:tabular-nums;white-space:nowrap;color:#fff}
  .spnl .sp-row{display:flex;align-items:center;gap:8px;min-width:0}
  .spnl .sp-title{flex:none;max-width:45%;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .spnl select{flex:1;width:100%;min-width:0;height:24px;background:rgba(255,255,255,.07);color:var(--fg,#ececec);border:1px solid rgba(255,255,255,.12);border-radius:4px;padding:0 8px;font:inherit;font-size:11.5px;cursor:pointer}
  .spnl select option{background:#151517;color:#ececec}
  .spnl select:hover{border-color:rgba(238,197,57,.6)}
  .spnl select.none{display:none}
  .spnl select:focus-visible,.spnl button:focus-visible{outline:1px solid var(--accent,#eec539);outline-offset:2px}
  .spnl .sp-bar{position:relative;height:12px;cursor:pointer;touch-action:none}
  .spnl .sp-bar::before{content:"";position:absolute;left:0;right:0;top:5px;height:3px;background:rgba(255,255,255,.16);border-radius:2px}
  .spnl .sp-bar i{position:absolute;left:0;top:5px;height:3px;background:var(--accent,#eec539);border-radius:2px}
  .spnl .sp-bar b{position:absolute;top:2px;width:9px;height:9px;margin-left:-4.5px;border-radius:50%;background:#fff;box-shadow:0 0 0 3px rgba(238,197,57,.35)}
  .spnl .sp-bar.off{cursor:default}
  .spnl .sp-bar.off b{display:none}
  .spnl .sp-speed{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:3px 10px;font-family:var(--mono,ui-monospace,monospace);font-size:12px;font-weight:600;color:var(--accent,#eec539);min-width:0}
  .spnl .sp-speed:hover{border-color:var(--accent,#eec539)}
  .spnl .sp-rate{display:flex;align-items:center;gap:6px}
  .spnl .sp-rate input{width:92px;accent-color:var(--accent,#eec539);cursor:pointer}
  .spnl .sp-rate output{min-width:38px;text-align:right;font-family:var(--mono,ui-monospace,monospace);font-size:12px;font-weight:600;color:var(--accent,#eec539)}
  .spnl .sp-restart{width:30px;height:30px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:50%;padding:0;color:#fff;display:grid;place-items:center}
  .spnl .sp-restart:hover{border-color:var(--accent,#eec539);color:var(--accent,#eec539)}
  .spnl .sp-restart svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  @media (max-width:700px){
    .spnl{bottom:14px;width:calc(100% - 20px);gap:4px 8px;padding:8px 10px 8px 8px}
    .spnl .sp-eye{display:none}
    .spnl .sp-title{max-width:40%}
  }`;
  const ICON = {
    play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg>',
    pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z"/></svg>',
    restart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/></svg>'
  };
  const esc = t => String(t).replace(/[<>&"]/g, '');
  const fmt = t => { if (!(t >= 0)) return '--:--'; t = Math.floor(t); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60, p = v => String(v).padStart(2, '0'); return (h ? h + ':' + p(m) : p(m)) + ':' + p(s); };

  // opts: { eyebrow, speeds: [..], speed, onToggle(), onRestart(), onSpeed(v), onStep(i), onSeek(frac 0..1) }
  // rate mode (opts.base): a slider in displayed steps of 0.5 (×0.5 … ×8); ×1 shown = opts.base real speed; onSpeed gets the real speed
  function mount(parent, opts = {}) {
    if (!document.getElementById('spnlCss')) { const st = document.createElement('style'); st.id = 'spnlCss'; st.textContent = css; document.head.appendChild(st); }
    const speeds = opts.speeds || [1, 4, 16, 32], base = opts.base || 0;
    let speed = opts.speed || (base || speeds[0]), stepKey = '', seekable = false;
    const shown = v => (Math.round(v / base * 2) / 2).toFixed(1);
    const el = document.createElement('div'); el.className = 'spnl'; el.setAttribute('role', 'region'); el.setAttribute('aria-label', '시뮬레이션 진행 상태');
    el.innerHTML = `
      <button type="button" class="sp-play" aria-label="재생">${ICON.play}</button>
      <div class="sp-mid">
        <div class="sp-top"><span class="sp-eye"></span><span class="sp-time">--:-- / --:--</span></div>
        <div class="sp-row"><div class="sp-title">대기</div><select class="sp-step none" aria-label="공정 단계 선택" hidden></select></div>
        <div class="sp-bar off" role="slider" aria-label="진행 위치" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0"><i style="width:0"></i><b style="left:0"></b></div>
      </div>
      ${base ? `<label class="sp-rate" title="재생 배속 (0.5 단위)"><input type="range" min="0.5" max="8" step="0.5" value="${shown(speed)}" aria-label="재생 배속"><output>×${shown(speed)}</output></label>` : `<button type="button" class="sp-speed" title="배속">×${speed}</button>`}
      <button type="button" class="sp-restart" title="처음부터" aria-label="처음부터">${ICON.restart}</button>`;
    parent.appendChild(el);
    const q = s => el.querySelector(s), play = q('.sp-play'), sel = q('.sp-step'), bar = q('.sp-bar');
    q('.sp-eye').textContent = opts.eyebrow || '시뮬레이션';
    play.onclick = () => opts.onToggle && opts.onToggle();
    q('.sp-restart').onclick = () => opts.onRestart && opts.onRestart();
    if (base) { const r = q('.sp-rate input'), o = q('.sp-rate output'); r.oninput = () => { speed = +r.value * base; o.textContent = '×' + (+r.value).toFixed(1); opts.onSpeed && opts.onSpeed(speed); }; }
    else q('.sp-speed').onclick = () => { speed = speeds[(speeds.indexOf(speed) + 1) % speeds.length]; q('.sp-speed').textContent = '×' + speed; opts.onSpeed && opts.onSpeed(speed); };
    sel.onchange = () => { if (sel.value !== '' && opts.onStep) opts.onStep(+sel.value); };
    // drag or click on the bar to seek; arrow keys step 5 %
    const seekAt = e => { const r = bar.getBoundingClientRect(); opts.onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))); };
    bar.addEventListener('pointerdown', e => {
      if (!seekable || !opts.onSeek) return; bar.setPointerCapture(e.pointerId); seekAt(e);
      const mv = ev => seekAt(ev), up = () => { bar.removeEventListener('pointermove', mv); bar.removeEventListener('pointerup', up); };
      bar.addEventListener('pointermove', mv); bar.addEventListener('pointerup', up);
    });
    bar.addEventListener('keydown', e => {
      if (!seekable || !opts.onSeek || !/Arrow(Left|Right)/.test(e.key)) return; e.preventDefault();
      opts.onSeek(Math.max(0, Math.min(1, +bar.getAttribute('aria-valuenow') / 100 + (e.key === 'ArrowRight' ? 0.05 : -0.05))));
    });
    let last = {};
    // s: { playing, title, eyebrow, steps: [names], step: index|-1, t, total, speed }
    function update(s) {
      if (s.playing !== last.playing) { play.innerHTML = s.playing ? ICON.pause : ICON.play; play.setAttribute('aria-label', s.playing ? '일시정지' : '재생'); }
      if (s.eyebrow != null && s.eyebrow !== last.eyebrow) q('.sp-eye').textContent = s.eyebrow;
      if (s.title !== last.title) { q('.sp-title').textContent = s.title || '대기'; q('.sp-title').title = s.title || ''; }
      if (s.speed != null && s.speed !== speed) { speed = s.speed; if (base) { q('.sp-rate input').value = shown(speed); q('.sp-rate output').textContent = '×' + shown(speed); } else q('.sp-speed').textContent = '×' + speed; }
      const steps = s.steps || [], key = steps.join('\u0001');
      if (key !== stepKey) {
        stepKey = key;
        sel.innerHTML = steps.length ? steps.map((n, i) => `<option value="${i}">${i + 1}. ${esc(n)}</option>`).join('') : '<option value="">단계 정보 없음</option>';
        sel.disabled = !steps.length || !opts.onStep;
        sel.classList.toggle('none', !steps.length);
        sel.hidden = !steps.length; // nothing to pick on a scene without cycle steps
      }
      const si = s.step >= 0 && s.step < steps.length ? String(s.step) : '';
      if (document.activeElement !== sel && sel.value !== si) { if (si === '') sel.selectedIndex = -1; else sel.value = si; }
      const total = s.total > 0 ? s.total : 0, f = total ? Math.max(0, Math.min(1, s.t / total)) : 0;
      q('.sp-time').textContent = fmt(s.t) + ' / ' + (total ? fmt(total) : '--:--');
      seekable = !!(total && opts.onSeek); bar.classList.toggle('off', !seekable);
      q('.sp-bar i').style.width = q('.sp-bar b').style.left = (f * 100).toFixed(2) + '%';
      bar.setAttribute('aria-valuenow', Math.round(f * 100));
      last = s;
    }
    return { el, update, get speed() { return speed; } };
  }
  window.SimPanel = { mount, fmt };
})();
