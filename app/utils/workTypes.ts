// Centralized work types configuration
export const WORK_TYPES = [
  'Mechanical',
  'Electrical',
  'Hydraulics',
  'Schedule Check',
  'Electrical Repair',
  'Painting',
  'Miscellaneous',
  'Customer Request',
  'Others'
] as const;

export type WorkType = typeof WORK_TYPES[number];

export function isWorkType(value: string): value is WorkType {
  return WORK_TYPES.includes(value as WorkType);
}

