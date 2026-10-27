import { Offcanvas } from "react-bootstrap";

import { formatTime } from "../lib/format";
import { usePlayer, type QueueItem } from "../store/player";
import { useUi } from "../store/ui";
import { Artwork } from "./common";

function QueueRow({ item, position, current }: { item: QueueItem; position: number; current?: boolean }) {
  const { jumpTo, removeFromQueue } = usePlayer.getState();
  return (
    <div className={`queue-row ${current ? "current" : ""}`} onDoubleClick={() => jumpTo(position)}>
      <button type="button" className="queue-cover" aria-label={`Play ${item.track.title}`} onClick={() => jumpTo(position)}>
        <Artwork sha1={item.track.artwork} />
        <i className="bi bi-play-fill" />
      </button>
      <div className="min-w-0 flex-grow-1">
        <div className={`text-truncate small fw-semibold ${current ? "text-accent" : ""}`}>{item.track.title}</div>
        <div className="text-truncate small text-body-secondary">{item.track.artist}</div>
      </div>
      <span className="small text-body-secondary">{formatTime(item.track.duration)}</span>
      {!current && (
        <button type="button" className="icon-button" aria-label="Remove from queue" onClick={() => removeFromQueue(item.key)}>
          <i className="bi bi-x-lg" />
        </button>
      )}
    </div>
  );
}

export default function QueuePanel() {
  const open = useUi((s) => s.queueOpen);
  const set = useUi((s) => s.set);
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const context = usePlayer((s) => s.context);
  const upcoming = queue.slice(index + 1, index + 301);
  const current = queue[index];

  return (
    <Offcanvas show={open} onHide={() => set({ queueOpen: false })} placement="end" className="queue-panel" scroll backdrop={false}>
      <Offcanvas.Header closeButton>
        <Offcanvas.Title>Queue</Offcanvas.Title>
      </Offcanvas.Header>
      <Offcanvas.Body>
        {current ? (
          <>
            <h3 className="queue-heading">Now playing</h3>
            <QueueRow item={current} position={index} current />
            <div className="d-flex align-items-center justify-content-between mt-4">
              <h3 className="queue-heading mb-0">
                Next{context?.name ? ` from ${context.name}` : ""} ({queue.length - index - 1})
              </h3>
              {upcoming.length > 0 && (
                <button type="button" className="btn btn-sm btn-link text-body-secondary" onClick={() => usePlayer.getState().clearUpcoming()}>
                  Clear
                </button>
              )}
            </div>
            {upcoming.map((item, offset) => (
              <QueueRow key={item.key} item={item} position={index + 1 + offset} />
            ))}
            {upcoming.length === 0 && <p className="small text-body-secondary mt-2">Nothing queued up.</p>}
          </>
        ) : (
          <p className="text-body-secondary">The queue is empty. Play a song or playlist to get started.</p>
        )}
      </Offcanvas.Body>
    </Offcanvas>
  );
}
