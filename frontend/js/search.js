/* === Agentic Search UI + Global Search — Premium UI === */

async function runAgenticSearch(subId) {
    const btn = document.getElementById('enrichBtn');
    const progress = document.getElementById('searchProgress');
    btn.disabled = true;
    btn.textContent = 'Searching...';

    progress.innerHTML = `
        <div class="search-panel glass-card float-in" style="padding: 1.75rem; border-radius: 14px; border: 1px solid rgba(124,92,252,0.15);">
            <h3 class="text-gradient" style="margin-bottom: 1.25rem; font-size: 1.1rem;">Agentic AI Search</h3>
            <div class="search-steps" id="searchSteps">
                <div class="search-step step-running" style="display: flex; align-items: flex-start; gap: 1rem; padding: 0.75rem 0; position: relative;">
                    <div class="step-indicator" style="width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; background: linear-gradient(135deg, #7c5cfc, #8b5cf6); color: #fff; box-shadow: 0 0 16px rgba(124,92,252,0.4); flex-shrink: 0; animation: pulse 1.5s ease-in-out infinite;">1</div>
                    <div class="step-content">
                        <div class="step-title" style="font-weight: 600;">Initializing search...</div>
                    </div>
                </div>
            </div>
            <div style="margin-top: 1rem; height: 4px; border-radius: 2px; background: var(--surface2); overflow: hidden;">
                <div id="searchProgressBar" style="height: 100%; width: 10%; border-radius: 2px; background: linear-gradient(90deg, #7c5cfc, #8b5cf6, #ec4899); transition: width 0.6s ease; animation: shimmer 2s ease-in-out infinite;"></div>
            </div>
        </div>
    `;

    try {
        const eventSource = new EventSource(`/api/search/${subId}/stream`);
        const steps = {};

        eventSource.addEventListener('progress', (event) => {
            const data = JSON.parse(event.data);
            steps[data.step] = data;
            renderSearchSteps(steps);

            if (data.final_result) {
                renderAIResult(data.final_result);
            }
        });

        eventSource.addEventListener('done', (event) => {
            eventSource.close();
            btn.disabled = false;
            btn.textContent = 'Re-run AI Search';
            // Fill progress bar to 100%
            const bar = document.getElementById('searchProgressBar');
            if (bar) bar.style.width = '100%';
        });

        eventSource.onerror = () => {
            eventSource.close();
            btn.disabled = false;
            btn.textContent = 'Run AI Search';
            progress.innerHTML += `
                <div class="glass-card float-in" style="color: var(--red); margin-top: 1rem; padding: 1rem 1.25rem; font-size: 0.85rem; border-radius: 10px; border: 1px solid rgba(239,68,68,0.2);">
                    Search connection ended. Results may still have been saved.
                    <button class="btn btn-outline btn-sm btn-glow" style="margin-left: 0.5rem;"
                            onclick="navigate('subsidiary', {id: ${subId}})">Refresh</button>
                </div>`;
        };
    } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Run AI Search';
        progress.innerHTML = `<p style="color: var(--red);">Error: ${escapeHtml(e.message)}</p>`;
    }
}


