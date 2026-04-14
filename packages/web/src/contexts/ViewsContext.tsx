import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type React from 'react';
import { getViews } from '../api';
import type { ViewDefinition } from '../types';

interface ViewsContextValue {
  views: ViewDefinition[];
  fetchViews: () => Promise<void>;
}

const ViewsContext = createContext<ViewsContextValue>({
  views: [],
  fetchViews: async () => {},
});

export function ViewsProvider({ children }: { children: React.ReactNode }) {
  const [views, setViews] = useState<ViewDefinition[]>([]);

  const fetchViews = useCallback(async () => {
    const data = await getViews();
    setViews(data.map(d => d.definition));
  }, []);

  useEffect(() => {
    void fetchViews();
  }, [fetchViews]);

  return (
    <ViewsContext.Provider value={{ views, fetchViews }}>
      {children}
    </ViewsContext.Provider>
  );
}

export function useViews() {
  return useContext(ViewsContext);
}
