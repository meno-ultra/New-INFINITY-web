const express = require("express");
const supportTicketService = require("../services/supportTicketService");

const TICKET_CATEGORIES = supportTicketService.TICKET_CATEGORIES;
const TICKET_STATUSES = supportTicketService.TICKET_STATUSES;

function createSupportRouter({ User, requireAuth }) {
    const router = express.Router();

    router.get("/meta", requireAuth, (_req, res) => {
        res.json({
            categories: TICKET_CATEGORIES.map((id) => ({
                id,
                label: supportTicketService.CATEGORY_LABELS[id] || id,
            })),
            statuses: TICKET_STATUSES,
        });
    });

    router.get("/tickets", requireAuth, async (req, res) => {
        try {
            const tickets = await supportTicketService.listUserTickets(req.session.user.id);
            res.json({ tickets });
        } catch (err) {
            console.error("List tickets error:", err);
            res.status(500).json({ error: "Unable to load tickets." });
        }
    });

    router.get("/tickets/:id", requireAuth, async (req, res) => {
        try {
            const ticket = await supportTicketService.getTicketForUser(req.session.user.id, req.params.id);
            if (!ticket) return res.status(404).json({ error: "Ticket not found." });
            res.json({ ticket });
        } catch (err) {
            res.status(500).json({ error: "Unable to load ticket." });
        }
    });

    router.post("/tickets", requireAuth, async (req, res) => {
        try {
            const { subject, category, description, attachments } = req.body || {};
            if (!subject || !category || !description) {
                return res.status(400).json({ error: "Subject, category, and description are required." });
            }
            if (!TICKET_CATEGORIES.includes(category)) {
                return res.status(400).json({ error: "Invalid category." });
            }
            const user = await User.findById(req.session.user.id).select("_id name role");
            if (!user) return res.status(404).json({ error: "User not found." });

            const uploaded = await supportTicketService.processAttachments(user._id, attachments);
            const ticket = await supportTicketService.createTicket(user, {
                subject,
                category,
                description,
                attachments: uploaded,
            });
            res.status(201).json({ ticket });
        } catch (err) {
            console.error("Create ticket error:", err);
            res.status(400).json({ error: err.message || "Unable to create ticket." });
        }
    });

    router.post("/tickets/:id/reply", requireAuth, async (req, res) => {
        try {
            const user = await User.findById(req.session.user.id).select("_id name role");
            const uploaded = await supportTicketService.processAttachments(user._id, req.body?.attachments || []);
            const result = await supportTicketService.addUserReply(
                user,
                req.params.id,
                req.body?.body,
                uploaded
            );
            if (!result.ok) return res.status(400).json({ error: result.message, code: result.code });
            res.json({ ticket: result.ticket });
        } catch (err) {
            res.status(400).json({ error: err.message || "Unable to send reply." });
        }
    });

    router.post("/tickets/:id/close", requireAuth, async (req, res) => {
        try {
            const user = await User.findById(req.session.user.id).select("_id name role");
            const result = await supportTicketService.closeTicketByUser(user, req.params.id);
            if (!result.ok) return res.status(400).json({ error: result.message });
            res.json({ ticket: result.ticket });
        } catch (err) {
            res.status(500).json({ error: "Unable to close ticket." });
        }
    });

    return router;
}

module.exports = createSupportRouter;
