// app.js: screens, saving data on the phone, and adding slips.
(() => {
  const { parseSlip, guessCategory } = window.SlipParser;

  // ---------- SETTINGS ----------
  const CATS = [
    { id: 'Food', i: '🍜', col: 'var(--c1)' },
    { id: 'Transport', i: '🚆', col: 'var(--c2)' },
    { id: 'Shopping', i: '🛒', col: 'var(--c3)' },
    { id: 'Bills', i: '💡', col: 'var(--c5)' },
    { id: 'Other', i: '✨', col: 'var(--c4)' },
  ];
  const DAILY_BUDGET = 800, MONTHLY_BUDGET = 20000;
  const TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

  // ---------- HELPERS ----------
  const $ = id => document.getElementById(id);
  const catOf = id => CATS.find(c => c.id === id) || CATS[CATS.length - 1];
  const round2 = n => Math.round(n * 100) / 100;
  const sum = a => a.reduce((s, x) => s + x, 0);
  const baht = n => { n = round2(n); return '฿' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const startOfDay = d => { d = new Date(d); d.setHours(0, 0, 0, 0); return d; };
  const addDays = (d, n) => { d = new Date(d); d.setDate(d.getDate() + n); return d; };
  const fmt = (d, o) => new Date(d).toLocaleDateString('en-GB', o);
  const time = d => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  // ---------- SAVED DATA (only on this phone) ----------
  const store = {
    load(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };
  let txs = store.load('satang-tx', []);          // { id, amount, ts, name, cat, src: 'slip'|'cash', ref }
  let learned = store.load('satang-learned', {}); // name → category you picked
  function persist() {
    if (!(store.save('satang-tx', txs) && store.save('satang-learned', learned)))
      toast("Couldn't save on this device. Try adding the app to your Home Screen.", 'warn');
  }
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}

  const totalBetween = (from, to) => round2(sum(txs.filter(t => t.ts >= from && t.ts < to).map(t => t.amount)));
  const dailyTotals = (from, n) => Array.from({ length: n }, (_, i) => totalBetween(addDays(from, i).getTime(), addDays(from, i + 1).getTime()));
  const catTotals = (from, to) => CATS.map(c => ({ ...c, a: round2(sum(txs.filter(t => t.ts >= from && t.ts < to && catOf(t.cat).id === c.id).map(t => t.amount))) }));

  // ---------- TOAST ----------
  let toastTimer;
  function toast(msg, kind = 'ok', sticky = false) {
    const el = $('toast'); clearTimeout(toastTimer);
    el.className = 'toast ' + kind; el.hidden = false;
    el.innerHTML = `<span class="tick">${kind === 'busy' ? '<span class="spin"></span>' : kind === 'warn' ? '!' : '✓'}</span><span>${esc(msg)}</span>`;
    if (!sticky) toastTimer = setTimeout(() => { el.hidden = true; }, 6000);
  }

  // ---------- CHARTS ----------
  function donut(cats, total) {
    let html = `<circle cx="80" cy="80" r="62" fill="none" stroke="var(--card2)" stroke-width="18"/>`;
    if (total > 0) {
      let off = 0; const used = cats.filter(c => c.a > 0), gap = used.length > 1 ? 1.6 : 0;
      used.forEach(c => {
        const pct = c.a / total * 100;
        html += `<circle cx="80" cy="80" r="62" fill="none" pathLength="100" stroke="${c.col}" stroke-width="18"
          stroke-dasharray="${Math.max(pct - gap, 0.5)} ${100 - pct + gap}" stroke-dashoffset="${-off}"/>`;
        off += pct;
      });
    }
    $('donut').innerHTML = html;
  }

  let gid = 0;
  function area(svg, v) {
    if (v.length < 2) v = [0, ...v];
    const W = 320, H = 150, top = 30, bot = 10, max = Math.max(...v, 1) * 1.05;
    const pts = v.map((x, i) => [i * (W / (v.length - 1)), top + (H - top - bot) * (1 - x / max)]);
    let d = `M${pts[0]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += ` C${[p1[0] + (p2[0] - p0[0]) / 6, Math.min(H - bot, p1[1] + (p2[1] - p0[1]) / 6)]} ${[p2[0] - (p3[0] - p1[0]) / 6, Math.min(H - bot, p2[1] - (p3[1] - p1[1]) / 6)]} ${p2}`;
    }
    const last = pts[pts.length - 1], id = 'g' + (gid++);
    const avgY = top + (H - top - bot) * (1 - (sum(v) / v.length) / max);
    svg.innerHTML = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style="stop-color:var(--chart);stop-opacity:.45"/><stop offset="1" style="stop-color:var(--chart);stop-opacity:0"/></linearGradient></defs>
      <line x1="0" x2="${W}" y1="${avgY}" y2="${avgY}" stroke="var(--chart)" stroke-opacity=".5" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>
      <path d="${d} L${W},${H} L0,${H} Z" fill="url(#${id})"/>
      <path d="${d}" fill="none" stroke="var(--chart)" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
      <line x1="${last[0]}" x2="${last[0]}" y1="${last[1]}" y2="${H}" stroke="var(--chart)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="5" fill="var(--chart)" stroke="var(--card)" stroke-width="3"/>
      <g transform="translate(${last[0] - 62},${Math.max(last[1] - 34, 0)})"><rect width="58" height="22" rx="11" fill="var(--text)"/>
        <text x="29" y="15" text-anchor="middle" font-size="11" font-weight="600" fill="var(--bg)" font-family="Inter,sans-serif">${baht(Math.round(v[v.length - 1]))}</text></g>`;
  }
  const days = (el, labels) => { el.innerHTML = labels.map((l, i) => `<span class="${i === labels.length - 1 ? 'now' : ''}">${l}</span>`).join(''); };

  // ---------- RENDER ----------
  let showAll = false, range = 'week';

  function row(t) {
    const c = catOf(t.cat), when = showAll ? fmt(t.ts, { day: 'numeric', month: 'short' }) + ' · ' : '';
    return `<li data-id="${t.id}"><div class="ico">${c.i}</div>
      <div class="info"><b>${esc(t.name)}</b><small>${c.id} · ${when}${time(t.ts)}</small></div>
      <div class="amt">-${baht(t.amount)}<small>${t.src === 'cash' ? 'Cash' : 'K PLUS slip'}</small></div></li>`;
  }

  function render() {
    const now = new Date(), t0 = startOfDay(now), t1 = addDays(t0, 1), h = now.getHours();
    $('greeting').textContent = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    $('clock').textContent = time(now);

    // hero: today
    const today = totalBetween(t0.getTime(), t1.getTime());
    const [ip, dp] = today.toFixed(2).split('.');
    $('heroLabel').textContent = 'Spent today · ' + fmt(now, { weekday: 'short', day: 'numeric', month: 'short' });
    $('heroBig').innerHTML = '฿' + Number(ip).toLocaleString('en-US') + '<span>.' + dp + '</span>';
    const left = round2(DAILY_BUDGET - today), w7 = totalBetween(addDays(t0, -6).getTime(), t1.getTime());
    $('heroPills').innerHTML = `<span class="p">${left >= 0 ? '↓ ' + baht(left) + ' left today' : '↑ ' + baht(-left) + ' over budget'}</span><span class="p">7 days ${baht(w7)}</span>`;
    $('budgetBar').style.width = Math.min(100, today / DAILY_BUDGET * 100) + '%';
    $('budgetText').textContent = `${baht(today)} of your ${baht(DAILY_BUDGET)} daily budget`;

    // month donut
    const m0 = new Date(now.getFullYear(), now.getMonth(), 1), m1 = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const mc = catTotals(m0.getTime(), m1.getTime()), mTotal = round2(sum(mc.map(c => c.a)));
    const monthName = fmt(now, { month: 'long' });
    $('monthName').textContent = monthName; $('catMonth').textContent = monthName;
    donut(mc, mTotal);
    $('donutTotal').textContent = baht(Math.round(mTotal));
    $('donutOf').textContent = 'of ' + baht(MONTHLY_BUDGET);
    $('donutPct').textContent = Math.round(mTotal / MONTHLY_BUDGET * 100) + '% used';
    const used = mc.filter(c => c.a > 0);
    $('legend').innerHTML = used.length
      ? used.map(c => `<span class="chip"><i style="background:${c.col}"></i>${c.id} ${Math.round(c.a / mTotal * 100)}%</span>`).join('')
      : '<span class="muted" style="font-size:13px">No spending yet this month</span>';

    // last 7 days
    const wFrom = addDays(t0, -6), wv = dailyTotals(wFrom, 7);
    area($('weekChart'), wv);
    days($('weekDays'), wv.map((_, i) => fmt(addDays(wFrom, i), { weekday: 'short' })));
    $('weekAvg').textContent = 'avg ' + baht(Math.round(sum(wv) / 7)) + '/day';

    // list
    const list = showAll
      ? [...txs].sort((a, b) => b.ts - a.ts).slice(0, 60)
      : txs.filter(t => t.ts >= t0.getTime() && t.ts < t1.getTime()).sort((a, b) => b.ts - a.ts);
    $('listTitle').textContent = showAll ? 'Recent' : 'Today';
    $('seeAll').textContent = showAll ? 'Today only' : 'See all';
    $('txList').innerHTML = list.length ? list.map(row).join('')
      : `<li class="empty">${showAll ? 'No payments yet.' : 'No spending yet today.'}<br>Tap <b>Add slips</b> to bring in your K PLUS payments.</li>`;

    renderStats();
  }

  function renderStats() {
    const now = new Date(), t0 = startOfDay(now);
    let from, n, prev, label, vs;
    if (range === 'week') {
      from = addDays(t0, -6); n = 7; label = 'Spent in the last 7 days'; vs = 'previous 7 days';
      prev = totalBetween(addDays(t0, -13).getTime(), from.getTime());
    } else {
      from = new Date(now.getFullYear(), now.getMonth(), 1); n = now.getDate();
      label = 'Spent so far in ' + fmt(now, { month: 'long' }); vs = 'same days last month';
      const pf = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prev = totalBetween(pf.getTime(), addDays(pf, n).getTime());
    }
    const v = dailyTotals(from, n), total = round2(sum(v));
    const labels = v.map((_, i) => {
      const d = addDays(from, i);
      return range === 'week' ? fmt(d, { weekday: 'short' }) : (i === 0 || i === n - 1 || d.getDate() % 5 === 0 ? String(d.getDate()) : '');
    });
    $('statLabel').textContent = label;
    $('statTotal').textContent = baht(total);
    const tr = $('statTrend');
    if (prev > 0) { const pct = Math.round((total - prev) / prev * 100); tr.hidden = false; tr.textContent = (pct <= 0 ? '↓ ' : '↑ ') + Math.abs(pct) + '% vs ' + vs; }
    else tr.hidden = true;
    area($('statChart'), v); days($('statDays'), labels);

    // categories (this month)
    const m0 = new Date(now.getFullYear(), now.getMonth(), 1), m1 = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const mc = catTotals(m0.getTime(), m1.getTime()).filter(c => c.a > 0).sort((a, b) => b.a - a.a);
    $('cats').innerHTML = mc.length ? mc.map(c => `<div class="cat"><div class="ico">${c.i}</div><div class="body">
        <div class="row">${c.id}<span>${baht(c.a)}</span></div><div class="track"><i style="width:${c.a / mc[0].a * 100}%;background:${c.col}"></i></div></div></div>`).join('')
      : '<p class="muted" style="font-size:13px;padding:8px 0">Nothing yet this month.</p>';

    // goal
    const mTotal = sum(mc.map(c => c.a)), dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const projected = mTotal / now.getDate() * dim;
    if (!mTotal) { $('goalFace').textContent = '👋'; $('goalTitle').textContent = 'Welcome!'; $('goalText').textContent = 'Add your first slips to see how your month is going.'; }
    else if (projected <= MONTHLY_BUDGET) { $('goalFace').textContent = '🙂'; $('goalTitle').textContent = "You're doing well!"; $('goalText').textContent = `On track to stay under ${baht(MONTHLY_BUDGET)} this month.`; }
    else { $('goalFace').textContent = '😬'; $('goalTitle').textContent = 'Heads up'; $('goalText').textContent = `At this pace you'll spend about ${baht(Math.round(projected / 10) * 10)} this month.`; }
  }

  // ---------- ADD SLIPS ----------
  function loadScript(src) {
    return new Promise((res, rej) => {
      if (window.Tesseract) return res();
      const s = document.createElement('script'); s.src = src; s.onload = res;
      s.onerror = () => { s.remove(); rej(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  let workerP = null;
  function getWorker() {
    if (!workerP) workerP = window.Tesseract.createWorker(['tha', 'eng']).catch(e => { workerP = null; throw e; });
    return workerP;
  }

  // K PLUS slips have a picture in the background. Turn the slip black-and-white so only the dark text is left.
  async function cleanImage(file) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / bmp.width);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0, c.width, c.height);
    const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 110 ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    g.putImageData(im, 0, 0);
    return c;
  }

  const isDuplicate = (p, ts) => txs.some(t =>
    (p.ref && t.ref === p.ref) || (t.src === 'slip' && t.amount === p.amount && Math.abs(t.ts - ts) < 60000));

  let fixQueue = [], busy = false;
  async function importSlips(files) {
    if (busy || !files.length) return;
    busy = true; $('addSlips').disabled = true;
    try {
      toast('Getting the slip reader ready…', 'busy', true);
      let worker;
      try { await loadScript(TESS_URL); worker = await getWorker(); }
      catch (e) { toast("Couldn't load the slip reader. Check your internet and try again.", 'warn'); return; }

      let added = 0, dup = 0;
      for (let k = 0; k < files.length; k++) {
        toast(`Reading slip ${k + 1} of ${files.length}…`, 'busy', true);
        let p = null;
        try {
          p = parseSlip((await worker.recognize(await cleanImage(files[k]))).data.text);
          if (!p.amount || !p.to) { // backup: try the untouched picture and fill in what's missing
            const q = parseSlip((await worker.recognize(files[k])).data.text);
            for (const key in q) if (!p[key] && q[key]) p[key] = q[key];
          }
        } catch (e) { p = null; }
        if (!p || !p.amount) { fixQueue.push({ file: files[k], parsed: p || {} }); continue; }
        const ts = (p.date || new Date(files[k].lastModified || Date.now())).getTime();
        if (isDuplicate(p, ts)) { dup++; continue; }
        const name = p.to || 'K PLUS payment';
        txs.push({ id: uid(), amount: p.amount, ts, name, cat: guessCategory(name, learned), src: 'slip', ref: p.ref || null });
        added++;
      }
      persist(); render();
      const parts = [];
      parts.push(added ? `Added ${added} new payment${added > 1 ? 's' : ''} from K PLUS` : 'No new payments added');
      if (dup) parts.push(`${dup} already added`);
      if (fixQueue.length) parts.push(`${fixQueue.length} need a quick check`);
      toast(parts.join(' · '), added || dup ? 'ok' : 'warn');
      nextFix();
    } finally {
      busy = false; $('addSlips').disabled = false;
    }
  }
  function nextFix() { const f = fixQueue.shift(); if (f) openForm({ mode: 'fix', file: f.file, parsed: f.parsed }); }

  // ---------- ADD / EDIT FORM ----------
  let formState = null, formCat = 'Food';
  const toLocalInput = d => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  function drawCats() {
    $('fCats').innerHTML = CATS.map(c => `<button type="button" data-c="${c.id}" class="${c.id === formCat ? 'on' : ''}">${c.i} ${c.id}</button>`).join('');
  }
  function openForm(st) {
    formState = st; const t = st.tx, p = st.parsed || {};
    $('formTitle').textContent = st.mode === 'cash' ? 'Add cash spending' : st.mode === 'edit' ? 'Edit payment' : "Couldn't read this slip";
    $('formHint').hidden = st.mode !== 'fix';
    const img = $('formImg');
    if (st.file) { img.src = URL.createObjectURL(st.file); img.hidden = false; } else { img.hidden = true; img.removeAttribute('src'); }
    $('fAmount').value = t ? t.amount : (p.amount || '');
    $('fName').value = t ? t.name : (p.to || '');
    formCat = t ? catOf(t.cat).id : st.mode === 'cash' ? 'Food' : guessCategory(p.to || '', learned);
    $('fWhen').value = toLocalInput(t ? new Date(t.ts) : (p.date || (st.file ? new Date(st.file.lastModified) : new Date())));
    $('fDelete').hidden = st.mode !== 'edit';
    drawCats();
    $('sheet').hidden = false;
  }
  function closeForm() {
    const img = $('formImg');
    if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
    $('sheet').hidden = true; formState = null;
    nextFix();
  }
  $('fCats').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { formCat = b.dataset.c; drawCats(); } });
  $('fCancel').addEventListener('click', closeForm);
  $('sheet').addEventListener('click', e => { if (e.target === $('sheet')) closeForm(); });
  $('fDelete').addEventListener('click', () => {
    if (!formState || !formState.tx || !confirm('Delete this payment?')) return;
    txs = txs.filter(t => t.id !== formState.tx.id); persist(); render(); toast('Payment deleted'); closeForm();
  });
  $('form').addEventListener('submit', e => {
    e.preventDefault();
    const amount = round2(parseFloat(String($('fAmount').value).replace(/[,฿\s]/g, '')));
    if (!(amount > 0)) { $('fAmount').focus(); return; }
    const mode = formState.mode;
    const name = $('fName').value.trim() || (mode === 'cash' ? 'Cash' : 'K PLUS payment');
    const ts = new Date($('fWhen').value).getTime() || Date.now();
    if (mode === 'edit') Object.assign(formState.tx, { amount, name, ts, cat: formCat });
    else txs.push({ id: uid(), amount, ts, name, cat: formCat, src: mode === 'cash' ? 'cash' : 'slip', ref: (formState.parsed && formState.parsed.ref) || null });
    learned[name.toLowerCase()] = formCat; // remember your choice for next time
    persist(); render();
    toast(mode === 'edit' ? 'Saved' : 'Added ' + baht(amount));
    closeForm();
  });

  // ---------- MENU: backup / restore / clear ----------
  const openMenu = () => { $('menu').hidden = false; };
  const closeMenu = () => { $('menu').hidden = true; };
  $('mClose').addEventListener('click', closeMenu);
  $('menu').addEventListener('click', e => { if (e.target === $('menu')) closeMenu(); });
  $('mExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ app: 'satang', version: 1, exported: new Date().toISOString(), txs, learned }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'satang-backup-' + toLocalInput(new Date()).slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    closeMenu();
  });
  $('mImport').addEventListener('click', () => $('importInput').click());
  $('importInput').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== 'satang' || !Array.isArray(data.txs)) throw new Error('not a backup');
      const have = new Set(txs.map(t => t.id)); let n = 0;
      data.txs.forEach(t => { if (t && t.id && !have.has(t.id) && t.amount > 0 && t.ts) { txs.push(t); n++; } });
      learned = { ...(data.learned || {}), ...learned };
      persist(); render(); closeMenu(); toast(`Restored ${n} payment${n === 1 ? '' : 's'}`);
    } catch (err) { closeMenu(); toast("That file isn't a Satang backup.", 'warn'); }
  });
  $('mClear').addEventListener('click', () => {
    if (!confirm('Delete ALL your payments from this phone? This cannot be undone. (Download a backup first if unsure.)')) return;
    txs = []; learned = {}; persist(); render(); closeMenu(); toast('All data deleted');
  });

  // ---------- BUTTONS & NAVIGATION ----------
  const pickSlips = () => $('fileInput').click();
  $('addSlips').addEventListener('click', pickSlips);
  $('navAdd').addEventListener('click', pickSlips);
  $('fileInput').addEventListener('change', e => { const files = [...e.target.files]; e.target.value = ''; importSlips(files); });
  $('addCash').addEventListener('click', () => openForm({ mode: 'cash' }));
  [$('moreBtn'), $('moreTop'), $('navMenu')].forEach(b => b.addEventListener('click', openMenu));
  $('seeAll').addEventListener('click', () => { showAll = !showAll; render(); });
  $('txList').addEventListener('click', e => {
    const li = e.target.closest('li[data-id]'); if (!li) return;
    const tx = txs.find(t => t.id === li.dataset.id); if (tx) openForm({ mode: 'edit', tx });
  });
  $('seg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    range = b.dataset.r;
    document.querySelectorAll('#seg button').forEach(x => x.classList.toggle('on', x === b));
    renderStats();
  });
  document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
    const go = b.dataset.go;
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === go));
    document.querySelectorAll('.nav [data-go]').forEach(n => n.classList.toggle('on', n.dataset.go === go));
  }));

  // refresh when you come back to the app (new day, etc.)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

  window.satang = { importSlips }; // used for testing
  // save a copy of the app on the phone so it opens offline
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  render();
})();
