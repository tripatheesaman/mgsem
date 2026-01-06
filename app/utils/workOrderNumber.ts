import pool from '../lib/database';
import { getWorkTypeCode } from './excel';

/**
 * Generate the next work order number for a given work type
 * Format: {WORKTYPECODE}-{NUMBER} (e.g., E-006)
 */
export async function generateWorkOrderNumber(workType: string): Promise<string> {
  const client = await pool.connect();
  
  try {
    const workTypeCode = getWorkTypeCode(workType);
    
    // Get or create counter for this work type
    const counterResult = await client.query(
      `INSERT INTO work_type_counters (work_type_code, counter)
       VALUES ($1, 1)
       ON CONFLICT (work_type_code) 
       DO UPDATE SET counter = work_type_counters.counter + 1, updated_at = CURRENT_TIMESTAMP
       RETURNING counter`,
      [workTypeCode]
    );
    
    const counter = counterResult.rows[0].counter;
    const paddedNumber = String(counter).padStart(3, '0');
    
    return `${workTypeCode}-${paddedNumber}`;
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

