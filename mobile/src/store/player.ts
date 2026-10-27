import AsyncStorage from "@react-native-async-storage/async-storage";
import { isRunningInExpoGo } from "expo";
import { createAudioPlaylist, setAudioModeAsync, type AudioPlaylist, type AudioSource } from "expo-audio";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { api } from "@/lib/api";
import { shuffled } from "@/lib/format";
import type { Track } from "@/lib/types";
import { localTrackUri, lockScreenCover, useDownloads } from "@/store/downloads";
import { recordPlay } from "@/store/history";
import { serverUrl } from "@/store/session";

/**
 * Playback uses expo-audio's native playlist: advancing to the next song and the
 * lock-screen next/previous buttons work even while the app is in the background.
 * This store mirrors the native queue for the UI.
 */

export interface QueueItem {
  key: string;
  track: Track;
}

export interface PlayContext {
  type: "playlist" | "album" | "artist" | "library" | "search" | "home" | "downloads" | "queue";
  id?: number;
  name?: string;
}

export type RepeatMode = "off" | "all" | "one";

/** Native queues with thousands of entries get slow; longer lists are cut to this size. */
const MAX_QUEUE = 500;

interface PlayerState {
  queue: QueueItem[];
  index: number;
  context: PlayContext | null;
  shuffle: boolean;
  repeat: RepeatMode;
  isPlaying: boolean;

