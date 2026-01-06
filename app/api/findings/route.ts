import { NextRequest, NextResponse } from 'next/server';
import pool from '../../lib/database';
import { Finding, ApiResponse } from '../../types';
import { requireRoleAtLeast } from '@/app/api/middleware';

export async function POST(request: NextRequest) {
  const auth = requireRoleAtLeast(request, 'admin');
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await request.json();
    const {
      work_order_id,
      description,
      reference_image,
      finding_date,
      start_time,
      end_time,
      is_completed = false
    } = body;

    // Validation
    if (!work_order_id || !description) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Work order ID and description are required'
      }, { status: 400 });
    }

    if (typeof work_order_id !== 'number' || work_order_id <= 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Invalid work order ID'
      }, { status: 400 });
    }

      if (description.trim().length === 0) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Troubleshooting description cannot be empty'
        }, { status: 400 });
      }

      if (description.length > 1000) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Troubleshooting description must be less than 1000 characters'
        }, { status: 400 });
      }

      // Validate time format if provided
      if (start_time) {
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(start_time)) {
          return NextResponse.json<ApiResponse<null>>({
            success: false,
            error: 'Invalid start time format. Use HH:MM format'
          }, { status: 400 });
        }
      }
      if (end_time) {
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(end_time)) {
          return NextResponse.json<ApiResponse<null>>({
            success: false,
            error: 'Invalid end time format. Use HH:MM format'
          }, { status: 400 });
        }
        // Validate time range
        if (start_time) {
          const start = new Date(`2000-01-01T${start_time}`);
          const end = new Date(`2000-01-01T${end_time}`);
          if (start >= end) {
            return NextResponse.json<ApiResponse<null>>({
              success: false,
              error: 'End time must be after start time'
            }, { status: 400 });
          }
        }
      }

    const client = await pool.connect();
    
    try {
      // Check if work order exists and is ongoing
      const workOrderCheck = await client.query(
        'SELECT id, status FROM work_orders WHERE id = $1',
        [work_order_id]
      );

      if (workOrderCheck.rows.length === 0) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Work order not found'
        }, { status: 404 });
      }

      const workOrderStatus = workOrderCheck.rows[0].status;
      
      if (workOrderStatus === 'pending') {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Cannot add troubleshooting to pending work orders. Work order must be approved first.'
        }, { status: 400 });
      }

      if (workOrderStatus === 'completed') {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Cannot add troubleshooting to completed work orders'
        }, { status: 400 });
      }

      const result = await client.query(`
        INSERT INTO findings (
          work_order_id, description, reference_image
        ) VALUES ($1, $2, $3)
        RETURNING *
      `, [
        work_order_id,
        description.trim(),
        reference_image || null
      ]);

      const finding = result.rows[0];

      // Create finding_date entry if date and time provided
      if (finding_date && start_time) {
        await client.query(`
          INSERT INTO finding_dates (
            finding_id, finding_date, start_time, end_time, is_completed
          ) VALUES ($1, $2, $3, $4, $5)
        `, [
          finding.id,
          finding_date,
          start_time,
          end_time || null,
          is_completed
        ]);
      }

      return NextResponse.json<ApiResponse<Finding>>({
        success: true,
        data: finding
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error creating troubleshooting:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
} 