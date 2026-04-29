const db = require("../config/db");

exports.createNotificationForUser = async (userId, message) => {
  await db.query("INSERT INTO notifications (user_id, message) VALUES (?, ?)", [userId, message]);
};

exports.createNotificationForRole = async (role, message) => {
  const [users] = await db.query("SELECT id FROM users WHERE role = ?", [role]);

  await Promise.all(users.map(user => exports.createNotificationForUser(user.id, message)));
};
