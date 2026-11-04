// Shape of a report as returned by the API.
// Shared by the dashboard and manager pages so it is defined in one place.
export interface Report {
  reportId: string;
  locationId: string;
  reportDate: string;
  revenue: number;
  revenueTarget: number;
  coversServed: number;
  avgSpendPerCover?: number;
  voids: number;
  comps: number;
  incidentNotes?: string;
}
