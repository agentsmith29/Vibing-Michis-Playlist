import { Dropdown } from "react-bootstrap";
import { useNavigate } from "react-router-dom";

import { errorMessage } from "../api/client";
import { useAddToPlaylist, useDeleteTrack, usePlaylists, useRemoveFromPlaylist } from "../api/queries";
import type { Track } from "../api/types";
import { usePlayer } from "../store/player";
import { toast, useUi } from "../store/ui";

interface Props {
  track: Track;
  /** When shown inside a playlist: allows removing this entry. */
  playlistEntry?: { playlistId: number; entryId: number };
  className?: string;
}

export default function TrackActions({ track, playlistEntry, className = "" }: Props) {
  const navigate = useNavigate();
  const playlists = usePlaylists();
  const addToPlaylist = useAddToPlaylist();
  const removeFromPlaylist = useRemoveFromPlaylist();
  const deleteTrack = useDeleteTrack();
  const ui = useUi();

  const add = (playlistId: number, name: string) =>
    addToPlaylist.mutate(
      { id: playlistId, trackIds: [track.id] },
      {
        onSuccess: () => toast(`Added to ${name}`),
        onError: (error) => toast(errorMessage(error), "danger"),
      },
    );

  const confirmDelete = () =>
    ui.set({
      confirm: {
        title: "Delete song?",
        body: `“${track.title}” will be removed from your library and its file will be deleted from the music folder.`,
        confirmLabel: "Delete",
        onConfirm: async () => {
          await deleteTrack.mutateAsync(track.id);
          usePlayer.getState().forgetTrack(track.id);
          toast("Song deleted");
        },
      },
    });

  return (
    <Dropdown align="end" className={className} onClick={(event) => event.stopPropagation()}>
      <Dropdown.Toggle variant="link" className="icon-button no-caret" aria-label={`More options for ${track.title}`}>
        <i className="bi bi-three-dots" />
      </Dropdown.Toggle>
      <Dropdown.Menu className="track-menu shadow">
        <Dropdown.Item onClick={() => usePlayer.getState().playNext([track])}>
          <i className="bi bi-arrow-return-right me-2" /> Play next
        </Dropdown.Item>
        <Dropdown.Item onClick={() => usePlayer.getState().addToQueue([track])}>
          <i className="bi bi-list-ul me-2" /> Add to queue
        </Dropdown.Item>
        <Dropdown.Divider />
        <Dropdown.Header>Add to playlist</Dropdown.Header>
        <div className="track-menu-playlists">
          {playlists.data?.map((playlist) => (
            <Dropdown.Item key={playlist.id} onClick={() => add(playlist.id, playlist.name)}>
              <i className="bi bi-music-note-list me-2" /> {playlist.name}
            </Dropdown.Item>
          ))}
        </div>
        <Dropdown.Item onClick={() => ui.set({ playlistForm: { trackIds: [track.id] } })}>
          <i className="bi bi-plus-lg me-2" /> New playlist…
        </Dropdown.Item>
        {playlistEntry && (
          <Dropdown.Item
            onClick={() =>
              removeFromPlaylist.mutate(
                { id: playlistEntry.playlistId, entryId: playlistEntry.entryId },
                { onError: (error) => toast(errorMessage(error), "danger") },
              )
            }
          >
            <i className="bi bi-dash-circle me-2" /> Remove from this playlist
          </Dropdown.Item>
        )}
        <Dropdown.Divider />
        <Dropdown.Item onClick={() => navigate(`/artists/${track.artist_id}`)}>
          <i className="bi bi-person me-2" /> Go to artist
        </Dropdown.Item>
        {track.album_id && (
          <Dropdown.Item onClick={() => navigate(`/albums/${track.album_id}`)}>
            <i className="bi bi-disc me-2" /> Go to album
          </Dropdown.Item>
        )}
        <Dropdown.Item onClick={() => ui.set({ editTrack: track })}>
          <i className="bi bi-pencil me-2" /> Edit info
        </Dropdown.Item>
        <Dropdown.Item className="text-danger" onClick={confirmDelete}>
          <i className="bi bi-trash me-2" /> Delete from library
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}
