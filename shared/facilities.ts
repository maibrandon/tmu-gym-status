export const SOURCE_URL = 'https://recportal.torontomu.ca/FacilityOccupancy';

export const FACILITIES = [
  { id: 'mac-fitness', name: 'MAC Fitness Centre', location: 'MAC' },
  { id: 'rac-fitness', name: 'RAC Fitness Centre', location: 'RAC' },
  { id: 'rac-1', name: 'RAC 1 Gym (LL3)', location: 'RAC' },
  { id: 'rac-2', name: 'RAC II Gym (LL3)', location: 'RAC' },
  { id: 'rac-circuit', name: 'RAC Cardio & Strength Circuit Room', location: 'RAC' },
  { id: 'rac-functional', name: 'RAC Functional Training Room', location: 'RAC' },
] as const;

export type Facility = (typeof FACILITIES)[number];
export type Reading = Facility & { percentage: number | null };
