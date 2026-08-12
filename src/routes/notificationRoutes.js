const express = require("express");
const { getUnreadCount, listNotifications, markRead, markAllRead } = require("../services/notificationService");

function createNotificationRouter({ requireAuth }) {
    const router = express.Router();

    router.get("/", requireAuth, async (req, res) => {
        try {
            const [notifications, unreadCount] = await Promise.all([
                listNotifications(req.session.user.id),
                getUnreadCount(req.session.user.id),
            ]);
            res.json({ notifications, unreadCount });
        } catch (err) {
            res.status(500).json({ error: "Unable to load notifications." });
        }
    });

    router.get("/unread-count", requireAuth, async (req, res) => {
        try {
            const unreadCount = await getUnreadCount(req.session.user.id);
            res.json({ unreadCount });
        } catch (err) {
            res.status(500).json({ error: "Unable to load notifications." });
        }
    });

    router.post("/:id/read", requireAuth, async (req, res) => {
        try {
            const note = await markRead(req.session.user.id, req.params.id);
            if (!note) return res.status(404).json({ error: "Notification not found." });
            res.json({ notification: note });
        } catch (err) {
            res.status(500).json({ error: "Unable to update notification." });
        }
    });

    router.post("/read-all", requireAuth, async (req, res) => {
        try {
            await markAllRead(req.session.user.id);
            res.json({ message: "All notifications marked as read." });
        } catch (err) {
            res.status(500).json({ error: "Unable to update notifications." });
        }
    });

    return router;
}

module.exports = createNotificationRouter;
