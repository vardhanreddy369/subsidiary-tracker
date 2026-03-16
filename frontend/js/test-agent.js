/* ============================================================
   SubTrack — Test Agent Dashboard (test-agent.js)
   ============================================================ */

(() => {
    'use strict';

    /* ----------------------------------------------------------
       THEME COLORS
    ---------------------------------------------------------- */

    const THEME = {
        primary:    '#6366f1',
        primaryRgb: '99,102,241',
        green:      '#22c55e',
        greenRgb:   '34,197,94',
        amber:      '#f59e0b',
        amberRgb:   '245,158,11',
        red:        '#ef4444',
        redRgb:     '239,68,68',
        textDim:    '#8a90a5',
        surface:    '#1a1d27',
        surfaceAlt: '#22253a',
    };

    /* ----------------------------------------------------------
       STATE
    ---------------------------------------------------------- */

    let _activeCategory = 'all';
    let _results = [];
    let _categories = [];
    let _isRunning = false;
    let _runHistory = [];   // { timestamp, total, passed, failed, passRate }
    let _expandedRows = {}; // test name -> boolean

    /* ----------------------------------------------------------
       ICONS
    ---------------------------------------------------------- */

    const ICON_PASS = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>`;
    const ICON_FAIL = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>`;
    const ICON_WARN = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="3"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>`;

    function _statusIcon(status) {
        if (status === 'pass') return ICON_PASS;
        if (status === 'fail') return ICON_FAIL;
        return ICON_WARN;
    }

    /* ----------------------------------------------------------
       HELPERS
    ---------------------------------------------------------- */

    function _passRateColor(rate) {
        if (rate >= 90) return THEME.green;
        if (rate >= 70) return THEME.amber;
        return THEME.red;
    }

    function _passRateRgb(rate) {
        if (rate >= 90) return THEME.greenRgb;
        if (rate >= 70) return THEME.amberRgb;
        return THEME.redRgb;
    }

    function _filteredResults() {
        if (_activeCategory === 'all') return _results;
        return _results.filter(r => (r.category || '').toLowerCase() === _activeCategory.toLowerCase());
    }

    function _computeSummary(results) {
        const total = results.length;
        const passed = results.filter(r => r.status === 'pass').length;
        const failed = results.filter(r => r.status === 'fail').length;
        const warned = results.filter(r => r.status === 'warn').length;
        const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;
        return { total, passed, failed, warned, passRate };
    }

    /* ----------------------------------------------------------
       PROGRESS BAR
    ---------------------------------------------------------- */

    function _renderProgressBar(current, total) {
        const pct = total > 0 ? Math.round((current / total) * 100) : 0;
        return `
            <div id="testProgressWrap" style="margin-bottom:2rem;padding:1.25rem 1.5rem;border-radius:14px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.6rem;">
                    <span style="font-size:0.85rem;font-weight:600;color:${THEME.primary};">Running tests...</span>
                    <span style="font-size:0.8rem;color:${THEME.textDim};">${current}/${total} complete</span>
                </div>
                <div style="height:8px;border-radius:4px;background:rgba(255,255,255,0.05);overflow:hidden;">
                    <div style="height:100%;width:${pct}%;border-radius:4px;background:linear-gradient(90deg,${THEME.primary},#818cf8,${THEME.primary});background-size:200% 100%;animation:shimmer 1.5s ease infinite;transition:width 0.4s ease;"></div>
                </div>
            </div>
            <style>
                @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
            </style>
        `;
    }

    /* ----------------------------------------------------------
       SUMMARY CARDS
    ---------------------------------------------------------- */

    function _renderSummaryCards(summary) {
        const cards = [
            { label: 'Total Tests', value: summary.total, color: THEME.primary, rgb: THEME.primaryRgb },
            { label: 'Passed', value: summary.passed, color: THEME.green, rgb: THEME.greenRgb },
            { label: 'Failed', value: summary.failed, color: THEME.red, rgb: THEME.redRgb },
            { label: 'Pass Rate', value: summary.passRate + '%', color: _passRateColor(summary.passRate), rgb: _passRateRgb(summary.passRate) },
        ];

        return `
            <div class="stagger-in" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-bottom:2rem;">
                ${cards.map((c, i) => `
                    <div class="glass-card float-in" style="padding:1.25rem 1.5rem;border-radius:14px;text-align:center;animation-delay:${i * 80}ms;border-left:3px solid ${c.color};">
                        <div style="font-size:2rem;font-weight:800;color:${c.color};text-shadow:0 0 20px rgba(${c.rgb},0.3);">${c.value}</div>
                        <div style="font-size:0.78rem;color:${THEME.textDim};text-transform:uppercase;letter-spacing:0.08em;margin-top:0.3rem;">${c.label}</div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    /* ----------------------------------------------------------
       CATEGORY TABS
    ---------------------------------------------------------- */

    function _renderCategoryTabs() {
        const allTabs = ['All', 'Database', 'Integrity', 'Search', 'Analytics', 'Quality', 'Auth', 'Static', 'Config'];

        return `
            <div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:1.5rem;">
                ${allTabs.map(tab => {
                    const key = tab.toLowerCase();
                    const isActive = _activeCategory === key;
                    const activeStyle = isActive
                        ? `background:rgba(${THEME.primaryRgb},0.15);color:${THEME.primary};border-color:${THEME.primary};`
                        : `background:transparent;color:${THEME.textDim};border-color:rgba(255,255,255,0.08);`;
                    return `
                        <button onclick="window._taSetCategory('${key}')"
                                style="padding:0.45rem 1rem;border-radius:8px;border:1px solid;font-size:0.8rem;font-weight:600;cursor:pointer;transition:all 0.2s ease;${activeStyle}"
                                onmouseenter="if(!${isActive})this.style.color='#fff';this.style.borderColor='rgba(${THEME.primaryRgb},0.3)'"
                                onmouseleave="if(!${isActive}){this.style.color='${THEME.textDim}';this.style.borderColor='rgba(255,255,255,0.08)'}">
                            ${window.escapeHtml(tab)}
                        </button>
                    `;
                }).join('')}
            </div>
        `;
    }

    /* ----------------------------------------------------------
       RESULTS TABLE
    ---------------------------------------------------------- */

    function _renderResultsTable(results) {
        if (!results.length) {
            return `<p style="color:${THEME.textDim};font-size:0.9rem;text-align:center;padding:2rem 0;">No test results yet. Click "Run All Tests" to begin.</p>`;
        }

        const rows = results.map((r, i) => {
            const isFail = r.status === 'fail';
            const isExpanded = _expandedRows[r.name];
            const borderLeft = isFail ? `border-left:3px solid ${THEME.red};` : 'border-left:3px solid transparent;';
            const detail = r.detail || r.message || '';
            const shortDetail = detail.length > 80 ? detail.slice(0, 80) + '...' : detail;
            const duration = r.duration_ms != null ? r.duration_ms + 'ms' : (r.duration || '-');

            return `
                <tr class="table-row-animate float-in" style="animation-delay:${Math.min(i * 30, 500)}ms;${borderLeft}cursor:pointer;transition:background 0.2s ease;"
                    onclick="window._taToggleRow('${window.escapeHtml(r.name).replace(/'/g, "\\'")}')"
                    onmouseenter="this.style.background='rgba(255,255,255,0.02)'"
                    onmouseleave="this.style.background='transparent'">
                    <td style="padding:0.75rem 1rem;width:40px;">${_statusIcon(r.status)}</td>
                    <td style="padding:0.75rem 0.5rem;font-weight:600;font-size:0.85rem;">${window.escapeHtml(r.name)}</td>
                    <td style="padding:0.75rem 0.5rem;">
                        <span style="display:inline-block;padding:0.2rem 0.6rem;border-radius:6px;font-size:0.72rem;font-weight:600;color:${THEME.primary};background:rgba(${THEME.primaryRgb},0.1);border:1px solid rgba(${THEME.primaryRgb},0.2);">
                            ${window.escapeHtml(r.category || 'general')}
                        </span>
                    </td>
                    <td style="padding:0.75rem 0.5rem;color:${THEME.textDim};font-size:0.82rem;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                        ${window.escapeHtml(shortDetail)}
                    </td>
                    <td style="padding:0.75rem 1rem;font-family:monospace;font-size:0.8rem;color:${THEME.textDim};text-align:right;">
                        ${window.escapeHtml(String(duration))}
                    </td>
                </tr>
                ${isExpanded ? `
                <tr style="background:rgba(${THEME.primaryRgb},0.03);">
                    <td colspan="5" style="padding:0.75rem 1rem 0.75rem 3.5rem;font-size:0.82rem;color:${THEME.textDim};border-top:1px solid rgba(255,255,255,0.04);white-space:pre-wrap;word-break:break-word;">
                        ${window.escapeHtml(detail || 'No additional details.')}
                    </td>
                </tr>
                ` : ''}
            `;
        }).join('');

        return `
            <div class="table-container glass-card reveal" style="border-radius:14px;overflow:hidden;">
                <table class="premium-table">
                    <thead>
                        <tr>
                            <th>Status</th>
                            <th>Test Name</th>
                            <th>Category</th>
                            <th>Detail</th>
                            <th style="text-align:right;">Duration</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;
    }

    /* ----------------------------------------------------------
       HISTORY SECTION
    ---------------------------------------------------------- */

    function _renderHistory() {
        if (!_runHistory.length) return '';

        const last = _runHistory[_runHistory.length - 1];
        const ts = new Date(last.timestamp).toLocaleString();

        let trendHtml = '';
        if (_runHistory.length > 1) {
            const prev = _runHistory[_runHistory.length - 2];
            const diff = last.passRate - prev.passRate;
            const arrow = diff > 0 ? '&#9650;' : diff < 0 ? '&#9660;' : '&#9654;';
            const trendColor = diff > 0 ? THEME.green : diff < 0 ? THEME.red : THEME.textDim;
            trendHtml = `
                <span style="margin-left:1rem;font-size:0.85rem;color:${trendColor};font-weight:600;">
                    ${arrow} ${diff > 0 ? '+' : ''}${diff}% from previous run
                </span>
            `;
        }

        const historyBars = _runHistory.slice(-10).map((h, i) => {
            const barColor = _passRateColor(h.passRate);
            return `
                <div style="display:flex;flex-direction:column;align-items:center;gap:0.3rem;flex:1;min-width:30px;">
                    <div style="width:100%;max-width:32px;height:${Math.max(h.passRate * 0.6, 4)}px;border-radius:4px;background:${barColor};opacity:0.8;transition:all 0.3s;"></div>
                    <span style="font-size:0.65rem;color:${THEME.textDim};">${h.passRate}%</span>
                </div>
            `;
        }).join('');

        return `
            <div class="glass-card reveal" style="padding:1.25rem 1.5rem;border-radius:14px;margin-top:2rem;">
                <div style="display:flex;align-items:center;flex-wrap:wrap;gap:0.5rem;margin-bottom:1rem;">
                    <h3 style="margin:0;font-size:1rem;font-weight:700;color:#fff;">Run History</h3>
                    <span style="font-size:0.8rem;color:${THEME.textDim};">Last run: ${window.escapeHtml(ts)}</span>
                    ${trendHtml}
                </div>
                <div style="display:flex;align-items:flex-end;gap:0.5rem;height:60px;">
                    ${historyBars}
                </div>
            </div>
        `;
    }

    /* ----------------------------------------------------------
       RUN TESTS
    ---------------------------------------------------------- */

    async function _runTests(category) {
        if (_isRunning) return;
        _isRunning = true;
        _expandedRows = {};

        const app = document.getElementById('app');
        const endpoint = category && category !== 'all'
            ? `/api/test-agent/run/${encodeURIComponent(category)}`
            : '/api/test-agent/run';

        // Show progress bar
        const progressEl = document.getElementById('testProgress');
        if (progressEl) progressEl.innerHTML = _renderProgressBar(0, 1);

        try {
            const data = await window.api(endpoint);

            _results = data.results || data || [];
            _isRunning = false;

            const summary = _computeSummary(_results);
            _runHistory.push({
                timestamp: Date.now(),
                total: summary.total,
                passed: summary.passed,
                failed: summary.failed,
                passRate: summary.passRate,
            });

            window.showToast(
                summary.failed === 0
                    ? `All ${summary.total} tests passed!`
                    : `${summary.passed}/${summary.total} tests passed, ${summary.failed} failed`,
                summary.failed === 0 ? 'success' : 'error'
            );

            _renderPage();
        } catch (err) {
            _isRunning = false;
            window.showToast('Failed to run tests: ' + (err.message || err), 'error');
            _renderPage();
        }
    }

    /* ----------------------------------------------------------
       SET CATEGORY FILTER
    ---------------------------------------------------------- */

    function _setCategory(cat) {
        _activeCategory = cat;
        _renderPage();
    }

    /* ----------------------------------------------------------
       TOGGLE ROW EXPANSION
    ---------------------------------------------------------- */

    function _toggleRow(name) {
        _expandedRows[name] = !_expandedRows[name];
        _renderPage();
    }

    /* ----------------------------------------------------------
       LOAD CATEGORIES
    ---------------------------------------------------------- */

    async function _loadCategories() {
        try {
            const data = await window.api('/api/test-agent/categories');
            _categories = data.categories || data || [];
        } catch (_) {
            _categories = [];
        }
    }

    /* ----------------------------------------------------------
       RENDER PAGE
    ---------------------------------------------------------- */

    function _renderPage() {
        const app = document.getElementById('app');
        const summary = _computeSummary(_results);
        const filtered = _filteredResults();

        app.innerHTML = `
            <div class="test-agent-page page-transition" style="max-width:1100px;margin:0 auto;">

                <!-- Header -->
                <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem;margin-bottom:2rem;">
                    <div>
                        <h2 class="text-gradient" style="margin:0 0 0.4rem;font-size:1.75rem;">Test Agent</h2>
                        <p style="color:${THEME.textDim};margin:0;font-size:0.9rem;">Automated health checks and integration tests</p>
                    </div>
                    <button class="btn btn-primary btn-glow"
                            onclick="window._taRunTests('${_activeCategory}')"
                            style="padding:0.65rem 1.5rem;font-size:0.9rem;font-weight:700;border-radius:10px;cursor:pointer;transition:all 0.3s ease;${_isRunning ? 'opacity:0.5;pointer-events:none;' : ''}"
                            ${_isRunning ? 'disabled' : ''}>
                        ${_isRunning ? 'Running...' : _activeCategory !== 'all' ? 'Run ' + _activeCategory.charAt(0).toUpperCase() + _activeCategory.slice(1) + ' Tests' : 'Run All Tests'}
                    </button>
                </div>

                <!-- Progress Bar -->
                <div id="testProgress">
                    ${_isRunning ? _renderProgressBar(0, 1) : ''}
                </div>

                <!-- Summary Cards (only after tests run) -->
                ${_results.length > 0 ? _renderSummaryCards(summary) : ''}

                <!-- Category Tabs -->
                ${_renderCategoryTabs()}

                <!-- Results Table -->
                ${_renderResultsTable(filtered)}

                <!-- History -->
                ${_renderHistory()}
            </div>
        `;
    }

    /* ----------------------------------------------------------
       MAIN ENTRY POINT
    ---------------------------------------------------------- */

    async function renderTestAgentPage() {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="loading-screen page-transition">
                <div class="spinner"></div>
                <p>Loading test agent...</p>
            </div>`;

        await _loadCategories();
        _renderPage();
    }

    /* ----------------------------------------------------------
       EXPOSE PUBLIC API
    ---------------------------------------------------------- */

    window.renderTestAgentPage = renderTestAgentPage;
    window._taRunTests = _runTests;
    window._taSetCategory = _setCategory;
    window._taToggleRow = _toggleRow;

})();
