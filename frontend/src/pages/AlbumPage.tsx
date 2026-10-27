import { Link, useParams } from "react-router-dom";

import { useAlbum } from "../api/queries";
import { Artwork, DetailHeader, ErrorState, Loading, PlayFab } from "../components/common";
import TrackList, { rowsFromTracks } from "../components/TrackList";
import { formatLongDuration, pluralize } from "../lib/format";
import { usePlayer } from "../store/player";

export default function AlbumPage() {
  const id = Number(useParams().id);
  const album = useAlbum(id);
  if (album.isPending) return <Loading />;
  if (album.error) return <ErrorState error={album.error} />;
  const data = album.data;
  const duration = data.tracks.reduce((sum, track) => sum + track.duration, 0);
  const play = (index: number, shuffle?: boolean) =>
    usePlayer.getState().playTracks(data.tracks, index, { type: "album", id: data.id, name: data.title }, shuffle);

  return (
    <>
      <DetailHeader
        kind="Album"
        title={data.title}
        cover={<Artwork sha1={data.artwork} size="full" icon="disc" alt={`Cover of ${data.title}`} />}
        meta={
          <>
            <Link to={`/artists/${data.artist_id}`} className="fw-semibold text-body">
              {data.artist}
            </Link>
            {data.year && <> · {data.year}</>} · {pluralize(data.tracks.length, "song")}, {formatLongDuration(duration)}
          </>
        }
      />
      <div className="action-row">
        <PlayFab size="lg" label="Play album" onClick={() => play(0, false)} />
        <button type="button" className="icon-button" aria-label="Shuffle album" title="Shuffle" onClick={() => play(0, true)}>
          <i className="bi bi-shuffle" />
        </button>
        <button type="button" className="icon-button" aria-label="Add album to queue" title="Add to queue" onClick={() => usePlayer.getState().addToQueue(data.tracks)}>
          <i className="bi bi-list-ul" />
        </button>
      </div>
      <TrackList rows={rowsFromTracks(data.tracks)} onPlay={(index) => play(index, false)} numbered showAlbum={false} />
    </>
  );
}
