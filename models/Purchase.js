const pool = require("../config/db");

const Purchase = {
  async create(data) {
    const { deviceId, email, reference, amount, isPremium = true } = data;

    const result = await pool.query(
      `INSERT INTO purchases (device_id, email, reference, amount, is_premium)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [deviceId, email, reference, amount, isPremium],
    );

    return result.rows[0];
  },

  async findByDeviceId(deviceId) {
    const result = await pool.query(
      `SELECT * FROM purchases WHERE device_id = $1`,
      [deviceId],
    );

    return result.rows[0];
  },

  async findByReference(reference) {
    const result = await pool.query(
      `SELECT * FROM purchases WHERE reference = $1`,
      [reference],
    );

    return result.rows[0];
  },

  async updatePremium(deviceId, status = true) {
    const result = await pool.query(
      `UPDATE purchases 
       SET is_premium = $1, updated_at = CURRENT_TIMESTAMP
       WHERE device_id = $2
       RETURNING *`,
      [status, deviceId],
    );

    return result.rows[0];
  },
};

module.exports = Purchase;
