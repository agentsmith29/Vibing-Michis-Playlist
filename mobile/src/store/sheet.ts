import { create } from "zustand";

import type { Track } from "@/lib/types";

/** The track whose action sheet is open (one global sheet for all lists). */
interface SheetState {
  track: Track | null;
  playlistId?: number;
  entryId?: number;
}

export const useSheet = create<SheetState>(() => ({ track: null }));
