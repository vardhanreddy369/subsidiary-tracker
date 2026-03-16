/* ================================================================
   SUBTRACK — GSAP Animation System (Performance-Optimized)
   Premium animations powered by GreenSock Animation Platform
   3D effects, parallax, micro-interactions, cinematic reveals
   ================================================================ */

(function () {
    'use strict';

    // ── Theme colors ─────────────────────────────────────────────
    var ACCENT = '#7c5cfc';
    var ACCENT_RGB = '124, 92, 252';
    var MINT = '#00d4aa';
    var MINT_RGB = '0, 212, 170';

    // ── GSAP Defaults ──────────────────────────────────────────
    gsap.defaults({ ease: 'power3.out', duration: 0.8 });
    gsap.registerPlugin(ScrollTrigger);

    // ── Shared IntersectionObserver for viewport checks ────────
    var _visibleElements = new WeakSet();
    var _viewportObserver = null;

    function getViewportObserver() {
        if (!_viewportObserver) {
            _viewportObserver = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        _visibleElements.add(entry.target);
                    } else {
                        _visibleElements.delete(entry.target);
                    }
                });
            }, { rootMargin: '50px' });
        }
        return _viewportObserver;
    }

    function isVisible(el) {
        return _visibleElements.has(el);
    }

    // ── 1. gsapReveal — ScrollTrigger-based reveal ─────────────
    function gsapReveal() {
        var els = document.querySelectorAll('.reveal');
        if (!els.length) return;

        els.forEach(function (el) {
            gsap.fromTo(el,
                { y: 40, opacity: 0 },
                {
                    y: 0,
                    opacity: 1,
                    duration: 0.8,
                    scrollTrigger: {
                        trigger: el,
                        start: 'top 88%',
                        once: true
                    }
                }
            );
        });

        // Stagger siblings that share a parent
        var parents = new Set();
        els.forEach(function (el) { if (el.parentElement) parents.add(el.parentElement); });
        parents.forEach(function (parent) {
            var siblings = parent.querySelectorAll(':scope > .reveal');
            if (siblings.length > 1) {
                gsap.fromTo(siblings,
                    { y: 40, opacity: 0 },
                    {
                        y: 0,
                        opacity: 1,
                        stagger: 0.1,
                        duration: 0.8,
                        scrollTrigger: {
                            trigger: parent,
                            start: 'top 88%',
                            once: true
                        }
                    }
                );
            }
        });
    }

    // ── 2. gsapStaggerCards — 3D card entrance animation ────────
    function gsapStaggerCards(container) {
        if (!container) return;
        if (typeof container === 'string') container = document.querySelector(container);
        if (!container) return;
        var cards = container.querySelectorAll('.card, .stat-card, .metric-card, [class*="card"]');
        if (!cards.length) return;

        gsap.fromTo(cards,
            {
                scale: 0.9,
                opacity: 0,
                y: 30,
                rotateY: -5,
                transformPerspective: 800,
                boxShadow: '0 0 0 rgba(' + ACCENT_RGB + ', 0)'
            },
            {
                scale: 1,
                opacity: 1,
                y: 0,
                rotateY: 0,
                transformPerspective: 800,
                boxShadow: '0 8px 32px rgba(' + ACCENT_RGB + ', 0.15)',
                stagger: 0.08,
                duration: 0.6,
                ease: 'power3.out',
                scrollTrigger: {
                    trigger: container,
                    start: 'top 85%',
                    once: true
                }
            }
        );
    }

    // ── 3. gsapCountUp — smooth number counter with pulse ──────
    function gsapCountUp(element, target, duration) {
        if (!element) return;
        duration = duration || 1.5;
        var obj = { val: 0 };

        gsap.to(obj, {
            val: target,
            duration: duration,
            ease: 'power2.out',
            onUpdate: function () {
                element.textContent = Math.round(obj.val).toLocaleString();
            },
            onComplete: function () {
                element.textContent = target.toLocaleString();
                element.classList.add('counter-done');

                // Scale pulse on completion
                gsap.timeline()
                    .to(element, {
                        scale: 1.15,
                        duration: 0.2,
                        ease: 'power2.out'
                    })
                    .to(element, {
                        scale: 1.0,
                        duration: 0.5,
                        ease: 'elastic.out(1, 0.4)'
                    })
                    .to(element, {
                        textShadow: '0 0 20px rgba(' + ACCENT_RGB + ', 0.6)',
                        duration: 0.3,
                        ease: 'power2.out'
                    }, 0)
                    .to(element, {
                        textShadow: '0 0 0px rgba(' + ACCENT_RGB + ', 0)',
                        duration: 0.8,
                        ease: 'power2.inOut'
                    }, 0.3);
            }
        });
    }

    // ── 4. gsapHeroEntrance — cinematic hero animation ─────────
    function gsapHeroEntrance() {
        var tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

        // Camera zoom on entire hero container
        var heroContainer = document.querySelector('.hero, .dashboard-header, .page-header');
        if (heroContainer) {
            tl.fromTo(heroContainer,
                { scale: 1.02, opacity: 0.8 },
                { scale: 1.0, opacity: 1, duration: 1.2, ease: 'power2.out' },
                0
            );
        }

        // Title: clip-path wipe + scale + blur
        var title = document.querySelector('.hero-title, .dashboard-title, h1');
        if (title) {
            tl.fromTo(title,
                {
                    clipPath: 'inset(0 100% 0 0)',
                    y: 15,
                    opacity: 0,
                    scale: 1.05,
                    filter: 'blur(10px)'
                },
                {
                    clipPath: 'inset(0 0% 0 0)',
                    y: 0,
                    opacity: 1,
                    scale: 1.0,
                    filter: 'blur(0px)',
                    duration: 1
                },
                0.1
            );
        }

        // Subtitle: fade in + y + blur
        var subtitle = document.querySelector('.hero-subtitle, .dashboard-subtitle, .hero p');
        if (subtitle) {
            tl.fromTo(subtitle,
                { y: 25, opacity: 0, filter: 'blur(8px)' },
                { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.7 },
                '-=0.5'
            );
        }

        // Stats cards: 3D rotate + stagger + blur
        var stats = document.querySelectorAll('.stat-card, .hero-stat, .kpi-card');
        if (stats.length) {
            tl.fromTo(stats,
                {
                    y: 40,
                    opacity: 0,
                    scale: 0.95,
                    rotateX: -10,
                    transformPerspective: 800,
                    filter: 'blur(6px)'
                },
                {
                    y: 0,
                    opacity: 1,
                    scale: 1,
                    rotateX: 0,
                    transformPerspective: 800,
                    filter: 'blur(0px)',
                    stagger: 0.15,
                    duration: 0.6
                },
                '-=0.3'
            );
        }

        return tl;
    }

    // ── 5. gsapPageTransition — smooth exit/enter ──────────────
    function gsapPageTransition(onComplete) {
        var main = document.querySelector('#app') || document.querySelector('main') || document.body;

        // Exit
        gsap.to(main, {
            opacity: 0,
            y: -20,
            duration: 0.25,
            ease: 'power2.in',
            onComplete: function () {
                if (typeof onComplete === 'function') onComplete();

                // Enter
                gsap.fromTo(main,
                    { opacity: 0, y: 20 },
                    { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' }
                );
            }
        });
    }

    // ── 6. gsapMagneticButton — magnetic hover effect ──────────
    function gsapMagneticButton(selector) {
        var buttons = document.querySelectorAll(selector || '.btn-magnetic');
        if (!buttons.length) return;

        buttons.forEach(function (btn) {
            btn.addEventListener('mousemove', function (e) {
                var rect = btn.getBoundingClientRect();
                var x = e.clientX - rect.left - rect.width / 2;
                var y = e.clientY - rect.top - rect.height / 2;
                var maxMove = 10;

                gsap.to(btn, {
                    x: x * (maxMove / rect.width * 2),
                    y: y * (maxMove / rect.height * 2),
                    duration: 0.3,
                    ease: 'power2.out'
                });
            });

            btn.addEventListener('mouseleave', function () {
                gsap.to(btn, {
                    x: 0,
                    y: 0,
                    duration: 0.6,
                    ease: 'elastic.out(1, 0.3)'
                });
            });
        });
    }

    // ── 7. gsapFloatingElements — subtle float for decorative ──
    function gsapFloatingElements() {
        var floaters = document.querySelectorAll('.floating, .float-element, .decoration');
        if (!floaters.length) return;

        floaters.forEach(function (el) {
            gsap.to(el, {
                y: '+=10',
                duration: 2,
                yoyo: true,
                repeat: -1,
                ease: 'sine.inOut'
            });
        });
    }

    // ── 8. gsapSmoothChartReveal — animate chart containers ────
    function gsapSmoothChartReveal(canvas) {
        if (!canvas) return;
        var container = canvas.closest('.chart-container, .chart-wrapper, .card') || canvas.parentElement;
        if (!container) return;

        gsap.fromTo(container,
            { scale: 0.95, opacity: 0 },
            {
                scale: 1,
                opacity: 1,
                duration: 0.7,
                ease: 'power3.out',
                scrollTrigger: {
                    trigger: container,
                    start: 'top 90%',
                    once: true
                }
            }
        );
    }

    // ── 9. gsapTextSplit — character-by-character reveal ───────
    function gsapTextSplit(element) {
        if (!element) return;
        var text = element.textContent;
        element.textContent = '';
        element.style.visibility = 'visible';

        var chars = text.split('');
        chars.forEach(function (char) {
            var span = document.createElement('span');
            span.textContent = char === ' ' ? '\u00A0' : char;
            span.style.display = 'inline-block';
            span.style.opacity = '0';
            element.appendChild(span);
        });

        gsap.fromTo(element.querySelectorAll('span'),
            { opacity: 0, y: 20 },
            {
                opacity: 1,
                y: 0,
                stagger: 0.02,
                duration: 0.5,
                ease: 'power3.out'
            }
        );
    }

    // ── 10. gsapParallaxDepth — depth-based scroll parallax ────
    function gsapParallaxDepth() {
        var els = document.querySelectorAll('[data-depth]');
        if (!els.length) return;

        els.forEach(function (el) {
            var depth = parseFloat(el.getAttribute('data-depth')) || 1;
            var speed = depth * 50; // deeper = more movement

            gsap.to(el, {
                y: speed,
                ease: 'none',
                scrollTrigger: {
                    trigger: el.parentElement || el,
                    start: 'top bottom',
                    end: 'bottom top',
                    scrub: 1
                }
            });
        });
    }

    // ── 11. gsapGlowPulse — viewport-aware continuous glow ─────
    function gsapGlowPulse(selector) {
        var els = document.querySelectorAll(selector || '.glow-card');
        if (!els.length) return;

        var MAX_ACTIVE = 10;
        var activeTweens = [];
        var observer = getViewportObserver();

        els.forEach(function (el) {
            observer.observe(el);
        });

        // Create tweens paused, manage via viewport observer
        var glowEls = Array.prototype.slice.call(els, 0, 30); // cap total tracked
        glowEls.forEach(function (el) {
            var tween = gsap.fromTo(el,
                { boxShadow: '0 0 15px rgba(' + ACCENT_RGB + ', 0.1), 0 0 30px rgba(' + MINT_RGB + ', 0.05)' },
                {
                    boxShadow: '0 0 25px rgba(' + ACCENT_RGB + ', 0.4), 0 0 50px rgba(' + MINT_RGB + ', 0.15)',
                    duration: 2,
                    yoyo: true,
                    repeat: -1,
                    ease: 'sine.inOut',
                    paused: true
                }
            );
            activeTweens.push({ el: el, tween: tween, playing: false });
        });

        // Periodically check viewport and manage active count
        function updateGlowState() {
            var playingCount = 0;
            for (var i = 0; i < activeTweens.length; i++) {
                var item = activeTweens[i];
                var shouldPlay = isVisible(item.el) && playingCount < MAX_ACTIVE;
                if (shouldPlay && !item.playing) {
                    item.tween.play();
                    item.playing = true;
                    playingCount++;
                } else if (!shouldPlay && item.playing) {
                    item.tween.pause();
                    item.playing = false;
                } else if (item.playing) {
                    playingCount++;
                }
            }
        }

        // Check every 500ms instead of every frame
        setInterval(updateGlowState, 500);
        updateGlowState();
    }

    // ── 12. gsapMorphBackground — mesh orb animation (simplified) ──
    function gsapMorphBackground() {
        var orbs = document.querySelectorAll('.mesh-orb');
        if (!orbs.length) return;

        orbs.forEach(function (orb, i) {
            var duration = 20 + Math.random() * 10; // 20-30s
            var radius = 80 + Math.random() * 60;
            var startAngle = (Math.PI * 2 / orbs.length) * i;

            // Simplified figure-8: 2 keyframes instead of 4 (less CPU)
            gsap.timeline({ repeat: -1, ease: 'none' })
                .to(orb, {
                    x: Math.cos(startAngle) * radius,
                    y: Math.sin(startAngle * 2) * (radius * 0.6),
                    duration: duration * 0.5,
                    ease: 'sine.inOut'
                })
                .to(orb, {
                    x: -Math.cos(startAngle) * radius * 0.7,
                    y: -Math.sin(startAngle * 2) * (radius * 0.5),
                    duration: duration * 0.5,
                    ease: 'sine.inOut'
                });

            // Scale breathing (keep GSAP for this)
            gsap.fromTo(orb,
                { scale: 0.8 },
                {
                    scale: 1.2,
                    duration: duration * 0.5,
                    yoyo: true,
                    repeat: -1,
                    ease: 'sine.inOut',
                    delay: i * 2
                }
            );
        });
    }

    // ── 13. gsapCardHover3D — interactive 3D tilt on hover ─────
    function gsapCardHover3D() {
        var allCards = document.querySelectorAll('.depth-card, .glass-card');
        if (!allCards.length) return;

        // Filter: skip cards already initialized, skip cards in scroll containers/tables, limit to 20
        var cards = [];
        for (var i = 0; i < allCards.length && cards.length < 20; i++) {
            var card = allCards[i];
            if (card.hasAttribute('data-hover3d')) continue;
            if (card.closest('table, .table-container, .scroll-container, [style*="overflow"]')) continue;
            cards.push(card);
        }
        if (!cards.length) return;

        var observer = getViewportObserver();

        cards.forEach(function (card) {
            card.setAttribute('data-hover3d', '1');
            observer.observe(card);

            // Create light reflection overlay
            var reflection = document.createElement('div');
            reflection.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;' +
                'pointer-events:none;border-radius:inherit;z-index:1;opacity:0;' +
                'background:radial-gradient(circle at 50% 50%, rgba(255,255,255,0.15) 0%, transparent 60%);' +
                'transition:opacity 0.3s ease;';
            // Ensure card has relative positioning
            if (getComputedStyle(card).position === 'static') {
                card.style.position = 'relative';
            }
            card.style.overflow = 'hidden';
            card.appendChild(reflection);

            // Throttle mousemove to ~60fps using rAF
            var rafPending = false;
            var lastMouseEvent = null;

            card.addEventListener('mousemove', function (e) {
                lastMouseEvent = e;
                if (rafPending) return;
                if (!isVisible(card)) return;
                rafPending = true;

                requestAnimationFrame(function () {
                    rafPending = false;
                    if (!lastMouseEvent) return;
                    var ev = lastMouseEvent;

                    var rect = card.getBoundingClientRect();
                    var centerX = rect.left + rect.width / 2;
                    var centerY = rect.top + rect.height / 2;
                    var mouseX = ev.clientX - centerX;
                    var mouseY = ev.clientY - centerY;

                    // Normalize to -1 to 1
                    var normalX = mouseX / (rect.width / 2);
                    var normalY = mouseY / (rect.height / 2);

                    var maxTilt = 8;

                    gsap.to(card, {
                        rotateY: normalX * maxTilt,
                        rotateX: -normalY * maxTilt,
                        transformPerspective: 1000,
                        duration: 0.4,
                        ease: 'power2.out'
                    });

                    // Move reflection using transform instead of recalculating gradient
                    var percX = ((ev.clientX - rect.left) / rect.width) * 100;
                    var percY = ((ev.clientY - rect.top) / rect.height) * 100;
                    reflection.style.transform = 'translate(' + (percX - 50) + '%, ' + (percY - 50) + '%)';
                    reflection.style.opacity = '1';
                });
            });

            card.addEventListener('mouseleave', function () {
                lastMouseEvent = null;
                rafPending = false;
                gsap.to(card, {
                    rotateY: 0,
                    rotateX: 0,
                    transformPerspective: 1000,
                    duration: 0.7,
                    ease: 'elastic.out(1, 0.5)'
                });
                reflection.style.opacity = '0';
                reflection.style.transform = '';
            });
        });
    }

    // ── 14. gsapTextReveal — premium word-level text reveal ────
    function gsapTextReveal(element) {
        if (!element) return;
        if (typeof element === 'string') element = document.querySelector(element);
        if (!element) return;

        var text = element.textContent.trim();
        var words = text.split(/\s+/);
        element.textContent = '';
        element.style.visibility = 'visible';

        words.forEach(function (word, i) {
            var span = document.createElement('span');
            span.textContent = word;
            span.style.display = 'inline-block';
            span.style.opacity = '0';
            span.style.marginRight = '0.3em';
            element.appendChild(span);
        });

        gsap.fromTo(element.querySelectorAll('span'),
            { opacity: 0, y: 15, filter: 'blur(4px)' },
            {
                opacity: 1,
                y: 0,
                filter: 'blur(0px)',
                stagger: 0.04,
                duration: 0.5,
                ease: 'power3.out'
            }
        );
    }

    // ── 15. gsapNumberTicker — airport departure board effect ──
    function gsapNumberTicker(element, value) {
        if (!element) return;
        if (typeof element === 'string') element = document.querySelector(element);
        if (!element) return;

        var finalStr = String(value);
        var duration = 1.5;
        var fps = 20; // ticks per second
        var totalTicks = Math.floor(duration * fps);
        var tick = 0;

        element.style.fontVariantNumeric = 'tabular-nums';

        var interval = setInterval(function () {
            tick++;
            var progress = tick / totalTicks;

            // Each digit settles left-to-right as progress increases
            var display = '';
            for (var i = 0; i < finalStr.length; i++) {
                var charSettlePoint = (i + 1) / finalStr.length * 0.8; // settle at 80% through
                if (progress >= charSettlePoint) {
                    display += finalStr[i];
                } else if (finalStr[i] >= '0' && finalStr[i] <= '9') {
                    display += Math.floor(Math.random() * 10);
                } else {
                    display += finalStr[i]; // keep commas, dots, etc
                }
            }
            element.textContent = display;

            if (tick >= totalTicks) {
                clearInterval(interval);
                element.textContent = finalStr;

                // Subtle settle pulse
                gsap.fromTo(element,
                    { scale: 1 },
                    { scale: 1.05, duration: 0.15, yoyo: true, repeat: 1, ease: 'power2.inOut' }
                );
            }
        }, 1000 / fps);
    }

    // ── 16. gsapSmoothAppear — refined scroll-triggered appear ─
    function gsapSmoothAppear(selector) {
        var els = document.querySelectorAll(selector || '.glass-card');
        if (!els.length) return;

        els.forEach(function (el, i) {
            // Skip elements that already have a ScrollTrigger or appeared
            if (el.hasAttribute('data-appeared')) return;
            if (el.classList.contains('reveal')) return; // gsapReveal handles these
            if (ScrollTrigger.getAll().some(function (st) { return st.trigger === el; })) return;
            // Skip elements inside #app that get replaced on navigation
            if (el.closest('#app') && document.querySelectorAll('#app .glass-card').length > 20) return;

            gsap.fromTo(el,
                { y: 30, opacity: 0, filter: 'blur(4px)' },
                {
                    y: 0,
                    opacity: 1,
                    filter: 'blur(0px)',
                    duration: 0.7,
                    ease: 'power4.out',
                    delay: i * 0.06,
                    scrollTrigger: {
                        trigger: el,
                        start: 'top 90%',
                        once: true
                    },
                    onComplete: function () {
                        el.setAttribute('data-appeared', '1');
                    }
                }
            );
        });
    }

    // ── Cleanup — kill all ScrollTrigger instances ─────────────
    function gsapCleanup() {
        ScrollTrigger.getAll().forEach(function (st) {
            st.kill();
        });
        // Also kill all active GSAP tweens/timelines
        gsap.killTweensOf('*');
    }

    // ── Expose all functions globally ──────────────────────────
    window.gsapReveal = gsapReveal;
    window.gsapStaggerCards = gsapStaggerCards;
    window.gsapCountUp = gsapCountUp;
    window.gsapHeroEntrance = gsapHeroEntrance;
    window.gsapPageTransition = gsapPageTransition;
    window.gsapMagneticButton = gsapMagneticButton;
    window.gsapFloatingElements = gsapFloatingElements;
    window.gsapSmoothChartReveal = gsapSmoothChartReveal;
    window.gsapTextSplit = gsapTextSplit;
    window.gsapParallaxDepth = gsapParallaxDepth;
    window.gsapGlowPulse = gsapGlowPulse;
    window.gsapMorphBackground = gsapMorphBackground;
    window.gsapCardHover3D = gsapCardHover3D;
    window.gsapTextReveal = gsapTextReveal;
    window.gsapNumberTicker = gsapNumberTicker;
    window.gsapSmoothAppear = gsapSmoothAppear;
    window.gsapCleanup = gsapCleanup;

    // ── Auto-init on DOM ready (staggered for performance) ────
    document.addEventListener('DOMContentLoaded', function () {
        // Essential animations first
        requestAnimationFrame(function () {
            gsapReveal();
            gsapFloatingElements();
            gsapMagneticButton('.btn-magnetic');
            gsapParallaxDepth();
            gsapMorphBackground();

            // Defer non-critical animations
            var defer = typeof requestIdleCallback === 'function' ? requestIdleCallback : function (cb) { setTimeout(cb, 80); };
            defer(function () {
                gsapGlowPulse('.glow-card');
                gsapCardHover3D();
            });

            // Don't run gsapSmoothAppear on initial load if gsapReveal already handled .reveal elements
            defer(function () {
                gsapSmoothAppear('.glass-card');
            });
        });
    });

})();
