import './save-edit.js';
// Console 1 factory 저장 / 불러오기. 저장 records every station cell of the factory built in
// js/factory-builder.js and uploads station.glb + timeline.json + factory.json + meta.json to Vercel Blob
// under saves/<id>/ through api/upload (the GLB goes straight to Blob). 불러오기 lists the saves
// (api/saves) and reopens one in the builder; older one-station saves become a one-cell factory. It also
// lists the bundled example layouts in assets/layouts/ (index.json).
const BLOB_CLIENT = 'https://cdn.jsdelivr.net/npm/@vercel/blob@2.8.1/dist/client.js/+esm';
const $ = q => document.querySelector(q);

const css = `
#saveStation,#loadFactory{margin-top:6px;background:var(--panel2);border:1px solid var(--line);color:var(--fg);padding:10px;border-radius:3px;cursor:pointer;font-weight:600;letter-spacing:.08em}
#saveStation:hover,#loadFactory:hover{border-color:var(--accent);color:var(--accent)}
#saveStation:disabled,#loadFactory:disabled{opacity:.4;cursor:wait}
.saverow{display:grid;grid-template-columns:1fr auto;gap:6px}
.savedlg{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;z-index:50;padding:16px}
.savedlg form{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:18px 20px;width:min(420px,100%);display:grid;gap:10px;font-size:13px;max-height:90vh;overflow:auto}
.savedlg h3{margin:0;font-size:14px}
.savedlg label{display:grid;gap:4px;color:var(--mute);font-size:12px}
.savedlg input,.savedlg textarea{background:var(--bg);border:1px solid var(--line);color:var(--fg);padding:8px 10px;border-radius:3px;font:inherit}
.savedlg input:focus,.savedlg textarea:focus{outline:none;border-color:var(--accent)}
.savedlg .row{display:flex;gap:6px;justify-content:flex-end}
.savedlg button{background:var(--panel2);border:1px solid var(--line);color:var(--fg);padding:8px 14px;border-radius:3px;cursor:pointer;font:inherit}
.savedlg button[type=submit]{background:var(--accent);color:var(--accent-ink);border-color:var(--accent);font-weight:700}
.savedlg button:disabled{opacity:.5;cursor:wait}
.savedlg .msg{min-height:1.4em;color:var(--mute);line-height:1.5;word-break:keep-all}
.savedlg .msg.err{color:var(--ng)}
.savedlg .msg a{color:var(--accent)}
.savedlg .hint{color:var(--dim);font-size:11.5px;line-height:1.5;margin:0}
.savedlg .list{display:grid;gap:4px}
.savedlg .list button{display:grid;gap:2px;text-align:left;padding:8px 10px}
.savedlg .list button span{font-size:11px;color:var(--mute);font-family:var(--mono)}
.savedlg .list button span.note{font-family:inherit;color:var(--fg);opacity:.8;font-size:12px;line-height:1.45}
.savedlg textarea{resize:vertical;min-height:44px}
.savedlg .list .item{position:relative;display:grid}
.savedlg .list .item>button[data-id]{padding-right:40px}
.savedlg .list .item>button.edit{position:absolute;top:6px;right:6px;width:26px;height:26px;padding:0;display:grid;place-items:center;background:transparent;border-color:transparent;color:var(--mute);font-size:13px}
.savedlg .list .item>button.edit:hover{color:var(--accent);border-color:var(--accent)}`;

