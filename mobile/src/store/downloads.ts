import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { api, ApiError } from "@/lib/api";
import type { PlaylistDetail, Track } from "@/lib/types";
import { isOnline, useConnectivity } from "@/store/connectivity";
import { authHeaders, serverUrl } from "@/store/session";

/**
 * Offline downloads.
 *
 * Paths are stored relative to the document directory because the absolute
 * container path changes with app updates on iOS.
 */

export interface DownloadedTrack {
  track: Track;
  file: string;
  cover: string | null;
  size: number;
  /** Downloaded on its own (not only as part of an offline playlist). */
  pinned: boolean;
  downloadedAt: string;
  /** ``file_version`` of the downloaded file. */
  version?: string;
  /** The file changed on the server since it was downloaded. */
  outdated?: boolean;
}

export interface OfflinePlaylist {
  playlist: PlaylistDetail;
  syncedAt: string;
}

export interface DownloadJob {
  track: Track;
  pinned: boolean;
  status: "queued" | "downloading" | "failed";
  progress: number;
  error?: string;
  /** Re-download of a song that is already on the phone (the old file stays until the new one is complete). */
  replace?: boolean;
}

interface DownloadState {
  tracks: Record<number, DownloadedTrack>;
  playlists: Record<number, OfflinePlaylist>;
  jobs: Record<number, DownloadJob>;
  wifiOnly: boolean;
  syncing: boolean;

  downloadTracks: (tracks: Track[]) => void;
  redownload: (trackIds: number[]) => void;
  removeTrack: (trackId: number) => void;
  downloadPlaylist: (playlist: PlaylistDetail) => void;
  removePlaylist: (playlistId: number) => void;
  sync: () => Promise<void>;
  retryFailed: () => void;
  removeAll: () => void;
  setWifiOnly: (value: boolean) => void;
}

const MUSIC_DIR = "music";
const COVER_DIR = "covers";

const documentFile = (relative: string) => new File(Paths.document, relative);

