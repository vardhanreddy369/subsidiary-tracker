/* === Company Browser & Detail Views — Premium UI === */

let currentPage = 1;
let currentQuery = '';
let _subsPage = 1;
const _SUBS_PER_PAGE = 50;

async function renderCompanyBrowser(params = {}) {
    currentQuery = params.q || '';
    currentPage = params.page || 1;

    app.innerHTML = `
        <div class="loading-screen page-transition">
            <div class="spinner"></div>
            <p>Loading companies...</p>
        </div>`;

    const q = currentQuery ? `&q=${encodeURIComponent(currentQuery)}` : '';
    const data = await api(`/api/companies?page=${currentPage}&per_page=25${q}`);

    app.innerHTML = `
        <div class="page-transition">
            <h2 class="text-gradient" style="margin-bottom: 1.5rem; font-size: 1.75rem;">Companies</h2>

            <div class="search-box glass-card" style="padding: 1rem 1.25rem; margin-bottom: 1.5rem;">
                <input type="text" id="compSearch" placeholder="Search companies..."
                       value="${escapeHtml(currentQuery)}"
                       onkeydown="if(event.key==='Enter') navigate('companies', {q: this.value})">
                <button class="btn btn-primary btn-glow" onclick="navigate('companies', {q: document.getElementById('compSearch').value})">
                    Search
                </button>
            </div>

            <p style="color: var(--text-dim); margin-bottom: 1rem; font-size: 0.85rem;">
                Showing ${formatNumber(data.companies.length)} of ${formatNumber(data.total)} companies
            </p>

            <div class="table-container glass-card reveal">
                <table class="premium-table">
                    <thead>
                        <tr>
                            <th>Company Name</th>
                            <th>CIK</th>
                            <th>Subsidiaries</th>
                            <th>Filings</th>
                            <th>Period</th>
                        </tr>
                    </thead>
                    <tbody class="stagger-in">
                        ${data.companies.map((c, i) => `
                            <tr class="clickable table-row-animate float-in" style="animation-delay: ${Math.min(i * 30, 500)}ms;"
                                onclick="navigate('company', {cik: '${c.cik}'})">
                                <td><strong>${escapeHtml(c.company_name)}</strong></td>
                                <td style="font-family: monospace; color: var(--text-dim);">${c.cik}</td>
                                <td><span class="counter-glow">${formatNumber(c.num_subsidiaries)}</span></td>
                                <td>${c.num_filings}</td>
                                <td style="font-size: 0.8rem; color: var(--text-dim);">${c.first_filing} to ${c.last_filing}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <div class="pagination" style="margin-top: 1.25rem;">
                <button class="btn-glow" ${currentPage <= 1 ? 'disabled' : ''} onclick="navigate('companies', {q: '${currentQuery}', page: ${currentPage - 1}})">Prev</button>
                <span class="page-info" style="color: var(--text-dim);">Page ${data.page} of ${data.total_pages}</span>
                <button class="btn-glow" ${currentPage >= data.total_pages ? 'disabled' : ''} onclick="navigate('companies', {q: '${currentQuery}', page: ${currentPage + 1}})">Next</button>
            </div>
        </div>
    `;
}


async function renderCompanyDetail(cik) {
    app.innerHTML = `
        <div class="loading-screen page-transition">
            <div class="spinner"></div>
            <p>Loading company data...</p>
        </div>`;

    const data = await api(`/api/companies/${cik}`);
    if (data.error) {
        app.innerHTML = `<div class="empty-state"><p>${escapeHtml(data.error)}</p></div>`;
        return;
    }

    const { company, filing_dates, subsidiaries } = data;
    const activeSubs = subsidiaries.filter(s => s.time_out && s.time_out.startsWith('Active'));
    const divestedSubs = subsidiaries.filter(s => s.time_out && !s.time_out.startsWith('Active'));

    app.innerHTML = `
        <div class="page-transition">
            <span class="back-link" onclick="navigate('companies')">&larr; Back to Companies</span>

            <div class="company-header glass-card float-in" style="padding: 2rem; margin-bottom: 2rem; border-radius: 16px; background: linear-gradient(135deg, rgba(124,92,252,0.12) 0%, rgba(124,92,252,0.08) 50%, rgba(236,72,153,0.06) 100%), var(--surface); border: 1px solid rgba(124,92,252,0.2);">
                <h1 class="text-gradient" style="font-size: 2rem; margin-bottom: 0.75rem;">${escapeHtml(company.company_name)}</h1>
                <div class="company-meta" style="display: flex; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 0.5rem;">
                    <span>CIK: <strong style="font-family: monospace;">${company.cik}</strong></span>
                    <span>Filings: <strong>${company.num_filings}</strong></span>
                    <span>Period: <strong>${company.first_filing} to ${company.last_filing}</strong></span>
                    <span>Subsidiaries: <strong class="counter-glow">${formatNumber(subsidiaries.length)}</strong></span>
                </div>
                <div style="margin-top: 1rem; display: flex; gap: 0.5rem; align-items: center;">
                    <a href="/api/companies/${cik}/export" class="btn btn-outline btn-sm btn-glow" download>Export CSV</a>
                    <div style="display: flex; align-items: center; gap: 0.5rem; background: var(--surface2); border-radius: 8px; padding: 2px;">
                        <button id="modeturbo" class="filter-pill active" onclick="window._enrichMode='turbo'; document.querySelectorAll('[id^=mode]').forEach(b=>b.classList.remove('active')); this.classList.add('active');" style="margin:0;">Turbo</button>
                        <button id="modefast" class="filter-pill" onclick="window._enrichMode='fast'; document.querySelectorAll('[id^=mode]').forEach(b=>b.classList.remove('active')); this.classList.add('active');" style="margin:0;">Fast</button>
                        <button id="modefull" class="filter-pill" onclick="window._enrichMode='full'; document.querySelectorAll('[id^=mode]').forEach(b=>b.classList.remove('active')); this.classList.add('active');" style="margin:0;">Full (AI)</button>
                    </div>
                    <button id="bulkEnrichBtn" onclick="runBulkEnrich('${cik}', window._enrichMode || 'turbo')" class="btn btn-sm btn-glow" style="background: linear-gradient(135deg, #7c5cfc, #ec4899); color: #fff; border: none; padding: 0.5rem 1.25rem; border-radius: 8px; font-weight: 600; cursor: pointer;">
                        Enrich All (${subsidiaries.filter(s => !s.enriched).length} unenriched)
                    </button>
                </div>
                <div id="bulkEnrichProgress" style="margin-top: 1rem;"></div>
            </div>

            <div class="stats-grid reveal stagger-in" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 2rem;">
                <div class="stat-card glow-card scale-in" style="animation-delay: 0ms;">
                    <div class="label">Total Subs</div>
                    <div class="value blue counter-glow">${formatNumber(subsidiaries.length)}</div>
                </div>
                <div class="stat-card glow-card scale-in" style="animation-delay: 80ms;">
                    <div class="label">Active</div>
                    <div class="value green counter-glow">${formatNumber(activeSubs.length)}</div>
                </div>
                <div class="stat-card glow-card scale-in" style="animation-delay: 160ms;">
                    <div class="label">Divested</div>
                    <div class="value yellow counter-glow">${formatNumber(divestedSubs.length)}</div>
                </div>
                <div class="stat-card glow-card scale-in" style="animation-delay: 240ms;">
                    <div class="label">Filing Dates</div>
                    <div class="value primary counter-glow">${filing_dates.length}</div>
                </div>
            </div>

            ${subsidiaries.length <= 50 ? `
            <div class="chart-container glass-card reveal float-in" style="margin-bottom: 2rem; padding: 1.5rem; border-radius: 14px;">
                <h3 class="text-gradient" style="margin-bottom: 1rem;">Subsidiary Timeline</h3>
                <canvas id="timelineChart"></canvas>
            </div>
            ` : ''}

            <div class="section-header" style="margin-bottom: 1rem;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
                    <h2 class="text-gradient">Subsidiaries</h2>
                    <div style="display: flex; gap: 0.75rem; align-items: center;">
                        <span id="subsCount" style="color: var(--text-dim); font-size: 0.8rem;"></span>
                        <input type="text" id="subFilter" placeholder="Filter subsidiaries..."
                               style="padding: 0.5rem 1rem; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 0.85rem; width: 220px; transition: border-color 200ms, box-shadow 200ms;"
                               onfocus="this.style.borderColor='var(--primary)'; this.style.boxShadow='0 0 12px rgba(124,92,252,0.25)';"
                               onblur="this.style.borderColor='var(--border)'; this.style.boxShadow='none';"
                               oninput="filterSubsTable(document.getElementById('subFilter').value)">
                    </div>
                </div>
                <div class="table-filters" style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
                    <span style="font-size: 0.75rem; color: var(--text-dim); margin-right: 0.25rem;">Confidence:</span>
                    <button class="filter-pill active" data-filter="conf" data-value="all" onclick="setSubsFilter('conf', 'all', this)">All</button>
                    <button class="filter-pill" data-filter="conf" data-value="HIGH" onclick="setSubsFilter('conf', 'HIGH', this)">High</button>
                    <button class="filter-pill" data-filter="conf" data-value="MEDIUM" onclick="setSubsFilter('conf', 'MEDIUM', this)">Medium</button>
                    <button class="filter-pill" data-filter="conf" data-value="LOW" onclick="setSubsFilter('conf', 'LOW', this)">Low</button>
                    <span style="width: 1px; height: 18px; background: var(--border); margin: 0 0.5rem;"></span>
                    <span style="font-size: 0.75rem; color: var(--text-dim); margin-right: 0.25rem;">Status:</span>
                    <button class="filter-pill active" data-filter="status" data-value="all" onclick="setSubsFilter('status', 'all', this)">All</button>
                    <button class="filter-pill" data-filter="status" data-value="active" onclick="setSubsFilter('status', 'active', this)">Active</button>
                    <button class="filter-pill" data-filter="status" data-value="divested" onclick="setSubsFilter('status', 'divested', this)">Divested</button>
                    ${subsidiaries.some(s => s.enriched) ? `
                    <span style="width: 1px; height: 18px; background: var(--border); margin: 0 0.5rem;"></span>
                    <button class="filter-pill" data-filter="enriched" data-value="ai" onclick="setSubsFilter('enriched', 'ai', this)">AI Enriched</button>
                    ` : ''}
                    <span style="width: 1px; height: 18px; background: var(--border); margin: 0 0.5rem;"></span>
                    <span style="font-size: 0.75rem; color: var(--text-dim); margin-right: 0.25rem;">Sort:</span>
                    <select id="subsSort" onchange="applySubsSort(this.value)" style="padding: 0.35rem 0.75rem; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 0.8rem; cursor: pointer;">
                        <option value="name-asc">Name A–Z</option>
                        <option value="name-desc">Name Z–A</option>
                        <option value="timein-asc">TimeIn ↑</option>
                        <option value="timein-desc">TimeIn ↓</option>
                        <option value="conf-desc">Confidence ↓</option>
                    </select>
                </div>
            </div>

            <div class="table-container glass-card">
                <table class="premium-table">
                    <thead>
                        <tr>
                            <th>Subsidiary</th>
                            <th>TimeIn</th>
                            <th>TimeOut</th>
                            <th>Confidence</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="subsTableBody"></tbody>
                </table>
            </div>
            <div id="subsPagination" style="margin-top: 1rem;"></div>
        </div>
    `;

    // Render timeline chart for smaller companies
    if (subsidiaries.length <= 50) {
        renderCompanyTimelineChart(subsidiaries, filing_dates);
    }

    // Store subsidiaries and render first page
    window._currentSubs = subsidiaries;
    window._filteredSubs = subsidiaries;
    _subsPage = 1;
    _renderSubsPage();
}


function _renderSubsPage() {
    const subs = window._filteredSubs || [];
    const total = subs.length;
    const totalPages = Math.max(1, Math.ceil(total / _SUBS_PER_PAGE));
    if (_subsPage > totalPages) _subsPage = totalPages;

    const start = (_subsPage - 1) * _SUBS_PER_PAGE;
    const page = subs.slice(start, start + _SUBS_PER_PAGE);

    const tbody = document.getElementById('subsTableBody');
    if (tbody) {
        tbody.innerHTML = page.map((s, i) => `
            <tr class="table-row-animate" style="animation-delay: ${Math.min(i * 20, 400)}ms;">
                <td><strong>${escapeHtml(s.sub_name)}</strong></td>
                <td style="font-size: 0.8rem;">${escapeHtml(s.time_in || '')}</td>
                <td style="font-size: 0.8rem;">${escapeHtml(s.time_out || '')}</td>
                <td>${confidenceBadge(s.confidence)}</td>
                <td>${timeoutBadge(s.time_out)}${s.enriched ? ' <span class="badge badge-enriched">AI</span>' : ''}</td>
                <td>
                    <button class="btn btn-outline btn-sm"
                            onclick="navigate('subsidiary', {id: ${s.id}})">
                        Details
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // Update count
    const countEl = document.getElementById('subsCount');
    if (countEl) {
        countEl.textContent = total > _SUBS_PER_PAGE
            ? `${start + 1}–${Math.min(start + _SUBS_PER_PAGE, total)} of ${formatNumber(total)}`
            : `${formatNumber(total)} total`;
    }

    // Pagination controls
    const pagDiv = document.getElementById('subsPagination');
    if (pagDiv && totalPages > 1) {
        pagDiv.innerHTML = `
            <div class="pagination">
                <button class="btn-glow" ${_subsPage <= 1 ? 'disabled' : ''} onclick="_subsPage=1; _renderSubsPage();">First</button>
                <button class="btn-glow" ${_subsPage <= 1 ? 'disabled' : ''} onclick="_subsPage--; _renderSubsPage();">Prev</button>
                <span class="page-info" style="color: var(--text-dim);">Page ${_subsPage} of ${totalPages}</span>
                <button class="btn-glow" ${_subsPage >= totalPages ? 'disabled' : ''} onclick="_subsPage++; _renderSubsPage();">Next</button>
                <button class="btn-glow" ${_subsPage >= totalPages ? 'disabled' : ''} onclick="_subsPage=${totalPages}; _renderSubsPage();">Last</button>
            </div>`;
    } else if (pagDiv) {
        pagDiv.innerHTML = '';
    }
}

