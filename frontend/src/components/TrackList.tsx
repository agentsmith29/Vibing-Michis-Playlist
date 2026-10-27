import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";

import type { Track } from "../api/types";
import { formatTime } from "../lib/format";
import { useCurrentTrack, usePlayer } from "../store/player";
import { Artwork } from "./common";
import TrackActions from "./TrackActions";

export interface TrackRow {
  key: string | number;
  track: Track;
  entryId?: number;
}

interface Props {
  rows: TrackRow[];
  onPlay: (index: number) => void;
  /** Show track numbers instead of covers (album view). */
  numbered?: boolean;
  showAlbum?: boolean;
  playlistId?: number;
  /** Enables drag & drop; receives the new order of row keys. */
  onReorder?: (keys: (string | number)[]) => void;
}

function Equalizer() {
  return (
    <span className="equalizer" aria-label="Now playing">
      <span />
      <span />
      <span />
    </span>
  );
}

function Row({
  row,
  index,
  onPlay,
  numbered,
  showAlbum,
  playlistId,
  handle,
}: {
  row: TrackRow;
  index: number;
  onPlay: (index: number) => void;
  numbered?: boolean;
  showAlbum?: boolean;
  playlistId?: number;
  handle?: ReactNode;
}) {
  const current = useCurrentTrack();
  const isPlaying = usePlayer((s) => s.isPlaying);
  const active = current?.id === row.track.id;
  const { track } = row;

  return (
    <>
      <div className="track-index">
        {active && isPlaying ? <Equalizer /> : <span className="track-number">{numbered ? track.track_number ?? index + 1 : index + 1}</span>}
        <button
          type="button"
          className="track-play icon-button"
          aria-label={`Play ${track.title}`}
          onClick={(event) => {
            event.stopPropagation();
            if (active) usePlayer.getState().togglePlay();
            else onPlay(index);
          }}
        >
          <i className={`bi bi-${active && isPlaying ? "pause-fill" : "play-fill"}`} />
        </button>
      </div>
      <div className="track-main">
        {!numbered && <Artwork sha1={track.artwork} className="track-cover" />}
        <div className="min-w-0">
          <div className={`track-title text-truncate ${active ? "text-accent" : ""}`}>{track.title}</div>
          <div className="track-sub text-truncate">
            <Link to={`/artists/${track.artist_id}`} onClick={(e) => e.stopPropagation()}>
              {track.artist}
            </Link>
            {showAlbum && track.album && <span className="d-md-none"> · {track.album}</span>}
          </div>
        </div>
      </div>
      {showAlbum && (
        <div className="track-album text-truncate d-none d-md-block">
          {track.album_id ? (
            <Link to={`/albums/${track.album_id}`} onClick={(e) => e.stopPropagation()}>
              {track.album}
            </Link>
          ) : (
            <span className="text-body-tertiary">—</span>
          )}
        </div>
      )}
      <div className="track-duration d-none d-sm-block">{formatTime(track.duration)}</div>
      <div className="track-actions">
        {handle}
        <TrackActions
          track={track}
          playlistEntry={playlistId && row.entryId ? { playlistId, entryId: row.entryId } : undefined}
        />
      </div>
    </>
  );
}

const isTouch = () => window.matchMedia("(hover: none)").matches;

/** Desktop: double click plays (single click selects text etc.); touch: a tap plays. */
const playHandlers = (play: () => void) => ({
  onDoubleClick: play,
  onClick: () => isTouch() && play(),
});

function rowClass(showAlbum?: boolean) {
  return `track-row ${showAlbum ? "with-album" : ""}`;
}

function SortableRow(props: Parameters<typeof Row>[0]) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.row.key });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${rowClass(props.showAlbum)} ${isDragging ? "dragging" : ""}`}
      {...playHandlers(() => props.onPlay(props.index))}
    >
      <Row
        {...props}
        handle={
          <button type="button" className="icon-button drag-handle" aria-label="Drag to reorder" {...attributes} {...listeners}>
            <i className="bi bi-grip-vertical" />
          </button>
        }
      />
    </div>
  );
}

export default function TrackList({ rows, onPlay, numbered, showAlbum = true, playlistId, onReorder }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const header = (
    <div className={`${rowClass(showAlbum)} track-header`} aria-hidden>
      <div className="track-index">#</div>
      <div>Title</div>
      {showAlbum && <div className="d-none d-md-block">Album</div>}
      <div className="track-duration d-none d-sm-block">
        <i className="bi bi-clock" />
      </div>
      <div />
    </div>
  );

  if (onReorder) {
    const handleDragEnd = ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) return;
      const keys = rows.map((row) => row.key);
      onReorder(arrayMove(keys, keys.indexOf(active.id), keys.indexOf(over.id)));
    };
    return (
      <div className="track-list">
        {header}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={rows.map((row) => row.key)} strategy={verticalListSortingStrategy}>
            {rows.map((row, index) => (
              <SortableRow key={row.key} row={row} index={index} onPlay={onPlay} showAlbum={showAlbum} playlistId={playlistId} />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    );
  }

  return (
    <div className="track-list">
      {header}
      {rows.map((row, index) => (
        <div key={row.key} className={rowClass(showAlbum)} {...playHandlers(() => onPlay(index))}>
          <Row row={row} index={index} onPlay={onPlay} numbered={numbered} showAlbum={showAlbum} playlistId={playlistId} />
        </div>
      ))}
    </div>
  );
}

export const rowsFromTracks = (tracks: Track[]): TrackRow[] => tracks.map((track, i) => ({ key: `${track.id}-${i}`, track }));
