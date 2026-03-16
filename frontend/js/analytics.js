/* === Analytics Page — Premium UI === */

async function renderAnalytics() {
    app.innerHTML = `
        <div class="loading-screen page-transition">
            <div class="spinner"></div>
            <p>Loading analytics...</p>
        </div>`;

    let timeline, churn, sizeDist, confByYear, churners, longevity;
    try {
        [timeline, churn, sizeDist, confByYear, churners, longevity] = await Promise.all([
            api('/api/analytics/timeline'),
            api('/api/analytics/churn'),
            api('/api/analytics/size-distribution'),
            api('/api/analytics/confidence-by-year'),
            api('/api/analytics/top-churners'),
            api('/api/analytics/longevity'),
        ]);
    } catch (e) {
        return;
    }

    app.innerHTML = `
        <div class="analytics-page page-transition">
            <h2 class="text-gradient" style="margin-bottom: 0.5rem; font-size: 1.75rem;">Analytics & Insights</h2>
            <p style="color: var(--text-dim); margin-bottom: 2.5rem; font-size: 0.9rem;">
                Deep dive into subsidiary trends, churn patterns, and data quality metrics across the dataset.
            </p>

            <!-- Timeline Chart -->
            <div class="chart-container glass-card reveal float-in" style="margin-bottom: 2rem; padding: 1.5rem; border-radius: 14px;">
                <h3 class="text-gradient" style="margin-bottom: 1rem; font-size: 1.1rem;">Subsidiaries by Filing Year</h3>
                <canvas id="timelineChart" height="100"></canvas>
            </div>

            <!-- Churn Chart -->
            <div class="chart-container glass-card reveal float-in" style="margin-bottom: 2rem; padding: 1.5rem; border-radius: 14px; animation-delay: 100ms;">
                <h3 class="text-gradient" style="margin-bottom: 1rem; font-size: 1.1rem;">Year-over-Year Churn (Added vs Removed)</h3>
                <canvas id="churnChart" height="100"></canvas>
            </div>

            <div class="charts-row reveal stagger-in" style="margin-bottom: 2rem; display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
                <!-- Size Distribution -->
                <div class="chart-container glass-card scale-in" style="padding: 1.5rem; border-radius: 14px;">
                    <h3 class="text-gradient" style="margin-bottom: 1rem; font-size: 1.1rem;">Company Size Distribution</h3>
                    <canvas id="sizeDistChart"></canvas>
                </div>
                <!-- Longevity -->
                <div class="chart-container glass-card scale-in" style="padding: 1.5rem; border-radius: 14px; animation-delay: 150ms;">
                    <h3 class="text-gradient" style="margin-bottom: 1rem; font-size: 1.1rem;">Subsidiary Longevity</h3>
                    <canvas id="longevityChart"></canvas>
                </div>
            </div>

            <!-- Confidence by Year -->
            <div class="chart-container glass-card reveal float-in" style="margin-bottom: 2rem; padding: 1.5rem; border-radius: 14px; animation-delay: 200ms;">
                <h3 class="text-gradient" style="margin-bottom: 1rem; font-size: 1.1rem;">Confidence Distribution by Year</h3>
                <canvas id="confYearChart" height="100"></canvas>
            </div>

            <!-- Top Churners Table -->
            <div class="reveal" style="margin-bottom: 0.5rem;">
                <h2 class="text-gradient" style="font-size: 1.4rem;">Highest Churn Companies</h2>
            </div>
            <p style="color: var(--text-dim); margin-bottom: 1rem; font-size: 0.85rem;">
                Companies with the most subsidiary divestitures — potential M&A activity.
            </p>
            <div class="table-container glass-card reveal" style="border-radius: 14px;">
                <table class="premium-table">
                    <thead>
                        <tr>
                            <th>Company</th>
                            <th>Total Subs</th>
                            <th>Active</th>
                            <th>Divested</th>
                            <th>Churn Rate</th>
                            <th>Filings</th>
                        </tr>
                    </thead>
                    <tbody class="stagger-in">
                        ${churners.map((c, idx) => {
                            const rate = c.num_subsidiaries > 0
                                ? ((c.divested / c.num_subsidiaries) * 100).toFixed(1)
                                : '0.0';
                            return `
                            <tr class="clickable table-row-animate float-in" style="animation-delay: ${Math.min(idx * 30, 500)}ms;" onclick="navigate('company', {cik: '${c.cik}'})">
                                <td><strong>${escapeHtml(c.company_name)}</strong></td>
                                <td><span class="counter-glow">${formatNumber(c.num_subsidiaries)}</span></td>
                                <td style="color: var(--green);">${formatNumber(c.active)}</td>
                                <td style="color: var(--yellow);">${formatNumber(c.divested)}</td>
                                <td>
                                    <div class="churn-bar-wrap" style="position: relative; background: var(--surface2); border-radius: 6px; overflow: hidden; height: 22px;">
                                        <div class="churn-bar" style="width: ${rate}%; height: 100%; border-radius: 6px; background: linear-gradient(90deg, rgba(239,68,68,0.6), rgba(239,68,68,0.9)); transition: width 1s ease;"></div>
                                        <span style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 600;">${rate}%</span>
                                    </div>
                                </td>
                                <td>${c.num_filings}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // Render charts with staggered loading
    setTimeout(() => renderTimelineChart(timeline), 100);
    setTimeout(() => renderChurnChart(churn), 250);
    setTimeout(() => renderSizeDistChart(sizeDist), 400);
    setTimeout(() => renderLongevityChart(longevity), 500);
    setTimeout(() => renderConfYearChart(confByYear), 650);
}

