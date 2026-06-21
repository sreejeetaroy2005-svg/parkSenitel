import { useCallback, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { fetchStations } from '../api/client';

/**
 * Fetches the list of police stations on mount and exposes a retry function.
 *
 * Validates: Requirements 6.1, 6.5, 12.1
 */
export function useStations() {
  const { state, dispatch } = useAppContext();

  const load = useCallback(async () => {
    dispatch({ type: 'SET_STATIONS_LOADING' });
    try {
      const stations = await fetchStations();
      dispatch({ type: 'SET_STATIONS_SUCCESS', payload: stations });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown error fetching stations';
      dispatch({ type: 'SET_STATIONS_ERROR', payload: message });
    }
  }, [dispatch]);

  // Fetch on mount only
  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    stations: state.stations,
    loading: state.stationsLoading,
    error: state.stationsError,
    retry: load,
  };
}
