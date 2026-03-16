/* ============================================================
   SubTrack — Geographic Distribution Page 
   (3D World View Upgrade)
   ============================================================ */

(function () {
    'use strict';

    let _geoChart = null;
    let _worldGlobe = null;
    let _geoJsonData = null;

    async function renderGeoPage(params) {
        const app = document.getElementById('app');
        params = params || {};

        app.innerHTML = `
            <div class="geo-page page-transition" style="position: relative; min-height: 85vh;">
                <!-- 3D Globe Background Layer -->
                <div id="globeContainer" style="position: absolute; top: 0; right: 0; width: 100%; height: 100%; z-index: 0; pointer-events: auto; overflow: hidden; border-radius: 16px; border: 1px solid rgba(255,255,255,0.03);">
                </div>

                <!-- Overlay UI Panels (Glassmorphism) -->
                <div style="position: relative; z-index: 1; pointer-events: none; padding: 2rem;">
                    
                    <div style="max-width: 480px; pointer-events: auto;">
                        <h2 class="text-gradient" style="margin-bottom: 0.5rem; font-size: 2.2rem; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5));">Global Footprint</h2>
                        <p style="color: rgba(255, 255, 255, 0.75); margin-bottom: 2rem; font-size: 0.95rem; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">
                            Explore subsidiary distribution via our interactive 3D network.
                        </p>

                        <!-- Company search -->
                        <div class="glass-card" style="margin-bottom: 2rem; padding: 1.5rem; background: rgba(12, 13, 18, 0.65); backdrop-filter: blur(16px); border-left: 4px solid var(--primary);">
                            <label style="font-weight: 600; display: block; margin-bottom: 0.5rem; color: #fff;">Network Search</label>
                            <div style="display: flex; gap: 0.5rem;">
                                <input type="text" id="geoCompanySearch" placeholder="Enter company name or CIK..."
                                       style="flex:1; padding: 0.7rem 1rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.4); color: #fff; font-size: 0.9rem; transition: border 0.3s; outline: none;">
                                <button class="btn nav-cta" id="geoSearchBtn" style="margin-left:0;">Analyze</button>
                            </div>
                            <div id="geoSearchResults" style="margin-top: 1rem;"></div>
                        </div>

                        <!-- Global stats -->
                        <div id="geoGlobalSection">
                            <div class="glass-card" style="margin-bottom: 2rem; padding: 1.5rem; background: rgba(12, 13, 18, 0.65); backdrop-filter: blur(16px);">
                                <h3 style="margin-bottom: 0.5rem; color: #fff; font-size: 1.1rem;">Top Jurisdictions</h3>
                                <div id="geoGlobalStats" style="margin-bottom: 1rem; color: var(--text-dim); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;"></div>
                                <div style="position: relative; height: 250px;">
                                    <canvas id="geoBarChart"></canvas>
                                </div>
                            </div>
                        </div>

                        <!-- Company-specific breakdown -->
                        <div id="geoCompanySection" style="display: none;">
                            <div class="glass-card" style="margin-bottom: 2rem; padding: 1.5rem; background: rgba(12, 13, 18, 0.85); box-shadow: 0 0 40px rgba(124, 92, 252, 0.2);">
                                <h3 id="geoCompanyTitle" style="margin-bottom: 0.5rem; color: #fff; font-size: 1.2rem;"></h3>
                                <div id="geoCompanyStats" style="margin-bottom: 1rem; color: var(--green); font-size: 0.85rem; font-weight: 500;"></div>
                                <div style="position: relative; height: 200px;">
                                    <canvas id="geoCompanyChart"></canvas>
                                </div>
                            </div>
                            
                            <div class="glass-card" style="padding: 1.5rem; background: rgba(12, 13, 18, 0.85); max-height: 400px; overflow-y: auto;">
                                <h3 style="margin-bottom: 1rem; color:#fff; font-size: 1rem;">Entity Directory</h3>
                                <div id="geoCompanyTable"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;

        // Input Focus Styles
        const sInput = document.getElementById('geoCompanySearch');
        if (sInput) {
            sInput.addEventListener('focus', () => { sInput.style.borderColor = 'var(--primary)'; });
            sInput.addEventListener('blur', () => { sInput.style.borderColor = 'rgba(255,255,255,0.1)'; });
        }

        // Wire up search
        const searchBtn = document.getElementById('geoSearchBtn');
        searchBtn.addEventListener('click', function () {
            _searchAndShow(sInput.value.trim());
        });
        sInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') _searchAndShow(sInput.value.trim());
        });

        // Initialize Globe
        if (typeof Globe === 'function') {
            _initGlobe();
        } else {
            console.error('Globe.gl library not loaded from CDN.');
        }

        // Load global distribution
        _loadGlobalDistribution();
    }

    async function _initGlobe() {
        const globeContainer = document.getElementById('globeContainer');
        if (!globeContainer) return;

        // Fetch GeoJSON for world map boundaries if not already loaded
        if (!_geoJsonData) {
            try {
                // Using dataset provided by globe.gl author for examples
                const res = await fetch('https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson');
                _geoJsonData = await res.json();
            } catch (e) {
                console.error("Failed to load country polygons", e);
            }
        }

        // Use globe container dimensions for sizing
        const width = globeContainer.clientWidth;
        const height = globeContainer.clientHeight;

        _worldGlobe = Globe()
            (globeContainer)
            .width(width)
            .height(height)
            .backgroundColor('rgba(0,0,0,0)') // Let CSS background (aurora) peek through
            .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
            .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
            .showAtmosphere(true);

        // Adjust atmosphere parameters if the library allows it
        if (_worldGlobe.atmosphereColor) _worldGlobe.atmosphereColor('#7c5cfc');
        if (_worldGlobe.atmosphereAltitude) _worldGlobe.atmosphereAltitude(0.15);

        // Position camera: slightly right of center to not be blocked by the UI
        _worldGlobe.pointOfView({ lat: 25, lng: -20, altitude: 2.5 });

        // Auto-Rotate animation
        _worldGlobe.controls().autoRotate = true;
        _worldGlobe.controls().autoRotateSpeed = 0.5;

        // Handle browser resizes smoothly
        window.addEventListener('resize', () => {
            const cont = document.getElementById('globeContainer');
            if (cont && _worldGlobe) {
                _worldGlobe.width(cont.clientWidth);
                _worldGlobe.height(cont.clientHeight);
            }
        });
    }

    function _updateGlobeData(countryDataObj) {
        if (!_worldGlobe || !_geoJsonData) return;

        // Collect all non-zero counts
        const counts = Object.values(countryDataObj).filter(v => v);
        const maxCount = counts.length ? Math.max(...counts) : 1;

        // Professional UI Color Extrapolation function
        const determineColor = (val) => {
            if (!val) return 'rgba(255,255,255,0.02)';
            const ratio = val / maxCount;
            // Hot mapping: Teal for highest density, then Blue, then Purple
            if (ratio > 0.5) return 'rgba(0, 212, 170, 0.85)'; // Mint Teal
            if (ratio > 0.1) return 'rgba(91, 141, 239, 0.75)'; // Electric Blue
            return 'rgba(124, 92, 252, 0.65)'; // Deep Violet
        };

        const getIso = (feat) => feat.properties.ISO_A2 === '-99' ? feat.properties.WB_A2 : feat.properties.ISO_A2;

        _worldGlobe.polygonsData(_geoJsonData.features)
            .polygonAltitude(feat => {
                const count = countryDataObj[getIso(feat)] || 0;
                // Slight pop-out for data-filled countries
                return count ? Math.max(0.015, Math.min(count / maxCount * 0.25, 0.25)) : 0.01;
            })
            .polygonCapColor(feat => determineColor(countryDataObj[getIso(feat)] || 0))
            .polygonSideColor(() => 'rgba(124, 92, 252, 0.15)')
            .polygonStrokeColor(() => 'rgba(255,255,255, 0.1)')
            .polygonLabel(feat => {
                const count = countryDataObj[getIso(feat)] || 0;
                if (!count) return ''; // Only show tooltip if it has data
                return `
                    <div style="background: rgba(6,7,10,0.95); border: 1px solid rgba(124,92,252,0.4); border-radius: 8px; padding: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.6); font-family: Inter, sans-serif; backdrop-filter: blur(8px);">
                        <div style="font-weight: 700; color: #fff; font-size: 14px; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px;">${feat.properties.ADMIN}</div>
                        <div style="color: #00d4aa; font-weight: 600; font-size: 16px;">${count} <span style="font-weight: 400; color: #888; font-size: 12px;">Subsidiaries</span></div>
                    </div>
                 `;
            })
            .onPolygonHover(hoverD => {
                _worldGlobe
                    .polygonAltitude(d => {
                        if (d === hoverD) return 0.1;
                        const count = countryDataObj[getIso(d)] || 0;
                        return count ? Math.max(0.015, Math.min(count / maxCount * 0.25, 0.25)) : 0.01;
                    })
                    .polygonCapColor(d => d === hoverD ? 'rgb(0, 212, 170)' : determineColor(countryDataObj[getIso(d)] || 0));
            })
            .polygonsTransitionDuration(800);
    }

    async function _loadGlobalDistribution() {
        try {
            var data = await api('/api/geo/global?limit=15');
        } catch (e) { return; }

        var statsEl = document.getElementById('geoGlobalStats');
        if (statsEl) {
            statsEl.textContent = 'Mapping ' + formatNumber(data.matched) + ' known jurisdictions across ' + formatNumber(data.sample_size) + ' samples.';
        }

        var labels = [];
        var values = [];
        var colors = [];
        var globMap = {};

        for (var i = 0; i < data.countries.length; i++) {
            let item = data.countries[i];
            labels.push(item.country_name);
            values.push(item.count);
            // Gradient mapping for bar chart matching globe logic
            if (i < 3) colors.push('rgba(0, 212, 170, 0.85)');
            else if (i < 7) colors.push('rgba(91, 141, 239, 0.75)');
            else colors.push('rgba(124, 92, 252, 0.8)');

            globMap[item.country_code] = item.count;
        }

        _renderBarChart('geoBarChart', labels, values, colors, 'Subsidiaries');

        // Let Globe spin up, then map data
        setTimeout(() => {
            _updateGlobeData(globMap);
        }, 800);
    }

    async function _searchAndShow(query) {
        let resultsEl = document.getElementById('geoSearchResults');
        if (!query) {
            resultsEl.innerHTML = '';
            return;
        }

        resultsEl.innerHTML = '<span style="color: var(--text-dim);">Scanning global registry...</span>';

        if (/^\d+$/.test(query)) {
            resultsEl.innerHTML = '';
            _loadCompanyGeo(query);
            return;
        }

        try {
            var resp = await fetch('/api/companies?q=' + encodeURIComponent(query) + '&per_page=5');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var results = await resp.json();
        } catch (e) {
            resultsEl.innerHTML = '<span style="color: #ff6b6b;">Search encountered an error.</span>';
            return;
        }

        var companies = results.companies || results;
        if (!companies || companies.length === 0) {
            resultsEl.innerHTML = '<span style="color: var(--text-dim);">No entities found.</span>';
            return;
        }

        var html = '';
        for (var i = 0; i < companies.length; i++) {
            var c = companies[i];
            html += '<button class="btn" style="margin: 0.25rem 0.25rem 0 0; font-size: 0.8rem; border: 1px solid rgba(124,92,252,0.4); background: rgba(124,92,252,0.1); color: #e8eaed;" ' +
                'onclick="_geoSelectCompany(\'' + escapeHtml(c.cik) + '\')">' +
                escapeHtml(c.company_name) + ' (' + escapeHtml(c.cik) + ')</button>';
        }
        resultsEl.innerHTML = html;
    }

    async function _loadCompanyGeo(cik) {
        var section = document.getElementById('geoCompanySection');
        section.style.display = 'block';

        var titleEl = document.getElementById('geoCompanyTitle');
        var statsEl = document.getElementById('geoCompanyStats');
        var tableEl = document.getElementById('geoCompanyTable');

        titleEl.textContent = 'Decrypting network matrix...';
        statsEl.textContent = '';
        tableEl.innerHTML = '<div class="spinner" style="border-color: rgba(255,255,255,0.1); border-top-color: var(--primary); width: 24px; height: 24px; margin: 1.5rem auto;"></div>';

        // Collapse global stats for focus
        const globalSec = document.getElementById('geoGlobalSection');
        if (globalSec) globalSec.style.display = 'none';

        try {
            var data = await api('/api/geo/company/' + encodeURIComponent(cik));
        } catch (e) {
            titleEl.textContent = 'Data unavaliable';
            tableEl.innerHTML = '';
            return;
        }

        titleEl.textContent = 'Network Footprint (CIK ' + cik + ')';
        statsEl.textContent = formatNumber(data.matched) + ' Active Jurisdictions | ' + data.countries_summary.length + ' Global Hubs';

        var globMap = {};
        if (data.countries_summary.length > 0) {
            var labels = [];
            var values = [];
            var colors = _generateColors(data.countries_summary.length);
            for (var i = 0; i < data.countries_summary.length; i++) {
                var cs = data.countries_summary[i];
                labels.push(cs.country_name);
                values.push(cs.count);
                globMap[cs.country_code] = cs.count;
            }
            _renderBarChart('geoCompanyChart', labels, values, colors, 'Subsidiaries');

            // Map single company data onto 3D Globe
            _updateGlobeData(globMap);

            // Re-focus camera to show Europe / US primarily
            if (_worldGlobe) {
                _worldGlobe.pointOfView({ lat: 40, lng: -20, altitude: 2 }, 1500);
            }
        }

        // Mini list
        var html = '';
        var countries = Object.keys(data.by_country);
        for (var ci = 0; ci < countries.length; ci++) {
            var code = countries[ci];
            var subs = data.by_country[code];
            html += '<div style="margin-bottom: 1.2rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.8rem;">';
            html += '<h4 style="margin-bottom: 0.5rem; color: #fff; display:flex; justify-content: space-between; font-weight: 600;">' +
                escapeHtml(subs[0].country_name) +
                ' <span style="color: var(--primary);">(' + subs.length + ')</span></h4>';

            html += '<ul style="list-style: none; padding: 0; margin: 0; font-size: 0.85rem; color: rgba(255,255,255,0.6);">';
            for (var si = 0; si < subs.length; si++) {
                var s = subs[si];
                var badge = (s.time_out && !s.time_out.startsWith('Active'))
                    ? '<span style="color: #ff6b6b; font-size: 0.7rem; margin-left: 6px; padding: 2px 4px; background: rgba(255,107,107,0.1); border-radius: 4px;">Divested</span>'
                    : '<span style="color: #00d4aa; font-size: 0.7rem; margin-left: 6px; padding: 2px 4px; background: rgba(0,212,170,0.1); border-radius: 4px;">Active</span>';
                html += '<li style="margin-bottom: 6px; display:flex; justify-content: space-between; align-items: center;">' +
                    '<span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 65%;">' + escapeHtml(s.sub_name) + '</span>' + badge + '</li>';
            }
            html += '</ul></div>';
        }

        if (data.unknown && data.unknown.length > 0) {
            html += '<div style="margin-bottom: 1.2rem;">';
            html += '<h4 style="margin-bottom: 0.5rem; color: #fff; display:flex; justify-content: space-between;">Unknown Locale' +
                '<span style="color: #fbbf24; font-weight: 600;">(' + data.unknown.length + ')</span></h4>';
            html += '<ul style="list-style: none; padding: 0; margin: 0; font-size: 0.82rem; color: rgba(255,255,255,0.4);">';
            for (var ui = 0; ui < data.unknown.length; ui++) {
                var u = data.unknown[ui];
                html += '<li style="margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">' + escapeHtml(u.sub_name) + '</li>';
            }
            html += '</ul></div>';
        }

        tableEl.innerHTML = html;
        tableEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function _renderBarChart(canvasId, labels, values, colors, label) {
        var canvas = document.getElementById(canvasId);
        if (!canvas) return;
        var ctx = canvas.getContext('2d');

        if (_geoChart && _geoChart._canvasId === canvasId) {
            _geoChart.destroy();
            _geoChart = null;
        }

        var chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: label || 'Entities',
                    data: values,
                    backgroundColor: colors,
                    borderRadius: 4,
                    barPercentage: 0.65
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(6, 7, 10, 0.95)',
                        titleColor: '#fff',
                        bodyColor: '#00d4aa',
                        borderColor: 'rgba(124, 92, 252, 0.4)',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        titleFont: { size: 13, weight: 'bold' }
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.03)' },
                        ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 } },
                        border: { display: false }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: 'rgba(255,255,255,0.8)', font: { size: 11, family: 'Inter' } },
                        border: { display: false }
                    }
                }
            }
        });
        chart._canvasId = canvasId;
        _geoChart = chart;
    }

    function _generateColors(n) {
        var palette = [
            'rgba(0, 212, 170, 0.85)', 'rgba(91, 141, 239, 0.75)', 'rgba(124, 92, 252, 0.8)',
            'rgba(255, 107, 107, 0.8)', 'rgba(251, 191, 36, 0.8)'
        ];
        var colors = [];
        for (var i = 0; i < n; i++) {
            colors.push(palette[i % palette.length]);
        }
        return colors;
    }

    window._geoSelectCompany = function (cik) {
        _loadCompanyGeo(cik);
    };

    window.renderGeoPage = renderGeoPage;

})();
