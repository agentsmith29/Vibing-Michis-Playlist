import { QueryClient, QueryClientProvider, focusManager, onlineManager } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import TrackSheet from "@/components/TrackSheet";
import { api } from "@/lib/api";
import { colors } from "@/lib/theme";
import { useConnectivity, watchNetwork } from "@/store/connectivity";
import { startDownloads, useDownloads, watchDownloads } from "@/store/downloads";
import { flushHistory } from "@/store/history";
import { configureAudio } from "@/store/player";
import { useSession } from "@/store/session";

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1, networkMode: "always" } },
});

onlineManager.setEventListener((setOnline) =>
  useConnectivity.subscribe((state) => setOnline(state.networkUp && state.serverReachable)),
);

let syncedOnce = false;

/** Ping the server; detects when the VPN / server goes away or becomes reachable again. */
async function checkServer() {
  if (!useSession.getState().session) return;
  try {
    const wasReachable = useConnectivity.getState().serverReachable;
    await api("/health/", { auth: false, timeoutMs: 5000 });
    if (!wasReachable || !syncedOnce) {
      // Just (re)connected: upload offline plays and refresh downloads.
      syncedOnce = true;
      void flushHistory();
      void useDownloads.getState().sync();
    }
  } catch {
    /* api() marks the server as unreachable */
  }
}

export default function RootLayout() {
  const ready = useSession((s) => s.ready);
  const loggedIn = useSession((s) => !!s.session);

  useEffect(() => {
    void useSession.getState().load();
    void configureAudio();
    const stopNetwork = watchNetwork();
    const stopDownloads = watchDownloads();
    startDownloads();
    const appState = AppState.addEventListener("change", (status) => {
      focusManager.setFocused(status === "active");
      if (status === "active") void checkServer();
    });
    // Check the server regularly so a dropped VPN shows up quickly (and a returning one, too).
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void checkServer();
    }, 15_000);
    return () => {
      stopNetwork();
      stopDownloads();
      appState.remove();
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void SplashScreen.hideAsync();
    if (loggedIn) void checkServer();
  }, [ready, loggedIn]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.surface },
          }}
        >
          <Stack.Protected guard={loggedIn}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="playlist/[id]" options={{ title: "" }} />
            <Stack.Screen name="album/[id]" options={{ title: "" }} />
            <Stack.Screen name="artist/[id]" options={{ title: "" }} />
            <Stack.Screen name="settings" options={{ title: "Settings" }} />
            <Stack.Screen name="player" options={{ presentation: "modal", headerShown: false }} />
            <Stack.Screen name="queue" options={{ presentation: "modal", title: "Queue" }} />
          </Stack.Protected>
          <Stack.Protected guard={!loggedIn}>
            <Stack.Screen name="login" options={{ headerShown: false }} />
          </Stack.Protected>
        </Stack>
        {loggedIn && <TrackSheet />}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
