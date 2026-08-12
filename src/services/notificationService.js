const { Notification } = require("../models/Notification");

async function createNotification({ userId, type, title, message, link, meta }) {
    if (!userId) return null;
    return Notification.create({
        userId,
        type,
        title,
        message,
        link: link || "",
        meta: meta || null,
        read: false,
    });
}

async function getUnreadCount(userId) {
    return Notification.countDocuments({ userId, read: false });
}

async function listNotifications(userId, { limit = 30 } = {}) {
    return Notification.find({ userId })
        .sort({ createdAt: -1 })
        .limit(Math.min(limit, 50))
        .lean();
}

async function markRead(userId, notificationId) {
    return Notification.findOneAndUpdate(
        { _id: notificationId, userId },
        { $set: { read: true } },
        { new: true }
    ).lean();
}

async function markAllRead(userId) {
    await Notification.updateMany({ userId, read: false }, { $set: { read: true } });
}

module.exports = {
    createNotification,
    getUnreadCount,
    listNotifications,
    markRead,
    markAllRead,
};
