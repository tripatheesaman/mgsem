import { NextRequest, NextResponse } from 'next/server';
import { previewNextWorkOrderNumber } from '@/app/utils/workOrderNumber';
import { ApiResponse } from '@/app/types';
import { requireRoleAtLeast } from '@/app/api/middleware';

export async function POST(request: NextRequest) {
  const auth = requireRoleAtLeast(request, 'user');
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { work_type } = body;

    if (!work_type || typeof work_type !== 'string') {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Work type is required'
      }, { status: 400 });
    }

    const workOrderNumber = await previewNextWorkOrderNumber(work_type);

    return NextResponse.json<ApiResponse<{ work_order_no: string }>>({
      success: true,
      data: { work_order_no: workOrderNumber }
    });
  } catch (error) {
    console.error('Error generating work order number:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

