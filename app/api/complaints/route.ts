import { NextRequest, NextResponse } from 'next/server';
import pool from '../../lib/database';
import { ApiResponse } from '../../types';
import { requireRoleAtLeast } from '@/app/api/middleware';
import { toProperCase } from '@/app/utils/excel';

export async function POST(request: NextRequest) {
  const auth = requireRoleAtLeast(request, 'user');
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { work_order_id, complaints } = body;

    if (!work_order_id || !complaints || !Array.isArray(complaints)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Work order ID and complaints array are required'
      }, { status: 400 });
    }

    if (complaints.length === 0) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'At least one complaint is required'
      }, { status: 400 });
    }

    const client = await pool.connect();
    
    try {
      // Check if work order exists
      const workOrderCheck = await client.query(
        'SELECT id FROM work_orders WHERE id = $1',
        [work_order_id]
      );

      if (workOrderCheck.rows.length === 0) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Work order not found'
        }, { status: 404 });
      }

      // Insert complaints in proper case
      const insertedComplaints = [];
      for (const complaint of complaints) {
        if (complaint && complaint.trim()) {
          const properCaseComplaint = toProperCase(complaint.trim());
          const result = await client.query(
            `INSERT INTO work_order_complaints (work_order_id, complaint)
             VALUES ($1, $2)
             RETURNING *`,
            [work_order_id, properCaseComplaint]
          );
          insertedComplaints.push(result.rows[0]);
        }
      }

      return NextResponse.json<ApiResponse<typeof insertedComplaints>>({
        success: true,
        data: insertedComplaints
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating complaints:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = requireRoleAtLeast(request, 'user');
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const workOrderId = searchParams.get('work_order_id');

    if (!workOrderId) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Work order ID is required'
      }, { status: 400 });
    }

    const client = await pool.connect();
    
    try {
      const result = await client.query(
        `SELECT * FROM work_order_complaints 
         WHERE work_order_id = $1 
         ORDER BY created_at ASC`,
        [workOrderId]
      );

      return NextResponse.json<ApiResponse<typeof result.rows>>({
        success: true,
        data: result.rows
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching complaints:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

