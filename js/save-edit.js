// Edit a saved factory's name / description in place (ONE BUILDER 불러오기 list and ONE MONITOR 모니터링 목록).
// SaveEdit.open(box, save, done): replaces box's content with a small form; done(changed) re-renders the list.
// The save password is remembered for the tab (same key as the save dialog).
(function () {
  const PW = 'one-station-save-pw', esc = t => String(t ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const css = `.save-edit{display:grid;gap:6px;padding:8px 10px;background:var(--panel2,#14181d);border:1px solid var(--accent,#f5c518);border-radius:3px}
.save-edit label{display:grid;gap:3px;font-size:11px;color:var(--mute,#8a9099)}
.save-edit input,.save-edit textarea{background:var(--bg,#0b0d10);border:1px solid var(--line,#2a2f36);color:var(--fg,#e8e8e8);padding:6px 8px;border-radius:3px;font:inherit;font-size:12px}
.save-edit textarea{resize:vertical;min-height:40px}
.save-edit .r{display:flex;gap:6px;justify-content:flex-end;align-items:center}
.save-edit .r em{flex:1;font-style:normal;font-size:11px;color:var(--ng,#ff5a5a)}
.save-edit button{background:var(--panel2,#14181d);border:1px solid var(--line,#2a2f36);color:var(--fg,#e8e8e8);padding:5px 12px;border-radius:3px;cursor:pointer;font:inherit;font-size:12px}
.save-edit button[data-ok]{background:var(--accent,#f5c518);border-color:var(--accent,#f5c518);color:var(--accent-ink,#111);font-weight:700}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const getPw = () => { try { return sessionStorage.getItem(PW) || ''; } catch (e) { return ''; } };
  function open(box, s, done) {
    const pw = getPw();
    box.innerHTML = `<div class="save-edit">
      <label>이름<input name="name" maxlength="60" required value="${esc(s.name)}"></label>
      <label>설명<textarea name="note" maxlength="200" rows="2">${esc(s.note)}</textarea></label>
      ${pw ? '' : '<label>저장 비밀번호<input name="password" type="password" required autocomplete="current-password"></label>'}
      <div class="r"><em></em><button type="button" data-x>취소</button><button type="button" data-ok>수정</button></div></div>`;
    // a div, not a form: the BUILDER list already sits inside the dialog's form
    const f = box.querySelector('.save-edit'), err = f.querySelector('em'), q = n => f.querySelector(`[name=${n}]`);
    f.name = q('name'); f.note = q('note'); f.password = q('password');
    ['click', 'pointerdown', 'keydown'].forEach(t => f.addEventListener(t, e => e.stopPropagation()));
    f.name.focus(); f.name.select();
    f.querySelector('[data-x]').onclick = () => done(false);
    f.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); submit(); } if (e.key === 'Escape') done(false); });
    f.querySelector('[data-ok]').onclick = () => submit();
    const submit = async () => {
      const password = f.password ? f.password.value : getPw(), name = f.name.value.trim(), note = f.note.value.trim(); if (!name || !password) return (f.password && !password ? f.password : f.name).focus();
      f.querySelectorAll('button').forEach(b => b.disabled = true); err.textContent = '';
      try {
        const r = await fetch('api/saves', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'edit', id: s.id, password, name, note }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { if (r.status === 401) try { sessionStorage.removeItem(PW); } catch (x) {} throw new Error(r.status === 401 ? '비밀번호가 틀렸습니다' : j.error || r.status); }
        try { sessionStorage.setItem(PW, password); } catch (x) {}
        s.name = j.name; s.note = j.note; done(true);
      } catch (x) {
        err.textContent = '수정 실패: ' + x.message; f.querySelectorAll('button').forEach(b => b.disabled = false);
        if (!f.password && /비밀번호/.test(x.message)) {   // the remembered password was wrong: ask for it, keeping what was typed
          const t = Object.assign({}, s, { name, note });
          open(box, t, c => { if (c) Object.assign(s, { name: t.name, note: t.note }); done(c); });
          box.querySelector('em').textContent = '비밀번호를 입력하세요';
        }
      }
    };
  }
  window.SaveEdit = { open };
})();