function renderSearchSteps(steps) {
    const container = document.getElementById('searchSteps');
    if (!container) return;

    const sortedSteps = Object.values(steps).sort((a, b) => a.step - b.step);
    const totalSteps = Math.max(sortedSteps.length, 4);
    const doneCount = sortedSteps.filter(s => s.status === 'done').length;

    // Update progress bar
    const bar = document.getElementById('searchProgressBar');
    if (bar) {
        const pct = Math.min(95, Math.round((doneCount / totalSteps) * 100) + 10);
        bar.style.width = pct + '%';
    }

    container.innerHTML = sortedSteps.map((step, idx) => {
        const isDone = step.status === 'done';
        const isRunning = step.status === 'running';

        const indicatorBg = isDone
            ? 'background: linear-gradient(135deg, #22c55e, #16a34a); box-shadow: 0 0 14px rgba(34,197,94,0.4);'
            : isRunning
                ? 'background: linear-gradient(135deg, #7c5cfc, #8b5cf6); box-shadow: 0 0 16px rgba(124,92,252,0.4); animation: pulse 1.5s ease-in-out infinite;'
                : 'background: var(--surface2); color: var(--text-dim);';

        const icon = isDone ? '&#10003;' : isRunning ? '&#8226;' : step.step;

        const connectingLine = idx < sortedSteps.length - 1
            ? `<div style="position: absolute; left: 17px; top: 42px; width: 2px; height: calc(100% - 20px); background: ${isDone ? 'linear-gradient(to bottom, #22c55e, rgba(34,197,94,0.2))' : 'var(--surface2)'}; z-index: 0;"></div>`
            : '';

        return `
            <div class="search-step float-in" style="display: flex; align-items: flex-start; gap: 1rem; padding: 0.75rem 0; position: relative; animation-delay: ${idx * 80}ms;">
                ${connectingLine}
                <div class="step-indicator" style="width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; color: #fff; flex-shrink: 0; z-index: 1; transition: all 0.4s ease; ${indicatorBg}">${icon}</div>
                <div class="step-content" style="padding-top: 0.25rem; flex: 1;">
                    <div class="step-title" style="font-weight: 600; font-size: 0.9rem; ${isDone ? 'color: var(--green);' : ''}">${escapeHtml(step.title)}</div>
                    <div class="step-detail" style="color: var(--text-dim); font-size: 0.8rem; margin-top: 0.15rem;">${escapeHtml(step.detail)}</div>
                </div>
            </div>
        `;
    }).join('');
}


function renderAIResult(result) {
    const progress = document.getElementById('searchProgress');
    if (!progress) return;

    const confColor = result.Confidence === 'HIGH' ? '#00d4aa' : result.Confidence === 'MEDIUM' ? '#fbbf24' : '#ff6b6b';

    progress.innerHTML += `
        <div class="ai-result glow-card scale-in" style="margin-top: 1.5rem; border-radius: 16px; overflow: hidden; background: linear-gradient(135deg, rgba(124,92,252,0.06), rgba(0,212,170,0.03)); border: 1px solid rgba(124,92,252,0.15);">
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.5rem; background: rgba(124,92,252,0.06); border-bottom: 1px solid rgba(124,92,252,0.1);">
                <div style="display: flex; align-items: center; gap: 0.6rem;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c5cfc" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
                    <h3 class="text-gradient" style="font-size: 1.1rem; margin: 0;">AI Research Result</h3>
                </div>
                <span style="padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.05em; background: ${confColor}18; color: ${confColor}; border: 1px solid ${confColor}30;">${escapeHtml(result.Confidence || 'Unknown')}</span>
            </div>
            <div style="padding: 1.25rem 1.5rem;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                    <div style="padding: 0.9rem 1rem; background: rgba(0,212,170,0.05); border: 1px solid rgba(0,212,170,0.12); border-radius: 10px;">
                        <div style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(0,212,170,0.7); margin-bottom: 0.4rem; font-weight: 600;">TimeIn</div>
                        <div style="font-weight: 600; color: #00d4aa; font-size: 0.95rem;">${escapeHtml(result.TimeIn || 'Unknown')}</div>
                    </div>
                    <div style="padding: 0.9rem 1rem; background: rgba(251,191,36,0.05); border: 1px solid rgba(251,191,36,0.12); border-radius: 10px;">
                        <div style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(251,191,36,0.7); margin-bottom: 0.4rem; font-weight: 600;">TimeOut</div>
                        <div style="font-weight: 600; color: #fbbf24; font-size: 0.95rem;">${escapeHtml(result.TimeOut || 'N/A')}</div>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 1rem; margin-bottom: 1rem;">
                    <div style="padding: 0.9rem 1rem; background: rgba(124,92,252,0.05); border: 1px solid rgba(124,92,252,0.12); border-radius: 10px;">
                        <div style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(124,92,252,0.7); margin-bottom: 0.4rem; font-weight: 600;">Type</div>
                        <div><span class="badge badge-enriched">${escapeHtml(result.Type || 'Unknown')}</span></div>
                    </div>
                    <div style="padding: 0.9rem 1rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px;">
                        <div style="font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(232,234,237,0.4); margin-bottom: 0.4rem; font-weight: 600;">Source</div>
                        <div style="font-size: 0.85rem; color: #e8eaed; word-break: break-word; line-height: 1.5;">${escapeHtml(result.MainSource || 'N/A')}</div>
                    </div>
                </div>
                ${result.Notes ? `
                    <div style="padding: 0.75rem 1rem; background: rgba(255,255,255,0.02); border-radius: 8px; border-left: 3px solid rgba(124,92,252,0.4);">
                        <p style="font-size: 0.85rem; color: var(--text-dim); line-height: 1.6; margin: 0;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px; opacity: 0.5;"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                            ${escapeHtml(result.Notes)}
                        </p>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}


