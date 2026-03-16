/* === Status & Actions Page — Premium UI === */

async function renderStatusPage() {
    app.innerHTML = `
        <div class="loading-screen page-transition">
            <div class="spinner"></div>
            <p>Checking system status...</p>
        </div>`;

    const data = await api('/api/status');

    app.innerHTML = `
        <div class="status-page page-transition">
            <h2 class="text-gradient" style="margin-bottom: 0.5rem; font-size: 1.75rem;">System Status & Actions</h2>
            <p style="color: var(--text-dim); margin-bottom: 2rem; font-size: 0.9rem;">
                Monitor component health, test connections, and navigate to source code
            </p>

            <!-- Component Status Cards -->
            <div class="status-grid stagger-in" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 1.25rem; margin-bottom: 2.5rem;">
                ${data.components.map((c, i) => renderComponentCard(c, i)).join('')}
            </div>

            <!-- File Map / Code Navigator -->
            <div class="reveal">
                <h2 class="text-gradient" style="margin: 0 0 0.5rem; font-size: 1.4rem;">Code Navigator</h2>
                <p style="color: var(--text-dim); margin-bottom: 1.5rem; font-size: 0.85rem;">
                    Project file structure with descriptions. Click any file to view its path.
                </p>
            </div>

            <div class="filemap-sections stagger-in" style="display: flex; flex-direction: column; gap: 1rem;">
                ${data.file_map.map((section, si) => `
                    <div class="filemap-section glass-card float-in" style="padding: 1.25rem 1.5rem; border-radius: 14px; animation-delay: ${si * 80}ms;">
                        <div class="filemap-header text-gradient" style="font-weight: 700; font-size: 1rem; margin-bottom: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid rgba(138,144,165,0.1);">${section.section}</div>
                        <div class="filemap-files" style="display: flex; flex-direction: column; gap: 0.25rem;">
                            ${section.files.map(f => `
                                <div class="filemap-row" onclick="showFilePath('${f.path}')"
                                     style="display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; border-radius: 8px; cursor: pointer; transition: all 0.2s ease;"
                                     onmouseenter="this.style.background='rgba(59,130,246,0.06)'; this.style.transform='translateX(4px)'"
                                     onmouseleave="this.style.background='transparent'; this.style.transform='none'">
                                    <div class="filemap-icon">${getFileIcon(f.path)}</div>
                                    <div class="filemap-info" style="flex: 1; min-width: 0;">
                                        <div class="filemap-path" style="font-family: monospace; font-size: 0.85rem; font-weight: 500;">${f.path}</div>
                                        <div class="filemap-desc" style="font-size: 0.75rem; color: var(--text-dim); margin-top: 0.1rem;">${f.desc}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>

            <!-- Action Log -->
            <div id="actionLog" style="margin-top: 2rem;"></div>
        </div>
    `;
}


function renderComponentCard(comp, index) {
    const isHealthy = comp.status === 'healthy';
    const isWarning = comp.status === 'warning';
    const isError = comp.status === 'error';

    const statusColor = isHealthy ? '#22c55e' : isWarning ? '#eab308' : isError ? '#ef4444' : 'var(--text-dim)';
    const statusGlow = isHealthy ? 'rgba(34,197,94,0.4)' : isWarning ? 'rgba(234,179,8,0.4)' : isError ? 'rgba(239,68,68,0.4)' : 'none';
    const statusLabel = isHealthy ? 'badge-high' : isWarning ? 'badge-medium' : isError ? 'badge-low' : '';

    const actions = (comp.actions || []).map(a =>
        `<button class="btn btn-outline btn-sm btn-glow" style="transition: all 0.3s;"
                 onmouseenter="this.style.boxShadow='0 0 12px rgba(59,130,246,0.25)'"
                 onmouseleave="this.style.boxShadow='none'"
                 onclick="runStatusAction('${a.id}', this)">${a.label}</button>`
    ).join(' ');

    const metrics = comp.metrics ? `
        <div class="comp-metrics" style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem;">
            ${Object.entries(comp.metrics).map(([k, v]) =>
                `<span class="comp-metric" style="padding: 0.3rem 0.65rem; border-radius: 8px; background: rgba(59,130,246,0.06); border: 1px solid rgba(59,130,246,0.1); font-size: 0.75rem;">
                    <span class="comp-metric-label" style="color: var(--text-dim);">${k.replace(/_/g, ' ')}</span>
                    <strong class="counter-glow" style="margin-left: 0.3rem;">${typeof v === 'number' ? v.toLocaleString() : v}</strong>
                </span>`
            ).join('')}
        </div>
    ` : '';

    const setupHint = comp.setup_hint ? `
        <div class="comp-hint" style="margin-top: 0.75rem; padding: 0.5rem 0.75rem; border-radius: 8px; background: rgba(234,179,8,0.06); border: 1px solid rgba(234,179,8,0.15);">
            <code style="font-size: 0.78rem; color: var(--text-dim);">${comp.setup_hint}</code>
        </div>
    ` : '';

    return `
        <div class="comp-card glass-card glow-card scale-in" style="padding: 1.5rem; border-radius: 14px; border-left: 3px solid ${statusColor}; animation-delay: ${index * 80}ms; transition: all 0.3s ease;"
             onmouseenter="this.style.boxShadow='0 4px 24px ${statusGlow.replace('0.4', '0.15')}'"
             onmouseleave="this.style.boxShadow='none'">
            <div class="comp-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                <div class="comp-title" style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="color: ${statusColor}; font-size: 0.75rem; text-shadow: 0 0 8px ${statusGlow};">&#9679;</span>
                    <span style="font-weight: 600;">${comp.name}</span>
                    <span class="badge ${statusLabel}" style="margin-left: 0.25rem; font-size: 0.65rem;">${comp.status}</span>
                </div>
                <span class="comp-file" onclick="showFilePath('${comp.file}')" title="View source"
                      style="font-family: monospace; font-size: 0.72rem; color: var(--text-dim); cursor: pointer; transition: color 0.2s;"
                      onmouseenter="this.style.color='var(--primary)'"
                      onmouseleave="this.style.color='var(--text-dim)'">${comp.file}</span>
            </div>
            <div class="comp-detail" style="color: var(--text-dim); font-size: 0.85rem; line-height: 1.4;">${comp.detail}</div>
            ${metrics}
            ${setupHint}
            ${actions ? `<div class="comp-actions" style="margin-top: 0.75rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">${actions}</div>` : ''}
            <div class="comp-action-result" id="result-${comp.id}" style="margin-top: 0.5rem;"></div>
        </div>
    `;
}


async function runStatusAction(actionId, btn) {
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Running...';
    btn.style.opacity = '0.7';

    try {
        const resp = await fetch(`/api/status/action/${actionId}`, { method: 'POST' });
        const result = await resp.json();

        const actionToComp = {
            'test_edgar': 'edgar',
            'test_wikipedia': 'wikipedia',
            'test_gemini': 'gemini',
            'reload_pipeline': 'database',
            'clear_enrichments': 'database',
            'init_db': 'database',
        };

        const compId = actionToComp[actionId];
        let targetArea = null;
        if (compId) {
            targetArea = document.getElementById(`result-${compId}`);
        }

        if (targetArea) {
            const isSuccess = result.success;
            targetArea.innerHTML = `
                <div class="float-in" style="padding: 0.5rem 0.75rem; border-radius: 8px; font-size: 0.8rem; margin-top: 0.25rem;
                     background: ${isSuccess ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)'};
                     border: 1px solid ${isSuccess ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'};
                     color: ${isSuccess ? 'var(--green)' : 'var(--red)'};">
                    <span>${isSuccess ? '&#10003;' : '&#10007;'}</span>
                    ${result.message}
                    ${result.hint ? `<br><span style="font-size: 0.72rem; opacity: 0.7;">${result.hint}</span>` : ''}
                </div>
            `;
        }

        addActionLog(actionId, result);

    } catch (e) {
        addActionLog(actionId, { success: false, message: e.message });
    }

    btn.disabled = false;
    btn.textContent = originalText;
    btn.style.opacity = '1';
}


function addActionLog(actionId, result) {
    const log = document.getElementById('actionLog');
    if (!log) return;

    const time = new Date().toLocaleTimeString();
    const isSuccess = result.success;

    log.innerHTML = `
        <div class="glass-card float-in" style="padding: 0.65rem 1rem; border-radius: 10px; margin-bottom: 0.5rem; font-size: 0.8rem;
             border-left: 3px solid ${isSuccess ? 'var(--green)' : 'var(--red)'};">
            <span style="color: var(--text-dim); font-size: 0.72rem;">[${time}]</span>
            <strong style="margin: 0 0.35rem;">${actionId}</strong>
            <span style="color: ${isSuccess ? 'var(--green)' : 'var(--red)'};">${isSuccess ? '&#10003;' : '&#10007;'}</span>
            ${result.message}
        </div>
    ` + log.innerHTML;
}


function showFilePath(filePath) {
    const fullPath = `/Users/srivardhanreddygutta/Library/Mobile Documents/com~apple~CloudDocs/Research/subsidiary-tracker/${filePath}`;

    const existing = document.getElementById('filePathModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'filePathModal';
    modal.className = 'filepath-modal';
    modal.style.cssText = 'position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); animation: fadeIn 0.2s ease;';
    modal.innerHTML = `
        <div class="glass-card scale-in" style="max-width: 600px; width: 90%; padding: 1.75rem; border-radius: 16px; border: 1px solid rgba(59,130,246,0.2); box-shadow: 0 20px 60px rgba(0,0,0,0.5);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <span style="display: flex; align-items: center; gap: 0.5rem; font-weight: 600;">${getFileIcon(filePath)} ${filePath.split('/').pop()}</span>
                <span style="cursor: pointer; opacity: 0.6; font-size: 1.2rem; transition: opacity 0.2s; padding: 0.25rem;"
                      onmouseenter="this.style.opacity='1'"
                      onmouseleave="this.style.opacity='0.6'"
                      onclick="this.closest('.filepath-modal').remove()">&#10005;</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; border-radius: 10px; background: var(--surface2); margin-bottom: 0.75rem;">
                <code style="flex: 1; font-size: 0.8rem; word-break: break-all; color: var(--text);">${fullPath}</code>
                <button class="btn btn-outline btn-sm btn-glow" onclick="copyToClipboard('${fullPath}', event)">Copy</button>
            </div>
            <div style="font-size: 0.8rem;">
                <span style="color: var(--text-dim);">Relative: </span>
                <code style="font-size: 0.78rem; color: var(--text-dim);">${filePath}</code>
            </div>
        </div>
    `;
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
}


function copyToClipboard(text, evt) {
    navigator.clipboard.writeText(text).then(() => {
        const btn = evt && evt.target ? evt.target : null;
        if (!btn) return;
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.borderColor = 'var(--green)';
        btn.style.color = 'var(--green)';
        btn.style.boxShadow = '0 0 12px rgba(34,197,94,0.3)';
        setTimeout(() => {
            btn.textContent = original;
            btn.style.borderColor = '';
            btn.style.color = '';
            btn.style.boxShadow = '';
        }, 1500);
    });
}


function getFileIcon(path) {
    const iconStyle = 'display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; font-size: 0.6rem; font-weight: 700; flex-shrink: 0;';
    if (path.endsWith('.py')) return `<span style="${iconStyle} background: rgba(59,130,246,0.15); color: #3b82f6; border: 1px solid rgba(59,130,246,0.2);">PY</span>`;
    if (path.endsWith('.js')) return `<span style="${iconStyle} background: rgba(234,179,8,0.15); color: #eab308; border: 1px solid rgba(234,179,8,0.2);">JS</span>`;
    if (path.endsWith('.css')) return `<span style="${iconStyle} background: rgba(236,72,153,0.15); color: #ec4899; border: 1px solid rgba(236,72,153,0.2);">CSS</span>`;
    if (path.endsWith('.html')) return `<span style="${iconStyle} background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.2);">HTML</span>`;
    if (path.endsWith('.db')) return `<span style="${iconStyle} background: rgba(139,92,246,0.15); color: #8b5cf6; border: 1px solid rgba(139,92,246,0.2);">DB</span>`;
    if (path.endsWith('.txt')) return `<span style="${iconStyle} background: rgba(138,144,165,0.15); color: #8a90a5; border: 1px solid rgba(138,144,165,0.2);">TXT</span>`;
    return `<span style="${iconStyle} background: rgba(138,144,165,0.1); color: #8a90a5;">F</span>`;
}
