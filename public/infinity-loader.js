/**
 * INFINITY Loader System — centralized loading UX for the MPA.
 * Works with infinity-loader.css
 */
(function initInfinityLoader(global) {
    "use strict";

    if (global.InfinityLoader) return;

    const REDUCED = global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const IS_HOME = document.body.classList.contains("home-page");

    let fullscreenEl = null;
    let progressBar = null;
    let pendingCount = 0;
    let fullscreenLabel = null;

    function infinitySvg(size) {
        const s = size || 80;
        return `<svg class="il-infinity-svg" width="${s}" height="${Math.round(s * 0.45)}" viewBox="0 0 120 54" aria-hidden="true">
            <path class="il-infinity-glow" stroke="#00ccff" stroke-width="5"
                d="M30,27 C30,12 48,12 60,27 C72,42 90,42 90,27 C90,12 72,12 60,27 C48,42 30,42 30,27 Z"/>
            <path class="il-infinity-path" stroke="#ffffff" stroke-width="3.5"
                d="M30,27 C30,12 48,12 60,27 C72,42 90,42 90,27 C90,12 72,12 60,27 C48,42 30,42 30,27 Z"/>
        </svg>`;
    }

    function dotTrio() {
        return '<span class="il-dot-trio" aria-hidden="true"><span></span><span></span><span></span></span>';
    }

    function ensureShell() {
        if (!progressBar) {
            progressBar = document.createElement("div");
            progressBar.id = "il-progress-bar";
            progressBar.setAttribute("role", "progressbar");
            progressBar.setAttribute("aria-hidden", "true");
            document.body.appendChild(progressBar);
        }
        if (!fullscreenEl) {
            fullscreenEl = document.createElement("div");
            fullscreenEl.id = "il-fullscreen";
            fullscreenEl.setAttribute("role", "status");
            fullscreenEl.setAttribute("aria-live", "polite");
            fullscreenEl.setAttribute("aria-busy", "false");
            fullscreenEl.innerHTML = `${infinitySvg(144)}<span class="il-label">Loading…</span>`;
            fullscreenLabel = fullscreenEl.querySelector(".il-label");
            document.body.appendChild(fullscreenEl);
        }
    }

    function showFullscreen(label) {
        ensureShell();
        pendingCount += 1;
        if (fullscreenLabel) fullscreenLabel.textContent = label || "Loading…";
        fullscreenEl.setAttribute("aria-busy", "true");
        fullscreenEl.classList.add("il-visible");
    }

    function hideFullscreen() {
        pendingCount = Math.max(0, pendingCount - 1);
        if (pendingCount > 0 || !fullscreenEl) return;
        fullscreenEl.classList.remove("il-visible");
        fullscreenEl.setAttribute("aria-busy", "false");
    }

    function setButtonLoading(btn, loading, label) {
        if (!btn || btn.classList.contains("il-btn-loading") === loading) return;
        if (loading) {
            if (!btn.dataset.ilOriginalHtml) {
                btn.dataset.ilOriginalHtml = btn.innerHTML;
            }
            btn.classList.add("il-btn-loading");
            btn.disabled = true;
            btn.setAttribute("aria-busy", "true");
            const spinner = document.createElement("span");
            spinner.className = "il-btn-spinner";
            spinner.innerHTML = label ? `${dotTrio()} <span>${label}</span>` : dotTrio();
            const wrap = document.createElement("span");
            wrap.className = "il-btn-original";
            wrap.innerHTML = btn.dataset.ilOriginalHtml;
            wrap.style.display = "none";
            btn.innerHTML = "";
            btn.appendChild(wrap);
            btn.appendChild(spinner);
        } else {
            btn.classList.remove("il-btn-loading");
            btn.disabled = false;
            btn.removeAttribute("aria-busy");
            if (btn.dataset.ilOriginalHtml) {
                btn.innerHTML = btn.dataset.ilOriginalHtml;
            }
        }
    }

    async function track(promise, options) {
        const opts = options || {};
        const useFullscreen = opts.fullscreen !== false && (opts.fullscreen || pendingCount === 0);
        if (useFullscreen) showFullscreen(opts.label);
        try {
            return await promise;
        } finally {
            if (useFullscreen) hideFullscreen();
        }
    }

    async function fetchWithLoader(url, options, loaderOptions) {
        return track(fetch(url, options), loaderOptions);
    }

    function skeletonBar(w, cls) {
        return `<div class="il-skeleton il-sk-text ${cls || ""}" style="${w ? `width:${w}` : ""}"></div>`;
    }

    function skeletonTableRows(count, cols) {
        const n = count || 5;
        const c = cols || 5;
        const cells = Array.from({ length: c }, (_, i) =>
            `<div class="il-skeleton" style="flex:${i === 0 ? 2 : 1};height:14px"></div>`
        ).join("");
        return `<div class="il-sk-table-row">${cells}</div>`;
    }

    function skeletonTableBody(count, colspan) {
        const n = count || 5;
        const span = colspan || 7;
        return Array.from({ length: n }, () =>
            `<tr class="il-skeleton-tr"><td colspan="${span}">${skeletonTableRows(1, 5)}</td></tr>`
        ).join("");
    }

    function skeletonProductCards(count) {
        const n = count || 4;
        return Array.from({ length: n }, () => `
            <div class="il-sk-product-card il-sk-product-card--catalog">
                <div class="il-sk-product-img il-skeleton"></div>
                <div class="il-sk-product-body">
                    ${skeletonBar("72%")}
                    ${skeletonBar("58%")}
                    ${skeletonBar("42%")}
                    <div class="il-skeleton il-sk-btn il-sk-btn--wide"></div>
                </div>
            </div>`).join("");
    }

    function skeletonTeamCards(count) {
        const n = count || 3;
        return Array.from({ length: n }, () => `
            <div class="il-sk-team-card">
                <div class="il-sk-team-photo il-skeleton"></div>
                <div class="il-sk-team-body">
                    ${skeletonBar("55%")}
                    ${skeletonBar("40%")}
                    ${skeletonBar("80%")}
                </div>
            </div>`).join("");
    }

    function skeletonOrderCards(count) {
        const n = count || 3;
        return Array.from({ length: n }, () => `
            <div class="il-sk-card">
                ${skeletonBar("45%")}
                ${skeletonBar("65%")}
                <div class="il-skeleton il-sk-img" style="height:80px"></div>
                ${skeletonBar("30%")}
            </div>`).join("");
    }

    function skeletonOrderDetail() {
        return `<div class="il-sk-card" style="gap:1rem">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">
                ${Array.from({ length: 6 }, () => `<div class="il-skeleton" style="height:52px;border-radius:8px"></div>`).join("")}
            </div>
            ${Array.from({ length: 3 }, () => `
                <div style="display:flex;gap:.75rem;align-items:center">
                    <div class="il-skeleton il-sk-circle" style="width:48px;height:48px"></div>
                    <div style="flex:1;display:flex;flex-direction:column;gap:.4rem">
                        ${skeletonBar("60%")}${skeletonBar("40%")}
                    </div>
                </div>`).join("")}
            <div class="il-skeleton" style="height:48px;border-radius:8px"></div>
        </div>`;
    }

    function skeletonProductDetail() {
        const bar = (w, h) => `<div class="il-skeleton" style="height:${h || "14px"};width:${w};border-radius:8px"></div>`;
        const specLines = Array.from({ length: 4 }, () =>
            `<div class="il-sk-spec-block">${bar("42%")}${bar("88%")}${bar("72%")}</div>`
        ).join("");
        return `<div class="details-skeleton" aria-hidden="true">
            <div class="il-sk-details-head">
                <div class="il-sk-details-media il-skeleton"></div>
                <div class="il-sk-details-summary">
                    ${bar("70%", "28px")}
                    ${bar("55%", "18px")}
                    ${bar("45%", "22px")}
                    ${bar("38%", "16px")}
                    <div class="il-sk-btn-row">
                        <div class="il-skeleton il-sk-btn il-sk-btn--primary"></div>
                        <div class="il-skeleton il-sk-btn il-sk-btn--ghost"></div>
                    </div>
                </div>
            </div>
            <div class="il-sk-details-specs">
                ${bar("35%", "20px")}
                ${specLines}
            </div>
        </div>`;
    }

    function sectionLoading(label) {
        return `<div class="il-section-loading" role="status" aria-live="polite">
            <span class="il-mini-spin" aria-hidden="true"></span>
            <span>${label || "Loading…"}</span>
        </div>`;
    }

    function setContainerSkeleton(el, html) {
        if (!el) return;
        el.setAttribute("aria-busy", "true");
        el.innerHTML = html;
    }

    function clearContainerBusy(el) {
        if (!el) return;
        el.removeAttribute("aria-busy");
    }

    function enhanceImages(root) {
        const scope = root || document;
        scope.querySelectorAll("img:not([data-il-bound])").forEach((img) => {
            if (img.closest("#il-intro, #il-fullscreen")) return;
            img.dataset.ilBound = "1";
            if (img.complete && img.naturalWidth > 0) return;
            img.classList.add("il-loading");
            const onDone = () => {
                img.classList.remove("il-loading");
                img.classList.add("il-loaded");
            };
            img.addEventListener("load", onDone, { once: true });
            img.addEventListener("error", onDone, { once: true });
        });
    }

    function preloadImage(src) {
        return new Promise((resolve) => {
            if (!src) { resolve(); return; }
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = src;
        });
    }

    function waitForFonts() {
        if (!document.fonts || !document.fonts.ready) {
            return Promise.resolve();
        }
        return document.fonts.ready.catch(() => {});
    }

    const HERO_SEQUENCE_MS = 2600;

    function resetHeroEntranceState() {
        document.body.classList.remove("il-hero-intro", "il-hero-pending", "il-hero-ready", "il-hero-complete");
        const hero = document.querySelector(".hero");
        if (!hero) return;
        [hero, ...hero.querySelectorAll("*")].forEach((node) => {
            [...node.classList].forEach((cls) => {
                if (cls.startsWith("il-animate-")) node.classList.remove(cls);
            });
        });
    }

    function runHeroSequence() {
        const hero = document.querySelector(".hero");
        if (!hero) return;

        document.body.classList.remove("il-hero-pending", "il-hero-ready");
        hero.classList.add("il-animate-bg");

        const animate = (node, cls, delay) => {
            if (!node) return;
            const apply = () => node.classList.add(cls);
            if (REDUCED) {
                apply();
                return;
            }
            setTimeout(apply, delay);
        };

        const ctaClasses = ["il-animate-cta-left", "il-animate-cta-up", "il-animate-cta-right"];

        // Step 1 — background (0ms)
        // Step 2 — logo (100ms)
        animate(hero.querySelector(".hero-logo-image"), REDUCED ? "il-animate-fade" : "il-animate-logo", 100);

        // Eyebrow with headline group
        animate(hero.querySelector(".hero-eyebrow"), REDUCED ? "il-animate-fade" : "il-animate-eyebrow", 320);

        // Step 3 — headline (380ms)
        animate(hero.querySelector(".hero-company-name"), REDUCED ? "il-animate-fade" : "il-animate-headline", 380);

        // Step 4 — subtitle (560ms, ~180ms after headline)
        animate(hero.querySelector(".hero-subtitle"), REDUCED ? "il-animate-fade" : "il-animate-subtitle", 560);

        // Step 5 — description (700ms)
        animate(hero.querySelector(".hero-text"), REDUCED ? "il-animate-fade" : "il-animate-description", 700);

        // Step 6 — staggered CTAs (860ms+, 120ms apart)
        hero.querySelectorAll(".cta-buttons a").forEach((btn, i) => {
            animate(btn, REDUCED ? "il-animate-fade" : (ctaClasses[i] || "il-animate-fade"), 860 + i * 120);
        });

        // Step 7 — trust badges + scroll hint
        hero.querySelectorAll(".hero-trust-item").forEach((item, i) => {
            animate(item, REDUCED ? "il-animate-fade" : "il-animate-trust", 1280 + i * 90);
        });
        animate(hero.querySelector(".hero-scroll-hint"), REDUCED ? "il-animate-fade" : "il-animate-scroll", 1540);
    }

    function playHeroEntrance() {
        if (!IS_HOME) return;
        const hero = document.querySelector(".hero");
        if (!hero) return;

        resetHeroEntranceState();

        if (REDUCED) {
            document.body.classList.add("il-hero-intro");
            requestAnimationFrame(() => {
                runHeroSequence();
                setTimeout(() => {
                    document.body.classList.add("il-hero-complete");
                    document.body.classList.remove("il-hero-intro");
                }, 900);
            });
            return;
        }

        document.body.classList.add("il-hero-intro");

        requestAnimationFrame(() => {
            runHeroSequence();
            setTimeout(() => {
                document.body.classList.add("il-hero-complete");
                document.body.classList.remove("il-hero-intro");
            }, HERO_SEQUENCE_MS);
        });
    }

    function skipHeroIntro() {
        document.body.classList.remove("il-hero-intro", "il-hero-pending", "il-hero-ready");
        document.body.classList.add("il-hero-complete");
        runHeroSequence();
    }

    /** @deprecated use playHeroEntrance */
    function playHeroIntro() {
        playHeroEntrance();
    }

    function startPageEnter() {
        if (REDUCED) return;
        document.body.classList.add("il-page-enter");
    }

    function initPageTransitions() {
        if (REDUCED) return;
        document.addEventListener("click", (e) => {
            const a = e.target.closest("a[href]");
            if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
            const href = a.getAttribute("href");
            if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
            if (href.startsWith("http") && !href.includes(global.location.host)) return;
            if (!/\.html($|[?#])/.test(href) && !href.endsWith(".html")) {
                if (!href.match(/^\/[^/]+\.html/) && !href.match(/^\.\/?.+\.html/)) return;
            }
            ensureShell();
            progressBar.classList.remove("il-done");
            progressBar.classList.add("il-running");
        }, true);

        global.addEventListener("pageshow", () => {
            if (!progressBar) return;
            progressBar.classList.remove("il-running");
            progressBar.classList.add("il-done");
            setTimeout(() => progressBar.classList.remove("il-done"), 400);
        });
    }

    const InfinityLoader = {
        infinitySvg,
        dotTrio,
        showFullscreen,
        hideFullscreen,
        setButtonLoading,
        track,
        fetch: fetchWithLoader,
        skeletonTableRows,
        skeletonTableBody,
        skeletonProductCards,
        skeletonTeamCards,
        skeletonOrderCards,
        skeletonOrderDetail,
        skeletonProductDetail,
        sectionLoading,
        setContainerSkeleton,
        clearContainerBusy,
        enhanceImages,
        playHeroEntrance,
        skipHeroIntro,
        playHeroIntro,
        startPageEnter,
        initPageTransitions,
    };

    global.InfinityLoader = InfinityLoader;

    function fixCartDrawerMount() {
        document.querySelectorAll(".cart-sidebar").forEach((cart) => {
            if (cart.parentElement !== document.body) {
                document.body.appendChild(cart);
            }
        });
    }

    function boot() {
        ensureShell();
        fixCartDrawerMount();
        initPageTransitions();
        startPageEnter();
        enhanceImages();

        global.addEventListener("pageshow", (event) => {
            if (event.persisted && document.body.classList.contains("home-page")) {
                playHeroEntrance();
            }
        });

        if (IS_HOME) {
            playHeroEntrance();
        } else {
            document.body.classList.remove("il-hero-intro", "il-hero-pending", "il-hero-ready", "il-hero-complete");
        }

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((m) => {
                m.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) enhanceImages(node);
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})(window);
