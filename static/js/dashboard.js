/* ── State ──────────────────────────────────────────────── */
let _activeAccount  = null;   // full account object
let _activeNiche    = null;   // full niche profile object
let _archetypes     = [];     // current niche's archetype list
let _activeComment  = null;
let _generatedProfile = null; // holds AI-generated profile pending save

/* ── Navigation ─────────────────────────────────────────── */
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  const navEl  = document.querySelector(`[data-page="${page}"]`);
  if (pageEl) pageEl.classList.add('active');
  if (navEl)  navEl.classList.add('active');

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
  if (_activeNiche) {
    pill.textContent = _activeNiche.name;
    pill.style.display = 'inline-block';
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

/* ── Overview ───────────────────────────────────────────── */
async function loadOverview() {
  try {
    const [metrics, comments, kpi] = await Promise.allSettled([
      API.get('/instagram/metrics'),
      API.get('/instagram/comments'),
      API.get('/kpi/weekly'),
    ]);
    if (metrics.status === 'fulfilled') {
      el('m-followers').textContent = fmt(metrics.value.followers);
      el('m-reach').textContent     = fmt(metrics.value.reach_7d);
    }
    if (kpi.status === 'fulfilled' && kpi.value.weeks?.length) {
      const w = kpi.value.weeks[0];
      el('m-eng').textContent = (w.avg_eng_rate || 0).toFixed(1) + '%';
      const delta = w.follower_delta || 0;
      el('m-followers-delta').textContent  = (delta >= 0 ? '+' : '') + delta + ' this week';
      el('m-followers-delta').className    = 'metric-delta ' + (delta >= 0 ? 'up' : 'down');
    }
    if (comments.status === 'fulfilled') {
      const cnt = comments.value.pending_count || 0;
      el('m-comments').textContent = cnt;
      const b = el('pending-badge');
      b.textContent    = cnt;
      b.style.display  = cnt > 0 ? 'inline-flex' : 'none';
    }
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
      <div class="post-card">
        <div class="post-thumb">${p.thumbnail ? `<img src="${p.thumbnail}" alt="" loading="lazy">` : 'No preview'}</div>
        <div class="post-meta">
          <div class="post-type">${p.type}</div>
          <div class="post-stats">
            <div class="post-stat"><strong>${fmt(p.metrics.reach)}</strong><br>reach</div>
            <div class="post-stat"><strong>${p.metrics.engagement_rate}%</strong><br>eng.</div>
            <div class="post-stat"><strong>${fmt(p.metrics.saves)}</strong><br>saves</div>
            <div class="post-stat"><strong>${fmt(p.metrics.shares)}</strong><br>shares</div>
          </div>
        </div>
      </div>`).join('');
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
      <div class="result-section"><div class="result-label">Hook</div><div class="result-text">${d.hook}</div></div>
      <div class="result-section"><div class="result-label">Body</div><div class="result-text">${(d.body||'').replace(/\n/g,'<br>')}</div></div>
      <div class="result-section"><div class="result-label">CTA</div><div class="result-text">${d.cta}</div></div>
      <div class="result-section">
        <div class="result-label">Hashtags</div>
        <div class="hashtag-row">${(d.hashtags||[]).map(h=>`<span class="hashtag">${h}</span>`).join('')}</div>
      </div>
      ${d.variations?.length ? `<div class="result-section"><div class="result-label">Alt hooks</div>${d.variations.map((v,i)=>`<div class="result-text">Alt ${i+1}: ${v.hook}</div>`).join('')}</div>` : ''}
      ${d.best_time_to_post ? `<div class="result-section"><div class="result-label">Best time to post</div><div class="result-text">${d.best_time_to_post}</div></div>` : ''}
      <button class="copy-btn" onclick="copyText(${JSON.stringify(`${d.hook}\n\n${d.body||''}\n\n${d.cta}\n\n${(d.hashtags||[]).join(' ')}`)})">Copy full caption</button>`;
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
      <div class="result-section"><div class="result-label">Title</div><div class="result-text">${d.title||''}</div></div>
      <div class="result-section"><div class="result-label">Script</div>
        ${(d.script||[]).map(b=>`<div class="script-beat"><div class="script-time">${b.time}</div><div class="script-spoken">${b.spoken||''}</div>${b.action?`<div class="script-text">Action: ${b.action}</div>`:''}<div class="script-text">On screen: "${b.on_screen_text||''}"</div></div>`).join('')}
      </div>
      <div class="result-section"><div class="result-label">Audio</div><div class="result-text">${d.audio_suggestion||''}</div></div>
      <div class="result-section"><div class="result-label">CTA</div><div class="result-text">${d.cta||''}</div></div>
      ${d.filming_tips?.length?`<div class="result-section"><div class="result-label">Filming tips</div>${d.filming_tips.map(t=>`<div class="result-text">• ${t}</div>`).join('')}</div>`:''}`;
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
      <div class="result-section"><div class="result-label">Title</div><div class="result-text">${d.title||''}</div></div>
      <div class="result-section"><div class="result-label">Slides</div>
        ${(d.slides||[]).map(s=>`<div class="slide-card"><div class="slide-num">Slide ${s.number} — ${s.type||''}</div><div class="slide-headline">${s.headline||''}</div>${s.subtext?`<div class="slide-detail">${s.subtext}</div>`:''}<div class="slide-detail" style="color:var(--text-muted)">${s.visual_direction||''}</div></div>`).join('')}
      </div>
      <div class="result-section"><div class="result-label">Caption</div><div class="result-text">${(d.caption||'').replace(/\n/g,'<br>')}</div></div>
      <div class="hashtag-row">${(d.hashtags||[]).map(h=>`<span class="hashtag">${h}</span>`).join('')}</div>
      <button class="copy-btn" onclick="copyText(${JSON.stringify(d.caption||'')})">Copy caption</button>`;
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
      <div class="result-section"><div class="result-label">Message</div><div class="result-text">${(d.body||'').replace(/\n/g,'<br>')}</div></div>
      ${d.follow_up?`<div class="result-section"><div class="result-label">5-day follow-up</div><div class="result-text">${d.follow_up}</div></div>`:''}
      ${d.strategy_note?`<div class="result-section"><div class="result-label">Strategy note</div><div class="result-text" style="color:var(--text-secondary)">${d.strategy_note}</div></div>`:''}
      <button class="copy-btn" onclick="copyText(${JSON.stringify(d.body||'')})">Copy DM</button>`;
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
    grid.innerHTML = slots.map(s => `
      <div class="slot-card">
        <div class="slot-date">${s.date} — ${s.day||''}</div>
        <div class="slot-topic">${s.topic||'Untitled'}</div>
        <div class="slot-meta">
          <span class="slot-tag">${s.format||''}</span>
          <span class="slot-tag">${s.archetype_label||s.archetype||''}</span>
          <span class="slot-tag">${s.pillar||''}</span>
          <span class="slot-status ${s.status||'draft'}">${s.status||'draft'}</span>
        </div>
      </div>`).join('');
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
    if (!items.length) { list.innerHTML = '<div class="success-msg">All comments answered — great work!</div>'; return; }
    list.innerHTML = items.map(c => `
      <div class="comment-card">
        <div class="comment-thumb">${c.post_thumbnail?`<img src="${c.post_thumbnail}" alt="">`:''}</div>
        <div class="comment-content">
          <div class="comment-header">
            <span class="comment-username">${c.username||'Unknown'}</span>
            <span class="comment-age ${c.hours_unanswered>6?'urgent':''}">${c.hours_unanswered}h ago</span>
          </div>
          <div class="comment-text">${c.text||''}</div>
          <button class="copy-btn" onclick='openReplyModal(${JSON.stringify(c)})'>Reply</button>
        </div>
      </div>`).join('');
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
      <div class="metric-card"><div class="metric-label">Followers</div><div class="metric-value">${fmt(latest.followers)}</div></div>
      <div class="metric-card"><div class="metric-label">Avg engagement</div><div class="metric-value">${(latest.avg_eng_rate||0).toFixed(1)}%</div></div>
      <div class="metric-card"><div class="metric-label">Avg reach</div><div class="metric-value">${fmt(latest.avg_reach)}</div></div>
      <div class="metric-card"><div class="metric-label">Posts this week</div><div class="metric-value">${latest.posts_published||0}</div></div>`;
    trend.innerHTML = weeks.map(w => `
      <div class="kpi-week-row">
        <div class="kpi-week-label">${w.week_start||'—'}</div>
        <div class="kpi-cell"><div class="kpi-cell-label">Followers</div>${fmt(w.followers)}</div>
        <div class="kpi-cell"><div class="kpi-cell-label">Eng rate</div>${(w.avg_eng_rate||0).toFixed(1)}%</div>
        <div class="kpi-cell"><div class="kpi-cell-label">Avg reach</div>${fmt(w.avg_reach)}</div>
        <div class="kpi-cell"><div class="kpi-cell-label">Saves</div>${fmt(w.total_saves)}</div>
        <div class="kpi-cell"><div class="kpi-cell-label">Top format</div>${w.top_format||'—'}</div>
      </div>`).join('');
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
      <div class="result-section"><div class="result-label">Summary</div><div class="result-text">${d.headline_summary||''}</div></div>
      <div class="result-section"><div class="result-label">Full report</div><div class="result-text" style="white-space:pre-wrap">${d.report_text||''}</div></div>
      <button class="copy-btn" onclick="copyText(${JSON.stringify(d.report_text||'')})">Copy report</button>`;
  } catch (e) { box.innerHTML = `<div class="error-msg">${e.message}</div>`; }
}

/* ── Scheduler ──────────────────────────────────────────── */
async function loadJobs() {
  const list = el('jobs-list');
  list.innerHTML = '<div class="loading">Loading scheduled jobs…</div>';
  try {
    const data = await API.get('/scheduler/jobs');
    list.innerHTML = (data.jobs||[]).map(j => `
      <div class="job-row">
        <div class="job-id">${j.id}</div>
        <div class="job-schedule">${j.schedule}</div>
        <div class="job-next">Next: ${j.next_run?j.next_run.replace('T',' ').slice(0,16):'—'}</div>
        <span class="job-badge ${j.status}">${j.status}</span>
        <button class="copy-btn" onclick="triggerJob('${j.id}')">Run now</button>
      </div>`).join('');
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
      <div class="settings-section" style="margin-bottom:10px;cursor:pointer" onclick="activateAccount('${a.id}')">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <div class="account-avatar" style="width:36px;height:36px;font-size:13px">${a.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}</div>
          <div style="flex:1">
            <div style="font-size:14px;font-weight:500">${a.name} ${a.is_active?'<span class="slot-status approved" style="font-size:10px;margin-left:4px">active</span>':''}</div>
            <div style="font-size:12px;color:var(--text-secondary)">${a.handle||'No handle'} · ${a.niche_id||'No niche'} · ${a.account_type==='A'?'Brand new':'Existing'}</div>
          </div>
          <button class="btn-secondary" style="font-size:11px;padding:4px 10px" onclick="event.stopPropagation();activateAccount('${a.id}')">
            ${a.is_active ? 'Active' : 'Switch to'}
          </button>
        </div>
      </div>`).join('');
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
      <div class="settings-section" style="margin-bottom:10px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <div style="font-size:14px;font-weight:500;margin-bottom:3px">${n.name}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">${n.description}</div>
            <div style="display:flex;flex-wrap:wrap;gap:5px">
              ${(n.pillars||[]).map(p=>`<span class="slot-tag">${p}</span>`).join('')}
            </div>
          </div>
          <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);padding-top:2px">${n.id}</span>
        </div>
      </div>`).join('');
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
      <div class="result-section"><div class="result-label">Profile generated</div>
        <div class="result-text"><strong>${p.name}</strong> — ${p.description}</div>
      </div>
      <div class="result-section"><div class="result-label">Vocabulary map</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px">
          ${Object.entries(p.vocabulary||{}).map(([k,v])=>`<div style="font-size:12px"><span style="color:var(--text-muted)">${k}:</span> ${v}</div>`).join('')}
        </div>
      </div>
      <div class="result-section"><div class="result-label">Content pillars</div>
        <div class="hashtag-row">${(p.content_pillars_preset||[]).map(x=>`<span class="hashtag">${x}</span>`).join('')}</div>
      </div>
      <div class="result-section"><div class="result-label">Hashtags (niche)</div>
        <div class="hashtag-row">${(p.hashtags?.niche||[]).map(h=>`<span class="hashtag">${h}</span>`).join('')}</div>
      </div>`;
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
    <div class="check-item">
      <div class="check-icon ${c.done?'done':'todo'}">${c.done?'✓':'!'}</div>
      <span style="color:${c.done?'var(--text-primary)':'var(--text-secondary)'}">${c.label}</span>
    </div>`).join('');
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
    <div
      onclick="selectProvider('${p.id}')"
      style="
        background: var(--color-background-primary);
        border: ${p.id === _selectedProv ? '2px solid var(--accent)' : '0.5px solid var(--color-border-secondary)'};
        border-radius: var(--border-radius-lg);
        padding: 12px 14px;
        cursor: pointer;
        transition: border-color .12s;
      ">
      <div style="font-size:13px;font-weight:500;margin-bottom:3px">${p.label}</div>
      <div style="font-size:11px;color:var(--color-text-secondary);margin-bottom:6px">${(p.models||[]).length} model${(p.models||[]).length>1?'s':''} available</div>
      ${p.free_tier
        ? '<span style="font-size:10px;background:var(--color-background-success);color:var(--color-text-success);padding:2px 8px;border-radius:8px;font-weight:500">Free tier</span>'
        : `<a href="${p.key_link}" target="_blank" style="font-size:10px;color:var(--color-text-info)">Get API key →</a>`
      }
    </div>
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
})();
