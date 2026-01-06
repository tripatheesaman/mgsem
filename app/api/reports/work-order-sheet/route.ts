import { NextRequest, NextResponse } from 'next/server';
import pool from '@/app/lib/database';
import { ApiResponse } from '@/app/types';
import { requireRoleAtLeast } from '@/app/api/middleware';
import { ExcelHelper, formatTime, formatDate, getWorkTypeCode, toProperCase, formatDateTime } from '@/app/utils/excel';
import path from 'path';

export async function GET(request: NextRequest) {
  const auth = requireRoleAtLeast(request, 'user');
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const workOrderId = searchParams.get('workOrderId');
    
    if (!workOrderId) {
      return NextResponse.json<ApiResponse<null>>({
        success: false,
        error: 'Work order ID is required'
      }, { status: 400 });
    }

    const client = await pool.connect();
    
    try {
      // Fetch work order details (including completion_approved_at for time)
      const workOrderResult = await client.query(`
        SELECT 
          wo.*,
          u.username as requested_by_username,
          u.first_name,
          u.last_name,
          wo.completion_approved_at
        FROM work_orders wo
        LEFT JOIN users u ON wo.requested_by_id = u.id
        WHERE wo.id = $1
      `, [workOrderId]);

      if (workOrderResult.rows.length === 0) {
        return NextResponse.json<ApiResponse<null>>({
          success: false,
          error: 'Work order not found'
        }, { status: 404 });
      }

      const workOrder = workOrderResult.rows[0];

      // Fetch complaints
      const complaintsResult = await client.query(`
        SELECT complaint FROM work_order_complaints 
        WHERE work_order_id = $1 
        ORDER BY created_at ASC
      `, [workOrderId]);
      const complaints = complaintsResult.rows.map(r => r.complaint);

      // Fetch findings (trouble shooting) with finding_dates, actions and action_dates
      const findingsResult = await client.query(`
        SELECT 
          f.*,
          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', fd.id,
                  'finding_date', fd.finding_date,
                  'start_time', fd.start_time,
                  'end_time', fd.end_time,
                  'is_completed', fd.is_completed
                ) ORDER BY fd.finding_date DESC, fd.created_at DESC
              )
              FROM finding_dates fd
              WHERE fd.finding_id = f.id
            ),
            '[]'::json
          ) as finding_dates,
          COALESCE(
            json_agg(
              DISTINCT jsonb_build_object(
                'id', a.id,
                'description', a.description,
                'action_date', a.action_date,
                'start_time', a.start_time,
                'end_time', a.end_time,
                'remarks', a.remarks,
                'action_dates', (
                  SELECT json_agg(
                    json_build_object(
                      'id', ad.id,
                      'action_date', ad.action_date,
                      'start_time', ad.start_time,
                      'end_time', ad.end_time,
                      'is_completed', ad.is_completed
                    ) ORDER BY ad.action_date DESC, ad.created_at DESC
                  )
                  FROM action_dates ad
                  WHERE ad.action_id = a.id
                ),
                'spare_parts', (
                  SELECT json_agg(
                    json_build_object(
                      'id', sp.id,
                      'part_name', sp.part_name,
                      'part_number', sp.part_number,
                      'quantity', sp.quantity,
                      'unit', sp.unit,
                      'replacement_number', sp.replacement_number
                    )
                  )
                  FROM spare_parts sp
                  WHERE sp.action_id = a.id
                )
              )
            ) FILTER (WHERE a.id IS NOT NULL),
            '[]'::json
          ) as actions
        FROM findings f
        LEFT JOIN actions a ON f.id = a.finding_id
        WHERE f.work_order_id = $1
        GROUP BY f.id
        ORDER BY f.id
      `, [workOrderId]);

      // Fetch technicians
      const techniciansResult = await client.query(`
        SELECT DISTINCT at.name, at.staff_id, a.id as action_id
        FROM action_technicians at
        JOIN actions a ON a.id = at.action_id
        JOIN findings f ON f.id = a.finding_id
        WHERE f.work_order_id = $1
        ORDER BY at.name, at.staff_id
      `, [workOrderId]);

      // Fetch checking authorities
      const checkingAuthoritiesResult = await client.query(`
        SELECT ca.name, ca.designation
        FROM work_order_checking_authorities woca
        JOIN checking_authorities ca ON ca.id = woca.checking_authority_id
        WHERE woca.work_order_id = $1 AND ca.is_active = true
        ORDER BY ca.name
      `, [workOrderId]);

      // Load template
      const templatePath = path.join(process.cwd(), 'public', 'template_file.xlsx');
      const excelHelper = await ExcelHelper.loadTemplate(templatePath, 'Template Sheet');

      // Fill in work order details - NEW FORMAT
      excelHelper.setCellValue('G1', workOrder.work_order_no);
      
      // G2: Work order date/time in YYYY-MM-DD/HH:MM format
      const workOrderDateTime = workOrder.job_allocation_time 
        ? formatDateTime(workOrder.job_allocation_time)
        : (workOrder.work_order_date ? formatDateTime(new Date(workOrder.work_order_date + 'T00:00:00')) : '');
      excelHelper.setCellValue('G2', workOrderDateTime);
      
      // G3: Equipment number
      excelHelper.setCellValue('G3', workOrder.equipment_number || '');
      
      // G4: Kilometers
      excelHelper.setCellValue('G4', workOrder.km_hrs || 'N/A');
      
      // G5: FRS Reference Number
      excelHelper.setCellValue('G5', workOrder.frs_reference_number || 'N/A');
      
      // G6: WorkType/Code (e.g., Electrical/E)
      const workTypeCode = getWorkTypeCode(workOrder.work_type);
      excelHelper.setCellValue('G6', `${workOrder.work_type}/${workTypeCode}`);
      
      // G7: Work Completed Date/Time
      // Use completion_approved_at timestamp if available, otherwise use work_completed_date with default time
      let completedDateTime = '';
      if (workOrder.completion_approved_at) {
        completedDateTime = formatDateTime(workOrder.completion_approved_at);
      } else if (workOrder.work_completed_date) {
        // If only date is available, use it with default time 00:00
        completedDateTime = formatDateTime(workOrder.work_completed_date + 'T00:00:00');
      }
      excelHelper.setCellValue('G7', completedDateTime || 'N/A');

      // A11: Complaints (comma-separated, proper case)
      const complaintsText = complaints.length > 0 
        ? complaints.map(c => toProperCase(c)).join(', ')
        : '';
      excelHelper.setCellValue('A11', complaintsText);

      // Fill in troubleshooting - starting from row 16, max 3
      const findings = findingsResult.rows.filter(f => f && f.description && f.description.trim() !== '');
      const troubleshootingStartRow = 16;
      const troubleshootingMaxRows = 3;
      const troubleshootingTemplateRow = 16; // Use row 16 as template for troubleshooting insertions

      let currentTroubleshootingRow = troubleshootingStartRow;
      for (let i = 0; i < findings.length; i++) {
        const finding = findings[i];
        if (i >= troubleshootingMaxRows) {
          // Insert row at currentTroubleshootingRow position using row 16 as template
          excelHelper.insertRowWithFormatting(troubleshootingTemplateRow, currentTroubleshootingRow, ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
          // Clear data cells after insertion to avoid copying values from template
          excelHelper.setCellValue(`A${currentTroubleshootingRow}`, '');
          excelHelper.setCellValue(`B${currentTroubleshootingRow}`, '');
          excelHelper.setCellValue(`E${currentTroubleshootingRow}`, '');
          excelHelper.setCellValue(`F${currentTroubleshootingRow}`, '');
          excelHelper.setCellValue(`G${currentTroubleshootingRow}`, '');
        }
        
        // Get latest finding_date for date/time display
        let startTime = '';
        let endTime = '';
        let completionDate = '';
        if (finding.finding_dates && Array.isArray(finding.finding_dates) && finding.finding_dates.length > 0) {
          const latestFindingDate = finding.finding_dates[0];
          startTime = formatTime(latestFindingDate.start_time || '');
          endTime = formatTime(latestFindingDate.end_time || '');
          if (latestFindingDate.finding_date) {
            completionDate = formatDate(latestFindingDate.finding_date);
          }
        }
        
        excelHelper.setCellValue(`A${currentTroubleshootingRow}`, i + 1);
        excelHelper.setCellValue(`B${currentTroubleshootingRow}`, toProperCase(finding.description));
        excelHelper.setCellValue(`E${currentTroubleshootingRow}`, startTime);
        excelHelper.setCellValue(`F${currentTroubleshootingRow}`, endTime);
        excelHelper.setCellValue(`G${currentTroubleshootingRow}`, completionDate);
        currentTroubleshootingRow++;
      }
      // Last row is the last row used, or if no findings, use the last template row (18)
      const troubleshootingLastRow = findings.length > 0 
        ? currentTroubleshootingRow - 1 
        : troubleshootingStartRow + troubleshootingMaxRows - 1;

      // Fill in actions - default rows 23-25
      const allActions = [];
      for (const finding of findings) {
        if (finding.actions && Array.isArray(finding.actions)) {
          for (const action of finding.actions) {
            if (action && action.id && action.description && action.description.trim() !== '') {
              // Get completion date from latest action_date (date only, no time)
              let completionDate = '';
              if (action.action_dates && Array.isArray(action.action_dates) && action.action_dates.length > 0) {
                // Get the latest action_date (sorted by date DESC)
                const latestActionDate = action.action_dates[0];
                if (latestActionDate && latestActionDate.action_date) {
                  completionDate = formatDate(latestActionDate.action_date);
                }
              }
              
              allActions.push({
                ...action,
                completionDate
              });
            }
          }
        }
      }

      const actionIdToSymbolNumber = new Map<number, number>();
      const actionsNormalStartRow = 23;
      const actionsMaxRows = 3;

      // Calculate action start row: 4 rows after last troubleshooting row if troubleshooting inserted rows
      // Otherwise use normal start row 23
      const troubleshootingInsertedRows = findings.length > troubleshootingMaxRows;
      const actionStartRow = troubleshootingInsertedRows 
        ? troubleshootingLastRow + 1 + 4  // +1 because we need to go to the row AFTER the last troubleshooting row, then 4 more
        : actionsNormalStartRow;
      const actionsTemplateRow = actionStartRow; // Use first action row as template for action insertions

      let currentActionRow = actionStartRow;
      for (let i = 0; i < allActions.length; i++) {
        const action = allActions[i];
        
        actionIdToSymbolNumber.set(action.id, i + 1);
        
        excelHelper.setCellValue(`A${currentActionRow}`, i + 1);
        excelHelper.setCellValue(`B${currentActionRow}`, toProperCase(action.description));
        excelHelper.setCellValue(`E${currentActionRow}`, formatTime(action.start_time || ''));
        excelHelper.setCellValue(`F${currentActionRow}`, formatTime(action.end_time || ''));
        excelHelper.setCellValue(`G${currentActionRow}`, action.completionDate || formatDate(action.action_date || ''));
        
        // Ensure the current row is visible and has proper height
        const currentRowObj = excelHelper.getWorksheet().getRow(currentActionRow);
        currentRowObj.hidden = false;
        if (!currentRowObj.height) {
          const templateRowObj = excelHelper.getWorksheet().getRow(actionsTemplateRow);
          if (templateRowObj.height) {
            currentRowObj.height = templateRowObj.height;
          }
        }
        
        // If we just wrote the 3rd record (i == 2) and there are more records, insert a new row AFTER it
        if (i === actionsMaxRows - 1 && i < allActions.length - 1) {
          const nextRow = currentActionRow + 1;
          // Insert row AFTER the current row using first action row as template
          excelHelper.insertRowWithFormatting(actionsTemplateRow, nextRow, ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
          // Clear data cells after insertion to avoid copying values from template
          excelHelper.setCellValue(`A${nextRow}`, '');
          excelHelper.setCellValue(`B${nextRow}`, '');
          excelHelper.setCellValue(`E${nextRow}`, '');
          excelHelper.setCellValue(`F${nextRow}`, '');
          excelHelper.setCellValue(`G${nextRow}`, '');
        }
        
        currentActionRow++;
      }
      // Last row is the last row used, or if no actions, use the last template row (25)
      const actionsLastRow = allActions.length > 0 
        ? currentActionRow - 1 
        : actionStartRow + actionsMaxRows - 1;

      // Fill in spare parts - default rows 29-31
      const allSpareParts = [];
      for (const finding of findings) {
        if (finding.actions && Array.isArray(finding.actions)) {
          for (const action of finding.actions) {
            if (action && action.id && action.spare_parts && Array.isArray(action.spare_parts)) {
              for (const sparePart of action.spare_parts) {
                if (sparePart && sparePart.id && sparePart.part_name && sparePart.part_name.trim() !== '') {
                  allSpareParts.push(sparePart);
                }
              }
            }
          }
        }
      }

      const sparePartsNormalStartRow = 29;
      const sparePartsMaxRows = 3;

      // Calculate spare parts start row: 3 rows after last action row if actions or troubleshooting inserted rows
      // Otherwise use normal start row 29
      const actionsInsertedRows = allActions.length > actionsMaxRows;
      const anyPreviousInsertion = troubleshootingInsertedRows || actionsInsertedRows;
      const sparePartStartRow = anyPreviousInsertion 
        ? actionsLastRow + 1 + 3  // +1 because we need to go to the row AFTER the last action row, then 3 more
        : sparePartsNormalStartRow;
      const sparePartsTemplateRow = sparePartStartRow; // Use first spare parts row as template for spare parts insertions

      let currentSparePartRow = sparePartStartRow;
      for (let i = 0; i < allSpareParts.length; i++) {
        const sparePart = allSpareParts[i];
        
        // B: {Spare Part Name(Spare Part Number)} format
        const partNameFormatted = `${toProperCase(sparePart.part_name)}(${sparePart.part_number})`;
        excelHelper.setCellValue(`A${currentSparePartRow}`, i + 1);
        excelHelper.setCellValue(`B${currentSparePartRow}`, partNameFormatted);
        
        // E: Replacement Number (N/A if empty)
        const replacementNumber = sparePart.replacement_number && sparePart.replacement_number.trim()
          ? sparePart.replacement_number
          : 'N/A';
        excelHelper.setCellValue(`E${currentSparePartRow}`, replacementNumber);
        
        // G: Quantity with unit in proper case
        const unit = sparePart.unit ? toProperCase(sparePart.unit) : '';
        const quantityWithUnit = unit 
          ? `${sparePart.quantity} ${unit}`
          : String(sparePart.quantity);
        excelHelper.setCellValue(`G${currentSparePartRow}`, quantityWithUnit);
        const currentRowObjSpares = excelHelper.getWorksheet().getRow(currentSparePartRow);
        currentRowObjSpares.hidden = false;
        if (!currentRowObjSpares.height) {
          const templateRowObjSpares = excelHelper.getWorksheet().getRow(sparePartsTemplateRow as number);
          if (templateRowObjSpares.height) {
            currentRowObjSpares.height = templateRowObjSpares.height;
          }
        }
        // If we need more rows, insert AFTER the current row (at currentRow + 1)
        if (i >= sparePartsMaxRows - 1 && i < allSpareParts.length - 1) {
          const nextRow = currentSparePartRow + 1;
          excelHelper.insertRowWithFormatting(sparePartsTemplateRow, nextRow, ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
          // Clear data cells after insertion to avoid copying values from template
          excelHelper.setCellValue(`A${nextRow}`, '');
          excelHelper.setCellValue(`B${nextRow}`, '');
          excelHelper.setCellValue(`E${nextRow}`, '');
          excelHelper.setCellValue(`F${nextRow}`, '');
          excelHelper.setCellValue(`G${nextRow}`, '');
        }
        
        currentSparePartRow++;
      }
      // Last row is the last row used, or if no spare parts, use the last template row (31)
      const sparePartsLastRow = allSpareParts.length > 0 
        ? currentSparePartRow - 1 
        : sparePartStartRow + sparePartsMaxRows - 1;

      // Fill in technicians - default rows 35-38
      const techKeyToData = new Map<string, { name: string; staff_id: string; symbols: number[] }>();
      for (const row of techniciansResult.rows) {
        if (!row || !row.name || row.name.trim() === '') continue;
        const key = `${row.staff_id}||${row.name.trim()}`;
        const symbol = actionIdToSymbolNumber.get(row.action_id);
        if (symbol === undefined) continue;
        if (!techKeyToData.has(key)) {
          techKeyToData.set(key, { name: row.name.trim(), staff_id: row.staff_id, symbols: [symbol] });
        } else {
          const entry = techKeyToData.get(key)!;
          if (!entry.symbols.includes(symbol)) entry.symbols.push(symbol);
        }
      }

      const technicians = Array.from(techKeyToData.values()).map(t => ({
        name: t.name,
        staff_id: t.staff_id,
        symbolsCsv: t.symbols.sort((a, b) => a - b).join(',')
      }));

      const techniciansNormalStartRow = 35;
      const techniciansMaxRows = 4;

      // Calculate technician start row: 3 rows after last spare parts row if any previous section inserted rows
      // Otherwise use normal start row 35
      const sparePartsInsertedRows = allSpareParts.length > sparePartsMaxRows;
      const anyPreviousInsertionForTech = troubleshootingInsertedRows || actionsInsertedRows || sparePartsInsertedRows;
      const technicianStartRow = anyPreviousInsertionForTech 
        ? sparePartsLastRow + 1 + 3  // +1 because we need to go to the row AFTER the last spare parts row, then 3 more
        : techniciansNormalStartRow;
      const techniciansTemplateRow = technicianStartRow; // Use first technician row as template for technician insertions

      let currentTechnicianRow = technicianStartRow;
      for (let i = 0; i < technicians.length; i++) {
        const technician = technicians[i];
        if (i >= techniciansMaxRows) {
          // Insert row at currentTechnicianRow position using first technician row as template
          excelHelper.insertRowWithFormatting(techniciansTemplateRow, currentTechnicianRow, ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
          // Clear data cells after insertion to avoid copying values from template
          excelHelper.setCellValue(`A${currentTechnicianRow}`, '');
          excelHelper.setCellValue(`B${currentTechnicianRow}`, '');
          excelHelper.setCellValue(`E${currentTechnicianRow}`, '');
          excelHelper.setCellValue(`F${currentTechnicianRow}`, '');
        }
        excelHelper.setCellValue(`A${currentTechnicianRow}`, i + 1);
        excelHelper.setCellValue(`B${currentTechnicianRow}`, toProperCase(technician.name));
        excelHelper.setCellValue(`E${currentTechnicianRow}`, technician.symbolsCsv);
        excelHelper.setCellValue(`F${currentTechnicianRow}`, technician.staff_id);
        currentTechnicianRow++;
      }
      // Last row is the last row used, or if no technicians, use the last template row (38)
      const techniciansLastRow = technicians.length > 0 
        ? currentTechnicianRow - 1 
        : technicianStartRow + techniciansMaxRows - 1;

      // Fill in checking authority - default rows 42-43
      const checkingAuthorities = checkingAuthoritiesResult.rows;
      const authorityNormalStartRow = 42;
      const authorityMaxRows = 2;

      // Calculate authority start row: 4 rows after last technician row if any previous section inserted rows
      // Otherwise use normal start row 42
      const techniciansInsertedRows = technicians.length > techniciansMaxRows;
      const anyPreviousInsertionForAuth = troubleshootingInsertedRows || actionsInsertedRows || sparePartsInsertedRows || techniciansInsertedRows;
      const authorityStartRow = anyPreviousInsertionForAuth 
        ? techniciansLastRow + 1 + 4  // +1 because we need to go to the row AFTER the last technician row, then 4 more
        : authorityNormalStartRow;
      const authorityTemplateRow = authorityStartRow; // Use first authority row as template for authority insertions

      let currentAuthorityRow = authorityStartRow;
      for (let i = 0; i < checkingAuthorities.length; i++) {
        const authority = checkingAuthorities[i];
        if (i >= authorityMaxRows) {
          // Insert row at currentAuthorityRow position using first authority row as template
          excelHelper.insertRowWithFormatting(authorityTemplateRow, currentAuthorityRow, ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
          // Clear data cells after insertion to avoid copying values from template
          excelHelper.setCellValue(`A${currentAuthorityRow}`, '');
          excelHelper.setCellValue(`B${currentAuthorityRow}`, '');
          excelHelper.setCellValue(`E${currentAuthorityRow}`, '');
        }
        // A: SN, B: Name, E: Designation
        excelHelper.setCellValue(`A${currentAuthorityRow}`, i + 1);
        excelHelper.setCellValue(`B${currentAuthorityRow}`, toProperCase(authority.name));
        excelHelper.setCellValue(`E${currentAuthorityRow}`, toProperCase(authority.designation));
        currentAuthorityRow++;
      }

      // Generate the Excel buffer
      const buffer = await excelHelper.getBuffer();

      // Return the Excel file as a blob response
      return new NextResponse(buffer as BodyInit, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="WorkOrderReport_${workOrder.work_order_no}_${Date.now()}.xlsx"`
        }
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error generating work order report:', error);
    return NextResponse.json<ApiResponse<null>>({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}
