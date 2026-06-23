/**
 * Property-based tests for display formatting utilities in formatters.ts
 *
 * **Validates: Requirements 6.2, 8.1, 8.4**
 *
 * Property 10: Station filter is exact case-insensitive substring match (Req 8.4)
 * Property 12: formatCisExplanation renders all required fields for any valid hotspot (Req 8.1)
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { filterStations, formatCisExplanation } from '../formatters';
import type { Hotspot, Station } from '../../types/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Station from a name string. */
function stationFromName(name: string): Station {
  return {
    name,
    filename: `${name}.csv`,
    bbox: { min_lat: 12.9, max_lat: 13.1, min_lon: 80.1, max_lon: 80.4 },
  };
}

/** Arbitrary that generates a valid Hotspot-shaped object. */
const hotspotArb = fc.record<Hotspot>({
  h3_index: fc.hexaString({ minLength: 1, maxLength: 15 }),
  latitude: fc.float({ min: -90, max: 90, noNaN: true }),
  longitude: fc.float({ min: -180, max: 180, noNaN: true }),
  violation_count: fc.integer({ min: 1, max: 1000 }),
  dominant_violation_types: fc.array(
    fc.record({ type: fc.string(), count: fc.integer({ min: 1, max: 100 }) }),
  ),
  peak_hour_label: fc.string({ minLength: 1 }),
  cis: fc.float({ min: Math.fround(0.1), max: Math.fround(1e6), noNaN: true }),
  cis_normalized: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
  global_cis_normalized: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true }),
  est_delay_minutes: fc.float({ min: Math.fround(0), max: Math.fround(1e5), noNaN: true }),
  junction_flag: fc.boolean(),
  sample_address: fc.oneof(fc.constant(null), fc.string({ minLength: 5, maxLength: 50 })),
  ai_cluster_validated: fc.boolean(),
  ai_anomaly_score: fc.double(),
  ai_risk_flag: fc.boolean(),
});

// ---------------------------------------------------------------------------
// Property 10 — filterStations: exact case-insensitive substring match
// ---------------------------------------------------------------------------

describe('Property 10: filterStations — case-insensitive substring match', () => {
  /**
   * **Validates: Requirements 8.4**
   *
   * For any list of station names and any non-empty query:
   *   - Every station in the result has a name that contains the query (case-insensitive)
   *   - No station whose name contains the query is missing from the result
   */
  it('returns exactly the stations whose names contain the query (case-insensitive)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string()),
        fc.string({ minLength: 1 }),
        (names, query) => {
          const stations = names.map(stationFromName);
          const result = filterStations(stations, query);

          const lowerQuery = query.trim().toLowerCase();

          // If the trimmed query is empty, all stations should be returned
          if (lowerQuery === '') {
            expect(result).toHaveLength(stations.length);
            return;
          }

          // Every returned station must contain the query
          for (const station of result) {
            expect(station.name.toLowerCase()).toContain(lowerQuery);
          }

          // Every station containing the query must be in the result
          const expectedCount = stations.filter((s) =>
            s.name.toLowerCase().includes(lowerQuery),
          ).length;
          expect(result).toHaveLength(expectedCount);
        },
      ),
    );
  });

  /**
   * **Validates: Requirements 8.4**
   *
   * An empty query must return all stations unchanged.
   */
  it('returns all stations for an empty query', () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (names) => {
        const stations = names.map(stationFromName);
        const result = filterStations(stations, '');
        expect(result).toHaveLength(stations.length);
        expect(result).toEqual(stations);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 12 — formatCisExplanation renders all required fields
// ---------------------------------------------------------------------------

describe('Property 12: formatCisExplanation — renders all required fields', () => {
  /**
   * **Validates: Requirements 6.2, 8.1**
   *
   * For any valid hotspot:
   *   - The result is a non-empty string
   *   - It contains the violation_count value
   *   - It contains the peak_hour_label value
   */
  it('produces a non-empty string containing violation_count and peak_hour_label', () => {
    fc.assert(
      fc.property(hotspotArb, (hotspot) => {
        const result = formatCisExplanation(hotspot);

        // Must be a non-empty string
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);

        // Must contain the violation count
        expect(result).toContain(String(hotspot.violation_count));

        // Must contain the peak hour label
        expect(result).toContain(hotspot.peak_hour_label);
      }),
    );
  });
});
