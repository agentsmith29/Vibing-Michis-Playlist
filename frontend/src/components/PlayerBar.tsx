import { useState } from "react";
import { Link } from "react-router-dom";

import { formatTime } from "../lib/format";
import { useCurrentTrack, usePlayer, useProgress } from "../store/player";
import { useUi } from "../store/ui";
import { Artwork } from "./common";

/** Seek slider. While dragging, the slider shows the drag position instead of the playback position. */
export function SeekBar({ compact = false }: { compact?: boolean }) {
  const currentTime = useProgress((s) => s.currentTime);
  const duration = useProgress((s) => s.duration);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const value = dragValue ?? currentTime;
  const percent = duration ? (value / duration) * 100 : 0;

  const commit = () => {
    if (dragValue !== null) usePlayer.getState().seek(dragValue);
    setDragValue(null);
  };

  return (
    <div className={`seek ${compact ? "seek-compact" : ""}`}>
      {!compact && <span className="seek-time">{formatTime(value)}</span>}
      <input
        type="range"
        className="range-slim"
        min={0}
        max={duration || 1}
        step={0.1}
        value={value}
        style={{ "--fill": `${percent}%` } as React.CSSProperties}
        aria-label="Seek"
        onChange={(event) => setDragValue(Number(event.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onTouchEnd={commit}
      />
      {!compact && <span className="seek-time">{formatTime(duration)}</span>}
    </div>
  );
}

export function VolumeControl() {
  const volume = usePlayer((s) => s.volume);
  const muted = usePlayer((s) => s.muted);
  const icon = muted || volume === 0 ? "volume-mute" : volume < 0.5 ? "volume-down" : "volume-up";
  const level = muted ? 0 : volume;
  return (
    <div className="volume d-flex align-items-center gap-2">
      <button type="button" className="icon-button" aria-label={muted ? "Unmute" : "Mute"} onClick={() => usePlayer.getState().toggleMute()}>
        <i className={`bi bi-${icon}`} />
      </button>
      <input
        type="range"
        className="range-slim"
        min={0}
        max={1}
        step={0.01}
        value={level}
        style={{ "--fill": `${level * 100}%` } as React.CSSProperties}
        aria-label="Volume"
        onChange={(event) => usePlayer.getState().setVolume(Number(event.target.value))}
      />
    </div>
  );
}

export function TransportControls({ size = "md" }: { size?: "md" | "lg" }) {
  const isPlaying = usePlayer((s) => s.isPlaying);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const hasTrack = usePlayer((s) => s.queue.length > 0);
  const buffering = useProgress((s) => s.buffering);
  const player = usePlayer.getState;

  return (
    <div className={`transport transport-${size}`}>
      <button
        type="button"
        className={`icon-button toggle ${shuffle ? "active" : ""}`}
        aria-label="Shuffle"
        aria-pressed={shuffle}
        title="Shuffle"
        onClick={() => player().toggleShuffle()}
      >
        <i className="bi bi-shuffle" />
      </button>
      <button type="button" className="icon-button" aria-label="Previous" disabled={!hasTrack} onClick={() => player().previous()}>
        <i className="bi bi-skip-start-fill" />
      </button>
      <button
        type="button"
        className="play-button"
        aria-label={isPlaying ? "Pause" : "Play"}
        disabled={!hasTrack}
        onClick={() => player().togglePlay()}
      >
        {buffering && isPlaying ? <span className="spinner-border spinner-border-sm" /> : <i className={`bi bi-${isPlaying ? "pause-fill" : "play-fill"}`} />}
      </button>
      <button type="button" className="icon-button" aria-label="Next" disabled={!hasTrack} onClick={() => player().next()}>
        <i className="bi bi-skip-end-fill" />
      </button>
      <button
        type="button"
        className={`icon-button toggle ${repeat !== "off" ? "active" : ""}`}
        aria-label={`Repeat: ${repeat}`}
        title={`Repeat: ${repeat}`}
        onClick={() => player().cycleRepeat()}
      >
        <i className={`bi bi-${repeat === "one" ? "repeat-1" : "repeat"}`} />
      </button>
    </div>
  );
}

/** Always-visible playback bar at the bottom of the screen. */
export default function PlayerBar() {
  const track = useCurrentTrack();
  const isPlaying = usePlayer((s) => s.isPlaying);
  const ui = useUi();
  const currentTime = useProgress((s) => s.currentTime);
  const duration = useProgress((s) => s.duration);

  return (
    <footer className="player-bar" aria-label="Player">
      {/* Mobile: thin progress line on top of the mini player */}
      <div className="mini-progress d-lg-none" style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }} />

      <div className="player-now">
        {track ? (
          <>
            <button type="button" className="player-cover-button" aria-label="Open now playing" onClick={() => ui.set({ nowPlayingOpen: true })}>
              <Artwork sha1={track.artwork} className="player-cover" />
            </button>
            <div className="min-w-0" onClick={() => window.innerWidth < 992 && ui.set({ nowPlayingOpen: true })}>
              <div className="player-title text-truncate">{track.title}</div>
              <div className="player-artist text-truncate">
                <Link to={`/artists/${track.artist_id}`} onClick={(e) => e.stopPropagation()}>
                  {track.artist}
                </Link>
              </div>
            </div>
          </>
        ) : (
          <div className="text-body-secondary small ps-2">Nothing playing</div>
        )}
      </div>

      <div className="player-center d-none d-lg-flex">
        <TransportControls />
        <SeekBar />
      </div>

      <div className="player-right">
        <div className="d-none d-lg-flex align-items-center gap-1">
          <button
            type="button"
            className={`icon-button toggle ${ui.queueOpen ? "active" : ""}`}
            aria-label="Queue"
            title="Queue"
            onClick={() => ui.set({ queueOpen: !ui.queueOpen })}
          >
            <i className="bi bi-list-ol" />
          </button>
          <VolumeControl />
        </div>
        <div className="d-flex d-lg-none align-items-center">
          <button
            type="button"
            className="icon-button fs-3"
            aria-label={isPlaying ? "Pause" : "Play"}
            disabled={!track}
            onClick={() => usePlayer.getState().togglePlay()}
          >
            <i className={`bi bi-${isPlaying ? "pause-fill" : "play-fill"}`} />
          </button>
          <button type="button" className="icon-button fs-4" aria-label="Next" disabled={!track} onClick={() => usePlayer.getState().next()}>
            <i className="bi bi-skip-end-fill" />
          </button>
        </div>
      </div>
    </footer>
  );
}
