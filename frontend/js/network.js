/* === Network Graph Page — 3D Force-Directed Graph === */

let _networkGraph = null;
let _networkData = null;

async function renderNetworkPage(params = {}) {
    app.innerHTML = `
        <div class="network-page page-transition">
            <!-- Hero with mesh gradient -->
            <div class="network-hero page-mesh-bg">
                <h2 class="text-gradient" style="margin-bottom: 0.5rem; font-size: 1.75rem;">Subsidiary Network Explorer</h2>
                <p style="color: var(--text-dim); margin-bottom: 0; font-size: 0.9rem;">
                    Visualize parent-subsidiary relationships as an interactive 3D network graph.
                </p>
            </div>

            <div class="network-controls glass-card" style="padding: 1rem 1.25rem; border-radius: 12px; display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; margin-bottom: 1.5rem;">
                <div class="search-box" style="flex: 1; min-width: 200px;">
                    <input type="text" id="networkSearchInput" placeholder="Search company name..."
                           onkeydown="if(event.key==='Enter') searchForNetwork()">
                    <button class="btn btn-primary btn-glow" onclick="searchForNetwork()">Search</button>
                </div>
                <div class="network-options">
                    <label style="color: var(--text-dim); font-size: 0.85rem; display: flex; align-items: center; gap: 0.5rem;">
                        Max nodes:
                        <select id="networkLimit" style="background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; color: var(--text); padding: 0.3rem 0.5rem;">
                            <option value="25">25</option>
                            <option value="50" selected>50</option>
                            <option value="100">100</option>
                            <option value="200">200</option>
                        </select>
                    </label>
                </div>
            </div>

            <div id="networkSearchResults" style="margin-bottom: 1rem;"></div>
            <div id="networkContainer"></div>

            <!-- Cross-company link finder -->
            <div class="network-cross-finder glass-card reveal" style="margin-top: 2rem; padding: 1.75rem; border-radius: 14px;">
                <div class="network-cross-finder-header">
                    <div class="network-cross-finder-icon">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                            <line x1="8" y1="11" x2="14" y2="11"/><line x1="11" y1="8" x2="11" y2="14"/>
                        </svg>
                    </div>
                    <div>
                        <h3 class="text-gradient" style="margin-bottom: 0.25rem; font-size: 1.1rem;">Cross-Company Subsidiary Finder</h3>
                        <p style="color: var(--text-dim); margin-bottom: 0; font-size: 0.85rem;">
                            Find a subsidiary name appearing across multiple parent companies.
                        </p>
                    </div>
                </div>
                <div class="search-box" style="margin-top: 1rem; margin-bottom: 0;">
                    <input type="text" id="crossLinkInput" placeholder="Enter subsidiary name..."
                           onkeydown="if(event.key==='Enter') searchCrossLinks()">
                    <button class="btn btn-outline btn-glow" onclick="searchCrossLinks()">Find Cross-Links</button>
                </div>
                <div id="crossLinkResults" style="margin-top: 1rem;"></div>
            </div>
        </div>
    `;

    if (params.cik) {
        document.getElementById('networkSearchInput').value = params.cik;
        loadNetwork(params.cik);
    }
}

async function searchForNetwork() {
    const q = document.getElementById('networkSearchInput').value.trim();
    if (!q) return;

    const resultsDiv = document.getElementById('networkSearchResults');
    resultsDiv.innerHTML = '<div class="spinner" style="margin: 0.5rem auto;"></div>';

    try {
        const data = await api(`/api/companies?q=${encodeURIComponent(q)}&per_page=6`);
        if (data.companies.length === 0) {
            resultsDiv.innerHTML = '<p style="color: var(--text-dim);">No companies found.</p>';
            return;
        }
        resultsDiv.innerHTML = `
            <div class="network-search-results-grid stagger-in">
                ${data.companies.map((c, i) => `
                    <div class="network-search-card glass-card float-in" onclick="loadNetwork('${c.cik}')"
                         style="animation-delay: ${i * 60}ms;">
                        <div class="network-search-card-name">${escapeHtml(c.company_name)}</div>
                        <div class="network-search-card-meta">
                            <span>CIK: ${c.cik}</span>
                            <span class="network-search-card-badge">${formatNumber(c.num_subsidiaries)} subs</span>
                        </div>
                    </div>
                `).join('')}
            </div>`;
    } catch (e) { /* handled */ }
}

