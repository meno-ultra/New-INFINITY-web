const { STAFF_ROLES } = require("../constants/roles");

let io = null;

function serializeMessage(msg) {
    if (!msg) return null;
    const plain = typeof msg.toObject === "function" ? msg.toObject() : msg;
    return {
        _id: plain._id ? String(plain._id) : "",
        authorId: plain.authorId ? String(plain.authorId) : "",
        authorRole: plain.authorRole || "",
        authorName: plain.authorName || "",
        body: plain.body || "",
        attachments: Array.isArray(plain.attachments) ? plain.attachments : [],
        createdAt: plain.createdAt || null,
    };
}

function ticketPayload(ticket, extra = {}) {
    const plain = ticket?.toObject ? ticket.toObject() : ticket;
    return {
        ticketId: String(plain._id),
        userId: String(plain.userId),
        ticketNumber: plain.ticketNumber,
        subject: plain.subject,
        category: plain.category,
        status: plain.status,
        updatedAt: plain.updatedAt,
        createdAt: plain.createdAt,
        messageCount: Array.isArray(plain.messages) ? plain.messages.length : 0,
        ...extra,
    };
}

function init(server, sessionMiddleware) {
    const { Server } = require("socket.io");
    io = new Server(server, {
        cors: { origin: true, credentials: true },
    });

    const wrap = (middleware) => (socket, next) => middleware(socket.request, {}, next);
    io.use(wrap(sessionMiddleware));

    io.on("connection", (socket) => {
        const user = socket.request.session?.user;
        if (!user?.id) {
            socket.disconnect(true);
            return;
        }

        socket.data.userId = String(user.id);
        socket.data.role = user.role || "customer";
        socket.join(`user:${user.id}`);

        if (STAFF_ROLES.includes(user.role)) {
            socket.join("staff");
        }

        socket.on("ticket:join", (ticketId) => {
            if (ticketId) socket.join(`ticket:${String(ticketId)}`);
        });

        socket.on("ticket:leave", (ticketId) => {
            if (ticketId) socket.leave(`ticket:${String(ticketId)}`);
        });
    });

    return io;
}

function emitToStaff(event, payload) {
    io?.to("staff").emit(event, payload);
}

function emitToUser(userId, event, payload) {
    if (!userId) return;
    io?.to(`user:${String(userId)}`).emit(event, payload);
}

function emitToTicket(ticketId, event, payload) {
    if (!ticketId) return;
    io?.to(`ticket:${String(ticketId)}`).emit(event, payload);
}

function emitTicketCreated(ticket, customer) {
    const payload = ticketPayload(ticket, {
        customer: customer ? {
            name: customer.name || "",
            email: customer.email || "",
            phone: customer.phone || "",
            accountType: customer.accountType || "personal",
        } : null,
    });
    emitToStaff("ticketCreated", payload);
    emitToUser(payload.userId, "ticketCreated", payload);
}

function emitTicketMessage(ticket, message) {
    const serialized = serializeMessage(message);
    const payload = ticketPayload(ticket, { message: serialized });
    emitToStaff("ticketMessage", payload);
    emitToUser(payload.userId, "ticketMessage", payload);
    emitToTicket(payload.ticketId, "ticketMessage", payload);
}

function emitTicketUpdated(ticket, extra = {}) {
    const payload = ticketPayload(ticket, extra);
    emitToStaff("ticketUpdated", payload);
    emitToUser(payload.userId, "ticketUpdated", payload);
    emitToTicket(payload.ticketId, "ticketUpdated", payload);
}

function emitIdentitySubmitted(user) {
    const plain = user?.toObject ? user.toObject() : user;
    emitToStaff("identitySubmitted", {
        userId: String(plain._id),
        status: plain.identityVerification?.status || "pending",
        submittedAt: plain.identityVerification?.submittedAt || null,
    });
}

function emitIdentityUpdated(user) {
    const plain = user?.toObject ? user.toObject() : user;
    emitToStaff("identityUpdated", {
        userId: String(plain._id),
        status: plain.identityVerification?.status || "none",
    });
    emitToUser(String(plain._id), "identityUpdated", {
        userId: String(plain._id),
        status: plain.identityVerification?.status || "none",
    });
}

function emitNewOrder(order) {
    const plain = order?.toObject ? order.toObject() : order;
    emitToStaff("newOrder", {
        orderId: String(plain._id),
        transactionId: plain.transactionId,
        status: plain.status,
    });
}

function emitOrderUpdated(order) {
    const plain = order?.toObject ? order.toObject() : order;
    emitToStaff("orderUpdated", {
        orderId: String(plain._id),
        transactionId: plain.transactionId,
        status: plain.status,
    });
}

function emitCustomerUpdated(userId, action = "updated") {
    emitToStaff("customerUpdated", { userId: String(userId), action });
}

function emitProductUpdated(productId, action = "updated") {
    emitToStaff("productUpdated", { productId: String(productId), action });
}

function emitUserCreated(userId) {
    emitToStaff("userCreated", { userId: String(userId) });
}

function emitUserUpdated(userId) {
    emitToStaff("userUpdated", { userId: String(userId) });
}

module.exports = {
    init,
    emitTicketCreated,
    emitTicketMessage,
    emitTicketUpdated,
    emitIdentitySubmitted,
    emitIdentityUpdated,
    emitNewOrder,
    emitOrderUpdated,
    emitCustomerUpdated,
    emitProductUpdated,
    emitUserCreated,
    emitUserUpdated,
};
