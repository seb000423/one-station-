// Console 1 "저장": records the station with its current settings (js/station-export.js) and uploads
// station.glb + timeline.json + meta.json to Vercel Blob under saves/<id>/ through api/upload
// (client upload, so the ~8 MB GLB goes straight to Blob). Console 2 lists the saves (api/saves).
const BLOB_CLIENT = 'https://cdn.jsdelivr.net/npm/@vercel/blob@2.8.1/dist/client.js/+esm';
const $ = q => document.querySelector(q);

const css = `
#saveStation{margin-top:6px;width:100%;background:var(--panel2);border:1px solid var(--line);color:var(--fg);padding:10px;border-radius:3px;cursor:pointer;font-weight:600;letter-spacing:.08em}
#saveStation:hover{border-color:var(--accent);color:var(--accent)}
#saveStation:disabled{opacity:.4;cursor:wait}
.savedlg{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:50;padding:16px}
.savedlg form{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:18px 20px;width:min(380px,100%);display:grid;gap:10px;font-size:13px}
.savedlg h3{margin:0;font-size:14px}
.savedlg label{display:grid;gap:4px;color:var(--mute);font-size:12px}
.savedlg input{background:var(--bg);border:1px solid var(--line);color:var(--fg);padding:8px 10px;border-radius:3px;font:inherit}
.savedlg input:focus{outline:none;border-color:var(--accent)}
.savedlg .row{display:flex;gap:6px;justify-content:flex-end}
.savedlg button{background:var(--panel2);border:1px solid var(--line);color:var(--fg);padding:8px 14px;border-radius:3px;cursor:pointer;font:inherit}
.savedlg button[type=submit]{background:var(--accent);color:var(--accent-ink);border-color:var(--accent);font-weight:700}
.savedlg button:disabled{opacity:.5;cursor:wait}
.savedlg .msg{min-height:1.4em;color:var(--mute);line-height:1.5;word-break:keep-all}
.savedlg .msg.err{color:var(--ng)}
.savedlg .msg a{color:var(--accent)}
.savedlg .hint{color:var(--dim);font-size:11.5px;line-height:1.5;margin:0}`;

function newId() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${Math.random().toString(36).slice(2, 6)}`;
}

function dialog() {
  const wrap = document.createElement('div');
  wrap.className = 'savedlg';
  wrap.innerHTML = `<form>
    <h3>스테이션 저장</h3>
    <p class="hint">지금 설정(제품·지그 수·파라미터·도포 포인트)으로 사이클 1회를 녹화해 저장합니다. 콘솔 2에서 이 이름으로 불러와 모니터링할 수 있습니다. 저장하면 현재 사이클은 리셋됩니다.</p>
    <label>이름<input name="name" maxlength="60" required autocomplete="off"></label>
    <label>저장 비밀번호<input name="password" type="password" required autocomplete="current-password"></label>
    <div class="msg"></div>
    <div class="row"><button type="button" data-close>닫기</button><button type="submit">저장</button></div>
  </form>`;
  document.body.appendChild(wrap);
  const form = wrap.querySelector('form'), msg = wrap.querySelector('.msg');
  try { form.password.value = sessionStorage.getItem('one-station-save-pw') || ''; } catch (e) {}
  const close = () => wrap.remove();
  wrap.querySelector('[data-close]').onclick = close;
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  form.name.focus();
  const say = (t, err) => { msg.innerHTML = t; msg.classList.toggle('err', !!err); };

  form.onsubmit = async e => {
    e.preventDefault();
    const name = form.name.value.trim(), password = form.password.value;
    if (!name) return;
    const buttons = form.querySelectorAll('button');
    buttons.forEach(b => b.disabled = true);
    try {
      // fail fast, before the recording, when the server cannot take saves
      const health = await fetch('api/health', { cache: 'no-store' }).then(r => r.json()).catch(() => ({}));
      if (!health.uploadMode) throw new Error('저장소(Vercel Blob)가 연결되지 않았습니다');
      if (!health.savePassword) throw new Error('SAVE_PASSWORD not configured');
      const chk = await fetch('api/saves', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'check', password }) });
      if (chk.status === 401) throw new Error('wrong password');
      if (!chk.ok) throw new Error('비밀번호 확인 실패 (' + chk.status + ')');
      say('사이클 녹화 중… (몇 초 걸립니다)');
      await new Promise(r => setTimeout(r, 60)); // let the message paint before the synchronous recording
      const { glb, timeline } = await window.StationExport.exportStation();
      say('업로드 중…');
      const blob = await import(BLOB_CLIENT), upload = health.uploadMode === 'presigned' ? blob.uploadPresigned : blob.upload;
      const id = newId(), clientPayload = JSON.stringify({ password });
      const put = (file, body, contentType) => upload(`saves/${id}/${file}`, body, { access: 'public', handleUploadUrl: 'api/upload', clientPayload, contentType, multipart: body.size > 5 * 1024 * 1024 });
      const P = timeline.panel, last = timeline.results[timeline.results.length - 1][1];
      const meta = { name, created: new Date().toISOString(), summary: {
        variant: P.variant, slots: P.slots, beadW: P.beadW, speed: P.speed, tol: P.tol, fault: P.fault, joints: P.joints,
        layout: P.layout,
        parts: timeline.parts, cycleTotal: timeline.cycleTotal, ok: last.filter(r => r.ok === true).length, ng: last.filter(r => r.ok === false).length
      } };
      await put('station.glb', new Blob([glb], { type: 'model/gltf-binary' }), 'model/gltf-binary');
      await put('timeline.json', new Blob([JSON.stringify(timeline)], { type: 'application/json' }), 'application/json');
      await put('meta.json', new Blob([JSON.stringify(meta)], { type: 'application/json' }), 'application/json'); // last: a save is listed once meta.json exists
      try { sessionStorage.setItem('one-station-save-pw', password); } catch (e) {}
      say(`저장됨: <b>${name.replace(/[<>&"]/g, '')}</b> — <a href="console2.html?save=${id}">콘솔 2에서 보기 →</a>`);
      form.querySelector('[type=submit]').hidden = true;
    } catch (err) {
      const m = String(err && err.message || err);
      say(/password/i.test(m) ? '비밀번호가 맞지 않습니다.' : /SAVE_PASSWORD/.test(m) ? '서버에 저장 비밀번호(SAVE_PASSWORD)가 설정되지 않았습니다.' : '저장 실패: ' + m, true);
    } finally {
      buttons.forEach(b => b.disabled = false);
    }
  };
}

const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
const btn = $('#saveStation');
if (btn) {
  btn.addEventListener('click', () => {
    const S = window.__station;
    if (!S || !(S.sim.phase === 'idle' || S.sim.phase === 'done')) return alert('사이클 중에는 저장할 수 없습니다');
    dialog();
  });
  // same busy rule as the START button
  setInterval(() => { const S = window.__station; btn.disabled = !!S && !(S.sim.phase === 'idle' || S.sim.phase === 'done'); }, 500);
}
