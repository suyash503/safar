// Winter blues. See NOTES.md → Design.
// Danger is the one warm colour in the app and belongs only to report, block and
// emergency controls — a safety control must not read as calm.
export const colour = {
  oxford: '#02122F', // ground
  storm: '#23354D',
  steel: '#495B7D',
  frost: '#8BA3C5',
  moonlight: '#F0ECDD', // primary button
  danger: '#E4606F',
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 } as const;

// Jangkuy by Azkia Fadhlan — the display face, loaded in app/_layout.tsx. It is
// caps-only and expanded, so anything set in it is uppercased deliberately.
// Statements only: a person's name in wide caps would make Onboard unreadable,
// which is why everything else stays on the system grotesque.
export const font = {
  display: 'Jangkuy',
} as const;
