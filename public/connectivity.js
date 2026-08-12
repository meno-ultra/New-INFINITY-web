(function initInfinityConnectivity() {
    if (window.__infinityConnectivityInit) return;
    window.__infinityConnectivityInit = true;

    const style = document.createElement("style");
    style.textContent = `
        .connectivity-banner,
        .connectivity-toast {
            position: fixed;
            left: 50%;
            transform: translateX(-50%) translateY(-120%);
            z-index: 100000;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.55rem;
            max-width: min(520px, calc(100vw - 1.5rem));
            padding: 0.7rem 1rem;
            border-radius: 12px;
            font-family: 'Poppins', system-ui, -apple-system, sans-serif;
            font-size: 0.88rem;
            font-weight: 600;
            line-height: 1.35;
            text-align: center;
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.18);
            opacity: 0;
            pointer-events: none;
            transition: transform 0.32s ease, opacity 0.32s ease;
        }
        .connectivity-banner.is-visible,
        .connectivity-toast.is-visible {
            opacity: 1;
            pointer-events: auto;
        }
        .connectivity-banner {
            top: max(0.65rem, env(safe-area-inset-top));
        }
        .connectivity-banner.is-visible {
            transform: translateX(-50%) translateY(0);
        }
        .connectivity-banner--offline {
            background: #991b1b;
            color: #fff;
            border: 1px solid #b91c1c;
        }
        .connectivity-toast {
            bottom: max(1rem, env(safe-area-inset-bottom));
            transform: translateX(-50%) translateY(120%);
        }
        .connectivity-toast.is-visible {
            transform: translateX(-50%) translateY(0);
        }
        .connectivity-toast--online {
            background: #065f46;
            color: #ecfdf5;
            border: 1px solid #047857;
        }
        .connectivity-icon {
            flex-shrink: 0;
            font-size: 1rem;
            line-height: 1;
        }
        html.is-offline {
            scroll-padding-top: 3.5rem;
        }
    `;
    document.head.appendChild(style);

    let offlineBanner = null;
    let onlineToastTimer = null;
    let wasOffline = false;

    function offlineIcon() {
        return '<span class="connectivity-icon" aria-hidden="true">📡</span>';
    }

    function onlineIcon() {
        return '<span class="connectivity-icon" aria-hidden="true">✓</span>';
    }

    function ensureOfflineBanner() {
        if (offlineBanner) return offlineBanner;
        offlineBanner = document.createElement("div");
        offlineBanner.className = "connectivity-banner connectivity-banner--offline";
        offlineBanner.setAttribute("role", "alert");
        offlineBanner.setAttribute("aria-live", "assertive");
        offlineBanner.innerHTML = `${offlineIcon()}<span class="connectivity-message"></span>`;
        document.body.appendChild(offlineBanner);
        return offlineBanner;
    }

    function showOffline() {
        const banner = ensureOfflineBanner();
        banner.querySelector(".connectivity-message").textContent =
            "You are offline. Check your internet connection.";
        banner.classList.add("is-visible");
        document.documentElement.classList.add("is-offline");
        wasOffline = true;
    }

    function hideOffline() {
        if (offlineBanner) offlineBanner.classList.remove("is-visible");
        document.documentElement.classList.remove("is-offline");
    }

    function showBackOnline() {
        const toast = document.createElement("div");
        toast.className = "connectivity-toast connectivity-toast--online";
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        toast.innerHTML = `${onlineIcon()}<span>You are back online.</span>`;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add("is-visible");
        });

        clearTimeout(onlineToastTimer);
        onlineToastTimer = setTimeout(() => {
            toast.classList.remove("is-visible");
            setTimeout(() => toast.remove(), 350);
        }, 4000);
    }

    function handleOnline() {
        hideOffline();
        if (wasOffline) {
            wasOffline = false;
            showBackOnline();
        }
    }

    function handleOffline() {
        showOffline();
    }

    function start() {
        if (!navigator.onLine) showOffline();

        window.addEventListener("offline", handleOffline);
        window.addEventListener("online", handleOnline);
    }

    if (document.body) {
        start();
    } else {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    }
})();
