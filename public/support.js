(function () {
    const CATEGORY_LABELS = {
        technical: "Technical Issue",
        billing: "Billing",
        product: "Product Question",
        complaint: "Complaint",
        suggestion: "Suggestion",
        account: "Account Issue",
        other: "Other",
    };
    const STATUS_LABELS = {
        open: "Open",
        in_progress: "In Progress",
        waiting_customer: "Waiting for You",
        resolved: "Resolved",
        closed: "Closed",
    };

    let categories = [];
    let tickets = [];
    let activeId = null;
    let activeTicket = null;
    let pollTimer = null;
    let joinedTicketId = null;
    let realtimeWired = false;

    const listEl = document.getElementById("ticket-list");
    const emptyEl = document.getElementById("ticket-empty");
    const viewEl = document.getElementById("ticket-view");
    const detailsPanel = document.getElementById("ticket-details-panel");
    const createForm = document.getElementById("create-form");

    const esc = (text) => (window.DomUtils ? DomUtils.esc(text) : String(text ?? ""));
    const formatDate = (value) => (window.DomUtils ? DomUtils.formatDate(value) : "—");
    const messageDomId = (message) => (window.SupportMessageUtils
        ? SupportMessageUtils.messageDomId(message)
        : (message?._id ? String(message._id) : ""));

    function showMsg(el, text, type) {
        el.textContent = text;
        el.className = `ap-msg visible ${type}`;
    }

    function isStaffRole(role) {
        return window.StaffRoles ? StaffRoles.isStaff(role) : ["employee", "manager", "primary", "technical"].includes(role);
    }

    function lastStaffName(messages) {
        const staff = [...(messages || [])].reverse().find((m) => isStaffRole(m.authorRole));
        return staff?.authorName || "Support Team";
    }

    async function ensureAuth() {
        const res = await fetch("/api/user", { credentials: "include" });
        if (!res.ok) { window.location.href = "/auth.html"; return false; }
        return true;
    }

    async function loadMeta() {
        const res = await fetch("/api/support/meta", { credentials: "include" });
        const data = await res.json();
        categories = data.categories || [];
        document.getElementById("ticket-category").innerHTML = categories
            .map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join("");
    }

    async function loadTickets() {
        if (window.InfinityLoader && !tickets.length) {
            listEl.innerHTML = `<div class="ap-empty">Loading…</div>`;
        }
        const res = await fetch("/api/support/tickets", { credentials: "include" });
        const data = await res.json();
        tickets = data.tickets || [];
        renderList();
    }

    function renderList() {
        if (!tickets.length) {
            listEl.innerHTML = `<div class="ap-empty">No tickets yet. Create one to get started.</div>`;
            return;
        }
        listEl.innerHTML = tickets.map((t) => `
            <button type="button" class="support-ticket-item ${activeId === t._id ? "active" : ""}" data-id="${t._id}">
                <strong>${esc(t.subject)}</strong>
                <small>${esc(t.ticketNumber)}</small>
                <span class="support-status-pill ${t.status}">${esc(STATUS_LABELS[t.status] || t.status)}</span>
            </button>
        `).join("");
        listEl.querySelectorAll("[data-id]").forEach((btn) => {
            btn.addEventListener("click", () => openTicket(btn.dataset.id));
        });
    }

    function renderTicketHeader(ticket) {
        document.getElementById("ticket-subject").textContent = ticket.subject;
        const staffName = lastStaffName(ticket.messages);
        const sub = document.getElementById("ticket-chat-sub");
        if (sub) {
            sub.textContent = `${ticket.ticketNumber} · ${CATEGORY_LABELS[ticket.category] || ticket.category} · ${STATUS_LABELS[ticket.status] || ticket.status}`;
        }
        if (detailsPanel) detailsPanel.hidden = false;
        document.getElementById("ticket-meta-grid").innerHTML = `
            <div class="ticket-meta-item"><label>Ticket #</label><span>${esc(ticket.ticketNumber)}</span></div>
            <div class="ticket-meta-item"><label>Category</label><span>${esc(CATEGORY_LABELS[ticket.category] || ticket.category)}</span></div>
            <div class="ticket-meta-item"><label>Status</label><span class="support-status-pill ${ticket.status}">${esc(STATUS_LABELS[ticket.status] || ticket.status)}</span></div>
            <div class="ticket-meta-item"><label>Assigned</label><span>${esc(staffName)}</span></div>
            <div class="ticket-meta-item"><label>Created</label><span>${formatDate(ticket.createdAt)}</span></div>
            <div class="ticket-meta-item"><label>Updated</label><span>${formatDate(ticket.updatedAt)}</span></div>
        `;
    }

    function fileUrl(raw) {
        if (!raw) return "";
        const s = String(raw);
        if (s.startsWith("http") || s.startsWith("data:")) return s;
        return s.startsWith("/") ? s : `/${s}`;
    }

    function renderAttachments(attachments) {
        if (!attachments?.length) return "";
        const items = attachments.map((att, i) => {
            const url = fileUrl(att.url || att.data);
            if (!url) return "";
            const name = esc(att.filename || `Attachment ${i + 1}`);
            if (att.mimeType?.startsWith("image/") || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)) {
                return `<a class="support-attach-thumb" href="${esc(url)}" target="_blank" rel="noopener" title="${name}"><img src="${esc(url)}" alt="${name}"></a>`;
            }
            return `<a class="support-attach-file" href="${esc(url)}" target="_blank" rel="noopener" download><i class="fas fa-paperclip"></i> ${name}</a>`;
        }).join("");
        return items ? `<div class="support-msg-attachments">${items}</div>` : "";
    }

    function renderMessageHtml(m) {
        const staff = isStaffRole(m.authorRole);
        const cls = staff ? "staff" : "user";
        const initial = (m.authorName || "U").charAt(0).toUpperCase();
        const time = formatDate(m.createdAt);
        const attachments = renderAttachments(m.attachments);
        return `<div class="support-msg ${cls}" data-msg-id="${esc(messageDomId(m))}">
            <div class="support-msg-avatar" aria-hidden="true">${esc(initial)}</div>
            <div>
                <div class="support-msg-meta"><strong>${esc(m.authorName || (staff ? "Staff" : "You"))}</strong><span>${time}</span></div>
                <div class="support-msg-body">${esc(m.body).replace(/\n/g, "<br>")}${attachments}</div>
            </div>
        </div>`;
    }

    function appendMessages(messages) {
        const chat = document.getElementById("ticket-chat");
        if (window.SupportMessageUtils) {
            return SupportMessageUtils.appendMessagesToChat(chat, messages, renderMessageHtml, { useRaf: true });
        }
        if (!chat || !messages?.length) return false;
        messages.forEach((m) => chat.insertAdjacentHTML("beforeend", renderMessageHtml(m)));
        chat.scrollTop = chat.scrollHeight;
        return true;
    }

    function mergeActiveTicketMessage(msg) {
        if (!activeTicket || !msg) return;
        if (!Array.isArray(activeTicket.messages)) activeTicket.messages = [];
        const key = messageDomId(msg);
        if (!activeTicket.messages.some((m) => messageDomId(m) === key)) {
            activeTicket.messages.push(msg);
        }
    }

    function upsertTicketInList(payload) {
        const ticketId = String(payload.ticketId);
        const entry = {
            _id: ticketId,
            ticketNumber: payload.ticketNumber,
            subject: payload.subject,
            status: payload.status,
            updatedAt: payload.updatedAt,
        };
        const idx = tickets.findIndex((t) => String(t._id) === ticketId);
        if (idx >= 0) {
            tickets[idx] = { ...tickets[idx], ...entry };
            const [row] = tickets.splice(idx, 1);
            tickets.unshift(row);
        } else {
            tickets.unshift(entry);
        }
        renderList();
    }

    function handleRealtimeTicketMessage(payload) {
        upsertTicketInList(payload);
        if (String(activeId) !== String(payload.ticketId)) return;
        if (payload.status) {
            activeTicket.status = payload.status;
            renderTicketHeader(activeTicket);
            const closed = payload.status === "closed" || payload.status === "resolved";
            document.getElementById("reply-form").style.display = closed ? "none" : "";
        }
        if (payload.message) {
            mergeActiveTicketMessage(payload.message);
            appendMessages([payload.message]);
        }
    }

    function handleRealtimeTicketUpdated(payload) {
        upsertTicketInList(payload);
        if (String(activeId) !== String(payload.ticketId)) return;
        activeTicket.status = payload.status;
        renderTicketHeader(activeTicket);
        const closed = payload.status === "closed" || payload.status === "resolved";
        document.getElementById("reply-form").style.display = closed ? "none" : "";
    }

    function wireRealtime() {
        if (realtimeWired || !window.RealtimeClient) return;
        realtimeWired = true;
        RealtimeClient.connect();
        RealtimeClient.on("ticketMessage", handleRealtimeTicketMessage);
        RealtimeClient.on("ticketUpdated", handleRealtimeTicketUpdated);
        RealtimeClient.on("__connect", () => stopPolling());
        RealtimeClient.on("__disconnect", () => startPolling());
    }

    function renderChat(ticket) {
        const chat = document.getElementById("ticket-chat");
        chat.innerHTML = (ticket.messages || []).map((m) => renderMessageHtml(m)).join("");
        requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
    }

    function startPolling() {
        stopPolling();
        if (window.RealtimeClient?.isConnected?.()) return;
        pollTimer = setInterval(async () => {
            if (!activeId) return;
            const res = await fetch(`/api/support/tickets/${activeId}`, { credentials: "include" });
            if (!res.ok) return;
            const { ticket } = await res.json();
            const prevCount = activeTicket?.messages?.length || 0;
            const nextCount = ticket.messages?.length || 0;
            if (ticket.status !== activeTicket?.status || nextCount !== prevCount) {
                activeTicket = ticket;
                renderTicketHeader(ticket);
                if (nextCount > prevCount) appendMessages(ticket.messages.slice(prevCount));
                else renderChat(ticket);
            }
        }, 12000);
    }

    function stopPolling() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
    }

    function setPanelMode(mode) {
        const viewing = mode === "view";
        const creating = mode === "create";
        const idle = mode === "idle";

        viewEl.hidden = !viewing;
        createForm.hidden = !creating;
        emptyEl.hidden = !idle;
        if (detailsPanel) detailsPanel.hidden = !viewing;

        if (!viewing) {
            activeTicket = null;
            document.getElementById("ticket-subject").textContent = "";
            const sub = document.getElementById("ticket-chat-sub");
            if (sub) sub.textContent = "";
            document.getElementById("ticket-chat").innerHTML = "";
            document.getElementById("ticket-meta-grid").innerHTML = "";
        }

        if (!creating) {
            createForm.reset();
            const createMsg = document.getElementById("create-msg");
            if (createMsg) {
                createMsg.textContent = "";
                createMsg.className = "ap-msg";
            }
        }
    }

    async function openTicket(id) {
        stopPolling();
        if (window.RealtimeClient) {
            if (joinedTicketId && joinedTicketId !== id) RealtimeClient.leaveTicket(joinedTicketId);
            RealtimeClient.joinTicket(id);
            joinedTicketId = id;
        }
        activeId = id;
        setPanelMode("view");
        const res = await fetch(`/api/support/tickets/${id}`, { credentials: "include" });
        if (!res.ok) return;
        const { ticket } = await res.json();
        activeTicket = ticket;
        renderTicketHeader(ticket);
        renderChat(ticket);
        renderList();
        const closed = ticket.status === "closed" || ticket.status === "resolved";
        document.getElementById("reply-form").style.display = closed ? "none" : "";
        if (!window.RealtimeClient?.isConnected?.()) startPolling();
    }

    document.getElementById("new-ticket-btn").addEventListener("click", () => {
        stopPolling();
        activeId = null;
        activeTicket = null;
        createForm.reset();
        setPanelMode("create");
        renderList();
        createForm.querySelector("#ticket-subject-input")?.focus();
    });

    document.getElementById("cancel-create").addEventListener("click", () => {
        stopPolling();
        activeId = null;
        activeTicket = null;
        setPanelMode("idle");
        renderList();
    });

    function readFilesAsAttachments(fileList) {
        const files = Array.from(fileList || []).slice(0, 3);
        return Promise.all(files.map((file) => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ data: reader.result });
            reader.onerror = reject;
            reader.readAsDataURL(file);
        })));
    }

    createForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const msg = document.getElementById("create-msg");
        const btn = createForm.querySelector('[type="submit"]');
        if (window.InfinityLoader) InfinityLoader.setButtonLoading(btn, true);
        try {
            const attachments = await readFilesAsAttachments(document.getElementById("ticket-attachments").files);
            const res = await fetch("/api/support/tickets", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    subject: document.getElementById("ticket-subject-input").value.trim(),
                    category: document.getElementById("ticket-category").value,
                    description: document.getElementById("ticket-description").value.trim(),
                    attachments,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed");
            createForm.hidden = true;
            createForm.reset();
            await loadTickets();
            openTicket(data.ticket._id);
        } catch (err) {
            showMsg(msg, err.message, "error");
        } finally {
            if (window.InfinityLoader) InfinityLoader.setButtonLoading(btn, false);
        }
    });

    document.getElementById("reply-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!activeId) return;
        const msg = document.getElementById("reply-msg");
        const body = document.getElementById("reply-body").value.trim();
        const fileInput = document.getElementById("reply-attachments");
        let attachments = [];
        if (fileInput?.files?.length) {
            attachments = await readFilesAsAttachments(fileInput.files);
        }
        const res = await fetch(`/api/support/tickets/${activeId}/reply`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body, attachments }),
        });
        const data = await res.json();
        if (!res.ok) { showMsg(msg, data.error || "Failed", "error"); return; }
        document.getElementById("reply-body").value = "";
        if (fileInput) fileInput.value = "";
        showMsg(msg, "Reply sent.", "success");
        if (data.ticket) {
            activeTicket = data.ticket;
            const lastMsg = (data.ticket.messages || []).slice(-1)[0];
            if (lastMsg) appendMessages([lastMsg]);
            upsertTicketInList({
                ticketId: data.ticket._id,
                ticketNumber: data.ticket.ticketNumber,
                subject: data.ticket.subject,
                status: data.ticket.status,
                updatedAt: data.ticket.updatedAt,
            });
        } else {
            await loadTickets();
            await openTicket(activeId);
        }
        if (window.InfinityNotifications) InfinityNotifications.refreshBadges();
    });

    document.getElementById("close-ticket-btn").addEventListener("click", async () => {
        if (!activeId) return;
        await fetch(`/api/support/tickets/${activeId}/close`, { method: "POST", credentials: "include" });
        await loadTickets();
        await openTicket(activeId);
    });

    window.addEventListener("beforeunload", stopPolling);

    (async () => {
        if (!(await ensureAuth())) return;
        wireRealtime();
        await loadMeta();
        await loadTickets();
        const q = new URLSearchParams(location.search).get("ticket");
        if (q) openTicket(q);
        if (window.InfinityNotifications) InfinityNotifications.refreshBadges();
    })();
})();
