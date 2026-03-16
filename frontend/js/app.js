/* ============================================================
   SubTrack — Main App Controller (Premium Edition)
   ============================================================ */

(() => {
    'use strict';

    const app = document.getElementById('app');
    let currentPage = null;
    let _toastContainer = null;
    let _scrollTopBtn = null;
    let _mobileNavOpen = false;

    /* ----------------------------------------------------------
       1. PAGE TRANSITIONS & NAVIGATE
    ---------------------------------------------------------- */

    /**
     * Wait for a CSS transition to finish on an element, with a max timeout.
     * Resolves once 'transitionend' fires or timeout expires, whichever first.
     */
    function _waitTransitionEnd(el, maxMs) {
        return new Promise(resolve => {
            let done = false;
            const finish = () => { if (!done) { done = true; resolve(); } };
            el.addEventListener('transitionend', finish, { once: true });
            setTimeout(finish, maxMs);
        });
    }

    /**
     * Navigate to a page with smooth transition.
     * Uses CSS opacity/transform transitions instead of fixed delays.
     * Skeletons only shown if API takes >100ms (avoids flash).
     */
    async function navigate(page, params = {}) {
        const previousPage = currentPage;
        currentPage = page;

        // Update active nav link
        _updateActiveNav(page);

        // Close mobile nav if open
        _closeMobileNav();

        // Phase 1: exit transition (120ms CSS transition, 150ms max wait)
        if (previousPage !== null) {
            app.classList.add('page-exit');
            await _waitTransitionEnd(app, 150);
        }

        // Phase 2: render new page with smart skeleton (race API vs 100ms timer)
        // Scroll to top instantly (no smooth — conflicts with page transition)
        window.scrollTo(0, 0);

        try {
            // Start the page render (async) and a 100ms skeleton timer in parallel
            const skeletonType = _pageToSkeletonType(page);
            let skeletonTimer = null;

            const renderPromise = _renderPage(page, params);

            if (skeletonType) {
                // Only show skeleton if render takes longer than 100ms
                skeletonTimer = setTimeout(() => {
                    app.innerHTML = showSkeleton(skeletonType);
                    app.classList.remove('page-exit');
                }, 100);
            }

            await renderPromise;

            // Cancel skeleton timer if render finished fast
            if (skeletonTimer) clearTimeout(skeletonTimer);

        } catch (err) {
            console.error(`Navigation error (${page}):`, err);
        }

        // Phase 3: enter transition
        app.classList.remove('page-exit');
        app.classList.add('page-enter');

        _staggerAnimateChildren();

        // Remove page-enter class after transition completes
        _waitTransitionEnd(app, 250).then(() => {
            app.classList.remove('page-enter');
        });

        // Phase 4: observe new .reveal elements (reuse existing observer)
        _observeNewRevealElements();

        // Pre-fetch common endpoints after initial dashboard load
        if (page === 'dashboard' && previousPage === null) {
            setTimeout(() => {
                fetch('/api/analytics/timeline').catch(() => {});
                fetch('/api/companies?per_page=1').catch(() => {});
            }, 2000);
        }
    }

    /**
     * Dispatch to the correct render function for a page.
     */
    async function _renderPage(page, params) {
        switch (page) {
            case 'dashboard':    await renderDashboard(); break;
            case 'companies':    await renderCompanyBrowser(params); break;
            case 'company':      await renderCompanyDetail(params.cik); break;
            case 'subsidiary':   await renderSubsidiaryDetail(params.id); break;
            case 'search':       await renderSearchPage(params); break;
            case 'techstack':    await renderTechStack(); break;
            case 'analytics': case 'insights': await renderAnalytics(); break;
            case 'compare':      await renderComparePage(); break;
            case 'network':      await renderNetworkPage(params); break;
            case 'status':       await renderStatusPage(); break;
            case 'geo':          await renderGeoPage(params); break;
            case 'crossref':     await renderCrossrefPage(params); break;
            case 'data-quality': await renderDataQualityPage(); break;
            case 'timeline':    await renderTimelinePage(); break;
            case 'login':        await renderLoginPage(); break;
            case 'signup':       await renderSignupPage(); break;
            case 'account':      await renderAccountPage(); break;
            case 'pricing':      await renderPricingPage(); break;
            case 'billing':      await renderBillingPage(); break;
            default:             await renderDashboard(); currentPage = 'dashboard'; break;
        }
    }

    /**
     * Stagger-animate direct children of #app into view.
     * Only animates the first 8 children max, uses will-change hint.
     */
    function _staggerAnimateChildren() {
        const children = app.children;
        const count = Math.min(children.length, 8);

        requestAnimationFrame(() => {
            for (let i = 0; i < count; i++) {
                const child = children[i];
                child.style.willChange = 'transform, opacity';
                child.classList.add('stagger-in', 'float-in');
                child.style.animationDelay = `${i * 60}ms`;
            }

            // Clean up will-change after animations finish
            const cleanupDelay = count * 60 + 600; // last child delay + animation duration
            setTimeout(() => {
                for (let i = 0; i < count; i++) {
                    if (children[i]) children[i].style.willChange = 'auto';
                }
            }, cleanupDelay);
        });
    }

    function _pageToSkeletonType(page) {
        switch (page) {
            case 'dashboard': return 'dashboard';
            case 'companies': case 'status': return 'table';
            case 'analytics': case 'techstack': case 'compare': case 'network': case 'timeline': return 'cards';
            default: return null;
        }
    }

    /* ----------------------------------------------------------
       2. SCROLL REVEAL SYSTEM (IntersectionObserver)
    ---------------------------------------------------------- */

    let _revealObserver = null;

    /**
     * Create the reveal observer once, reuse it forever.
     */
    function _initScrollReveal() {
        if (_revealObserver) return; // Already initialized — reuse

        _revealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    _revealObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });

        _observeNewRevealElements();
    }

    /**
     * Observe any new .reveal elements that haven't been observed yet.
     * Reuses the existing observer without disconnecting.
     */
    function _observeNewRevealElements() {
        if (!_revealObserver) return;
        document.querySelectorAll('.reveal:not(.revealed)').forEach(el => {
            _revealObserver.observe(el);
        });
    }

    /* ----------------------------------------------------------
       3. CONSOLIDATED SCROLL HANDLER (navbar + scroll-top)
    ---------------------------------------------------------- */

    function _initConsolidatedScroll() {
        const navbar = document.querySelector('.navbar');
        let ticking = false;

        window.addEventListener('scroll', () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    const y = window.scrollY;

                    // Navbar scroll effect
                    if (navbar) {
                        navbar.classList.toggle('scrolled', y > 30);
                    }

                    // Scroll-top button visibility
                    if (_scrollTopBtn) {
                        _scrollTopBtn.classList.toggle('visible', y > 400);
                    }

                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
    }

    /* ----------------------------------------------------------
       4. ACTIVE NAV LINK
    ---------------------------------------------------------- */

    function _updateActiveNav(page) {
        // Clear all active states on direct links and dropdown menu items
        document.querySelectorAll('.nav-links a.active, .nav-dropdown-menu a.active').forEach(function(el) {
            el.classList.remove('active');
        });
        // Clear parent-active from dropdown triggers
        document.querySelectorAll('.nav-dropdown-trigger.parent-active').forEach(function(el) {
            el.classList.remove('parent-active');
        });

        // Activate direct links (e.g. Dashboard)
        document.querySelectorAll('.nav-links > a[data-page]').forEach(function(link) {
            if (link.getAttribute('data-page') === page) {
                link.classList.add('active');
            }
        });

        // Activate dropdown items and their parent trigger
        document.querySelectorAll('.nav-dropdown').forEach(function(dropdown) {
            var pages = (dropdown.getAttribute('data-pages') || '').split(',');
            if (pages.indexOf(page) !== -1) {
                var trigger = dropdown.querySelector('.nav-dropdown-trigger');
                if (trigger) trigger.classList.add('parent-active');
                // Also highlight the specific child link
                dropdown.querySelectorAll('.nav-dropdown-menu a').forEach(function(link) {
                    var href = link.getAttribute('href') || '';
                    if (href.replace('#', '') === page) {
                        link.classList.add('active');
                    }
                });
            }
        });

        // Mobile nav links
        document.querySelectorAll('.mobile-nav-links a').forEach(function(link) {
            link.classList.remove('active');
            var href = link.getAttribute('href') || '';
            if (href.replace('#', '') === page) {
                link.classList.add('active');
            }
        });
    }

    /* ----------------------------------------------------------
       4b. NAV DROPDOWN BEHAVIOR
    ---------------------------------------------------------- */

    function _initNavDropdowns() {
        var dropdowns = document.querySelectorAll('.nav-dropdown');
        var closeTimer = null;

        dropdowns.forEach(function(dropdown) {
            var trigger = dropdown.querySelector('.nav-dropdown-trigger');
            if (!trigger) return;

            // Desktop: hover with delay
            dropdown.addEventListener('mouseenter', function() {
                if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
                // Close others
                dropdowns.forEach(function(d) { if (d !== dropdown) d.classList.remove('open'); });
                dropdown.classList.add('open');
            });

            dropdown.addEventListener('mouseleave', function() {
                closeTimer = setTimeout(function() {
                    dropdown.classList.remove('open');
                }, 150);
            });

            // Click trigger to toggle (for touch devices)
            trigger.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                var isOpen = dropdown.classList.contains('open');
                dropdowns.forEach(function(d) { d.classList.remove('open'); });
                if (!isOpen) dropdown.classList.add('open');
            });

            // Click dropdown menu items — close dropdown
            dropdown.querySelectorAll('.nav-dropdown-menu a').forEach(function(link) {
                link.addEventListener('click', function() {
                    dropdown.classList.remove('open');
                });
            });
        });

        // Close on click outside
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.nav-dropdown')) {
                dropdowns.forEach(function(d) { d.classList.remove('open'); });
            }
        });

        // Close on Escape
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                dropdowns.forEach(function(d) { d.classList.remove('open'); });
            }
        });
    }

    /* ----------------------------------------------------------
       5. MOBILE NAVIGATION
    ---------------------------------------------------------- */

    function _initMobileNav() {
        // Create hamburger button if it doesn't exist
        const navbar = document.querySelector('.navbar');
        if (!navbar || navbar.querySelector('.mobile-toggle')) return;

        const toggle = document.createElement('button');
        toggle.className = 'mobile-toggle';
        toggle.setAttribute('aria-label', 'Toggle navigation');
        toggle.innerHTML = `
            <span class="hamburger-line"></span>
            <span class="hamburger-line"></span>
            <span class="hamburger-line"></span>
        `;
        navbar.appendChild(toggle);

        // Create mobile overlay
        const overlay = document.createElement('div');
        overlay.className = 'mobile-nav-overlay';
        overlay.id = 'mobileNavOverlay';
        document.body.appendChild(overlay);

        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            _toggleMobileNav();
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                _closeMobileNav();
            }
        });

        // Close on nav link click
        document.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', () => _closeMobileNav());
        });
    }

    function _toggleMobileNav() {
        _mobileNavOpen = !_mobileNavOpen;
        const navLinks = document.querySelector('.nav-links');
        const overlay = document.getElementById('mobileNavOverlay');
        const toggle = document.querySelector('.mobile-toggle');

        if (navLinks) navLinks.classList.toggle('mobile-open', _mobileNavOpen);
        if (overlay) overlay.classList.toggle('active', _mobileNavOpen);
        if (toggle) toggle.classList.toggle('active', _mobileNavOpen);
        document.body.classList.toggle('nav-open', _mobileNavOpen);
    }

    function _closeMobileNav() {
        if (!_mobileNavOpen) return;
        _mobileNavOpen = false;
        const navLinks = document.querySelector('.nav-links');
        const overlay = document.getElementById('mobileNavOverlay');
        const toggle = document.querySelector('.mobile-toggle');

        if (navLinks) navLinks.classList.remove('mobile-open');
        if (overlay) overlay.classList.remove('active');
        if (toggle) toggle.classList.remove('active');
        document.body.classList.remove('nav-open');
    }

    /* ----------------------------------------------------------
       6. TOAST NOTIFICATION SYSTEM
    ---------------------------------------------------------- */

    function _ensureToastContainer() {
        if (!_toastContainer) {
            _toastContainer = document.createElement('div');
            _toastContainer.className = 'toast-container';
            _toastContainer.setAttribute('aria-live', 'polite');
            _toastContainer.setAttribute('aria-atomic', 'true');
            document.body.appendChild(_toastContainer);
        }
        return _toastContainer;
    }

    /**
     * Show a toast notification.
     * @param {string} message
     * @param {'success'|'error'|'info'} type
     * @param {number} duration - Auto-dismiss in ms (default 3000)
     */
    function showToast(message, type = 'info', duration = 3000) {
        const container = _ensureToastContainer();

        const icons = {
            success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>',
            error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
            info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>'
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${type} toast-enter`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${escapeHtml(message)}</span>
            <button class="toast-close" aria-label="Dismiss">&times;</button>
        `;

        container.appendChild(toast);

        // Trigger entrance animation
        requestAnimationFrame(() => {
            toast.classList.remove('toast-enter');
            toast.classList.add('toast-visible');
        });

        const dismiss = () => {
            toast.classList.remove('toast-visible');
            toast.classList.add('toast-exit');
            toast.addEventListener('animationend', () => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, { once: true });
            // Fallback removal
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 500);
        };

        toast.querySelector('.toast-close').addEventListener('click', dismiss);

        if (duration > 0) {
            setTimeout(dismiss, duration);
        }

        return { dismiss };
    }

    /* ----------------------------------------------------------
       7. SCROLL TO TOP BUTTON
    ---------------------------------------------------------- */

    function _initScrollTopButton() {
        if (_scrollTopBtn) return;

        _scrollTopBtn = document.createElement('button');
        _scrollTopBtn.className = 'scroll-top-btn';
        _scrollTopBtn.setAttribute('aria-label', 'Scroll to top');
        _scrollTopBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M18 15l-6-6-6 6"/>
            </svg>
        `;
        document.body.appendChild(_scrollTopBtn);

        // Scroll-top button uses smooth scroll (in-page action, not navigation)
        _scrollTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        // Visibility is handled by the consolidated scroll handler
    }

    /* ----------------------------------------------------------
       8. THEME / DARK MODE TOGGLE INFRASTRUCTURE
    ---------------------------------------------------------- */

    function _initThemeToggle() {
        // Read saved preference
        const saved = localStorage.getItem('subtrack-theme');
        if (saved) {
            document.documentElement.setAttribute('data-theme', saved);
        }
    }

    /**
     * Toggle between dark and light themes.
     * @returns {string} The new theme name
     */
    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('subtrack-theme', next);
        showToast(`Switched to ${next} mode`, 'info', 2000);
        return next;
    }

    /* ----------------------------------------------------------
       9. KEYBOARD SHORTCUTS
    ---------------------------------------------------------- */

    function _initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // ⌘K / Ctrl+K or / => open command palette
            if ((e.metaKey && e.key === 'k') || (e.ctrlKey && e.key === 'k') || (e.key === '/' && !_isInputFocused())) {
                e.preventDefault();
                if (typeof toggleCommandPalette === 'function') toggleCommandPalette();
                return;
            }

            // Escape => close modal / mobile nav
            if (e.key === 'Escape') {
                _closeMobileNav();
                // Close any open modals
                const modal = document.querySelector('.modal.active, .modal-overlay.active');
                if (modal) {
                    modal.classList.remove('active');
                }
            }
        });
    }

    function _isInputFocused() {
        const tag = document.activeElement?.tagName?.toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'select';
    }

    /* ----------------------------------------------------------
       10. SKELETON LOADING STATES
    ---------------------------------------------------------- */

    /**
     * Returns skeleton loading HTML for different page types.
     * @param {'dashboard'|'table'|'cards'} type
     * @returns {string}
     */
    function showSkeleton(type) {
        const shimmer = 'skeleton-shimmer';

        switch (type) {
            case 'dashboard':
                return `
                    <div class="skeleton-wrapper" aria-label="Loading dashboard">
                        <div class="skeleton-hero">
                            <div class="${shimmer} skeleton-line" style="width:60%;height:3rem;margin:0 auto 1rem;"></div>
                            <div class="${shimmer} skeleton-line" style="width:40%;height:1rem;margin:0 auto 0.5rem;"></div>
                            <div class="${shimmer} skeleton-line" style="width:30%;height:0.85rem;margin:0 auto;"></div>
                        </div>
                        <div class="skeleton-grid">
                            ${_repeat(6, `<div class="skeleton-card ${shimmer}"><div class="skeleton-line" style="width:50%;height:0.75rem;margin-bottom:0.75rem;"></div><div class="skeleton-line" style="width:70%;height:1.5rem;"></div></div>`)}
                        </div>
                        <div class="skeleton-charts">
                            <div class="${shimmer} skeleton-chart-box"></div>
                            <div class="${shimmer} skeleton-chart-box"></div>
                        </div>
                        <div class="skeleton-table">
                            ${_repeat(5, `<div class="${shimmer} skeleton-table-row"></div>`)}
                        </div>
                    </div>`;

            case 'table':
                return `
                    <div class="skeleton-wrapper" aria-label="Loading table">
                        <div class="${shimmer} skeleton-line" style="width:30%;height:1.5rem;margin-bottom:1.5rem;"></div>
                        <div class="${shimmer} skeleton-line" style="width:100%;height:2.5rem;margin-bottom:1rem;border-radius:8px;"></div>
                        ${_repeat(8, `<div class="${shimmer} skeleton-table-row"></div>`)}
                    </div>`;

            case 'cards':
                return `
                    <div class="skeleton-wrapper" aria-label="Loading content">
                        <div class="${shimmer} skeleton-line" style="width:35%;height:1.5rem;margin-bottom:1.5rem;"></div>
                        <div class="skeleton-grid">
                            ${_repeat(4, `<div class="skeleton-card ${shimmer}" style="height:180px;"></div>`)}
                        </div>
                    </div>`;

            default:
                return `
                    <div class="loading-screen" aria-label="Loading">
                        <div class="spinner" role="status"></div>
                        <p>Loading...</p>
                    </div>`;
        }
    }

    function _repeat(n, html) {
        return Array(n).fill(html).join('');
    }

    /* ----------------------------------------------------------
       11. API FETCH HELPERS
    ---------------------------------------------------------- */

    /**
     * Fetch JSON from the API with error handling.
     * On failure, replaces #app with an error screen.
     * @param {string} path
     * @returns {Promise<any>}
     */
    async function api(path) {
        try {
            const resp = await fetch(path);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return await resp.json();
        } catch (e) {
            console.error(`API error (${path}):`, e);
            app.innerHTML = `
                <div class="loading-screen">
                    <div class="error-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--red, #ef4444)" stroke-width="1.5">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 8v4M12 16h.01"/>
                        </svg>
                    </div>
                    <p style="color: var(--red, #ef4444); font-weight: 600; margin-top: 1rem;">Failed to load data</p>
                    <p style="color: var(--text-dim); font-size: 0.85rem; margin-top: 0.25rem;">${escapeHtml(e.message)}</p>
                    <button class="btn btn-primary" style="margin-top: 1.25rem;" onclick="navigate('dashboard')">
                        Back to Dashboard
                    </button>
                </div>`;
            showToast('Failed to load data. Please try again.', 'error');
            throw e;
        }
    }

    /**
     * Lightweight API fetch — throws on error instead of replacing the page.
     * Use this in modules that handle their own error states.
     * @param {string} path
     * @returns {Promise<any>}
     */
    async function apiFast(path) {
        const resp = await fetch(path);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.json();
    }

    /* ----------------------------------------------------------
       12. UTILITY FUNCTIONS
    ---------------------------------------------------------- */

    function formatNumber(n) {
        if (n === null || n === undefined) return '0';
        return Number(n).toLocaleString();
    }

    function confidenceBadge(conf) {
        const cls = conf === 'HIGH' ? 'badge-high' : conf === 'MEDIUM' ? 'badge-medium' : 'badge-low';
        return `<span class="badge ${cls}">${escapeHtml(conf)}</span>`;
    }

    function timeoutBadge(timeout) {
        if (timeout && timeout.startsWith('Active')) {
            return `<span class="badge badge-active">Active</span>`;
        }
        return `<span class="badge badge-low">Divested</span>`;
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /* ----------------------------------------------------------
       13. INITIALIZATION
    ---------------------------------------------------------- */

    function _initApp() {
        _initThemeToggle();
        _initNavDropdowns();
        _initMobileNav();
        _initScrollTopButton();
        _initConsolidatedScroll();
        _initKeyboardShortcuts();
        _initScrollReveal();

        // Inject page-transition CSS into <head> (keeps styles.css untouched)
        const transitionStyle = document.createElement('style');
        transitionStyle.textContent = `
            #app {
                transition: opacity 120ms ease-out, transform 120ms ease-out;
            }
            #app.page-exit {
                opacity: 0;
                transform: translateY(6px);
            }
            #app.page-enter {
                opacity: 1;
                transform: translateY(0);
                transition: opacity 200ms ease-out, transform 200ms ease-out;
            }
        `;
        document.head.appendChild(transitionStyle);

        // Start on dashboard
        navigate('dashboard');
    }

    // Expose public API on window for other scripts
    window.navigate = navigate;
    window.api = api;
    window.apiFast = apiFast;
    window.formatNumber = formatNumber;
    window.confidenceBadge = confidenceBadge;
    window.timeoutBadge = timeoutBadge;
    window.escapeHtml = escapeHtml;
    window.showToast = showToast;
    window.showSkeleton = showSkeleton;
    window.toggleTheme = toggleTheme;

    // Boot
    window.addEventListener('DOMContentLoaded', _initApp);

})();
