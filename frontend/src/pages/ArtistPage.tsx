import { useState } from "react";
import { useParams } from "react-router-dom";

import { useArtist } from "../api/queries";
import { Artwork, DetailHeader, ErrorState, Loading, MediaCard, PlayFab, Shelf } from "../components/common";
import TrackList, { rowsFromTracks } from "../components/TrackList";
import { pluralize } from "../lib/format";
import { usePlayer } from "../store/player";

export default function ArtistPage() {
  const id = Number(useParams().id);
  const artist = useArtist(id);
  const [showAll, setShowAll] = useState(false);
  if (artist.isPending) return <Loading />;
  if (artist.error) return <ErrorState error={artist.error} />;
  const data = artist.data;
  const play = (index: number, shuffle?: boolean) =>
    usePlayer.getState().playTracks(data.tracks, index, { type: "artist", id: data.id, name: data.name }, shuffle);
  const visible = showAll ? data.tracks : data.tracks.slice(0, 10);

  return (
    <>
      <DetailHeader
        kind="Artist"
        title={data.name}
        cover={<Artwork sha1={data.artwork} size="full" rounded icon="person" alt={data.name} />}
        meta={`${pluralize(data.tracks.length, "song")} · ${pluralize(data.albums.length, "album")}`}
      />
      <div className="action-row">
        <PlayFab size="lg" label={`Play ${data.name}`} onClick={() => play(0, false)} />
        <button type="button" className="icon-button" aria-label="Shuffle" title="Shuffle" onClick={() => play(0, true)}>
          <i className="bi bi-shuffle" />
        </button>
      </div>

      <section className="mb-4">
        <h2 className="section-title mb-2">Songs</h2>
        <TrackList rows={rowsFromTracks(visible)} onPlay={(index) => play(index, false)} />
        {data.tracks.length > 10 && (
          <button type="button" className="btn btn-link text-body-secondary fw-semibold px-0" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show less" : `Show all ${data.tracks.length}`}
          </button>
        )}
      </section>

      {data.albums.length > 0 && (
        <Shelf title="Albums">
          {data.albums.map((album) => (
            <MediaCard
              key={album.id}
              to={`/albums/${album.id}`}
              title={album.title}
              subtitle={[album.year, pluralize(album.track_count, "song")].filter(Boolean).join(" · ")}
              cover={<Artwork sha1={album.artwork} icon="disc" />}
            />
          ))}
        </Shelf>
      )}
    </>
  );
}
