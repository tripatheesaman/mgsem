import { NextRequest, NextResponse } from 'next/server';
import pool from '../../../../../lib/database';
import { requireAuth } from '@/app/api/middleware';
import { ApiResponse } from '../../../../../types';

// DELETE /api/work-orders/:id/checking-authorities/:authorityId - Remove checking authority from work order
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; authorityId: string }> }
) {
  const auth = requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id, authorityId } = await params;
    const workOrderId = parseInt(id);
    const checkingAuthorityId = parseInt(authorityId);

    if (isNaN(workOrderId) || isNaN(checkingAuthorityId)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Invalid work order ID or checking authority ID'
      }, { status: 400 });
    }

    const client = await pool.connect();

    try {
      const result = await client.query(`
        DELETE FROM work_order_checking_authorities
        WHERE work_order_id = $1 AND checking_authority_id = $2
        RETURNING id
      `, [workOrderId, checkingAuthorityId]);

      if (result.rows.length === 0) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Checking authority not found for this work order'
        }, { status: 404 });
      }

      return NextResponse.json<ApiResponse<null>>({
        success: true,
        message: 'Checking authority removed successfully'
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error removing checking authority:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}