async function renderSearchPage(params = {}) {
    const q = params.q || '';

    app.innerHTML = `
        <div class="page-transition" style="position: relative; min-height: 85vh;" id="searchPageWrapper">
            <!-- Search Specific Interactive Background -->
            <canvas id="searchInteractiveCanvas" style="position: absolute; top:0; left:0; width:100%; height:100%; z-index:0; pointer-events: none; opacity: 0.6; mix-blend-mode: screen;"></canvas>

            <div style="position: relative; z-index: 1;">
                <h2 class="text-gradient" style="margin-bottom: 1.5rem; font-size: 2.2rem; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5));">Subsidiary Intelligence Search</h2>
                
                <p style="color: rgba(255, 255, 255, 0.75); margin-bottom: 2rem; font-size: 0.95rem;">
                    Locate specific corporate entities across 1.1M records. Move your cursor to interact with the data matrix.
                </p>

                <div class="search-box glass-card glow-card" style="padding: 1.5rem; margin-bottom: 2rem; background: rgba(12, 13, 18, 0.75); backdrop-filter: blur(16px); display: flex; gap: 0.5rem; border-left: 4px solid var(--primary);">
                    <input type="text" id="subSearch" placeholder="Search subsidiaries by name..."
                           value="${escapeHtml(q)}"
                           style="flex:1; padding: 0.8rem 1.25rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.4); color: #fff; font-size: 1rem; transition: border 0.3s, box-shadow 0.3s; outline: none;"
                           onfocus="this.style.borderColor='var(--primary)'; this.style.boxShadow='0 0 15px rgba(124,92,252,0.3)';"
                           onblur="this.style.borderColor='rgba(255,255,255,0.1)'; this.style.boxShadow='none';"
                           onkeydown="if(event.key==='Enter') doSubSearch()">
                    <button class="btn nav-cta" style="margin-left: 0; padding: 0 2rem; font-size: 1rem;" onclick="doSubSearch()">Decrypt Target</button>
                </div>

                <div id="searchResults">
                    ${q ? '<div class="loading-screen"><div class="spinner"></div><p style="margin-top:1rem; color:var(--primary);">Querying neural sub-matrix...</p></div>' : '<div class="empty-state glass-card" style="padding: 4rem; border-radius: 14px; background: rgba(12,13,18,0.5);"><p style="color: rgba(255,255,255,0.5); font-size: 1.1rem;">Awaiting search parameters...</p></div>'}
                </div>
            </div>
        </div>
    `;

    // Initialize Interactive Search Canvas
    setTimeout(initSearchCanvas, 100);

    if (q) {
        try {
            const resp = await fetch(`/api/subsidiaries?q=${encodeURIComponent(q)}&per_page=50`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const resultsDiv = document.getElementById('searchResults');
            if (!resultsDiv) return;

            if (!data.subsidiaries || data.subsidiaries.length === 0) {
                resultsDiv.innerHTML = `<div class="empty-state glass-card" style="padding: 3rem; border-radius: 14px;"><p>No subsidiaries found matching "${escapeHtml(q)}"</p></div>`;
                return;
            }

            // Store results for client-side filtering
            window._searchResults = data.subsidiaries;
            window._searchFilter = { conf: 'all', status: 'all' };
            _renderSearchResults(data.total, q);

        } catch (e) {
            const resultsDiv = document.getElementById('searchResults');
            if (resultsDiv) {
                resultsDiv.innerHTML = `<div class="empty-state glass-card" style="padding: 3rem; border-radius: 14px;"><p style="color: var(--red);">Search failed: ${escapeHtml(e.message)}</p><button class="btn btn-primary" style="margin-top: 1rem;" onclick="doSubSearch()">Retry</button></div>`;
            }
        }
    }
}

function doSubSearch() {
    const q = document.getElementById('subSearch').value;
    navigate('search', { q });
}

/* --- Interactive Search Background Engine --- */
function initSearchCanvas() {
    const canvas = document.getElementById('searchInteractiveCanvas');
    if (!canvas) return;

    const wrapper = document.getElementById('searchPageWrapper');
    if (!wrapper) return;

    const ctx = canvas.getContext('2d');
    let width, height;

    function resize() {
        width = wrapper.clientWidth;
        height = wrapper.clientHeight;
        canvas.width = width;
        canvas.height = height;
    }

    window.addEventListener('resize', resize);
    resize();

    // Mouse interactive nodes
    const nodes = [];
    const maxNodes = 60;
    for (let i = 0; i < maxNodes; i++) {
        nodes.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: (Math.random() - 0.5) * 1.5,
            vy: (Math.random() - 0.5) * 1.5,
            radius: Math.random() * 2 + 1,
            color: Math.random() > 0.5 ? 'rgba(124, 92, 252, 0.6)' : 'rgba(0, 212, 170, 0.6)' // Violet or Teal
        });
    }

    let mouse = { x: -1000, y: -1000 };

    // Track mouse inside wrapper safely
    wrapper.addEventListener('mousemove', (e) => {
        const rect = wrapper.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
    });

    wrapper.addEventListener('mouseleave', () => {
        mouse.x = -1000;
        mouse.y = -1000;
    });

    let frame;
    function animate() {
        // Only animate if the canvas is still in the DOM
        if (!document.getElementById('searchInteractiveCanvas')) {
            window.removeEventListener('resize', resize);
            return;
        }

        ctx.clearRect(0, 0, width, height);

        // Draw grid lines gently
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < width; i += 50) { ctx.moveTo(i, 0); ctx.lineTo(i, height); }
        for (let j = 0; j < height; j += 50) { ctx.moveTo(0, j); ctx.lineTo(width, j); }
        ctx.stroke();

        for (let i = 0; i < maxNodes; i++) {
            let p = nodes[i];

            p.x += p.vx;
            p.y += p.vy;

            // Bounce edges
            if (p.x < 0 || p.x > width) p.vx *= -1;
            if (p.y < 0 || p.y > height) p.vy *= -1;

            // Interactive burst on mouse proximity
            let dx = mouse.x - p.x;
            let dy = mouse.y - p.y;
            let dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 120) {
                // Draw connecting lightning line to the mouse
                ctx.beginPath();
                ctx.strokeStyle = p.color;
                ctx.lineWidth = (120 - dist) / 60;
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(mouse.x, mouse.y);
                ctx.stroke();

                // Slight repel
                p.x -= dx * 0.02;
                p.y -= dy * 0.02;
            }

            // Draw Node
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius * (dist < 120 ? 2 : 1), 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();

            // Draw connections to nearby nodes
            for (let j = i + 1; j < maxNodes; j++) {
                let p2 = nodes[j];
                let dpDist = Math.sqrt(Math.pow(p.x - p2.x, 2) + Math.pow(p.y - p2.y, 2));
                if (dpDist < 80) {
                    ctx.beginPath();
                    ctx.strokeStyle = 'rgba(124, 92, 252, ' + (1 - dpDist / 80) * 0.2 + ')';
                    ctx.lineWidth = 1;
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                }
            }
        }
        frame = requestAnimationFrame(animate);
    }
    animate();
}


