(function (global) {
    if (global.DashboardExtensions) return;

    const STAFF_ROLES = global.StaffRoles?.SUPPORT || ["employee", "manager", "primary"];

    function canStaffSupport(role) {
        return global.StaffRoles ? StaffRoles.canStaffSupport(role) : STAFF_ROLES.includes(role);
    }

    const esc = (text) => (global.DomUtils ? DomUtils.esc(text) : String(text ?? ""));
    const formatDate = (value) => (global.DomUtils ? DomUtils.formatDate(value) : "—");
    const messageDomId = (message) => (global.SupportMessageUtils
        ? SupportMessageUtils.messageDomId(message)
        : (message?._id ? String(message._id) : ""));

    function fileUrl(raw) {
        if (!raw) return "";
        const s = String(raw);
        if (s.startsWith("http") || s.startsWith("data:")) return s;
        return s.startsWith("/") ? s : `/${s}`;
    }

    function isImageMime(mime, url) {
        if (mime?.startsWith("image/")) return true;
        return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url || "");
    }

    function isPdfMime(mime, url) {
        if (mime === "application/pdf") return true;
        return /\.pdf(\?|$)/i.test(url || "");
    }

    function readFilesAsAttachments(fileList) {
        const files = Array.from(fileList || []).slice(0, 3);
        return Promise.all(files.map((file) => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ data: reader.result });
            reader.onerror = reject;
            reader.readAsDataURL(file);
        })));
    }

    function renderMessageAttachments(attachments) {
        if (!attachments?.length) return "";
        const items = attachments.map((att, i) => {
            const url = fileUrl(att.url || att.data);
            if (!url) return "";
            const name = esc(att.filename || `Attachment ${i + 1}`);
            if (isImageMime(att.mimeType, url)) {
                return `<a class="dash-attach-thumb" href="${esc(url)}" target="_blank" rel="noopener" title="${name}">
                    <img src="${esc(url)}" alt="${name}">
                </a>`;
            }
            if (isPdfMime(att.mimeType, url)) {
                return `<a class="dash-attach-file" href="${esc(url)}" target="_blank" rel="noopener"><i class="fas fa-file-pdf"></i> ${name}</a>`;
            }
            return `<a class="dash-attach-file" href="${esc(url)}" target="_blank" rel="noopener" download><i class="fas fa-paperclip"></i> ${name}</a>`;
        }).join("");
        return items ? `<div class="dash-msg-attachments">${items}</div>` : "";
    }

    const DOC_LABELS = {
        national_id_front: "National ID (Front)",
        national_id_back: "National ID (Back)",
        driving_license_front: "Driving License (Front)",
        driving_license_back: "Driving License (Back)",
        commercial_register: "Commercial Register",
        tax_card: "Tax Card",
        company_license: "Company Logo",
    };

    function docViewUrl(userId, docType) {
        return `/api/dashboard/verification/document?userId=${encodeURIComponent(userId)}&docType=${encodeURIComponent(docType)}`;
    }

    function renderDocPreview(userId, doc) {
        const src = docViewUrl(userId, doc.type);
        const label = esc(DOC_LABELS[doc.type] || doc.type);
        const uploaded = doc.uploadedAt ? `<small class="muted">Uploaded ${formatDate(doc.uploadedAt)}</small>` : "";
        if (isImageMime(doc.mimeType, doc.url)) {
            return `<a class="dash-doc-preview" href="${esc(src)}" target="_blank" rel="noopener">
                <img src="${esc(src)}" alt="${label}">
            </a>`;
        }
        if (isPdfMime(doc.mimeType, doc.url)) {
            return `<a class="dash-doc-preview dash-doc-pdf" href="${esc(src)}" target="_blank" rel="noopener">
                <i class="fas fa-file-pdf"></i><span>PDF</span>
            </a>`;
        }
        return `<a class="dash-doc-preview dash-doc-file" href="${esc(src)}" target="_blank" rel="noopener">
            <i class="fas fa-file"></i><span>File</span>
        </a>`;
    }

    let supportTickets = [];
    let activeSupportId = null;
    let cachedActiveTicket = null;
    let joinedTicketId = null;
    let verificationUsers = [];
    let activeVerificationId = null;
    let supportRealtimeWired = false;

    function renderSupportMessageHtml(m) {
        const staffRoles = global.StaffRoles?.ALL || STAFF_ROLES.concat(["technical"]);
        const staff = staffRoles.includes(m.authorRole);
        const cls = staff ? "staff" : "user";
        const attachments = renderMessageAttachments(m.attachments);
        const time = formatDate(m.createdAt);
        return `<div class="dash-support-msg ${cls}" data-msg-id="${esc(messageDomId(m))}">
            <div class="dash-support-msg-head"><strong>${esc(m.authorName || (staff ? "Staff" : "Customer"))}</strong><span>${time}</span></div>
            <div class="dash-support-msg-body">${esc(m.body).replace(/\n/g, "<br>")}${attachments}</div>
        </div>`;
    }

    function appendSupportMessages(messages) {
        const chat = document.getElementById("dash-support-chat");
        if (global.SupportMessageUtils) {
            const prevScroll = chat?.scrollTop || 0;
            return SupportMessageUtils.appendMessagesToChat(
                chat,
                messages,
                renderSupportMessageHtml,
                { prevScroll }
            );
        }
        if (!chat || !messages?.length) return false;
        messages.forEach((m) => chat.insertAdjacentHTML("beforeend", renderSupportMessageHtml(m)));
        chat.scrollTop = chat.scrollHeight;
        return true;
    }

    function mergeMessageIntoCache(msg) {
        if (!cachedActiveTicket || !msg) return;
        if (!Array.isArray(cachedActiveTicket.messages)) cachedActiveTicket.messages = [];
        const key = messageDomId(msg);
        if (!cachedActiveTicket.messages.some((m) => messageDomId(m) === key)) {
            cachedActiveTicket.messages.push(msg);
        }
    }

    function patchActiveTicketStatus(status) {
        if (!status) return;
        const statusSelect = document.getElementById("dash-support-status-select");
        if (statusSelect && document.activeElement !== statusSelect) {
            statusSelect.value = status;
        }
    }

    function ticketMatchesListFilters(t) {
        const status = document.getElementById("dash-support-status")?.value || "";
        const category = document.getElementById("dash-support-category")?.value || "";
        const search = document.getElementById("dash-support-search")?.value?.trim().toLowerCase() || "";
        if (status && t.status !== status) return false;
        if (category && t.category !== category) return false;
        if (search) {
            const hay = `${t.subject || ""} ${t.ticketNumber || ""} ${t.customer?.name || ""} ${t.customer?.email || ""}`.toLowerCase();
            if (!hay.includes(search)) return false;
        }
        return true;
    }

    function upsertSupportTicketInList(payload) {
        const ticketId = String(payload.ticketId);
        const entry = {
            _id: ticketId,
            ticketNumber: payload.ticketNumber,
            subject: payload.subject,
            category: payload.category,
            status: payload.status,
            updatedAt: payload.updatedAt,
            createdAt: payload.createdAt,
            customer: payload.customer || null,
        };
        const idx = supportTickets.findIndex((t) => String(t._id) === ticketId);
        if (idx >= 0) {
            if (!ticketMatchesListFilters(entry)) {
                supportTickets.splice(idx, 1);
                renderSupportList();
                return;
            }
            supportTickets[idx] = { ...supportTickets[idx], ...entry };
            const [row] = supportTickets.splice(idx, 1);
            supportTickets.unshift(row);
        } else if (ticketMatchesListFilters(entry)) {
            supportTickets.unshift(entry);
        } else {
            return;
        }
        renderSupportList();
    }

    function handleRealtimeTicketCreated(payload) {
        if (!ticketMatchesListFilters(payload)) return;
        upsertSupportTicketInList(payload);
    }

    function handleRealtimeTicketMessage(payload) {
        upsertSupportTicketInList(payload);
        if (String(activeSupportId) !== String(payload.ticketId)) return;
        if (payload.status && cachedActiveTicket) cachedActiveTicket.status = payload.status;
        patchActiveTicketStatus(payload.status);
        if (payload.message) {
            mergeMessageIntoCache(payload.message);
            appendSupportMessages([payload.message]);
        } else {
            refreshActiveSupportTicket({ silent: true });
        }
    }

    function handleRealtimeTicketUpdated(payload) {
        upsertSupportTicketInList(payload);
        if (String(activeSupportId) !== String(payload.ticketId)) return;
        if (cachedActiveTicket) cachedActiveTicket.status = payload.status;
        patchActiveTicketStatus(payload.status);
        const replyForm = document.getElementById("dash-support-reply-form");
        if (replyForm) {
            const closed = payload.status === "closed" || payload.status === "resolved";
            replyForm.style.display = closed ? "none" : "";
        }
    }

    function wireSupportRealtime() {
        if (supportRealtimeWired || !global.RealtimeClient) return;
        supportRealtimeWired = true;
        RealtimeClient.connect();
        RealtimeClient.on("ticketCreated", handleRealtimeTicketCreated);
        RealtimeClient.on("ticketMessage", handleRealtimeTicketMessage);
        RealtimeClient.on("ticketUpdated", handleRealtimeTicketUpdated);
    }

    function renderSupportChat(ticket) {
        const chat = document.getElementById("dash-support-chat");
        if (!chat) return;
        const wasAtBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 48;
        const prevScroll = chat.scrollTop;
        chat.innerHTML = (ticket.messages || []).map((m) => renderSupportMessageHtml(m)).join("");
        if (wasAtBottom) chat.scrollTop = chat.scrollHeight;
        else chat.scrollTop = prevScroll;
    }

    async function loadSupportTickets(options = {}) {
        const { silent = false } = options;
        const status = document.getElementById("dash-support-status")?.value || "";
        const category = document.getElementById("dash-support-category")?.value || "";
        const search = document.getElementById("dash-support-search")?.value?.trim() || "";
        const params = new URLSearchParams();
        if (status) params.set("status", status);
        if (category) params.set("category", category);
        if (search) params.set("search", search);
        const list = document.getElementById("dash-support-list");
        if (!silent && list && window.InfinityLoader) {
            list.innerHTML = `<div class="muted" style="padding:1rem;">Loading…</div>`;
        }
        const res = await fetch(`/api/dashboard/support/tickets?${params}`, { credentials: "include" });
        const data = await res.json();
        supportTickets = data.tickets || [];
        renderSupportList();
    }

    function renderSupportList() {
        const list = document.getElementById("dash-support-list");
        if (!list) return;
        if (!supportTickets.length) {
            list.innerHTML = `<div class="muted" style="padding:1rem;text-align:center;">No tickets found.</div>`;
            return;
        }
        list.innerHTML = supportTickets.map((t) => `
            <button type="button" class="ap-ticket-item dash-support-item${t._id === activeSupportId ? " is-active" : ""}" data-id="${t._id}" style="width:100%;text-align:left;">
                <strong>${esc(t.subject)}</strong><br>
                <small class="muted">${esc(t.ticketNumber)} · ${esc((t.status || "").replace(/_/g, " "))} · ${esc(t.customer?.name || t.customer?.email || "Customer")}</small>
            </button>
        `).join("");
        list.querySelectorAll("[data-id]").forEach((btn) => {
            btn.addEventListener("click", () => openSupportTicket(btn.dataset.id));
        });
    }

    async function refreshActiveSupportTicket(options = {}) {
        if (!activeSupportId) return;
        const detail = document.getElementById("dash-support-detail");
        if (detail?.hidden) return;
        const replyEl = document.getElementById("dash-support-reply-body");
        if (replyEl && document.activeElement === replyEl && replyEl.value.trim()) return;

        const res = await fetch(`/api/dashboard/support/tickets/${activeSupportId}`, { credentials: "include" });
        if (!res.ok) return;
        const { ticket, customer } = await res.json();
        const prevCount = cachedActiveTicket?.messages?.length || 0;
        const msgCount = (ticket.messages || []).length;
        const statusChanged = cachedActiveTicket?.status !== ticket.status;
        const subjectChanged = cachedActiveTicket?.subject !== ticket.subject;

        if (subjectChanged) {
            document.getElementById("dash-support-subject").textContent = ticket.subject;
        }
        if (statusChanged) {
            const statusSelect = document.getElementById("dash-support-status-select");
            if (statusSelect && document.activeElement !== statusSelect) {
                statusSelect.value = ticket.status;
            }
        }
        if (customer) {
            document.getElementById("dash-support-customer").innerHTML =
                `<strong>${esc(customer.name)}</strong> · ${esc(customer.email)} · ${esc(customer.phone || "-")} · ${esc(customer.accountType || "personal")}`;
        }
        if (msgCount !== prevCount || !cachedActiveTicket) {
            renderSupportChat(ticket);
        }
        cachedActiveTicket = ticket;
    }

    async function openSupportTicket(id) {
        if (global.RealtimeClient) {
            if (joinedTicketId && joinedTicketId !== id) RealtimeClient.leaveTicket(joinedTicketId);
            RealtimeClient.joinTicket(id);
            joinedTicketId = id;
        }
        activeSupportId = id;
        const res = await fetch(`/api/dashboard/support/tickets/${id}`, { credentials: "include" });
        if (!res.ok) return;
        const { ticket, customer } = await res.json();
        cachedActiveTicket = ticket;
        document.getElementById("dash-support-detail").hidden = false;
        document.getElementById("dash-support-empty").hidden = true;
        document.getElementById("dash-support-subject").textContent = ticket.subject;
        document.getElementById("dash-support-meta").innerHTML = `
            ${esc(ticket.ticketNumber)} · ${esc(ticket.category)} ·
            <select id="dash-support-status-select">
                ${["open", "in_progress", "waiting_customer", "resolved", "closed"].map((s) =>
                    `<option value="${s}" ${ticket.status === s ? "selected" : ""}>${s.replace(/_/g, " ")}</option>`
                ).join("")}
            </select>
        `;
        document.getElementById("dash-support-customer").innerHTML = customer
            ? `<strong>${esc(customer.name)}</strong> · ${esc(customer.email)} · ${esc(customer.phone || "-")} · ${esc(customer.accountType || "personal")}`
            : "";
        renderSupportChat(ticket);
        document.getElementById("dash-support-status-select")?.addEventListener("change", async (e) => {
            await fetch(`/api/dashboard/support/tickets/${id}/status`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: e.target.value }),
            });
            await loadSupportTickets();
            openSupportTicket(id);
        });
    }

    async function loadVerificationQueue(options = {}) {
        const { silent = false } = options;
        const tbody = document.querySelector("#verification-table tbody");
        if (!silent && tbody && window.InfinityLoader) {
            tbody.innerHTML = window.InfinityLoader.skeletonTableBody(4, 6);
        }
        const filter = document.getElementById("dash-verification-filter")?.value || "all";
        const res = await fetch(`/api/dashboard/verification/pending?status=${encodeURIComponent(filter)}`, { credentials: "include" });
        const data = await res.json();
        verificationUsers = data.users || [];
        renderVerificationTable();
    }

    function statusLabel(status) {
        const map = {
            none: "Not submitted",
            pending: "Pending review",
            approved: "Approved",
            rejected: "Rejected",
            reupload_requested: "Rejected",
        };
        return map[status] || status || "—";
    }

    function renderVerificationTable() {
        const tbody = document.querySelector("#verification-table tbody");
        if (!tbody) return;
        tbody.innerHTML = "";
        if (!verificationUsers.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="muted" style="text-align:center;padding:1rem;">No users in this view.</td></tr>`;
            return;
        }
        verificationUsers.forEach((u) => {
            const idStatus = u.identityVerification?.status || "none";
            const avatar = u.profilePicture
                ? `<img src="${esc(u.profilePicture)}" alt="" class="dash-user-avatar">`
                : `<span class="dash-user-avatar dash-user-avatar--text">${esc((u.name || "U").charAt(0).toUpperCase())}</span>`;
            const submitted = u.identityVerification?.submittedAt
                ? formatDate(u.identityVerification.submittedAt)
                : "—";
            const docCount = (u.identityVerification?.documents || []).filter((d) => d.url).length;
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td data-label="Customer"><div class="dash-user-cell">${avatar}<div><strong>${esc(u.name || "-")}</strong><br><small class="muted">${docCount} file(s)</small></div></div></td>
                <td data-label="Email">${esc(u.email || "-")}</td>
                <td data-label="Account">${esc(u.accountType === "company" ? "Company" : "Personal")}</td>
                <td data-label="Status"><span class="ap-chip ${idStatus === "approved" ? "ok" : idStatus === "pending" ? "pending" : idStatus === "none" ? "pending" : "bad"}">${esc(statusLabel(idStatus))}</span></td>
                <td data-label="Submitted">${esc(submitted)}</td>
                <td data-label="Actions">
                    <div style="display:flex;gap:.35rem;flex-wrap:wrap;">
                        <button type="button" class="dash-btn ghost" data-review="${u._id}">View Documents</button>
                        <button type="button" class="dash-btn primary" data-quick-approve="${u._id}">Approve</button>
                        <button type="button" class="dash-btn ghost" data-quick-reject="${u._id}">Reject</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        tbody.querySelectorAll("[data-review]").forEach((btn) => {
            btn.addEventListener("click", () => openVerificationReview(btn.dataset.review));
        });
        tbody.querySelectorAll("[data-quick-approve]").forEach((btn) => {
            btn.addEventListener("click", async () => {
                await fetch(`/api/dashboard/verification/user/${btn.dataset.quickApprove}/review`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "approved", notes: "" }),
                });
                await loadVerificationQueue();
            });
        });
        tbody.querySelectorAll("[data-quick-reject]").forEach((btn) => {
            btn.addEventListener("click", async () => {
                const notes = prompt("Rejection reason (optional):") || "";
                await fetch(`/api/dashboard/verification/user/${btn.dataset.quickReject}/review`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "rejected", notes }),
                });
                await loadVerificationQueue();
            });
        });
    }

    function renderVerificationDetailPanel(userId, user, opts = {}) {
        const panel = document.getElementById("dash-verification-detail");
        panel.hidden = false;
        if (opts.scrollIntoView !== false) {
            panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
        document.getElementById("dash-verification-user").textContent = `${user.name} (${user.email}) — ${user.accountType}`;
        const docs = user.identityVerification?.documents || [];
        document.getElementById("dash-verification-docs").innerHTML = docs.length ? docs.map((d) => `
            <div class="dash-doc-review-row">
                <div class="dash-doc-review-head">
                    <div>
                        <strong>${esc(DOC_LABELS[d.type] || d.type)}</strong>
                        ${d.uploadedAt ? `<div class="muted" style="font-size:.78rem;">Uploaded ${formatDate(d.uploadedAt)}</div>` : ""}
                    </div>
                    <span class="doc-status-pill ${d.status || "draft"}">${esc(d.status || "draft")}</span>
                </div>
                ${d.rejectionReason ? `<p class="ap-sub" style="color:#b91c1c;margin:.35rem 0;">${esc(d.rejectionReason)}</p>` : ""}
                <div class="dash-doc-preview-row">${renderDocPreview(userId, d)}</div>
                <div class="dash-doc-review-actions">
                    <a href="${esc(docViewUrl(userId, d.type))}" target="_blank" rel="noopener" class="dash-btn ghost">Open Full Size</a>
                    <a href="${esc(docViewUrl(userId, d.type))}" download class="dash-btn ghost">Download</a>
                    <button type="button" class="dash-btn primary doc-approve-btn" data-type="${d.type}">Approve</button>
                    <button type="button" class="dash-btn ghost doc-reject-btn" data-type="${d.type}">Reject</button>
                </div>
                <input type="text" class="doc-reject-reason" data-type="${d.type}" placeholder="Rejection reason (optional)">
            </div>
        `).join("") : `<p class="muted">No documents uploaded yet.</p>`;

        document.querySelectorAll(".doc-approve-btn").forEach((btn) => {
            btn.addEventListener("click", () => reviewDocument(userId, btn.dataset.type, "approved", ""));
        });
        document.querySelectorAll(".doc-reject-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const reason = document.querySelector(`.doc-reject-reason[data-type="${btn.dataset.type}"]`)?.value || "";
                reviewDocument(userId, btn.dataset.type, "rejected", reason);
            });
        });
        const notesEl = document.getElementById("dash-verification-notes");
        if (!opts.preserveNotes) {
            notesEl.value = user.identityVerification?.staffNotes || "";
        }
    }

    async function openVerificationReview(userId, opts = {}) {
        activeVerificationId = userId;
        const res = await fetch(`/api/dashboard/verification/user/${userId}`, { credentials: "include" });
        if (!res.ok) return;
        const { user } = await res.json();
        renderVerificationDetailPanel(userId, user, opts);
    }

    async function refreshActiveVerificationDetail(options = {}) {
        if (!activeVerificationId) return;
        const panel = document.getElementById("dash-verification-detail");
        if (panel?.hidden) return;
        const notesEl = document.getElementById("dash-verification-notes");
        if (notesEl && document.activeElement === notesEl) return;
        const rejectReasonEl = document.querySelector(".doc-reject-reason:focus");
        if (rejectReasonEl) return;
        await openVerificationReview(activeVerificationId, { scrollIntoView: false, preserveNotes: true });
    }

    async function reviewDocument(userId, docType, status, reason) {
        await fetch(`/api/dashboard/verification/user/${userId}/document-review`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ docType, status, reason }),
        });
        await openVerificationReview(userId);
        await loadVerificationQueue();
    }

    function wireEvents() {
        document.getElementById("dash-support-search")?.addEventListener("input", () => loadSupportTickets());
        document.getElementById("dash-support-status")?.addEventListener("change", () => loadSupportTickets());
        document.getElementById("dash-support-category")?.addEventListener("change", () => loadSupportTickets());
        document.getElementById("dash-verification-filter")?.addEventListener("change", () => loadVerificationQueue());

        document.getElementById("dash-support-reply-form")?.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (!activeSupportId) return;
            const body = document.getElementById("dash-support-reply-body").value.trim();
            const fileInput = document.getElementById("dash-support-reply-attachments");
            let attachments = [];
            if (fileInput?.files?.length) {
                attachments = await readFilesAsAttachments(fileInput.files);
            }
            const res = await fetch(`/api/dashboard/support/tickets/${activeSupportId}/reply`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ body, attachments }),
            });
            if (res.ok) {
                const data = await res.json();
                document.getElementById("dash-support-reply-body").value = "";
                if (fileInput) fileInput.value = "";
                if (data.ticket) {
                    cachedActiveTicket = data.ticket;
                    const lastMsg = (data.ticket.messages || []).slice(-1)[0];
                    if (lastMsg) appendSupportMessages([lastMsg]);
                    upsertSupportTicketInList({
                        ticketId: data.ticket._id,
                        ticketNumber: data.ticket.ticketNumber,
                        subject: data.ticket.subject,
                        category: data.ticket.category,
                        status: data.ticket.status,
                        updatedAt: data.ticket.updatedAt,
                    });
                } else {
                    await loadSupportTickets({ silent: true });
                    await openSupportTicket(activeSupportId);
                }
            }
        });

        document.getElementById("dash-verification-approve")?.addEventListener("click", () => submitReview("approved"));
        document.getElementById("dash-verification-reject")?.addEventListener("click", () => submitReview("rejected"));
        document.getElementById("dash-verification-reupload")?.addEventListener("click", () => submitReview("reupload_requested"));
    }

    async function submitReview(action) {
        if (!activeVerificationId) return;
        const notes = document.getElementById("dash-verification-notes").value.trim();
        await fetch(`/api/dashboard/verification/user/${activeVerificationId}/review`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, notes }),
        });
        document.getElementById("dash-verification-detail").hidden = true;
        activeVerificationId = null;
        await loadVerificationQueue();
    }

    async function init(role) {
        if (!canStaffSupport(role)) return;
        const supportTab = document.getElementById("support-tab");
        const verificationTab = document.getElementById("verification-tab");
        if (supportTab) supportTab.style.display = "";
        if (verificationTab) verificationTab.style.display = "";
        wireEvents();
        wireSupportRealtime();
        await Promise.all([loadSupportTickets(), loadVerificationQueue()]);
    }

    global.DashboardExtensions = {
        init,
        canStaffSupport,
        openVerificationReview,
        loadVerificationQueue,
        loadSupportTickets,
        refreshActiveSupportTicket,
        refreshActiveVerificationDetail,
    };
})(window);
