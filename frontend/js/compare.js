/* === Company Comparison Page — Premium UI === */

async function renderComparePage() {
    app.innerHTML = `
        <div class="compare-page page-transition">
            <h2 class="text-gradient" style="margin-bottom: 0.5rem; font-size: 1.75rem;">Company Comparison</h2>
            <p style="color: var(--text-dim); margin-bottom: 2rem; font-size: 0.9rem;">
                Compare up to 4 companies side-by-side. Search and add companies below.
            </p>

            <div class="compare-search glass-card" style="padding: 1rem 1.25rem; border-radius: 12px; margin-bottom: 1.5rem;">
                <input type="text" id="compareSearchInput" placeholder="Search company name..."
                       onkeydown="if(event.key==='Enter') searchCompareCompany()">
                <button class="btn btn-primary btn-glow" onclick="searchCompareCompany()">Search</button>
            </div>

            <div id="compareSearchResults" style="margin-bottom: 1.5rem;"></div>

            <div class="compare-selected glass-card reveal" style="padding: 1.5rem; border-radius: 14px; margin-bottom: 2rem;">
                <h3 style="font-size: 0.95rem; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem;">
                    Selected Companies
                    <span id="selectedCount" class="badge badge-medium" style="font-size: 0.75rem;">0/4</span>
                </h3>
                <div id="selectedCompanies" class="compare-chips"></div>
                <button class="btn btn-primary btn-glow" id="compareBtn" style="margin-top: 1rem;" disabled
                        onclick="runComparison()">Compare Selected</button>
            </div>

            <div id="comparisonResult"></div>
        </div>
    `;
}

let selectedForCompare = [];