function newId() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${Math.random().toString(36).slice(2, 6)}`;
}
function overlay(html) {
  const wrap = document.createElement('div'); wrap.className = 'savedlg'; wrap.innerHTML = html; document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  const msg = wrap.querySelector('.msg'), say = (t, err) => { msg.innerHTML = t; msg.classList.toggle('err', !!err); };
  return { wrap, form: wrap.querySelector('form'), say, close };
}
const esc = t => String(t).replace(/[<>&"]/g, '');

function saveDialog() {
  const fb = window.FactoryBuilder, d = fb.doc(), cells = d.objects.filter(o => o.type === 'station').length;
  const { form, say } = overlay(`<form>
    <h3>팩토리 저장</h3>
    <p class="hint">공장 크기, 건물 요소 ${d.objects.length - cells}개, 원스테이션 셀 ${cells}개를 저장합니다. 셀마다 지금 설정으로 사이클 1회를 녹화합니다 (셀당 몇 초). ONE MONITOR에서 이 이름으로 불러와 모니터링하고, ONE BUILDER에서 다시 불러와 이어서 편집할 수 있습니다.</p>
    <label>이름<input name="name" maxlength="60" required autocomplete="off"></label>
    <label><span>설명 <small>(선택)</small></span><textarea name="note" maxlength="200" rows="2" placeholder="예: 셀 3개 · 레이저 용접 라인 1차안"></textarea></label>
    <label>저장 비밀번호<input name="password" type="password" required autocomplete="current-password"></label>
    <div class="msg"></div>
    <div class="row"><button type="button" data-close>닫기</button><button type="submit">저장</button></div>
  </form>`);
  try { form.password.value = sessionStorage.getItem('one-station-save-pw') || ''; } catch (e) {}
  form.name.focus();
  form.onsubmit = async e => {
    e.preventDefault();
    const name = form.name.value.trim(), note = form.note.value.trim(), password = form.password.value; if (!name) return;
    const buttons = form.querySelectorAll('button'); buttons.forEach(b => b.disabled = true);
    try {
      // fail fast, before recording, when the server cannot take saves
      const health = await fetch('api/health', { cache: 'no-store' }).then(r => r.json()).catch(() => ({}));
      if (!health.uploadMode) throw new Error('저장소(Vercel Blob)가 연결되지 않았습니다');
      if (!health.savePassword) throw new Error('SAVE_PASSWORD not configured');
      const chk = await fetch('api/saves', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'check', password }) });
      if (chk.status === 401) throw new Error('wrong password');
      if (!chk.ok) throw new Error('비밀번호 확인 실패 (' + chk.status + ')');
      const { glb, timeline, doc } = await fb.exportAll(t => say(t));
      say('업로드 중…');
      const blob = await import(BLOB_CLIENT), upload = health.uploadMode === 'presigned' ? blob.uploadPresigned : blob.upload;
      const id = newId(), clientPayload = JSON.stringify({ password });
      const put = (file, body, contentType) => upload(`saves/${id}/${file}`, body, { access: 'public', handleUploadUrl: 'api/upload', clientPayload, contentType, multipart: body.size > 5 * 1024 * 1024 });
      const json = o => new Blob([JSON.stringify(o)], { type: 'application/json' });
      const last = tl => { const r = tl.results; return r[r.length - 1][1]; };
      const cellSum = timeline.cells.map(c => ({ name: c.name, variant: c.timeline.panel.variant, slots: c.timeline.panel.slots, parts: c.timeline.parts, cycleTotal: c.timeline.cycleTotal, ok: last(c.timeline).filter(r => r.ok === true).length, ng: last(c.timeline).filter(r => r.ok === false).length }));
      const first = timeline.cells[0] && timeline.cells[0].timeline.panel;
      const meta = { name, note, created: new Date().toISOString(), kind: 'factory', summary: {
        factory: doc.factory, objects: doc.objects.length, cells: cellSum.length, cellSummary: cellSum,
        // the first cell's figures keep the older single-station list readable
        variant: first && first.variant, slots: first && first.slots, parts: cellSum[0] && cellSum[0].parts, cycleTotal: cellSum[0] && cellSum[0].cycleTotal,
        ok: cellSum.reduce((a, c) => a + c.ok, 0), ng: cellSum.reduce((a, c) => a + c.ng, 0), layout: { factory: doc.factory }
      } };
      await put('station.glb', new Blob([glb], { type: 'model/gltf-binary' }), 'model/gltf-binary');
      await put('timeline.json', json(timeline), 'application/json');
      await put('factory.json', json(doc), 'application/json');
      await put('meta.json', json(meta), 'application/json'); // last: a save is listed once meta.json exists
      try { sessionStorage.setItem('one-station-save-pw', password); } catch (e) {}
      say(`저장됨: <b>${esc(name)}</b> — <a href="console2.html?save=${id}">ONE MONITOR에서 보기 →</a>`);
      form.querySelector('[type=submit]').hidden = true;
    } catch (err) {
      const m = String(err && err.message || err);
      say(/password/i.test(m) ? '비밀번호가 맞지 않습니다.' : /SAVE_PASSWORD/.test(m) ? '서버에 저장 비밀번호(SAVE_PASSWORD)가 설정되지 않았습니다.' : '저장 실패: ' + m, true);
    } finally { buttons.forEach(b => b.disabled = false); }
  };
}

async function loadDialog() {
  const { form, say, close } = overlay(`<form>
    <h3>팩토리 불러오기</h3>
    <p class="hint">저장된 팩토리나 예제 배치를 열어 이어서 편집합니다. 지금 화면의 배치는 바뀌며, 되돌리기(Ctrl+Z)로 돌아올 수 있습니다.</p>
    <div class="list examples"></div>
    <div class="list saves"></div>
    <div class="msg">목록을 불러오는 중…</div>
    <div class="row"><button type="button" data-close>닫기</button></div>
  </form>`);
  // bundled example layouts (assets/layouts/index.json → [{ file, name, note }]), shown above the saves
  const ex = form.querySelector('.examples');
  let last = null; try { last = JSON.parse(localStorage.getItem('one-station-factory-v3.last') || 'null'); } catch (e) {}   // the workspace left in this browser (ONE BUILDER opens empty)
  fetch('assets/layouts/index.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : []).then(items => {
    if (last && last.objects && last.objects.length) items = [{ file: '', name: '이전 작업 (이 브라우저)', note: '마지막으로 편집하던 배치 · 객체 ' + last.objects.length + '개', last: true }].concat(items);
    if (!items.length) return;
    ex.innerHTML = '<h4 style="margin:0;font-size:12px;color:var(--mute)">예제</h4>' + items.map(x => `<button type="button" data-file="${esc(x.file)}"><b>${esc(x.name)}</b><span class="${x.last ? '' : 'note'}">${esc(x.note || '')}</span></button>`).join('');
    ex.querySelectorAll('[data-file]').forEach(b => b.onclick = async () => {
      if (!b.dataset.file && last) { window.FactoryBuilder.loadDoc(last); close(); return; }
      try { say('불러오는 중…'); const r = await fetch('assets/layouts/' + b.dataset.file, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); window.FactoryBuilder.loadDoc(await r.json()); close(); }
      catch (e) { say('예제 불러오기 실패: ' + e.message, true); }
    });
  }).catch(() => {});
  let saves = [];
  try { const r = await fetch('api/saves', { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); saves = (await r.json()).saves || []; }
  catch (e) { return say('저장 목록을 불러올 수 없습니다 (' + e.message + ')', true); }
  say(saves.length ? '' : '아직 저장본이 없습니다.');
  const list = form.querySelector('.saves');
  const render = () => { list.innerHTML = saves.map(s => { const m = s.summary || {}, f = m.factory || (m.layout && m.layout.factory); return `<div class="item"><button type="button" data-id="${s.id}"><b>${esc(s.name)}</b>${s.note ? `<span class="note">${esc(s.note)}</span>` : ''}<span>${[s.created && new Date(s.created).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }), s.kind === 'factory' ? (m.cells ? `원스테이션 셀 ${m.cells} · ` : '') + `객체 ${m.objects}` : '원스테이션 (이전 형식)', f && f.width + '×' + f.depth + 'm'].filter(Boolean).join(' · ')}</span></button><button type="button" class="edit" data-edit="${s.id}" title="이름 · 설명 수정" aria-label="${esc(s.name)} 수정">✎</button></div>`; }).join('');
  list.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => window.SaveEdit.open(b.parentElement, saves.find(x => x.id === b.dataset.edit), render));
  list.querySelectorAll('[data-id]').forEach(b => b.onclick = async () => {
    const s = saves.find(x => x.id === b.dataset.id);
    try {
      say('불러오는 중…');
      const doc = s.factory ? await (await fetch(s.factory, { cache: 'no-store' })).json() : window.FactoryBuilder.docFromLegacy(s);
      window.FactoryBuilder.loadDoc(doc); close();
    } catch (e) { say('불러오기 실패: ' + e.message, true); }
  });
  }; render();
}

const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
const btn = $('#saveStation');
if (btn) {
  btn.textContent = '팩토리 저장 · ONE MONITOR로 보내기';
  const row = document.createElement('div'); row.className = 'saverow'; btn.replaceWith(row);
  const load = document.createElement('button'); load.type = 'button'; load.id = 'loadFactory'; load.textContent = '불러오기';
  row.append(btn, load);
  const ready = () => { const fb = window.FactoryBuilder; return fb && !fb.busy(); };
  btn.addEventListener('click', () => { if (!ready()) return alert('사이클 중에는 저장할 수 없습니다'); saveDialog(); });
  load.addEventListener('click', () => { if (!ready()) return alert('사이클 중에는 불러올 수 없습니다'); loadDialog(); });
  setInterval(() => { const off = !ready(); btn.disabled = off; load.disabled = off; }, 500);
}
