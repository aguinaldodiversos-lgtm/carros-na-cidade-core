const pool = require("../../config/db");

async function create(data) {
  const result = await pool.query(
    `INSERT INTO ads
     (dealership_id, vehicle_id, title, description, platform)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [
      data.dealership_id,
      data.vehicle_id,
      data.title,
      data.description,
      data.platform
    ]
  );

  return result.rows[0];
}

async function findByVehicle(vehicleId, dealershipId) {
  const result = await pool.query(
    `SELECT * FROM ads
     WHERE vehicle_id = $1 AND dealership_id = $2
     ORDER BY created_at DESC`,
    [vehicleId, dealershipId]
  );

  return result.rows;
}

module.exports = {
  create,
  findByVehicle
};
