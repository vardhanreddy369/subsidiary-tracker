/* ============================================================
   SubTrack — Data Quality Dashboard (data-quality.js)
   ============================================================ */

(() => {
    'use strict';

    /* ----------------------------------------------------------
       THEME COLORS
    ---------------------------------------------------------- */

    const THEME = {
        primary:    '#6366f1',
        primaryRgb: '99,102,241',
        sky:        '#0ea5e9',
        skyRgb:     '14,165,233',
        green:      '#22c55e',
        greenRgb:   '34,197,94',
        amber:      '#f59e0b',
        amberRgb:   '245,158,11',
        red:        '#ef4444',
        redRgb:     '239,68,68',
        indigo:     '#818cf8',
        indigoRgb:  '129,140,248',
        textDim:    '#8a90a5',
        surface:    '#1a1d27',
        surfaceAlt: '#22253a',
    };

    /* ----------------------------------------------------------
       STATE
    ---------------------------------------------------------- */

    let _coverageChart = null;
    let _confidenceChart = null;
    let _currentFilter = 'all';
    let _currentPage = 1;
    let _perPage = 20;
    let _reportData = null;

    function _destroyCharts() {
        if (_coverageChart) { _coverageChart.destroy(); _coverageChart = null; }
        if (_confidenceChart) { _confidenceChart.destroy(); _confidenceChart = null; }
    }

    /* ----------------------------------------------------------
       HELPERS
    ---------------------------------------------------------- */

    function _scoreColor(score) {
        if (score >= 80) return THEME.green;
        if (score >= 50) return THEME.amber;
        return THEME.red;
    }

    function _scoreColorRgb(score) {
        if (score >= 80) return THEME.greenRgb;
        if (score >= 50) return THEME.amberRgb;
        return THEME.redRgb;
    }

    function _scoreLabel(score) {
        if (score >= 90) return 'Excellent';
        if (score >= 80) return 'Good';
        if (score >= 60) return 'Fair';
        if (score >= 40) return 'Poor';
        return 'Critical';
    }

    function _highlightIssue(name, issueType) {
        if (!name) return '';
        const escaped = escapeHtml(name);
        if (issueType === 'html_tags') {
            return escaped.replace(/(&lt;[^&]*&gt;)/g, '<span style="color:#ef4444;font-weight:600;background:rgba(239,68,68,0.1);padding:0 3px;border-radius:3px;">$1</span>');
        }
        if (issueType === 'garbage') {
            return `<span style="color:#f59e0b;font-weight:600;background:rgba(245,158,11,0.1);padding:0 3px;border-radius:3px;">${escaped}</span>`;
        }
        if (issueType === 'short') {
            return `<span style="color:#0ea5e9;font-weight:600;background:rgba(14,165,233,0.1);padding:0 3px;border-radius:3px;">${escaped}</span>`;
        }
        if (issueType === 'truncated') {
            return `<span style="color:#818cf8;">${escaped.slice(0, 97)}</span><span style="color:#ef4444;font-weight:700;">...</span>`;
        }
        return escaped;
    }

    function _issueTypeBadge(type) {
        const map = {
            html_tags: { label: 'HTML', color: THEME.red, bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)' },
            garbage:   { label: 'Garbage', color: THEME.amber, bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)' },
            short:     { label: 'Short', color: THEME.sky, bg: 'rgba(14,165,233,0.1)', border: 'rgba(14,165,233,0.2)' },
            truncated: { label: 'Truncated', color: THEME.indigo, bg: 'rgba(129,140,248,0.1)', border: 'rgba(129,140,248,0.2)' },
        };
        const m = map[type] || { label: type, color: THEME.textDim, bg: 'rgba(138,144,165,0.1)', border: 'rgba(138,144,165,0.2)' };
        return `<span style="display:inline-block;padding:0.2rem 0.6rem;border-radius:6px;font-size:0.72rem;font-weight:600;color:${m.color};background:${m.bg};border:1px solid ${m.border};">${m.label}</span>`;
    }

    /* ----------------------------------------------------------
       CIRCULAR PROGRESS INDICATOR
    ---------------------------------------------------------- */

    function _renderCircularProgress(score) {
        const color = _scoreColor(score);
        const colorRgb = _scoreColorRgb(score);
        const circumference = 2 * Math.PI * 54;
        const offset = circumference - (score / 100) * circumference;

        return `
            <div class="quality-score-ring" style="position:relative;width:180px;height:180px;margin:0 auto;">
                <svg width="180" height="180" viewBox="0 0 120 120" style="transform:rotate(-90deg);">
                    <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="8"/>
                    <circle cx="60" cy="60" r="54" fill="none" stroke="${color}" stroke-width="8"
                            stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
                            stroke-linecap="round"
                            style="filter:drop-shadow(0 0 8px rgba(${colorRgb},0.5));transition:stroke-dashoffset 1.5s ease-out;"/>
                </svg>
                <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
                    <span style="font-size:2.5rem;font-weight:800;color:${color};text-shadow:0 0 20px rgba(${colorRgb},0.4);" data-count-target="${score}">0</span>
                    <span style="font-size:0.75rem;color:${THEME.textDim};text-transform:uppercase;letter-spacing:0.1em;margin-top:0.15rem;">${_scoreLabel(score)}</span>
                </div>
            </div>
        `;
    }

    /* ----------------------------------------------------------
       YEAR COVERAGE HEATMAP
    ---------------------------------------------------------- */

    function _renderYearHeatmap(yearCoverage) {
        if (!yearCoverage || !Object.keys(yearCoverage).length) {
            return '<p style="color:var(--text-dim);font-size:0.85rem;">No year coverage data available.</p>';
        }

        const years = Object.keys(yearCoverage).map(Number).sort((a, b) => a - b);
        const minYear = years[0];
        const maxYear = years[years.length - 1];
        const maxCount = Math.max(...Object.values(yearCoverage));

        let cells = '';
        for (let y = minYear; y <= maxYear; y++) {
            const count = yearCoverage[y] || 0;
            const intensity = maxCount > 0 ? count / maxCount : 0;
            const isGap = count === 0;
            const bg = isGap
                ? 'rgba(239,68,68,0.15)'
                : `rgba(${THEME.greenRgb},${0.1 + intensity * 0.6})`;
            const border = isGap
                ? 'rgba(239,68,68,0.3)'
                : `rgba(${THEME.greenRgb},${0.2 + intensity * 0.3})`;
            const textColor = isGap ? THEME.red : (intensity > 0.5 ? '#fff' : THEME.textDim);

            cells += `
                <div style="display:flex;flex-direction:column;align-items:center;gap:0.25rem;padding:0.5rem 0.4rem;border-radius:8px;background:${bg};border:1px solid ${border};min-width:52px;transition:all 0.3s ease;"
                     title="${y}: ${formatNumber(count)} subsidiaries${isGap ? ' (GAP)' : ''}"
                     onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.3)'"
                     onmouseleave="this.style.transform='none';this.style.boxShadow='none'">
                    <span style="font-size:0.68rem;font-weight:700;color:${textColor};">${y}</span>
                    <span style="font-size:0.6rem;color:${textColor};opacity:0.8;">${count > 0 ? formatNumber(count) : 'GAP'}</span>
                </div>
            `;
        }

        return `
            <div style="display:flex;flex-wrap:wrap;gap:0.5rem;justify-content:center;">
                ${cells}
            </div>
            <div style="display:flex;align-items:center;justify-content:center;gap:1.5rem;margin-top:1rem;font-size:0.72rem;color:${THEME.textDim};">
                <span style="display:flex;align-items:center;gap:0.35rem;">
                    <span style="width:12px;height:12px;border-radius:3px;background:rgba(${THEME.greenRgb},0.5);"></span> Has data
                </span>
                <span style="display:flex;align-items:center;gap:0.35rem;">
                    <span style="width:12px;height:12px;border-radius:3px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);"></span> Gap
                </span>
            </div>
        `;
    }

    /* ----------------------------------------------------------
       RENDER COVERAGE BAR CHART
    ---------------------------------------------------------- */

    function _renderCoverageChart(yearCoverage) {
        const canvas = document.getElementById('coverageChart');
        if (!canvas || !yearCoverage) return;
        const ctx = canvas.getContext('2d');

        if (_coverageChart) _coverageChart.destroy();

        const years = Object.keys(yearCoverage).map(Number).sort((a, b) => a - b);
        const minYear = years[0];
        const maxYear = years[years.length - 1];

        const labels = [];
        const data = [];
        const bgColors = [];
        const borderColors = [];

        for (let y = minYear; y <= maxYear; y++) {
            labels.push(y.toString());
            const count = yearCoverage[y] || 0;
            data.push(count);

            const isGap = count === 0;
            bgColors.push(isGap ? `rgba(${THEME.redRgb},0.3)` : `rgba(${THEME.skyRgb},0.5)`);
            borderColors.push(isGap ? THEME.red : THEME.sky);
        }

        _coverageChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Subsidiaries',
                    data,
                    backgroundColor: bgColors,
                    borderColor: borderColors,
                    borderWidth: 1,
                    borderRadius: 6,
                }]
            },
            options: {
                responsive: true,
                animation: { duration: 800, easing: 'easeOutQuart' },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: THEME.surfaceAlt,
                        titleColor: '#fff',
                        bodyColor: THEME.textDim,
                        borderColor: 'rgba(255,255,255,0.08)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 12,
                        callbacks: {
                            label: (tipCtx) => ` ${tipCtx.parsed.y.toLocaleString()} subsidiaries`
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: THEME.textDim, font: { size: 11 } },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    },
                    y: {
                        ticks: { color: THEME.textDim, font: { size: 11 } },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    }
                }
            }
        });
    }

    /* ----------------------------------------------------------
       RENDER CONFIDENCE DOUGHNUT CHART
    ---------------------------------------------------------- */

    function _renderConfidenceChart(confidenceDist) {
        const canvas = document.getElementById('dqConfidenceChart');
        if (!canvas || !confidenceDist) return;

        if (_confidenceChart) _confidenceChart.destroy();

        const data = [confidenceDist.high || 0, confidenceDist.medium || 0, confidenceDist.low || 0];
        const colors = [THEME.green, THEME.amber, THEME.red];

        _confidenceChart = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: ['High', 'Medium', 'Low'],
                datasets: [{
                    data,
                    backgroundColor: colors,
                    borderColor: THEME.surface,
                    borderWidth: 3,
                    hoverOffset: 10,
                }]
            },
            options: {
                responsive: true,
                cutout: '65%',
                animation: { duration: 800, easing: 'easeOutQuart' },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: THEME.textDim,
                            padding: 16,
                            usePointStyle: true,
                            pointStyleWidth: 10,
                            font: { size: 12, family: 'Inter, system-ui, sans-serif' }
                        }
                    },
                    tooltip: {
                        backgroundColor: THEME.surfaceAlt,
                        titleColor: '#fff',
                        bodyColor: THEME.textDim,
                        borderColor: 'rgba(255,255,255,0.08)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        padding: 12,
                        displayColors: true,
                        callbacks: {
                            label: (tipCtx) => ` ${tipCtx.label}: ${tipCtx.parsed.toLocaleString()}`
                        }
                    }
                }
            }
        });
    }

    /* ----------------------------------------------------------
       RENDER ISSUES TABLE
    ---------------------------------------------------------- */

    async function _loadIssues(filter, page) {
        _currentFilter = filter || _currentFilter;
        _currentPage = page || 1;

        const tableBody = document.getElementById('dqIssuesBody');
        const paginationEl = document.getElementById('dqPagination');
        if (!tableBody) return;

        tableBody.innerHTML = `
            <tr><td colspan="5" style="text-align:center;padding:2rem;color:${THEME.textDim};">
                <div class="spinner" style="margin:0 auto 0.75rem;width:24px;height:24px;"></div>
                Loading issues...
            </td></tr>`;

        try {
            const data = await api(`/api/data-quality/issues?issue_type=${_currentFilter}&page=${_currentPage}&per_page=${_perPage}`);
            const issues = data.issues || [];
            const totalPages = data.total_pages || 1;

            if (issues.length === 0) {
                tableBody.innerHTML = `
                    <tr><td colspan="5" style="text-align:center;padding:2rem;color:${THEME.textDim};">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${THEME.green}" stroke-width="1.5" style="margin-bottom:0.5rem;">
                            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>
                        </svg><br>
                        No issues found for this filter.
                    </td></tr>`;
            } else {
                tableBody.innerHTML = issues.map((issue, i) => `
                    <tr class="table-row-animate" style="animation-delay:${i * 30}ms;">
                        <td style="font-family:monospace;font-size:0.8rem;color:${THEME.textDim};">${issue.id || '-'}</td>
                        <td style="font-size:0.85rem;">${escapeHtml(issue.company_name || '-')}</td>
                        <td style="font-size:0.82rem;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(issue.subsidiary_name || '')}">${_highlightIssue(issue.subsidiary_name, issue.issue_type)}</td>
                        <td>${_issueTypeBadge(issue.issue_type)}</td>
                        <td>
                            ${issue.issue_type !== 'truncated' ? `
                                <button class="btn btn-outline btn-sm" style="font-size:0.72rem;padding:0.2rem 0.5rem;"
                                        onclick="window._dqFixIssue(${issue.id}, '${issue.issue_type}', this)">
                                    ${issue.issue_type === 'garbage' ? 'Remove' : issue.issue_type === 'short' ? 'Review' : 'Clean'}
                                </button>
                            ` : '<span style="color:' + THEME.textDim + ';font-size:0.72rem;">-</span>'}
                        </td>
                    </tr>
                `).join('');
            }

            // Pagination
            if (paginationEl) {
                let paginationHtml = '';
                if (totalPages > 1) {
                    paginationHtml += `
                        <button class="btn btn-outline btn-sm" ${_currentPage <= 1 ? 'disabled' : ''} onclick="window._dqLoadPage(${_currentPage - 1})"
                                style="font-size:0.78rem;padding:0.3rem 0.7rem;">
                            &laquo; Prev
                        </button>
                        <span style="color:${THEME.textDim};font-size:0.82rem;padding:0 0.75rem;">
                            Page ${_currentPage} of ${totalPages}
                        </span>
                        <button class="btn btn-outline btn-sm" ${_currentPage >= totalPages ? 'disabled' : ''} onclick="window._dqLoadPage(${_currentPage + 1})"
                                style="font-size:0.78rem;padding:0.3rem 0.7rem;">
                            Next &raquo;
                        </button>`;
                }
                paginationEl.innerHTML = paginationHtml;
            }

        } catch (e) {
            tableBody.innerHTML = `
                <tr><td colspan="5" style="text-align:center;padding:2rem;color:${THEME.red};">
                    Failed to load issues: ${escapeHtml(e.message)}
                </td></tr>`;
        }
    }

    /* ----------------------------------------------------------
       FIX SINGLE ISSUE
    ---------------------------------------------------------- */

    async function _fixIssue(id, issueType, btn) {
        const original = btn.textContent;
        btn.disabled = true;
        btn.textContent = '...';
        btn.style.opacity = '0.6';

        try {
            await fetch('/api/data-quality/clean', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ issue_id: id, issue_type: issueType })
            });
            const row = btn.closest('tr');
            if (row) {
                row.style.transition = 'all 0.4s ease';
                row.style.opacity = '0';
                row.style.transform = 'translateX(20px)';
                setTimeout(() => row.remove(), 400);
            }
            showToast('Issue fixed successfully', 'success', 2000);
        } catch (e) {
            showToast('Failed to fix issue: ' + e.message, 'error');
            btn.disabled = false;
            btn.textContent = original;
            btn.style.opacity = '1';
        }
    }

    /* ----------------------------------------------------------
       CLEAN ALL
    ---------------------------------------------------------- */

    async function _cleanAll(btn) {
        btn.disabled = true;
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `
            <div class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:0.5rem;"></div>
            Cleaning...
        `;
        btn.style.opacity = '0.8';

        try {
            const resp = await fetch('/api/data-quality/clean', { method: 'POST' });
            const result = await resp.json();

            showToast(`Cleaned ${result.cleaned || 0} records successfully!`, 'success', 4000);

            // Refresh the page data
            await renderDataQualityPage();
        } catch (e) {
            showToast('Clean operation failed: ' + e.message, 'error');
            btn.disabled = false;
            btn.innerHTML = originalHtml;
            btn.style.opacity = '1';
        }
    }

    /* ----------------------------------------------------------
       MAIN RENDER — Data Quality Page
    ---------------------------------------------------------- */

    async function renderDataQualityPage() {
        _destroyCharts();
        _currentFilter = 'all';
        _currentPage = 1;

        app.innerHTML = `
            <div class="loading-screen page-transition">
                <div class="spinner"></div>
                <p>Analyzing data quality...</p>
            </div>`;

        let report;
        try {
            report = await api('/api/data-quality/report');
        } catch (e) {
            return;
        }
        _reportData = report;

        const score = report.quality_score || 0;
        const htmlCount = report.issues?.html_tags || 0;
        const garbageCount = report.issues?.garbage || 0;
        const shortCount = report.issues?.short_names || 0;
        const truncatedCount = report.issues?.truncated || 0;
        const totalIssues = htmlCount + garbageCount + shortCount + truncatedCount;

        const issueCards = [
            {
                icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M13 2v7h7"/></svg>',
                label: 'HTML Tags in Names',
                count: htmlCount,
                color: THEME.red,
                colorRgb: THEME.redRgb,
                action: `onclick="window._dqFilterIssues('html_tags')"`,
                btnLabel: 'Fix All',
            },
            {
                icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
                label: 'Garbage / Corrupted',
                count: garbageCount,
                color: THEME.amber,
                colorRgb: THEME.amberRgb,
                action: `onclick="window._dqFilterIssues('garbage')"`,
                btnLabel: 'Remove',
            },
            {
                icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 10H3M21 6H3M21 14H3M17 18H3"/></svg>',
                label: 'Short Names (\u22642 chars)',
                count: shortCount,
                color: THEME.sky,
                colorRgb: THEME.skyRgb,
                action: `onclick="window._dqFilterIssues('short')"`,
                btnLabel: 'Review',
            },
            {
                icon: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 7h16M4 12h16M4 17h10"/><circle cx="19" cy="17" r="2"/></svg>',
                label: 'Truncated Names (100 chars)',
                count: truncatedCount,
                color: THEME.indigo,
                colorRgb: THEME.indigoRgb,
                action: `onclick="window._dqFilterIssues('truncated')"`,
                btnLabel: null,
            },
        ];

        const filterTabs = [
            { key: 'all', label: 'All' },
            { key: 'html_tags', label: 'HTML' },
            { key: 'garbage', label: 'Garbage' },
            { key: 'short', label: 'Short' },
            { key: 'truncated', label: 'Truncated' },
        ];

        app.innerHTML = `
            <!-- Animated Mesh Background -->
            <div class="dashboard-mesh-bg" aria-hidden="true">
                <div class="mesh-orb mesh-orb-1"></div>
                <div class="mesh-orb mesh-orb-2"></div>
                <div class="mesh-orb mesh-orb-3"></div>
            </div>

            <!-- Page Header -->
            <section class="reveal" style="text-align:center;margin-bottom:2rem;">
                <h2 class="text-gradient" style="font-size:1.75rem;margin-bottom:0.5rem;">Data Quality Dashboard</h2>
                <p style="color:${THEME.textDim};font-size:0.9rem;">
                    Analyze and clean subsidiary data issues across ${formatNumber(report.total_records || 0)} records
                </p>
            </section>

            <!-- Quality Score Card -->
            <section class="reveal" style="margin-bottom:2rem;">
                <div class="glass-card glow-card" style="padding:2rem;border-radius:16px;text-align:center;max-width:400px;margin:0 auto;position:relative;overflow:hidden;">
                    <div class="card-glow" aria-hidden="true"></div>
                    <h3 style="font-size:0.9rem;color:${THEME.textDim};text-transform:uppercase;letter-spacing:0.1em;margin-bottom:1.25rem;">Overall Quality Score</h3>
                    ${_renderCircularProgress(score)}
                    <div style="margin-top:1rem;display:flex;justify-content:center;gap:1.5rem;font-size:0.78rem;color:${THEME.textDim};">
                        <span>${formatNumber(totalIssues)} issues found</span>
                        <span>${formatNumber(report.total_records || 0)} total records</span>
                    </div>
                </div>
            </section>

            <!-- Issue Summary Cards -->
            <section class="reveal" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;margin-bottom:2.5rem;">
                ${issueCards.map((c, i) => `
                    <div class="stat-card glass-card glow-card" style="--card-color:${c.colorRgb};padding:1.25rem;border-radius:14px;animation-delay:${i * 80}ms;border-left:3px solid ${c.color};">
                        <div class="card-glow" aria-hidden="true"></div>
                        <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.75rem;">
                            <span style="color:${c.color};">${c.icon}</span>
                            <span style="font-size:0.82rem;color:${THEME.textDim};">${c.label}</span>
                        </div>
                        <div style="font-size:1.75rem;font-weight:800;color:${c.color};margin-bottom:0.75rem;" data-count-target="${c.count}">0</div>
                        ${c.btnLabel ? `
                            <button class="btn btn-outline btn-sm btn-glow" style="font-size:0.75rem;border-color:${c.color};color:${c.color};" ${c.action}>
                                ${c.btnLabel}
                            </button>
                        ` : `<span style="font-size:0.72rem;color:${THEME.textDim};">Info only</span>`}
                    </div>
                `).join('')}
            </section>

            <!-- Charts Row -->
            <section class="charts-row reveal" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:1.25rem;margin-bottom:2.5rem;">
                <div class="chart-container glass-card" style="padding:1.5rem;border-radius:14px;">
                    <div class="chart-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                        <h3 style="font-size:1rem;font-weight:600;">Data Coverage by Year</h3>
                    </div>
                    <canvas id="coverageChart" height="200"></canvas>
                </div>
                <div class="chart-container glass-card" style="padding:1.5rem;border-radius:14px;">
                    <div class="chart-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
                        <h3 style="font-size:1rem;font-weight:600;">Confidence Distribution</h3>
                    </div>
                    <canvas id="dqConfidenceChart" height="200"></canvas>
                </div>
            </section>

            <!-- Year Coverage Heatmap -->
            <section class="reveal" style="margin-bottom:2.5rem;">
                <div class="glass-card" style="padding:1.5rem;border-radius:14px;">
                    <h3 style="font-size:1rem;font-weight:600;margin-bottom:1rem;">Year Coverage Heatmap</h3>
                    <p style="font-size:0.78rem;color:${THEME.textDim};margin-bottom:1rem;">Visual overview of which years have data. Red cells indicate gaps in coverage.</p>
                    ${_renderYearHeatmap(report.year_coverage || {})}
                </div>
            </section>

            <!-- Issues Table -->
            <section class="reveal" style="margin-bottom:2.5rem;">
                <div class="glass-card" style="padding:1.5rem;border-radius:14px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;margin-bottom:1.25rem;">
                        <h3 style="font-size:1rem;font-weight:600;">Problematic Records</h3>
                        <button class="btn btn-primary btn-glow" id="dqCleanAllBtn" onclick="window._dqCleanAll(this)"
                                style="font-size:0.82rem;padding:0.5rem 1.25rem;display:flex;align-items:center;gap:0.5rem;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>
                            </svg>
                            Clean All Issues
                        </button>
                    </div>

                    <!-- Filter Tabs -->
                    <div id="dqFilterTabs" style="display:flex;gap:0.5rem;margin-bottom:1.25rem;flex-wrap:wrap;">
                        ${filterTabs.map(t => `
                            <button class="btn btn-sm ${t.key === 'all' ? 'btn-primary' : 'btn-outline'}"
                                    data-filter="${t.key}"
                                    onclick="window._dqFilterIssues('${t.key}')"
                                    style="font-size:0.78rem;padding:0.35rem 0.85rem;border-radius:8px;">
                                ${t.label}
                            </button>
                        `).join('')}
                    </div>

                    <!-- Table -->
                    <div class="table-container" style="overflow-x:auto;">
                        <table class="premium-table" style="width:100%;">
                            <thead>
                                <tr>
                                    <th style="width:5rem;">ID</th>
                                    <th>Company</th>
                                    <th>Subsidiary Name</th>
                                    <th style="width:7rem;">Issue Type</th>
                                    <th style="width:5rem;">Action</th>
                                </tr>
                            </thead>
                            <tbody id="dqIssuesBody">
                                <tr><td colspan="5" style="text-align:center;padding:2rem;color:${THEME.textDim};">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>

                    <!-- Pagination -->
                    <div id="dqPagination" style="display:flex;align-items:center;justify-content:center;gap:0.5rem;margin-top:1rem;"></div>
                </div>
            </section>
        `;

        // --- Post-render setup ---

        // Start counter animations
        if (typeof startAllCounters === 'function') {
            startAllCounters();
        } else {
            document.querySelectorAll('[data-count-target]').forEach((el, i) => {
                const target = parseInt(el.getAttribute('data-count-target'), 10);
                if (!isNaN(target) && typeof animateCounter === 'function') {
                    setTimeout(() => animateCounter(el, target, 1400), i * 80);
                }
            });
        }

        // Init 3D tilt on glow cards
        document.querySelectorAll('.glow-card').forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const centerX = rect.width / 2;
                const centerY = rect.height / 2;
                const rotateX = ((y - centerY) / centerY) * -8;
                const rotateY = ((x - centerX) / centerX) * 8;
                card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.03,1.03,1.03)`;
                const glowEl = card.querySelector('.card-glow');
                if (glowEl) {
                    glowEl.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(${THEME.primaryRgb},0.15) 0%, transparent 60%)`;
                }
            });
            card.addEventListener('mouseleave', () => {
                card.style.transform = 'perspective(800px) rotateX(0) rotateY(0) scale3d(1,1,1)';
                const glowEl = card.querySelector('.card-glow');
                if (glowEl) glowEl.style.background = 'transparent';
            });
        });

        // Render charts on scroll
        const chartsRow = document.querySelector('.charts-row');
        if (chartsRow) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        _renderCoverageChart(report.year_coverage || {});
                        _renderConfidenceChart(report.confidence_distribution || {});
                        observer.disconnect();
                    }
                });
            }, { threshold: 0.15 });
            observer.observe(chartsRow);
        }

        // Load issues table
        _loadIssues('all', 1);
    }

    /* ----------------------------------------------------------
       FILTER + PAGINATION HELPERS
    ---------------------------------------------------------- */

    function _filterIssues(filter) {
        _currentFilter = filter;
        _currentPage = 1;

        // Update active tab
        const tabs = document.querySelectorAll('#dqFilterTabs button');
        tabs.forEach(tab => {
            if (tab.getAttribute('data-filter') === filter) {
                tab.className = 'btn btn-sm btn-primary';
            } else {
                tab.className = 'btn btn-sm btn-outline';
            }
        });

        _loadIssues(filter, 1);
    }

    function _loadPage(page) {
        _loadIssues(_currentFilter, page);
    }

    /* ----------------------------------------------------------
       EXPOSE PUBLIC API
    ---------------------------------------------------------- */

    window.renderDataQualityPage = renderDataQualityPage;
    window._dqFilterIssues = _filterIssues;
    window._dqLoadPage = _loadPage;
    window._dqFixIssue = _fixIssue;
    window._dqCleanAll = _cleanAll;

})();