function _renderSearchResults(total, q) {
    const resultsDiv = document.getElementById('searchResults');
    if (!resultsDiv) return;

    const allResults = window._searchResults || [];
    const f = window._searchFilter || { conf: 'all', status: 'all' };

    const filtered = allResults.filter(s => {
        if (f.conf !== 'all' && s.confidence !== f.conf) return false;
        if (f.status === 'active' && !(s.time_out && s.time_out.startsWith('Active'))) return false;
        if (f.status === 'divested' && (s.time_out && s.time_out.startsWith('Active'))) return false;
        return true;
    });

    resultsDiv.innerHTML = `
        <p style="color: var(--text-dim); margin-bottom: 0.75rem; font-size: 0.85rem;">
            Found <strong class="counter-glow">${formatNumber(total)}</strong> subsidiaries matching "<em>${escapeHtml(q)}</em>"
            ${filtered.length !== allResults.length ? ` — showing <strong>${filtered.length}</strong> after filters` : ''}
        </p>
        <div class="table-filters" style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; margin-bottom: 1rem;">
            <span style="font-size: 0.75rem; color: var(--text-dim); margin-right: 0.25rem;">Confidence:</span>
            <button class="filter-pill ${f.conf === 'all' ? 'active' : ''}" onclick="window._searchFilter.conf='all'; _renderSearchResults(${total}, '${escapeHtml(q)}')">All</button>
            <button class="filter-pill ${f.conf === 'HIGH' ? 'active' : ''}" onclick="window._searchFilter.conf='HIGH'; _renderSearchResults(${total}, '${escapeHtml(q)}')">High</button>
            <button class="filter-pill ${f.conf === 'MEDIUM' ? 'active' : ''}" onclick="window._searchFilter.conf='MEDIUM'; _renderSearchResults(${total}, '${escapeHtml(q)}')">Medium</button>
            <button class="filter-pill ${f.conf === 'LOW' ? 'active' : ''}" onclick="window._searchFilter.conf='LOW'; _renderSearchResults(${total}, '${escapeHtml(q)}')">Low</button>
            <span style="width: 1px; height: 18px; background: var(--border); margin: 0 0.5rem;"></span>
            <span style="font-size: 0.75rem; color: var(--text-dim); margin-right: 0.25rem;">Status:</span>
            <button class="filter-pill ${f.status === 'all' ? 'active' : ''}" onclick="window._searchFilter.status='all'; _renderSearchResults(${total}, '${escapeHtml(q)}')">All</button>
            <button class="filter-pill ${f.status === 'active' ? 'active' : ''}" onclick="window._searchFilter.status='active'; _renderSearchResults(${total}, '${escapeHtml(q)}')">Active</button>
            <button class="filter-pill ${f.status === 'divested' ? 'active' : ''}" onclick="window._searchFilter.status='divested'; _renderSearchResults(${total}, '${escapeHtml(q)}')">Divested</button>
        </div>
        <div class="table-container glass-card" style="border-radius: 14px;">
            <table class="premium-table">
                <thead>
                    <tr>
                        <th>Subsidiary</th>
                        <th>Parent Company</th>
                        <th>TimeIn</th>
                        <th>TimeOut</th>
                        <th>Confidence</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody class="stagger-in">
                    ${filtered.map((s, i) => `
                        <tr class="table-row-animate float-in" style="animation-delay: ${Math.min(i * 30, 500)}ms;">
                            <td><strong>${escapeHtml(s.sub_name)}</strong></td>
                            <td>
                                <span class="clickable" style="color: var(--primary); transition: text-shadow 0.2s;"
                                      onmouseenter="this.style.textShadow='0 0 10px rgba(124,92,252,0.5)'"
                                      onmouseleave="this.style.textShadow='none'"
                                      onclick="navigate('company', {cik: '${s.cik}'})">
                                    ${escapeHtml(s.company_name)}
                                </span>
                            </td>
                            <td style="font-size: 0.8rem;">${escapeHtml(s.time_in || '')}</td>
                            <td style="font-size: 0.8rem;">${escapeHtml(s.time_out || '')}</td>
                            <td>${confidenceBadge(s.confidence)}</td>
                            <td>
                                <button class="btn btn-outline btn-sm" style="transition: box-shadow 0.2s;"
                                        onmouseenter="this.style.boxShadow='0 0 12px rgba(124,92,252,0.3)'"
                                        onmouseleave="this.style.boxShadow='none'"
                                        onclick="navigate('subsidiary', {id: ${s.id}})">
                                    Details
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}


