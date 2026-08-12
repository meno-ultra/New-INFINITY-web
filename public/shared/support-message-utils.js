(function (global) {
    if (global.SupportMessageUtils) return;

    function messageDomId(message) {
        if (!message) return "";
        return message._id
            ? String(message._id)
            : `${message.createdAt || ""}|${String(message.body || "").slice(0, 48)}`;
    }

    function chatWasAtBottom(chatEl, threshold = 48) {
        if (!chatEl) return true;
        return chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight < threshold;
    }

    /**
     * Append messages without duplicating entries already rendered in the chat.
     * @param {HTMLElement} chatEl
     * @param {Array} messages
     * @param {(message: object) => string} renderHtml
     * @param {{ useRaf?: boolean, prevScroll?: number }} options
     */
    function appendMessagesToChat(chatEl, messages, renderHtml, options = {}) {
        if (!chatEl || !messages?.length || typeof renderHtml !== "function") return false;

        const existing = new Set(
            [...chatEl.querySelectorAll("[data-msg-id]")].map((el) => el.getAttribute("data-msg-id"))
        );
        const wasAtBottom = chatWasAtBottom(chatEl);
        const prevScroll = typeof options.prevScroll === "number" ? options.prevScroll : chatEl.scrollTop;
        let appended = false;

        messages.forEach((message) => {
            const id = messageDomId(message);
            if (!id || existing.has(id)) return;
            chatEl.insertAdjacentHTML("beforeend", renderHtml(message));
            existing.add(id);
            appended = true;
        });

        if (appended && wasAtBottom) {
            if (options.useRaf) {
                requestAnimationFrame(() => { chatEl.scrollTop = chatEl.scrollHeight; });
            } else {
                chatEl.scrollTop = chatEl.scrollHeight;
            }
        } else if (!appended) {
            chatEl.scrollTop = prevScroll;
        }

        return appended;
    }

    global.SupportMessageUtils = {
        messageDomId,
        chatWasAtBottom,
        appendMessagesToChat,
    };
})(window);