  playTracks: (tracks: Track[], start?: number, context?: PlayContext | null, shuffle?: boolean) => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  jumpTo: (index: number) => void;
  seek: (seconds: number) => void;
  playNext: (tracks: Track[]) => void;
  addToQueue: (tracks: Track[]) => void;
  removeAt: (index: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  stop: () => void;
}

interface ProgressState {
  position: number;
  duration: number;
  buffering: boolean;
}

export const useProgress = create<ProgressState>(() => ({ position: 0, duration: 0, buffering: false }));

let native: AudioPlaylist | null = null;
/** Whether the native playlist currently holds the queue (false after an app restart). */
let loaded = false;
let lastRecordedKey: string | null = null;
let keyCounter = 0;

const toItems = (tracks: Track[]): QueueItem[] =>
  tracks.map((track) => ({ key: `${Date.now().toString(36)}-${(keyCounter += 1)}`, track }));

/**
 * Signed stream links (track id -> absolute URL). The native playlist cannot send an
 * Authorization header on Android, so streams use short-lived links from the server.
 */
const streamUrls = new Map<number, { url: string; expiresAt: number }>();
/** Renew links this long before they expire, so a queue never runs into a dead link. */
const RENEW_MARGIN_MS = 2 * 60 * 60 * 1000;

const linkValid = (trackId: number) => (streamUrls.get(trackId)?.expiresAt ?? 0) - Date.now() > RENEW_MARGIN_MS;

/** Fetch signed links for every track that is not downloaded and has no fresh link yet. */
async function prepareStreams(tracks: Track[]) {
  const ids = [...new Set(tracks.map((t) => t.id))].filter((id) => !localTrackUri(id) && !linkValid(id));
  for (let start = 0; start < ids.length; start += 500) {
    try {
      const result = await api<{ urls: Record<string, string>; expires_in: number }>("/tracks/stream-urls/", {
        body: { ids: ids.slice(start, start + 500) },
      });
      const expiresAt = Date.now() + result.expires_in * 1000;
      for (const [id, url] of Object.entries(result.urls)) streamUrls.set(Number(id), { url: serverUrl(url), expiresAt });
    } catch {
      return; // offline: downloaded songs still play, the others fail and are skipped by the player
    }
  }
}

/** Downloaded songs play from the device, everything else is streamed via a signed link. */
function sourceFor(track: Track): AudioSource {
  const local = localTrackUri(track.id);
  if (local) return { uri: local, name: track.title };
  return { uri: streamUrls.get(track.id)?.url ?? serverUrl(`/api/tracks/${track.id}/stream/`), name: track.title };
}

/** Load the queue into the native player once all stream links are available. */
async function prepareAndLoad(queue: QueueItem[], index: number) {
  await prepareStreams(queue.map((item) => item.track));
  // Ignore if the user started something else meanwhile.
  if (usePlayer.getState().queue === queue) load(queue, index, true);
}

const LOOP = { off: "none", all: "all", one: "single" } as const;

/**
 * Lock-screen controls need the native background service from the expo-audio config plugin.
 * Expo Go does not contain it, so there they are skipped (playback works, just without them).
 */
const lockScreenAvailable = !isRunningInExpoGo();

function player(): AudioPlaylist {
  if (native) return native;
  native = createAudioPlaylist({ updateInterval: 500, loop: "none" });

  native.addListener("trackChanged", ({ currentIndex }) => {
    usePlayer.setState({ index: currentIndex });
    useProgress.setState({ position: 0 });
    void onTrackStarted();
  });

  native.addListener("playlistStatusUpdate", (status) => {
    useProgress.setState({ position: status.currentTime, duration: status.duration, buffering: status.isBuffering });
    const state = usePlayer.getState();
    if (state.isPlaying !== status.playing) {
      // Keep "playing" while the next song is loading so the UI does not flicker.
      if (status.playing || !status.isBuffering) usePlayer.setState({ isPlaying: status.playing });
    }
  });
  return native;
}

async function onTrackStarted() {
  const { queue, index, context } = usePlayer.getState();
  const item = queue[index];
  if (!item || !native) return;
  if (item.key !== lastRecordedKey) {
    lastRecordedKey = item.key;
    recordPlay(item.track.id, context?.type === "playlist" ? context.id ?? null : null);
  }
  if (!lockScreenAvailable) return;
  const metadata = { title: item.track.title, artist: item.track.artist, albumTitle: item.track.album ?? undefined };
  native.updateLockScreenMetadata(metadata);
  const artworkUrl = await lockScreenCover(item.track.artwork);
  if (artworkUrl && usePlayer.getState().queue[usePlayer.getState().index]?.key === item.key) {
    native.updateLockScreenMetadata({ ...metadata, artworkUrl });
  }
}

/** Replace the native queue with ``queue`` and start at ``index``. */
function load(queue: QueueItem[], index: number, autoplay: boolean) {
  const audio = player();
  audio.clear();
  for (const item of queue) audio.add(sourceFor(item.track));
  audio.loop = LOOP[usePlayer.getState().repeat];
  audio.skipTo(index);
  loaded = true;
  lastRecordedKey = null;
  const track = queue[index]?.track;
  if (lockScreenAvailable) {
    audio.setActiveForLockScreen(
      true,
      track ? { title: track.title, artist: track.artist, albumTitle: track.album ?? undefined } : undefined,
      { showNextTrack: true, showPreviousTrack: true, showSeekForward: false, showSeekBackward: false },
    );
  }
  if (autoplay) {
    audio.play();
    usePlayer.setState({ isPlaying: true });
  }
  void onTrackStarted();
}

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      index: 0,
      context: null,
      shuffle: false,
      repeat: "off",
      isPlaying: false,

      playTracks: (tracks, start = 0, context = null, shuffle) => {
        if (!tracks.length) return;
        const useShuffle = shuffle ?? get().shuffle;
        let queue: QueueItem[];
        if (useShuffle) {
          const items = toItems(tracks);
          // A tapped song plays first; "shuffle play" starts anywhere.
          const first = shuffle === true ? [] : [items[start]];
          queue = [...first, ...shuffled(items.filter((item) => !first.includes(item)))].slice(0, MAX_QUEUE);
          start = 0;
        } else {
          const offset = Math.max(0, Math.min(start, tracks.length - MAX_QUEUE));
          queue = toItems(tracks.slice(offset, offset + MAX_QUEUE));
          start -= offset;
        }
        set({ queue, index: start, context, shuffle: useShuffle, isPlaying: true });
        void prepareAndLoad(queue, start);
      },

      togglePlay: () => {
        const { queue, index, isPlaying } = get();
        if (!queue.length) return;
        const upcoming = queue.slice(index).map((item) => item.track);
        if (!loaded || (!isPlaying && upcoming.some((t) => !localTrackUri(t.id) && !linkValid(t.id)))) {
          // First play after an app start, or links expired during a long pause: reload the queue.
          set({ isPlaying: true });
          void prepareAndLoad(queue, index);
          return;
        }
        if (isPlaying) player().pause();
        else player().play();
        set({ isPlaying: !isPlaying });
      },