function renderTimelineChart(data) {
    const ctx = document.getElementById('timelineChart');
    if (!ctx) return;

    const gradient1 = ctx.getContext('2d').createLinearGradient(0, 0, 0, 400);
    gradient1.addColorStop(0, 'rgba(59, 130, 246, 0.8)');
    gradient1.addColorStop(1, 'rgba(59, 130, 246, 0.2)');

    const gradient2 = ctx.getContext('2d').createLinearGradient(0, 0, 0, 400);
    gradient2.addColorStop(0, 'rgba(34, 197, 94, 0.8)');
    gradient2.addColorStop(1, 'rgba(34, 197, 94, 0.2)');

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.year),
            datasets: [{
                label: 'Subsidiaries Seen',
                data: data.map(d => d.subsidiaries_seen),
                backgroundColor: gradient1,
                borderColor: '#3b82f6',
                borderWidth: 1,
                borderRadius: 4,
            }, {
                label: 'Companies Filing',
                data: data.map(d => d.companies_filing),
                backgroundColor: gradient2,
                borderColor: '#22c55e',
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            animation: { duration: 1200, easing: 'easeOutQuart' },
            scales: {
                x: { ticks: { color: '#8a90a5' }, grid: { color: 'rgba(138,144,165,0.08)' } },
                y: { ticks: { color: '#8a90a5' }, grid: { color: 'rgba(138,144,165,0.08)' } }
            },
            plugins: {
                legend: { labels: { color: '#8a90a5', usePointStyle: true, pointStyle: 'circle', padding: 16 } },
                tooltip: { backgroundColor: 'rgba(15,17,24,0.95)', borderColor: 'rgba(59,130,246,0.3)', borderWidth: 1, cornerRadius: 8, titleColor: '#e4e6f0', bodyColor: '#8a90a5' }
            }
        }
    });
}

function renderChurnChart(data) {
    const ctx = document.getElementById('churnChart');
    if (!ctx) return;

    const years = [...new Set([
        ...data.added.map(d => d.year),
        ...data.removed.map(d => d.year)
    ])].sort();

    const addedMap = Object.fromEntries(data.added.map(d => [d.year, d.added]));
    const removedMap = Object.fromEntries(data.removed.map(d => [d.year, d.removed]));

    const gradientGreen = ctx.getContext('2d').createLinearGradient(0, 0, 0, 400);
    gradientGreen.addColorStop(0, 'rgba(34, 197, 94, 0.85)');
    gradientGreen.addColorStop(1, 'rgba(34, 197, 94, 0.3)');

    const gradientRed = ctx.getContext('2d').createLinearGradient(0, 400, 0, 0);
    gradientRed.addColorStop(0, 'rgba(239, 68, 68, 0.85)');
    gradientRed.addColorStop(1, 'rgba(239, 68, 68, 0.3)');

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: years,
            datasets: [{
                label: 'Added',
                data: years.map(y => addedMap[y] || 0),
                backgroundColor: gradientGreen,
                borderColor: '#22c55e',
                borderWidth: 1,
                borderRadius: 4,
            }, {
                label: 'Removed',
                data: years.map(y => -(removedMap[y] || 0)),
                backgroundColor: gradientRed,
                borderColor: '#ef4444',
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            animation: { duration: 1200, easing: 'easeOutQuart' },
            scales: {
                x: { stacked: true, ticks: { color: '#8a90a5' }, grid: { color: 'rgba(138,144,165,0.08)' } },
                y: { stacked: true, ticks: { color: '#8a90a5' }, grid: { color: 'rgba(138,144,165,0.08)' } }
            },
            plugins: {
                legend: { labels: { color: '#8a90a5', usePointStyle: true, pointStyle: 'circle', padding: 16 } },
                tooltip: { backgroundColor: 'rgba(15,17,24,0.95)', borderColor: 'rgba(59,130,246,0.3)', borderWidth: 1, cornerRadius: 8, titleColor: '#e4e6f0', bodyColor: '#8a90a5' }
            }
        }
    });
}

