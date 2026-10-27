import { Link, useSearchParams } from "react-router-dom";

import { useAlbums, useSearch } from "../api/queries";
import { Artwork, CardGrid, EmptyState, Loading, MediaCard, Mosaic, PlayFab, Shelf } from "../components/common";
import TrackList, { rowsFromTracks } from "../components/TrackList";
import { pluralize } from "../lib/format";
import { usePlayer } from "../store/player";
import { playPlaylist } from "./HomePage";

function Browse() {
  const albums = useAlbums({ ordering: "recent" });
  const items = albums.data?.pages.flatMap((page) => page.results) ?? [];
  return (
    <>
      <h1 className="page-title mt-2 mb-3">Browse albums</h1>
      {albums.isPending ? (
        <Loading />
      ) : (
        <CardGrid>
          {items.slice(0, 48).map((album) => (
            <MediaCard
              key={album.id}
              to={`/albums/${album.id}`}
              title={album.title}
              subtitle={album.artist}
              cover={<Artwork sha1={album.artwork} icon="disc" />}
            />
          ))}
        </CardGrid>
      )}
    </>
  );
}

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const search = useSearch(q);

  if (!q.trim()) return <Browse />;
  if (search.isPending) return <Loading label="Searching…" />;
  const data = search.data;
  if (!data) return null;

  const empty = !data.tracks.length && !data.artists.length && !data.albums.length && !data.playlists.length;
  if (empty) {
    return (
      <EmptyState icon="search" title={`No results for “${q}”`}>
        Check the spelling or try other keywords.
      </EmptyState>
    );
  }

  const top = data.tracks[0];
  const play = (index: number) => usePlayer.getState().playTracks(data.tracks, index, { type: "search", name: `“${q}”` }, false);

  return (
    <>
      {top && (
        <div className="row g-4 mb-4">
          <div className="col-lg-5">
            <h2 className="section-title mb-2">Top result</h2>
            <div className="panel position-relative d-flex flex-column gap-3">
              <div style={{ width: 96 }}>
                <Artwork sha1={top.artwork} />
              </div>
              <div>
                <div className="h3 fw-bold mb-1 text-truncate">{top.title}</div>
                <div className="text-body-secondary small">
                  Song · <Link to={`/artists/${top.artist_id}`}>{top.artist}</Link>
                </div>
              </div>
              <div className="position-absolute bottom-0 end-0 m-3">
                <PlayFab size="lg" label={`Play ${top.title}`} onClick={() => play(0)} />
              </div>
            </div>
          </div>
          <div className="col-lg-7">
            <h2 className="section-title mb-2">Songs</h2>
            <TrackList rows={rowsFromTracks(data.tracks.slice(0, 5))} onPlay={play} showAlbum={false} />
          </div>
        </div>
      )}

      {data.artists.length > 0 && (
        <Shelf title="Artists">
          {data.artists.map((artist) => (
            <MediaCard
              key={artist.id}
              to={`/artists/${artist.id}`}
              title={artist.name}
              subtitle="Artist"
              cover={<Artwork sha1={artist.artwork} rounded icon="person" />}
            />
          ))}
        </Shelf>
      )}

      {data.albums.length > 0 && (
        <Shelf title="Albums">
          {data.albums.map((album) => (
            <MediaCard
              key={album.id}
              to={`/albums/${album.id}`}
              title={album.title}
              subtitle={`${album.year ?? ""} ${album.year ? "·" : ""} ${album.artist}`}
              cover={<Artwork sha1={album.artwork} icon="disc" />}
            />
          ))}
        </Shelf>
      )}

      {data.playlists.length > 0 && (
        <Shelf title="Playlists">
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

      {data.tracks.length > 5 && (
        <section className="mb-4">
          <h2 className="section-title mb-2">All songs</h2>
          <TrackList rows={rowsFromTracks(data.tracks)} onPlay={play} />
        </section>
      )}
    </>
  );
}
