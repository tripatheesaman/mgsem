import { NextRequest, NextResponse } from 'next/server';
import pool from '../../lib/database';
import { ApiResponse } from '../../types';
import { requireRoleAtLeast } from '@/app/api/middleware';
import { toProperCase } from '@/app/utils/excel';

export async function POST(request: NextRequest) {
  const auth = requireRoleAtLeast(request, 'superadmin');
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { name, designation } = body;

    if (!name || !designation) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Name and designation are required'
      }, { status: 400 });
    }

    const client = await pool.connect();
    
    try {
      const result = await client.query(
        `INSERT INTO checking_authorities (name, designation)
         VALUES ($1, $2)
         RETURNING *`,
        [toProperCase(name.trim()), toProperCase(designation.trim())]
      );

      return NextResponse.json<ApiResponse<typeof result.rows[0]>>({
        success: true,
        data: result.rows[0]
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating checking authority:', error);
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
    const activeOnly = searchParams.get('active_only') === 'true';

    const client = await pool.connect();
    
    try {
      let query = 'SELECT * FROM checking_authorities';
      const params: unknown[] = [];

      if (activeOnly) {
        query += ' WHERE is_active = true';
      }

      query += ' ORDER BY name ASC';

      const result = await client.query(query, params);

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