function renderSizeDistChart(data) {
    const ctx = document.getElementById('sizeDistChart');
    if (!ctx) return;
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.bucket + ' subs'),
            datasets: [{
                data: data.map(d => d.count),
                backgroundColor: [
                    'rgba(59,130,246,0.85)', 'rgba(34,197,94,0.85)', 'rgba(234,179,8,0.85)',
                    'rgba(239,68,68,0.85)', 'rgba(139,92,246,0.85)', 'rgba(236,72,153,0.85)', 'rgba(6,182,212,0.85)'
                ],
                hoverBackgroundColor: [
                    '#3b82f6', '#22c55e', '#eab308', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'
                ],
                borderColor: 'rgba(15, 17, 24, 0.8)',
                borderWidth: 3,
                hoverOffset: 8,
            }]
        },
        options: {
            responsive: true,
            animation: { duration: 1400, easing: 'easeOutQuart', animateRotate: true },
            plugins: {
                legend: { position: 'bottom', labels: { color: '#8a90a5', padding: 14, usePointStyle: true, pointStyle: 'circle' } },
                tooltip: { backgroundColor: 'rgba(15,17,24,0.95)', borderColor: 'rgba(59,130,246,0.3)', borderWidth: 1, cornerRadius: 8, titleColor: '#e4e6f0', bodyColor: '#8a90a5' }
            }
        }
    });
}

function renderLongevityChart(data) {
    const ctx = document.getElementById('longevityChart');
    if (!ctx) return;
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.duration),
            datasets: [{
                data: data.map(d => d.count),
                backgroundColor: ['rgba(239,68,68,0.85)', 'rgba(234,179,8,0.85)', 'rgba(34,197,94,0.85)', 'rgba(59,130,246,0.85)'],
                hoverBackgroundColor: ['#ef4444', '#eab308', '#22c55e', '#3b82f6'],
                borderColor: 'rgba(15, 17, 24, 0.8)',
                borderWidth: 3,
                hoverOffset: 8,
            }]
        },
        options: {
            responsive: true,
            animation: { duration: 1400, easing: 'easeOutQuart', animateRotate: true },
            plugins: {
                legend: { position: 'bottom', labels: { color: '#8a90a5', padding: 14, usePointStyle: true, pointStyle: 'circle' } },
                tooltip: { backgroundColor: 'rgba(15,17,24,0.95)', borderColor: 'rgba(59,130,246,0.3)', borderWidth: 1, cornerRadius: 8, titleColor: '#e4e6f0', bodyColor: '#8a90a5' }
            }
        }
    });
}

function renderConfYearChart(data) {
    const ctx = document.getElementById('confYearChart');
    if (!ctx) return;

    const gradG = ctx.getContext('2d').createLinearGradient(0, 0, 0, 400);
    gradG.addColorStop(0, 'rgba(34, 197, 94, 0.85)');
    gradG.addColorStop(1, 'rgba(34, 197, 94, 0.25)');

    const gradY = ctx.getContext('2d').createLinearGradient(0, 0, 0, 400);
    gradY.addColorStop(0, 'rgba(234, 179, 8, 0.85)');
    gradY.addColorStop(1, 'rgba(234, 179, 8, 0.25)');

    const gradR = ctx.getContext('2d').createLinearGradient(0, 0, 0, 400);
    gradR.addColorStop(0, 'rgba(239, 68, 68, 0.85)');
    gradR.addColorStop(1, 'rgba(239, 68, 68, 0.25)');

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => d.year),
            datasets: [{
                label: 'High',
                data: data.map(d => d.high),
                backgroundColor: gradG,
                borderColor: '#22c55e',
                borderWidth: 1,
                borderRadius: 3,
            }, {
                label: 'Medium',
                data: data.map(d => d.medium),
                backgroundColor: gradY,
                borderColor: '#eab308',
                borderWidth: 1,
                borderRadius: 3,
            }, {
                label: 'Low',
                data: data.map(d => d.low),
                backgroundColor: gradR,
                borderColor: '#ef4444',
                borderWidth: 1,
                borderRadius: 3,
            }]
        },
        options: {
            responsive: true,
            animation: { duration: 1200, easing: 'easeOutQuart' },
            scales: {
                x: { stacked: true, ticks: { color: '#8a90a5' }, grid: { color: 'rgba(138,144,165,0.08)' } },
                y: { stacked: true, ticks: { color: '#8a90a5' }, grid: { color: 'rgba(138,144,165,0.08)' } }
            },
            plugins: {
                legend: { labels: { color: '#8a90a5', usePointStyle: true, pointStyle: 'circle', padding: 16 } },
                tooltip: { backgroundColor: 'rgba(15,17,24,0.95)', borderColor: 'rgba(59,130,246,0.3)', borderWidth: 1, cornerRadius: 8, titleColor: '#e4e6f0', bodyColor: '#8a90a5' }
            }
        }
    });
}
