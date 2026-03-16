/**
 * SubTrack — 3D Global Particle Background System (Wow Factor Upgrade)
 * Fully replaces the old 2D canvas with a dynamic, Three.js powered 3D interconnected network
 * that slowly flows and responds to user mouse movements globally across the SaaS.
 */
(function () {
    'use strict';

    let scene, camera, renderer;
    let particles, geometry, materials = [], parameters, i, h, color, size;
    let mouseX = 0, mouseY = 0;

    let windowHalfX = window.innerWidth / 2;
    let windowHalfY = window.innerHeight / 2;
    let animationId = null;
    let paused = false;

    // Advanced Network Lines in 3D
    let linesMesh;

    const PARTICLE_COUNT = window.innerWidth < 768 ? 400 : 900;
    const MAX_DISTANCE = window.innerWidth < 768 ? 40 : 80;

    init();
    animate();

    function init() {
        // Use existing canvas if available, or create if not
        let canvas = document.getElementById('particleCanvas');
        if (!canvas) return; // Fail gracefully

        // Initialize Three.js Basics
        camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 2, 2000);
        camera.position.z = 1000;

        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x06070a, 0.0012);

        // Create Particles Geometry
        geometry = new THREE.BufferGeometry();
        const vertices = [];
        const colors = [];

        // Distribute particles in 3D space
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const x = Math.random() * 2000 - 1000;
            const y = Math.random() * 2000 - 1000;
            const z = Math.random() * 2000 - 1000;
            vertices.push(x, y, z);

            // Brand colors: Teal (#00d4aa) or Violet (#7c5cfc) or Blue (#5b8def)
            const rand = Math.random();
            if (rand < 0.4) {
                colors.push(0.0, 0.83, 0.66); // Mint Teal
            } else if (rand < 0.7) {
                colors.push(0.48, 0.36, 0.98); // Violet
            } else {
                colors.push(0.35, 0.55, 0.93); // Blue
            }
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        // Particle Material
        const material = new THREE.PointsMaterial({
            size: 4,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        particles = new THREE.Points(geometry, material);
        scene.add(particles);

        // Renderer
        renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);

        // Event Listeners for Interaction & Responsiveness
        document.addEventListener('pointermove', onPointerMove);
        window.addEventListener('resize', onWindowResize);

        // Custom event for visibility optimization
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                paused = true;
            } else {
                paused = false;
                if (!animationId) animate();
            }
        });
    }

    function onWindowResize() {
        windowHalfX = window.innerWidth / 2;
        windowHalfY = window.innerHeight / 2;

        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();

        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function onPointerMove(event) {
        if (event.isPrimary === false) return;
        mouseX = event.clientX - windowHalfX;
        mouseY = event.clientY - windowHalfY;
    }

    function animate() {
        if (paused || document.hidden) {
            animationId = null;
            return;
        }

        animationId = requestAnimationFrame(animate);
        render();
    }

    function render() {
        const time = Date.now() * 0.00005;

        // Smooth camera follow mouse
        camera.position.x += (mouseX * 0.5 - camera.position.x) * 0.05;
        camera.position.y += (- mouseY * 0.5 - camera.position.y) * 0.05;
        camera.lookAt(scene.position);

        // Slowly rotate entire system
        particles.rotation.y = time * 0.4;
        particles.rotation.x = time * 0.2;

        // Pulsate particles
        const positions = geometry.attributes.position.array;

        // Subtle wave effect for depth (manipulating few points per frame for performance)
        for (let i = 0; i < PARTICLE_COUNT; i += 5) {
            positions[i * 3 + 1] += Math.sin(time * 10 + positions[i * 3]) * 0.2;
        }
        geometry.attributes.position.needsUpdate = true;

        renderer.render(scene, camera);
    }

    // Expose globals for potential pause/resume APIs
    window.pauseParticles = () => { paused = true; };
    window.resumeParticles = () => { paused = false; if (!animationId) animate(); };
})();
