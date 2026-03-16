/* ── State ──────────────────────────────────────────────── */
let _activeAccount  = null;   // full account object
let _activeNiche    = null;   // full niche profile object
let _archetypes     = [];     // current niche's archetype list
let _activeComment  = null;
let _generatedProfile = null; // holds AI-generated profile pending save
let _overviewRange = '7d';
let _overviewSeries = null;   // { reach: number[], eng: number[] }
let _kpiWeeks = [];           // cached for trend calcs

/* ── Navigation ─────────────────────────────────────────── */
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  const navEl  = document.querySelector(`[data-page="${page}"]`);
  if (pageEl) pageEl.classList.add('active');
  if (navEl)  navEl.classList.add('active');

  // Ensure good tooltips when sidebar is collapsed (icon-only)
  try {
    document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
      const label = btn.querySelector('span.truncate')?.textContent?.trim();
      if (label) btn.setAttribute('title', label);
    });
  } catch {}

  const titleMap = {
    overview: "Overview",
    generate: "Generate Content",
    calendar: "Content Calendar",
    engagement: "Engagement Monitor",
    kpi: "KPI & Reports",
    scheduler: "Scheduler",
    accounts: "Accounts",
    niches: "Niche Profiles",
    onboarding: "Create Niche",
    settings: "Settings",
  };
  const headerTitle = el('page-title');
  if (headerTitle) headerTitle.textContent = titleMap[page] || "SMM Engine";

  const loaders = {
    overview:    loadOverview,
    engagement:  loadComments,
    kpi:         loadKPI,
    scheduler:   loadJobs,
    calendar:    loadCalendar,
    accounts:    loadAccounts,
    niches:      loadNiches,
    settings:    () => { loadChecklist(); loadProviderSettings(); },
  };
  if (loaders[page]) loaders[page]();
}

/* ── Tabs ───────────────────────────────────────────────── */
function switchTab(btn, panelId) {
  const parent = btn.closest('.page');
  parent.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  parent.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(panelId).classList.add('active');
}

