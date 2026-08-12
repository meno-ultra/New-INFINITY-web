(function (global) {
    if (global.DomUtils) return;

    function esc(text) {
        return String(text ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function formatDate(value) {
        if (!value) return "—";
        return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    }

    global.DomUtils = { esc, formatDate };
})(window);