// Active filters state
window._subsFilters = { conf: 'all', status: 'all', enriched: 'all' };
window._subsSort = 'name-asc';

function filterSubsTable() {
    const query = (document.getElementById('subFilter') || {}).value || '';
    const subs = window._currentSubs || [];
    const f = window._subsFilters;

    window._filteredSubs = subs.filter(s => {
        // Text filter
        if (query && !s.sub_name.toLowerCase().includes(query.toLowerCase())) return false;
        // Confidence filter
        if (f.conf !== 'all' && s.confidence !== f.conf) return false;
        // Status filter
        if (f.status === 'active' && !(s.time_out && s.time_out.startsWith('Active'))) return false;
        if (f.status === 'divested' && (s.time_out && s.time_out.startsWith('Active'))) return false;
        // Enriched filter
        if (f.enriched === 'ai' && !s.enriched) return false;
        return true;
    });

    // Apply sort
    applySubsSort(window._subsSort, true);
}

function setSubsFilter(type, value, btn) {
    window._subsFilters[type] = value;
    // Toggle active class on pills in this group
    if (btn) {
        const pills = btn.parentElement.querySelectorAll(`.filter-pill[data-filter="${type}"]`);
        pills.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
    }
    _subsPage = 1;
    filterSubsTable();
}

function applySubsSort(sortKey, skipFilter) {
    window._subsSort = sortKey;
    const subs = window._filteredSubs || [];
    const confOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };

    subs.sort((a, b) => {
        switch (sortKey) {
            case 'name-asc': return a.sub_name.localeCompare(b.sub_name);
            case 'name-desc': return b.sub_name.localeCompare(a.sub_name);
            case 'timein-asc': return (a.time_in || '').localeCompare(b.time_in || '');
            case 'timein-desc': return (b.time_in || '').localeCompare(a.time_in || '');
            case 'conf-desc': return (confOrder[a.confidence] || 2) - (confOrder[b.confidence] || 2);
            default: return 0;
        }
    });

    if (!skipFilter) _subsPage = 1;
    _renderSubsPage();
}


