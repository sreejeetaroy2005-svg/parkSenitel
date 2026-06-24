// @refresh reset
import React, { createContext, useContext, useReducer } from 'react';
import { appReducer, initialState } from './appReducer';
import type { AppAction, AppDispatch } from './appReducer';

// Re-export types so existing imports from AppContext still work
export type { AppAction, AppDispatch };

// ---------------------------------------------------------------------------
// Context value type
// ---------------------------------------------------------------------------

interface AppContextValue {
  state: ReturnType<typeof appReducer>;
  dispatch: AppDispatch;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------------------

interface AppProviderProps {
  children: React.ReactNode;
}

export function AppProvider({ children }: AppProviderProps): React.JSX.Element {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (ctx === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return ctx;
}
