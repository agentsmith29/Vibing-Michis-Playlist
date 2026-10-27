import { usePlaylists } from "../api/queries";
import { CardGrid, EmptyState, ErrorState, Loading, MediaCard, Mosaic } from "../components/common";
import { pluralize } from "../lib/format";
import { useUi } from "../store/ui";
import { playPlaylist } from "./HomePage";

export default function PlaylistsPage() {
  const playlists = usePlaylists();
  const set = useUi((s) => s.set);

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mt-2 mb-3">
        <h1 className="page-title mb-0">Playlists</h1>
        <button type="button" className="btn btn-primary" onClick={() => set({ playlistForm: {} })}>
          <i className="bi bi-plus-lg" /> New playlist
        </button>
      </div>
      {playlists.isPending ? (
        <Loading />
      ) : playlists.error ? (
        <ErrorState error={playlists.error} />
      ) : playlists.data.length === 0 ? (
        <EmptyState icon="music-note-list" title="No playlists yet">
          Create one, or upload a zip file with songs on the “Add music” page.
        </EmptyState>
      ) : (
        <CardGrid>
          {playlists.data.map((playlist) => (
            <MediaCard
              key={playlist.id}
              to={`/playlists/${playlist.id}`}
              title={playlist.name}
              subtitle={pluralize(playlist.track_count, "song")}
              cover={<Mosaic artworks={playlist.artworks} />}
              onPlay={playlist.track_count ? () => playPlaylist(playlist) : undefined}
            />
          ))}
        </CardGrid>
      )}
    </>
  );
}
