import { NextRequest, NextResponse } from 'next/server';
import pool from '../../../../lib/database';
import { requireAuth } from '@/app/api/middleware';
import { ApiResponse } from '../../../../types';

// GET /api/work-orders/:id/checking-authorities - Get checking authorities for a work order
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const workOrderId = parseInt(id);

    if (isNaN(workOrderId)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Invalid work order ID'
      }, { status: 400 });
    }

    const client = await pool.connect();

    try {
      const result = await client.query(`
        SELECT ca.id, ca.name, ca.designation, ca.is_active
        FROM work_order_checking_authorities woca
        JOIN checking_authorities ca ON ca.id = woca.checking_authority_id
        WHERE woca.work_order_id = $1
        ORDER BY ca.name
      `, [workOrderId]);

      return NextResponse.json<ApiResponse<typeof result.rows>>({
        success: true,
        data: result.rows
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching checking authorities:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

// POST /api/work-orders/:id/checking-authorities - Assign checking authority to work order
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const workOrderId = parseInt(id);

    if (isNaN(workOrderId)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Invalid work order ID'
      }, { status: 400 });
    }

    const body = await request.json();
    const { checking_authority_id } = body;

    if (!checking_authority_id || typeof checking_authority_id !== 'number') {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Checking authority ID is required'
      }, { status: 400 });
    }

    const client = await pool.connect();

    try {
      // Check if work order exists
      const workOrderCheck = await client.query(
        'SELECT id FROM work_orders WHERE id = $1',
        [workOrderId]
      );

      if (workOrderCheck.rows.length === 0) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Work order not found'
        }, { status: 404 });
      }

      // Check if checking authority exists and is active
      const authorityCheck = await client.query(
        'SELECT id FROM checking_authorities WHERE id = $1 AND is_active = true',
        [checking_authority_id]
      );

      if (authorityCheck.rows.length === 0) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Checking authority not found or inactive'
        }, { status: 404 });
      }

      // Insert the relationship (ignore if already exists due to UNIQUE constraint)
      const result = await client.query(`
        INSERT INTO work_order_checking_authorities (work_order_id, checking_authority_id)
        VALUES ($1, $2)
        ON CONFLICT (work_order_id, checking_authority_id) DO NOTHING
        RETURNING id
      `, [workOrderId, checking_authority_id]);

      if (result.rows.length === 0) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Checking authority is already assigned to this work order'
        }, { status: 400 });
      }

      return NextResponse.json<ApiResponse<{ id: number }>>({
        success: true,
        data: result.rows[0]
      }, { status: 201 });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error assigning checking authority:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}