async function runBulkEnrich(cik, mode) {
    mode = mode || 'turbo';
    const btn = document.getElementById('bulkEnrichBtn');
    const progress = document.getElementById('bulkEnrichProgress');
    if (!btn || !progress) return;

    btn.disabled = true;
    btn.style.opacity = '0.6';
    btn.textContent = 'Starting...';

    // Turbo mode uses a different endpoint (bulk SQL update, no per-sub API calls)
    const isTurbo = mode === 'turbo';
    const url = isTurbo
        ? '/api/search/turbo/stream?cik=' + cik
        : '/api/search/batch/' + cik + '/stream?mode=' + mode;
    const title = isTurbo ? 'Turbo Enrichment (Heuristics)' : 'Bulk AI Enrichment';

    progress.innerHTML = `
        <div class="glass-card float-in" style="padding: 1.25rem 1.5rem; border-radius: 12px; border: 1px solid rgba(124,92,252,0.15);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
                <h4 class="text-gradient" style="margin: 0; font-size: 1rem;">${title}</h4>
                <span id="bulkEnrichStatus" style="font-size: 0.8rem; color: var(--text-dim);">Connecting...</span>
            </div>
            <div style="height: 6px; border-radius: 3px; background: var(--surface2); overflow: hidden; margin-bottom: 0.75rem;">
                <div id="bulkProgressBar" style="height: 100%; width: 0%; border-radius: 3px; background: linear-gradient(90deg, #7c5cfc, #8b5cf6, #ec4899); transition: width 0.4s ease;"></div>
            </div>
            <div id="bulkEnrichLog" style="max-height: 300px; overflow-y: auto; font-size: 0.8rem;"></div>
        </div>
    `;

    try {
        const eventSource = new EventSource(url);

        eventSource.addEventListener('start', (event) => {
            const data = JSON.parse(event.data);
            const statusEl = document.getElementById('bulkEnrichStatus');
            if (statusEl) statusEl.textContent = '0 / ' + data.total + ' subsidiaries';
            btn.textContent = (isTurbo ? 'Turbo ' : 'Enriching ') + '0 / ' + data.total + '...';
            if (data.total === 0) {
                progress.innerHTML = `
                    <div class="glass-card float-in" style="padding: 1rem 1.25rem; border-radius: 10px; color: var(--green); border: 1px solid rgba(52,211,153,0.2);">
                        All subsidiaries are already enriched!
                    </div>`;
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.textContent = 'All Enriched';
            }
        });

        eventSource.addEventListener('progress', (event) => {
            const data = JSON.parse(event.data);
            const bar = document.getElementById('bulkProgressBar');
            const statusEl = document.getElementById('bulkEnrichStatus');
            const logEl = document.getElementById('bulkEnrichLog');

            if (isTurbo) {
                // Turbo sends batch progress (processed/total/percent/types)
                const pct = data.percent || 0;
                if (bar) bar.style.width = pct + '%';
                if (statusEl) statusEl.textContent = data.processed.toLocaleString() + ' / ' + data.total.toLocaleString() + ' (' + pct + '%)';
                btn.textContent = 'Turbo ' + pct + '%...';

                if (logEl && data.types) {
                    const typeLines = Object.entries(data.types)
                        .sort((a,b) => b[1] - a[1])
                        .map(([t, c]) => '<div style="display:flex;justify-content:space-between;padding:0.2rem 0;"><span>' + t + '</span><strong>' + c.toLocaleString() + '</strong></div>')
                        .join('');
                    logEl.innerHTML = '<div style="padding: 0.5rem 0; border-bottom: 1px solid rgba(138,144,165,0.1); margin-bottom: 0.5rem; font-weight: 600;">Type Distribution</div>' + typeLines;
                }
            } else {
                // Fast/Full sends per-subsidiary progress
                const pct = Math.round((data.current / data.total) * 100);
                if (bar) bar.style.width = pct + '%';
                if (statusEl) statusEl.textContent = data.current + ' / ' + data.total;
                btn.textContent = 'Enriching ' + data.current + ' / ' + data.total + '...';

                const icon = data.status === 'done' ? '<span style="color:#34d399;">&#10003;</span>'
                           : data.status === 'error' ? '<span style="color:#ef4444;">&#10007;</span>'
                           : '<span style="color:#7c5cfc;">&#8230;</span>';
                const typeTag = data.type ? ' <span style="color: var(--text-dim);">(' + data.type + ')</span>' : '';

                if (data.status !== 'running' && logEl) {
                    logEl.innerHTML += '<div style="padding: 0.25rem 0; border-bottom: 1px solid rgba(138,144,165,0.06);">'
                        + icon + ' ' + escapeHtml(data.sub_name) + typeTag + '</div>';
                    logEl.scrollTop = logEl.scrollHeight;
                }
            }
        });

        eventSource.addEventListener('done', (event) => {
            eventSource.close();
            const data = JSON.parse(event.data);
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.textContent = 'Done — ' + (data.enriched || 0).toLocaleString() + ' enriched';

            const statusEl = document.getElementById('bulkEnrichStatus');
            if (statusEl) {
                statusEl.innerHTML = '<span style="color: var(--green);">Complete!</span> '
                    + (data.enriched || 0).toLocaleString() + ' enriched'
                    + (data.errors ? ', ' + data.errors + ' errors' : '');
            }

            const bar = document.getElementById('bulkProgressBar');
            if (bar) bar.style.width = '100%';
        });

        eventSource.onerror = () => {
            eventSource.close();
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.textContent = 'Retry Enrich';
            const statusEl = document.getElementById('bulkEnrichStatus');
            if (statusEl) statusEl.innerHTML = '<span style="color: var(--red);">Connection lost</span>';
        };
    } catch (e) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.textContent = 'Retry Enrich';
        progress.innerHTML = '<p style="color: var(--red);">Error: ' + escapeHtml(e.message) + '</p>';
    }
}
window.runBulkEnrich = runBulkEnrich;


