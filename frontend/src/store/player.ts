import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { Track } from "../api/types";
import { shuffled, streamUrl } from "../lib/format";

/** The single audio element of the app. It lives outside React so playback survives navigation. */
export const audio = new Audio();
audio.preload = "auto";

export interface QueueItem {
  key: string;
  track: Track;
}

export interface PlayContext {
  type: "playlist" | "album" | "artist" | "library" | "search" | "home" | "queue";
  id?: number;
  name?: string;
}

export type RepeatMode = "off" | "all" | "one";

interface PlayerState {
  queue: QueueItem[];
  /** Queue order before shuffling, restored when shuffle is switched off. */
  unshuffled: QueueItem[] | null;
  index: number;
  context: PlayContext | null;
  isPlaying: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  muted: boolean;
  /** Position to resume from after a page reload. */
  resumeAt: number;

  playTracks: (tracks: Track[], start?: number, context?: PlayContext | null, shuffle?: boolean) => void;
  togglePlay: () => void;
  next: (auto?: boolean) => void;
  previous: () => void;
  jumpTo: (index: number) => void;
  playNext: (tracks: Track[]) => void;
  addToQueue: (tracks: Track[]) => void;
  removeFromQueue: (key: string) => void;
  clearUpcoming: () => void;
  moveInQueue: (from: number, to: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  seek: (seconds: number) => void;
  updateTrack: (track: Track) => void;
  forgetTrack: (trackId: number) => void;
}

let keyCounter = 0;
const toItems = (tracks: Track[]): QueueItem[] =>
  tracks.map((track) => ({ key: `${Date.now().toString(36)}-${(keyCounter += 1)}`, track }));

function load(track: Track | undefined, autoplay: boolean, startAt = 0) {
  if (!track) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    return;
  }
  audio.src = streamUrl(track.id);
  if (startAt > 0) {
    audio.addEventListener("loadedmetadata", () => (audio.currentTime = startAt), { once: true });
  }
  if (autoplay) {
    audio.play().catch(() => usePlayer.setState({ isPlaying: false }));
  }
}

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      unshuffled: null,
      index: 0,
      context: null,
      isPlaying: false,
      shuffle: false,
      repeat: "off",
      volume: 0.8,
      muted: false,
      resumeAt: 0,

      playTracks: (tracks, start = 0, context = null, shuffle) => {
        if (!tracks.length) return;
        const useShuffle = shuffle ?? get().shuffle;
        const items = toItems(tracks);
        if (useShuffle) {
          // A specifically chosen song plays first; "shuffle play" starts anywhere.
          const first = shuffle === true ? [] : [items[start]];
          const rest = items.filter((item) => !first.includes(item));
          set({ queue: [...first, ...shuffled(rest)], unshuffled: items, index: 0, shuffle: true });
        } else {
          set({ queue: items, unshuffled: null, index: start, shuffle: false });
        }
        set({ context, isPlaying: true, resumeAt: 0 });
        load(get().queue[get().index]?.track, true);
      },

      togglePlay: () => {
        const { queue, index } = get();
        if (!queue[index]) return;
        if (!audio.src) load(queue[index].track, false, get().resumeAt);
        if (audio.paused) {
          set({ isPlaying: true });
          audio.play().catch(() => set({ isPlaying: false }));
        } else {
          audio.pause();
        }
      },

      next: (auto = false) => {
        const { queue, index, repeat } = get();
        if (!queue.length) return;
        if (auto && repeat === "one") {
          audio.currentTime = 0;
          audio.play().catch(() => set({ isPlaying: false }));
          return;
        }
        let target = index + 1;
        if (target >= queue.length) {
          if (repeat === "off" && auto) {
            // End of the queue: stop on the last song.
            set({ isPlaying: false });
            audio.currentTime = 0;
            return;
          }
          target = 0;
        }
        set({ index: target, isPlaying: true, resumeAt: 0 });
        load(queue[target].track, true);
      },

      previous: () => {
        const { queue, index, repeat } = get();
        if (!queue.length) return;
        if (audio.currentTime > 3 || (index === 0 && repeat !== "all")) {
          audio.currentTime = 0;
          return;
        }
        const target = index === 0 ? queue.length - 1 : index - 1;
        set({ index: target, isPlaying: true, resumeAt: 0 });
        load(queue[target].track, true);
      },

      jumpTo: (target) => {
        const { queue } = get();
        if (!queue[target]) return;
        set({ index: target, isPlaying: true, resumeAt: 0 });
        load(queue[target].track, true);
      },

      playNext: (tracks) => {
        const { queue, index, unshuffled } = get();
        const items = toItems(tracks);
        if (!queue.length) {
          get().playTracks(tracks, 0, { type: "queue" }, false);
          return;
        }
        set({
          queue: [...queue.slice(0, index + 1), ...items, ...queue.slice(index + 1)],
          unshuffled: unshuffled ? [...unshuffled, ...items] : null,
        });
      },

      addToQueue: (tracks) => {
        const { queue, unshuffled } = get();
        const items = toItems(tracks);
        if (!queue.length) {
          get().playTracks(tracks, 0, { type: "queue" }, false);
          return;
        }
        set({ queue: [...queue, ...items], unshuffled: unshuffled ? [...unshuffled, ...items] : null });
      },

      removeFromQueue: (key) => {
        const { queue, index, unshuffled } = get();
        const position = queue.findIndex((item) => item.key === key);
        if (position < 0 || position === index) return;
        set({
          queue: queue.filter((item) => item.key !== key),
          unshuffled: unshuffled?.filter((item) => item.key !== key) ?? null,
          index: position < index ? index - 1 : index,
        });
      },

      clearUpcoming: () => {
        const { queue, index } = get();
        set({ queue: queue.slice(0, index + 1), unshuffled: null });
      },

      moveInQueue: (from, to) => {
        const { queue, index } = get();
        if (from === to || !queue[from] || !queue[to]) return;
        const next = [...queue];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        const current = queue[index].key;
        set({ queue: next, index: next.findIndex((item) => item.key === current) });
      },

      toggleShuffle: () => {
        const { shuffle, queue, index, unshuffled } = get();
        const current = queue[index];
        if (!current) {
          set({ shuffle: !shuffle });
          return;
        }
        if (!shuffle) {
          const rest = queue.filter((item) => item.key !== current.key);
          set({ shuffle: true, unshuffled: queue, queue: [current, ...shuffled(rest)], index: 0 });
        } else {
          const original = unshuffled ?? queue;
          set({
            shuffle: false,
            unshuffled: null,
            queue: original,
            index: Math.max(0, original.findIndex((item) => item.key === current.key)),
          });
        }
      },

      cycleRepeat: () => {
        const order: RepeatMode[] = ["off", "all", "one"];
        set({ repeat: order[(order.indexOf(get().repeat) + 1) % order.length] });
      },

      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)), muted: false }),
      toggleMute: () => set({ muted: !get().muted }),

      seek: (seconds) => {
        if (Number.isFinite(seconds)) audio.currentTime = Math.max(0, seconds);
      },

      updateTrack: (track) => {
        const replace = (items: QueueItem[]) =>
          items.map((item) => (item.track.id === track.id ? { ...item, track } : item));
        const { queue, unshuffled } = get();
        set({ queue: replace(queue), unshuffled: unshuffled ? replace(unshuffled) : null });
      },

      forgetTrack: (trackId) => {
        const { queue, index, unshuffled } = get();
        if (queue[index]?.track.id === trackId) {
          audio.pause();
          audio.removeAttribute("src");
        }
        const kept = queue.filter((item) => item.track.id !== trackId);
        const removedBefore = queue.slice(0, index).filter((item) => item.track.id === trackId).length;
        set({
          queue: kept,
          unshuffled: unshuffled?.filter((item) => item.track.id !== trackId) ?? null,
          index: Math.min(Math.max(0, index - removedBefore), Math.max(0, kept.length - 1)),
          isPlaying: queue[index]?.track.id === trackId ? false : get().isPlaying,
        });
      },
    }),
    {
      name: "michi-player",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        queue: state.queue.slice(0, 2000),
        unshuffled: state.unshuffled?.slice(0, 2000) ?? null,
        index: state.index,
        context: state.context,
        shuffle: state.shuffle,
        repeat: state.repeat,
        volume: state.volume,
        muted: state.muted,
        resumeAt: state.resumeAt,
      }),
      // After a reload nothing is playing until the user presses play.
      merge: (persisted, current) => ({ ...current, ...(persisted as Partial<PlayerState>), isPlaying: false }),
    },
  ),
);

export const useCurrentTrack = () => usePlayer((state) => state.queue[state.index]?.track ?? null);

/** Playback position, kept separate so that only progress widgets re-render several times a second. */
interface ProgressState {
  currentTime: number;
  duration: number;
  buffering: boolean;
}

export const useProgress = create<ProgressState>(() => ({ currentTime: 0, duration: 0, buffering: false }));
