import { NextRequest, NextResponse } from 'next/server';
import pool from '../../../lib/database';
import { ApiResponse } from '../../../types';
import { requireRoleAtLeast } from '@/app/api/middleware';
import { toProperCase } from '@/app/utils/excel';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRoleAtLeast(request, 'admin');
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const complaintId = parseInt(id);
    const body = await request.json();
    const { complaint } = body;

    if (isNaN(complaintId)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Invalid complaint ID'
      }, { status: 400 });
    }

    if (!complaint || !complaint.trim()) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Complaint text is required'
      }, { status: 400 });
    }

    const client = await pool.connect();
    
    try {
      const result = await client.query(
        `UPDATE work_order_complaints 
         SET complaint = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [toProperCase(complaint.trim()), complaintId]
      );

      if (result.rows.length === 0) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Complaint not found'
        }, { status: 404 });
      }

      return NextResponse.json<ApiResponse<typeof result.rows[0]>>({
        success: true,
        data: result.rows[0]
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating complaint:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRoleAtLeast(request, 'admin');
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const complaintId = parseInt(id);

    if (isNaN(complaintId)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Invalid complaint ID'
      }, { status: 400 });
    }

    const client = await pool.connect();
    
    try {
      const result = await client.query(
        'DELETE FROM work_order_complaints WHERE id = $1 RETURNING id',
        [complaintId]
      );

      if (result.rows.length === 0) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Complaint not found'
        }, { status: 404 });
      }

      return NextResponse.json<ApiResponse<null>>({
        success: true,
        message: 'Complaint deleted successfully'
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error deleting complaint:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

