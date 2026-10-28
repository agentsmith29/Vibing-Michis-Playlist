import { Link } from "react-router-dom";

import { api } from "../api/client";
import { useHome } from "../api/queries";
import type { Playlist, PlaylistDetail, Track } from "../api/types";
import { Artwork, EmptyState, ErrorState, Loading, MediaCard, Mosaic, PlayFab, Shelf } from "../components/common";
import { greeting, pluralize } from "../lib/format";
import { usePlayer } from "../store/player";

export async function playPlaylist(playlist: Playlist, shuffle?: boolean) {
  const detail = await api<PlaylistDetail>(`/playlists/${playlist.id}/`);
  usePlayer.getState().playTracks(
    detail.entries.map((entry) => entry.track),
    0,
    { type: "playlist", id: playlist.id, name: playlist.name },
    shuffle,
  );
}

function TrackCard({ tracks, index, label }: { tracks: Track[]; index: number; label: string }) {
  const track = tracks[index];
  return (
    <MediaCard
      title={track.title}
      subtitle={track.artist}
      cover={<Artwork sha1={track.artwork} />}
      onPlay={() => usePlayer.getState().playTracks(tracks, index, { type: "home", name: label }, false)}
    />
  );
}

export default function HomePage() {
  const home = useHome();
  if (home.isPending) return <Loading />;
  if (home.error) return <ErrorState error={home.error} />;
  const data = home.data;

  if (data.track_count === 0) {
    return (
      <>
        <h1 className="page-title mt-2">{greeting()}</h1>
        <EmptyState icon="music-note-beamed" title="Your library is empty">
          <p>Add audio files to the music folder, upload them, or download a song from YouTube.</p>
          <Link to="/import" className="btn btn-primary">
            Add music
          </Link>
        </EmptyState>
      </>
    );
  }

  const quick = (data.recent_playlists.length ? data.recent_playlists : data.playlists).slice(0, 6);

  return (
    <>
      <h1 className="page-title mt-2 mb-3">{greeting()}</h1>

      {quick.length > 0 && (
        <div className="quick-grid mb-4">
          {quick.map((playlist) => (
            <Link key={playlist.id} to={`/playlists/${playlist.id}`} className="quick-tile">
              <Mosaic artworks={playlist.artworks} className="rounded-0" />
              <span className="text-truncate">{playlist.name}</span>
              <PlayFab label={`Play ${playlist.name}`} onClick={() => playPlaylist(playlist)} />
            </Link>
          ))}
        </div>
      )}

      {data.recent_tracks.length > 0 && (
        <Shelf title="Recently played">
          {data.recent_tracks.map((track, index) => (
            <TrackCard key={track.id} tracks={data.recent_tracks} index={index} label="Recently played" />
          ))}
        </Shelf>
      )}

      {data.recent_playlists.length > 0 && (
        <Shelf title="Jump back in" to="/playlists">
          {data.recent_playlists.map((playlist) => (
            <MediaCard
              key={playlist.id}
              to={`/playlists/${playlist.id}`}
              title={playlist.name}
              subtitle={pluralize(playlist.track_count, "song")}
              cover={<Mosaic artworks={playlist.artworks} />}
              onPlay={() => playPlaylist(playlist)}
            />
          ))}
        </Shelf>
      )}

      <Shelf title="Recently added" to="/library">
        {data.recently_added.map((track, index) => (
          <TrackCard key={track.id} tracks={data.recently_added} index={index} label="Recently added" />
        ))}
      </Shelf>

      {data.recent_albums.length > 0 && (
        <Shelf title="Albums" to="/library?tab=albums">
          {data.recent_albums.map((album) => (
            <MediaCard
              key={album.id}
              to={`/albums/${album.id}`}
              title={album.title}
              subtitle={album.artist}
              cover={<Artwork sha1={album.artwork} icon="disc" />}
            />
          ))}
        </Shelf>
      )}

      {data.playlists.length > 0 && (
        <Shelf title="Your playlists" to="/playlists">
          {data.playlists.map((playlist) => (
            <MediaCard
              key={playlist.id}
              to={`/playlists/${playlist.id}`}
              title={playlist.name}
              subtitle={pluralize(playlist.track_count, "song")}
              cover={<Mosaic artworks={playlist.artworks} />}
              onPlay={() => playPlaylist(playlist)}
            />
          ))}
        </Shelf>
      )}
    </>
  );
}
