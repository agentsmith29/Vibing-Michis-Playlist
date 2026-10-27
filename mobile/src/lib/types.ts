export interface User {
  id: number;
  username: string;
  is_staff: boolean;
}

export interface Session {
  authenticated: boolean;
  user: User | null;
}

export interface Track {
  id: number;
  title: string;
  artist: string;
  artist_id: number;
  album: string | null;
  album_id: number | null;
  genre: string;
  year: number | null;
  track_number: number | null;
  disc_number: number | null;
  duration: number;
  bitrate: number | null;
  artwork: string | null;
  file_path: string;
  /** Changes when the file changes on the server (re-tagged, new cover, replaced audio). */
  file_version: string;
  added_at: string;
}

export interface Album {
  id: number;
  title: string;
  artist: string;
  artist_id: number;
  year: number | null;
  artwork: string | null;
  track_count: number;
}

export interface AlbumDetail extends Album {
  tracks: Track[];
}

export interface Artist {
  id: number;
  name: string;
  track_count: number;
  album_count: number;
  artwork: string | null;
}

export interface ArtistDetail extends Artist {
  albums: Album[];
  tracks: Track[];
}

export interface Playlist {
  id: number;
  name: string;
  description: string;
  track_count: number;
  duration: number;
  artworks: string[];
  created_at: string;
  updated_at: string;
}

export interface PlaylistEntry {
  id: number;
  position: number;
  added_at: string;
  track: Track;
}

export interface PlaylistDetail extends Playlist {
  entries: PlaylistEntry[];
}

export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Home {
  recent_tracks: Track[];
  recent_playlists: Playlist[];
  recently_added: Track[];
  recent_albums: Album[];
  playlists: Playlist[];
  track_count: number;
}

export interface SearchResults {
  tracks: Track[];
  artists: Artist[];
  albums: Album[];
  playlists: Playlist[];
}

export interface MetadataCandidate {
  title: string;
  artist: string;
  album: string;
  album_artist: string;
  genre: string;
  year: number | null;
  track_number: number | null;
  duration: number;
  artwork_url: string;
  artwork_preview: string;
  score: number;
}

export interface TrackMetadata {
  title: string;
  artist: string;
  album: string;
  album_artist: string;
  genre: string;
  year: number | null;
  track_number: number | null;
  artwork_url: string;
}

export type JobKind = "scan" | "youtube" | "zip_import" | "update_ytdlp";
export type JobStatus = "queued" | "running" | "review" | "done" | "failed" | "cancelled";

export interface YouTubeResult {
  file: string;
  query: string;
  video: { id: string; title: string; uploader: string; duration: number; thumbnail: string };
  candidates: MetadataCandidate[];
  fallback: MetadataCandidate;
  suggested: MetadataCandidate;
  track_id?: number;
}

export interface Job {
  id: string;
  kind: JobKind;
  status: JobStatus;
  progress: number;
  message: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown>;
  error: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

export interface LibraryStats {
  tracks: number;
  artists: number;
  albums: number;
  playlists: number;
  duration: number;
  size: number;
  music_root: string;
  scan_interval: number;
}

export interface SystemInfo {
  version: string;
  django: string;
  ytdlp: { bundled: string; updated: string | null; active: string };
  ffmpeg: boolean;
  deno: boolean;
  music_root: string;
  scan_interval: number;
  last_ytdlp_update: Job | null;
}
