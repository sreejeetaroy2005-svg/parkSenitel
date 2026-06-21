export interface DominantViolationType {
  type: string;
  count: number;
}

export interface Hotspot {
  h3_index: string;
  latitude: number;
  longitude: number;
  violation_count: number;
  dominant_violation_types: DominantViolationType[];
  peak_hour_label: string;
  cis: number;
  cis_normalized: number;
  junction_flag: boolean;
  sample_address: string | null;
  ai_cluster_validated: boolean;
  ai_anomaly_score: number;
  ai_risk_flag: boolean;
}

export interface BoundingBox {
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
}

export interface Station {
  name: string;
  filename: string;
  bbox: BoundingBox;
}

// API response types (arrays of the above)
export type StationsResponse = Station[];
export type HotspotsResponse = Hotspot[];

export type ViewMode = 'map' | 'list';

export interface AppState {
  stations: Station[];
  stationsLoading: boolean;
  stationsError: string | null;
  selectedStation: Station | null;
  hotspots: Hotspot[];
  hotspotsLoading: boolean;
  hotspotsError: string | null;
  selectedHotspot: Hotspot | null;
  viewMode: ViewMode;
  minCisScore: number;
  selectedViolationTypes: string[];
  aiRiskOnly: boolean;
}
