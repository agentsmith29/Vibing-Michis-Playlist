import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { Album, AlbumDetail, Artist, ArtistDetail, Home, Page, Playlist, PlaylistDetail, SearchResults, Track } from "@/lib/types";
import { useOnline } from "@/store/connectivity";
import { useDownloads } from "@/store/downloads";

const qs = (params: Record<string, string>) => {
  const text = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== "")).toString();
  return text ? `?${text}` : "";
};

export function useHome() {
  const online = useOnline();
  return useQuery({ queryKey: ["home"], queryFn: () => api<Home>("/home/"), enabled: online });
}

export function usePlaylists() {
  const online = useOnline();
  return useQuery({ queryKey: ["playlists"], queryFn: () => api<Playlist[]>("/playlists/"), enabled: online });
}

/** Playlist from the server, or the offline copy when the server is not reachable. */
export function usePlaylist(id: number) {
  const online = useOnline();
  const offline = useDownloads((s) => s.playlists[id]?.playlist);
  const query = useQuery({
    queryKey: ["playlist", id],
    queryFn: () => api<PlaylistDetail>(`/playlists/${id}/`),
    enabled: online,
  });
  return { ...query, data: query.data ?? offline, isOfflineCopy: !query.data && !!offline };
}

export function useAlbum(id: number) {
  return useQuery({ queryKey: ["album", id], queryFn: () => api<AlbumDetail>(`/albums/${id}/`), enabled: useOnline() });
}

export function useArtist(id: number) {
  return useQuery({ queryKey: ["artist", id], queryFn: () => api<ArtistDetail>(`/artists/${id}/`), enabled: useOnline() });
}

export function useSearch(q: string) {
  return useQuery({
    queryKey: ["search", q],
    queryFn: () => api<SearchResults>(`/search/${qs({ q })}`),
    enabled: useOnline() && q.trim().length > 0,
  });
}

function usePaged<T>(key: string, path: string, params: Record<string, string>) {
  return useInfiniteQuery({
    queryKey: [key, params],
    queryFn: ({ pageParam }) => api<Page<T>>(`${path}${qs({ ...params, page: String(pageParam), page_size: "100" })}`),
    initialPageParam: 1,
    getNextPageParam: (last, _all, page) => (last.next ? page + 1 : undefined),
    enabled: useOnline(),
  });
}

export const useTracks = (params: Record<string, string>) => usePaged<Track>("tracks", "/tracks/", params);
export const useAlbums = (params: Record<string, string>) => usePaged<Album>("albums", "/albums/", params);
export const useArtists = (params: Record<string, string>) => usePaged<Artist>("artists", "/artists/", params);

export async function fetchAllTracks(params: Record<string, string>): Promise<Track[]> {
  return (await api<Page<Track>>(`/tracks/${qs({ ...params, page_size: "20000" })}`)).results;
}

export function useAddToPlaylist() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, trackIds }: { id: number; trackIds: number[] }) =>
      api<PlaylistDetail>(`/playlists/${id}/tracks/`, { body: { track_ids: trackIds } }),
    onSuccess: (playlist) => {
      client.setQueryData(["playlist", playlist.id], playlist);
      client.invalidateQueries({ queryKey: ["playlists"] });
      // Offline copies pick up the new song on the next sync.
      if (useDownloads.getState().playlists[playlist.id]) useDownloads.getState().downloadPlaylist(playlist);
    },
  });
}