function renderCompanyTimelineChart(subsidiaries, filingDates) {
    const ctx = document.getElementById('timelineChart');
    if (!ctx) return;

    const parseYear = (dateStr) => {
        if (!dateStr) return null;
        const match = dateStr.match(/(\d{4})/);
        return match ? parseInt(match[1]) : null;
    };

    const minYear = Math.min(...filingDates.map(d => parseInt(d.split('-')[0])));
    const maxYear = Math.max(...filingDates.map(d => parseInt(d.split('-')[0])));

    const displaySubs = subsidiaries.slice(0, 30);
    const labels = displaySubs.map(s => s.sub_name.length > 30 ? s.sub_name.substring(0, 30) + '...' : s.sub_name);

    const data = displaySubs.map(s => {
        const start = parseYear(s.first_seen) || minYear;
        const end = parseYear(s.last_seen) || maxYear;
        return [start, end];
    });

    const colors = displaySubs.map(s =>
        s.time_out && s.time_out.startsWith('Active')
            ? 'rgba(124, 92, 252, 0.8)'
            : 'rgba(234, 179, 8, 0.8)'
    );

    const hoverColors = displaySubs.map(s =>
        s.time_out && s.time_out.startsWith('Active')
            ? 'rgba(96, 165, 250, 1)'
            : 'rgba(250, 204, 21, 1)'
    );

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Subsidiary Period',
                data: data,
                backgroundColor: colors,
                hoverBackgroundColor: hoverColors,
                borderRadius: 6,
                barThickness: 14,
                borderSkipped: false,
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1200,
                easing: 'easeOutQuart',
                delay: (context) => context.dataIndex * 40,
            },
            scales: {
                x: {
                    min: minYear - 1,
                    max: maxYear + 1,
                    ticks: { color: '#8a90a5' },
                    grid: { color: 'rgba(46, 51, 71, 0.5)' },
                },
                y: {
                    ticks: { color: '#8a90a5', font: { size: 10 } },
                    grid: { display: false },
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 17, 24, 0.95)',
                    borderColor: 'rgba(124, 92, 252, 0.3)',
                    borderWidth: 1,
                    cornerRadius: 8,
                    titleColor: '#e4e6f0',
                    bodyColor: '#8a90a5',
                    callbacks: {
                        label: (ctx) => {
                            const [start, end] = ctx.raw;
                            return `${start} - ${end}`;
                        }
                    }
                }
            }
        }
    });

    ctx.parentElement.style.height = Math.max(300, displaySubs.length * 28 + 60) + 'px';
}


