import { NextRequest, NextResponse } from 'next/server';
import pool from '../../lib/database';
import { WorkOrder, ApiResponse } from '../../types';
import { requireRoleAtLeast } from '@/app/api/middleware';
import { generateWorkOrderNumber } from '../../utils/workOrderNumber';
import { toProperCase } from '../../utils/excel';

export async function POST(request: NextRequest) {
  const auth = requireRoleAtLeast(request, 'user');
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const {
      work_order_no, // Optional - will be auto-generated if not provided
      work_order_date,
      equipment_number,
      km_hrs,
      requested_by,
      work_type,
      work_type_code,
      job_allocation_time,
      description,
      reference_document,
      frs_reference_number,
      complaints // Array of complaint strings
    } = body;

    const client = await pool.connect();
    
    try {
      // Auto-generate work order number if not provided
      let finalWorkOrderNo = work_order_no;
      if (!finalWorkOrderNo || finalWorkOrderNo.trim() === '') {
        finalWorkOrderNo = await generateWorkOrderNumber(work_type, work_type_code);
      } else {
        // Check if manually provided work order number already exists
        const existingOrder = await client.query(
          'SELECT id, work_order_no FROM work_orders WHERE work_order_no = $1',
          [finalWorkOrderNo]
        );

        if (existingOrder.rows.length > 0) {
          return NextResponse.json<ApiResponse<null>>({
            success: false,
            error: `Work order number "${finalWorkOrderNo}" already exists. Please use a unique number.`
          }, { status: 400 });
        }
      }

      // Validate that work_order_date is in YYYY-MM-DD format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(work_order_date)) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Invalid work order date format. Expected YYYY-MM-DD format.'
        }, { status: 400 });
      }

      // Convert description to proper case for complaints
      const properCaseDescription = toProperCase((description ?? '').toString().trim());

      const result = await client.query(`
        INSERT INTO work_orders (
          work_order_no, work_order_date, equipment_number, km_hrs,
          requested_by, requested_by_id, work_type, job_allocation_time, description, reference_document, frs_reference_number, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `, [
        finalWorkOrderNo,
        work_order_date,
        equipment_number,
        km_hrs,
        requested_by,
        auth.user.userId,
        work_type,
        job_allocation_time,
        properCaseDescription,
        reference_document || null,
        frs_reference_number || null,
        'pending'
      ]);

      const workOrder = result.rows[0];

      // Automatically link all active checking authorities to this work order
      const activeAuthorities = await client.query(
        'SELECT id FROM checking_authorities WHERE is_active = true'
      );
      
      for (const authority of activeAuthorities.rows) {
        await client.query(
          `INSERT INTO work_order_checking_authorities (work_order_id, checking_authority_id)
           VALUES ($1, $2)
           ON CONFLICT (work_order_id, checking_authority_id) DO NOTHING`,
          [workOrder.id, authority.id]
        );
      }

      // Create complaints if provided
      if (complaints && Array.isArray(complaints) && complaints.length > 0) {
        // Use description as default complaint if no complaints provided
        const complaintsToInsert = complaints.length > 0 
          ? complaints.filter(c => c && c.trim())
          : [properCaseDescription];

        for (const complaint of complaintsToInsert) {
          if (complaint && complaint.trim()) {
            await client.query(
              `INSERT INTO work_order_complaints (work_order_id, complaint)
               VALUES ($1, $2)`,
              [workOrder.id, toProperCase(complaint.trim())]
            );
          }
        }
      } else if (properCaseDescription) {
        // If no complaints provided, use description as single complaint
        await client.query(
          `INSERT INTO work_order_complaints (work_order_id, complaint)
           VALUES ($1, $2)`,
          [workOrder.id, properCaseDescription]
        );
      }

      return NextResponse.json<ApiResponse<WorkOrder>>({
        success: true,
        data: workOrder
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error creating work order:', error);
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
    const status = searchParams.get('status');

    const client = await pool.connect();
    
    try {
      let query = 'SELECT * FROM work_orders ORDER BY created_at DESC';
      let params: string[] = [];

      if (status && status !== 'all') {
        // Handle multiple status values separated by commas
        if (status.includes(',')) {
          const statusArray = status.split(',').map(s => s.trim());
          const placeholders = statusArray.map((_, index) => `$${index + 1}`).join(', ');
          query = `SELECT * FROM work_orders WHERE status IN (${placeholders}) ORDER BY created_at DESC`;
          params = statusArray;
        } else {
          query = 'SELECT * FROM work_orders WHERE status = $1 ORDER BY created_at DESC';
          params = [status];
        }
      }

      const result = await client.query(query, params);
      const workOrders = result.rows;

      return NextResponse.json<ApiResponse<WorkOrder[]>>({
        success: true,
        data: workOrders
      });

    } finally {
      client.release();
    }

  } catch {
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
} 