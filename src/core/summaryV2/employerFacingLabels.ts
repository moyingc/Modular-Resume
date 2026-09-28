/**
 * Converts internal JD taxonomy labels into employer-facing resume language.
 * Internal taxonomy is allowed to be terse/slash-heavy; generated prose is not.
 */
const EMPLOYER_FACING_LABELS: Record<string, string> = {
  'Customer / Student Service': 'customer service',
  'Reception / Front Desk': 'front-desk support',
  'Accounts Receivable / Billing': 'billing support',
  'Content / Email / Social Media': 'digital and client communication',
  'Written & Verbal Communication': 'written and verbal communication',
  'Organization & Changing Priorities': 'organization and changing priorities',
  'Marketing / Campaign Coordination': 'marketing coordination',
  'Scheduling / Appointments': 'scheduling and appointment coordination',
  'Records / Documentation': 'record management and documentation',
  'Reporting / Analysis': 'reporting and analysis',
  'Sales / Customer Accounts': 'sales and customer account support',
  'Shipping / Logistics': 'shipping and logistics coordination',
  'Data / Analytics': 'data analysis',
  'Testing / Validation': 'testing and validation',
  'Project / Stakeholder Coordination': 'project and stakeholder coordination',
};

export function employerFacingLabel(label: string): string {
  const normalized = label.trim();
  if (!normalized) return '';
  const exact = EMPLOYER_FACING_LABELS[normalized];
  if (exact) return exact;
  return normalized
    .replace(/\s*\/\s*/g, ' and ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function employerFacingLabelMap(): Readonly<Record<string, string>> {
  return EMPLOYER_FACING_LABELS;
}
