import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { api } from "@/lib/api";
import { isOnline } from "@/store/connectivity";

interface PlayEvent {
  track_id: number;
  playlist_id: number | null;
  played_at: string;
}

interface HistoryState {
  pending: PlayEvent[];
}

/** Plays are sent to the server; while offline they are kept and uploaded later in one batch. */
export const useHistory = create<HistoryState>()(
  persist(() => ({ pending: [] as PlayEvent[] }), {
    name: "michi-history",
    storage: createJSONStorage(() => AsyncStorage),
  }),
);

export function recordPlay(trackId: number, playlistId: number | null) {
  const event = { track_id: trackId, playlist_id: playlistId, played_at: new Date().toISOString() };
  useHistory.setState((state) => ({ pending: [...state.pending.slice(-999), event] }));
  void flushHistory();
}

let flushing = false;

export async function flushHistory() {
  if (flushing || !isOnline()) return;
  const events = useHistory.getState().pending;
  if (!events.length) return;
  flushing = true;
  try {
    await api("/history/", { body: { events } });
    // Keep events recorded while the request was running.
    useHistory.setState((state) => ({ pending: state.pending.slice(events.length) }));
  } catch {
    /* stay pending */
  } finally {
    flushing = false;
  }
}