async function runGlobalTurboEnrich() {
    const app = document.getElementById('app');
    if (!app) return;

    // Insert a progress overlay at the top of the dashboard
    const overlay = document.createElement('div');
    overlay.id = 'turboOverlay';
    overlay.className = 'glass-card float-in';
    overlay.style.cssText = 'padding: 1.5rem 2rem; border-radius: 14px; border: 1px solid rgba(124,92,252,0.2); margin-bottom: 2rem; background: linear-gradient(135deg, rgba(124,92,252,0.08), rgba(236,72,153,0.05)), var(--surface);';
    overlay.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem;">
            <h3 class="text-gradient" style="margin: 0; font-size: 1.15rem;">Turbo Enriching All Subsidiaries</h3>
            <span id="turboStatus" style="font-size: 0.85rem; color: var(--text-dim);">Starting...</span>
        </div>
        <div style="height: 8px; border-radius: 4px; background: var(--surface2); overflow: hidden; margin-bottom: 1rem;">
            <div id="turboBar" style="height: 100%; width: 0%; border-radius: 4px; background: linear-gradient(90deg, #7c5cfc, #8b5cf6, #ec4899); transition: width 0.4s ease;"></div>
        </div>
        <div id="turboTypes" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.5rem; font-size: 0.85rem;"></div>
    `;
    app.insertBefore(overlay, app.firstChild);

    try {
        const eventSource = new EventSource('/api/search/turbo/stream');

        eventSource.addEventListener('start', (event) => {
            const data = JSON.parse(event.data);
            const el = document.getElementById('turboStatus');
            if (el) el.textContent = '0 / ' + data.total.toLocaleString();
        });

        eventSource.addEventListener('progress', (event) => {
            const data = JSON.parse(event.data);
            const bar = document.getElementById('turboBar');
            const status = document.getElementById('turboStatus');
            const types = document.getElementById('turboTypes');

            if (bar) bar.style.width = (data.percent || 0) + '%';
            if (status) status.textContent = data.processed.toLocaleString() + ' / ' + data.total.toLocaleString() + ' (' + data.percent + '%)';

            if (types && data.types) {
                const colors = { 'Internal Creation': '#34d399', 'External Acquisition': '#f59e0b', 'Restructuring': '#8b5cf6', 'Joint Venture': '#06b6d4', 'Spin-off': '#ec4899' };
                types.innerHTML = Object.entries(data.types)
                    .sort((a,b) => b[1] - a[1])
                    .map(([t, c]) => '<div style="display:flex;justify-content:space-between;padding:0.4rem 0.75rem;background:var(--surface2);border-radius:8px;"><span style="color:' + (colors[t] || 'var(--text-dim)') + ';">' + t + '</span><strong>' + c.toLocaleString() + '</strong></div>')
                    .join('');
            }
        });

        eventSource.addEventListener('done', (event) => {
            eventSource.close();
            const data = JSON.parse(event.data);
            const status = document.getElementById('turboStatus');
            const bar = document.getElementById('turboBar');
            if (status) status.innerHTML = '<span style="color: var(--green);">Done!</span> ' + (data.enriched || 0).toLocaleString() + ' subsidiaries enriched';
            if (bar) bar.style.width = '100%';
        });

        eventSource.onerror = () => {
            eventSource.close();
            const status = document.getElementById('turboStatus');
            if (status) status.innerHTML = '<span style="color: var(--red);">Connection lost — partial results saved</span>';
        };
    } catch (e) {
        const status = document.getElementById('turboStatus');
        if (status) status.innerHTML = '<span style="color: var(--red);">Error: ' + escapeHtml(e.message) + '</span>';
    }
}
window.runGlobalTurboEnrich = runGlobalTurboEnrich;
