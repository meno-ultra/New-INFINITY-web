(function (global) {
    const EVENTS = [
        "ticketCreated",
        "ticketMessage",
        "ticketUpdated",
        "identitySubmitted",
        "identityUpdated",
        "newOrder",
        "orderUpdated",
        "customerUpdated",
        "productUpdated",
        "userCreated",
        "userUpdated",
    ];

    let socket = null;
    let connected = false;
    let wired = false;
    const handlers = new Map();

    function on(event, fn) {
        if (!handlers.has(event)) handlers.set(event, new Set());
        handlers.get(event).add(fn);
        return () => handlers.get(event)?.delete(fn);
    }

    function dispatch(event, data) {
        handlers.get(event)?.forEach((fn) => {
            try {
                fn(data);
            } catch (_err) {
                /* ignore handler errors */
            }
        });
    }

    function wireSocketEvents(sock) {
        if (wired) return;
        wired = true;
        EVENTS.forEach((event) => {
            sock.on(event, (data) => dispatch(event, data));
        });
        sock.on("connect", () => {
            connected = true;
            dispatch("__connect", null);
        });
        sock.on("disconnect", () => {
            connected = false;
            dispatch("__disconnect", null);
        });
    }

    function connect() {
        if (socket) return socket;
        if (typeof global.io !== "function") return null;
        socket = global.io({
            withCredentials: true,
            transports: ["websocket", "polling"],
            reconnection: true,
            reconnectionDelayMax: 10000,
        });
        wireSocketEvents(socket);
        return socket;
    }

    function joinTicket(ticketId) {
        if (ticketId) socket?.emit("ticket:join", String(ticketId));
    }

    function leaveTicket(ticketId) {
        if (ticketId) socket?.emit("ticket:leave", String(ticketId));
    }

    function disconnect() {
        if (socket) {
            socket.removeAllListeners();
            socket.disconnect();
            socket = null;
            wired = false;
            connected = false;
        }
    }

    global.RealtimeClient = {
        connect,
        on,
        joinTicket,
        leaveTicket,
        disconnect,
        isConnected: () => connected,
    };
})(window);
