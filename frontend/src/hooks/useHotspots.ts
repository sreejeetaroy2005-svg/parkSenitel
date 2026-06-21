import { useEffect, useCallback, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { fetchHotspots } from '../api/client';
import type { Hotspot } from '../types/index';

/**
 * Manages hotspot data fetching in sync with the selected station.
 *
 * - Watches `state.selectedStation`; fetches hotspots whenever it changes to a
 *   non-null value.
 * - When `selectedStation` is null, does nothing — the SELECT_STATION reducer
 *   action already resets hotspot state.
 * - Exposes a `retry` function to re-fetch for the current station.
 * - Uses a cancelled flag to prevent state updates after component unmount or
 *   after the station has changed mid-flight.
 *
 * Satisfies Requirements 6.3, 6.4, 12.2, 12.4.
 */
export function useHotspots(): {
  hotspots: Hotspot[];
  loading: boolean;
  error: string | null;
  retry: () => void;
} {
  const { state, dispatch } = useAppContext();
  const { selectedStation } = state;

  // Keep a stable ref to selectedStation so the retry callback can always
  // access the latest value without being recreated.
  const selectedStationRef = useRef(selectedStation);
  useEffect(() => {
    selectedStationRef.current = selectedStation;
  }, [selectedStation]);

  const doFetch = useCallback(
    async (stationName: string, signal: AbortSignal) => {
      dispatch({ type: 'SET_HOTSPOTS_LOADING' });

      try {
        const hotspots = await fetchHotspots(stationName);

        // Guard: if the request was aborted, skip the dispatch.
        if (signal.aborted) return;

        dispatch({ type: 'SET_HOTSPOTS_SUCCESS', payload: hotspots });
      } catch (err: unknown) {
        if (signal.aborted) return;

        const message =
          err instanceof Error
            ? err.message
            : 'Data unavailable. Please try again.';

        dispatch({ type: 'SET_HOTSPOTS_ERROR', payload: message });
      }
    },
    [dispatch]
  );

  // Re-fetch whenever the selected station changes.
  useEffect(() => {
    if (!selectedStation) {
      // Null station — reducer already reset hotspot state; nothing to do.
      return;
    }

    const controller = new AbortController();

    void doFetch(selectedStation.name, controller.signal);

    return () => {
      // Cancel the in-flight request when the station changes or the
      // component unmounts.
      controller.abort();
    };
  }, [selectedStation, doFetch]);

  // Retry: re-issue the fetch for whatever station is currently selected.
  const retry = useCallback(() => {
    const current = selectedStationRef.current;
    if (!current) return;

    const controller = new AbortController();
    void doFetch(current.name, controller.signal);
  }, [doFetch]);

  return {
    hotspots: state.hotspots,
    loading: state.hotspotsLoading,
    error: state.hotspotsError,
    retry,
  };
}
