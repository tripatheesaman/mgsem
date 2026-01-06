import { NextRequest, NextResponse } from 'next/server';
import pool from '../../../../lib/database';
import { requireAuth, requireRoleAtLeast } from '@/app/api/middleware';
import { ApiResponse } from '../../../../types';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// POST /api/work-orders/:id/signed-document - Upload signed document
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

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'No file provided'
      }, { status: 400 });
    }

    // Only allow PDF files
    if (file.type !== 'application/pdf') {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Only PDF files are allowed for signed documents'
      }, { status: 400 });
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'File size too large. Maximum size is 10MB.'
      }, { status: 400 });
    }

    const client = await pool.connect();

    try {
      // Check if work order exists and is completed
      const workOrderCheck = await client.query(
        'SELECT id, work_order_no, status, completion_approved_at FROM work_orders WHERE id = $1',
        [workOrderId]
      );

      if (workOrderCheck.rows.length === 0) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Work order not found'
        }, { status: 404 });
      }

      const workOrder = workOrderCheck.rows[0];

      // Only allow upload if completion is approved
      if (!workOrder.completion_approved_at) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Cannot upload signed document. Work order completion must be approved first.'
        }, { status: 400 });
      }

      // Delete old document if exists
      if (workOrder.signed_document) {
        const oldFilePath = join(process.cwd(), 'public', workOrder.signed_document);
        if (existsSync(oldFilePath)) {
          try {
            await unlink(oldFilePath);
          } catch (error) {
            console.error('Error deleting old document:', error);
          }
        }
      }

      // Create unique filename
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 15);
      const fileName = `${timestamp}-${randomString}.pdf`;

      // Use work order number as subdirectory
      const subDir = workOrder.work_order_no || 'misc';

      // Create directory
      const uploadDir = join(process.cwd(), 'public', 'uploads', subDir);
      if (!existsSync(uploadDir)) {
        await mkdir(uploadDir, { recursive: true });
      }

      const filePath = join(uploadDir, fileName);
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(new Uint8Array(bytes));

      // Write file
      await writeFile(filePath, buffer);

      // Return relative path from public directory
      const relativePath = `uploads/${subDir}/${fileName}`;

      // Update work order with signed document path
      await client.query(
        'UPDATE work_orders SET signed_document = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [relativePath, workOrderId]
      );

      return NextResponse.json<ApiResponse<{ path: string }>>({
        success: true,
        data: { path: relativePath }
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error uploading signed document:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

// DELETE /api/work-orders/:id/signed-document - Delete signed document (superadmin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRoleAtLeast(request, 'superadmin');
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
      // Get work order with signed document path
      const workOrderResult = await client.query(
        'SELECT id, signed_document FROM work_orders WHERE id = $1',
        [workOrderId]
      );

      if (workOrderResult.rows.length === 0) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Work order not found'
        }, { status: 404 });
      }

      const workOrder = workOrderResult.rows[0];

      if (!workOrder.signed_document) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'No signed document found for this work order'
        }, { status: 404 });
      }

      // Delete file from filesystem
      const filePath = join(process.cwd(), 'public', workOrder.signed_document);
      if (existsSync(filePath)) {
        try {
          await unlink(filePath);
        } catch (error) {
          console.error('Error deleting file:', error);
        }
      }

      // Update work order to remove signed document path
      await client.query(
        'UPDATE work_orders SET signed_document = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [workOrderId]
      );

      return NextResponse.json<ApiResponse<null>>({
        success: true,
        message: 'Signed document deleted successfully'
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error deleting signed document:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

