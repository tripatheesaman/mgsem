import { NextRequest, NextResponse } from 'next/server';
import pool from '../../../lib/database';
import { ApiResponse } from '../../../types';
import { requireRoleAtLeast } from '@/app/api/middleware';
import { toProperCase } from '@/app/utils/excel';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRoleAtLeast(request, 'superadmin');
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const authorityId = parseInt(id);
    const body = await request.json();
    const { name, designation, is_active } = body;

    if (isNaN(authorityId)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Invalid authority ID'
      }, { status: 400 });
    }

    const client = await pool.connect();
    
    try {
      const updates: string[] = [];
      const values: unknown[] = [];
      let paramCount = 0;

      if (name !== undefined) {
        paramCount++;
        updates.push(`name = $${paramCount}`);
        values.push(toProperCase(name.trim()));
      }

      if (designation !== undefined) {
        paramCount++;
        updates.push(`designation = $${paramCount}`);
        values.push(toProperCase(designation.trim()));
      }

      if (is_active !== undefined) {
        paramCount++;
        updates.push(`is_active = $${paramCount}`);
        values.push(is_active);
      }

      if (updates.length === 0) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'No fields to update'
        }, { status: 400 });
      }

      paramCount++;
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(authorityId);

      const query = `UPDATE checking_authorities 
                     SET ${updates.join(', ')} 
                     WHERE id = $${paramCount}
                     RETURNING *`;

      const result = await client.query(query, values);

      if (result.rows.length === 0) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Checking authority not found'
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
    console.error('Error updating checking authority:', error);
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
  const auth = requireRoleAtLeast(request, 'superadmin');
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const authorityId = parseInt(id);

    if (isNaN(authorityId)) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Invalid authority ID'
      }, { status: 400 });
    }

    const client = await pool.connect();
    
    try {
      // Soft delete by setting is_active to false
      const result = await client.query(
        `UPDATE checking_authorities 
         SET is_active = false, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id`,
        [authorityId]
      );

      if (result.rows.length === 0) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Checking authority not found'
        }, { status: 404 });
      }

      return NextResponse.json<ApiResponse<null>>({
        success: true,
        message: 'Checking authority deactivated successfully'
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error deleting checking authority:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

