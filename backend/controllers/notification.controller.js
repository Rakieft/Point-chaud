const db = require("../config/db");

exports.getMyNotifications = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30",
      [req.user.id]
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Impossible de recuperer les notifications", error: error.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    await db.query("UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?", [
      req.params.id,
      req.user.id
    ]);

    res.json({ message: "Notification marquee comme lue" });
  } catch (error) {
    res.status(500).json({ message: "Impossible de mettre a jour la notification", error: error.message });
  }
};
