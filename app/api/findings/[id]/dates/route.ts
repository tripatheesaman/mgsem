import { NextRequest, NextResponse } from 'next/server';
import pool from '../../../../lib/database';
import { requireAuth } from '@/app/api/middleware';
import { ApiResponse, FindingDate } from '../../../../types';

// GET /api/findings/:id/dates - Get all dates for a finding
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const findingId = parseInt(id);

  if (isNaN(findingId)) {
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Invalid finding ID'
    }, { status: 400 });
  }

  const client = await pool.connect();

  try {
    const result = await client.query(
      `SELECT id, finding_id, finding_date, start_time, end_time, is_completed, created_at, updated_at
       FROM finding_dates
       WHERE finding_id = $1
       ORDER BY finding_date DESC`,
      [findingId]
    );

    return NextResponse.json<ApiResponse<FindingDate[]>>({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching finding dates:', error);
    return NextResponse.json<ApiResponse<null>>(
      { success: false, error: 'Failed to fetch finding dates' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// POST /api/findings/:id/dates - Add a new date entry
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const findingId = parseInt(id);

  if (isNaN(findingId)) {
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Invalid finding ID'
    }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { finding_date, start_time, end_time, is_completed = false } = body;

    if (!finding_date || !start_time) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Finding date and start time are required'
      }, { status: 400 });
    }

    // Validate time format
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(start_time)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Invalid start time format. Use HH:MM format'
      }, { status: 400 });
    }
    if (end_time && !timeRegex.test(end_time)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Invalid end time format. Use HH:MM format'
      }, { status: 400 });
    }

    // Validate time range
    if (end_time) {
      const start = new Date(`2000-01-01T${start_time}`);
      const end = new Date(`2000-01-01T${end_time}`);
      if (start >= end) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'End time must be after start time'
        }, { status: 400 });
      }
    }

    const client = await pool.connect();

    try {
      // Check if finding exists
      const findingCheck = await client.query(
        'SELECT id FROM findings WHERE id = $1',
        [findingId]
      );

      if (findingCheck.rows.length === 0) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Finding not found'
        }, { status: 404 });
      }

      // Ensure the previous latest finding_date (if any) has an end_time before allowing new entry
      const prevRes = await client.query(
        `SELECT id, finding_date, end_time FROM finding_dates WHERE finding_id = $1 ORDER BY (finding_date::date) DESC LIMIT 1`,
        [findingId]
      );
      if (prevRes.rows.length > 0) {
        const prev = prevRes.rows[0];
        if (prev.end_time === null || String(prev.end_time).trim() === '') {
          return NextResponse.json<ApiResponse<unknown>>({
            success: false,
            error: 'Cannot add new date: previous finding date is missing an end time',
            data: { previous_finding_date: prev }
          }, { status: 400 });
        }
      }

      // Insert the new finding date
      const insertRes = await client.query(
        `INSERT INTO finding_dates (finding_id, finding_date, start_time, end_time, is_completed)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, finding_id, finding_date, start_time, end_time, is_completed, created_at, updated_at`,
        [findingId, finding_date, start_time, end_time || null, is_completed]
      );

      const inserted = insertRes.rows[0];

      // Mark all other dates for this finding as completed
      await client.query(
        `UPDATE finding_dates SET is_completed = TRUE, updated_at = CURRENT_TIMESTAMP WHERE finding_id = $1 AND id != $2`,
        [findingId, inserted.id]
      );

      return NextResponse.json<ApiResponse<FindingDate>>({
        success: true,
        data: inserted
      }, { status: 201 });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating finding date:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

