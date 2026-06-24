import type { Station, Hotspot } from '../types/index';

export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000';

/**
 * Fetches all police stations from the API.
 * Throws a typed Error on non-2xx responses.
 */
export async function fetchStations(): Promise<Station[]> {
  const response = await fetch(`${API_BASE}/stations`);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch stations: ${response.status} ${response.statusText}`
    );
  }
  return response.json() as Promise<Station[]>;
}

/**
 * Fetches hotspots for a given police station.
 * Throws a typed Error on non-2xx responses.
 */
export async function fetchHotspots(stationName: string): Promise<Hotspot[]> {
  const response = await fetch(
    `${API_BASE}/hotspots/${encodeURIComponent(stationName)}`
  );
  if (!response.ok) {
    throw new Error(
      `Failed to fetch hotspots for "${stationName}": ${response.status} ${response.statusText}`
    );
  }
  return response.json() as Promise<Hotspot[]>;
}
export async function fetchForecast(topN: number = 10): Promise<any[]> {
  const response = await fetch(`${API_BASE}/forecast?top_n=${topN}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch forecast: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function fetchForecastSingle(h3Cell: string): Promise<any> {
  const response = await fetch(`${API_BASE}/forecast/${encodeURIComponent(h3Cell)}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch forecast for ${h3Cell}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
