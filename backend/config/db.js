const mysql = require("mysql2");

const HAITI_TIMEZONE_OFFSET = process.env.DB_TIMEZONE_OFFSET || "-05:00";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: HAITI_TIMEZONE_OFFSET
});

pool.on("connection", connection => {
  connection.query("SET time_zone = ?", [HAITI_TIMEZONE_OFFSET], error => {
    if (error) {
      console.error("Impossible d'appliquer le fuseau horaire Haiti a MySQL :", error.message);
    }
  });
});

pool.getConnection((err, connection) => {
  if (err) {
    console.error("Erreur DB :", err.message);
    return;
  }

  console.log("Connecte a MySQL");
  connection.release();
});

module.exports = pool.promise();
