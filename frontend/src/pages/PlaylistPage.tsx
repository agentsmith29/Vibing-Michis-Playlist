import { useEffect, useState } from "react";
import { Button, Form, Modal } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";

import { errorMessage } from "../api/client";
import { useAddToPlaylist, useDeletePlaylist, usePlaylist, useReorderPlaylist, useTracks } from "../api/queries";
import type { PlaylistDetail } from "../api/types";
import { Artwork, DetailHeader, EmptyState, ErrorState, Loading, Mosaic, PlayFab } from "../components/common";
import TrackList, { type TrackRow } from "../components/TrackList";
import { formatLongDuration, formatTime, pluralize } from "../lib/format";
import { usePlayer } from "../store/player";
import { toast, useUi } from "../store/ui";

function AddSongsModal({ playlist, show, onHide }: { playlist: PlaylistDetail; show: boolean; onHide: () => void }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const add = useAddToPlaylist();
  const tracks = useTracks({ q: debounced, ordering: "-added" });
  const contained = new Set(playlist.entries.map((entry) => entry.track.id));
  const results = tracks.data?.pages[0]?.results.slice(0, 50) ?? [];

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <Modal show={show} onHide={onHide} centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title>Add songs to {playlist.name}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Control autoFocus placeholder="Search your library" value={query} onChange={(e) => setQuery(e.target.value)} className="mb-3" />
        {results.map((track) => (
          <div key={track.id} className="queue-row">
            <div style={{ width: 42 }} className="flex-shrink-0">
              <Artwork sha1={track.artwork} className="track-cover" />
            </div>
            <div className="min-w-0 flex-grow-1">
              <div className="text-truncate small fw-semibold">{track.title}</div>
              <div className="text-truncate small text-body-secondary">
                {track.artist} · {formatTime(track.duration)}
              </div>
            </div>
            <Button
              size="sm"
              variant={contained.has(track.id) ? "secondary" : "primary"}
              onClick={() =>
                add.mutate(
                  { id: playlist.id, trackIds: [track.id] },
                  { onError: (error) => toast(errorMessage(error), "danger") },
                )
              }
            >
              {contained.has(track.id) ? <i className="bi bi-check-lg" /> : "Add"}
            </Button>
          </div>
        ))}
        {!tracks.isPending && results.length === 0 && <p className="text-body-secondary small">No songs found.</p>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Done
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default function PlaylistPage() {
  const id = Number(useParams().id);
  const playlist = usePlaylist(id);
  const reorder = useReorderPlaylist();
  const remove = useDeletePlaylist();
  const navigate = useNavigate();
  const set = useUi((s) => s.set);
  const [adding, setAdding] = useState(false);
  const [order, setOrder] = useState<number[] | null>(null);

  if (playlist.isPending) return <Loading />;
  if (playlist.error) return <ErrorState error={playlist.error} />;
  const data = playlist.data;

  // Show the new order immediately while the server saves it.
  const entries = order
    ? order.map((entryId) => data.entries.find((entry) => entry.id === entryId)!).filter(Boolean)
    : data.entries;
  const rows: TrackRow[] = entries.map((entry) => ({ key: entry.id, track: entry.track, entryId: entry.id }));
  const tracks = entries.map((entry) => entry.track);
  const play = (index: number, shuffle?: boolean) =>
    usePlayer.getState().playTracks(tracks, index, { type: "playlist", id: data.id, name: data.name }, shuffle);

  const confirmDelete = () =>
    set({
      confirm: {
        title: "Delete playlist?",
        body: `“${data.name}” will be deleted. The songs stay in your library.`,
        confirmLabel: "Delete",
        onConfirm: async () => {
          await remove.mutateAsync(data.id);
          toast("Playlist deleted");
          navigate("/playlists");
        },
      },
    });

  return (
    <>
      <DetailHeader
        kind="Playlist"
        title={data.name}
        description={data.description}
        cover={<Mosaic artworks={data.artworks} />}
        meta={`${pluralize(data.track_count, "song")}${data.duration ? `, ${formatLongDuration(data.duration)}` : ""}`}
      />
      <div className="action-row">
        <PlayFab size="lg" label="Play playlist" onClick={() => tracks.length && play(0, false)} />
        <button type="button" className="icon-button" aria-label="Shuffle playlist" title="Shuffle" disabled={!tracks.length} onClick={() => play(0, true)}>
          <i className="bi bi-shuffle" />
        </button>
        <button type="button" className="icon-button" aria-label="Add songs" title="Add songs" onClick={() => setAdding(true)}>
          <i className="bi bi-plus-circle" />
        </button>
        <button type="button" className="icon-button" aria-label="Edit playlist" title="Edit details" onClick={() => set({ playlistForm: { playlist: data } })}>
          <i className="bi bi-pencil" />
        </button>
        <button type="button" className="icon-button" aria-label="Delete playlist" title="Delete playlist" onClick={confirmDelete}>
          <i className="bi bi-trash" />
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="music-note-list" title="This playlist is empty">
          <Button className="mt-2" onClick={() => setAdding(true)}>
            Add songs
          </Button>
        </EmptyState>
      ) : (
        <TrackList
          rows={rows}
          onPlay={(index) => play(index, false)}
          playlistId={data.id}
          onReorder={(keys) => {
            const entryIds = keys.map(Number);
            setOrder(entryIds);
            reorder.mutate(
              { id: data.id, entryIds },
              {
                onSettled: () => setOrder(null),
                onError: (error) => toast(errorMessage(error), "danger"),
              },
            );
          }}
        />
      )}
      <AddSongsModal playlist={data} show={adding} onHide={() => setAdding(false)} />
    </>
  );
}
