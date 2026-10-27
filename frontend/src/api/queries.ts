import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./client";
import type {
  AlbumDetail,
  Album,
  Artist,
  ArtistDetail,
  Home,
  Job,
  LibraryStats,
  Page,
  Playlist,
  PlaylistDetail,
  SearchResults,
  Session,
  SystemInfo,
  Track,
  TrackMetadata,
} from "./types";

export const keys = {
  session: ["session"] as const,
  home: ["home"] as const,
  tracks: (params: Record<string, string>) => ["tracks", params] as const,
  albums: (params: Record<string, string>) => ["albums", params] as const,
  album: (id: number) => ["album", id] as const,
  artists: (params: Record<string, string>) => ["artists", params] as const,
  artist: (id: number) => ["artist", id] as const,
  playlists: ["playlists"] as const,
  playlist: (id: number) => ["playlist", id] as const,
  search: (q: string) => ["search", q] as const,
  jobs: (params: Record<string, string>) => ["jobs", params] as const,
  stats: ["stats"] as const,
  system: ["system"] as const,
};

const qs = (params: Record<string, string>) => {
  const search = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== ""));
  const text = search.toString();
  return text ? `?${text}` : "";
};

// --- Session --------------------------------------------------------------

export function useSession() {
  return useQuery({ queryKey: keys.session, queryFn: () => api<Session>("/auth/session/"), staleTime: Infinity });
}

/** Drop cached data of the previous user but keep the (observed) session query. */
function resetUserData(client: ReturnType<typeof useQueryClient>, session: Session) {
  client.setQueryData(keys.session, session);
  client.removeQueries({ predicate: (query) => query.queryKey[0] !== keys.session[0] });
}

export function useLogin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (credentials: { username: string; password: string }) =>
      api<Session>("/auth/login/", { body: credentials }),
    // Django rotates the CSRF cookie in the login response, so no extra request is needed.
    onSuccess: (session) => resetUserData(client, session),
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>("/auth/logout/", { method: "POST" }),
    onSettled: () => resetUserData(client, { authenticated: false, user: null }),
  });
}

// --- Library ----------------------------------------------------------------

export function useHome() {
  return useQuery({ queryKey: keys.home, queryFn: () => api<Home>("/home/") });
}

export function useTracks(params: Record<string, string>) {
  return useInfiniteQuery({
    queryKey: keys.tracks(params),
    queryFn: ({ pageParam }) => api<Page<Track>>(`/tracks/${qs({ ...params, page: String(pageParam) })}`),
    initialPageParam: 1,
    getNextPageParam: (last, _all, pageParam) => (last.next ? pageParam + 1 : undefined),
    placeholderData: keepPreviousData,
  });
}

/** Fetch every track matching ``params`` (for "play all" / "shuffle all"). */
export async function fetchAllTracks(params: Record<string, string>): Promise<Track[]> {
  const page = await api<Page<Track>>(`/tracks/${qs({ ...params, page_size: "20000" })}`);
  return page.results;
}

export function useAlbums(params: Record<string, string>) {
  return useInfiniteQuery({
    queryKey: keys.albums(params),
    queryFn: ({ pageParam }) => api<Page<Album>>(`/albums/${qs({ ...params, page: String(pageParam) })}`),
    initialPageParam: 1,
    getNextPageParam: (last, _all, pageParam) => (last.next ? pageParam + 1 : undefined),
  });
}

export function useAlbum(id: number) {
  return useQuery({ queryKey: keys.album(id), queryFn: () => api<AlbumDetail>(`/albums/${id}/`) });
}

export function useArtists(params: Record<string, string>) {
  return useInfiniteQuery({
    queryKey: keys.artists(params),
    queryFn: ({ pageParam }) => api<Page<Artist>>(`/artists/${qs({ ...params, page: String(pageParam) })}`),
    initialPageParam: 1,
    getNextPageParam: (last, _all, pageParam) => (last.next ? pageParam + 1 : undefined),
  });
}

