const { SupportTicket, TICKET_CATEGORIES, TICKET_STATUSES } = require("../models/SupportTicket");
const { uploadUserFile } = require("./uploadService");
const { createNotification } = require("./notificationService");
const realtime = require("./realtimeService");

const CATEGORY_LABELS = {
    technical: "Technical Issue",
    billing: "Billing",
    product: "Product Question",
    complaint: "Complaint",
    suggestion: "Suggestion",
    account: "Account Issue",
    other: "Other",
};

function nextTicketNumber() {
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `TKT-${stamp}-${rand}`;
}

async function createTicket(user, { subject, category, description, attachments = [] }) {
    const ticket = await SupportTicket.create({
        ticketNumber: nextTicketNumber(),
        userId: user._id,
        subject: String(subject).trim(),
        category,
        status: "open",
        messages: [{
            authorId: user._id,
            authorRole: user.role || "customer",
            authorName: user.name || "Customer",
            body: String(description).trim(),
            attachments,
        }],
    });
    realtime.emitTicketCreated(ticket, user);
    return ticket;
}

async function listUserTickets(userId) {
    return SupportTicket.find({ userId })
        .sort({ updatedAt: -1 })
        .select("ticketNumber subject category status updatedAt createdAt")
        .lean();
}

async function getTicketForUser(userId, ticketId) {
    return SupportTicket.findOne({ _id: ticketId, userId }).lean();
}

async function addUserReply(user, ticketId, body, attachments = []) {
    const ticket = await SupportTicket.findOne({ _id: ticketId, userId: user._id });
    if (!ticket) return { ok: false, code: "NOT_FOUND", message: "Ticket not found." };
    if (ticket.status === "closed") {
        return { ok: false, code: "CLOSED", message: "This ticket is closed." };
    }

    ticket.messages.push({
        authorId: user._id,
        authorRole: user.role || "customer",
        authorName: user.name || "Customer",
        body: String(body).trim(),
        attachments,
    });
    if (ticket.status === "waiting_customer") ticket.status = "open";
    await ticket.save();
    const lastMessage = ticket.messages[ticket.messages.length - 1];
    realtime.emitTicketMessage(ticket, lastMessage);
    return { ok: true, ticket };
}

async function closeTicketByUser(user, ticketId) {
    const ticket = await SupportTicket.findOne({ _id: ticketId, userId: user._id });
    if (!ticket) return { ok: false, code: "NOT_FOUND", message: "Ticket not found." };
    ticket.status = "closed";
    ticket.closedAt = new Date();
    ticket.closedBy = user._id;
    await ticket.save();
    realtime.emitTicketUpdated(ticket, { action: "closed" });
    return { ok: true, ticket };
}

async function listStaffTickets(filters = {}) {
    const query = {};
    if (filters.status) query.status = filters.status;
    if (filters.category) query.category = filters.category;
    if (filters.search) {
        const re = new RegExp(String(filters.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        query.$or = [{ subject: re }, { ticketNumber: re }];
    }
    return SupportTicket.find(query).sort({ updatedAt: -1 }).limit(200).lean();
}

async function getStaffTicket(ticketId) {
    return SupportTicket.findById(ticketId).lean();
}

async function addStaffReply(staffUser, ticketId, body, attachments = []) {
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) return { ok: false, code: "NOT_FOUND", message: "Ticket not found." };
    if (ticket.status === "closed") {
        return { ok: false, code: "CLOSED", message: "Ticket is already closed." };
    }

    ticket.messages.push({
        authorId: staffUser._id,
        authorRole: staffUser.role,
        authorName: staffUser.name || "Staff",
        body: String(body).trim(),
        attachments,
    });
    if (ticket.status === "open") ticket.status = "in_progress";
    await ticket.save();

    await createNotification({
        userId: ticket.userId,
        type: "ticket_reply",
        title: "Support reply received",
        message: `Staff replied to ticket ${ticket.ticketNumber}.`,
        link: `/support.html?ticket=${ticket._id}`,
        meta: { ticketId: String(ticket._id) },
    });

    const lastMessage = ticket.messages[ticket.messages.length - 1];
    realtime.emitTicketMessage(ticket, lastMessage);
    return { ok: true, ticket };
}

async function updateTicketStatus(staffUser, ticketId, status) {
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) return { ok: false, code: "NOT_FOUND", message: "Ticket not found." };

    ticket.status = status;
    if (status === "closed" || status === "resolved") {
        ticket.closedAt = new Date();
        ticket.closedBy = staffUser._id;
        await createNotification({
            userId: ticket.userId,
            type: "ticket_closed",
            title: "Support ticket updated",
            message: `Ticket ${ticket.ticketNumber} is now ${status.replace("_", " ")}.`,
            link: `/support.html?ticket=${ticket._id}`,
        });
    } else if (status === "waiting_customer") {
        await createNotification({
            userId: ticket.userId,
            type: "ticket_reply",
            title: "Action needed on your ticket",
            message: `Please review ticket ${ticket.ticketNumber}.`,
            link: `/support.html?ticket=${ticket._id}`,
        });
    }
    await ticket.save();
    realtime.emitTicketUpdated(ticket, { action: "status", status });
    return { ok: true, ticket };
}

async function processAttachments(userId, files = []) {
    const uploaded = [];
    for (const file of files.slice(0, 3)) {
        if (!file?.data) continue;
        const result = await uploadUserFile(userId, "support", "attachment", file.data, { allowPdf: true });
        if (!result.ok) throw new Error(result.message);
        uploaded.push({
            filename: result.filename,
            url: result.url,
            mimeType: result.mimeType,
        });
    }
    return uploaded;
}

module.exports = {
    CATEGORY_LABELS,
    TICKET_CATEGORIES,
    TICKET_STATUSES,
    createTicket,
    listUserTickets,
    getTicketForUser,
    addUserReply,
    closeTicketByUser,
    listStaffTickets,
    getStaffTicket,
    addStaffReply,
    updateTicketStatus,
    processAttachments,
};
