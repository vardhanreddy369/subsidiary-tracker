/* ============================================================
   SubTrack — Command Palette (⌘K)
   Raycast/Linear-style fuzzy command launcher
   ============================================================ */

(() => {
    'use strict';

    let _paletteOpen = false;
    let _fuseInstance = null;
    let _selectedIndex = 0;
    let _filteredResults = [];
    let _overlay = null;

    /* ----------------------------------------------------------
       COMMAND REGISTRY
    ---------------------------------------------------------- */
    const COMMANDS = [
        // Navigation
        { id: 'nav-dashboard',   category: 'Navigation', icon: '&#9632;',  label: 'Dashboard',        action: () => navigate('dashboard') },
        { id: 'nav-companies',   category: 'Navigation', icon: '&#9881;',  label: 'Companies',        action: () => navigate('companies') },
        { id: 'nav-analytics',   category: 'Navigation', icon: '&#9679;',  label: 'Analytics',        action: () => navigate('analytics') },
        { id: 'nav-compare',     category: 'Navigation', icon: '&#8700;',  label: 'Compare',          action: () => navigate('compare') },
        { id: 'nav-network',     category: 'Navigation', icon: '&#9672;',  label: 'Network Graph',    action: () => navigate('network') },
        { id: 'nav-search',      category: 'Navigation', icon: '&#128269;', label: 'Search Companies', action: () => navigate('search') },
        { id: 'nav-techstack',   category: 'Navigation', icon: '&#9881;',  label: 'Tech Stack',       action: () => navigate('techstack') },
        { id: 'nav-status',      category: 'Navigation', icon: '&#9899;',  label: 'System Status',    action: () => navigate('status') },
        { id: 'nav-geo',         category: 'Navigation', icon: '&#127758;', label: 'Map / Geography',  action: () => navigate('geo') },
        { id: 'nav-insights',    category: 'Navigation', icon: '&#9733;',  label: 'Insights',         action: () => navigate('insights') },
        { id: 'nav-quality',     category: 'Navigation', icon: '&#9745;',  label: 'Data Quality',     action: () => navigate('data-quality') },
        { id: 'nav-crossref',    category: 'Navigation', icon: '&#128279;', label: 'Cross Reference',  action: () => navigate('crossref') },

        // Quick Actions
        { id: 'act-export',      category: 'Actions',    icon: '&#128190;', label: 'Export CSV',        shortcut: null,  action: _actionExportCSV },
        { id: 'act-theme',       category: 'Actions',    icon: '&#127769;', label: 'Toggle Theme',      shortcut: null,  action: () => { if (typeof toggleTheme === 'function') toggleTheme(); } },
    ];

    /* ----------------------------------------------------------
       FUSE.JS SETUP
    ---------------------------------------------------------- */
    function _initFuse() {
        if (typeof Fuse === 'undefined') {
            console.warn('Command Palette: Fuse.js not loaded');
            return;
        }
        _fuseInstance = new Fuse(COMMANDS, {
            keys: ['label', 'category'],
            threshold: 0.4,
            distance: 80,
            includeScore: true,
        });
    }

    /* ----------------------------------------------------------
       BUILD PALETTE DOM
    ---------------------------------------------------------- */
    function _createOverlay() {
        if (_overlay) return _overlay;

        _overlay = document.createElement('div');
        _overlay.className = 'cmd-palette-overlay';
        _overlay.innerHTML = `
            <div class="cmd-palette-modal" role="dialog" aria-label="Command palette">
                <div class="cmd-palette-input-wrap">
                    <span class="cmd-palette-search-icon">&#128269;</span>
                    <input
                        type="text"
                        class="cmd-palette-input"
                        placeholder="Type a command or search..."
                        autocomplete="off"
                        spellcheck="false"
                    />
                    <kbd class="cmd-palette-esc-hint">ESC</kbd>
                </div>
                <div class="cmd-palette-results"></div>
                <div class="cmd-palette-footer">
                    <span><kbd>&uarr;</kbd><kbd>&darr;</kbd> navigate</span>
                    <span><kbd>&#9166;</kbd> select</span>
                    <span><kbd>esc</kbd> close</span>
                </div>
            </div>
        `;
        document.body.appendChild(_overlay);

        // Event: click outside modal
        _overlay.addEventListener('mousedown', (e) => {
            if (e.target === _overlay) _closePalette();
        });

        // Event: input
        const input = _overlay.querySelector('.cmd-palette-input');
        input.addEventListener('input', _onInput);
        input.addEventListener('keydown', _onKeydown);

        return _overlay;
    }

    /* ----------------------------------------------------------
       OPEN / CLOSE
    ---------------------------------------------------------- */
    function _openPalette() {
        if (_paletteOpen) return;
        _paletteOpen = true;

        if (!_fuseInstance) _initFuse();

        const overlay = _createOverlay();
        const input = overlay.querySelector('.cmd-palette-input');

        // Reset state
        input.value = '';
        _selectedIndex = 0;
        _renderResults(COMMANDS);

        // Show with animation
        requestAnimationFrame(() => {
            overlay.classList.add('active');
            input.focus();
        });
    }

    function _closePalette() {
        if (!_paletteOpen) return;
        _paletteOpen = false;

        if (_overlay) {
            _overlay.classList.remove('active');
        }
    }

    function toggleCommandPalette() {
        _paletteOpen ? _closePalette() : _openPalette();
    }

    /* ----------------------------------------------------------
       SEARCH / FILTER
    ---------------------------------------------------------- */
    function _onInput(e) {
        const query = e.target.value.trim();

        // Check for "search <term>" pattern
        if (/^search\s+.+/i.test(query)) {
            const searchTerm = query.replace(/^search\s+/i, '').trim();
            const dynamicResults = [{
                id: 'dynamic-search',
                category: 'Search',
                icon: '&#128269;',
                label: 'Search for "' + _escLabel(searchTerm) + '"',
                action: () => navigate('search', { q: searchTerm }),
            }];
            _selectedIndex = 0;
            _renderResults(dynamicResults);
            return;
        }

        if (!query) {
            _selectedIndex = 0;
            _renderResults(COMMANDS);
            return;
        }

        if (_fuseInstance) {
            const results = _fuseInstance.search(query).map(r => r.item);
            _selectedIndex = 0;
            _renderResults(results);
        }
    }

    function _escLabel(str) {
        return typeof escapeHtml === 'function' ? escapeHtml(str) : str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /* ----------------------------------------------------------
       KEYBOARD NAV
    ---------------------------------------------------------- */
    function _onKeydown(e) {
        const total = _filteredResults.length;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            _selectedIndex = (_selectedIndex + 1) % total;
            _highlightSelected();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            _selectedIndex = (_selectedIndex - 1 + total) % total;
            _highlightSelected();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            _executeSelected();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            _closePalette();
        }
    }

    function _highlightSelected() {
        if (!_overlay) return;
        const items = _overlay.querySelectorAll('.cmd-palette-item');
        items.forEach((el, i) => {
            el.classList.toggle('selected', i === _selectedIndex);
        });
        // Scroll selected into view
        const selected = items[_selectedIndex];
        if (selected) selected.scrollIntoView({ block: 'nearest' });
    }

    function _executeSelected() {
        const cmd = _filteredResults[_selectedIndex];
        if (cmd && typeof cmd.action === 'function') {
            _closePalette();
            cmd.action();
        }
    }

    /* ----------------------------------------------------------
       RENDER RESULTS
    ---------------------------------------------------------- */
    function _renderResults(results) {
        _filteredResults = results;
        const container = _overlay.querySelector('.cmd-palette-results');

        if (!results.length) {
            container.innerHTML = '<div class="cmd-palette-empty">No results found</div>';
            return;
        }

        // Group by category
        const grouped = {};
        results.forEach(cmd => {
            const cat = cmd.category || 'Other';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(cmd);
        });

        let html = '';
        let itemIndex = 0;
        for (const [category, items] of Object.entries(grouped)) {
            html += `<div class="cmd-palette-category">${_escLabel(category)}</div>`;
            items.forEach(cmd => {
                const isSelected = itemIndex === _selectedIndex;
                const shortcutHtml = cmd.shortcut
                    ? `<span class="cmd-palette-shortcut">${cmd.shortcut}</span>`
                    : '';
                html += `
                    <div class="cmd-palette-item${isSelected ? ' selected' : ''}"
                         data-index="${itemIndex}"
                         role="option">
                        <span class="cmd-palette-item-icon">${cmd.icon}</span>
                        <span class="cmd-palette-item-label">${cmd.label}</span>
                        ${shortcutHtml}
                    </div>
                `;
                itemIndex++;
            });
        }

        container.innerHTML = html;

        // Attach click handlers
        container.querySelectorAll('.cmd-palette-item').forEach(el => {
            el.addEventListener('click', () => {
                _selectedIndex = parseInt(el.dataset.index, 10);
                _executeSelected();
            });
            el.addEventListener('mouseenter', () => {
                _selectedIndex = parseInt(el.dataset.index, 10);
                _highlightSelected();
            });
        });
    }

    /* ----------------------------------------------------------
       QUICK ACTIONS
    ---------------------------------------------------------- */
    function _actionExportCSV() {
        // Try to click any visible export button on the current page
        const btn = document.querySelector('[onclick*="export"], [onclick*="Export"], .export-btn, button[data-export]');
        if (btn) {
            btn.click();
            if (typeof showToast === 'function') showToast('Exporting...', 'info');
        } else {
            if (typeof showToast === 'function') showToast('No export available on this page', 'warning');
        }
    }

    /* ----------------------------------------------------------
       EXPOSE TO WINDOW
    ---------------------------------------------------------- */
    window.toggleCommandPalette = toggleCommandPalette;

})();
