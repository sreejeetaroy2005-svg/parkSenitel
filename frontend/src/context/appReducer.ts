import type { Dispatch } from 'react';
import type { AppState, Station, Hotspot, ViewMode } from '../types/index';

// ---------------------------------------------------------------------------
// Action types (discriminated union)
// ---------------------------------------------------------------------------

export type AppAction =
  | { type: 'SET_STATIONS_LOADING' }
  | { type: 'SET_STATIONS_SUCCESS'; payload: Station[] }
  | { type: 'SET_STATIONS_ERROR'; payload: string }
  | { type: 'SELECT_STATION'; payload: Station | null }
  | { type: 'SET_HOTSPOTS_LOADING' }
  | { type: 'SET_HOTSPOTS_SUCCESS'; payload: Hotspot[] }
  | { type: 'SET_HOTSPOTS_ERROR'; payload: string }
  | { type: 'SELECT_HOTSPOT'; payload: Hotspot | null }
  | { type: 'SET_VIEW_MODE'; payload: ViewMode }
  | { type: 'SET_MIN_CIS'; payload: number }
  | { type: 'TOGGLE_VIOLATION_TYPE'; payload: string }
  | { type: 'TOGGLE_AI_RISK_ONLY' }
  | { type: 'TOGGLE_FORECAST' }
  | { type: 'TOGGLE_SHIFT_BRIEFING' }
  | { type: 'CLEAR_FILTERS' };

export type AppDispatch = Dispatch<AppAction>;

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export const initialState: AppState = {
  stations: [],
  stationsLoading: false,
  stationsError: null,
  selectedStation: null,
  hotspots: [],
  hotspotsLoading: false,
  hotspotsError: null,
  selectedHotspot: null,
  viewMode: 'map',
  minCisScore: 0,
  selectedViolationTypes: [],
  aiRiskOnly: false,
  isShiftBriefingOpen: false,
  isForecastOpen: false,
};

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_STATIONS_LOADING':
      return { ...state, stationsLoading: true, stationsError: null };

    case 'SET_STATIONS_SUCCESS':
      return { ...state, stationsLoading: false, stationsError: null, stations: action.payload };

    case 'SET_STATIONS_ERROR':
      return { ...state, stationsLoading: false, stationsError: action.payload };

    case 'SELECT_STATION':
      return {
        ...state,
        selectedStation: action.payload,
        hotspots: [],
        hotspotsLoading: false,
        hotspotsError: null,
        selectedHotspot: null,
        minCisScore: 0,
        selectedViolationTypes: [],
        aiRiskOnly: false,
        isShiftBriefingOpen: false,
      };

    case 'SET_HOTSPOTS_LOADING':
      return { ...state, hotspotsLoading: true, hotspotsError: null };

    case 'SET_HOTSPOTS_SUCCESS':
      return { ...state, hotspotsLoading: false, hotspotsError: null, hotspots: action.payload };

    case 'SET_HOTSPOTS_ERROR':
      return { ...state, hotspotsLoading: false, hotspotsError: action.payload };

    case 'SELECT_HOTSPOT':
      return { ...state, selectedHotspot: action.payload };

    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.payload };

    case 'SET_MIN_CIS':
      return { ...state, minCisScore: action.payload };

    case 'TOGGLE_VIOLATION_TYPE': {
      const isSelected = state.selectedViolationTypes.includes(action.payload);
      return {
        ...state,
        selectedViolationTypes: isSelected
          ? state.selectedViolationTypes.filter((t) => t !== action.payload)
          : [...state.selectedViolationTypes, action.payload],
      };
    }

    case 'TOGGLE_AI_RISK_ONLY':
      return { ...state, aiRiskOnly: !state.aiRiskOnly };

    case 'TOGGLE_SHIFT_BRIEFING':
      return { ...state, isShiftBriefingOpen: !state.isShiftBriefingOpen };
    case 'TOGGLE_FORECAST':
      return { ...state, isForecastOpen: !state.isForecastOpen };

    case 'CLEAR_FILTERS':
      return { ...state, minCisScore: 0, selectedViolationTypes: [], aiRiskOnly: false };

    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
