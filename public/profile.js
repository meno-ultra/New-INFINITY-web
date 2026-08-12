(function () {
    const PERSONAL_DOCS = [
        { id: "national_id_front", label: "National ID (Front)" },
        { id: "national_id_back", label: "National ID (Back)" },
        { id: "driving_license_front", label: "Driving License (Front)" },
        { id: "driving_license_back", label: "Driving License (Back)" },
    ];
    const COMPANY_DOCS = [
        { id: "commercial_register", label: "Commercial Register", pdf: true, required: true },
        { id: "tax_card", label: "Tax Card", pdf: true, required: true },
        { id: "company_license", label: "Company Logo", pdf: false, required: false },
    ];

    let profile = null;
    let meta = null;
    let lightboxZoom = 1;

    const esc = (value) => (window.DomUtils ? DomUtils.esc(value) : String(value ?? ""));

    function showMsg(text, type) {
        const el = document.getElementById("profile-msg");
        el.textContent = text;
        el.className = `ap-msg visible ${type || "error"}`;
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function getDocDefs() {
        return profile.accountType === "company" ? COMPANY_DOCS : PERSONAL_DOCS;
    }

    function getRequiredDefs() {
        return getDocDefs().filter((d) => d.required !== false);
    }

    function uploadedMap() {
        return Object.fromEntries((profile.identityVerification?.documents || []).map((d) => [d.type, d]));
    }

    function canEditDoc() {
        return true;
    }

    function hasDraftDocuments() {
        const uploaded = uploadedMap();
        return getRequiredDefs().some((d) => {
            const doc = uploaded[d.id];
            return doc?.url && doc.status === "draft";
        });
    }

    function canSubmitVerification() {
        const overall = profile.identityVerification?.status || "none";
        if (overall === "approved") return false;
        const required = getRequiredDefs();
        const uploaded = uploadedMap();
        const allUploaded = required.every((d) => uploaded[d.id]?.url);
        return allUploaded && hasDraftDocuments();
    }

    function renderVerificationBanner() {
        const banner = document.getElementById("verification-banner");
        const overall = profile.identityVerification?.status || "none";
        const notes = profile.identityVerification?.staffNotes || "";
        const map = {
            none: {
                cls: "none",
                icon: "fa-circle-info",
                title: "Identity verification not submitted",
                sub: "Upload all required documents and submit for review.",
            },
            pending: {
                cls: "pending",
                icon: "fa-clock",
                title: "Pending Review",
                sub: "Estimated review: 24–48 hours. We'll notify you when complete.",
            },
            approved: {
                cls: "approved",
                icon: "fa-circle-check",
                title: "Verified",
                sub: "Your identity documents have been approved.",
            },
            rejected: {
                cls: "rejected",
                icon: "fa-circle-xmark",
                title: "Rejected",
                sub: notes || "Please review feedback and re-upload rejected documents.",
            },
            reupload_requested: {
                cls: "reupload_requested",
                icon: "fa-rotate",
                title: "Re-upload Required",
                sub: notes || "Replace rejected documents only — approved documents stay on file.",
            },
        };
        const info = map[overall] || map.none;
        banner.className = `verification-banner ${info.cls}`;
        banner.innerHTML = `
            <p class="verification-banner-title"><i class="fas ${info.icon}" aria-hidden="true"></i> ${esc(info.title)}</p>
            <p class="verification-banner-sub">${esc(info.sub)}</p>
        `;
    }

    function renderStatusRow() {
        const row = document.getElementById("status-row");
        const emailStatus = profile.emailVerified
            ? '<span class="ap-chip ok">Email Verification: Verified</span>'
            : '<span class="ap-chip bad">Email Verification: Not Verified</span>';
        const idStatus = profile.identityVerification?.status || "none";
        const idLabels = {
            none: { cls: "pending", text: "Identity Verification: Not Submitted" },
            pending: { cls: "pending", text: "Identity Verification: Pending" },
            approved: { cls: "ok", text: "Identity Verification: Approved" },
            rejected: { cls: "bad", text: "Identity Verification: Rejected" },
            reupload_requested: { cls: "bad", text: "Identity Verification: Rejected" },
        };
        const idChip = idLabels[idStatus] || idLabels.none;
        row.innerHTML = `${emailStatus}<span class="ap-chip ${idChip.cls}">${idChip.text}</span>`;
    }

    function renderProgress() {
        const el = document.getElementById("doc-progress");
        const required = getRequiredDefs();
        const uploaded = uploadedMap();
        const done = required.filter((d) => uploaded[d.id]?.url).length;
        const pct = required.length ? Math.round((done / required.length) * 100) : 0;

        const items = required.map((d) => {
            const doc = uploaded[d.id];
            let icon = "○";
            let cls = "missing";
            if (doc?.status === "approved") { icon = "✓"; cls = "approved"; }
            else if (doc?.status === "rejected") { icon = "✕"; cls = "rejected"; }
            else if (doc?.status === "pending") { icon = "◷"; cls = "pending"; }
            else if (doc?.url) { icon = "✓"; cls = "done"; }
            return `<div class="doc-progress-item ${cls}"><span class="icon">${icon}</span><span>${esc(d.label)}</span></div>`;
        }).join("");

        el.innerHTML = `
            <div class="doc-progress-head">
                <h3>Verification Documents</h3>
                <span class="doc-progress-count">${done} / ${required.length} uploaded</span>
            </div>
            <div class="doc-progress-bar"><div class="doc-progress-fill" style="width:${pct}%"></div></div>
            <div class="doc-progress-list">${items}</div>
        `;
    }

    function docStatusDisplay(doc) {
        if (!doc || !doc.url) return { label: "Not Uploaded", cls: "none" };
        if (doc.status === "approved") return { label: "Approved", cls: "approved" };
        if (doc.status === "rejected") return { label: "Rejected", cls: "rejected" };
        if (doc.status === "pending") return { label: "Pending Review", cls: "pending" };
        if (doc.url && doc.status === "draft") return { label: "Uploaded", cls: "uploaded" };
        return { label: "Draft", cls: "draft" };
    }

    function statusPill(doc) {
        const { label, cls } = docStatusDisplay(doc);
        return `<span class="doc-status-pill ${cls}">${label}</span>`;
    }

    function previewHtml(docType, doc) {
        if (!doc?.url) return "";
        const src = `/api/profile/me/identity-document/${docType}?t=${Date.now()}`;
        if (doc.mimeType?.startsWith("image/")) {
            return `<div class="doc-preview-wrap" data-preview="${docType}" role="button" tabindex="0" aria-label="View full size">
                <img src="${src}" alt="${esc(docType)}">
            </div>`;
        }
        return `<div class="doc-preview-wrap" data-preview="${docType}" role="button" tabindex="0">
            <div class="doc-preview-pdf"><i class="fas fa-file-pdf"></i> PDF Document</div>
        </div>`;
    }

    function renderDocs() {
        const docs = getDocDefs();
        const grid = document.getElementById("doc-grid");
        const uploaded = uploadedMap();
        const overall = profile.identityVerification?.status || "none";

        document.getElementById("doc-help").textContent = profile.accountType === "company"
            ? "Upload company documents at your own pace. Each file is saved independently — replace any document anytime."
            : "Upload documents at your own pace. Each file is saved independently — you can add the rest later or replace any file anytime.";

        grid.innerHTML = docs.map((d) => {
            const doc = uploaded[d.id];
            const editable = canEditDoc();
            const locked = !editable;
            const optional = d.required === false ? '<span class="doc-card-optional">Optional</span>' : "";
            const rejectReason = doc?.status === "rejected" && doc.rejectionReason
                ? `<p class="doc-reject-reason"><strong>Reason:</strong> ${esc(doc.rejectionReason)}</p>` : "";
            const uploadedMeta = doc?.uploadedAt
                ? `<p class="doc-meta">Uploaded ${esc(new Date(doc.uploadedAt).toLocaleString())}</p>` : "";

            let body = "";
            if (doc?.url) {
                body = `${previewHtml(d.id, doc)}
                    <div class="doc-preview-actions">
                        ${editable ? `<button type="button" class="ap-btn ghost doc-replace-btn" data-type="${d.id}">Replace</button>` : ""}
                        ${editable ? `<button type="button" class="ap-btn ghost doc-remove-btn" data-type="${d.id}">Remove</button>` : ""}
                        <button type="button" class="ap-btn ghost doc-view-btn" data-type="${d.id}">View Full Size</button>
                    </div>`;
            } else if (editable) {
                body = `<div class="doc-drop-zone" data-drop="${d.id}" tabindex="0">
                    <i class="fas fa-cloud-upload-alt" aria-hidden="true"></i>
                    <span>Drop file or click to upload</span>
                </div>
                <input type="file" hidden data-input="${d.id}" accept="${d.pdf ? "image/jpeg,image/png,image/webp,application/pdf" : "image/jpeg,image/png,image/webp"}">`;
            } else {
                body = `<p class="ap-sub">Not uploaded</p>`;
            }

            return `<article class="doc-card ${doc?.url ? "is-uploaded" : ""} ${locked ? "is-locked" : ""}" data-doc-card="${d.id}">
                <div class="doc-card-head">
                    <h4 class="doc-card-title">${esc(d.label)} ${optional}</h4>
                    ${statusPill(doc)}
                </div>
                ${rejectReason}
                ${uploadedMeta}
                <div class="doc-upload-progress" data-progress="${d.id}"><span></span></div>
                ${body}
            </article>`;
        }).join("");

        const submitBtn = document.getElementById("submit-identity-btn");
        const showSubmit = overall !== "approved";
        submitBtn.disabled = !canSubmitVerification();
        submitBtn.style.display = showSubmit ? "" : "none";

        const required = getRequiredDefs();
        const allUploaded = required.every((d) => uploaded[d.id]?.url);
        const hasDrafts = hasDraftDocuments();

        let hint = "Upload all required documents, then submit for review.";
        if (overall === "pending" && !allUploaded) {
            hint = "Continue uploading remaining documents. Already submitted files stay under review.";
        } else if (overall === "pending" && hasDrafts) {
            hint = "Some documents are under review. Submit again when all required files are uploaded.";
        } else if (overall === "pending") {
            hint = "Documents under review. You can still replace any file — only that document returns to review.";
        } else if (overall === "reupload_requested" || overall === "rejected") {
            hint = "Replace rejected documents, then submit for review.";
        } else if (!allUploaded) {
            hint = "Upload at your own pace. Save each file — submit for review when all required documents are ready.";
        }
        document.getElementById("submit-hint").textContent = hint;

        wireDocEvents();
        renderProgress();
    }

    function wireDocEvents() {
        const grid = document.getElementById("doc-grid");
        grid.querySelectorAll("[data-drop]").forEach((drop) => {
            const type = drop.dataset.drop;
            const input = grid.querySelector(`[data-input="${type}"]`);
            const pick = () => input?.click();
            drop.addEventListener("click", pick);
            drop.addEventListener("keydown", (e) => { if (e.key === "Enter") pick(); });
            drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("dragover"); });
            drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
            drop.addEventListener("drop", (e) => {
                e.preventDefault();
                drop.classList.remove("dragover");
                if (e.dataTransfer.files[0]) uploadDoc(type, e.dataTransfer.files[0]);
            });
            input?.addEventListener("change", () => { if (input.files[0]) uploadDoc(type, input.files[0]); });
        });

        grid.querySelectorAll(".doc-replace-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const input = document.createElement("input");
                input.type = "file";
                const def = getDocDefs().find((d) => d.id === btn.dataset.type);
                input.accept = def?.pdf ? "image/jpeg,image/png,image/webp,application/pdf" : "image/jpeg,image/png,image/webp";
                input.onchange = () => { if (input.files[0]) uploadDoc(btn.dataset.type, input.files[0]); };
                input.click();
            });
        });

        grid.querySelectorAll(".doc-remove-btn").forEach((btn) => {
            btn.addEventListener("click", () => removeDoc(btn.dataset.type));
        });

        grid.querySelectorAll(".doc-view-btn, .doc-preview-wrap").forEach((el) => {
            el.addEventListener("click", () => openLightbox(el.dataset.preview || el.dataset.type || el.closest("[data-doc-card]")?.dataset.docCard));
        });
    }

    async function uploadDoc(type, file) {
        const progress = document.querySelector(`[data-progress="${type}"]`);
        const bar = progress?.querySelector("span");
        if (progress) progress.classList.add("active");
        if (bar) { bar.style.width = "30%"; setTimeout(() => { bar.style.width = "70%"; }, 200); }

        try {
            const data = await readFileAsDataUrl(file);
            const res = await fetch("/api/profile/me/identity-document", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ docType: type, data }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Upload failed");
            if (bar) bar.style.width = "100%";
            await loadProfile();
            const saved = profile.identityVerification?.documents?.find((d) => d.type === type);
            const msg = saved?.status === "pending"
                ? "Document updated and queued for review."
                : "Document saved. Upload remaining files anytime.";
            showMsg(msg, "success");
        } catch (err) {
            showMsg(err.message, "error");
        } finally {
            setTimeout(() => {
                if (progress) progress.classList.remove("active");
                if (bar) bar.style.width = "0%";
            }, 400);
        }
    }

    async function removeDoc(type) {
        const res = await fetch(`/api/profile/me/identity-document/${type}`, {
            method: "DELETE",
            credentials: "include",
        });
        const json = await res.json();
        if (!res.ok) { showMsg(json.error || "Remove failed", "error"); return; }
        await loadProfile();
        showMsg("Document removed.", "success");
    }

    function openLightbox(docType) {
        const doc = uploadedMap()[docType];
        if (!doc) return;
        const box = document.getElementById("doc-lightbox");
        const content = document.getElementById("lightbox-content");
        const src = `/api/profile/me/identity-document/${docType}?t=${Date.now()}`;
        lightboxZoom = 1;
        if (doc.mimeType?.startsWith("image/")) {
            content.innerHTML = `<img id="lightbox-img" src="${src}" alt="" style="transform:scale(1)">`;
            document.getElementById("lightbox-zoom-controls").hidden = false;
        } else {
            content.innerHTML = `<object data="${src}" type="application/pdf" width="100%" height="600"></object>`;
            document.getElementById("lightbox-zoom-controls").hidden = true;
        }
        box.hidden = false;
        box.classList.add("open");
    }

    function closeLightbox() {
        const box = document.getElementById("doc-lightbox");
        box.classList.remove("open");
        box.hidden = true;
    }

    document.getElementById("lightbox-close")?.addEventListener("click", closeLightbox);
    document.getElementById("doc-lightbox")?.addEventListener("click", (e) => {
        if (e.target.id === "doc-lightbox") closeLightbox();
    });
    document.getElementById("lightbox-zoom-in")?.addEventListener("click", () => {
        lightboxZoom = Math.min(lightboxZoom + 0.25, 3);
        const img = document.getElementById("lightbox-img");
        if (img) img.style.transform = `scale(${lightboxZoom})`;
    });
    document.getElementById("lightbox-zoom-out")?.addEventListener("click", () => {
        lightboxZoom = Math.max(lightboxZoom - 0.25, 0.5);
        const img = document.getElementById("lightbox-img");
        if (img) img.style.transform = `scale(${lightboxZoom})`;
    });

    function fillForm() {
        document.getElementById("pf-type").value = profile.accountType === "company" ? "Company Account" : "Personal Account";
        document.getElementById("pf-name").value = profile.name || "";
        document.getElementById("pf-company").value = profile.companyName || "";
        document.getElementById("pf-dob").value = profile.dateOfBirth ? String(profile.dateOfBirth).slice(0, 10) : "";
        document.getElementById("pf-phone").value = profile.phone || "";
        document.getElementById("pf-email").value = profile.email || "";
        document.getElementById("pf-address").value = profile.address || profile.companyAddress || "";
        document.getElementById("pf-city").value = profile.city || "";
        document.getElementById("pf-country").value = "Egypt";
        document.getElementById("pf-tax").value = profile.taxNumber || "";
        document.getElementById("pf-website").value = profile.companyWebsite || "";
        ["pf-type", "pf-name", "pf-company", "pf-dob", "pf-email"].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.disabled = true;
        });
        document.querySelectorAll(".company-only").forEach((el) => {
            el.hidden = profile.accountType !== "company";
        });
        renderVerificationBanner();
        renderStatusRow();
        renderDocs();
    }

    async function loadProfile() {
        const res = await fetch("/api/profile/me", { credentials: "include" });
        if (!res.ok) { window.location.href = "/auth.html"; return; }
        const data = await res.json();
        profile = data.profile;
        fillForm();
    }

    document.querySelectorAll(".ap-tab").forEach((tab) => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".ap-tab").forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            ["general", "contact", "documents", "security"].forEach((id) => {
                document.getElementById(`tab-${id}`).hidden = tab.dataset.tab !== id;
            });
        });
    });

    document.getElementById("save-profile-btn").addEventListener("click", async () => {
        const btn = document.getElementById("save-profile-btn");
        if (window.InfinityLoader) InfinityLoader.setButtonLoading(btn, true);
        try {
            const body = {
                phone: document.getElementById("pf-phone").value.trim(),
                address: document.getElementById("pf-address").value.trim(),
                city: document.getElementById("pf-city").value.trim(),
                country: "Egypt",
                taxNumber: document.getElementById("pf-tax").value.trim(),
                companyWebsite: document.getElementById("pf-website").value.trim(),
            };
            const res = await fetch("/api/profile/me", {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Save failed");
            profile = data.profile;
            renderVerificationBanner();
            renderStatusRow();
            renderDocs();
            showMsg("Profile saved.", "success");
        } catch (err) {
            showMsg(err.message, "error");
        } finally {
            if (window.InfinityLoader) InfinityLoader.setButtonLoading(btn, false);
        }
    });

    document.getElementById("pf-avatar-file").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const data = await readFileAsDataUrl(file);
        await fetch("/api/profile/me/avatar", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data }),
        });
        showMsg("Profile picture updated.", "success");
    });

    document.getElementById("submit-identity-btn").addEventListener("click", async () => {
        const btn = document.getElementById("submit-identity-btn");
        if (window.InfinityLoader) InfinityLoader.setButtonLoading(btn, true);
        try {
            const res = await fetch("/api/profile/me/submit-identity", { method: "POST", credentials: "include" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Submit failed");
            await loadProfile();
            showMsg("All documents submitted for verification.", "success");
            if (window.InfinityNotifications) InfinityNotifications.refreshBadges();
        } catch (err) {
            showMsg(err.message, "error");
        } finally {
            if (window.InfinityLoader) InfinityLoader.setButtonLoading(btn, false);
        }
    });

    (async () => {
        if (window.InfinityLoader) InfinityLoader.startPageEnter();
        await loadProfile();
        if (window.InfinityNotifications) InfinityNotifications.refreshBadges();
        if (location.hash === "#documents") {
            document.querySelector('[data-tab="documents"]').click();
        }
    })();
})();
