export const LEAD_STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'converted', label: 'Converted' },
  { value: 'lost', label: 'Lost' },
] as const;

export function getLeadStatusLabel(status: string) {
  const option = LEAD_STATUS_OPTIONS.find((entry) => entry.value === status);

  if (option) {
    return option.label;
  }

  return status
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ') || 'New';
}
