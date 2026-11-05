// Pages opened from WhatsApp links: toolbox talks (/t/TOKEN), job packs (/j/TOKEN) and daily site diaries (/d/TOKEN).
const BRAND = {};
(() => {
  const app = document.getElementById('app');
  const [MODE, TOKEN] = location.pathname.split('/').filter(Boolean);
  const KEY = 'portal_who';
  let me = null; // { name, phone, token }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = sel => app.querySelector(sel);
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } },
    clear() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } },
  };

  async function api(path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (me && me.token) headers['x-op-token'] = me.token;
    const qs = me && !me.token ? `${path.includes('?') ? '&' : '?'}name=${encodeURIComponent(me.name)}&phone=${encodeURIComponent(me.phone)}` : '';
    const send = body ? { name: me && me.name, phone: me && me.phone, ...body } : undefined;
    const res = await fetch('/api/p' + path + (body ? '' : qs), { method: body ? 'POST' : 'GET', headers, body: send ? JSON.stringify(send) : undefined });
    let data = {};
    try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Check your signal and try again.');
    return data;
  }

  function render(html) { app.innerHTML = html; window.scrollTo(0, 0); }
  function head(title, sub) { document.getElementById('title').textContent = title; document.getElementById('sub').textContent = sub || ''; document.title = title; }
  function showErr(msg) {
    let n = $('.note.err');
    if (!n) { n = document.createElement('div'); n.className = 'note err'; const go = $('#go'); if (go) go.before(n); else app.prepend(n); }
    n.textContent = msg; n.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || 'Please wait'; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }
  const whoBar = () => `<div class="si-who"><div><b>${esc(me.name)}</b><span class="muted small">${esc(me.phone || '')}</span></div><button class="btn quiet" data-act="forget">Not you?</button></div>`;
  app.addEventListener('click', e => {
    if (e.target.closest('[data-act=forget]')) { store.clear(); me = null; identify(); }
  });

  function sigPad(canvas) {
    const ctx = canvas.getContext('2d');
    let drawing = false, dirty = false;
    const r0 = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = r0.width * dpr; canvas.height = r0.height * dpr;
    ctx.scale(dpr, dpr); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#18201b';
    const pt = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    canvas.addEventListener('pointerdown', e => { drawing = true; canvas.setPointerCapture(e.pointerId); const p = pt(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
    canvas.addEventListener('pointermove', e => { if (!drawing) return; const p = pt(e); ctx.lineTo(p.x, p.y); ctx.stroke(); dirty = true; });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => canvas.addEventListener(t, () => { drawing = false; }));
    return { clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); dirty = false; }, empty: () => !dirty, data: () => canvas.toDataURL('image/png') };
  }
  const sigBlock = `<label>Your signature</label><div class="sig-wrap"><canvas id="sig"></canvas></div>
    <p style="margin:0 0 1rem;text-align:right"><button class="btn quiet small" id="clr">Clear signature</button></p>`;
  function wireSig() { const pad = sigPad($('#sig')); $('#clr').onclick = () => pad.clear(); return pad; }

  function done(title, text) {
    render(`${whoBar()}<div class="si-done"><div class="tick" aria-hidden="true">&#10003;</div><h1>${esc(title)}</h1><p class="muted">${esc(text)}</p></div>
      ${MODE === 'j' ? '<button class="btn big ghost" id="back">Back to the job pack</button>' : MODE === 'd' ? '<button class="btn big ghost" id="back">Back to the diary</button>' : ''}`);
    if ($('#back')) $('#back').onclick = MODE === 'd' ? () => siteDiary() : jobPack;
  }

  // ---------- who are you ----------
  function identify() {
    head(MODE === 't' ? 'Toolbox talk' : MODE === 'd' ? 'Site diary' : 'Job pack', MODE === 'd' ? 'Daily record' : 'Sign-off');
    render(`<h1>${MODE === 'd' ? 'Who is filling this in?' : "Who's signing?"}</h1><p class="muted">Enter your name and mobile. You only do this once on this phone.</p>
      <div class="field"><label for="n">First name and surname</label><input id="n" autocomplete="name"></div>
      <div class="field"><label for="p">Mobile number</label><input id="p" type="tel" autocomplete="tel" inputmode="tel"></div>
      <button class="btn big" id="go">Continue</button>`);
    $('#go').onclick = async () => {
      const btn = $('#go'); busy(btn, true);
      try {
        const r = await api('/identify', { name: $('#n').value, phone: $('#p').value });
        me = { name: r.name, phone: r.phone, token: r.token || null };
        store.set(me);
        start();
      } catch (e) { busy(btn, false); showErr(e.message); }
    };
  }

  // ---------- toolbox talk ----------
  let talk = null;
  async function toolboxTalk() {
    const d = await api('/t/' + TOKEN);
    talk = d.talk;
    head(talk.title, talk.ref ? `Toolbox talk · ${talk.ref}` : 'Toolbox talk');
    if (d.signed) return done('Already signed', 'You have already signed this toolbox talk. Nothing more to do.');
    if (talk.closed) return render(`${whoBar()}<div class="note warn">This toolbox talk has been closed. Ask the office if you still need to sign it.</div>`);
    onePage();
  }

  // One page: the whole talk, then the sign-off at the bottom (the standard Safety Simplified toolbox talk format).
  function onePage(wrong = []) {
    const qs = talk.questions || [];
    const num = n => `<span class="tbt-num">${n}</span>`;
    document.querySelector('.si-head').style.display = 'none';
    render(`<article class="tbt">
      <div class="tbt-hero"><p class="tbt-ref">${esc(BRAND.name || '')} · Toolbox talk · ${esc(talk.ref || '')}</p><h1>${esc(talk.title)}</h1>
        <p class="tbt-sub">Read the talk, then sign at the bottom to record completion.</p></div>
      ${whoBar()}
      ${talk.intro ? `<section class="tbt-sec">${num(1)}<h2>Why we are having this talk</h2><div class="body">${esc(talk.intro)}</div></section>` : ''}
      ${talk.sections.map((s, i) => `<section class="tbt-sec">${num(i + (talk.intro ? 2 : 1))}${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}<div class="body">${esc(s.body)}</div></section>`).join('')}
      ${qs.length ? `<section class="tbt-sec">${num(talk.sections.length + (talk.intro ? 2 : 1))}<h2>Check your understanding</h2>
        ${wrong.length ? `<div class="note err">${wrong.length === 1 ? 'One answer is' : `${wrong.length} answers are`} not right. Have another look and try again.</div>` : '<p class="muted">Every answer needs to be right to sign.</p>'}
        ${qs.map((x, i) => `<div class="quiz-q ${wrong.includes(i) ? 'wrong' : ''}"><b>${i + 1}. ${esc(x.question)}</b><div class="opts">
          ${x.options.map((o, j) => `<label><input type="radio" name="q${i}" value="${j}"> ${esc(o)}</label>`).join('')}</div></div>`).join('')}</section>` : ''}
      <section class="tbt-sec tbt-sign">${num(talk.sections.length + (talk.intro ? 2 : 1) + (qs.length ? 1 : 0))}<h2>Sign-off</h2>
        <p class="muted">I confirm I have read and understood this toolbox talk and will apply it in my work.</p>
        ${sigBlock}<button class="btn big" id="go">Sign off toolbox talk</button></section>
      <p class="tbt-foot">${esc(talk.ref || '')} · Prepared by Safety Simplified Ltd for ${esc(BRAND.name || '')}</p>
    </article>`);
    const pad = wireSig();
    let attempt = 1;
    $('#go').onclick = async () => {
      const a = qs.map((_, i) => { const el = app.querySelector(`input[name=q${i}]:checked`); return el ? Number(el.value) : null; });
      if (a.some(v => v === null)) return showErr('Answer every question.');
      if (pad.empty()) return showErr('Sign in the box first.');
      const btn = $('#go'); busy(btn, true, 'Sending');
      try {
        if (qs.length) { const c = await api(`/t/${TOKEN}/check`, { answers: a }); if (c.wrong.length) { attempt++; busy(btn, false); return showWrong(c.wrong); } }
        const r = await api(`/t/${TOKEN}/sign`, { answers: a, signature: pad.data(), attempts: attempt });
        if (r.ok === false) { attempt++; busy(btn, false); return showWrong(r.wrong); }
        done('Signed', 'Thanks. Your signature has been recorded.');
      } catch (e) { busy(btn, false); showErr(e.message); }
    };
    function showWrong(w) {
      app.querySelectorAll('.quiz-q').forEach((el, i) => el.classList.toggle('wrong', w.includes(i)));
      showErr(`${w.length === 1 ? 'One answer is' : `${w.length} answers are`} not right. Have another look and try again.`);
      const first = app.querySelector('.quiz-q.wrong'); if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function quiz(answers, attempt, wrong = []) {
    if (!talk.questions.length) return signTalk([], attempt);
    render(`${whoBar()}<h1>Check your understanding</h1>
      ${wrong.length ? `<div class="note err">${wrong.length === 1 ? 'One answer is' : `${wrong.length} answers are`} not right. Have another look and try again.</div>` : '<p class="muted">Every answer needs to be right to sign.</p>'}
      ${talk.questions.map((x, i) => `<div class="quiz-q ${wrong.includes(i) ? 'wrong' : ''}"><b>${i + 1}. ${esc(x.question)}</b><div class="opts">
        ${x.options.map((o, j) => `<label><input type="radio" name="q${i}" value="${j}" ${answers[i] === j && !wrong.includes(i) ? 'checked' : ''}> ${esc(o)}</label>`).join('')}</div></div>`).join('')}
      <button class="btn big" id="go">Check answers</button>`);
    $('#go').onclick = () => {
      const a = talk.questions.map((_, i) => { const el = app.querySelector(`input[name=q${i}]:checked`); return el ? Number(el.value) : null; });
      if (a.some(v => v === null)) return showErr('Answer every question.');
      api(`/t/${TOKEN}/check`, { answers: a }).then(r => (r.wrong.length ? quiz(a, attempt + 1, r.wrong) : signTalk(a, attempt))).catch(e => showErr(e.message));
    };
  }

  function signTalk(answers, attempt) {
    render(`${whoBar()}<h1>Sign to confirm</h1><p class="muted">By signing you confirm you have read and understood this toolbox talk and will follow it.</p>
      ${sigBlock}<button class="btn big" id="go">Sign</button>`);
    const pad = wireSig();
    $('#go').onclick = async () => {
      if (pad.empty()) return showErr('Sign in the box first.');
      const btn = $('#go'); busy(btn, true, 'Sending');
      try {
        const r = await api(`/t/${TOKEN}/sign`, { answers, signature: pad.data(), attempts: attempt });
        if (r.ok === false) return quiz(answers, attempt + 1, r.wrong);
        done('Signed', 'Thanks. Your signature has been recorded.');
      } catch (e) { busy(btn, false); showErr(e.message); }
    };
  }

  // ---------- job pack ----------
  let pack = null;
  async function jobPack() {
    pack = await api('/j/' + TOKEN);
    head(pack.job.name, ['Job pack', pack.job.ref].filter(Boolean).join(' · '));
    const docs = pack.documents;
    const toSign = docs.filter(d => d.requires_signoff && !d.signed).length;
    const KIND = { rams: 'RAMS', permit: 'Permit', plan: 'Drawing / plan', other: 'Document', briefing: 'Site briefing' };
    render(`${whoBar()}
      ${docs.length ? (toSign ? `<div class="note warn">${toSign} document${toSign === 1 ? '' : 's'} to read and sign.</div>` : '<div class="note ok">You have signed everything for this job.</div>') : '<div class="note info">No documents have been added to this job yet.</div>'}
      ${docs.map(d => `<div class="doc-card ${!d.requires_signoff ? 'info' : d.signed ? 'done' : ''}"><div><span class="k">${KIND[d.kind] || 'Document'}${d.revision ? ` · rev ${esc(d.revision)}` : ''}</span><b>${esc(d.title)}</b>
          ${d.requires_signoff ? (d.signed ? '<span class="pill yes">Signed</span>' : '<span class="pill no">Not signed</span>') : '<span class="pill grey">Read only</span>'}</div>
        ${d.requires_signoff && !d.signed ? `<button class="btn" data-doc="${d.id}">${d.content ? 'Read &amp; confirm' : 'Read &amp; sign'}</button>` : d.content ? '' : `<a class="btn ghost" href="/api/p/j/${TOKEN}/doc/${d.id}" target="_blank" rel="noopener">Open</a>`}</div>`).join('')}`);
    app.querySelectorAll('[data-doc]').forEach(b => (b.onclick = () => signDoc(docs.find(d => String(d.id) === b.dataset.doc))));
  }

  function signDoc(d) {
    const rams = d.content ? (pack.documents || []).find(x => x.kind === 'rams') : null;
    render(`${whoBar()}<h1>${esc(d.title)}</h1><p class="muted">${[d.reference, d.revision && `Issue ${d.revision}`].filter(Boolean).map(esc).join(', ')}</p>
      ${d.content ? `<div class="ind-section"><div class="body">${esc(d.content)}</div></div>
        ${rams ? `<a class="btn big ghost" href="/api/p/j/${TOKEN}/doc/${rams.id}" target="_blank" rel="noopener">Open the full RAMS</a>` : ''}
        <p class="small muted" style="margin:.6rem 0 1.2rem">If anything about this site is unclear, ask your supervisor before you start.</p>
        <label class="check" style="margin-bottom:1rem"><input type="checkbox" id="ok"> I have been briefed on this site, have read the RAMS and will work to them.</label>`
      : `<a class="btn big ghost" href="/api/p/j/${TOKEN}/doc/${d.id}" target="_blank" rel="noopener" id="open">Open the document</a>
      <p class="small muted" style="margin:.6rem 0 1.2rem">Read it all the way through. If anything is unclear, ask your supervisor before you start.</p>
      <label class="check" style="margin-bottom:1rem"><input type="checkbox" id="ok"> I have read and understood this document and will work to it.</label>`}
      ${sigBlock}<button class="btn big" id="go">Sign</button>
      <p class="link-row"><button class="btn quiet" id="back">Back to the job pack</button></p>`);
    const pad = wireSig();
    $('#back').onclick = jobPack;
    $('#go').onclick = async () => {
      if (!$('#ok').checked) return showErr('Tick the box to confirm you have read it.');
      if (pad.empty()) return showErr('Sign in the box first.');
      const btn = $('#go'); busy(btn, true, 'Sending');
      try { await api(`/j/${TOKEN}/doc/${d.id}/sign`, { signature: pad.data() }); done(d.content ? 'Briefed' : 'Signed', d.content ? 'Your site briefing is recorded. Thanks.' : `${d.title} is signed.`); }
      catch (e) { busy(btn, false); showErr(e.message); }
    };
  }

  // ---------- daily site diary ----------
  // Dictation into a textarea with the browser's own speech recognition (Chrome on Android, Safari on iPhone). Hidden where unsupported.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  let rec = null, recBtn = null;
  function dictate(btn) {
    const ta = document.getElementById(btn.dataset.mic);
    if (rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = 'en-GB'; rec.continuous = true; rec.interimResults = true;
    recBtn = btn; btn.classList.add('rec'); btn.textContent = 'Stop';
    let finalText = '', base = ta.value;
    rec.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) finalText += t + ' '; else interim += t; }
      ta.value = (base ? base.replace(/\s*$/, '') + (finalText || interim ? '\n' : '') : '') + (finalText + interim).replace(/^\s+/, '').replace(/^./, c => c.toUpperCase());
    };
    const stop = () => { if (recBtn) { recBtn.classList.remove('rec'); recBtn.textContent = 'Dictate'; } rec = null; recBtn = null; };
    rec.onend = stop; rec.onerror = ev => { stop(); if (ev.error === 'not-allowed') showErr('Allow microphone access to dictate, or just type.'); };
    try { rec.start(); } catch { stop(); }
  }
  app.addEventListener('click', e => { const b = e.target.closest('[data-mic]'); if (b && SR) dictate(b); });
  // Ticking someone fills in a standard day; typing hours ticks them.
  app.addEventListener('change', e => {
    const r = e.target.closest('.lab-row[data-op]'); if (!r) return;
    const cb = r.querySelector('input[type=checkbox]'), h = r.querySelector('input[type=number]');
    if (e.target === cb && cb.checked && !h.value) h.value = 8;
    if (e.target === h && h.value) cb.checked = true;
  });

  // Photos are shrunk on the phone before sending (longest side 1400px, JPEG) so a day's photos are a few hundred KB each at most.
  function shrink(file) {
    return new Promise(resolve => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1400, sc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', .8));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  async function siteDiary(date) {
    const d = await api('/d/' + TOKEN + (date ? `?date=${date}` : ''));
    head(d.job.name, ['Site diary', d.job.ref].filter(Boolean).join(' · '));
    const ex = d.diary; const L = d.labels;
    const longDate = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
    const labour = ex ? ex.labour : (d.last && d.last.labour ? d.last.labour.map(l => ({ ...l, hours: null })) : d.people.filter(p => p.on_team).map(p => ({ name: p.name, role: p.role || '', hours: null, operative_id: p.id })));
    const onList = new Map(labour.map(l => [l.operative_id || l.name.toLowerCase(), l]));
    const person = p => { const l = onList.get(p.id) || onList.get(p.name.toLowerCase()); return `<div class="lab-row" data-op="${p.id}" data-name="${esc(p.name)}" data-role="${esc(p.role || '')}"><label class="check"><input type="checkbox" ${l ? 'checked' : ''}> <span><b>${esc(p.name)}</b> <span class="hint">${esc(p.role || '')}</span></span></label><input type="number" inputmode="decimal" step="0.5" min="0" max="24" placeholder="hrs" value="${l && l.hours != null ? l.hours : ''}" aria-label="Hours for ${esc(p.name)}"></div>`; };
    const extras = labour.filter(l => !l.operative_id && !d.people.some(p => p.name.toLowerCase() === l.name.toLowerCase()));
    const ta = (k, rows = 3, ph = '', bare = false) => `<div class="field">${bare ? '' : `<label for="f_${k}">${esc(L[k])}</label>`}<textarea id="f_${k}" rows="${rows}" placeholder="${esc(ph)}">${esc(ex ? ex[k] || '' : (k === 'plant' && d.last ? d.last.plant || '' : ''))}</textarea>
      ${SR ? `<div class="mic-row"><button type="button" class="btn small ghost" data-mic="f_${k}">Dictate</button></div>` : ''}</div>`;
    let newPhotos = []; const removed = new Set();
    const photoList = () => `${(ex ? ex.photos : []).filter(p => !removed.has(p.id)).map(p => `<figure class="ph"><img src="/api/p/d/${TOKEN}/photo/${p.id}" alt=""><figcaption>${esc(p.caption || '')}</figcaption><button type="button" class="btn small quiet" data-rm="${p.id}">Remove</button></figure>`).join('')}
      ${newPhotos.map((p, i) => `<figure class="ph"><img src="${p.data}" alt=""><input placeholder="Caption (optional)" value="${esc(p.caption || '')}" data-cap="${i}"><button type="button" class="btn small quiet" data-rmn="${i}">Remove</button></figure>`).join('')}`;
    render(`${whoBar()}
      <div class="diary-day"><div><span class="k">Diary for</span><b>${longDate(d.date)}</b></div><input type="date" id="dd" value="${d.date}" min="${d.earliest}" max="${d.today}"></div>
      ${ex ? `<div class="note info">You already sent a diary for this day${ex.submitted_at ? ` at ${new Date(ex.submitted_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}. Change anything below and send it again to update it.</div>` : ''}
      <section class="ind-section"><h2>The day</h2>
        <div class="field"><label for="wx">Weather</label><select id="wx"><option value="">Choose</option>${d.weather.map(w => `<option ${ex && ex.weather === w ? 'selected' : ''}>${w}</option>`).join('')}</select></div>
        ${ta('conditions', 2, 'Ground, access, anything that affected the day')}</section>
      <section class="ind-section"><h2>Labour on site</h2><p class="muted small">Tick who was on site and put their hours in.${d.last && !ex ? ` Pre-filled from the last diary (${longDate(d.last.diary_date)}).` : ''}</p>
        <div class="lab-list">${d.people.filter(p => p.on_team).map(person).join('')}
          ${d.people.some(p => !p.on_team) ? `<details><summary class="small muted">Everyone else on the register</summary>${d.people.filter(p => !p.on_team).map(person).join('')}</details>` : ''}
          <div id="extras">${extras.map(l => `<div class="lab-row extra"><input placeholder="Name" value="${esc(l.name)}" class="xn"><input placeholder="Role" value="${esc(l.role || '')}" class="xr"><input type="number" inputmode="decimal" step="0.5" placeholder="hrs" value="${l.hours != null ? l.hours : ''}" class="xh"></div>`).join('')}</div>
          <button type="button" class="btn small ghost" id="addx">Add someone not on the list</button></div></section>
      <section class="ind-section"><h2>Plant and equipment</h2>${ta('plant', 2, 'Towers, podiums, MEWPs, welding sets, pipe threaders, hired kit', true)}</section>
      <section class="ind-section"><h2>Work carried out</h2>${ta('work_done', 5, 'What was done today, where, and how far it got', true)}</section>
      <section class="ind-section"><h2>Deliveries and visitors</h2>${ta('deliveries', 2, 'What arrived, from whom, anything short or damaged')}${ta('visitors', 2, 'Client, PC, inspectors, anyone who came to look')}</section>
      <section class="ind-section"><h2>Delays and instructions</h2>${ta('delays', 3, 'Waiting on others, access, weather, design issues, time lost')}${ta('instructions', 3, 'Any instruction or change given on site, by whom, and what it means for the job')}</section>
      <section class="ind-section"><h2>Health and safety</h2>${ta('safety', 3, 'Toolbox talks given, inspections, near misses, first aid, permits, anything raised', true)}</section>
      <section class="ind-section"><h2>Planned for tomorrow</h2>${ta('tomorrow', 2, '', true)}</section>
      <section class="ind-section"><h2>Photos</h2><p class="muted small">Progress, deliveries, problems: anything worth having on record.</p>
        <div class="ph-grid" id="phs">${photoList()}</div>
        <label class="btn ghost" style="width:100%;margin-top:.5rem"><input type="file" accept="image/*" multiple id="pf" class="hidden"> Add photos</label></section>
      <section class="ind-section"><h2>Sign and send</h2><p class="muted small">${ex ? 'Signing again is optional when updating.' : 'Your signature confirms this is a true record of the day.'}</p>
        ${sigBlock}<button class="btn big" id="go">${ex ? 'Update diary' : 'Send diary'}</button></section>`);
    const pad = wireSig();
    $('#dd').onchange = e => siteDiary(e.target.value).catch(err => showErr(err.message));
    $('#addx').onclick = () => { $('#extras').insertAdjacentHTML('beforeend', '<div class="lab-row extra"><input placeholder="Name" class="xn"><input placeholder="Role" class="xr"><input type="number" inputmode="decimal" step="0.5" placeholder="hrs" class="xh"></div>'); $('#extras .lab-row:last-child .xn').focus(); };
    const redraw = () => { $('#phs').innerHTML = photoList(); };
    $('#pf').onchange = async e => {
      for (const f of [...e.target.files].slice(0, 12 - newPhotos.length)) { const data = await shrink(f); if (data) newPhotos.push({ data, caption: '' }); }
      e.target.value = ''; redraw();
    };
    $('#phs').addEventListener('click', e => {
      const rm = e.target.closest('[data-rm]'); if (rm) { removed.add(Number(rm.dataset.rm)); redraw(); }
      const rn = e.target.closest('[data-rmn]'); if (rn) { newPhotos.splice(Number(rn.dataset.rmn), 1); redraw(); }
    });
    $('#phs').addEventListener('input', e => { if (e.target.dataset.cap != null) newPhotos[Number(e.target.dataset.cap)].caption = e.target.value; });
    $('#go').onclick = async () => {
      const lab = [...app.querySelectorAll('.lab-row[data-op]')].filter(r => r.querySelector('input[type=checkbox]').checked)
        .map(r => ({ name: r.dataset.name, role: r.dataset.role, hours: r.querySelector('input[type=number]').value, operative_id: Number(r.dataset.op) }));
      app.querySelectorAll('.lab-row.extra').forEach(r => { if (r.querySelector('.xn').value.trim()) lab.push({ name: r.querySelector('.xn').value, role: r.querySelector('.xr').value, hours: r.querySelector('.xh').value }); });
      const body = { diary_date: $('#dd').value, weather: $('#wx').value, labour: lab, photos: newPhotos, remove_photos: [...removed] };
      ['conditions', 'plant', 'work_done', 'deliveries', 'visitors', 'delays', 'instructions', 'safety', 'tomorrow'].forEach(k => (body[k] = $('#f_' + k).value));
      if (!body.work_done.trim()) return showErr('Say what work was carried out today, even if it was none.');
      if (!ex && pad.empty()) return showErr('Sign in the box to send the diary.');
      if (!pad.empty()) body.signature = pad.data();
      const btn = $('#go'); busy(btn, true, 'Sending');
      try { await api(`/d/${TOKEN}/save`, body); done(ex ? 'Diary updated' : 'Diary sent', `${longDate(body.diary_date)} is on record for ${d.job.name}. Thanks.`); }
      catch (err) { busy(btn, false); showErr(err.message); }
    };
  }

  // ---------- start ----------
  function start() {
    const go = MODE === 't' ? toolboxTalk : MODE === 'd' ? siteDiary : jobPack;
    go().catch(e => render(`<div class="note err">${esc(e.message)}</div>`));
  }
  fetch('/api/p/brand').then(r => r.json()).then(b => { Object.assign(BRAND, b); document.getElementById('logo').alt = b.name; }).catch(() => {});
  me = store.get();
  if (!me || !me.name) identify(); else start();
})();
