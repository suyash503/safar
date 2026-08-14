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
