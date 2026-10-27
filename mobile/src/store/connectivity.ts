import { addNetworkStateListener, getNetworkStateAsync, NetworkStateType } from "expo-network";
import { create } from "zustand";

interface ConnectivityState {
  /** The phone has a network connection at all. */
  networkUp: boolean;
  /** On Wi-Fi / ethernet (for "download on Wi-Fi only"). */
  unmetered: boolean;
  /** The Michi Playlist server answered recently (VPN connected, server running). */
  serverReachable: boolean;
  setServerReachable: (reachable: boolean) => void;
}

export const useConnectivity = create<ConnectivityState>()((set, get) => ({
  networkUp: true,
  unmetered: true,
  serverReachable: true,
  setServerReachable: (reachable) => {
    if (get().serverReachable !== reachable) set({ serverReachable: reachable });
  },
}));

export const isOnline = () => {
  const state = useConnectivity.getState();
  return state.networkUp && state.serverReachable;
};

export const useOnline = () => useConnectivity((s) => s.networkUp && s.serverReachable);

function apply(type: NetworkStateType | undefined, isConnected: boolean | undefined) {
  useConnectivity.setState({
    networkUp: isConnected !== false,
    unmetered: type === NetworkStateType.WIFI || type === NetworkStateType.ETHERNET,
  });
}

export function watchNetwork(): () => void {
  getNetworkStateAsync()
    .then((state) => apply(state.type, state.isConnected))
    .catch(() => {});
  const subscription = addNetworkStateListener((state) => apply(state.type, state.isConnected));
  return () => subscription.remove();
}