async function loadNetwork(cik) {
    const container = document.getElementById('networkContainer');
    const limit = document.getElementById('networkLimit').value;
    container.innerHTML = '<div class="loading-screen"><div class="spinner"></div><p>Building 3D network graph...</p></div>';

    // Cleanup previous graph instance
    if (_networkGraph) {
        _networkGraph._destructor && _networkGraph._destructor();
        _networkGraph = null;
    }

    let data;
    try {
        data = await api(`/api/network/${cik}?limit=${limit}`);
    } catch (e) { return; }

    if (data.error) {
        container.innerHTML = `<p style="color: var(--red);">${escapeHtml(data.error)}</p>`;
        return;
    }

    _networkData = data;
    document.getElementById('networkSearchResults').innerHTML = '';

    const activeCount = data.nodes.filter(n => n.type === 'subsidiary' && n.active).length;
    const divestedCount = data.nodes.filter(n => n.type === 'subsidiary' && !n.active).length;

    const subNodes = data.nodes.filter(n => n.type === 'subsidiary');

    container.innerHTML = `
        <div class="network-header glass-card float-in" style="padding: 1.25rem 1.5rem; border-radius: 14px; margin-bottom: 1rem;">
            <h3 class="text-gradient" style="margin-bottom: 0.75rem;">${escapeHtml(data.company.company_name)}</h3>
            <div class="network-legend-bar">
                <div class="network-legend-item">
                    <span class="network-legend-dot" style="background: #3b82f6; box-shadow: 0 0 8px rgba(59,130,246,0.5);"></span>
                    <span class="network-legend-text">Company</span>
                </div>
                <div class="network-legend-item">
                    <span class="network-legend-dot" style="background: #22c55e; box-shadow: 0 0 8px rgba(34,197,94,0.5);"></span>
                    <span class="network-legend-text">Active</span>
                    <span class="network-legend-count">${activeCount}</span>
                </div>
                <div class="network-legend-item">
                    <span class="network-legend-dot" style="background: #ef4444; box-shadow: 0 0 8px rgba(239,68,68,0.5);"></span>
                    <span class="network-legend-text">Divested</span>
                    <span class="network-legend-count">${divestedCount}</span>
                </div>
                ${data.total_subs > data.showing ? `<span class="network-legend-showing">Showing ${data.showing} of ${data.total_subs}</span>` : ''}
            </div>
        </div>
        <div class="network-3d-container glass-card" style="border-radius: 14px; overflow: hidden; position: relative;">
            <div id="network3dGraph"></div>
        </div>
        <div class="network-list glass-card" style="margin-top: 1rem; padding: 1.25rem; border-radius: 14px; max-height: 400px; overflow-y: auto;">
            <div class="network-list-header">
                <h4 style="margin-bottom: 0; font-weight: 600;">Subsidiaries</h4>
                <input type="text" class="network-filter-input" id="networkSubFilter"
                       placeholder="Filter subsidiaries..." oninput="filterNetworkList(this.value)">
            </div>
            <div class="network-list-items stagger-in" id="networkListItems">
                ${subNodes.map((n, i) => `
                    <div class="network-list-item ${n.active ? 'active' : 'divested'} float-in"
                         data-name="${escapeHtml(n.label).toLowerCase()}"
                         style="display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 0.75rem; border-radius: 8px; cursor: pointer; transition: all 0.2s ease; animation-delay: ${Math.min(i * 20, 400)}ms;"
                         onmouseenter="this.style.background='rgba(59,130,246,0.08)'"
                         onmouseleave="this.style.background='transparent'"
                         onclick="highlightNode('${n.id}')">
                        <span class="legend-dot" style="width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: ${n.active ? '#22c55e' : '#ef4444'}; box-shadow: 0 0 6px ${n.active ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'};"></span>
                        <span class="network-list-name" style="flex: 1; font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(n.label)}</span>
                        <span class="badge ${n.confidence === 'HIGH' ? 'badge-high' : 'badge-medium'}" style="font-size: 0.65rem;">${n.confidence}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    draw3DNetworkGraph(data);
}

