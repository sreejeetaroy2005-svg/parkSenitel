/**
 * Display formatting utilities for Hotspot and Station data.
 *
 * Implements Requirements 6.2, 8.1, and 8.4:
 *  - 6.2: Human-readable address display for hotspots
 *  - 8.1: CIS explanation text for hotspot detail panel
 *  - 8.4: Station list filtering by name substring
 */

import { Hotspot, Station } from '../types/index';

/**
 * Returns a human-readable address for a hotspot.
 *
 * Prefers the sample_address field when it is present and non-empty.
 * Falls back to a coordinate string formatted to 4 decimal places.
 *
 * @param hotspot - the hotspot to format an address for
 * @returns address string
 */
export function formatAddress(hotspot: Hotspot): string {
  if (hotspot.sample_address !== null && hotspot.sample_address !== '') {
    return hotspot.sample_address;
  }
  return `${hotspot.latitude.toFixed(4)}, ${hotspot.longitude.toFixed(4)}`;
}

/**
 * Builds a plain-language explanation of what drove a hotspot's CIS score.
 *
 * The severity mean is back-derived from the raw CIS by dividing out the
 * junction factor (1.3 if junction present, 1.0 otherwise) and the
 * violation count, giving an approximate per-violation severity weight.
 *
 * @param hotspot - the hotspot whose CIS to explain
 * @returns formatted explanation string
 */
export function formatCisExplanation(hotspot: Hotspot): string {
  const junctionFactor = hotspot.junction_flag ? 1.3 : 1.0;
  const junctionLabel = hotspot.junction_flag ? 'junction proximity' : 'no junction';

  const severityMean =
    hotspot.violation_count > 0
      ? hotspot.cis / (hotspot.violation_count * junctionFactor)
      : 0;

  return `Score driven by ${hotspot.violation_count} violations, ${severityMean.toFixed(2)}× severity weight, ${junctionLabel}, and peak hour at ${hotspot.peak_hour_label}.`;
}

/**
 * Filters a list of stations by a case-insensitive substring match on name.
 *
 * An empty or whitespace-only query returns all stations unchanged.
 *
 * @param stations - full list of stations
 * @param query    - search string to match against station names
 * @returns filtered array of stations whose names contain the query
 */
export function filterStations(stations: Station[], query: string): Station[] {
  const trimmed = query.trim();
  if (trimmed === '') {
    return stations;
  }
  const lower = trimmed.toLowerCase();
  return stations.filter((station) =>
    station.name.toLowerCase().includes(lower)
  );
}
