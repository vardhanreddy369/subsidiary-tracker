/* ============================================================
   SubTrack — Pricing & Billing Module
   ============================================================ */

(() => {
    'use strict';

    async function renderPricingPage() {
        const app = document.getElementById('app');
        const user = window.getCurrentUser ? window.getCurrentUser() : null;
        const currentPlan = user ? user.plan : null;

        app.innerHTML = `
            <div class="pricing-container">
                <div class="pricing-header">
                    <h1>Simple, Transparent Pricing</h1>
                    <p style="color:var(--text-dim); font-size:1.1rem; max-width:600px; margin:0 auto;">
                        Start free. Upgrade when you need more power.
                    </p>
                </div>

                <div class="pricing-grid">
                    <!-- Free -->
                    <div class="pricing-card ${currentPlan === 'free' ? 'current' : ''}">
                        <div class="plan-name">Free</div>
                        <div class="plan-price">$0<span>/mo</span></div>
                        <p style="color:var(--text-dim); font-size:0.85rem; margin-bottom:1rem;">For exploration</p>
                        <ul class="plan-features">
                            <li>10 API requests/day</li>
                            <li>Browse all companies</li>
                            <li>View analytics</li>
                            <li>Compare companies</li>
                            <li class="disabled">AI Enrichment</li>
                            <li class="disabled">Excel/PDF exports</li>
                            <li class="disabled">API key access</li>
                            <li class="disabled">Bulk enrichment</li>
                        </ul>
                        ${currentPlan === 'free' ? '<button class="btn btn-full" disabled>Current Plan</button>' :
                          !user ? '<button class="btn btn-primary btn-full" onclick="navigate(\'signup\')">Get Started</button>' :
                          '<button class="btn btn-full" disabled>Current Plan</button>'}
                    </div>

                    <!-- Pro -->
                    <div class="pricing-card featured ${currentPlan === 'pro' ? 'current' : ''}">
                        <div style="background:var(--primary); color:#fff; padding:0.25rem 1rem; border-radius:20px; font-size:0.75rem; font-weight:700; display:inline-block; margin-bottom:1rem;">MOST POPULAR</div>
                        <div class="plan-name">Pro</div>
                        <div class="plan-price">$49<span>/mo</span></div>
                        <p style="color:var(--text-dim); font-size:0.85rem; margin-bottom:1rem;">For researchers</p>
                        <ul class="plan-features">
                            <li>1,000 API requests/day</li>
                            <li>Everything in Free</li>
                            <li>100 AI enrichments/day</li>
                            <li>Excel & PDF exports</li>
                            <li>API key access</li>
                            <li>5 company watchlist</li>
                            <li>Geographic mapping</li>
                            <li class="disabled">Bulk enrichment</li>
                        </ul>
                        ${currentPlan === 'pro' ? '<button class="btn btn-full" disabled>Current Plan</button>' :
                          '<button class="btn btn-primary btn-full" onclick="subscribePlan(\'pro\')">Upgrade to Pro</button>'}
                    </div>

                    <!-- Enterprise -->
                    <div class="pricing-card ${currentPlan === 'enterprise' ? 'current' : ''}">
                        <div class="plan-name">Enterprise</div>
                        <div class="plan-price">$499<span>/mo</span></div>
                        <p style="color:var(--text-dim); font-size:0.85rem; margin-bottom:1rem;">For institutions</p>
                        <ul class="plan-features">
                            <li>Unlimited API requests</li>
                            <li>Everything in Pro</li>
                            <li>Unlimited AI enrichment</li>
                            <li>Full dataset export</li>
                            <li>Bulk enrichment</li>
                            <li>Unlimited watchlist</li>
                            <li>Stock cross-references</li>
                            <li>Priority support</li>
                        </ul>
                        ${currentPlan === 'enterprise' ? '<button class="btn btn-full" disabled>Current Plan</button>' :
                          '<button class="btn btn-primary btn-full" onclick="subscribePlan(\'enterprise\')">Go Enterprise</button>'}
                    </div>
                </div>

                <div style="text-align:center; margin-top:3rem; color:var(--text-dim); font-size:0.85rem;">
                    <p>All plans include access to 435,000+ subsidiaries across 11,500+ companies.</p>
                    <p style="margin-top:0.5rem;">Cancel anytime. No hidden fees.</p>
                </div>
            </div>
        `;
    }

    async function renderBillingPage() {
        const app = document.getElementById('app');
        const user = window.getCurrentUser ? window.getCurrentUser() : null;

        if (!user) {
            navigate('login');
            return;
        }

        let billingStatus;
        try {
            billingStatus = await authApi('/api/billing/status');
        } catch {
            billingStatus = { plan: user.plan, has_subscription: false };
        }

        app.innerHTML = `
            <div class="page-header"><h1>Billing</h1></div>
            <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));">
                <div class="stat-card">
                    <div class="stat-label">Current Plan</div>
                    <div class="stat-value" style="text-transform:uppercase;">${escapeHtml(billingStatus.plan)}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Subscription</div>
                    <div class="stat-value" style="font-size:1rem;">${billingStatus.has_subscription ? 'Active' : 'None'}</div>
                </div>
            </div>

            <div class="card" style="margin-top:1.5rem; padding:1.5rem;">
                ${billingStatus.has_subscription ? `
                    <h3>Manage Subscription</h3>
                    <p style="color:var(--text-dim); margin:0.75rem 0;">Change your plan, update payment method, or cancel.</p>
                    <button class="btn btn-primary" onclick="openBillingPortal()">Manage in Stripe</button>
                ` : `
                    <h3>Upgrade Your Plan</h3>
                    <p style="color:var(--text-dim); margin:0.75rem 0;">Unlock premium features like exports, AI enrichment, and more.</p>
                    <button class="btn btn-primary" onclick="navigate('pricing')">View Plans</button>
                `}
            </div>
        `;
    }

    async function subscribePlan(plan) {
        const user = window.getCurrentUser ? window.getCurrentUser() : null;
        if (!user) {
            showToast('Please sign in first', 'info');
            navigate('login');
            return;
        }

        try {
            const data = await authApi('/api/billing/create-checkout-session?plan=' + plan, { method: 'POST' });
            if (data.url) {
                window.location.href = data.url;
            }
        } catch (err) {
            showToast(err.message || 'Failed to start checkout', 'error');
        }
    }

    async function openBillingPortal() {
        try {
            const data = await authApi('/api/billing/portal');
            if (data.url) {
                window.location.href = data.url;
            }
        } catch (err) {
            showToast(err.message || 'Failed to open billing portal', 'error');
        }
    }

    window.renderPricingPage = renderPricingPage;
    window.renderBillingPage = renderBillingPage;
    window.subscribePlan = subscribePlan;
    window.openBillingPortal = openBillingPortal;

})();
