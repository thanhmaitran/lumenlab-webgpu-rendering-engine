import { createContext, useContext, useSyncExternalStore } from "react";
import type { WorkbenchStore } from "./workbenchStore";
import type { WorkbenchState } from "./types";

export const StoreContext = createContext<WorkbenchStore | null>(null);

export function useStore(): WorkbenchStore {
  const store = useContext(StoreContext);
  if (!store)
    throw new Error("WorkbenchStore is missing; wrap the tree in <StoreContext.Provider>");
  return store;
}

export function useWorkbench(): WorkbenchState {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
