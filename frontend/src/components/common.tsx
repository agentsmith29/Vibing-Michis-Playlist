import { useEffect, useRef, useState, type ReactNode } from "react";
import { Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";

import { artworkUrl } from "../lib/format";

/** Square cover image with a gradient placeholder for songs without artwork. */
export function Artwork({
  sha1,
  size = "thumb",
  alt = "",
  className = "",
  rounded = false,
  icon = "music-note-beamed",
}: {
  sha1: string | null | undefined;
  size?: "thumb" | "full";
  alt?: string;
  className?: string;
  rounded?: boolean;
  icon?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = artworkUrl(sha1, size);
  const shape = rounded ? "rounded-circle" : "artwork-radius";
  if (!url || failed) {
    return (
      <div className={`artwork artwork-placeholder ${shape} ${className}`} aria-hidden={!alt}>
        <i className={`bi bi-${icon}`} />
      </div>
    );
  }
  return (
    <img
      className={`artwork ${shape} ${className}`}
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

/** 2x2 mosaic of up to four covers (playlists). */
export function Mosaic({ artworks, className = "" }: { artworks: string[]; className?: string }) {
  if (artworks.length < 4) {
    return <Artwork sha1={artworks[0]} className={className} icon="music-note-list" />;
  }
  return (
    <div className={`artwork mosaic artwork-radius ${className}`}>
      {artworks.slice(0, 4).map((sha1) => (
        <img key={sha1} src={artworkUrl(sha1, "thumb")!} alt="" loading="lazy" />
      ))}
    </div>
  );
}

export function PlayFab({ onClick, label, size = "md" }: { onClick: () => void; label: string; size?: "md" | "lg" }) {
  return (
    <button
      type="button"
      className={`play-fab play-fab-${size}`}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
    >
      <i className="bi bi-play-fill" />
    </button>
  );
}

/** Card used in shelves and grids (albums, playlists, artists, songs). */
export function MediaCard({
  to,
  title,
  subtitle,
  cover,
  onPlay,
}: {
  to?: string;
  title: string;
  subtitle?: ReactNode;
  cover: ReactNode;
  onPlay?: () => void;
}) {
  const body = (
    <>
      <div className="media-card-cover">
        {cover}
        {onPlay && <PlayFab onClick={onPlay} label={`Play ${title}`} />}
      </div>
      <div className="media-card-title text-truncate" title={title}>
        {title}
      </div>
      {subtitle && <div className="media-card-subtitle text-truncate">{subtitle}</div>}
    </>
  );
  if (to) {
    return (
      <Link to={to} className="media-card">
        {body}
      </Link>
    );
  }
  return (
    <div className="media-card" role="button" tabIndex={0} onClick={onPlay} onKeyDown={(e) => e.key === "Enter" && onPlay?.()}>
      {body}
    </div>
  );
}

export function Shelf({ title, to, children }: { title: string; to?: string; children: ReactNode }) {
  return (
    <section className="shelf mb-4">
      <div className="d-flex align-items-baseline justify-content-between mb-2">
        <h2 className="section-title">{title}</h2>
        {to && (
          <Link to={to} className="small text-body-secondary fw-semibold">
            Show all
          </Link>
        )}
      </div>
      <div className="shelf-row">{children}</div>
    </section>
  );
}

export function CardGrid({ children }: { children: ReactNode }) {
  return <div className="card-grid">{children}</div>;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="d-flex align-items-center justify-content-center gap-2 py-5 text-body-secondary">
      <Spinner animation="border" size="sm" /> {label}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty-state text-center py-5">
      <i className={`bi bi-${icon} display-4 text-body-tertiary`} />
      <h3 className="h5 mt-3">{title}</h3>
      {children && <div className="text-body-secondary">{children}</div>}
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  return (
    <EmptyState icon="exclamation-triangle" title="Could not load this page">
      {error instanceof Error ? error.message : "Unknown error"}
    </EmptyState>
  );
}

/** Calls ``onVisible`` when scrolled into view (infinite lists). */
export function LoadMore({ onVisible, loading }: { onVisible: () => void; loading: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onVisible);
  callback.current = onVisible;
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => entries[0].isIntersecting && callback.current(), {
      rootMargin: "600px",
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref}>{loading && <Loading />}</div>;
}

/** Large header used by album, artist and playlist pages. */
export function DetailHeader({
  cover,
  kind,
  title,
  meta,
  description,
}: {
  cover: ReactNode;
  kind: string;
  title: string;
  meta: ReactNode;
  description?: string;
}) {
  return (
    <header className="detail-header">
      <div className="detail-cover">{cover}</div>
      <div className="detail-info">
        <div className="text-uppercase small fw-semibold text-body-secondary">{kind}</div>
        <h1 className="detail-title">{title}</h1>
        {description && <p className="text-body-secondary mb-2 detail-description">{description}</p>}
        <div className="small text-body-secondary">{meta}</div>
      </div>
    </header>
  );
}
