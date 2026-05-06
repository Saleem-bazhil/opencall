import { closeDatabasePool, query } from "../config/database.js";

async function run(): Promise<void> {
  const columns = await query<{ column_name: string }>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'daily_call_plan_report_rows'
        AND column_name IN (
          'change_type',
          'previous_flex_status',
          'previous_rtpl_status',
          'previous_wip_aging',
          'changed_fields',
          'change_summary'
        )
      ORDER BY column_name
    `,
  );
  const tables = await query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name IN ('report_comparisons', 'report_row_diffs')
      ORDER BY table_name
    `,
  );

  console.log(
    JSON.stringify(
      {
        comparisonColumns: columns.rows.map((row) => row.column_name),
        comparisonTables: tables.rows.map((row) => row.table_name),
      },
      null,
      2,
    ),
  );
}

run()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void closeDatabasePool();
  });
