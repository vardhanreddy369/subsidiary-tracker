/* ============================================================
   SubTrack — Authentication Module
   ============================================================ */

(() => {
    'use strict';

    let _currentUser = null;

    /* ----------------------------------------------------------
       1. TOKEN MANAGEMENT
    ---------------------------------------------------------- */

    function getToken() {
        return localStorage.getItem('subtrack-token');
    }

    function setToken(token) {
        localStorage.setItem('subtrack-token', token);
    }

    function clearToken() {
        localStorage.removeItem('subtrack-token');
        _currentUser = null;
        _updateAuthUI();
    }

    /* ----------------------------------------------------------
       2. AUTH-AWARE API HELPER (overrides window.api)
    ---------------------------------------------------------- */

    const _originalApi = window.api;

    async function authApi(path, options = {}) {
        const token = getToken();
        const fetchOptions = {
            method: options.method || 'GET',
            headers: { ...(options.headers || {}) },
        };

        if (token) {
            fetchOptions.headers['Authorization'] = `Bearer ${token}`;
        }

        if (options.body) {
            fetchOptions.headers['Content-Type'] = 'application/json';
            fetchOptions.body = JSON.stringify(options.body);
        }

        const resp = await fetch(path, fetchOptions);

        if (resp.status === 401) {
            clearToken();
            showToast('Session expired. Please log in again.', 'error');
            navigate('login');
            throw new Error('Unauthorized');
        }

        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ detail: `HTTP ${resp.status}` }));
            throw new Error(err.detail || `HTTP ${resp.status}`);
        }

        return resp.json();
    }

    // Override global api() to attach auth headers for GET requests
    window.api = async function(path) {
        const token = getToken();
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const resp = await fetch(path, { headers });
            if (resp.status === 401) {
                clearToken();
            }
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return await resp.json();
        } catch (e) {
            console.error(`API error (${path}):`, e);
            const app = document.getElementById('app');
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
    };

    /* ----------------------------------------------------------
       3. AUTH CHECK ON LOAD
    ---------------------------------------------------------- */

    async function checkAuth() {
        const token = getToken();
        if (!token) {
            _currentUser = null;
            _updateAuthUI();
            return null;
        }

        try {
            const data = await authApi('/api/auth/me');
            _currentUser = data;
            _updateAuthUI();
            return data;
        } catch {
            clearToken();
            return null;
        }
    }

    /* ----------------------------------------------------------
       4. LOGIN PAGE
    ---------------------------------------------------------- */

    async function renderLoginPage() {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="auth-container">
                <div class="auth-card">
                    <div class="auth-header">
                        <h1>Welcome Back</h1>
                        <p>Sign in to access your SubTrack account</p>
                    </div>
                    <form id="loginForm" class="auth-form">
                        <div class="form-group">
                            <label for="loginEmail">Email</label>
                            <input type="email" id="loginEmail" placeholder="you@example.com" required autocomplete="email">
                        </div>
                        <div class="form-group">
                            <label for="loginPassword">Password</label>
                            <input type="password" id="loginPassword" placeholder="Your password" required autocomplete="current-password">
                        </div>
                        <button type="submit" class="btn btn-primary btn-full" id="loginBtn">Sign In</button>
                        <div id="loginError" class="auth-error" style="display:none;"></div>
                    </form>
                    <div class="auth-footer">
                        <p>Don't have an account? <a href="#signup" onclick="navigate('signup')">Create one free</a></p>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('loginBtn');
            const errEl = document.getElementById('loginError');
            btn.disabled = true;
            btn.textContent = 'Signing in...';
            errEl.style.display = 'none';

            try {
                const data = await authApi('/api/auth/login', {
                    method: 'POST',
                    body: {
                        email: document.getElementById('loginEmail').value,
                        password: document.getElementById('loginPassword').value,
                    },
                });
                setToken(data.token);
                _currentUser = data.user;
                _updateAuthUI();
                showToast(`Welcome back, ${data.user.display_name}!`, 'success');
                navigate('dashboard');
            } catch (err) {
                errEl.textContent = err.message;
                errEl.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Sign In';
            }
        });
    }

    /* ----------------------------------------------------------
       5. SIGNUP PAGE
    ---------------------------------------------------------- */

    async function renderSignupPage() {
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="auth-container">
                <div class="auth-card">
                    <div class="auth-header">
                        <h1>Create Account</h1>
                        <p>Start tracking subsidiaries for free</p>
                    </div>
                    <form id="signupForm" class="auth-form">
                        <div class="form-group">
                            <label for="signupName">Display Name</label>
                            <input type="text" id="signupName" placeholder="Your name" autocomplete="name">
                        </div>
                        <div class="form-group">
                            <label for="signupEmail">Email</label>
                            <input type="email" id="signupEmail" placeholder="you@example.com" required autocomplete="email">
                        </div>
                        <div class="form-group">
                            <label for="signupPassword">Password</label>
                            <input type="password" id="signupPassword" placeholder="Min. 6 characters" required minlength="6" autocomplete="new-password">
                        </div>
                        <button type="submit" class="btn btn-primary btn-full" id="signupBtn">Create Account</button>
                        <div id="signupError" class="auth-error" style="display:none;"></div>
                    </form>
                    <div class="auth-footer">
                        <p>Already have an account? <a href="#login" onclick="navigate('login')">Sign in</a></p>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('signupForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('signupBtn');
            const errEl = document.getElementById('signupError');
            btn.disabled = true;
            btn.textContent = 'Creating account...';
            errEl.style.display = 'none';

            try {
                const data = await authApi('/api/auth/signup', {
                    method: 'POST',
                    body: {
                        email: document.getElementById('signupEmail').value,
                        password: document.getElementById('signupPassword').value,
                        display_name: document.getElementById('signupName').value,
                    },
                });
                setToken(data.token);
                _currentUser = data.user;
                _updateAuthUI();
                showToast(`Welcome, ${data.user.display_name}! Your free account is ready.`, 'success');
                navigate('dashboard');
            } catch (err) {
                errEl.textContent = err.message;
                errEl.style.display = 'block';
                btn.disabled = false;
                btn.textContent = 'Create Account';
            }
        });
    }

    /* ----------------------------------------------------------
       6. ACCOUNT PAGE
    ---------------------------------------------------------- */

    async function renderAccountPage() {
        const app = document.getElementById('app');
        if (!_currentUser) {
            navigate('login');
            return;
        }

        let profile, usage;
        try {
            [profile, usage] = await Promise.all([
                authApi('/api/auth/me'),
                authApi('/api/auth/usage'),
            ]);
        } catch {
            navigate('login');
            return;
        }

        const planColors = { free: 'var(--text-dim)', pro: 'var(--primary)', enterprise: 'var(--green)' };

        app.innerHTML = `
            <div class="page-header"><h1>My Account</h1></div>
            <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));">
                <div class="stat-card">
                    <div class="stat-label">Email</div>
                    <div class="stat-value" style="font-size:1rem;">${escapeHtml(profile.email)}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Plan</div>
                    <div class="stat-value" style="color:${planColors[profile.plan] || 'var(--text)'}; text-transform:uppercase;">${escapeHtml(profile.plan)}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Requests Today</div>
                    <div class="stat-value">${formatNumber(usage.today)}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Total Requests</div>
                    <div class="stat-value">${formatNumber(usage.total)}</div>
                </div>
            </div>

            <div class="card" style="margin-top:1.5rem; padding:1.5rem;">
                <h3 style="margin-bottom:1rem;">API Key</h3>
                <p style="color:var(--text-dim); font-size:0.85rem; margin-bottom:0.75rem;">Use this key in the <code>X-API-Key</code> header to access the API programmatically.</p>
                <div style="display:flex; gap:0.75rem; align-items:center; flex-wrap:wrap;">
                    <code id="apiKeyDisplay" style="background:var(--surface-2); padding:0.5rem 1rem; border-radius:8px; font-size:0.85rem; word-break:break-all;">${escapeHtml(profile.api_key)}</code>
                    <button class="btn btn-sm" onclick="navigator.clipboard.writeText(document.getElementById('apiKeyDisplay').textContent); showToast('Copied!','success');">Copy</button>
                    <button class="btn btn-sm btn-danger" onclick="regenerateKey()">Regenerate</button>
                </div>
            </div>

            ${profile.plan === 'free' ? `
            <div class="card" style="margin-top:1.5rem; padding:1.5rem; border: 1px solid var(--primary);">
                <h3 style="margin-bottom:0.5rem;">Upgrade Your Plan</h3>
                <p style="color:var(--text-dim); font-size:0.9rem;">Unlock Excel/PDF exports, more API requests, bulk enrichment, and more.</p>
                <button class="btn btn-primary" style="margin-top:1rem;" onclick="navigate('pricing')">View Pricing</button>
            </div>
            ` : ''}

            <div style="margin-top:2rem;">
                <button class="btn btn-danger" onclick="logout()">Sign Out</button>
            </div>
        `;
    }

    /* ----------------------------------------------------------
       7. UI UPDATES
    ---------------------------------------------------------- */

    function _updateAuthUI() {
        // Update nav CTA button
        const navCta = document.querySelector('.nav-cta');
        if (navCta) {
            if (_currentUser) {
                navCta.textContent = _currentUser.display_name || 'Account';
                navCta.setAttribute('href', '#account');
                navCta.setAttribute('onclick', "navigate('account')");
            } else {
                navCta.innerHTML = 'Sign In &#8594;';
                navCta.setAttribute('href', '#login');
                navCta.setAttribute('onclick', "navigate('login')");
            }
        }

        // Update mobile nav CTA
        const mobileCta = document.querySelector('.mobile-nav-cta');
        if (mobileCta) {
            if (_currentUser) {
                mobileCta.textContent = _currentUser.display_name || 'Account';
                mobileCta.setAttribute('href', '#account');
                mobileCta.setAttribute('onclick', "navigate('account'); closeMobileNav();");
            } else {
                mobileCta.innerHTML = 'Sign In &#8594;';
                mobileCta.setAttribute('href', '#login');
                mobileCta.setAttribute('onclick', "navigate('login'); closeMobileNav();");
            }
        }
    }

    /* ----------------------------------------------------------
       8. ACTIONS
    ---------------------------------------------------------- */

    async function regenerateKey() {
        if (!confirm('Generate a new API key? The old one will stop working immediately.')) return;
        try {
            const data = await authApi('/api/auth/api-key/regenerate', { method: 'POST' });
            document.getElementById('apiKeyDisplay').textContent = data.api_key;
            showToast('API key regenerated', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    function logout() {
        clearToken();
        showToast('Signed out', 'info');
        navigate('dashboard');
    }

    /* ----------------------------------------------------------
       9. EXPOSE PUBLIC API
    ---------------------------------------------------------- */

    window.renderLoginPage = renderLoginPage;
    window.renderSignupPage = renderSignupPage;
    window.renderAccountPage = renderAccountPage;
    window.checkAuth = checkAuth;
    window.getCurrentUser = () => _currentUser;
    window.authApi = authApi;
    window.logout = logout;
    window.regenerateKey = regenerateKey;

    // Check auth on load
    window.addEventListener('DOMContentLoaded', () => checkAuth());

})();
