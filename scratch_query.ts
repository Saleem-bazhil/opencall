import { query, closeDatabasePool } from './apps/api/src/config/database.js';

async function run() {
  try {
    const regionId = "";
    const result = await query(
      `
      SELECT pincode, area_name
      FROM pincode_area_mappings
      WHERE NULLIF($1, '')::uuid IS NULL
         OR region_id IS NULL
         OR region_id = NULLIF($1, '')::uuid
      ORDER BY region_id NULLS LAST
      LIMIT 5
      `,
      [regionId]
    );
    console.log(result.rows);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await closeDatabasePool();
  }
}
run();
