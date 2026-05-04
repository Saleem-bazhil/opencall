// Common RTPL status values for the dropdown.
// The "Custom" option allows manual entry of any other value.
export const RTPL_STATUS_OPTIONS = [
  "Additional Part",
  "CRT Pending",
  "CT Pending",
  "CT Validation Pending",
  "CX Pending",
  "Problem Resolution",
  "Part Order Pending",
  "Need To Cancel",
  "Need To Cancel-Mail",
  "Need To Yank",
  "Part Pending",
  "To Be Scheduled",
  "Visit Estimate",
  "Visit Qoute Customer",
  "Yank",
  "Under Observation",
  "Elevation Part Pending",
  "Elevation HP Pending",
  "Elevation WP Pending",
  "OTP",
] as const;

export type RTPLStatusOption = (typeof RTPL_STATUS_OPTIONS)[number];
