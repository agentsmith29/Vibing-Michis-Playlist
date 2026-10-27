import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

import type { User } from "@/lib/types";

const KEY = "michi-session";

export interface StoredSession {
  server: string;
  token: string;
  user: User;
}

interface SessionState {
  ready: boolean;
  session: StoredSession | null;
  load: () => Promise<void>;
  save: (session: StoredSession) => Promise<void>;
  clear: () => Promise<void>;
}

/** Server address and device token. The token lives in the OS keychain / keystore. */
export const useSession = create<SessionState>()((set) => ({
  ready: false,
  session: null,
  load: async () => {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      set({ session: raw ? (JSON.parse(raw) as StoredSession) : null, ready: true });
    } catch {
      set({ session: null, ready: true });
    }
  },
  save: async (session) => {
    await SecureStore.setItemAsync(KEY, JSON.stringify(session));
    set({ session });
  },
  clear: async () => {
    await SecureStore.deleteItemAsync(KEY);
    set({ session: null });
  },
}));

/** Auth header for direct native requests (audio, images, downloads). */
export function authHeaders(): Record<string, string> {
  const token = useSession.getState().session?.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function serverUrl(path: string): string {
  return `${useSession.getState().session?.server ?? ""}${path}`;
}
