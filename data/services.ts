// The bundled timetable. Static on purpose: trains lose signal for about forty
// minutes past Etawah, and an app that waits on a server there looks broken.
//
// ⚠️  ONLY 12229 IS REAL. Its times come from NOTES.md, where they have been the
// reference throughout. Every other service on the corridor still has to be
// imported from the data.gov.in timetable —
// https://www.data.gov.in/catalog/indian-railways-train-time-table
// Do not hand-write times from memory. A wrong departure time puts a real person
// on the wrong platform, and the whole point of bundling this is that it is the
// one thing in the app that has to be right offline.

export type Station = { code: string; name: string };

export type Service = {
  code: string; // what the user calls the train — '12229'
  name: string;
  from: string; // station code
  to: string;
  departs: string; // HH:MM, India
  arrives: string; // HH:MM, India — next day when arrives <= departs
};

/** Lucknow ⇄ Delhi, the launch corridor. */
export const STATIONS: Station[] = [
  { code: 'LKO', name: 'Lucknow' },
  { code: 'CNB', name: 'Kanpur' },
  { code: 'ETW', name: 'Etawah' },
  { code: 'TDL', name: 'Tundla' },
  { code: 'ALJN', name: 'Aligarh' },
  { code: 'GZB', name: 'Ghaziabad' },
  { code: 'NDLS', name: 'New Delhi' },
];

export const SERVICES: Service[] = [
  {
    code: '12229',
    name: 'Lucknow Mail',
    from: 'LKO',
    to: 'NDLS',
    departs: '22:00',
    arrives: '06:35',
  },
];

export const stationName = (code: string) =>
  STATIONS.find((s) => s.code === code)?.name ?? code;

export const isOvernight = (s: Service) => s.arrives <= s.departs;