function ensureDir(parent: Directory, name: string): Directory {
  const directory = new Directory(parent, name);
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

function deleteRelative(relative: string | null) {
  if (!relative) return;
  try {
    const file = documentFile(relative);
    if (file.exists) file.delete();
  } catch {
    /* already gone */
  }
}

/** Ids of tracks that some offline playlist still needs. */
function playlistTrackIds(playlists: Record<number, OfflinePlaylist>): Set<number> {
  const ids = new Set<number>();
  for (const offline of Object.values(playlists)) {
    for (const entry of offline.playlist.entries) ids.add(entry.track.id);
  }
  return ids;
}

export const useDownloads = create<DownloadState>()(
  persist(
    (set, get) => ({
      tracks: {},
      playlists: {},
      jobs: {},
      wifiOnly: false,
      syncing: false,

      downloadTracks: (tracks) => {
        const { tracks: done, jobs } = get();
        const next = { ...jobs };
        const pinnedNow: Record<number, DownloadedTrack> = {};
        for (const track of tracks) {
          if (done[track.id]) pinnedNow[track.id] = { ...done[track.id], pinned: true };
          else if (!next[track.id]) next[track.id] = { track, pinned: true, status: "queued", progress: 0 };
          else next[track.id] = { ...next[track.id], pinned: true };
        }
        set({ jobs: next, tracks: { ...done, ...pinnedNow } });
        void pump();
      },

      redownload: (trackIds) => {
        const { tracks, jobs } = get();
        const next = { ...jobs };
        for (const id of trackIds) {
          const entry = tracks[id];
          if (entry) next[id] = { track: entry.track, pinned: entry.pinned, status: "queued", progress: 0, replace: true };
        }
        set({ jobs: next });
        void pump();
      },

      removeTrack: (trackId) => {
        const { tracks, playlists, jobs } = get();
        const { [trackId]: _job, ...restJobs } = jobs;
        const entry = tracks[trackId];
        if (!entry) {
          set({ jobs: restJobs });
          return;
        }
        if (playlistTrackIds(playlists).has(trackId)) {
          // Still needed by an offline playlist: just unpin it.
          set({ tracks: { ...tracks, [trackId]: { ...entry, pinned: false } }, jobs: restJobs });
          return;
        }
        deleteRelative(entry.file);
        const { [trackId]: _removed, ...rest } = tracks;
        set({ tracks: rest, jobs: restJobs });
        pruneCovers();
      },

      downloadPlaylist: (playlist) => {
        set({
          playlists: { ...get().playlists, [playlist.id]: { playlist, syncedAt: new Date().toISOString() } },
        });
        enqueueMissing();
      },

      removePlaylist: (playlistId) => {
        const { [playlistId]: _removed, ...playlists } = get().playlists;
        set({ playlists });
        pruneTracks();
      },

      sync: async () => {
        if (get().syncing || !isOnline()) return;
        set({ syncing: true });
        try {
          // 1. Refresh offline playlists (new songs get downloaded, removed ones cleaned up).
          const playlists = { ...get().playlists };
          for (const id of Object.keys(playlists).map(Number)) {
            try {
              const playlist = await api<PlaylistDetail>(`/playlists/${id}/`);
              playlists[id] = { playlist, syncedAt: new Date().toISOString() };
            } catch (error) {
              if (error instanceof ApiError && error.status === 404) delete playlists[id];
              else throw error;
            }
          }
          set({ playlists });

          // 2. Update metadata of downloaded songs and drop songs deleted on the server.
          const ids = Object.keys(get().tracks).map(Number);
          if (ids.length) {
            const result = await api<{ tracks: Track[]; missing: number[] }>("/sync/tracks/", { body: { ids } });
            const tracks = { ...get().tracks };
            for (const track of result.tracks) {
              const entry = tracks[track.id];
              if (!entry) continue;
              // Downloads from before versions existed are assumed to be current.
              const version = entry.version ?? track.file_version;
              tracks[track.id] = { ...entry, track, version, outdated: version !== track.file_version };
            }
            for (const id of result.missing) {
              deleteRelative(tracks[id]?.file ?? null);
              delete tracks[id];
            }
            set({ tracks });
          }
          pruneTracks();
          enqueueMissing();
        } catch {
          /* offline or server error: try again next time */
        } finally {
          set({ syncing: false });
        }
      },

      retryFailed: () => {
        const jobs = Object.fromEntries(
          Object.entries(get().jobs).map(([id, job]) => [id, job.status === "failed" ? { ...job, status: "queued" as const, error: undefined } : job]),
        );
        set({ jobs });
        void pump();
      },

      removeAll: () => {
        for (const entry of Object.values(get().tracks)) deleteRelative(entry.file);
        set({ tracks: {}, playlists: {}, jobs: {} });
        pruneCovers();
      },

      setWifiOnly: (wifiOnly) => {
        set({ wifiOnly });
        void pump();
      },
    }),
    {
      name: "michi-downloads",
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        tracks: state.tracks,
        playlists: state.playlists,
        jobs: state.jobs,
        wifiOnly: state.wifiOnly,
      }),
      // Downloads that were running when the app was closed start again.
      merge: (persisted, current) => {
        const saved = persisted as Partial<DownloadState>;
        const jobs = Object.fromEntries(
          Object.entries(saved.jobs ?? {}).map(([id, job]) => [id, job.status === "downloading" ? { ...job, status: "queued" as const, progress: 0 } : job]),
        );
        return { ...current, ...saved, jobs };
      },
    },
  ),
);

function enqueueMissing() {
  const { tracks, playlists, jobs } = useDownloads.getState();
  const next = { ...jobs };
  for (const offline of Object.values(playlists)) {
    for (const { track } of offline.playlist.entries) {
      if (!tracks[track.id] && !next[track.id]) next[track.id] = { track, pinned: false, status: "queued", progress: 0 };
    }
  }
  useDownloads.setState({ jobs: next });
  void pump();
}

/** Delete songs that are neither pinned nor part of an offline playlist. */
function pruneTracks() {
  const { tracks, playlists } = useDownloads.getState();
  const needed = playlistTrackIds(playlists);
  const kept: Record<number, DownloadedTrack> = {};
  for (const [id, entry] of Object.entries(tracks)) {
    if (entry.pinned || needed.has(Number(id))) kept[Number(id)] = entry;
    else deleteRelative(entry.file);
  }
  useDownloads.setState({ tracks: kept });
  pruneCovers();
}

function pruneCovers() {
  const used = new Set(Object.values(useDownloads.getState().tracks).map((entry) => entry.cover));
  try {
    const directory = new Directory(Paths.document, COVER_DIR);
    if (!directory.exists) return;
    for (const item of directory.list()) {
      if (item instanceof File && !used.has(`${COVER_DIR}/${item.name}`)) item.delete();
    }
  } catch {
    /* ignore */
  }
}

async function downloadCover(sha1: string | null): Promise<string | null> {
  if (!sha1) return null;
  const relative = `${COVER_DIR}/${sha1}.jpg`;
  const target = documentFile(relative);
  if (target.exists) return relative;
  try {
    ensureDir(Paths.document, COVER_DIR);
    await File.downloadFileAsync(serverUrl(`/api/artwork/${sha1}/?size=thumb`), target, {
      headers: authHeaders(),
      idempotent: true,
    });
    return relative;
  } catch {
    return null;
  }
}