function filterNetworkList(query) {
    const items = document.querySelectorAll('#networkListItems .network-list-item');
    const q = query.toLowerCase().trim();
    items.forEach(item => {
        const name = item.getAttribute('data-name') || '';
        item.style.display = (!q || name.includes(q)) ? 'flex' : 'none';
    });
}

function draw3DNetworkGraph(data) {
    const graphEl = document.getElementById('network3dGraph');
    if (!graphEl) return;

    const containerEl = graphEl.parentElement;
    const width = containerEl.clientWidth;
    const height = 600;

    // Build graph data
    const nodes = data.nodes.map(n => ({
        id: n.id,
        label: n.label,
        type: n.type,
        active: n.active,
        confidence: n.confidence,
        time_in: n.time_in,
        time_out: n.time_out,
        color: n.type === 'company' ? '#3b82f6' : (n.active ? '#22c55e' : '#ef4444'),
        val: n.type === 'company' ? 8 : 3,
        // Fix company at center
        fx: n.type === 'company' ? 0 : undefined,
        fy: n.type === 'company' ? 0 : undefined,
        fz: n.type === 'company' ? 0 : undefined,
    }));

    const links = data.edges.map(e => ({
        source: e.source || e.from,
        target: e.target || e.to,
    }));

    const graphData = { nodes, links };

    // Create 3D force graph
    const Graph = ForceGraph3D()(graphEl)
        .width(width)
        .height(height)
        .backgroundColor('#0a0e1a')
        .graphData(graphData)
        .nodeVal('val')
        .nodeLabel(node => {
            if (node.type === 'company') return `<div class="network-3d-tooltip"><strong style="color:#3b82f6;">${escapeHtml(node.label)}</strong><br><span>Parent Company</span></div>`;
            const statusColor = node.active ? '#22c55e' : '#ef4444';
            const statusText = node.active ? 'Active' : 'Divested';
            return `<div class="network-3d-tooltip">
                <strong style="color:${statusColor};">${escapeHtml(node.label)}</strong><br>
                <span>Status: ${statusText}</span><br>
                <span>Time In: ${node.time_in || 'N/A'}</span><br>
                <span>Time Out: ${node.time_out || 'N/A'}</span><br>
                <span>Confidence: ${node.confidence || 'N/A'}</span>
            </div>`;
        })
        .nodeThreeObject(node => {
            const group = new THREE.Group();

            // Main sphere
            const sphereRadius = node.type === 'company' ? 6 : 2.5;
            const sphereGeo = new THREE.SphereGeometry(sphereRadius, 24, 24);
            const sphereMat = new THREE.MeshLambertMaterial({
                color: node.color,
                transparent: true,
                opacity: 0.9,
            });
            const sphere = new THREE.Mesh(sphereGeo, sphereMat);
            group.add(sphere);

            // Glow shell
            const glowRadius = sphereRadius * 1.6;
            const glowGeo = new THREE.SphereGeometry(glowRadius, 24, 24);
            const glowMat = new THREE.MeshBasicMaterial({
                color: node.color,
                transparent: true,
                opacity: node.type === 'company' ? 0.15 : 0.08,
            });
            const glow = new THREE.Mesh(glowGeo, glowMat);
            group.add(glow);

            // Company gets an extra outer ring
            if (node.type === 'company') {
                const ringGeo = new THREE.RingGeometry(8, 9, 32);
                const ringMat = new THREE.MeshBasicMaterial({
                    color: '#3b82f6',
                    transparent: true,
                    opacity: 0.3,
                    side: THREE.DoubleSide,
                });
                const ring = new THREE.Mesh(ringGeo, ringMat);
                group.add(ring);

                // Second ring at different angle
                const ring2 = ring.clone();
                ring2.rotation.x = Math.PI / 2;
                group.add(ring2);
            }

            // Store reference for highlight
            node.__threeObj = group;

            return group;
        })
        .nodeThreeObjectExtend(false)
        .linkColor(() => 'rgba(100, 116, 155, 0.2)')
        .linkWidth(0.4)
        .linkOpacity(0.3)
        .linkDirectionalParticles(1)
        .linkDirectionalParticleWidth(0.8)
        .linkDirectionalParticleSpeed(0.004)
        .linkDirectionalParticleColor(() => 'rgba(59, 130, 246, 0.5)')
        .d3Force('charge', null)
        .onNodeClick(node => {
            // Focus camera on clicked node
            const distance = 80;
            const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
            Graph.cameraPosition(
                { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
                node,
                1500
            );
        });

    // Configure forces
    Graph.d3Force('charge', d3.forceManyBody().strength(node => node.type === 'company' ? -200 : -30));
    Graph.d3Force('link').distance(link => 50);

    // Add bloom/unreal post-processing via renderer
    const renderer = Graph.renderer();
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    // Add ambient + point lights for glow effect
    const scene = Graph.scene();
    scene.add(new THREE.AmbientLight(0x404060, 2));
    const pointLight = new THREE.PointLight(0x3b82f6, 1.5, 300);
    pointLight.position.set(0, 0, 0);
    scene.add(pointLight);

    // Auto-rotate camera
    const controls = Graph.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.5;
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;

    // Set initial camera position
    Graph.cameraPosition({ x: 0, y: 0, z: 200 });

    // Store reference
    _networkGraph = Graph;

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
        const w = containerEl.clientWidth;
        if (w > 0 && _networkGraph) {
            _networkGraph.width(w);
        }
    });
    resizeObserver.observe(containerEl);
}

