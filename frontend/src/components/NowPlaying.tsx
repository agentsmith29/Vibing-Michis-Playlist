import { Offcanvas } from "react-bootstrap";
import { Link } from "react-router-dom";

import { artworkUrl } from "../lib/format";
import { useCurrentTrack, usePlayer } from "../store/player";
import { useUi } from "../store/ui";
import { Artwork } from "./common";
import { SeekBar, TransportControls, VolumeControl } from "./PlayerBar";
import TrackActions from "./TrackActions";

/** Full-screen player with large artwork (mainly for phones). */
export default function NowPlaying() {
  const open = useUi((s) => s.nowPlayingOpen);
  const set = useUi((s) => s.set);
  const track = useCurrentTrack();
  const context = usePlayer((s) => s.context);
  const close = () => set({ nowPlayingOpen: false });
  const background = artworkUrl(track?.artwork, "thumb");

  return (
    <Offcanvas show={open && !!track} onHide={close} placement="bottom" className="now-playing">
      {background && <div className="now-playing-backdrop" style={{ backgroundImage: `url(${background})` }} />}
      <div className="now-playing-inner">
        <div className="d-flex align-items-center justify-content-between">
          <button type="button" className="icon-button fs-4" aria-label="Close" onClick={close}>
            <i className="bi bi-chevron-down" />
          </button>
          <div className="text-center small text-truncate px-2">
            <div className="text-uppercase text-body-secondary" style={{ fontSize: "0.7rem", letterSpacing: "0.08em" }}>
              Playing from {context?.type ?? "library"}
            </div>
            <div className="fw-semibold text-truncate">{context?.name ?? "Your library"}</div>
          </div>
          <button
            type="button"
            className="icon-button fs-5"
            aria-label="Queue"
            onClick={() => set({ nowPlayingOpen: false, queueOpen: true })}
          >
            <i className="bi bi-list-ol" />
          </button>
        </div>

        {track && (
          <>
            <div className="now-playing-art">
              <Artwork sha1={track.artwork} size="full" alt={`Cover of ${track.album ?? track.title}`} />
            </div>
            <div className="d-flex align-items-center gap-2">
              <div className="min-w-0 flex-grow-1">
                <h2 className="h4 mb-0 text-truncate fw-bold">{track.title}</h2>
                <div className="text-body-secondary text-truncate">
                  <Link to={`/artists/${track.artist_id}`} onClick={close}>
                    {track.artist}
                  </Link>
                  {track.album && track.album_id && (
                    <>
                      {" · "}
                      <Link to={`/albums/${track.album_id}`} onClick={close}>
                        {track.album}
                      </Link>
                    </>
                  )}
                </div>
              </div>
              <TrackActions track={track} />
            </div>
            <SeekBar />
            <TransportControls size="lg" />
            <div className="d-flex justify-content-center">
              <VolumeControl />
            </div>
          </>
        )}
      </div>
    </Offcanvas>
  );
}
