import { useEffect, useState } from "react";
import { Button, Form, Nav } from "react-bootstrap";
import { useSearchParams } from "react-router-dom";

import { errorMessage } from "../api/client";
import { fetchAllTracks, useAlbums, useArtists, useTracks } from "../api/queries";
import { Artwork, CardGrid, EmptyState, ErrorState, Loading, LoadMore, MediaCard } from "../components/common";
import TrackList, { rowsFromTracks } from "../components/TrackList";
import { pluralize } from "../lib/format";
import { usePlayer } from "../store/player";
import { toast } from "../store/ui";

const SORTS = [
  { value: "title", label: "Title" },
  { value: "artist", label: "Artist" },
  { value: "album", label: "Album" },
  { value: "-added", label: "Recently added" },
  { value: "-year", label: "Newest" },
  { value: "duration", label: "Duration" },
];

function useDebounced(value: string, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function Songs() {
  const [ordering, setOrdering] = useState("title");
  const [filter, setFilter] = useState("");
  const q = useDebounced(filter);
  const params = { ordering, q };
  const tracks = useTracks(params);
  const items = tracks.data?.pages.flatMap((page) => page.results) ?? [];
  const total = tracks.data?.pages[0]?.count ?? 0;

  const playAll = async (start: number, shuffle?: boolean) => {
    try {
      // The list is paged; fetch everything so the queue contains the whole library.
      const all = total > items.length ? await fetchAllTracks(params) : items;
      usePlayer.getState().playTracks(all, start, { type: "library", name: "Your library" }, shuffle);
    } catch (error) {
      toast(errorMessage(error), "danger");
    }
  };

  return (
    <>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <Button onClick={() => playAll(0, false)} disabled={!total}>
          <i className="bi bi-play-fill" /> Play
        </Button>
        <Button variant="secondary" onClick={() => playAll(0, true)} disabled={!total}>
          <i className="bi bi-shuffle" /> Shuffle
        </Button>
        <span className="text-body-secondary small ms-1">{pluralize(total, "song")}</span>
        <div className="ms-auto d-flex gap-2">
          <Form.Control size="sm" placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 180 }} aria-label="Filter songs" />
          <Form.Select size="sm" value={ordering} onChange={(e) => setOrdering(e.target.value)} style={{ width: 160 }} aria-label="Sort by">
            {SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </Form.Select>
        </div>
      </div>
      {tracks.isPending ? (
        <Loading />
      ) : tracks.error ? (
        <ErrorState error={tracks.error} />
      ) : items.length === 0 ? (
        <EmptyState icon="music-note" title={q ? "No matching songs" : "No songs yet"} />
      ) : (
        <>
          <TrackList rows={rowsFromTracks(items)} onPlay={(index) => playAll(index, false)} />
          {tracks.hasNextPage && <LoadMore onVisible={() => !tracks.isFetchingNextPage && tracks.fetchNextPage()} loading={tracks.isFetchingNextPage} />}
        </>
      )}
    </>
  );
}

function Albums() {
  const albums = useAlbums({});
  const items = albums.data?.pages.flatMap((page) => page.results) ?? [];
  if (albums.isPending) return <Loading />;
  if (!items.length) return <EmptyState icon="disc" title="No albums yet" />;
  return (
    <>
      <CardGrid>
        {items.map((album) => (
          <MediaCard
            key={album.id}
            to={`/albums/${album.id}`}
            title={album.title}
            subtitle={album.artist}
            cover={<Artwork sha1={album.artwork} icon="disc" />}
          />
        ))}
      </CardGrid>
      {albums.hasNextPage && <LoadMore onVisible={() => !albums.isFetchingNextPage && albums.fetchNextPage()} loading={albums.isFetchingNextPage} />}
    </>
  );
}

function Artists() {
  const artists = useArtists({});
  const items = artists.data?.pages.flatMap((page) => page.results) ?? [];
  if (artists.isPending) return <Loading />;
  if (!items.length) return <EmptyState icon="person" title="No artists yet" />;
  return (
    <>
      <CardGrid>
        {items.map((artist) => (
          <MediaCard
            key={artist.id}
            to={`/artists/${artist.id}`}
            title={artist.name}
            subtitle={pluralize(artist.track_count, "song")}
            cover={<Artwork sha1={artist.artwork} rounded icon="person" />}
          />
        ))}
      </CardGrid>
      {artists.hasNextPage && <LoadMore onVisible={() => !artists.isFetchingNextPage && artists.fetchNextPage()} loading={artists.isFetchingNextPage} />}
    </>
  );
}

export default function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "songs";
  return (
    <>
      <h1 className="page-title mt-2 mb-3">Library</h1>
      <Nav variant="pills" activeKey={tab} onSelect={(key) => setParams(key === "songs" ? {} : { tab: key ?? "songs" }, { replace: true })} className="mb-4">
        <Nav.Item>
          <Nav.Link eventKey="songs">Songs</Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link eventKey="albums">Albums</Nav.Link>
        </Nav.Item>
        <Nav.Item>
          <Nav.Link eventKey="artists">Artists</Nav.Link>
        </Nav.Item>
      </Nav>
      {tab === "albums" ? <Albums /> : tab === "artists" ? <Artists /> : <Songs />}
    </>
  );
}