function highlightNode(nodeId) {
    if (!_networkGraph || !_networkData) return;

    const graphData = _networkGraph.graphData();
    const node = graphData.nodes.find(n => n.id === nodeId);
    if (!node) return;

    // Fly camera to node
    const distance = 60;
    const distRatio = 1 + distance / Math.hypot(node.x || 1, node.y || 1, node.z || 1);
    _networkGraph.cameraPosition(
        { x: (node.x || 0) * distRatio, y: (node.y || 0) * distRatio, z: (node.z || 0) * distRatio },
        node,
        1200
    );

    // Pulse effect on the node
    if (node.__threeObj) {
        const obj = node.__threeObj;
        const origScale = obj.scale.clone();
        const targetScale = 2.5;
        let frame = 0;
        const totalFrames = 40;

        function animatePulse() {
            frame++;
            const t = frame / totalFrames;
            const scale = 1 + (targetScale - 1) * Math.sin(t * Math.PI);
            obj.scale.set(scale, scale, scale);

            if (frame < totalFrames) {
                requestAnimationFrame(animatePulse);
            } else {
                obj.scale.copy(origScale);
            }
        }
        animatePulse();
    }
}

async function searchCrossLinks() {
    const q = document.getElementById('crossLinkInput').value.trim();
    if (!q) return;

    const div = document.getElementById('crossLinkResults');
    div.innerHTML = '<div class="spinner" style="margin: 0.5rem auto;"></div>';

    try {
        const data = await api(`/api/network/cross-links?q=${encodeURIComponent(q)}`);

        if (data.count === 0) {
            div.innerHTML = '<p style="color: var(--text-dim);">No matches found.</p>';
            return;
        }

        const byCompany = {};
        data.results.forEach(r => {
            if (!byCompany[r.cik]) byCompany[r.cik] = { name: r.company_name, subs: [] };
            byCompany[r.cik].subs.push(r);
        });

        const companies = Object.entries(byCompany);
        div.innerHTML = `
            <p style="margin-bottom: 0.75rem;"><strong class="counter-glow">${data.count}</strong> matches across <strong>${companies.length}</strong> companies</p>
            <div class="table-container glass-card" style="border-radius: 14px;">
                <table class="premium-table">
                    <thead>
                        <tr>
                            <th>Parent Company</th>
                            <th>Subsidiary</th>
                            <th>Time In</th>
                            <th>Time Out</th>
                            <th>Confidence</th>
                        </tr>
                    </thead>
                    <tbody class="stagger-in">
                        ${data.results.map((r, i) => `
                            <tr class="clickable table-row-animate float-in" style="animation-delay: ${Math.min(i * 30, 500)}ms;" onclick="navigate('company', {cik: '${r.cik}'})">
                                <td><strong>${escapeHtml(r.company_name)}</strong></td>
                                <td>${escapeHtml(r.sub_name)}</td>
                                <td style="font-size: 0.8rem;">${r.time_in}</td>
                                <td style="font-size: 0.8rem;">${r.time_out}</td>
                                <td>${confidenceBadge(r.confidence)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (e) { /* handled */ }
}