export function useArtist(id: number) {
  return useQuery({ queryKey: keys.artist(id), queryFn: () => api<ArtistDetail>(`/artists/${id}/`) });
}

export function useSearch(q: string) {
  return useQuery({
    queryKey: keys.search(q),
    queryFn: ({ signal }) => api<SearchResults>(`/search/${qs({ q })}`, { signal }),
    enabled: q.trim().length > 0,
    placeholderData: keepPreviousData,
  });
}

/** Invalidate everything that shows library content after tracks were added/changed/removed. */
export function useInvalidateLibrary() {
  const client = useQueryClient();
  return () =>
    Promise.all(
      ["home", "tracks", "albums", "album", "artists", "artist", "playlists", "playlist", "search", "stats"].map(
        (key) => client.invalidateQueries({ queryKey: [key] }),
      ),
    );
}

export function useUpdateTrack() {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TrackMetadata> }) =>
      api<Track>(`/tracks/${id}/`, { method: "PATCH", body: data }),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteTrack() {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/tracks/${id}/`, { method: "DELETE" }),
    onSuccess: () => invalidate(),
  });
}

// --- Playlists ----------------------------------------------------------------

export function usePlaylists() {
  return useQuery({ queryKey: keys.playlists, queryFn: () => api<Playlist[]>("/playlists/") });
}

export function usePlaylist(id: number) {
  return useQuery({ queryKey: keys.playlist(id), queryFn: () => api<PlaylistDetail>(`/playlists/${id}/`) });
}

function usePlaylistMutation<V>(fn: (vars: V) => Promise<PlaylistDetail>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (playlist) => {
      client.setQueryData(keys.playlist(playlist.id), playlist);
      client.invalidateQueries({ queryKey: keys.playlists });
      client.invalidateQueries({ queryKey: keys.home });
    },
  });
}

export function useCreatePlaylist() {
  return usePlaylistMutation((data: { name: string; description: string; track_ids?: number[] }) =>
    api<PlaylistDetail>("/playlists/", { body: data }),
  );
}

export function useUpdatePlaylist() {
  return usePlaylistMutation(({ id, ...data }: { id: number; name: string; description: string }) =>
    api<PlaylistDetail>(`/playlists/${id}/`, { method: "PATCH", body: data }),
  );
}

export function useAddToPlaylist() {
  return usePlaylistMutation(({ id, trackIds }: { id: number; trackIds: number[] }) =>
    api<PlaylistDetail>(`/playlists/${id}/tracks/`, { body: { track_ids: trackIds } }),
  );
}

export function useRemoveFromPlaylist() {
  return usePlaylistMutation(({ id, entryId }: { id: number; entryId: number }) =>
    api<PlaylistDetail>(`/playlists/${id}/entries/${entryId}/`, { method: "DELETE" }),
  );
}

export function useReorderPlaylist() {
  return usePlaylistMutation(({ id, entryIds }: { id: number; entryIds: number[] }) =>
    api<PlaylistDetail>(`/playlists/${id}/reorder/`, { body: { entry_ids: entryIds } }),
  );
}

export function useDeletePlaylist() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/playlists/${id}/`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      client.removeQueries({ queryKey: keys.playlist(id) });
      client.invalidateQueries({ queryKey: keys.playlists });
      client.invalidateQueries({ queryKey: keys.home });
    },
  });
}

// --- Jobs & system ---------------------------------------------------------------

export function useJobs(params: Record<string, string> = {}) {
  return useQuery({
    queryKey: keys.jobs(params),
    queryFn: () => api<Job[]>(`/jobs/${qs(params)}`),
    // Poll while something is in progress.
    refetchInterval: (query) =>
      query.state.data?.some((job) => job.status === "queued" || job.status === "running") ? 1000 : 10000,
  });
}

export function useStats() {
  return useQuery({ queryKey: keys.stats, queryFn: () => api<LibraryStats>("/library/stats/") });
}

export function useSystem() {
  return useQuery({ queryKey: keys.system, queryFn: () => api<SystemInfo>("/system/") });
}
