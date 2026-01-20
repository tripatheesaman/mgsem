import { PoolClient } from 'pg';
import pool from '../lib/database';
import { getWorkTypeCode } from './excel';

/**
 * Generate the next work order number for a given work type
 * Format: {WORKTYPECODE}-{NUMBER} (e.g., E-006)
 */
export async function generateWorkOrderNumber(workType: string, workTypeCodeOverride?: string): Promise<string> {
  const client = await pool.connect();

  try {
    const workTypeCode = workTypeCodeOverride?.trim() || getWorkTypeCode(workType);

    await client.query('BEGIN');
    const nextCounter = await getNextCounter(client, workTypeCode);
    await client.query('COMMIT');

    const paddedNumber = String(nextCounter).padStart(3, '0');
    return `${workTypeCode}-${paddedNumber}`;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Reset counter for a specific work type code (admin only)
 */
export async function resetWorkTypeCounter(workTypeCode: string): Promise<void> {
  const client = await pool.connect();
  
  try {
    await client.query(
      `UPDATE work_type_counters 
       SET counter = 0, updated_at = CURRENT_TIMESTAMP
       WHERE work_type_code = $1`,
      [workTypeCode]
    );
  } finally {
    client.release();
  }
}

/**
 * Reset all work type counters (admin only)
 */
export async function resetAllWorkTypeCounters(): Promise<void> {
  const client = await pool.connect();
  
  try {
    await client.query(
      `UPDATE work_type_counters 
       SET counter = 0, updated_at = CURRENT_TIMESTAMP`
    );
  } finally {
    client.release();
  }
}

/**
 * Get current counter value for a work type
 */
export async function getWorkTypeCounter(workType: string): Promise<number> {
  const client = await pool.connect();
  
  try {
    const workTypeCode = getWorkTypeCode(workType);
    const result = await client.query(
      `SELECT counter FROM work_type_counters WHERE work_type_code = $1`,
      [workTypeCode]
    );
    
    if (result.rows.length === 0) {
      return 0;
    }
    
    return result.rows[0].counter;
  } finally {
    client.release();
  }
}

/**
 * Derive and persist the next counter value for a work type.
 * Uses the greater of the stored counter and the latest existing work order
 * number for that type to avoid skipping or repeating numbers.
 */
async function getNextCounter(client: PoolClient, workTypeCode: string): Promise<number> {
  // Latest sequence from existing work orders (only well-formed codes)
  const latestResult = await client.query(
    `SELECT COALESCE(MAX(CAST(split_part(work_order_no, '-', 2) AS INTEGER)), 0) AS max_seq
     FROM work_orders
     WHERE work_order_no ~* ('^' || $1 || '-[0-9]+$')`,
    [workTypeCode]
  );
  const latestFromOrders = Number(latestResult.rows[0]?.max_seq || 0);

  // Lock the counter row if it exists
  const counterResult = await client.query(
    `SELECT counter FROM work_type_counters WHERE work_type_code = $1 FOR UPDATE`,
    [workTypeCode]
  );
  const storedCounter = Number(counterResult.rows[0]?.counter || 0);

  const nextCounter = Math.max(storedCounter, latestFromOrders) + 1;

  if (counterResult.rows.length === 0) {
    await client.query(
      `INSERT INTO work_type_counters (work_type_code, counter) VALUES ($1, $2)`,
      [workTypeCode, nextCounter]
    );
  } else {
    await client.query(
      `UPDATE work_type_counters 
       SET counter = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE work_type_code = $1`,
      [workTypeCode, nextCounter]
    );
  }

  return nextCounter;
}
