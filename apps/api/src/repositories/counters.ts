// Record codes (RSK-0001, INC-0001) are handed out by the database, per organisation.
//
// The UPDATE below takes a row lock on the organisation's counter and keeps it until the surrounding transaction commits,
// so two requests creating records at the same moment are made to take turns and can never receive the same number.
// LAST_INSERT_ID(expr) hands the new value back on the same connection without a second round trip to the table.
import type { PoolConnection } from '../core/db';
import { one, run } from '../core/db';

export type CounterName = 'risk' | 'incident';

// Fixed internal names, never user input, because identifiers cannot be bound as parameters.
const SOURCE: Record<CounterName, { table: string; codeColumn: string; prefix: string; width: number }> = {
  risk: { table: 'risk', codeColumn: 'risk_code', prefix: 'RSK-', width: 4 },
  incident: { table: 'incident', codeColumn: 'incident_code', prefix: 'INC-', width: 4 },
};

export const formatCode = (name: CounterName, n: number): string => `${SOURCE[name].prefix}${String(n).padStart(SOURCE[name].width, '0')}`;

/** Must be called on a connection inside a transaction. */
export async function nextCode(conn: PoolConnection, organisationId: number, name: CounterName): Promise<string> {
  const bump = () =>
    run(conn, 'UPDATE organisation_counter SET current_value = LAST_INSERT_ID(current_value + 1) WHERE organisation_id = ? AND counter_name = ?', [
      organisationId,
      name,
    ]);
  let result = await bump();
  if (result.affectedRows === 0) {
    // First use in this organisation: start after the highest code already present (rows loaded by a seed or an import).
    const s = SOURCE[name];
    await run(
      conn,
      `INSERT IGNORE INTO organisation_counter (organisation_id, counter_name, current_value)
       SELECT ?, ?, COALESCE(MAX(CAST(SUBSTRING(${s.codeColumn}, ?) AS UNSIGNED)), 0) FROM ${s.table} WHERE organisation_id = ?`,
      [organisationId, name, s.prefix.length + 1, organisationId],
    );
    result = await bump();
  }
  const row = await one<{ n: number }>(conn, 'SELECT LAST_INSERT_ID() AS n');
  return formatCode(name, row!.n);
}