let pumping = false;

/** Works through the download queue, one song at a time. */
async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const state = useDownloads.getState();
      const connectivity = useConnectivity.getState();
      if (!isOnline() || (state.wifiOnly && !connectivity.unmetered)) return;
      const job = Object.values(state.jobs).find((candidate) => candidate.status === "queued");
      if (!job) return;
      await downloadOne(job);
    }
  } finally {
    pumping = false;
  }
}

function updateJob(trackId: number, patch: Partial<DownloadJob>) {
  const jobs = useDownloads.getState().jobs;
  if (jobs[trackId]) useDownloads.setState({ jobs: { ...jobs, [trackId]: { ...jobs[trackId], ...patch } } });
}

async function downloadOne(job: DownloadJob) {
  const { track } = job;
  const relative = `${MUSIC_DIR}/${track.id}.mp3`;
  // A re-download goes to a temporary file first, so the working offline copy survives a failure.
  const target = job.replace ? `${MUSIC_DIR}/${track.id}.new.mp3` : relative;
  updateJob(track.id, { status: "downloading", progress: 0 });
  let lastUpdate = 0;
  try {
    ensureDir(Paths.document, MUSIC_DIR);
    let file = await File.downloadFileAsync(serverUrl(`/api/tracks/${track.id}/stream/`), documentFile(target), {
      headers: authHeaders(),
      idempotent: true,
      onProgress: ({ bytesWritten, totalBytes }) => {
        const now = Date.now();
        if (totalBytes > 0 && now - lastUpdate > 250) {
          lastUpdate = now;
          updateJob(track.id, { progress: bytesWritten / totalBytes });
        }
      },
    });
    if (job.replace) {
      await file.move(documentFile(relative), { overwrite: true });
      file = documentFile(relative);
    }
    const cover = await downloadCover(track.artwork);
    const state = useDownloads.getState();
    const { [track.id]: finished, ...jobs } = state.jobs;
    if (!finished) {
      // Cancelled while downloading.
      if (!job.replace) deleteRelative(relative);
      return;
    }
    useDownloads.setState({
      jobs,
      tracks: {
        ...state.tracks,
        [track.id]: {
          track,
          file: relative,
          cover,
          size: file.size,
          pinned: finished.pinned,
          downloadedAt: new Date().toISOString(),
          version: track.file_version,
          outdated: false,
        },
      },
    });
    pruneCovers();
  } catch (error) {
    deleteRelative(target);
    updateJob(track.id, { status: "failed", error: error instanceof Error ? error.message : "Download failed" });
    if (!isOnline()) updateJob(track.id, { status: "queued", error: undefined });
  }
}

/** Resume the queue when the connection comes back or Wi-Fi becomes available. */
export function watchDownloads(): () => void {
  return useConnectivity.subscribe((state, previous) => {
    const back = state.networkUp && state.serverReachable && !(previous.networkUp && previous.serverReachable);
    if (back || (state.unmetered && !previous.unmetered)) {
      void useDownloads.getState().sync();
      void pump();
    }
  });
}

export const startDownloads = () => void pump();

// --- Lookups used by the player and the UI ------------------------------------------

export function localTrackUri(trackId: number): string | null {
  const entry = useDownloads.getState().tracks[trackId];
  return entry ? documentFile(entry.file).uri : null;
}

export function localCoverUri(sha1: string | null | undefined): string | null {
  if (!sha1) return null;
  const file = documentFile(`${COVER_DIR}/${sha1}.jpg`);
  return file.exists ? file.uri : null;
}

/** A cover as local file (cache) for the lock screen, which cannot send auth headers. */
export async function lockScreenCover(sha1: string | null): Promise<string | null> {
  if (!sha1) return null;
  const downloaded = localCoverUri(sha1);
  if (downloaded) return downloaded;
  const cached = new File(Paths.cache, `cover-${sha1}.jpg`);
  if (cached.exists) return cached.uri;
  try {
    await File.downloadFileAsync(serverUrl(`/api/artwork/${sha1}/?size=thumb`), cached, {
      headers: authHeaders(),
      idempotent: true,
    });
    return cached.uri;
  } catch {
    return null;
  }
}

export function downloadedSize(): number {
  return Object.values(useDownloads.getState().tracks).reduce((sum, entry) => sum + entry.size, 0);
}

export const useIsDownloaded = (trackId: number) => useDownloads((s) => !!s.tracks[trackId]);
export const useIsOutdated = (trackId: number) => useDownloads((s) => !!s.tracks[trackId]?.outdated);
export const useDownloadJob = (trackId: number) => useDownloads((s) => s.jobs[trackId]);
