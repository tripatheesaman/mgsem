import { NextRequest, NextResponse } from 'next/server';
import { resetAllWorkTypeCounters, resetWorkTypeCounter } from '@/app/utils/workOrderNumber';
import { ApiResponse } from '@/app/types';
import { requireRoleAtLeast } from '@/app/api/middleware';

export async function POST(request: NextRequest) {
  // Only admin and superadmin can reset counters
  const auth = requireRoleAtLeast(request, 'admin');
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { work_type_code } = body;

    if (work_type_code) {
      // Reset specific work type counter
      await resetWorkTypeCounter(work_type_code);
      return NextResponse.json<ApiResponse<null>>({
        success: true,
        message: `Counter for work type code "${work_type_code}" has been reset`
      });
    } else {
      // Reset all counters
      await resetAllWorkTypeCounters();
      return NextResponse.json<ApiResponse<null>>({
        success: true,
        message: 'All work type counters have been reset'
      });
    }
  } catch (error) {
    console.error('Error resetting counters:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

