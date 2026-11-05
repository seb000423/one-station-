// ONE SIMULATION ↔ Quest 3: the headset shows what the desktop runs.
// The desktop ("VR 연결") makes a 6-digit code and a WebRTC offer; the headset opens /sim?vr=<code> and answers. The two
// swap only that offer / answer through api/vr.js, then talk directly (same Wi-Fi). Over the channel the desktop sends
//   1. its ONE BUILDER data (localStorage one.build.*), so the headset builds the same factory, then
//   2. its clock every 100 ms: { simT, playing, speed }.
// The run is deterministic (fixed 0.1 s steps, seeded random), so the headset steps its own copy to the desktop's time
// (sim-build.js follow): parts move on the headset exactly as on the desktop, nothing is streamed per part.
// If the link drops, the headset keeps running on its own from where it is.
(() => {
  'use strict';
  const API = '/api/vr', CHUNK = 12000;
  const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };   // address discovery only; data goes device to device
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const gathered = pc => new Promise(res => { if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, 4000); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); });
  const post = (code, kind, sdp) => fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, kind, sdp }) })
    .then(r => { if (!r.ok) return r.json().then(j => { throw new Error(j.error || r.status); }); });
  // wait for the other side's message (polled every 3 s, up to `min` minutes)
  async function wait(code, kind, min, stop) { const end = Date.now() + min * 60000;
    while (Date.now() < end && !stop()) { const r = await fetch(`${API}?code=${code}&kind=${kind}&t=${Date.now()}`, { cache: 'no-store' }); if (r.ok) return (await r.json()).sdp; await sleep(3000); }
    throw new Error('시간 초과'); }

  const builderData = () => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('one.build.')) o[k] = localStorage.getItem(k); } return o; };

  /* ---------------------------------------------------------------- desktop side */
  // host(onStatus) → { code, close() }; onStatus(state, text) with state 'wait' | 'open' | 'closed' | 'error'
  function host(onStatus) {
    const code = String(Math.floor(100000 + Math.random() * 900000)); let pc, dc, timer, stopped = false;
    const close = () => { stopped = true; clearInterval(timer); try { dc && dc.close(); pc && pc.close(); } catch (e) {} fetch(API, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }).catch(() => {}); };
    (async () => {
      pc = new RTCPeerConnection(ICE); dc = pc.createDataChannel('one-sim', { ordered: true });
      dc.onopen = () => {
        const s = JSON.stringify(builderData()), n = Math.ceil(s.length / CHUNK) || 1;
        for (let i = 0; i < n; i++) dc.send(JSON.stringify({ t: 'data', i, n, s: s.slice(i * CHUNK, (i + 1) * CHUNK) }));
        const clock = () => { const S = window.ONE_SIMB; if (S && dc.readyState === 'open') dc.send(JSON.stringify({ t: 'clk', simT: S.t, playing: S.playing, speed: S.speed })); };
        clock(); timer = setInterval(clock, 100);
        onStatus('open', 'Quest 연결됨'); fetch(API, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }).catch(() => {});
      };
      dc.onclose = () => { clearInterval(timer); if (!stopped) onStatus('closed', 'Quest 연결 끊김'); };
      await pc.setLocalDescription(await pc.createOffer()); await gathered(pc);
      await post(code, 'offer', pc.localDescription.sdp);
      onStatus('wait', `Quest 브라우저에서 ${location.host}/sim?vr=${code} 열기`);
      const sdp = await wait(code, 'answer', 10, () => stopped);
      await pc.setRemoteDescription({ type: 'answer', sdp });
    })().catch(e => { if (!stopped) onStatus('error', `연결 실패: ${e.message}`); });
    return { code, close };
  }

  /* ---------------------------------------------------------------- headset side */
  // join(code, onStatus) → Promise that resolves once the desktop's builder data is stored here (then the page builds
  // the factory); afterwards the desktop clock is passed to ONE_SIMB.follow.
  function join(code, onStatus) {
    return new Promise((resolve, reject) => { (async () => {
      onStatus('wait', `데스크톱 연결 중… 코드 ${code}`);
      const offer = await wait(code, 'offer', 5, () => false);
      const pc = new RTCPeerConnection(ICE); let parts = [], got = false, lastClk = null;
      const apply = () => { const S = window.ONE_SIMB; if (S && lastClk) S.follow(lastClk); };
      document.addEventListener('one-sim-ready', apply);
      pc.ondatachannel = ({ channel }) => {
        channel.onmessage = e => { const m = JSON.parse(e.data);
          if (m.t === 'data') { parts[m.i] = m.s; if (parts.filter(x => x !== undefined).length === m.n && !got) { got = true;
              const d = JSON.parse(parts.join('')); for (const k of Object.keys(localStorage)) if (k.startsWith('one.build.')) localStorage.removeItem(k);
              for (const [k, v] of Object.entries(d)) localStorage.setItem(k, v);
              onStatus('open', '데스크톱과 연결됨'); resolve(); } }
          else if (m.t === 'clk') { const now = performance.now();
            // the desktop's real pace (its frames may be slower than the nominal speed), measured between two messages
            // (smoothed, never above the nominal speed: two messages that arrive together must not look like a jump)
            const dt = lastClk ? (now - lastClk.wall) / 1000 : 0, inst = dt > 0.03 ? Math.max(0, (m.simT - lastClk.simT) / dt) : null;
            const rate = !m.playing ? 0 : Math.min(m.speed, inst == null ? (lastClk?.speed || m.speed) : lastClk && lastClk.speed ? lastClk.speed * 0.7 + inst * 0.3 : inst);
            lastClk = { simT: m.simT, playing: m.playing, speed: rate, wall: now }; apply(); } };
        channel.onclose = () => { const S = window.ONE_SIMB; if (S) S.follow(null); onStatus('closed', '데스크톱 연결 끊김 · 혼자 계속 재생'); };
      };
      await pc.setRemoteDescription({ type: 'offer', sdp: offer }); await pc.setLocalDescription(await pc.createAnswer()); await gathered(pc);
      await post(code, 'answer', pc.localDescription.sdp);
      setTimeout(() => { if (!got) reject(new Error('데스크톱과 직접 연결이 안 됩니다 (같은 Wi-Fi인지 확인)')); }, 30000);
    })().catch(reject); });
  }

  window.OneLink = { host, join };
})();
