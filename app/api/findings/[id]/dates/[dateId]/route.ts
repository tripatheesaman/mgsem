import { NextRequest, NextResponse } from 'next/server';
import pool from '../../../../../lib/database';
import { requireAuth } from '@/app/api/middleware';
import { ApiResponse, FindingDate } from '../../../../../types';

// PUT /api/findings/:id/dates/:dateId - Update a finding date
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dateId: string }> }
) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id, dateId } = await params;
  const findingId = parseInt(id);
  const findingDateId = parseInt(dateId);

  if (isNaN(findingId) || isNaN(findingDateId)) {
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Invalid finding ID or date ID'
    }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { finding_date, start_time, end_time, is_completed } = body;

    const client = await pool.connect();

    try {
      // Validate time format if provided
      if (start_time !== undefined && start_time !== null && start_time !== '') {
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(start_time)) {
          return NextResponse.json<ApiResponse<null>>({
            success: false,
            error: 'Invalid start time format. Use HH:MM format'
          }, { status: 400 });
        }
      }
      if (end_time !== undefined && end_time !== null && end_time !== '') {
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(end_time)) {
          return NextResponse.json<ApiResponse<null>>({
            success: false,
            error: 'Invalid end time format. Use HH:MM format'
          }, { status: 400 });
        }
      }

      // Validate time range
      if (start_time && end_time && end_time !== '') {
        const start = new Date(`2000-01-01T${start_time}`);
        const end = new Date(`2000-01-01T${end_time}`);
        if (start >= end) {
          return NextResponse.json<ApiResponse<null>>({
            success: false,
            error: 'End time must be after start time'
          }, { status: 400 });
        }
      }

      const updateFields: string[] = [];
      const updateValues: unknown[] = [];
      let paramIndex = 1;

      if (finding_date !== undefined) {
        updateFields.push(`finding_date = $${paramIndex++}`);
        updateValues.push(finding_date);
      }
      if (start_time !== undefined) {
        updateFields.push(`start_time = $${paramIndex++}`);
        updateValues.push(start_time);
      }
      if (end_time !== undefined) {
        updateFields.push(`end_time = $${paramIndex++}`);
        updateValues.push(end_time === '' ? null : end_time);
      }
      if (is_completed !== undefined) {
        updateFields.push(`is_completed = $${paramIndex++}`);
        updateValues.push(is_completed);
      }

      if (updateFields.length === 0) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'No fields to update'
        }, { status: 400 });
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      updateValues.push(findingId, findingDateId);

      const result = await client.query(
        `UPDATE finding_dates 
         SET ${updateFields.join(', ')}
         WHERE finding_id = $${paramIndex++} AND id = $${paramIndex}
         RETURNING *`,
        updateValues
      );

      if (result.rows.length === 0) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Finding date not found'
        }, { status: 404 });
      }

      return NextResponse.json<ApiResponse<FindingDate>>({
        success: true,
        data: result.rows[0]
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating finding date:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

// DELETE /api/findings/:id/dates/:dateId - Delete a finding date
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dateId: string }> }
) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { id, dateId } = await params;
  const findingId = parseInt(id);
  const findingDateId = parseInt(dateId);

  if (isNaN(findingId) || isNaN(findingDateId)) {
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Invalid finding ID or date ID'
    }, { status: 400 });
  }

  const client = await pool.connect();

  try {
    const result = await client.query(
      'DELETE FROM finding_dates WHERE finding_id = $1 AND id = $2 RETURNING id',
      [findingId, findingDateId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Finding date not found'
      }, { status: 404 });
    }

    return NextResponse.json<ApiResponse<null>>({
      success: true,
      message: 'Finding date deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting finding date:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  } finally {
    client.release();
  }
}

