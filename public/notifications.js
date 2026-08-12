(function (global) {
    if (global.InfinityNotifications) return;

    async function fetchUnreadCount() {
        try {
            const res = await fetch("/api/notifications/unread-count", { credentials: "include" });
            if (!res.ok) return 0;
            const data = await res.json();
            const count = Number(data.unreadCount);
            return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
        } catch (_e) {
            return 0;
        }
    }

    function setBadge(host, count) {
        let badge = host.querySelector(".notif-badge");
        if (count <= 0) {
            if (badge) badge.remove();
            host.removeAttribute("aria-label");
            return;
        }
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "notif-badge visible";
            badge.setAttribute("aria-hidden", "true");
            host.appendChild(badge);
        }
        badge.textContent = count > 99 ? "99+" : String(count);
        badge.classList.add("visible");
        const label = host.querySelector(".home-account-toggle-label")?.textContent?.trim()
            || host.textContent.trim().split("\n")[0];
        host.setAttribute("aria-label", `${label} (${count} unread notification${count === 1 ? "" : "s"})`);
    }

    async function refreshBadges() {
        const count = await fetchUnreadCount();
        document.querySelectorAll("[data-notif-badge]").forEach((el) => {
            setBadge(el, count);
        });
    }

    global.InfinityNotifications = { refreshBadges, fetchUnreadCount };
})(window);