async function searchCompareCompany() {
    const q = document.getElementById('compareSearchInput').value.trim();
    if (!q) return;

    const resultsDiv = document.getElementById('compareSearchResults');
    resultsDiv.innerHTML = '<div class="spinner" style="margin: 1rem auto;"></div>';

    try {
        const data = await api(`/api/companies?q=${encodeURIComponent(q)}&per_page=8`);
        resultsDiv.innerHTML = data.companies.length === 0
            ? '<p style="color: var(--text-dim);">No companies found.</p>'
            : `<div class="compare-results-grid stagger-in" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0.75rem;">
                ${data.companies.map((c, i) => {
                    const alreadySelected = selectedForCompare.some(s => s.cik === c.cik);
                    return `
                    <div class="compare-result-card glass-card float-in ${alreadySelected ? 'selected' : ''}"
                         style="padding: 1rem 1.25rem; border-radius: 12px; cursor: pointer; transition: all 0.3s ease; animation-delay: ${i * 50}ms; ${alreadySelected ? 'border: 1px solid rgba(34,197,94,0.4); box-shadow: 0 0 12px rgba(34,197,94,0.15);' : 'border: 1px solid rgba(59,130,246,0.1);'}"
                         onmouseenter="if(!this.classList.contains('selected')) { this.style.borderColor='rgba(59,130,246,0.4)'; this.style.boxShadow='0 0 20px rgba(59,130,246,0.15)'; this.style.transform='translateY(-2px)'; }"
                         onmouseleave="if(!this.classList.contains('selected')) { this.style.borderColor='rgba(59,130,246,0.1)'; this.style.boxShadow='none'; this.style.transform='none'; }"
                         onclick="${alreadySelected ? '' : `addToCompare('${c.cik}', '${escapeHtml(c.company_name).replace(/'/g, "\\'")}', ${c.num_subsidiaries})`}">
                        <div class="compare-result-name" style="font-weight: 600; margin-bottom: 0.35rem;">${escapeHtml(c.company_name)}</div>
                        <div class="compare-result-meta" style="display: flex; gap: 0.75rem; font-size: 0.8rem; color: var(--text-dim);">
                            <span>CIK: ${c.cik}</span>
                            <span>${formatNumber(c.num_subsidiaries)} subs</span>
                        </div>
                        ${alreadySelected ? '<span class="badge badge-high" style="margin-top: 0.5rem; display: inline-block;">Selected</span>' : ''}
                    </div>`;
                }).join('')}
            </div>`;
    } catch (e) { /* api() handles errors */ }
}

function addToCompare(cik, name, numSubs) {
    if (selectedForCompare.length >= 4) return;
    if (selectedForCompare.some(s => s.cik === cik)) return;

    selectedForCompare.push({ cik, name, numSubs });
    updateSelectedUI();
    searchCompareCompany();
}

function removeFromCompare(cik) {
    selectedForCompare = selectedForCompare.filter(s => s.cik !== cik);
    updateSelectedUI();
}

function updateSelectedUI() {
    const container = document.getElementById('selectedCompanies');
    const countEl = document.getElementById('selectedCount');
    const btn = document.getElementById('compareBtn');

    countEl.textContent = `${selectedForCompare.length}/4`;
    btn.disabled = selectedForCompare.length < 2;

    container.innerHTML = selectedForCompare.length === 0
        ? '<p style="color: var(--text-dim); font-size: 0.85rem;">No companies selected yet.</p>'
        : selectedForCompare.map((s, i) => `
            <div class="compare-chip glass-card scale-in" style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; border-radius: 20px; margin: 0.25rem; border: 1px solid rgba(59,130,246,0.25); animation-delay: ${i * 60}ms; background: linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.05));">
                <span style="font-weight: 500; font-size: 0.85rem;">${s.name}</span>
                <span class="compare-chip-remove" style="cursor: pointer; opacity: 0.6; font-size: 1.1rem; transition: opacity 0.2s;"
                      onmouseenter="this.style.opacity='1'; this.style.color='var(--red)'"
                      onmouseleave="this.style.opacity='0.6'; this.style.color=''"
                      onclick="removeFromCompare('${s.cik}')">&times;</span>
            </div>
        `).join('');
}

async function runComparison() {
    const resultDiv = document.getElementById('comparisonResult');
    resultDiv.innerHTML = '<div class="loading-screen"><div class="spinner"></div><p>Comparing...</p></div>';

    const ciks = selectedForCompare.map(s => s.cik).join(',');
    let data;
    try {
        data = await api(`/api/compare?ciks=${ciks}`);
    } catch (e) { return; }

    const companies = data.companies;
    const colors = ['#3b82f6', '#22c55e', '#eab308', '#ef4444'];
    const glowColors = ['rgba(59,130,246,0.15)', 'rgba(34,197,94,0.15)', 'rgba(234,179,8,0.15)', 'rgba(239,68,68,0.15)'];

    resultDiv.innerHTML = `
        <div class="reveal">
            <h2 class="text-gradient" style="margin: 2rem 0 1.25rem; font-size: 1.4rem;">
                Comparison Results
            </h2>
        </div>

        <!-- Stats Comparison -->
        <div class="compare-stats-grid stagger-in" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.25rem; margin-bottom: 2rem;">
            ${companies.map((c, i) => `
                <div class="compare-stat-card glass-card glow-card scale-in" style="padding: 1.5rem; border-radius: 14px; border-top: 3px solid ${colors[i]}; box-shadow: 0 4px 20px ${glowColors[i]}; animation-delay: ${i * 100}ms;">
                    <h4 style="font-size: 0.95rem; margin-bottom: 1.25rem; color: ${colors[i]}; font-weight: 700;">${escapeHtml(c.company.company_name)}</h4>
                    <div class="compare-stat-rows" style="display: flex; flex-direction: column; gap: 0.6rem;">
                        <div class="compare-stat-row" style="display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0; border-bottom: 1px solid rgba(138,144,165,0.1);">
                            <span style="color: var(--text-dim); font-size: 0.85rem;">Total Subsidiaries</span>
                            <strong class="counter-glow">${formatNumber(c.company.num_subsidiaries)}</strong>
                        </div>
                        <div class="compare-stat-row" style="display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0; border-bottom: 1px solid rgba(138,144,165,0.1);">
                            <span style="color: var(--text-dim); font-size: 0.85rem;">Active</span>
                            <strong style="color: var(--green);">${formatNumber(c.active)}</strong>
                        </div>
                        <div class="compare-stat-row" style="display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0; border-bottom: 1px solid rgba(138,144,165,0.1);">
                            <span style="color: var(--text-dim); font-size: 0.85rem;">Divested</span>
                            <strong style="color: var(--yellow);">${formatNumber(c.divested)}</strong>
                        </div>
                        <div class="compare-stat-row" style="display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0; border-bottom: 1px solid rgba(138,144,165,0.1);">
                            <span style="color: var(--text-dim); font-size: 0.85rem;">High Confidence</span>
                            <strong>${formatNumber(c.high_confidence)}</strong>
                        </div>
                        <div class="compare-stat-row" style="display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0; border-bottom: 1px solid rgba(138,144,165,0.1);">
                            <span style="color: var(--text-dim); font-size: 0.85rem;">Filing Period</span>
                            <strong style="font-size: 0.8rem;">${c.company.first_filing || 'N/A'} — ${c.company.last_filing || 'N/A'}</strong>
                        </div>
                        <div class="compare-stat-row" style="display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0;">
                            <span style="color: var(--text-dim); font-size: 0.85rem;">Filings</span>
                            <strong>${c.company.num_filings}</strong>
                        </div>
                    </div>
                    <button class="btn btn-outline btn-sm btn-glow" style="margin-top: 1.25rem; width: 100%; border-color: ${colors[i]}40; color: ${colors[i]};"
                            onmouseenter="this.style.boxShadow='0 0 16px ${glowColors[i]}'"
                            onmouseleave="this.style.boxShadow='none'"
                            onclick="navigate('company', {cik: '${c.company.cik}'})">View Detail</button>
                </div>
            `).join('')}
        </div>

        <!-- Timeline Chart -->
        <div class="chart-container glass-card reveal float-in" style="margin-top: 2rem; padding: 1.5rem; border-radius: 14px;">
            <h3 class="text-gradient" style="margin-bottom: 1rem; font-size: 1.1rem;">Subsidiaries Added by Year</h3>
            <canvas id="compareTimelineChart" height="100"></canvas>
        </div>

        ${companies.length === 2 ? `
        <div class="reveal" style="margin-top: 2rem;">
            <button class="btn btn-outline btn-glow animated-border" style="padding: 0.75rem 1.5rem; border-radius: 10px;"
                    onclick="findOverlap('${companies[0].company.cik}', '${companies[1].company.cik}')">
                Find Shared Subsidiaries Between ${escapeHtml(companies[0].company.company_name)} & ${escapeHtml(companies[1].company.company_name)}
            </button>
            <div id="overlapResult" style="margin-top: 1rem;"></div>
        </div>
        ` : ''}
    `;

    renderCompareTimeline(companies, colors);
}

function renderCompareTimeline(companies, colors) {
    const ctx = document.getElementById('compareTimelineChart');
    if (!ctx) return;

    const allYears = [...new Set(companies.flatMap(c => c.year_counts.map(y => y.year)))].sort();

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: allYears,
            datasets: companies.map((c, i) => {
                const yearMap = Object.fromEntries(c.year_counts.map(y => [y.year, y.count]));
                const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 300);
                gradient.addColorStop(0, colors[i] + '40');
                gradient.addColorStop(1, colors[i] + '05');
                return {
                    label: c.company.company_name,
                    data: allYears.map(y => yearMap[y] || 0),
                    borderColor: colors[i],
                    backgroundColor: gradient,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 4,
                    pointHoverRadius: 7,
                    pointBackgroundColor: colors[i],
                    pointBorderColor: '#0f1118',
                    pointBorderWidth: 2,
                    borderWidth: 2.5,
                };
            })
        },
        options: {
            responsive: true,
            animation: { duration: 1500, easing: 'easeOutQuart' },
            interaction: { intersect: false, mode: 'index' },
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

async function findOverlap(cik1, cik2) {
    const div = document.getElementById('overlapResult');
    div.innerHTML = '<div class="spinner" style="margin: 1rem auto;"></div>';

    try {
        const data = await api(`/api/compare/overlap?cik1=${cik1}&cik2=${cik2}`);
        if (data.count === 0) {
            div.innerHTML = '<p style="color: var(--text-dim);">No shared subsidiaries found.</p>';
            return;
        }
        div.innerHTML = `
            <p style="margin-bottom: 0.75rem;"><strong class="counter-glow">${data.count}</strong> shared subsidiaries found</p>
            <div class="table-container glass-card reveal" style="border-radius: 14px;">
                <table class="premium-table">
                    <thead>
                        <tr>
                            <th>Subsidiary</th>
                            <th>${escapeHtml(data.company1)} — TimeIn/Out</th>
                            <th>${escapeHtml(data.company2)} — TimeIn/Out</th>
                        </tr>
                    </thead>
                    <tbody class="stagger-in">
                        ${data.shared_subsidiaries.map((s, i) => `
                            <tr class="table-row-animate float-in" style="animation-delay: ${Math.min(i * 30, 500)}ms;">
                                <td><strong>${escapeHtml(s.sub_name)}</strong></td>
                                <td style="font-size: 0.8rem;">${s.time_in_1} / ${s.time_out_1}</td>
                                <td style="font-size: 0.8rem;">${s.time_in_2} / ${s.time_out_2}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (e) { /* handled */ }
}