async function renderSubsidiaryDetail(subId) {
    app.innerHTML = `
        <div class="loading-screen page-transition">
            <div class="spinner"></div>
            <p>Loading subsidiary details...</p>
        </div>`;

    const data = await api(`/api/subsidiaries/${subId}`);
    if (data.error) {
        app.innerHTML = `<div class="empty-state"><p>${escapeHtml(data.error)}</p></div>`;
        return;
    }

    const { subsidiary, enrichments } = data;

    app.innerHTML = `
        <div class="page-transition">
            <span class="back-link" onclick="navigate('company', {cik: '${subsidiary.cik}'})">&larr; Back to ${escapeHtml(subsidiary.company_name)}</span>

            <div class="company-header glass-card float-in" style="padding: 2rem; margin-bottom: 2rem; border-radius: 16px; background: linear-gradient(135deg, rgba(124,92,252,0.1) 0%, rgba(124,92,252,0.08) 100%), var(--surface); border: 1px solid rgba(124,92,252,0.2);">
                <h1 class="text-gradient" style="font-size: 1.75rem; margin-bottom: 0.75rem;">${escapeHtml(subsidiary.sub_name)}</h1>
                <div class="company-meta" style="display: flex; gap: 1.5rem; flex-wrap: wrap;">
                    <span>Parent: <strong class="clickable" style="color: var(--primary); cursor: pointer;" onclick="navigate('company', {cik: '${subsidiary.cik}'})">${escapeHtml(subsidiary.company_name)}</strong></span>
                    <span>CIK: <strong style="font-family: monospace;">${subsidiary.cik}</strong></span>
                    <span>First Seen: <strong>${subsidiary.first_seen}</strong></span>
                    <span>Last Seen: <strong>${subsidiary.last_seen}</strong></span>
                </div>
            </div>

            <div class="stats-grid reveal stagger-in" style="grid-template-columns: repeat(3, 1fr); margin-bottom: 2rem;">
                <div class="stat-card glow-card scale-in" style="animation-delay: 0ms;">
                    <div class="label">TimeIn (Algorithmic)</div>
                    <div class="value" style="font-size: 1rem;">${escapeHtml(subsidiary.time_in)}</div>
                </div>
                <div class="stat-card glow-card scale-in" style="animation-delay: 80ms;">
                    <div class="label">TimeOut (Algorithmic)</div>
                    <div class="value" style="font-size: 1rem;">${escapeHtml(subsidiary.time_out)}</div>
                </div>
                <div class="stat-card glow-card scale-in" style="animation-delay: 160ms;">
                    <div class="label">Confidence</div>
                    <div class="value">${confidenceBadge(subsidiary.confidence)}</div>
                </div>
            </div>

            <div class="glass-card reveal" style="padding: 1.25rem 1.5rem; border-radius: 12px; margin-bottom: 1.5rem;">
                <p style="color: var(--text-dim); font-size: 0.85rem; margin-bottom: 0.5rem;">
                    Source: ${escapeHtml(subsidiary.source || 'SEC Exhibit 21 filing comparison')}
                </p>
                ${subsidiary.type ? `<p style="color: var(--text-dim); font-size: 0.85rem;">Type: <span class="badge badge-enriched">${escapeHtml(subsidiary.type)}</span></p>` : ''}
            </div>

            <div class="reveal" style="margin-bottom: 2rem; display: flex; align-items: center; gap: 1rem;">
                <button class="btn btn-primary btn-glow animated-border" id="enrichBtn" onclick="runAgenticSearch(${subId})"
                        style="padding: 0.75rem 1.75rem; font-size: 0.95rem; border-radius: 10px; position: relative; overflow: hidden;">
                    <span style="position: relative; z-index: 1;">${subsidiary.enriched ? 'Re-run AI Search' : 'Run AI Search'}</span>
                </button>
                <span style="color: var(--text-dim); font-size: 0.8rem;">
                    Uses SEC EDGAR + Wikipedia + Gemini AI
                </span>
            </div>

            <div id="searchProgress"></div>

            ${enrichments.length > 0 ? `
                <div>
                    <div style="display: flex; align-items: center; gap: 0.75rem; margin: 2rem 0 1.25rem;">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c5cfc" stroke-width="1.5"><path d="M12 2a4 4 0 014 4c0 1.95-2 5-4 5s-4-3.05-4-5a4 4 0 014-4z"/><circle cx="12" cy="12" r="10"/></svg>
                        <h3 class="text-gradient" style="font-size: 1.2rem; margin: 0;">AI Enrichment Results</h3>
                    </div>
                    ${enrichments.map((e, idx) => `
                        <div class="enrichment-card glass-card depth-card" style="margin-bottom: 1.25rem; border-radius: 16px; overflow: hidden; animation-delay: ${idx * 100}ms;">
                            <div style="display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.5rem; background: rgba(124,92,252,0.06); border-bottom: 1px solid rgba(124,92,252,0.1);">
                                <div style="display: flex; align-items: center; gap: 0.6rem;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00d4aa" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
                                    <span style="font-weight: 600; color: var(--primary); font-size: 0.9rem;">Enrichment #${idx + 1}</span>
                                </div>
                                <span style="color: var(--text-dim); font-size: 0.75rem; font-family: monospace;">${escapeHtml(e.searched_at)}</span>
                            </div>
                            <div style="padding: 1.25rem 1.5rem;">
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                                    <div style="padding: 0.9rem 1rem; background: rgba(0,212,170,0.05); border: 1px solid rgba(0,212,170,0.12); border-radius: 10px;">
                                        <div style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(0,212,170,0.7); margin-bottom: 0.4rem; font-weight: 600;">Precise TimeIn</div>
                                        <div style="font-weight: 600; color: #00d4aa; font-size: 0.95rem;">${escapeHtml(e.time_in_precise || 'N/A')}</div>
                                    </div>
                                    <div style="padding: 0.9rem 1rem; background: rgba(251,191,36,0.05); border: 1px solid rgba(251,191,36,0.12); border-radius: 10px;">
                                        <div style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(251,191,36,0.7); margin-bottom: 0.4rem; font-weight: 600;">Precise TimeOut</div>
                                        <div style="font-weight: 600; color: #fbbf24; font-size: 0.95rem;">${escapeHtml(e.time_out_precise || 'N/A')}</div>
                                    </div>
                                </div>
                                <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 1rem; margin-bottom: ${e.detail ? '1rem' : '0'};">
                                    <div style="padding: 0.9rem 1rem; background: rgba(124,92,252,0.05); border: 1px solid rgba(124,92,252,0.12); border-radius: 10px;">
                                        <div style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(124,92,252,0.7); margin-bottom: 0.4rem; font-weight: 600;">Type</div>
                                        <div><span class="badge badge-enriched">${escapeHtml(e.sub_type || 'Unknown')}</span></div>
                                    </div>
                                    <div style="padding: 0.9rem 1rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px;">
                                        <div style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(232,234,237,0.4); margin-bottom: 0.4rem; font-weight: 600;">Source</div>
                                        <div style="font-size: 0.85rem; color: #e8eaed; word-break: break-word; line-height: 1.5;">${escapeHtml(e.source_url || 'N/A')}</div>
                                    </div>
                                </div>
                                ${e.detail ? `
                                    <div style="padding: 0.75rem 1rem; background: rgba(255,255,255,0.02); border-radius: 8px; border-left: 3px solid rgba(124,92,252,0.4);">
                                        <p style="font-size: 0.85rem; color: var(--text-dim); line-height: 1.6; margin: 0;">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px; opacity: 0.5;"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                                            ${escapeHtml(e.detail)}
                                        </p>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : subsidiary.type ? `
                <div>
                    <div style="display: flex; align-items: center; gap: 0.75rem; margin: 2rem 0 1.25rem;">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c5cfc" stroke-width="1.5"><path d="M12 2a4 4 0 014 4c0 1.95-2 5-4 5s-4-3.05-4-5a4 4 0 014-4z"/><circle cx="12" cy="12" r="10"/></svg>
                        <h3 class="text-gradient" style="font-size: 1.2rem; margin: 0;">AI Classification</h3>
                    </div>
                    <div class="glass-card depth-card" style="border-radius: 16px; overflow: hidden;">
                        <div style="padding: 1.25rem 1.5rem;">
                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem;">
                                <div style="padding: 0.9rem 1rem; background: rgba(124,92,252,0.05); border: 1px solid rgba(124,92,252,0.12); border-radius: 10px;">
                                    <div style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(124,92,252,0.7); margin-bottom: 0.4rem; font-weight: 600;">Classification</div>
                                    <div><span class="badge badge-enriched">${escapeHtml(subsidiary.type)}</span></div>
                                </div>
                                <div style="padding: 0.9rem 1rem; background: rgba(0,212,170,0.05); border: 1px solid rgba(0,212,170,0.12); border-radius: 10px;">
                                    <div style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(0,212,170,0.7); margin-bottom: 0.4rem; font-weight: 600;">Confidence</div>
                                    <div style="font-weight: 600; color: #00d4aa; font-size: 0.95rem;">${escapeHtml(subsidiary.confidence || 'N/A')}</div>
                                </div>
                                <div style="padding: 0.9rem 1rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px;">
                                    <div style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(232,234,237,0.4); margin-bottom: 0.4rem; font-weight: 600;">Method</div>
                                    <div style="font-size: 0.85rem; color: #e8eaed;">Heuristic (Turbo)</div>
                                </div>
                            </div>
                            <div style="margin-top: 1rem; padding: 0.75rem 1rem; background: rgba(255,255,255,0.02); border-radius: 8px; border-left: 3px solid rgba(124,92,252,0.4);">
                                <p style="font-size: 0.85rem; color: var(--text-dim); line-height: 1.6; margin: 0;">
                                    Classified via name heuristics and filing pattern analysis. Run <strong>AI Search</strong> above for deeper enrichment with SEC EDGAR + Wikipedia sources.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}
