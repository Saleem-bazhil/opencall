import { pool, closeDatabasePool } from './src/config/database.js';
import fs from 'fs';
import path from 'path';

async function seedPincodes() {
  const client = await pool.connect();
  try {
    const csvData = fs.readFileSync(path.join(process.cwd(), 'pincodes.csv'), 'utf8');
    const lines = csvData.split('\n').map(line => line.trim()).filter(line => line.length > 0 && line !== 'pincode,area_name');

    // Get Chennai region
    let regionResult = await client.query('SELECT id FROM regions WHERE name = $1 LIMIT 1', ['Chennai']);
    if (regionResult.rows.length === 0) {
      console.log('Chennai region not found. Inserting...');
      await client.query(`INSERT INTO regions (code, name) VALUES ('ASPS01461', 'Chennai')`);
      regionResult = await client.query('SELECT id FROM regions WHERE name = $1 LIMIT 1', ['Chennai']);
    }
    const regionId = regionResult.rows[0].id;

    // We only keep the FIRST area_name for each pincode, as the column is UNIQUE.
    const map = new Map<string, string>();
    for (const line of lines) {
      let [pincode, areaName] = line.split(',');
      if (pincode && areaName && !map.has(pincode)) {
        areaName = areaName.replace(/\[reference:\d+\]/g, '').trim();
        map.set(pincode, areaName);
      }
    }

    let insertedCount = 0;
    for (const [pincode, areaName] of map.entries()) {
      await client.query(`
        INSERT INTO pincode_area_mappings (pincode, area_name, region_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (pincode) DO UPDATE
        SET area_name = EXCLUDED.area_name,
            region_id = EXCLUDED.region_id
      `, [pincode, areaName, regionId]);
      insertedCount++;
    }

    console.log(`Successfully seeded ${insertedCount} pincode area mappings for Chennai.`);
  } catch (error) {
    console.error('Failed to seed pincodes:', error);
  } finally {
    client.release();
    await closeDatabasePool();
  }
}

seedPincodes();
