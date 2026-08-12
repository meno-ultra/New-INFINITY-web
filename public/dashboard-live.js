(function (global) {
    const POLL_MS = 45000;
    const FALLBACK_POLL_MS = 15000;
    let timer = null;
    let onVisibility = null;
    let onUnload = null;
    let realtimeWired = false;

    function tick() {
        if (typeof global.DashLiveSync?.refreshAll === "function") {
            void global.DashLiveSync.refreshAll();
        }
    }

    function startPolling(intervalMs) {
        if (timer) clearInterval(timer);
        timer = setInterval(tick, intervalMs || POLL_MS);
    }

    function stopPolling() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }

    function wireRealtime() {
        if (realtimeWired || !global.RealtimeClient) return;
        realtimeWired = true;
        RealtimeClient.connect();

        RealtimeClient.on("newOrder", () => DashLiveSync?.refreshSection?.("orders"));
        RealtimeClient.on("orderUpdated", () => DashLiveSync?.refreshSection?.("orders"));
        RealtimeClient.on("customerUpdated", () => DashLiveSync?.refreshSection?.("customers"));
        RealtimeClient.on("productUpdated", () => DashLiveSync?.refreshSection?.("products"));
        RealtimeClient.on("userCreated", () => DashLiveSync?.refreshSection?.("users"));
        RealtimeClient.on("userUpdated", () => DashLiveSync?.refreshSection?.("users"));
        RealtimeClient.on("identitySubmitted", () => {
            DashLiveSync?.refreshSection?.("identity");
            DashLiveSync?.refreshSection?.("customers");
        });
        RealtimeClient.on("identityUpdated", () => {
            DashLiveSync?.refreshSection?.("identity");
            DashLiveSync?.refreshSection?.("customers");
        });

        RealtimeClient.on("__connect", () => {
            stopPolling();
            startPolling(POLL_MS);
        });
        RealtimeClient.on("__disconnect", () => {
            stopPolling();
            startPolling(FALLBACK_POLL_MS);
            tick();
        });
    }

    function start() {
        stop();
        wireRealtime();
        if (RealtimeClient?.isConnected?.()) {
            startPolling(POLL_MS);
        } else {
            startPolling(FALLBACK_POLL_MS);
        }
        onVisibility = () => {
            if (!document.hidden) tick();
        };
        onUnload = () => stop();
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("beforeunload", onUnload);
    }

    function stop() {
        stopPolling();
        if (onVisibility) {
            document.removeEventListener("visibilitychange", onVisibility);
            onVisibility = null;
        }
        if (onUnload) {
            window.removeEventListener("beforeunload", onUnload);
            onUnload = null;
        }
    }

    global.DashboardLive = { start, stop, POLL_MS };
})(window);
