/* ============================================================
   SubTrack — Cross-Reference / Insights Page
   ============================================================ */

(function () {
    'use strict';

    var _stockChart = null;

    async function renderCrossrefPage(params) {
        var app = document.getElementById('app');
        params = params || {};

        app.innerHTML = `
            <div class="crossref-page page-transition">
                <h2 class="text-gradient" style="margin-bottom: 0.5rem; font-size: 1.75rem;">Cross-Reference Insights</h2>
                <p style="color: var(--text-dim); margin-bottom: 2rem; font-size: 0.9rem;">
                    Overlay subsidiary timelines with stock prices and M&amp;A events for deeper analysis.
                </p>

                <!-- Company search -->
                <div class="card" style="margin-bottom: 2rem; padding: 1.5rem;">
                    <label style="font-weight: 600; display: block; margin-bottom: 0.5rem;">Search Company</label>
                    <div style="display: flex; gap: 0.5rem;">
                        <input type="text" id="crCompanySearch" placeholder="Type company name or CIK..."
                               style="flex:1; padding: 0.6rem 1rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-surface); color: var(--text-primary); font-size: 0.9rem;">
                        <button class="btn btn-primary" id="crSearchBtn">Search</button>
                    </div>
                    <div id="crSearchResults" style="margin-top: 0.75rem;"></div>
                </div>

                <!-- Stock chart area -->
                <div id="crStockSection" style="display: none;">
                    <div class="card" style="margin-bottom: 2rem; padding: 1.5rem;">
                        <h3 id="crStockTitle" style="margin-bottom: 1rem;"></h3>
                        <div id="crStockInfo" style="margin-bottom: 1rem; color: var(--text-dim); font-size: 0.85rem;"></div>
                        <div style="position: relative; height: 350px;">
                            <canvas id="crStockChart"></canvas>
                        </div>
                    </div>
                </div>

                <!-- M&A events -->
                <div id="crMASection" style="display: none;">
                    <div class="card" style="padding: 1.5rem;">
                        <h3 style="margin-bottom: 1rem;">M&amp;A Timeline</h3>
                        <div id="crMAStats" style="margin-bottom: 1rem; color: var(--text-dim); font-size: 0.85rem;"></div>
                        <div id="crMATable"></div>
                    </div>
                </div>
            </div>`;

        // Wire up search
        var searchInput = document.getElementById('crCompanySearch');
        var searchBtn = document.getElementById('crSearchBtn');

        searchBtn.addEventListener('click', function () {
            _crSearch(searchInput.value.trim());
        });
        searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') _crSearch(searchInput.value.trim());
        });
    }

    async function _crSearch(query) {
        if (!query) return;

        var resultsEl = document.getElementById('crSearchResults');
        resultsEl.innerHTML = '<span style="color: var(--text-dim);">Searching...</span>';

        if (/^\d+$/.test(query)) {
            resultsEl.innerHTML = '';
            _crLoadCompany(query.padStart(10, '0'));
            return;
        }

        try {
            var resp = await fetch('/api/companies?q=' + encodeURIComponent(query) + '&per_page=5');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var results = await resp.json();
        } catch (e) {
            resultsEl.innerHTML = '<span style="color: var(--red);">Search failed</span>';
            return;
        }

        var companies = results.companies || results;
        if (!companies || companies.length === 0) {
            resultsEl.innerHTML = '<span style="color: var(--text-dim);">No companies found</span>';
            return;
        }

        var html = '';
        for (var i = 0; i < companies.length; i++) {
            var c = companies[i];
            html += '<button class="btn" style="margin: 0.25rem 0.25rem 0 0; font-size: 0.8rem;" ' +
                'onclick="_crSelectCompany(\'' + escapeHtml(c.cik) + '\')">' +
                escapeHtml(c.company_name) + ' (' + escapeHtml(c.cik) + ')</button>';
        }
        resultsEl.innerHTML = html;
    }

    async function _crLoadCompany(cik) {
        // Load M&A events (no auth required)
        _loadMAEvents(cik);

        // Try stock data (enterprise only — may fail)
        _loadStockData(cik);
    }

    async function _loadStockData(cik) {
        var section = document.getElementById('crStockSection');
        var titleEl = document.getElementById('crStockTitle');
        var infoEl = document.getElementById('crStockInfo');

        section.style.display = 'block';
        titleEl.textContent = 'Loading stock data...';
        infoEl.textContent = '';

        try {
            var resp = await fetch('/api/crossref/stock/' + encodeURIComponent(cik));
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var data = await resp.json();
        } catch (e) {
            titleEl.textContent = 'Stock Data';
            infoEl.innerHTML = '<span style="color: var(--text-dim);">Stock data requires an Enterprise plan, or no ticker was found for this company.</span>';
            return;
        }

        titleEl.textContent = (data.company_name || 'Company') + ' — ' + (data.ticker || 'N/A');

        if (!data.stock_data || data.stock_data.length === 0) {
            infoEl.textContent = 'No stock price data available for this period.';
            return;
        }

        infoEl.textContent = 'Ticker: ' + data.ticker +
            ' | Data points: ' + data.stock_data.length +
            ' | Filing dates: ' + data.filing_dates.length;

        // Build chart
        var labels = [];
        var prices = [];
        for (var i = 0; i < data.stock_data.length; i++) {
            labels.push(data.stock_data[i].date);
            prices.push(data.stock_data[i].close);
        }

        // Mark filing dates
        var filingAnnotations = [];
        for (var f = 0; f < data.filing_dates.length; f++) {
            filingAnnotations.push(data.filing_dates[f]);
        }

        _renderStockChart(labels, prices, filingAnnotations);
    }

    function _renderStockChart(labels, prices, filingDates) {
        var canvas = document.getElementById('crStockChart');
        if (!canvas) return;
        var ctx = canvas.getContext('2d');

        if (_stockChart) {
            _stockChart.destroy();
            _stockChart = null;
        }

        // Create point colors — highlight filing dates
        var filingSet = {};
        for (var f = 0; f < filingDates.length; f++) {
            filingSet[filingDates[f]] = true;
        }

        var pointColors = [];
        var pointRadii = [];
        for (var i = 0; i < labels.length; i++) {
            if (filingSet[labels[i]]) {
                pointColors.push('#ff6b6b');
                pointRadii.push(6);
            } else {
                pointColors.push('rgba(108, 99, 255, 0.8)');
                pointRadii.push(0);
            }
        }

        _stockChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Close Price',
                    data: prices,
                    borderColor: '#6c63ff',
                    backgroundColor: 'rgba(108, 99, 255, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: pointColors,
                    pointRadius: pointRadii,
                    pointHoverRadius: 6,
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, labels: { color: 'rgba(255,255,255,0.7)' } },
                    tooltip: {
                        callbacks: {
                            afterLabel: function (ctx) {
                                if (filingSet[ctx.label]) {
                                    return 'SEC Filing Date';
                                }
                                return '';
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 12 },
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: 'rgba(255,255,255,0.6)' },
                    }
                }
            }
        });
    }

    async function _loadMAEvents(cik) {
        var section = document.getElementById('crMASection');
        var statsEl = document.getElementById('crMAStats');
        var tableEl = document.getElementById('crMATable');

        section.style.display = 'block';
        statsEl.textContent = 'Loading M&A events...';
        tableEl.innerHTML = '';

        try {
            var resp = await fetch('/api/crossref/ma/' + encodeURIComponent(cik));
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var data = await resp.json();
        } catch (e) {
            statsEl.textContent = 'Failed to load M&A events.';
            return;
        }

        var acqCount = 0;
        var divCount = 0;
        for (var i = 0; i < data.events.length; i++) {
            if (data.events[i].event_type === 'acquisition') acqCount++;
            else divCount++;
        }

        statsEl.textContent = (data.company_name || 'Company') +
            ' — Acquisitions: ' + acqCount + ' | Divestitures: ' + divCount;

        if (data.events.length === 0) {
            tableEl.innerHTML = '<p style="color: var(--text-dim);">No M&A events detected from subsidiary timeline.</p>';
            return;
        }

        var html = '<div class="table-container glass-card"><table class="premium-table"><thead><tr>' +
            '<th>Date</th><th>Type</th><th>Subsidiary</th><th>Confidence</th>' +
            '</tr></thead><tbody>';

        for (var j = 0; j < data.events.length; j++) {
            var ev = data.events[j];
            var typeBadge = ev.event_type === 'acquisition'
                ? '<span class="badge badge-active">Acquisition</span>'
                : '<span class="badge badge-low">Divestiture</span>';
            html += '<tr class="table-row-animate" style="animation-delay:' + Math.min(j * 30, 500) + 'ms;">' +
                '<td>' + escapeHtml(ev.event_date || '') + '</td>' +
                '<td>' + typeBadge + '</td>' +
                '<td>' + escapeHtml(ev.sub_name || '') + '</td>' +
                '<td>' + confidenceBadge(ev.confidence || 'MEDIUM') + '</td>' +
                '</tr>';
        }

        html += '</tbody></table></div>';
        tableEl.innerHTML = html;
    }

    // Expose for inline onclick
    window._crSelectCompany = function (cik) {
        _crLoadCompany(cik);
    };

    window.renderCrossrefPage = renderCrossrefPage;

})();
