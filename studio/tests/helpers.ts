import { useStudioStore } from "@/state/studioStore";

const initialState = useStudioStore.getState();

/** Reset the shared store between tests. */
export function resetStore() {
  useStudioStore.setState(initialState, true);
}