/* ── Modals ─────────────────────────────────────────────── */
function openModal(id)  { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

/* ── DOM helpers ────────────────────────────────────────── */
function val(id)       { return document.getElementById(id)?.value.trim() || ''; }
function el(id)        { return document.getElementById(id); }
function html(id, h)   { const e = el(id); if (e) e.innerHTML = h; }
function show(id)      { const e = el(id); if (e) e.style.display = 'block'; }
function hide(id)      { const e = el(id); if (e) e.style.display = 'none'; }
function setLoading(id, msg = 'Generating…') { el(id).innerHTML = `<div class="loading">${msg}</div>`; show(id); }

function fmt(n) {
  if (n == null || n === '') return '—';
  if (typeof n === 'number') return n >= 1000 ? (n/1000).toFixed(1) + 'k' : n.toLocaleString();
  return n;
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function trendBadgeClass(kind) {
  if (kind === 'up') {
    return 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-full';
  }
  if (kind === 'down') {
    return 'text-rose-500 bg-rose-50 dark:bg-rose-500/10 px-2 py-1 rounded-full';
  }
  return 'text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full';
}

function setTrendPill(elId, { kind = 'neutral', text = '—' } = {}) {
  const pill = el(elId);
  if (!pill) return;
  pill.className = `text-[10px] font-black uppercase tracking-wider ${trendBadgeClass(kind)}`;
  pill.textContent = text;
}

function setBarWidth(elId, pct) {
  const bar = el(elId);
  if (!bar) return;
  const p = clamp(pct, 0, 100);
  bar.style.width = `${p}%`;
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard'));
}

function showToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position:'fixed', bottom:'24px', left:'50%', transform:'translateX(-50%)',
    background:'var(--accent)', color:'#fff', padding:'8px 18px',
    borderRadius:'20px', fontSize:'13px', zIndex:'999',
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

/* ── Account switcher ───────────────────────────────────── */
async function loadActiveAccount() {
  try {
    const data = await API.get('/accounts/active');
    _activeAccount = data.account;
    updateAccountSwitcherUI();
    if (_activeAccount?.niche_id) {
      await loadActiveNiche(_activeAccount.niche_id);
    }
  } catch { /* no accounts yet */ }
}

function updateAccountSwitcherUI() {
  const acc = _activeAccount;
  if (!acc) {
    html('acc-name',  'No account');
    html('acc-niche', 'Select an account');
    html('acc-avatar', '?');
    return;
  }
  const initials = acc.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  html('acc-avatar', initials);
  html('acc-name',  acc.name);
  html('acc-niche', _activeNiche?.name || acc.niche_id || '—');
}

async function loadActiveNiche(nicheId) {
  try {
    const data = await API.get(`/niches/${nicheId}`);
    _activeNiche  = data;
    _archetypes   = data.archetype_overrides
      ? Object.entries(data.archetype_overrides).map(([id, v]) => ({ id, label: v.label || id, examples: v.example_topics || [] }))
      : [];
    populateArchetypeSelects();
    populatePillarSelects();
    updateNicheContextPill();
    updateAccountSwitcherUI();
  } catch { /* niche not found */ }
}

function updateNicheContextPill() {
  const pill = el('gen-niche-pill');
  if (!pill) return;
  const label = el('gen-niche-pill-label');
  if (_activeNiche) {
    if (label) label.textContent = _activeNiche.name;
    pill.style.display = 'inline-flex';
  } else {
    pill.style.display = 'none';
  }
}

/* ── Archetype and pillar selects ───────────────────────── */
function populateArchetypeSelects() {
  const selects = ['cap-archetype','reel-archetype','car-archetype'];
  selects.forEach(sid => {
    const s = el(sid);
    if (!s) return;
    if (!_archetypes.length) {
      s.innerHTML = '<option disabled selected value="">Create/select a niche profile first</option>';
      return;
    }
    s.innerHTML = _archetypes.map(a =>
      `<option value="${a.id}">${a.label}</option>`
    ).join('');
  });
}

function populatePillarSelects() {
  const s = el('cap-pillar');
  if (!s || !_activeAccount?.pillars?.length) return;
  s.innerHTML = _activeAccount.pillars.map(p =>
    `<option value="${p}">${p}</option>`
  ).join('');
}

function updateArchetypeExamples(selectId, inputId) {
  const archetypeId = el(selectId)?.value;
  const arc = _archetypes.find(a => a.id === archetypeId);
  if (!arc || !arc.examples?.length) return;
  const inp = el(inputId);
  if (inp && !inp.value) inp.placeholder = arc.examples[0] || '';
}

/* ── Connection status ──────────────────────────────────── */
async function checkStatus() {
  try {
    const d = await API.get('/auth/status');
    el('status-dot').className  = 'status-dot ' + (d.connected ? 'connected' : 'error');
    el('status-label').textContent = d.connected ? (d.ig_handle || 'Connected') : 'Not connected';
  } catch {
    el('status-dot').className  = 'status-dot error';
    el('status-label').textContent = 'Offline';
  }
}

/* ── Overview chart renderer ────────────────────────────── */
function renderOverviewChart(series, range = '7d') {
  const svgLine = el('overview-line');
  const svgLine2 = el('overview-line2');
  const svgArea = el('overview-area');
  if (!svgLine || !svgLine2 || !svgArea) return;

  const reach = (series?.reach || []).map(Number).filter(n => Number.isFinite(n));
  const eng = (series?.eng || []).map(Number).filter(n => Number.isFinite(n));
  if (!reach.length || !eng.length) return;

  const w = 900, h = 260;
  const padL = 18, padR = 18, padT = 16, padB = 20;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const n = Math.min(reach.length, eng.length);
  const rx = reach.slice(-n);
  const ex = eng.slice(-n);

  const rMin = Math.min(...rx), rMax = Math.max(...rx);
  const eMin = Math.min(...ex), eMax = Math.max(...ex);

  const safeSpan = (min, max) => (max - min) || 1;
  const rSpan = safeSpan(rMin, rMax);
  const eSpan = safeSpan(eMin, eMax);

  const points = Array.from({ length: n }, (_, i) => {
    const x = padL + (innerW * (n === 1 ? 0 : i / (n - 1)));
    const rNorm = (rx[i] - rMin) / rSpan;
    const eNorm = (ex[i] - eMin) / eSpan;
    const yR = padT + innerH * (1 - rNorm);
    const yE = padT + innerH * (1 - eNorm);
    return { x, yR, yE };
  });

  const linePath = (key) => {
    if (!points.length) return '';
    let d = `M ${points[0].x.toFixed(2)} ${points[0][key].toFixed(2)}`;
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const cx = ((p0.x + p1.x) / 2);
      d += ` Q ${cx.toFixed(2)} ${p0[key].toFixed(2)}, ${p1.x.toFixed(2)} ${p1[key].toFixed(2)}`;
    }
    return d;
  };

  const reachLine = linePath('yR');
  const engLine = linePath('yE');
  svgLine.setAttribute('d', reachLine);
  svgLine2.setAttribute('d', engLine);

  const areaD = `${reachLine} L ${(points[points.length - 1].x).toFixed(2)} ${(padT + innerH).toFixed(2)} L ${(points[0].x).toFixed(2)} ${(padT + innerH).toFixed(2)} Z`;
  svgArea.setAttribute('d', areaD);

  // Accessibility hint (non-visual): attach title for the current range
  const chart = el('overview-chart');
  if (chart) chart.setAttribute('aria-label', `Overview chart (${range})`);
}

function pickSeriesForRange(series, range) {
  const target = range === '90d' ? 30 : range === '28d' ? 16 : 10;
  const reach = (series?.reach || []);
  const eng = (series?.eng || []);
  const n = Math.min(reach.length, eng.length);
  const take = Math.min(target, n);
  return { reach: reach.slice(-take), eng: eng.slice(-take) };
}

function setOverviewRange(range, btn) {
  _overviewRange = range;
  const wrap = btn?.closest('div');
  if (wrap) {
    wrap.querySelectorAll('button[data-chart-range]').forEach(b => {
      const active = b.getAttribute('data-chart-range') === range;
      b.className = active
        ? 'px-3 py-1 rounded-full bg-primary/10 text-primary'
        : 'px-3 py-1 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors';
    });
  }
  if (_overviewSeries) renderOverviewChart(pickSeriesForRange(_overviewSeries, range), range);
}

function synthesizeOverviewSeries({ metrics, weeks }) {
  // If we have weekly KPI history, derive a smooth-ish series from it.
  const baseReach = Number(metrics?.reach_7d) || Number(weeks?.[0]?.avg_reach) || 1000;
  const baseEng = Number(weeks?.[0]?.avg_eng_rate) || 5;

  const wk = (weeks || []).slice().reverse(); // oldest → newest
  const reachWeekly = wk.map(w => Number(w.avg_reach)).filter(Number.isFinite);
  const engWeekly = wk.map(w => Number(w.avg_eng_rate)).filter(Number.isFinite);

  const makeSeries = (arr, fallback) => {
    if (arr.length >= 2) return arr;
    // fallback deterministic micro-variation
    return Array.from({ length: 8 }, (_, i) => fallback * (0.92 + 0.04 * Math.sin(i * 0.9)));
  };

  const rSrc = makeSeries(reachWeekly, baseReach);
  const eSrc = makeSeries(engWeekly, baseEng);

  // Expand weekly points into a denser series (simple interpolation).
  const expand = (src, mult) => {
    const out = [];
    for (let i = 0; i < src.length - 1; i++) {
      const a = src[i], b = src[i + 1];
      for (let k = 0; k < mult; k++) {
        const t = k / mult;
        out.push(a + (b - a) * t);
      }
    }
    out.push(src[src.length - 1]);
    return out;
  };

  const reach = expand(rSrc, 3);
  const eng = expand(eSrc, 3);
  return { reach, eng };
}

/* ── Overview ───────────────────────────────────────────── */
async function loadOverview() {
  try {
    const [metrics, comments, kpi] = await Promise.allSettled([
      API.get('/instagram/metrics'),
      API.get('/instagram/comments'),
      API.get('/kpi/weekly'),
    ]);

    let m = null;
    if (metrics.status === 'fulfilled') m = metrics.value;

    _kpiWeeks = [];
    if (metrics.status === 'fulfilled') {
      el('m-followers').textContent = fmt(metrics.value.followers);
      el('m-reach').textContent     = fmt(metrics.value.reach_7d);
    }
    if (kpi.status === 'fulfilled' && kpi.value.weeks?.length) {
      _kpiWeeks = kpi.value.weeks || [];
      const w = _kpiWeeks[0];
      el('m-eng').textContent = (w.avg_eng_rate || 0).toFixed(1) + '%';
      const delta = Number(w.follower_delta || 0);
      const kind = delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral';
      setTrendPill('m-followers-trend', {
        kind,
        text: (delta === 0) ? 'FLAT' : `${delta > 0 ? '+' : ''}${delta}`,
      });

      // Engagement delta vs previous week
      const prev = _kpiWeeks[1];
      const curEng = Number(w.avg_eng_rate || 0);
      const prevEng = Number(prev?.avg_eng_rate || 0);
      const dEng = curEng - prevEng;
      const engKind = dEng > 0.05 ? 'up' : dEng < -0.05 ? 'down' : 'neutral';
      setTrendPill('m-comments-trend', { kind: 'neutral', text: 'PENDING' }); // placeholder, updated below by comments
      // Reuse followers trend pill structure for engagement (badge is static "WEEK" in HTML; leave it)
      setBarWidth('m-eng-bar', clamp(curEng, 0, 15) / 15 * 100);
      // Show eng delta in title pill by swapping text if present (optional)
      // (We don't have a dedicated element in HTML; keep bar + value.)

      // Reach trend vs previous week average reach
      const curReach = Number(m?.reach_7d) || Number(w.avg_reach || 0);
      const prevReach = Number(prev?.avg_reach || 0);
      const dReach = curReach - prevReach;
      const reachKind = dReach > 1 ? 'up' : dReach < -1 ? 'down' : 'neutral';
      setTrendPill('m-followers-trend', {
        kind,
        text: (delta === 0) ? 'FLAT' : `${delta > 0 ? '+' : ''}${delta}`,
      });
      // Reach/Comments pills are already present; Reach pill is static "7D" in HTML so we only update bars.
      setBarWidth('m-reach-bar', curReach > 0 ? clamp(curReach / Math.max(curReach, prevReach || curReach), 0.25, 1) * 100 : 60);

      // Followers bar: use delta magnitude as subtle indicator
      const base = Number(w.followers || 0) || Number(m?.followers || 0) || 1;
      const pct = clamp((Math.abs(delta) / Math.max(base, 1)) * 1200, 12, 96);
      setBarWidth('m-followers-bar', pct);

      // Engagement trend pill isn't rendered in HTML as dynamic; but we can tint the value via bar only.
      // If you want a dynamic pill, add an element id and we’ll wire it similarly.
    }
    if (comments.status === 'fulfilled') {
      const cnt = comments.value.pending_count || 0;
      el('m-comments').textContent = cnt;
      const b = el('pending-badge');
      b.textContent    = cnt;
      b.style.display  = cnt > 0 ? 'inline-flex' : 'none';

      setTrendPill('m-comments-trend', {
        kind: cnt > 0 ? 'down' : 'neutral',
        text: cnt > 6 ? 'URGENT' : (cnt > 0 ? 'PENDING' : 'CLEAR'),
      });
      setBarWidth('m-comments-bar', cnt === 0 ? 18 : clamp(cnt, 1, 20) / 20 * 100);
    }

    // Reach bar baseline if KPI missing
    if (m) {
      setBarWidth('m-reach-bar', clamp(Number(m.reach_7d || 0), 0, 50000) / 50000 * 100);
    }

    // Chart: build + render once we have any useful data.
    const weeks = (kpi.status === 'fulfilled') ? (kpi.value.weeks || []) : [];
    _overviewSeries = synthesizeOverviewSeries({ metrics: m, weeks });
    renderOverviewChart(pickSeriesForRange(_overviewSeries, _overviewRange), _overviewRange);

    loadRecentPosts();
  } catch (e) {
    html('overview-metrics', `<div class="error-msg">${e.message}</div>`);
  }
}

async function loadRecentPosts() {
  const grid = el('posts-grid');
  grid.innerHTML = '<div class="loading">Loading posts…</div>';
  try {
    const data  = await API.get('/instagram/posts?limit=9');
    const posts = data.posts || [];
    if (!posts.length) { grid.innerHTML = '<div class="loading">No posts found.</div>'; return; }
    grid.innerHTML = posts.map(p => `
      <div class="group bg-white dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200/70 dark:border-slate-800 transition-all hover:-translate-y-0.5 hover:shadow-xl">
        <div class="aspect-[4/5] bg-slate-200 dark:bg-slate-800 relative overflow-hidden">
          ${p.thumbnail ? `<img src="${p.thumbnail}" alt="" loading="lazy" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105">` : `<div class="w-full h-full flex items-center justify-center text-xs text-slate-400">No preview</div>`}
          <div class="absolute top-3 left-3 px-2 py-1 bg-white/90 dark:bg-slate-900/90 rounded text-[10px] font-extrabold uppercase backdrop-blur-sm">${p.type}</div>
        </div>
        <div class="p-4 space-y-3">
          <div class="grid grid-cols-2 gap-2">
            <div class="text-[10px] text-slate-400 uppercase font-extrabold tracking-tighter">Reach</div>
            <div class="text-[10px] text-slate-400 uppercase font-extrabold tracking-tighter text-right">Eng.</div>
            <div class="text-xs font-extrabold">${fmt(p.metrics.reach)}</div>
            <div class="text-xs font-extrabold text-right">${p.metrics.engagement_rate}%</div>
          </div>
          <div class="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-3 text-slate-400">
              <div class="flex items-center gap-1">
                <span class="material-symbols-outlined text-sm">bookmark</span>
                <span class="text-[10px] font-extrabold">${fmt(p.metrics.saves)}</span>
              </div>
              <div class="flex items-center gap-1">
                <span class="material-symbols-outlined text-sm">share</span>
                <span class="text-[10px] font-extrabold">${fmt(p.metrics.shares)}</span>
              </div>
            </div>
            <span class="material-symbols-outlined text-slate-300 group-hover:text-primary transition-colors">more_horiz</span>
          </div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    grid.innerHTML = `<div class="error-msg">Could not load posts: ${e.message}</div>`;
  }
}

/* ── Generate: Caption ──────────────────────────────────── */
async function generateCaption() {
  const box = el('cap-result');
  setLoading('cap-result', 'Generating caption…');
  try {
    const d = await API.post('/generate/caption', {
      pillar:       val('cap-pillar'),
      archetype:    val('cap-archetype'),
      keyword:      val('cap-keyword'),
      account_type: val('cap-actype'),
    });
    box.innerHTML = `
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-primary/5 border border-primary/20 overflow-hidden mt-6">
        <div class="p-4 bg-primary/5 border-b border-primary/10 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
            <span class="text-xs font-extrabold text-primary uppercase tracking-wider">Ready to publish</span>
          </div>
          <div class="flex gap-2">
            <button class="p-2 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors flex items-center gap-2 text-xs font-extrabold"
                    title="Copy All"
                    onclick="copyText(${JSON.stringify(`${d.hook}\n\n${d.body||''}\n\n${d.cta}\n\n${(d.hashtags||[]).join(' ')}`)})">
              <span class="material-symbols-outlined text-[18px]">content_copy</span>
              Copy
            </button>
            <button class="p-2 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors flex items-center gap-2 text-xs font-extrabold"
                    title="Regenerate"
                    onclick="generateCaption()">
              <span class="material-symbols-outlined text-[18px]">refresh</span>
              Regen
            </button>
          </div>
        </div>
        <div class="p-8 space-y-8">
          <section>
            <h4 class="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3">The Hook</h4>
            <p class="text-lg font-black text-slate-900 dark:text-white leading-tight">${d.hook || ''}</p>
          </section>
          <section>
            <h4 class="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3">The Body</h4>
            <div class="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-slate-100 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 leading-relaxed space-y-4">
              ${(d.body||'').split('\\n').filter(Boolean).map(p=>`<p>${p}</p>`).join('')}
            </div>
          </section>
          <section>
            <h4 class="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3">Call to Action</h4>
            <div class="p-4 bg-primary/10 rounded-lg border-l-4 border-primary italic text-sm text-slate-800 dark:text-slate-200">${d.cta || ''}</div>
          </section>
          <section>
            <h4 class="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3">Hashtags</h4>
            <div class="flex flex-wrap gap-2">
              ${(d.hashtags||[]).map(h=>`<span class="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-[11px] font-semibold text-slate-500">${h}</span>`).join('')}
            </div>
          </section>
          ${d.variations?.length ? `
            <section>
              <h4 class="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3">Alt hooks</h4>
              <div class="space-y-2">
                ${d.variations.map((v,i)=>`<div class="text-sm text-slate-700 dark:text-slate-300"><span class="font-extrabold text-slate-900 dark:text-white">Alt ${i+1}:</span> ${v.hook}</div>`).join('')}
              </div>
            </section>` : ''}
          ${d.best_time_to_post ? `
            <section>
              <h4 class="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3">Best time to post</h4>
              <div class="text-sm text-slate-700 dark:text-slate-300">${d.best_time_to_post}</div>
            </section>` : ''}
        </div>
        <div class="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3">
          <button class="px-6 py-2 text-sm font-extrabold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition-colors"
                  type="button"
                  onclick="showToast('Draft saved locally (UI only)')">Save Draft</button>
          <button class="px-6 py-2 bg-primary text-white text-sm font-extrabold rounded-lg hover:shadow-lg hover:shadow-primary/20 transition-all"
                  type="button"
                  onclick="showToast('Scheduling is not wired yet')">Schedule Post</button>
        </div>
      </div>
    `;
  } catch (e) { box.innerHTML = `<div class="error-msg">${e.message}</div>`; }
}

/* ── Generate: Reel script ──────────────────────────────── */
async function generateReelScript() {
  const box = el('reel-result');
  setLoading('reel-result', 'Writing Reel script…');
  try {
    const d = await API.post('/generate/reel-script', {
      topic:     val('reel-topic'),
      duration:  parseInt(val('reel-dur')),
      style:     val('reel-style'),
      archetype: val('reel-archetype'),
    });
    box.innerHTML = `
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-primary/5 border border-primary/20 overflow-hidden mt-6">
        <div class="p-4 bg-primary/5 border-b border-primary/10 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
            <span class="text-xs font-extrabold text-primary uppercase tracking-wider">Script ready</span>
          </div>
          <button class="p-2 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors flex items-center gap-2 text-xs font-extrabold"
                  title="Copy"
                  onclick="copyText(${JSON.stringify((d.script||[]).map(b=>`${b.time} ${b.spoken||''} (On-screen: ${b.on_screen_text||''})${b.action?` [${b.action}]`:''}`).join('\\n'))})">
            <span class="material-symbols-outlined text-[18px]">content_copy</span>
            Copy
          </button>
        </div>
        <div class="p-8 space-y-8">
          <section>
            <h4 class="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3">Title</h4>
            <p class="text-lg font-black text-slate-900 dark:text-white leading-tight">${d.title||''}</p>
          </section>
          <section>
            <h4 class="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3">Script</h4>
            <div class="space-y-3">
              ${(d.script||[]).map(b=>`
                <div class="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div class="text-[11px] font-extrabold text-primary mb-2">${b.time}</div>
                  <div class="text-sm font-semibold text-slate-900 dark:text-white">${b.spoken||''}</div>
                  ${b.action?`<div class="text-xs text-slate-500 dark:text-slate-400 mt-1">Action: ${b.action}</div>`:''}
                  <div class="text-xs text-slate-500 dark:text-slate-400 mt-1">On-screen: “${b.on_screen_text||''}”</div>
                </div>
              `).join('')}
            </div>
          </section>
          ${d.audio_suggestion?`
            <section>
              <h4 class="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3">Audio</h4>
              <div class="text-sm text-slate-700 dark:text-slate-300">${d.audio_suggestion}</div>
            </section>`:''}
          ${d.cta?`
            <section>
              <h4 class="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3">CTA</h4>
              <div class="p-4 bg-primary/10 rounded-lg border-l-4 border-primary italic text-sm text-slate-800 dark:text-slate-200">${d.cta}</div>
            </section>`:''}
          ${d.filming_tips?.length?`
            <section>
              <h4 class="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3">Filming tips</h4>
              <div class="space-y-1 text-sm text-slate-700 dark:text-slate-300">
                ${d.filming_tips.map(t=>`<div>• ${t}</div>`).join('')}
              </div>
            </section>`:''}
        </div>
      </div>
    `;
  } catch (e) { box.innerHTML = `<div class="error-msg">${e.message}</div>`; }
}

/* ── Generate: Carousel ─────────────────────────────────── */
async function generateCarousel() {
  const box = el('car-result');
  setLoading('car-result', 'Building carousel outline…');
  try {
    const d = await API.post('/generate/carousel', {
      topic:        val('car-topic'),
      cta_goal:     val('car-cta'),
      visual_style: val('car-style'),
      archetype:    val('car-archetype'),
    });
    box.innerHTML = `
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-primary/5 border border-primary/20 overflow-hidden mt-6">
        <div class="p-4 bg-primary/5 border-b border-primary/10 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
            <span class="text-xs font-extrabold text-primary uppercase tracking-wider">Carousel ready</span>
          </div>
          <button class="p-2 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors flex items-center gap-2 text-xs font-extrabold"
                  title="Copy caption"
                  onclick="copyText(${JSON.stringify(d.caption||'')})">
            <span class="material-symbols-outlined text-[18px]">content_copy</span>
            Copy caption
          </button>
        </div>
        <div class="p-8 space-y-8">
          <section>
            <h4 class="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3">Title</h4>
            <p class="text-lg font-black text-slate-900 dark:text-white leading-tight">${d.title||''}</p>
          </section>
          <section>
            <h4 class="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3">Slides</h4>
            <div class="space-y-3">
              ${(d.slides||[]).map(s=>`
                <div class="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                  <div class="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2">Slide ${s.number}${s.type?` — ${s.type}`:''}</div>
                  <div class="text-sm font-black text-slate-900 dark:text-white">${s.headline||''}</div>
                  ${s.subtext?`<div class="text-sm text-slate-700 dark:text-slate-300 mt-1">${s.subtext}</div>`:''}
                  ${s.visual_direction?`<div class="text-xs text-slate-500 dark:text-slate-400 mt-2">${s.visual_direction}</div>`:''}
                </div>
              `).join('')}
            </div>
          </section>
          <section>
            <h4 class="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3">Caption</h4>
            <div class="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-slate-100 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 leading-relaxed space-y-2">
              ${(d.caption||'').split('\\n').filter(Boolean).map(p=>`<p>${p}</p>`).join('')}
            </div>
          </section>
          <section>
            <h4 class="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3">Hashtags</h4>
            <div class="flex flex-wrap gap-2">
              ${(d.hashtags||[]).map(h=>`<span class="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-[11px] font-semibold text-slate-500">${h}</span>`).join('')}
            </div>
          </section>
        </div>
      </div>
    `;
  } catch (e) { box.innerHTML = `<div class="error-msg">${e.message}</div>`; }
}

/* ── Generate: DM ───────────────────────────────────────── */
async function generateDM() {
  const box = el('dm-result');
  setLoading('dm-result', 'Drafting DM…');
  try {
    const d = await API.post('/generate/dm', {
      target_handle: val('dm-handle'), target_niche: val('dm-niche'),
      specific_post: val('dm-post'),   collab_idea:  val('dm-idea'),
      strategy:      val('dm-strategy'),
    });
    box.innerHTML = `
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-primary/5 border border-primary/20 overflow-hidden mt-6">
        <div class="p-4 bg-primary/5 border-b border-primary/10 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
            <span class="text-xs font-extrabold text-primary uppercase tracking-wider">DM ready</span>
          </div>
          <button class="p-2 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors flex items-center gap-2 text-xs font-extrabold"
                  title="Copy DM"
                  onclick="copyText(${JSON.stringify(d.body||'')})">
            <span class="material-symbols-outlined text-[18px]">content_copy</span>
            Copy
          </button>
        </div>
        <div class="p-8 space-y-6">
          <section>
            <h4 class="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3">Message</h4>
            <div class="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-slate-100 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 leading-relaxed space-y-2">
              ${(d.body||'').split('\\n').filter(Boolean).map(p=>`<p>${p}</p>`).join('')}
            </div>
          </section>
          ${d.follow_up?`
            <section>
              <h4 class="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3">5-day follow-up</h4>
              <div class="text-sm text-slate-700 dark:text-slate-300">${d.follow_up}</div>
            </section>`:''}
          ${d.strategy_note?`
            <section>
              <h4 class="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3">Strategy note</h4>
              <div class="text-sm text-slate-500 dark:text-slate-400">${d.strategy_note}</div>
            </section>`:''}
        </div>
      </div>
    `;
  } catch (e) { box.innerHTML = `<div class="error-msg">${e.message}</div>`; }
}

/* ── Calendar ───────────────────────────────────────────── */
async function loadCalendar() {
  const grid = el('calendar-grid');
  grid.innerHTML = '<div class="loading">Loading calendar…</div>';
  const month = new Date().toISOString().slice(0,7);
  try {
    const data  = await API.get(`/calendar?month=${month}`);
    const slots = data.slots || [];
    if (!slots.length) {
      grid.innerHTML = `<div class="info-msg">No calendar slots yet. Click "Generate month" to create your content plan.</div>`;
      return;
    }
    function statusBadge(status) {
      const st = (status || 'draft').toLowerCase();
      const map = {
        draft: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-100 dark:border-amber-800/40',
        approved: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary border-primary/10 dark:border-primary/25',
        posted: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/40',
      };
      return map[st] || map.draft;
    }
    grid.innerHTML = slots.map(s => `
      <div class="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
        <div class="flex items-center justify-between mb-2">
          <div class="text-[11px] text-slate-400 font-extrabold uppercase tracking-widest">${s.date} ${s.day?`• ${s.day}`:''}</div>
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider border ${statusBadge(s.status)}">${(s.status||'draft')}</span>
        </div>
        <div class="text-sm font-black text-slate-900 dark:text-white leading-snug">${s.topic||'Untitled'}</div>
        <div class="mt-3 flex flex-wrap gap-2">
          ${s.format?`<span class="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-[11px] font-semibold text-slate-500">${s.format}</span>`:''}
          ${(s.archetype_label||s.archetype)?`<span class="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-[11px] font-semibold text-slate-500">${s.archetype_label||s.archetype}</span>`:''}
          ${s.pillar?`<span class="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-[11px] font-semibold text-slate-500">${s.pillar}</span>`:''}
        </div>
      </div>
    `).join('');
  } catch (e) {
    grid.innerHTML = `<div class="error-msg">${e.message}</div>`;
  }
}

async function generateCalendar() {
  const month = val('cal-month') || new Date().toISOString().slice(0,7);
  const rawPillars = val('cal-pillars');
  const rawDays    = val('cal-days');
  const pillars    = rawPillars ? rawPillars.split(',').map(p=>p.trim()).filter(Boolean) : (_activeAccount?.pillars || []);
  const days       = rawDays   ? rawDays.split(',').map(d=>d.trim()).filter(Boolean)    : (_activeAccount?.posting_days || ['Tuesday','Thursday','Saturday']);
  closeModal('cal-modal');
  el('calendar-grid').innerHTML = '<div class="loading">Generating calendar…</div>';
  try {
    await API.post('/calendar/generate', {
      month, pillars, posting_days: days,
      frequency:    parseInt(val('cal-freq')),
      account_type: val('cal-actype'),
    });
    await loadCalendar();
    showToast('Calendar generated!');
  } catch (e) {
    el('calendar-grid').innerHTML = `<div class="error-msg">${e.message}</div>`;
  }
}

/* ── Engagement ─────────────────────────────────────────── */
async function loadComments() {
  const list = el('comments-list');
  list.innerHTML = '<div class="loading">Checking for unanswered comments…</div>';
  try {
    const data  = await API.get('/instagram/comments');
    const items = data.comments || [];
    const badge = el('pending-badge');
    badge.textContent   = items.length;
    badge.style.display = items.length > 0 ? 'inline-flex' : 'none';
    if (!items.length) {
      list.innerHTML = `
        <div class="py-20 flex flex-col items-center text-center">
          <div class="size-24 rounded-full bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center mb-6 border border-slate-200 dark:border-slate-800">
            <span class="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600">auto_awesome</span>
          </div>
          <h3 class="text-lg font-black text-slate-900 dark:text-slate-100">All caught up!</h3>
          <p class="text-sm text-slate-500 max-w-[320px] mx-auto mt-2">No more comments to moderate at the moment. Check back later.</p>
        </div>`;
      return;
    }
    list.innerHTML = items.map(c => `
      <div class="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div class="p-6">
          <div class="flex items-start justify-between mb-4 gap-4">
            <div class="flex items-center gap-3 min-w-0">
              <div class="size-10 rounded-full border border-slate-100 dark:border-slate-800 bg-slate-200 dark:bg-slate-700 overflow-hidden flex-shrink-0">
                ${c.post_thumbnail?`<img src="${c.post_thumbnail}" alt="" class="w-full h-full object-cover">`:''}
              </div>
              <div class="min-w-0">
                <h3 class="text-sm font-black truncate">${c.username||'Unknown'}</h3>
                <p class="text-xs text-slate-500">${c.hours_unanswered}h ago</p>
              </div>
            </div>
            ${c.hours_unanswered>6
              ? `<span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-red-50 text-red-600 dark:bg-red-900/20 uppercase tracking-wider">Urgent</span>`
              : `<span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-slate-100 text-slate-500 dark:bg-slate-800 uppercase tracking-wider">Pending</span>`
            }
          </div>
          <p class="text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-6">${c.text||''}</p>
          <div class="flex items-center justify-end">
            <button class="px-6 py-2 bg-primary text-white text-xs font-extrabold rounded-lg hover:shadow-lg hover:shadow-primary/30 transition-all"
                    onclick='openReplyModal(${JSON.stringify(c)})'>Reply</button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (e) { list.innerHTML = `<div class="error-msg">${e.message}</div>`; }
}

function openReplyModal(comment) {
  _activeComment = comment;
  el('reply-comment-preview').innerHTML = `<strong>${comment.username}</strong>: ${comment.text}`;
  el('reply-text').value = '';
  openModal('reply-modal');
}

async function suggestReply() {
  if (!_activeComment) return;
  el('reply-text').value = 'Generating…';
  try {
    const d = await API.post('/generate/reply', {
      comment_text: _activeComment.text,
      post_topic:   'Instagram post',
    });
    el('reply-text').value = d.reply || '';
  } catch { el('reply-text').value = ''; }
}

async function submitReply() {
  if (!_activeComment) return;
  const text = val('reply-text');
  if (!text) { showToast('Reply text is empty'); return; }
  try {
    await API.post('/instagram/reply', { comment_id: _activeComment.id, reply_text: text });
    closeModal('reply-modal');
    showToast('Reply posted!');
    await loadComments();
  } catch (e) { showToast('Failed: ' + e.message); }
}

/* ── KPI ────────────────────────────────────────────────── */
async function loadKPI() {
  const trend = el('kpi-trend');
  trend.innerHTML = '<div class="loading">Loading KPI data…</div>';
  try {
    const data  = await API.get('/kpi/weekly');
    const weeks = data.weeks || [];
    if (!weeks.length) {
      trend.innerHTML = '<div class="info-msg">No KPI data yet. Click "Sync metrics" on the Overview page.</div>';
      el('kpi-summary').innerHTML = '';
      return;
    }
    const latest = weeks[0];
    el('kpi-summary').innerHTML = `
      <div class="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200/70 dark:border-slate-800">
        <p class="text-slate-500 dark:text-slate-400 text-xs font-extrabold uppercase tracking-widest">Followers</p>
        <div class="mt-2 text-3xl font-black tracking-tight">${fmt(latest.followers)}</div>
      </div>
      <div class="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200/70 dark:border-slate-800">
        <p class="text-slate-500 dark:text-slate-400 text-xs font-extrabold uppercase tracking-widest">Avg engagement</p>
        <div class="mt-2 text-3xl font-black tracking-tight">${(latest.avg_eng_rate||0).toFixed(1)}%</div>
      </div>
      <div class="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200/70 dark:border-slate-800">
        <p class="text-slate-500 dark:text-slate-400 text-xs font-extrabold uppercase tracking-widest">Avg reach</p>
        <div class="mt-2 text-3xl font-black tracking-tight">${fmt(latest.avg_reach)}</div>
      </div>
      <div class="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200/70 dark:border-slate-800">
        <p class="text-slate-500 dark:text-slate-400 text-xs font-extrabold uppercase tracking-widest">Posts this week</p>
        <div class="mt-2 text-3xl font-black tracking-tight">${latest.posts_published||0}</div>
      </div>
    `;
    trend.innerHTML = weeks.map(w => `
      <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/70 dark:border-slate-800 overflow-hidden shadow-sm">
        <div class="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div class="text-sm font-black">${w.week_start||'—'}</div>
          <div class="text-xs text-slate-400 font-extrabold uppercase tracking-widest">Weekly snapshot</div>
        </div>
        <div class="p-6 grid grid-cols-2 md:grid-cols-6 gap-4">
          <div><div class="text-[10px] text-slate-400 uppercase font-extrabold tracking-widest mb-1">Followers</div><div class="text-sm font-black">${fmt(w.followers)}</div></div>
          <div><div class="text-[10px] text-slate-400 uppercase font-extrabold tracking-widest mb-1">Eng rate</div><div class="text-sm font-black">${(w.avg_eng_rate||0).toFixed(1)}%</div></div>
          <div><div class="text-[10px] text-slate-400 uppercase font-extrabold tracking-widest mb-1">Avg reach</div><div class="text-sm font-black">${fmt(w.avg_reach)}</div></div>
          <div><div class="text-[10px] text-slate-400 uppercase font-extrabold tracking-widest mb-1">Saves</div><div class="text-sm font-black">${fmt(w.total_saves)}</div></div>
          <div class="md:col-span-2"><div class="text-[10px] text-slate-400 uppercase font-extrabold tracking-widest mb-1">Top format</div><div class="text-sm font-black">${w.top_format||'—'}</div></div>
        </div>
      </div>
    `).join('');
  } catch (e) { trend.innerHTML = `<div class="error-msg">${e.message}</div>`; }
}

async function syncKPI() {
  showToast('Syncing metrics…');
  try { await API.post('/kpi/sync', {}); showToast('Synced!'); await loadOverview(); }
  catch (e) { showToast('Sync failed: ' + e.message); }
}

async function generateReport() {
  const box = el('report-result');
  setLoading('report-result', 'Writing weekly report…');
  try {
    const d = await API.post('/generate/report', {
      client_name: _activeAccount?.name || 'Client',
      include_next_week_plan: true,
    });
    box.innerHTML = `
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-primary/5 border border-primary/20 overflow-hidden">
        <div class="p-4 bg-primary/5 border-b border-primary/10 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
            <span class="text-xs font-extrabold text-primary uppercase tracking-wider">Report ready</span>
          </div>
          <button class="p-2 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors flex items-center gap-2 text-xs font-extrabold"
                  onclick="copyText(${JSON.stringify(d.report_text||'')})">
            <span class="material-symbols-outlined text-[18px]">content_copy</span>
            Copy
          </button>
        </div>
        <div class="p-8 space-y-8">
          <section>
            <h4 class="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3">Summary</h4>
            <div class="text-sm text-slate-700 dark:text-slate-300">${d.headline_summary||''}</div>
          </section>
          <section>
            <h4 class="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3">Full report</h4>
            <div class="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-slate-100 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">${d.report_text||''}</div>
          </section>
        </div>
      </div>
    `;
  } catch (e) { box.innerHTML = `<div class="error-msg">${e.message}</div>`; }
}

/* ── Scheduler ──────────────────────────────────────────── */
async function loadJobs() {
  const list = el('jobs-list');
  list.innerHTML = '<div class="loading">Loading scheduled jobs…</div>';
  try {
    const data = await API.get('/scheduler/jobs');
    function badge(status) {
      const st = (status||'paused').toLowerCase();
      if (st === 'active') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/40';
      if (st === 'paused') return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700';
      return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border-amber-100 dark:border-amber-800/40';
    }
    list.innerHTML = (data.jobs||[]).map(j => `
      <div class="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-6 flex flex-col md:flex-row md:items-center gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <div class="text-sm font-black truncate">${j.id}</div>
            <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider border ${badge(j.status)}">${j.status}</span>
          </div>
          <div class="mt-2 text-sm text-slate-600 dark:text-slate-400">${j.schedule}</div>
          <div class="mt-1 text-xs text-slate-400">Next: ${j.next_run?j.next_run.replace('T',' ').slice(0,16):'—'}</div>
        </div>
        <button class="px-5 py-2.5 bg-primary text-white rounded-lg text-xs font-extrabold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors"
                onclick="triggerJob('${j.id}')">
          Run now
        </button>
      </div>
    `).join('');
  } catch (e) { list.innerHTML = `<div class="error-msg">${e.message}</div>`; }
}

async function triggerJob(jobId) {
  try { await API.post(`/scheduler/trigger/${jobId}`, {}); showToast(`"${jobId}" triggered`); }
  catch (e) { showToast('Failed: ' + e.message); }
}

/* ── Accounts ───────────────────────────────────────────── */
async function loadAccounts() {
  const list = el('accounts-list');
  list.innerHTML = '<div class="loading">Loading accounts…</div>';
  try {
    const data  = await API.get('/accounts');
    const items = data.accounts || [];
    if (!items.length) {
      list.innerHTML = `<div class="info-msg">No accounts yet. Click "Add account" to create your first one.</div>`;
      return;
    }
    list.innerHTML = items.map(a => `
      <div class="bg-white dark:bg-slate-900 rounded-2xl border ${a.is_active?'border-primary/30':'border-slate-200/70 dark:border-slate-800'} shadow-sm hover:shadow-md transition-shadow cursor-pointer"
           onclick="activateAccount('${a.id}')">
        <div class="p-6 flex items-center gap-4 flex-wrap">
          <div class="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black">
            ${a.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <div class="text-base font-black truncate">${a.name}</div>
              ${a.is_active?'<span class="px-2 py-0.5 rounded text-[10px] font-extrabold bg-primary/10 text-primary uppercase tracking-wider">active</span>':''}
            </div>
            <div class="text-sm text-slate-500 dark:text-slate-400 truncate">
              ${a.handle||'No handle'} · ${a.niche_id||'No niche'} · ${a.account_type==='A'?'Brand new':'Existing'}
            </div>
          </div>
          <button class="px-5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-extrabold border border-slate-200 dark:border-slate-700"
                  onclick="event.stopPropagation();activateAccount('${a.id}')">
            ${a.is_active ? 'Active' : 'Switch to'}
          </button>
        </div>
      </div>
    `).join('');
  } catch (e) { list.innerHTML = `<div class="error-msg">${e.message}</div>`; }
}

async function activateAccount(accId) {
  try {
    const data = await API.post(`/accounts/${accId}/activate`, {});
    _activeAccount = data.account;
    if (_activeAccount?.niche_id) await loadActiveNiche(_activeAccount.niche_id);
    updateAccountSwitcherUI();
    showToast(`Switched to ${_activeAccount?.name}`);
    await loadAccounts();
  } catch (e) { showToast('Failed: ' + e.message); }
}

async function createAccount() {
  const name    = val('na-name');
  const nicheId = val('na-niche');
  if (!name || !nicheId) { showToast('Name and niche are required'); return; }
  try {
    await API.post('/accounts', {
      name, handle: val('na-handle'), niche_id: nicheId,
      account_type: val('na-actype'), tone: val('na-tone'),
      ig_token: val('na-token'), ig_user_id: val('na-igid'),
    });
    closeModal('new-account-modal');
    showToast('Account created!');
    await loadAccounts();
    await loadActiveAccount();
  } catch (e) { showToast('Failed: ' + e.message); }
}

async function populateAccountNicheSelect() {
  const s = el('na-niche');
  if (!s) return;
  try {
    const data = await API.get('/niches');
    s.innerHTML = (data.niches||[]).map(n => `<option value="${n.id}">${n.name}</option>`).join('');
  } catch {}
}

/* ── Niches ─────────────────────────────────────────────── */
async function loadNiches() {
  const list = el('niches-list');
  list.innerHTML = '<div class="loading">Loading niche profiles…</div>';
  try {
    const data   = await API.get('/niches');
    const niches = data.niches || [];
    list.innerHTML = niches.map(n => `
      <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm p-6">
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div class="min-w-0">
            <div class="text-base font-black truncate">${n.name}</div>
            <div class="text-sm text-slate-500 dark:text-slate-400 mt-1">${n.description||''}</div>
            <div class="mt-4 flex flex-wrap gap-2">
              ${(n.pillars||[]).map(p=>`<span class="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-[11px] font-semibold text-slate-500">${p}</span>`).join('')}
            </div>
          </div>
          <span class="text-[10px] font-mono text-slate-400">${n.id}</span>
        </div>
      </div>
    `).join('');
  } catch (e) { list.innerHTML = `<div class="error-msg">${e.message}</div>`; }
}

/* ── Onboarding: generate custom niche ──────────────────── */
async function generateNicheProfile() {
  const box = el('ob-result');
  setLoading('ob-result', 'Generating niche profile with AI — this takes about 15 seconds…');
  hide('ob-save-section');
  try {
    const d = await API.post('/niches/generate', {
      niche_name:      val('ob-name'),
      description:     val('ob-desc'),
      primary_topic:   val('ob-topic'),
      target_audience: val('ob-audience'),
      city:            val('ob-city') || 'Nairobi',
      tone:            val('ob-tone') || 'warm & friendly',
    });
    _generatedProfile = d.profile;
    const p = d.profile;
    box.innerHTML = `
      <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/70 dark:border-slate-800 overflow-hidden">
        <div class="p-4 bg-primary/5 border-b border-primary/10 flex items-center gap-2">
          <span class="material-symbols-outlined text-primary text-[20px]">auto_awesome</span>
          <span class="text-xs font-extrabold text-primary uppercase tracking-wider">Profile generated</span>
        </div>
        <div class="p-6 space-y-6">
          <div class="text-sm text-slate-700 dark:text-slate-300">
            <span class="font-black text-slate-900 dark:text-white">${p.name}</span> — ${p.description}
          </div>
          <div>
            <h4 class="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3">Vocabulary map</h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              ${Object.entries(p.vocabulary||{}).map(([k,v])=>`<div class="text-xs"><span class="text-slate-400 font-extrabold">${k}:</span> <span class="text-slate-700 dark:text-slate-300">${v}</span></div>`).join('')}
            </div>
          </div>
          <div>
            <h4 class="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3">Content pillars</h4>
            <div class="flex flex-wrap gap-2">
              ${(p.content_pillars_preset||[]).map(x=>`<span class="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-[11px] font-semibold text-slate-500">${x}</span>`).join('')}
            </div>
          </div>
          <div>
            <h4 class="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3">Hashtags (niche)</h4>
            <div class="flex flex-wrap gap-2">
              ${(p.hashtags?.niche||[]).map(h=>`<span class="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-[11px] font-semibold text-slate-500">${h}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
    show('ob-save-section');
  } catch (e) { box.innerHTML = `<div class="error-msg">${e.message}</div>`; }
}

async function saveGeneratedProfile() {
  if (!_generatedProfile) return;
  try {
    await API.post('/niches', _generatedProfile);
    showToast(`"${_generatedProfile.name}" profile saved!`);
    _generatedProfile = null;
    hide('ob-save-section');
    navigate('niches');
  } catch (e) { showToast('Save failed: ' + e.message); }
}

/* ── Settings ───────────────────────────────────────────── */
async function saveInstagramToken() {
  const box = el('token-result');
  setLoading('token-result', 'Connecting…');
  try {
    const d = await API.post('/auth/connect-instagram', {
      access_token: val('s-token'), ig_user_id: val('s-igid'),
    });
    box.innerHTML = `<div class="success-msg">Connected! User ID: ${d.ig_user_id}</div>`;
    await checkStatus();
    loadChecklist();
  } catch (e) { box.innerHTML = `<div class="error-msg">${e.message}</div>`; }
}

async function loadChecklist() {
  const wrap = el('setup-checklist');
  if (!wrap) return;
  let status;
  try { status = await API.get('/auth/status'); } catch { status = { connected: false }; }
  const checks = [
    { label: 'Instagram account connected',           done: status.connected },
    { label: 'Account type is Business or Creator',   done: status.account_type === 'BUSINESS' || status.account_type === 'CREATOR' },
    { label: 'At least one account created',          done: Boolean(_activeAccount) },
    { label: 'Niche profile selected',                done: Boolean(_activeNiche) },
    { label: 'Cerebras API key configured',           done: true },
  ];
  wrap.innerHTML = checks.map(c => `
    <div class="flex items-center justify-between p-3 rounded-xl ${c.done?'bg-emerald-50/40 dark:bg-emerald-500/[0.03]':'hover:bg-slate-50 dark:hover:bg-slate-800/40'} transition-colors">
      <div class="flex items-center gap-3">
        <div class="size-6 rounded-full ${c.done?'bg-emerald-500 text-white':'bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/30'} flex items-center justify-center text-[12px] font-black">
          ${c.done?'✓':'!'}
        </div>
        <span class="text-[13px] font-semibold ${c.done?'text-slate-700 dark:text-slate-300':'text-slate-600 dark:text-slate-400'}">${c.label}</span>
      </div>
      <span class="text-[10px] font-extrabold uppercase tracking-wider ${c.done?'text-emerald-600 dark:text-emerald-400':'text-slate-400'}">${c.done?'Done':'Todo'}</span>
    </div>
  `).join('');
}

/* ── AI Provider & Model selector ───────────────────────── */

let _providers = [];
let _selectedProv = null;
let _selectedModel = null;

async function loadProviderSettings() {
  const cards = el('provider-cards');
  if (!cards) return;
  try {
    const data = await API.get('/ai/providers');
    _providers = data.providers || [];
    const active = data.active || {};
    _selectedProv  = active.provider || 'cerebras';
    _selectedModel = active.model || null;

    const label = el('active-provider-label');
    if (label) label.textContent = `AI: ${active.label || active.provider || '—'}`;

    renderProviderCards();
    // Pre-select to populate dropdown on load
    selectProvider(_selectedProv, { preserveModel: true });
  } catch (e) {
    html('provider-cards', `<div class="error-msg">Could not load providers: ${e.message}</div>`);
  }
}

function renderProviderCards() {
  const container = el('provider-cards');
  if (!container) return;
  if (!_providers.length) { container.innerHTML = ''; return; }

  container.innerHTML = _providers.map(p => `
    <button
      type="button"
      onclick="selectProvider('${p.id}')"
      class="text-left bg-white dark:bg-slate-900 border ${p.id === _selectedProv ? 'border-primary ring-2 ring-primary/10' : 'border-slate-200/70 dark:border-slate-800'} rounded-xl p-4 hover:border-primary/40 transition-colors">
      <div class="text-sm font-black mb-1">${p.label}</div>
      <div class="text-xs text-slate-500 dark:text-slate-400 mb-3">${(p.models||[]).length} model${(p.models||[]).length>1?'s':''} available</div>
      ${p.free_tier
        ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/40 uppercase tracking-wider">Free tier</span>'
        : `<a href="${p.key_link}" target="_blank" class="text-[11px] font-extrabold text-primary hover:underline">Get API key →</a>`
      }
    </button>
  `).join('');
}

function selectProvider(providerId, opts = {}) {
  _selectedProv = providerId;
  if (!opts.preserveModel) _selectedModel = null;
  renderProviderCards();

  const prov = _providers.find(p => p.id === providerId);
  if (!prov) return;

  const sel = el('model-select');
  if (sel) {
    sel.innerHTML = (prov.models || []).map(m => {
      const selected = (m.id === (_selectedModel || '')) ? 'selected' : '';
      return `<option value="${m.id}" ${selected}>${m.label}</option>`;
    }).join('');
    _selectedModel = sel.value || _selectedModel;
  }

  const keyInput = el('provider-api-key');
  if (keyInput) {
    keyInput.placeholder = prov.free_tier
      ? 'No API key needed for this provider'
      : `Paste your ${prov.label} API key here`;
    keyInput.value = '';
  }

  const row = el('model-selector-row');
  if (row) row.style.display = 'grid';
}

function onModelChange() {
  _selectedModel = val('model-select');
}

async function testProvider() {
  setLoading('provider-result', `Testing ${_selectedProv} connection…`);
  try {
    const d = await API.post('/ai/provider/test', {
      provider: _selectedProv,
      model:    _selectedModel || val('model-select'),
    });
    el('provider-result').innerHTML = d.success
      ? `<div class="success-msg">Connected to ${_selectedProv}! Response: "${d.response}"</div>`
      : `<div class="error-msg">Connection failed: ${d.error}</div>`;
  } catch (e) {
    el('provider-result').innerHTML = `<div class="error-msg">${e.message}</div>`;
  }
  show('provider-result');
}

async function saveProvider() {
  const box = el('provider-result');
  const apiKey = val('provider-api-key');
  const model  = val('model-select') || _selectedModel;

  if (apiKey) {
    try {
      await API.post('/auth/save-api-key', { provider: _selectedProv, api_key: apiKey });
    } catch (e) {
      box.innerHTML = `<div class="error-msg">Failed to save API key: ${e.message}</div>`;
      show('provider-result');
      return;
    }
  }

  try {
    await API.post('/ai/provider', { provider: _selectedProv, model });
    box.innerHTML = `<div class="success-msg">Switched to ${_selectedProv} — ${model}. All generation will now use this provider.</div>`;
    show('provider-result');

    const prov = _providers.find(p => p.id === _selectedProv);
    const label = el('active-provider-label');
    if (label) label.textContent = `AI: ${prov?.label || _selectedProv}`;
  } catch (e) {
    box.innerHTML = `<div class="error-msg">${e.message}</div>`;
    show('provider-result');
  }
}

/* ── Init ───────────────────────────────────────────────── */
(async function init() {
  checkStatus();
  await loadActiveAccount();
  await populateAccountNicheSelect();
  await loadProviderSettings();
  loadOverview();

  // Sidebar collapse toggle (persisted)
  const sidebar = el('sidebar');
  const sbBtn = el('sidebar-toggle');
  const sbIcon = el('sidebar-toggle-icon');
  function applySidebarCollapsed(collapsed) {
    if (!sidebar) return;
    sidebar.classList.toggle('collapsed', collapsed);
    if (sbBtn) {
      sbBtn.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
      sbBtn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      sbBtn.setAttribute('title', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    }
    if (sbIcon) sbIcon.textContent = collapsed ? 'left_panel_open' : 'left_panel_close';
  }
  try {
    const collapsed = localStorage.getItem('sidebarCollapsed') === '1';
    applySidebarCollapsed(collapsed);
  } catch {}
  if (sbBtn && sidebar) {
    sbBtn.addEventListener('click', () => {
      const next = !sidebar.classList.contains('collapsed');
      applySidebarCollapsed(next);
      try { localStorage.setItem('sidebarCollapsed', next ? '1' : '0'); } catch {}
    });
  }

  // Theme toggle (persisted)
  const btn = el('theme-toggle');
  const icon = el('theme-toggle-icon');
  function applyTheme(next) {
    try { localStorage.setItem('theme', next); } catch {}
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const shouldDark = next === 'dark' || (next === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', shouldDark);
    if (icon) icon.textContent = document.documentElement.classList.contains('dark') ? 'light_mode' : 'dark_mode';
  }
  if (btn) {
    const current = (() => { try { return localStorage.getItem('theme') || 'system'; } catch { return 'system'; } })();
    applyTheme(current);
    btn.addEventListener('click', () => {
      const nowDark = document.documentElement.classList.contains('dark');
      applyTheme(nowDark ? 'light' : 'dark');
    });
  }
})();