      next: () => {
        const { queue, index, repeat } = get();
        if (!loaded || !queue.length) return;
        if (index >= queue.length - 1 && repeat === "off") return;
        player().next();
      },

      previous: () => {
        if (!loaded) return;
        if (useProgress.getState().position > 3 || get().index === 0) void player().seekTo(0);
        else player().previous();
      },

      jumpTo: (index) => {
        if (!loaded) {
          void prepareAndLoad(get().queue, index);
          return;
        }
        player().skipTo(index);
        player().play();
        set({ isPlaying: true });
      },

      seek: (seconds) => {
        if (loaded) void player().seekTo(Math.max(0, seconds));
      },

      playNext: (tracks) => {
        const { queue, index } = get();
        if (!queue.length || !loaded) {
          get().playTracks(tracks, 0, { type: "queue" }, false);
          return;
        }
        const items = toItems(tracks);
        set({ queue: [...queue.slice(0, index + 1), ...items, ...queue.slice(index + 1)] });
        void prepareStreams(tracks).then(() =>
          items.forEach((item, offset) => player().insert(sourceFor(item.track), index + 1 + offset)),
        );
      },

      addToQueue: (tracks) => {
        const { queue } = get();
        if (!queue.length || !loaded) {
          get().playTracks(tracks, 0, { type: "queue" }, false);
          return;
        }
        const items = toItems(tracks);
        set({ queue: [...queue, ...items] });
        void prepareStreams(tracks).then(() => items.forEach((item) => player().add(sourceFor(item.track))));
      },

      removeAt: (position) => {
        const { queue, index } = get();
        if (position === index || !queue[position]) return;
        if (loaded) player().remove(position);
        set({ queue: queue.filter((_, i) => i !== position), index: position < index ? index - 1 : index });
      },

      toggleShuffle: () => {
        const { shuffle, queue, index } = get();
        const current = queue[index];
        if (!current) {
          set({ shuffle: !shuffle });
          return;
        }
        // Without an "unshuffled" copy, switching shuffle off keeps the current order of the rest.
        const rest = queue.filter((_, i) => i !== index);
        const reordered = shuffle ? rest : shuffled(rest);
        if (loaded) {
          // Rebuild everything around the current song without interrupting it.
          const audio = player();
          for (let i = queue.length - 1; i > index; i -= 1) audio.remove(i);
          for (let i = 0; i < index; i += 1) audio.remove(0);
          for (const item of reordered) audio.add(sourceFor(item.track));
        }
        set({ shuffle: !shuffle, queue: [current, ...reordered], index: 0 });
      },

      cycleRepeat: () => {
        const order: RepeatMode[] = ["off", "all", "one"];
        const repeat = order[(order.indexOf(get().repeat) + 1) % order.length];
        if (native) native.loop = LOOP[repeat];
        set({ repeat });
      },

      stop: () => {
        if (native) {
          native.pause();
          native.clear();
          if (lockScreenAvailable) native.clearLockScreenControls();
        }
        loaded = false;
        set({ queue: [], index: 0, context: null, isPlaying: false });
      },
    }),
    {
      name: "michi-player",
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        queue: state.queue,
        index: state.index,
        context: state.context,
        shuffle: state.shuffle,
        repeat: state.repeat,
      }),
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<PlayerState>), isPlaying: false }),
    },
  ),
);

export const useCurrentTrack = () => usePlayer((s) => s.queue[s.index]?.track ?? null);

// A download sync brings fresh metadata (e.g. a title edited on the web): show it in the queue, too.
useDownloads.subscribe((state, previous) => {
  if (state.tracks === previous.tracks) return;
  let changed = false;
  const queue = usePlayer.getState().queue.map((item) => {
    const fresh = state.tracks[item.track.id]?.track;
    if (!fresh || fresh === item.track) return item;
    changed = true;
    return { ...item, track: fresh };
  });
  if (changed) usePlayer.setState({ queue });
});

export async function configureAudio() {
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: "doNotMix",
  });
}
