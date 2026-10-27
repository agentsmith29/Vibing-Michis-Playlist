import { create } from "zustand";

import type { Playlist, Track } from "../api/types";

export interface Toast {
  id: number;
  message: string;
  variant: "success" | "danger" | "info";
}

interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
}

interface UiState {
  toasts: Toast[];
  editTrack: Track | null;
  playlistForm: { playlist?: Playlist; trackIds?: number[] } | null;
  confirm: ConfirmRequest | null;
  queueOpen: boolean;
  nowPlayingOpen: boolean;

  toast: (message: string, variant?: Toast["variant"]) => void;
  dismissToast: (id: number) => void;
  set: (partial: Partial<Omit<UiState, "toast" | "dismissToast" | "set">>) => void;
}

let toastId = 0;

export const useUi = create<UiState>()((set) => ({
  toasts: [],
  editTrack: null,
  playlistForm: null,
  confirm: null,
  queueOpen: false,
  nowPlayingOpen: false,

  toast: (message, variant = "success") => {
    const id = (toastId += 1);
    set((state) => ({ toasts: [...state.toasts.slice(-3), { id, message, variant }] }));
    window.setTimeout(() => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })), 4000);
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  set: (partial) => set(partial),
}));

export const toast = (message: string, variant?: Toast["variant"]) => useUi.getState().toast(message, variant);
