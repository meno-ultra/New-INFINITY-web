const express = require("express");
const supportTicketService = require("../services/supportTicketService");

function createDashboardSupportRouter({ User, requireRole }) {
    const router = express.Router();
    const staffOnly = requireRole(["employee", "manager", "primary"]);

    router.get("/tickets", staffOnly, async (req, res) => {
        try {
            const tickets = await supportTicketService.listStaffTickets({
                status: req.query.status,
                category: req.query.category,
                search: req.query.search,
            });
            const userIds = [...new Set(tickets.map((t) => String(t.userId)))];
            const users = await User.find({ _id: { $in: userIds } })
                .select("name email phone accountType")
                .lean();
            const userMap = Object.fromEntries(users.map((u) => [String(u._id), u]));
            res.json({
                tickets: tickets.map((t) => ({
                    ...t,
                    customer: userMap[String(t.userId)] || null,
                })),
            });
        } catch (err) {
            res.status(500).json({ error: "Unable to load tickets." });
        }
    });

    router.get("/tickets/:id", staffOnly, async (req, res) => {
        try {
            const ticket = await supportTicketService.getStaffTicket(req.params.id);
            if (!ticket) return res.status(404).json({ error: "Ticket not found." });
            const customer = await User.findById(ticket.userId)
                .select("name email phone accountType city country")
                .lean();
            res.json({ ticket, customer });
        } catch (err) {
            res.status(500).json({ error: "Unable to load ticket." });
        }
    });

    router.post("/tickets/:id/reply", staffOnly, async (req, res) => {
        try {
            const staffUser = await User.findById(req.session.user.id).select("_id name role");
            const uploaded = await supportTicketService.processAttachments(
                staffUser._id,
                req.body?.attachments || []
            );
            const result = await supportTicketService.addStaffReply(
                staffUser,
                req.params.id,
                req.body?.body,
                uploaded
            );
            if (!result.ok) return res.status(400).json({ error: result.message });
            res.json({ ticket: result.ticket });
        } catch (err) {
            res.status(500).json({ error: err.message || "Unable to send reply." });
        }
    });

    router.patch("/tickets/:id/status", staffOnly, async (req, res) => {
        try {
            const status = req.body?.status;
            if (!supportTicketService.TICKET_STATUSES.includes(status)) {
                return res.status(400).json({ error: "Invalid status." });
            }
            const staffUser = await User.findById(req.session.user.id).select("_id name role");
            const result = await supportTicketService.updateTicketStatus(staffUser, req.params.id, status);
            if (!result.ok) return res.status(400).json({ error: result.message });
            res.json({ ticket: result.ticket });
        } catch (err) {
            res.status(500).json({ error: "Unable to update status." });
        }
    });

    return router;
}

module.exports = createDashboardSupportRouter;
