import type { PoolClient } from "pg";
import { cleanRequiredString, normalizePincode } from "../services/normalization/valueNormalizer.js";

interface SlaRuleRow {
  wip_aging_category: string;
  sla_hours: number;
}

interface PincodeAreaMappingRow {
  pincode: string;
  area_name: string;
}

export async function findActiveSlaHoursByCategory(
  client: PoolClient,
): Promise<Map<string, number>> {
  const result = await client.query<SlaRuleRow>(
    `
      SELECT wip_aging_category, sla_hours
      FROM sla_rules
      WHERE is_active = TRUE
    `,
  );

  return new Map(
    result.rows.map((row) => [
      cleanRequiredString(row.wip_aging_category).toUpperCase(),
      row.sla_hours,
    ]),
  );
}

export async function findAreaNameByPincode(
  client: PoolClient,
  regionId: string | null,
): Promise<Map<string, string>> {
  const result = await client.query<PincodeAreaMappingRow>(
    `
      SELECT pincode, area_name
      FROM pincode_area_mappings
      WHERE $1::uuid IS NULL
         OR region_id IS NULL
         OR region_id = $1
      ORDER BY region_id NULLS LAST
    `,
    [regionId],
  );

  return new Map(
    result.rows.map((row) => [
      normalizePincode(row.pincode) ?? row.pincode,
      row.area_name,
    ]),
  );
}
