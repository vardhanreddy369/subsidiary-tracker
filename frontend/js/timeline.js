/* ============================================================
   SubTrack — Timeline Player (1994–2025)
   Cinematic playable timeline of 31 years of subsidiary data
   ============================================================ */

(() => {
    'use strict';

    const START_YEAR = 1994;
    const END_YEAR   = 2025;
    const TOTAL_YEARS = END_YEAR - START_YEAR + 1; // 32

    let _timelineChart = null;
    let _playInterval  = null;
    let _currentIndex  = 0;
    let _isPlaying     = false;
    let _speed         = 1;          // 1x, 2x, 4x
    let _timelineData  = [];
    let _cumulativeData = [];

    /* ----------------------------------------------------------
       SVG Icons for stat cards
    ---------------------------------------------------------- */

    const STAT_ICONS = {
        year: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
        companies: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="8" width="7" height="13" rx="1"/><line x1="5" y1="7" x2="8" y2="7"/><line x1="5" y1="11" x2="8" y2="11"/><line x1="5" y1="15" x2="8" y2="15"/><line x1="16" y1="12" x2="19" y2="12"/><line x1="16" y1="16" x2="19" y2="16"/></svg>`,
        subsidiaries: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
        cumulative: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
        growth: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`
    };

    /* ----------------------------------------------------------
       Render
    ---------------------------------------------------------- */

    async function renderTimelinePage() {
        const app = document.getElementById('app');

        // Skeleton loading state
        app.innerHTML = `
            <div class="timeline-page page-transition">
                <div class="timeline-hero page-mesh-bg">
                    <div class="skeleton-block" style="width: 60%; height: 2rem; margin: 0 auto 0.75rem; border-radius: 8px; background: rgba(46,51,71,0.4); animation: skeleton-pulse 1.5s ease-in-out infinite;"></div>
                    <div class="skeleton-block" style="width: 80%; height: 1rem; margin: 0 auto; border-radius: 6px; background: rgba(46,51,71,0.3); animation: skeleton-pulse 1.5s ease-in-out 0.2s infinite;"></div>
                </div>
                <div class="timeline-stats-bar">
                    ${Array(5).fill('').map(() => `
                        <div class="timeline-stat glass-card">
                            <div class="skeleton-block" style="width: 50%; height: 0.7rem; border-radius: 4px; background: rgba(46,51,71,0.3); margin-bottom: 0.5rem; animation: skeleton-pulse 1.5s ease-in-out infinite;"></div>
                            <div class="skeleton-block" style="width: 70%; height: 1.5rem; border-radius: 6px; background: rgba(46,51,71,0.4); animation: skeleton-pulse 1.5s ease-in-out 0.15s infinite;"></div>
                        </div>
                    `).join('')}
                </div>
                <div class="timeline-chart-wrap glass-card">
                    <div class="skeleton-block" style="width: 100%; height: 350px; border-radius: 12px; background: rgba(46,51,71,0.2); animation: skeleton-pulse 1.5s ease-in-out infinite;"></div>
                </div>
            </div>`;

        let data;
        try {
            data = await api('/api/analytics/timeline');
        } catch (e) { return; }

        // Sort and store
        _timelineData = (data || []).sort((a, b) => Number(a.year) - Number(b.year));

        // Build cumulative
        let cumulative = 0;
        _cumulativeData = _timelineData.map(d => {
            cumulative += (d.subsidiaries_seen || 0);
            return cumulative;
        });

        _currentIndex = 0;
        _isPlaying = false;
        _speed = 1;
        if (_playInterval) { clearInterval(_playInterval); _playInterval = null; }

        const years = _timelineData.map(d => d.year);
        const firstYear = years[0] || START_YEAR;
        const lastYear  = years[years.length - 1] || END_YEAR;

        // Compute milestones (top 3 growth years)
        const milestones = _computeMilestones();

        app.innerHTML = `
        <div class="timeline-page">
            <!-- Hero with mesh gradient -->
            <div class="timeline-hero page-mesh-bg">
                <h2 class="text-gradient timeline-title">Corporate Timeline: ${firstYear}\u2013${lastYear}</h2>
                <p class="timeline-subtitle">31 years of SEC Exhibit 21 subsidiary data — animated as a playable timeline</p>
            </div>

            <!-- Stats Bar -->
            <div class="timeline-stats-bar">
                <div class="timeline-stat glass-card">
                    <span class="timeline-stat-icon" style="color: var(--accent);">${STAT_ICONS.year}</span>
                    <span class="timeline-stat-label">Year</span>
                    <span class="timeline-stat-value" id="tl-year">${firstYear}</span>
                </div>
                <div class="timeline-stat glass-card">
                    <span class="timeline-stat-icon" style="color: var(--purple);">${STAT_ICONS.companies}</span>
                    <span class="timeline-stat-label">Companies Filing</span>
                    <span class="timeline-stat-value" id="tl-companies">0</span>
                </div>
                <div class="timeline-stat glass-card">
                    <span class="timeline-stat-icon" style="color: var(--primary);">${STAT_ICONS.subsidiaries}</span>
                    <span class="timeline-stat-label">Subsidiaries Seen</span>
                    <span class="timeline-stat-value" id="tl-subs">0</span>
                </div>
                <div class="timeline-stat glass-card">
                    <span class="timeline-stat-icon" style="color: var(--green);">${STAT_ICONS.cumulative}</span>
                    <span class="timeline-stat-label">Cumulative Subs</span>
                    <span class="timeline-stat-value" id="tl-cumulative">0</span>
                </div>
                <div class="timeline-stat glass-card">
                    <span class="timeline-stat-icon" style="color: var(--red);">${STAT_ICONS.growth}</span>
                    <span class="timeline-stat-label">Growth Rate</span>
                    <span class="timeline-stat-value" id="tl-growth">\u2014</span>
                </div>
            </div>

            <!-- Chart -->
            <div class="timeline-chart-wrap glass-card">
                <canvas id="timelinePlayerChart"></canvas>
                <div class="timeline-playhead" id="tl-playhead"></div>
            </div>

            <!-- Milestones Row -->
            ${milestones.length > 0 ? `
            <div class="timeline-milestones">
                <span class="timeline-milestones-label">Key Growth Years</span>
                <div class="timeline-milestones-badges">
                    ${milestones.map(m => `
                        <span class="milestone-badge" onclick="window._tlJumpTo(${m.index})" title="Click to jump to ${m.year}">
                            <span class="milestone-badge-year">${m.year}</span>
                            <span class="milestone-badge-rate">${m.rate >= 0 ? '+' : ''}${m.rate.toFixed(1)}% Growth</span>
                        </span>
                    `).join('')}
                </div>
            </div>` : ''}

            <!-- Player Controls -->
            <div class="timeline-player-controls glass-card">
                <div class="timeline-controls-row">
                    <button class="step-btn" id="tl-step-back" title="Previous year">&#9198;</button>
                    <button class="play-btn" id="tl-play" title="Play / Pause">&#9654;</button>
                    <button class="step-btn" id="tl-step-fwd" title="Next year">&#9197;</button>
                    <button class="step-btn" id="tl-reset" title="Reset">&#8634;</button>
                </div>

                <div class="timeline-scrubber-row">
                    <span class="timeline-scrubber-label" id="tl-scrub-label">${firstYear}</span>
                    <input type="range" class="timeline-scrubber" id="tl-scrubber"
                           min="0" max="${_timelineData.length - 1}" value="0" step="1">
                    <span class="timeline-scrubber-label">${lastYear}</span>
                </div>

                <div class="timeline-speed-row">
                    <button class="speed-btn active" data-speed="1" id="tl-speed-1">1x</button>
                    <button class="speed-btn" data-speed="2" id="tl-speed-2">2x</button>
                    <button class="speed-btn" data-speed="4" id="tl-speed-4">4x</button>
                </div>

                <div class="timeline-year-display" id="tl-year-big">${firstYear}</div>
            </div>

            <!-- Year Snapshot Cards -->
            <div class="timeline-snapshots" id="tl-snapshots"></div>
        </div>`;

        // Build chart
        _buildChart();

        // Wire controls
        _wireControls();

        // Set initial state
        _updateToIndex(0);

        // GSAP entrance
        if (typeof gsap !== 'undefined') {
            gsap.from('.timeline-hero', { opacity: 0, y: -30, duration: 0.7, ease: 'power3.out' });
            gsap.from('.timeline-stat', { opacity: 0, y: 20, stagger: 0.08, duration: 0.5, ease: 'power2.out', delay: 0.2 });
            gsap.from('.timeline-chart-wrap', { opacity: 0, scale: 0.97, duration: 0.6, ease: 'power2.out', delay: 0.35 });
            gsap.from('.timeline-milestones', { opacity: 0, y: 15, duration: 0.5, ease: 'power2.out', delay: 0.42 });
            gsap.from('.timeline-player-controls', { opacity: 0, y: 20, duration: 0.5, ease: 'power2.out', delay: 0.5 });
        }
    }

    /* ----------------------------------------------------------
       Compute milestones — top 3 years by growth rate
    ---------------------------------------------------------- */

    function _computeMilestones() {
        if (_timelineData.length < 2) return [];

        const growthYears = [];
        for (let i = 1; i < _timelineData.length; i++) {
            const prev = _timelineData[i - 1].subsidiaries_seen || 1;
            const curr = _timelineData[i].subsidiaries_seen || 0;
            const rate = ((curr - prev) / prev) * 100;
            growthYears.push({ index: i, year: _timelineData[i].year, rate: rate });
        }

        // Sort by rate descending, take top 3
        growthYears.sort((a, b) => b.rate - a.rate);
        return growthYears.slice(0, 3).sort((a, b) => a.year - b.year);
    }

    /* ----------------------------------------------------------
       Chart
    ---------------------------------------------------------- */

    function _buildChart() {
        if (_timelineChart) { _timelineChart.destroy(); _timelineChart = null; }

        const canvas = document.getElementById('timelinePlayerChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const labels = _timelineData.map(d => d.year);
        const subsData = _timelineData.map(d => d.subsidiaries_seen || 0);
        const compData = _timelineData.map(d => d.companies_filing || 0);

        // Gradient for subsidiaries
        const subsGrad = ctx.createLinearGradient(0, 0, 0, canvas.height || 400);
        subsGrad.addColorStop(0, 'rgba(14, 165, 233, 0.45)');
        subsGrad.addColorStop(1, 'rgba(14, 165, 233, 0.02)');

        // Gradient for companies
        const compGrad = ctx.createLinearGradient(0, 0, 0, canvas.height || 400);
        compGrad.addColorStop(0, 'rgba(139, 92, 246, 0.35)');
        compGrad.addColorStop(1, 'rgba(139, 92, 246, 0.02)');

        _timelineChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Subsidiaries Seen',
                        data: subsData,
                        borderColor: '#0ea5e9',
                        backgroundColor: subsGrad,
                        fill: true,
                        tension: 0.35,
                        borderWidth: 2.5,
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        pointHoverBackgroundColor: '#0ea5e9',
                        pointHoverBorderColor: '#fff',
                        pointHoverBorderWidth: 2,
                        order: 1
                    },
                    {
                        label: 'Companies Filing',
                        data: compData,
                        borderColor: '#8b5cf6',
                        backgroundColor: compGrad,
                        fill: true,
                        tension: 0.35,
                        borderWidth: 2,
                        pointRadius: 0,
                        pointHoverRadius: 5,
                        pointHoverBackgroundColor: '#8b5cf6',
                        pointHoverBorderColor: '#fff',
                        pointHoverBorderWidth: 2,
                        yAxisID: 'y1',
                        order: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        labels: { color: '#6b7194', font: { size: 12 }, usePointStyle: true, pointStyleWidth: 12 }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(10, 14, 26, 0.95)',
                        titleColor: '#e4e7f1',
                        bodyColor: '#6b7194',
                        borderColor: 'rgba(46, 51, 71, 0.6)',
                        borderWidth: 1,
                        cornerRadius: 10,
                        padding: 12,
                        callbacks: {
                            label: function(ctx) {
                                return ctx.dataset.label + ': ' + formatNumber(ctx.parsed.y);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(46, 51, 71, 0.3)', drawBorder: false },
                        ticks: { color: '#6b7194', font: { size: 11 }, maxTicksLimit: 16 }
                    },
                    y: {
                        position: 'left',
                        grid: { color: 'rgba(46, 51, 71, 0.2)', drawBorder: false },
                        ticks: {
                            color: '#0ea5e9',
                            font: { size: 11 },
                            callback: function(v) { return formatNumber(v); }
                        },
                        title: { display: true, text: 'Subsidiaries', color: '#0ea5e9', font: { size: 12 } }
                    },
                    y1: {
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        ticks: {
                            color: '#8b5cf6',
                            font: { size: 11 },
                            callback: function(v) { return formatNumber(v); }
                        },
                        title: { display: true, text: 'Companies', color: '#8b5cf6', font: { size: 12 } }
                    }
                }
            },
            plugins: [{
                id: 'playheadLine',
                afterDraw: function(chart) {
                    if (_currentIndex < 0 || _currentIndex >= _timelineData.length) return;
                    const meta = chart.getDatasetMeta(0);
                    if (!meta || !meta.data || !meta.data[_currentIndex]) return;
                    const x = meta.data[_currentIndex].x;
                    const yAxis = chart.scales.y;
                    const ctx = chart.ctx;

                    ctx.save();
                    ctx.beginPath();
                    ctx.setLineDash([6, 4]);
                    ctx.strokeStyle = 'rgba(245, 158, 11, 0.8)';
                    ctx.lineWidth = 2;
                    ctx.moveTo(x, yAxis.top);
                    ctx.lineTo(x, yAxis.bottom);
                    ctx.stroke();

                    // Glow circle at data point
                    ctx.beginPath();
                    ctx.arc(x, meta.data[_currentIndex].y, 7, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(x, meta.data[_currentIndex].y, 4, 0, Math.PI * 2);
                    ctx.fillStyle = '#f59e0b';
                    ctx.fill();

                    ctx.restore();
                }
            }]
        });
    }

    /* ----------------------------------------------------------
       Controls
    ---------------------------------------------------------- */

    function _wireControls() {
        const playBtn    = document.getElementById('tl-play');
        const stepBack   = document.getElementById('tl-step-back');
        const stepFwd    = document.getElementById('tl-step-fwd');
        const resetBtn   = document.getElementById('tl-reset');
        const scrubber   = document.getElementById('tl-scrubber');
        const speedBtns  = [
            document.getElementById('tl-speed-1'),
            document.getElementById('tl-speed-2'),
            document.getElementById('tl-speed-4')
        ];

        if (playBtn) playBtn.addEventListener('click', _togglePlay);
        if (stepBack) stepBack.addEventListener('click', () => { _pause(); _step(-1); });
        if (stepFwd) stepFwd.addEventListener('click', () => { _pause(); _step(1); });
        if (resetBtn) resetBtn.addEventListener('click', _reset);

        if (scrubber) {
            scrubber.addEventListener('input', (e) => {
                _pause();
                _updateToIndex(parseInt(e.target.value, 10));
            });
        }

        speedBtns.forEach(btn => {
            if (!btn) return;
            btn.addEventListener('click', () => {
                const s = parseInt(btn.dataset.speed, 10);
                _speed = s;
                speedBtns.forEach(b => b && b.classList.remove('active'));
                btn.classList.add('active');
                // If playing, restart interval with new speed
                if (_isPlaying) {
                    clearInterval(_playInterval);
                    _startInterval();
                }
            });
        });
    }

    /* ----------------------------------------------------------
       Playback
    ---------------------------------------------------------- */

    function _togglePlay() {
        if (_isPlaying) {
            _pause();
        } else {
            // If at end, restart
            if (_currentIndex >= _timelineData.length - 1) {
                _currentIndex = 0;
                _updateToIndex(0);
            }
            _play();
        }
    }

    function _play() {
        _isPlaying = true;
        const btn = document.getElementById('tl-play');
        if (btn) {
            btn.innerHTML = '&#9208;'; // pause icon
            btn.classList.add('playing');
            btn.classList.remove('paused');
        }
        _startInterval();
    }

    function _pause() {
        _isPlaying = false;
        if (_playInterval) { clearInterval(_playInterval); _playInterval = null; }
        const btn = document.getElementById('tl-play');
        if (btn) {
            btn.innerHTML = '&#9654;'; // play icon
            btn.classList.remove('playing');
            btn.classList.add('paused');
        }
    }

    function _startInterval() {
        const ms = 1000 / _speed;
        _playInterval = setInterval(() => {
            if (_currentIndex >= _timelineData.length - 1) {
                _pause();
                return;
            }
            _step(1);
        }, ms);
    }

    function _step(dir) {
        const next = _currentIndex + dir;
        if (next < 0 || next >= _timelineData.length) return;
        _updateToIndex(next);
    }

    function _reset() {
        _pause();
        _currentIndex = 0;
        _updateToIndex(0);
    }

    /* ----------------------------------------------------------
       Update UI to given index
    ---------------------------------------------------------- */

    function _updateToIndex(idx) {
        _currentIndex = idx;
        const d = _timelineData[idx];
        if (!d) return;

        const year       = d.year;
        const companies  = d.companies_filing || 0;
        const subs       = d.subsidiaries_seen || 0;
        const cumulative = _cumulativeData[idx] || 0;

        // Growth rate
        let growth = '\u2014';
        if (idx > 0) {
            const prevSubs = _timelineData[idx - 1].subsidiaries_seen || 1;
            const rate = ((subs - prevSubs) / prevSubs * 100).toFixed(1);
            growth = (rate >= 0 ? '+' : '') + rate + '%';
        }

        // Update stat cards with GSAP counter animation
        _animateValue('tl-year', year, true);
        _animateValue('tl-companies', companies);
        _animateValue('tl-subs', subs);
        _animateValue('tl-cumulative', cumulative);
        const growthEl = document.getElementById('tl-growth');
        if (growthEl) {
            growthEl.textContent = growth;
            growthEl.style.color = growth.startsWith('+') ? 'var(--green)' : growth.startsWith('-') ? 'var(--red)' : 'var(--text-dim)';
        }

        // Year display
        const yearBig = document.getElementById('tl-year-big');
        if (yearBig) yearBig.textContent = year;

        // Scrubber label
        const scrubLabel = document.getElementById('tl-scrub-label');
        if (scrubLabel) scrubLabel.textContent = year;

        // Scrubber position
        const scrubber = document.getElementById('tl-scrubber');
        if (scrubber) scrubber.value = idx;

        // Update chart playhead
        if (_timelineChart) {
            _timelineChart.update('none');
        }

        // Update snapshot cards
        _renderSnapshot(idx);
    }

    function _animateValue(elId, value, isYear) {
        const el = document.getElementById(elId);
        if (!el) return;
        if (isYear) {
            el.textContent = value;
            return;
        }
        // Quick GSAP counter
        if (typeof gsap !== 'undefined') {
            const obj = { val: parseInt(el.textContent.replace(/,/g, ''), 10) || 0 };
            gsap.to(obj, {
                val: value,
                duration: 0.4,
                ease: 'power2.out',
                onUpdate: () => {
                    el.textContent = formatNumber(Math.round(obj.val));
                }
            });
        } else {
            el.textContent = formatNumber(value);
        }
    }

    /* ----------------------------------------------------------
       Snapshot cards (with mini bar)
    ---------------------------------------------------------- */

    function _renderSnapshot(idx) {
        const container = document.getElementById('tl-snapshots');
        if (!container) return;

        // Find max subsidiaries for proportional bar
        const maxSubs = Math.max(..._timelineData.map(d => d.subsidiaries_seen || 0), 1);

        // Show cards for current and surrounding years
        const start = Math.max(0, idx - 1);
        const end   = Math.min(_timelineData.length - 1, idx + 3);

        let html = '<div class="timeline-snapshot-grid">';
        for (let i = start; i <= end; i++) {
            const d = _timelineData[i];
            const isCurrent = i === idx;
            const prevSubs = i > 0 ? (_timelineData[i - 1].subsidiaries_seen || 0) : 0;
            const change = i > 0 ? (d.subsidiaries_seen || 0) - prevSubs : 0;
            const changeClass = change > 0 ? 'positive' : change < 0 ? 'negative' : '';
            const changeStr = change > 0 ? '+' + formatNumber(change) : change < 0 ? formatNumber(change) : '\u2014';
            const barPct = Math.max(4, ((d.subsidiaries_seen || 0) / maxSubs) * 100);

            html += `
            <div class="timeline-snapshot-card glass-card ${isCurrent ? 'active' : ''}" data-idx="${i}" onclick="window._tlJumpTo(${i})">
                <div class="snapshot-year${isCurrent ? ' current' : ''}">${d.year}</div>
                <div class="snapshot-mini-bar-wrap">
                    <div class="snapshot-mini-bar" style="width: ${barPct}%;"></div>
                </div>
                <div class="snapshot-row">
                    <span class="snapshot-label">Companies</span>
                    <span class="snapshot-val">${formatNumber(d.companies_filing || 0)}</span>
                </div>
                <div class="snapshot-row">
                    <span class="snapshot-label">Subsidiaries</span>
                    <span class="snapshot-val">${formatNumber(d.subsidiaries_seen || 0)}</span>
                </div>
                <div class="snapshot-row">
                    <span class="snapshot-label">Change</span>
                    <span class="snapshot-val ${changeClass}">${changeStr}</span>
                </div>
                <div class="snapshot-row">
                    <span class="snapshot-label">Cumulative</span>
                    <span class="snapshot-val">${formatNumber(_cumulativeData[i] || 0)}</span>
                </div>
            </div>`;
        }
        html += '</div>';
        container.innerHTML = html;
    }

    function _jumpTo(idx) {
        _pause();
        _updateToIndex(idx);
    }

    /* ----------------------------------------------------------
       Expose
    ---------------------------------------------------------- */

    window.renderTimelinePage = renderTimelinePage;
    window._tlJumpTo = _jumpTo;

})();
