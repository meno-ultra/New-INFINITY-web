/**
 * Legal / policy pages — smooth TOC navigation + active section highlight
 */
(function initLegalPages() {
    "use strict";

    const toc = document.querySelector(".legal-toc");
    if (!toc) return;

    const links = [...toc.querySelectorAll('a[href^="#"]')];
    if (!links.length) return;

    const pairs = links
        .map((link) => {
            const id = link.getAttribute("href").slice(1);
            const section = document.getElementById(id);
            return section ? { link, section } : null;
        })
        .filter(Boolean);

    if (!pairs.length) return;

    links.forEach((link) => {
        link.addEventListener("click", (e) => {
            const href = link.getAttribute("href");
            if (!href || href === "#") return;
            const target = document.querySelector(href);
            if (!target) return;
            e.preventDefault();
            target.scrollIntoView({ behavior: "smooth", block: "start" });
            history.replaceState(null, "", href);
        });
    });

    const setActive = (id) => {
        links.forEach((link) => {
            link.classList.toggle("is-active", link.getAttribute("href") === `#${id}`);
        });
    };

    if ("IntersectionObserver" in window) {
        const visible = new Map();
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    visible.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
                });
                let bestId = null;
                let bestRatio = 0;
                visible.forEach((ratio, sectionId) => {
                    if (ratio > bestRatio) {
                        bestRatio = ratio;
                        bestId = sectionId;
                    }
                });
                if (bestId) setActive(bestId);
            },
            { rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.15, 0.35, 0.55, 0.75, 1] }
        );
        pairs.forEach(({ section }) => observer.observe(section));
    }
})();
