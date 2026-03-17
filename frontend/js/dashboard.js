/* ============================================================
   SubTrack — Premium Dashboard (dashboard.js)
   ============================================================ */

(() => {
    'use strict';

    /* ----------------------------------------------------------
       THEME COLORS — used across charts and UI elements
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
       1. ENHANCED animateCounter() — with glow pulse
    ---------------------------------------------------------- */

    /**
     * Animate a number counting up with easing and optional glow.
     * @param {HTMLElement} el
     * @param {number} target
     * @param {number} duration
     * @param {boolean} glow - Add glow pulse when complete
     */
    function animateCounter(el, target, duration = 1200, glow = false) {
        if (!el) return;
        if (target === 0) {
            el.textContent = '0';
            return;
        }

        const startTime = performance.now();
        const format = (n) => Math.round(n).toLocaleString();

        function step(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic for smooth deceleration
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = format(eased * target);

            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                el.textContent = format(target);
                el.classList.add('count-animated');
                if (glow) {
                    el.classList.add('counter-glow');
                }
            }
        }
        requestAnimationFrame(step);
    }

    /**
     * Start all counter animations for [data-count-target] elements.
     */
    function startAllCounters() {
        document.querySelectorAll('[data-count-target]').forEach((el, i) => {
            const target = parseInt(el.getAttribute('data-count-target'), 10);
            const useGlow = el.hasAttribute('data-glow');
            if (!isNaN(target)) {
                // Stagger start for visual effect
                setTimeout(() => {
                    animateCounter(el, target, 1400, useGlow);
                }, i * 80);
            }
        });
    }

    /* ----------------------------------------------------------
       2. TYPEWRITER EFFECT
    ---------------------------------------------------------- */

    /**
     * Typewriter animation for a text element.
     * @param {HTMLElement} el
     * @param {string} text
     * @param {number} speed - ms per character
     */
    function typewriter(el, text, speed = 30) {
        if (!el) return;
        el.textContent = '';
        el.classList.add('typewriter-cursor');
        let i = 0;

        function tick() {
            if (i < text.length) {
                el.textContent += text.charAt(i);
                i++;
                setTimeout(tick, speed);
            } else {
                // Remove cursor after a pause
                setTimeout(() => el.classList.remove('typewriter-cursor'), 1500);
            }
        }
        tick();
    }

    /* ----------------------------------------------------------
       3. 3D TILT EFFECT for stat cards
    ---------------------------------------------------------- */

    function _initTiltCards() {
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

                // Move glow highlight
                const glowEl = card.querySelector('.card-glow');
                if (glowEl) {
                    glowEl.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(${THEME.primaryRgb},0.15) 0%, transparent 60%)`;
                }
            });

            card.addEventListener('mouseleave', () => {
                card.style.transform = 'perspective(800px) rotateX(0) rotateY(0) scale3d(1,1,1)';
                const glowEl = card.querySelector('.card-glow');
                if (glowEl) {
                    glowEl.style.background = 'transparent';
                }
            });
        });
    }

    /* ----------------------------------------------------------
       4. CHART UTILITIES
    ---------------------------------------------------------- */

    /**
     * Create a vertical gradient for Chart.js.
     */
    function _chartGradient(ctx, colorRgb, startAlpha = 0.5, endAlpha = 0.02) {
        const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
        gradient.addColorStop(0, `rgba(${colorRgb},${startAlpha})`);
        gradient.addColorStop(1, `rgba(${colorRgb},${endAlpha})`);
        return gradient;
    }

    // Track chart instances for cleanup
    let _confidenceChart = null;
    let _statusChart = null;
    let _timelineChart = null;
    let _chartType = { confidence: 'doughnut', status: 'doughnut' };

    function _destroyCharts() {
        if (_confidenceChart) { _confidenceChart.destroy(); _confidenceChart = null; }
        if (_statusChart) { _statusChart.destroy(); _statusChart = null; }
        if (_timelineChart) { _timelineChart.destroy(); _timelineChart = null; }
    }

    /* ----------------------------------------------------------
       5. SCROLL-TRIGGERED CHART RENDERING
    ---------------------------------------------------------- */

    function _renderChartsOnScroll(stats) {
        const chartsRow = document.querySelector('.charts-row');
        if (!chartsRow) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    renderConfidenceChart(stats);
                    renderStatusChart(stats);
                    observer.disconnect();
                }
            });
        }, { threshold: 0.15 });

        observer.observe(chartsRow);
    }

    /* ----------------------------------------------------------
       6. RENDER CONFIDENCE CHART (premium)
    ---------------------------------------------------------- */

    function renderConfidenceChart(stats) {
        const canvas = document.getElementById('confidenceChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        if (_confidenceChart) _confidenceChart.destroy();

        const type = _chartType.confidence;
        const data = [stats.high_confidence || 0, stats.medium_confidence || 0, stats.low_confidence || 0];
        const colors = [THEME.green, THEME.amber, THEME.red];

        const config = {
            type,
            data: {
                labels: ['High', 'Medium', 'Low'],
                datasets: [{
                    data,
                    backgroundColor: type === 'doughnut'
                        ? colors
                        : colors.map((_, i) => {
                            const rgbs = [THEME.greenRgb, THEME.amberRgb, THEME.redRgb];
                            return _chartGradient(ctx, rgbs[i], 0.7, 0.15);
                        }),
                    borderColor: type === 'doughnut' ? THEME.surface : colors,
                    borderWidth: type === 'doughnut' ? 3 : 1,
                    borderRadius: type === 'bar' ? 6 : 0,
                    hoverOffset: type === 'doughnut' ? 10 : 0,
                }]
            },
            options: {
                responsive: true,
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
                            label: (ctx) => ` ${ctx.label}: ${ctx.parsed.toLocaleString()}`
                        }
                    }
                },
                ...(type === 'bar' ? {
                    scales: {
                        x: { ticks: { color: THEME.textDim }, grid: { color: 'rgba(255,255,255,0.04)' } },
                        y: { ticks: { color: THEME.textDim }, grid: { color: 'rgba(255,255,255,0.04)' } }
                    }
                } : {
                    cutout: '65%'
                })
            }
        };

        _confidenceChart = new Chart(canvas, config);
    }

    /* ----------------------------------------------------------
       7. RENDER STATUS CHART (premium)
    ---------------------------------------------------------- */

    function renderStatusChart(stats) {
        const canvas = document.getElementById('statusChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        if (_statusChart) _statusChart.destroy();

        const type = _chartType.status;
        const data = [stats.active_subs || 0, stats.divested_subs || 0];
        const colors = [THEME.sky, THEME.amber];

        const config = {
            type,
            data: {
                labels: ['Active', 'Divested'],
                datasets: [{
                    data,
                    backgroundColor: type === 'doughnut'
                        ? colors
                        : colors.map((_, i) => {
                            const rgbs = [THEME.skyRgb, THEME.amberRgb];
                            return _chartGradient(ctx, rgbs[i], 0.7, 0.15);
                        }),
                    borderColor: type === 'doughnut' ? THEME.surface : colors,
                    borderWidth: type === 'doughnut' ? 3 : 1,
                    borderRadius: type === 'bar' ? 6 : 0,
                    hoverOffset: type === 'doughnut' ? 10 : 0,
                }]
            },
            options: {
                responsive: true,
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
                },
                ...(type === 'bar' ? {
                    scales: {
                        x: { ticks: { color: THEME.textDim }, grid: { color: 'rgba(255,255,255,0.04)' } },
                        y: { ticks: { color: THEME.textDim }, grid: { color: 'rgba(255,255,255,0.04)' } }
                    }
                } : {
                    cutout: '65%'
                })
            }
        };

        _statusChart = new Chart(canvas, config);
    }

    /* ----------------------------------------------------------
       7b. M&A TIMELINE CHART (stacked bar by year)
    ---------------------------------------------------------- */

    async function renderTimelineChart() {
        const canvas = document.getElementById('timelineChart');
        if (!canvas) return;

        if (_timelineChart) _timelineChart.destroy();

        try {
            const data = await fetch('/api/subsidiaries/timeline').then(r => r.json());
            const timeline = data.timeline || {};
            const years = Object.keys(timeline).sort();

            if (years.length === 0) return;

            const typeColors = {
                'Internal Creation': { bg: 'rgba(34,197,94,0.7)', border: THEME.green },
                'External Acquisition': { bg: 'rgba(245,158,11,0.7)', border: THEME.amber },
                'Restructuring': { bg: 'rgba(139,92,246,0.7)', border: '#8b5cf6' },
                'Joint Venture': { bg: 'rgba(6,182,212,0.7)', border: '#06b6d4' },
                'Spin-off': { bg: 'rgba(236,72,153,0.7)', border: '#ec4899' },
            };

            const allTypes = new Set();
            years.forEach(y => Object.keys(timeline[y]).forEach(t => allTypes.add(t)));

            const datasets = [...allTypes].map(type => ({
                label: type,
                data: years.map(y => timeline[y][type] || 0),
                backgroundColor: (typeColors[type] || { bg: 'rgba(138,144,165,0.5)' }).bg,
                borderColor: (typeColors[type] || { border: THEME.textDim }).border,
                borderWidth: 1,
                borderRadius: 3,
            }));

            _timelineChart = new Chart(canvas, {
                type: 'bar',
                data: { labels: years, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 1000, easing: 'easeOutQuart' },
                    scales: {
                        x: {
                            stacked: true,
                            ticks: { color: THEME.textDim, maxRotation: 45, font: { size: 10 } },
                            grid: { color: 'rgba(255,255,255,0.04)' },
                        },
                        y: {
                            stacked: true,
                            ticks: { color: THEME.textDim, callback: v => v >= 1000 ? (v/1000).toFixed(0) + 'k' : v },
                            grid: { color: 'rgba(255,255,255,0.04)' },
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { color: THEME.textDim, padding: 12, usePointStyle: true, pointStyleWidth: 10, font: { size: 11, family: 'Inter, system-ui, sans-serif' } }
                        },
                        tooltip: {
                            backgroundColor: THEME.surfaceAlt, titleColor: '#fff', bodyColor: THEME.textDim,
                            borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, cornerRadius: 8, padding: 12,
                            callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y.toLocaleString()}` }
                        }
                    }
                }
            });
        } catch (e) {
            console.warn('Timeline chart failed:', e);
        }
    }

    /* ----------------------------------------------------------
       7c. ACQUISITION RADAR (recent notable acquisitions)
    ---------------------------------------------------------- */

    async function renderAcquisitionRadar() {
        const container = document.getElementById('acquisitionRadar');
        if (!container) return;

        try {
            const data = await fetch('/api/subsidiaries/recent-acquisitions').then(r => r.json());
            const acqs = data.acquisitions || [];

            if (acqs.length === 0) {
                container.innerHTML = '<p style="color: var(--text-dim); padding: 1rem; text-align: center;">No acquisitions detected yet. Run Turbo Enrich to classify subsidiaries.</p>';
                return;
            }

            container.innerHTML = acqs.map((a, i) => `
                <div class="radar-item float-in" style="display: flex; align-items: center; gap: 0.75rem; padding: 0.65rem 0; border-bottom: 1px solid rgba(255,255,255,0.04); animation-delay: ${i * 40}ms; cursor: pointer;" onclick="navigate('company', {cik: '${a.cik}'})">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: ${THEME.amber}; flex-shrink: 0; box-shadow: 0 0 8px rgba(245,158,11,0.4);"></div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-size: 0.82rem; font-weight: 600; color: #e4e6f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(a.sub_name)}</div>
                        <div style="font-size: 0.7rem; color: var(--text-dim);">by ${escapeHtml(a.company_name)}</div>
                    </div>
                    <div style="font-size: 0.65rem; color: var(--text-dim); font-family: monospace; flex-shrink: 0;">${a.first_seen ? a.first_seen.substring(0, 4) : ''}</div>
                </div>
            `).join('');
        } catch (e) {
            container.innerHTML = '<p style="color: var(--text-dim); padding: 1rem;">Could not load acquisition data.</p>';
        }
    }

    /* ----------------------------------------------------------
       7d. CLASSIFICATION ACCURACY BADGE
    ---------------------------------------------------------- */

    async function renderClassificationBadge() {
        const container = document.getElementById('classificationBadge');
        if (!container) return;

        try {
            const data = await fetch('/api/subsidiaries/classification-stats').then(r => r.json());
            const dist = data.distribution || {};
            const total = Object.values(dist).reduce((a, b) => a + b, 0);

            const typeColors = {
                'Internal Creation': THEME.green,
                'External Acquisition': THEME.amber,
                'Restructuring': '#8b5cf6',
                'Joint Venture': '#06b6d4',
                'Spin-off': '#ec4899',
            };

            const distHtml = Object.entries(dist)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([type, count]) => {
                    const pct = total > 0 ? (count / total * 100).toFixed(1) : 0;
                    const color = typeColors[type] || THEME.textDim;
                    return `
                        <div style="margin-bottom: 0.5rem;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 0.2rem;">
                                <span style="font-size: 0.75rem; color: ${color};">${escapeHtml(type)}</span>
                                <span style="font-size: 0.7rem; color: var(--text-dim);">${count.toLocaleString()} (${pct}%)</span>
                            </div>
                            <div style="height: 4px; border-radius: 2px; background: var(--surface2); overflow: hidden;">
                                <div style="height: 100%; width: ${pct}%; background: ${color}; border-radius: 2px; transition: width 1s ease;"></div>
                            </div>
                        </div>`;
                }).join('');

            container.innerHTML = `
                <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem;">
                    <div style="padding: 0.4rem 0.9rem; border-radius: 20px; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.05em; background: rgba(${THEME.greenRgb},0.12); color: ${THEME.green}; border: 1px solid rgba(${THEME.greenRgb},0.25);">
                        ${escapeHtml(data.method)}
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text-dim);">
                        Est. accuracy: <strong style="color: #e4e6f0;">${escapeHtml(data.estimated_accuracy)}</strong>
                    </div>
                </div>
                <div style="font-size: 0.7rem; color: var(--text-dim); margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600;">
                    Type Distribution (${total.toLocaleString()} classified)
                </div>
                ${distHtml}
            `;
        } catch (e) {
            container.innerHTML = '<p style="color: var(--text-dim); padding: 1rem;">Classification data unavailable.</p>';
        }
    }

    /* ----------------------------------------------------------
       8. CHART TYPE TOGGLE (doughnut <-> bar)
    ---------------------------------------------------------- */

    function _toggleChartType(chartKey, stats) {
        _chartType[chartKey] = _chartType[chartKey] === 'doughnut' ? 'bar' : 'doughnut';
        if (chartKey === 'confidence') renderConfidenceChart(stats);
        if (chartKey === 'status') renderStatusChart(stats);
    }

    /* ----------------------------------------------------------
       9. MAIN RENDER — Premium Dashboard
    ---------------------------------------------------------- */

    async function renderDashboard() {
        _destroyCharts();

        let stats;
        try {
            stats = await api('/api/subsidiaries/stats/overview');
        } catch (e) {
            return; // api() shows error UI + toast
        }

        const now = new Date();
        const freshness = now.toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        const totalSubs = stats.total_subsidiaries || 1165840;
        const totalCompanies = stats.total_companies || 11500;
        const heroSubtitle = `Across ${formatNumber(totalCompanies)}+ companies from SEC Exhibit 21 filings (1994\u20132025)`;

        // Stat card data
        const cards = [
            { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 21h18M3 7v14M21 7v14M6 11h4M6 15h4M14 11h4M14 15h4M9 3h6l3 4H6l3-4z"/></svg>', label: 'Total Companies', value: stats.total_companies, color: 'sky',    colorRgb: THEME.skyRgb },
            { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>', label: 'Total Subsidiaries', value: stats.total_subsidiaries, color: 'primary', colorRgb: THEME.primaryRgb },
            { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>', label: 'Active Subsidiaries', value: stats.active_subs, color: 'green',   colorRgb: THEME.greenRgb },
            { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/></svg>', label: 'Divested', value: stats.divested_subs, color: 'amber',  colorRgb: THEME.amberRgb },
            { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>', label: 'High Confidence', value: stats.high_confidence, color: 'green',   colorRgb: THEME.greenRgb },
            { icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2a4 4 0 014 4c0 1.95-2 5-4 5s-4-3.05-4-5a4 4 0 014-4z"/><path d="M8 14s-4 2-4 6h16c0-4-4-6-4-6"/><circle cx="12" cy="12" r="10"/></svg>', label: 'AI Enriched', value: stats.enriched, color: 'indigo', colorRgb: THEME.indigoRgb },
        ];

        // Quick actions
        const actions = [
            { icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>', label: 'Export All CSV', action: 'exportAllCSV()' },
            { icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>', label: 'Search & Explore', action: "navigate('search')" },
            { icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>', label: 'View Analytics', action: "navigate('analytics')" },
            { icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v-2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>', label: 'Compare Companies', action: "navigate('compare')" },
            { icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><line x1="14.5" y1="9.5" x2="17.5" y2="6.5"/><line x1="9.5" y1="14.5" x2="6.5" y2="17.5"/></svg>', label: 'Network Graph', action: "navigate('network')" },
            { icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>', label: 'System Status', action: "navigate('status')" },
            { icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 10 10-12h-9l1-10z"/></svg>', label: 'Turbo Enrich All', action: "runGlobalTurboEnrich()" },
        ];

        // Compute max subsidiaries for relative bar widths in table
        const topCompanies = stats.top_companies || [];
        const maxSubs = topCompanies.length > 0 ? Math.max(...topCompanies.map(c => c.num_subsidiaries || 0)) : 1;

        // Decorative sparkline SVGs (purely visual)
        const sparklines = [
            '<svg class="sparkline-svg" viewBox="0 0 60 24" fill="none"><polyline points="0,20 10,16 20,12 30,14 40,8 50,4 60,6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            '<svg class="sparkline-svg" viewBox="0 0 60 24" fill="none"><polyline points="0,18 10,14 20,10 30,6 40,8 50,4 60,2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            '<svg class="sparkline-svg" viewBox="0 0 60 24" fill="none"><polyline points="0,22 10,18 20,20 30,14 40,10 50,6 60,4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            '<svg class="sparkline-svg" viewBox="0 0 60 24" fill="none"><polyline points="0,4 10,8 20,6 30,10 40,14 50,18 60,20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            '<svg class="sparkline-svg" viewBox="0 0 60 24" fill="none"><polyline points="0,20 10,16 20,18 30,12 40,8 50,6 60,4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            '<svg class="sparkline-svg" viewBox="0 0 60 24" fill="none"><polyline points="0,16 10,12 20,14 30,8 40,6 50,4 60,2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        ];

        app.innerHTML = `
            <!-- Animated Mesh Background -->
            <div class="dashboard-mesh-bg" aria-hidden="true">
                <div class="mesh-orb mesh-orb-1"></div>
                <div class="mesh-orb mesh-orb-2"></div>
                <div class="mesh-orb mesh-orb-3"></div>
            </div>

            <!-- Hero Section -->
            <section class="dashboard-hero">
                <div class="hero-stat-wrapper">
                    <div class="hero-stat hero-stat-gradient" data-count-target="${totalSubs}" data-glow>0</div>
                    <div class="hero-stat-label">Subsidiaries Tracked</div>
                </div>
                <div class="hero-subtitle hero-subtitle-enhanced" id="heroSubtitle"></div>
                <div class="hero-freshness">
                    <span class="pulse-dot pulse-dot-live"></span>
                    <span class="freshness-label">Data Freshness</span>
                    <span class="freshness-sep">&middot;</span>
                    ${freshness}
                </div>
            </section>

            <!-- Command Palette Search Bar -->
            <section class="dashboard-search">
                <div class="command-search-bar" onclick="this.querySelector('input').focus()">
                    <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                    </svg>
                    <input type="text" id="dashSearch" placeholder="Search companies by name..."
                           onkeydown="if(event.key==='Enter') navigate('companies', {q: this.value})"
                           aria-label="Search companies">
                    <kbd class="search-kbd" aria-hidden="true">Ctrl+K</kbd>
                </div>
            </section>

            <!-- Stat Cards — Featured Row (first 2) -->
            <section class="stats-grid stats-grid-featured">
                ${cards.slice(0, 2).map((c, i) => `
                    <div class="stat-card stat-card-featured glass-card glow-card depth-card" style="--card-color: ${c.colorRgb}; --card-accent: rgba(${c.colorRgb},1); animation-delay: ${i * 80}ms;">
                        <div class="card-glow" aria-hidden="true"></div>
                        <div class="stat-card-inner">
                            <div class="stat-icon-wrap stat-icon-wrap-lg" style="color: rgba(${c.colorRgb},1);">${c.icon}</div>
                            <div class="stat-card-content">
                                <div class="stat-label">${c.label}</div>
                                <div class="stat-value stat-${c.color}" data-count-target="${c.value || 0}">0</div>
                            </div>
                            <div class="sparkline-wrap" style="color: rgba(${c.colorRgb},0.5);">${sparklines[i]}</div>
                        </div>
                        <div class="stat-card-accent-border" style="background: linear-gradient(90deg, transparent, rgba(${c.colorRgb},0.6), transparent);"></div>
                    </div>
                `).join('')}
            </section>

            <!-- Stat Cards — Secondary Row (remaining 4) -->
            <section class="stats-grid stats-grid-secondary">
                ${cards.slice(2).map((c, i) => `
                    <div class="stat-card glass-card glow-card depth-card" style="--card-color: ${c.colorRgb}; --card-accent: rgba(${c.colorRgb},1); animation-delay: ${(i + 2) * 80}ms;">
                        <div class="card-glow" aria-hidden="true"></div>
                        <div class="stat-icon-wrap" style="color: rgba(${c.colorRgb},1);">${c.icon}</div>
                        <div class="stat-label">${c.label}</div>
                        <div class="stat-value stat-${c.color}" data-count-target="${c.value || 0}">0</div>
                        <div class="sparkline-wrap sparkline-wrap-sm" style="color: rgba(${c.colorRgb},0.4);">${sparklines[i + 2]}</div>
                        <div class="stat-card-accent-border" style="background: linear-gradient(90deg, transparent, rgba(${c.colorRgb},0.5), transparent);"></div>
                    </div>
                `).join('')}
            </section>

            <!-- Quick Actions Grid -->
            <section class="quick-actions-grid">
                ${actions.map(a => `
                    <button class="quick-action-card quick-action-card-v2 glass-card depth-card btn-magnetic" onclick="${a.action}">
                        <span class="qa-icon-wrap qa-icon-wrap-v2">${a.icon}</span>
                        <span class="qa-label">${a.label}</span>
                    </button>
                `).join('')}
            </section>

            <!-- Charts Section Header -->
            <div class="charts-section-header">
                <div class="section-header-line"></div>
                <h2 class="section-header-title">Analytics Overview</h2>
                <div class="section-header-line"></div>
            </div>

            <!-- Charts Row -->
            <section class="charts-row charts-row-padded">
                <div class="chart-container chart-container-padded glass-card">
                    <div class="chart-header">
                        <h3>Confidence Distribution</h3>
                        <button class="chart-toggle-btn" id="toggleConfChart" aria-label="Toggle chart type"
                                title="Switch between doughnut and bar chart">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>
                        </button>
                    </div>
                    <canvas id="confidenceChart"></canvas>
                </div>
                <div class="chart-container chart-container-padded glass-card">
                    <div class="chart-header">
                        <h3>Active vs Divested</h3>
                        <button class="chart-toggle-btn" id="toggleStatusChart" aria-label="Toggle chart type"
                                title="Switch between doughnut and bar chart">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>
                        </button>
                    </div>
                    <canvas id="statusChart"></canvas>
                </div>
            </section>

            <!-- M&A Timeline Chart -->
            <div class="charts-section-header" style="margin-top: 1rem;">
                <div class="section-header-line"></div>
                <h2 class="section-header-title">M&A Timeline</h2>
                <div class="section-header-line"></div>
            </div>
            <section class="chart-container glass-card" style="padding: 1.5rem; border-radius: 14px; margin-bottom: 2rem; height: 380px;">
                <canvas id="timelineChart"></canvas>
            </section>

            <!-- Acquisition Radar + Classification Badge Row -->
            <section class="charts-row charts-row-padded" style="margin-bottom: 2rem;">
                <div class="chart-container chart-container-padded glass-card" style="flex: 1.2;">
                    <div class="chart-header">
                        <h3>Acquisition Radar</h3>
                        <span style="font-size: 0.65rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.08em;">Recent High-Confidence</span>
                    </div>
                    <div id="acquisitionRadar" style="max-height: 320px; overflow-y: auto; padding-right: 0.25rem;"></div>
                </div>
                <div class="chart-container chart-container-padded glass-card" style="flex: 0.8;">
                    <div class="chart-header">
                        <h3>Classification Engine</h3>
                    </div>
                    <div id="classificationBadge"></div>
                </div>
            </section>

            <!-- Top Companies Table -->
            <section class="dashboard-table-section">
                <div class="section-header">
                    <h2>Top Companies by Subsidiaries</h2>
                    <button class="btn btn-outline btn-sm" onclick="navigate('companies')">View All</button>
                </div>
                <div class="table-container glass-card">
                    <table class="premium-table premium-table-v2">
                        <thead>
                            <tr>
                                <th style="width:3rem;">Rank</th>
                                <th>Company</th>
                                <th>CIK</th>
                                <th>Subsidiaries</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${topCompanies.map((c, i) => {
                                const pct = maxSubs > 0 ? ((c.num_subsidiaries || 0) / maxSubs * 100) : 0;
                                return `
                                <tr class="clickable table-row-animate table-row-v2 ${i % 2 === 0 ? 'table-row-even' : 'table-row-odd'}" onclick="navigate('company', {cik: '${c.cik}'})"
                                    style="animation-delay: ${i * 40}ms;">
                                    <td>
                                        <span class="rank-circle rank-${i < 3 ? i + 1 : 'default'}">${i + 1}</span>
                                    </td>
                                    <td class="company-name">${escapeHtml(c.company_name)}</td>
                                    <td class="cik-mono">${c.cik}</td>
                                    <td class="sub-count-cell">
                                        <div class="sub-count-bar-bg"><div class="sub-count-bar" style="width: ${pct}%;"></div></div>
                                        <strong class="sub-count">${formatNumber(c.num_subsidiaries)}</strong>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </section>

            <!-- Quick Stats Footer -->
            <section class="dashboard-footer-stats">
                <div class="footer-stat-card glass-card">
                    <div class="footer-stat-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                    </div>
                    <div class="footer-stat-label">Dataset Coverage</div>
                    <div class="footer-stat-value">1994\u20132025 (31 years)</div>
                </div>
                <div class="footer-stat-card glass-card">
                    <div class="footer-stat-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                    </div>
                    <div class="footer-stat-label">Last Updated</div>
                    <div class="footer-stat-value">${freshness}</div>
                </div>
                <div class="footer-stat-card glass-card">
                    <div class="footer-stat-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    </div>
                    <div class="footer-stat-label">Data Source</div>
                    <div class="footer-stat-value">SEC Exhibit 21 Filings</div>
                </div>
            </section>
        `;

        // --- Post-render setup ---

        // GSAP hero entrance if available, otherwise fallback
        if (typeof gsapHeroEntrance === 'function') {
            gsapHeroEntrance();
        }

        // Typewriter effect for subtitle
        const subtitleEl = document.getElementById('heroSubtitle');
        if (subtitleEl) {
            typewriter(subtitleEl, heroSubtitle, 22);
        }

        // GSAP counters if available, otherwise fallback
        if (typeof gsapCountUp === 'function') {
            document.querySelectorAll('[data-count-target]').forEach(el => {
                const target = parseInt(el.dataset.countTarget, 10);
                if (target > 0) gsapCountUp(el, target, 1.8);
            });
        } else {
            startAllCounters();
        }

        // 3D tilt on stat cards
        _initTiltCards();

        // GSAP stagger cards
        try {
            if (typeof gsapStaggerCards === 'function') {
                gsapStaggerCards('.stats-grid-featured');
                gsapStaggerCards('.stats-grid-secondary');
                gsapStaggerCards('.quick-actions-grid');
            }
        } catch (e) { console.warn('gsapStaggerCards error:', e); }

        // Render charts on scroll (uses IntersectionObserver)
        _renderChartsOnScroll(stats);

        // Render new dashboard sections (async, non-blocking)
        renderTimelineChart();
        renderAcquisitionRadar();
        renderClassificationBadge();

        // Chart toggle buttons
        const confToggle = document.getElementById('toggleConfChart');
        const statusToggle = document.getElementById('toggleStatusChart');
        if (confToggle) {
            confToggle.addEventListener('click', () => _toggleChartType('confidence', stats));
        }
        if (statusToggle) {
            statusToggle.addEventListener('click', () => _toggleChartType('status', stats));
        }
    }

    /* ----------------------------------------------------------
       10. EXPORT CSV
    ---------------------------------------------------------- */

    function exportAllCSV() {
        try {
            showToast('Preparing CSV export...', 'info', 2000);
            window.open('/api/subsidiaries/export/csv', '_blank');
        } catch (e) {
            console.error('CSV export failed:', e);
            showToast('Export failed. Please try again.', 'error');
        }
    }

    /* ----------------------------------------------------------
       EXPOSE PUBLIC API
    ---------------------------------------------------------- */

    window.renderDashboard = renderDashboard;
    window.animateCounter = animateCounter;
    window.startAllCounters = startAllCounters;
    window.renderConfidenceChart = renderConfidenceChart;
    window.renderStatusChart = renderStatusChart;
    window.exportAllCSV = exportAllCSV;

})();
