/** Shared visual tokens for the local MVP. Keep screen styles consistent here. */
export const colors = {
  background: '#F5F7F4',
  surface: '#FFFFFF',
  surfaceMuted: '#F0F4F0',
  ink: '#18312F',
  inkSoft: '#425A56',
  muted: '#667A75',
  border: '#DDE7E0',
  primary: '#246B58',
  primaryPressed: '#1B5748',
  primarySoft: '#E5F2EB',
  accent: '#CB8747',
  accentSoft: '#FFF1E0',
  danger: '#B64F48',
  dangerSoft: '#FBEDEA',
  white: '#FFFFFF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  section: 32,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  card: 26,
  pill: 999,
} as const;
