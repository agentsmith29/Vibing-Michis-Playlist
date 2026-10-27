import { useState } from "react";
import { Button, Col, Form, InputGroup, Row, Spinner } from "react-bootstrap";

import { api, errorMessage } from "../api/client";
import type { MetadataCandidate, TrackMetadata } from "../api/types";
import { formatTime } from "../lib/format";

export const emptyMetadata: TrackMetadata = {
  title: "",
  artist: "",
  album: "",
  album_artist: "",
  genre: "",
  year: null,
  track_number: null,
  artwork_url: "",
};

export function fromCandidate(candidate: MetadataCandidate): TrackMetadata {
  return {
    title: candidate.title,
    artist: candidate.artist,
    album: candidate.album,
    album_artist: candidate.album_artist,
    genre: candidate.genre,
    year: candidate.year,
    track_number: candidate.track_number,
    artwork_url: candidate.artwork_url,
  };
}

/** List of online matches; clicking one applies its tags. */
export function CandidateList({
  candidates,
  selected,
  onSelect,
}: {
  candidates: MetadataCandidate[];
  selected?: string;
  onSelect: (candidate: MetadataCandidate) => void;
}) {
  if (!candidates.length) return <p className="small text-body-secondary mb-0">No matches found.</p>;
  return (
    <div className="candidate-list">
      {candidates.map((candidate, index) => {
        const id = `${candidate.title}|${candidate.artist}|${candidate.album}|${index}`;
        const active = selected === candidate.artwork_url + candidate.title;
        return (
          <button type="button" key={id} className={`candidate ${active ? "active" : ""}`} onClick={() => onSelect(candidate)}>
            {candidate.artwork_preview ? (
              <img src={candidate.artwork_preview} alt="" className="candidate-cover" loading="lazy" referrerPolicy="no-referrer" />
            ) : (
              <div className="candidate-cover artwork-placeholder">
                <i className="bi bi-music-note" />
              </div>
            )}
            <div className="min-w-0 text-start">
              <div className="fw-semibold text-truncate">{candidate.title}</div>
              <div className="small text-body-secondary text-truncate">
                {candidate.artist}
                {candidate.album && ` · ${candidate.album}`}
              </div>
              <div className="small text-body-tertiary">
                {[candidate.year, candidate.genre, candidate.duration ? formatTime(candidate.duration) : null].filter(Boolean).join(" · ")}
              </div>
            </div>
            {active && <i className="bi bi-check-circle-fill text-accent ms-auto" />}
          </button>
        );
      })}
    </div>
  );
}

/** Search box + results for the iTunes metadata lookup. */
export function MetadataSearch({ initialQuery, onSelect }: { initialQuery: string; onSelect: (c: MetadataCandidate) => void }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<MetadataCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string>();

  const search = async () => {
    setLoading(true);
    setError("");
    try {
      setResults(await api<MetadataCandidate[]>(`/metadata/search/?q=${encodeURIComponent(query)}`));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <InputGroup className="mb-2">
        <Form.Control
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder="Artist and title"
          aria-label="Metadata search"
        />
        <Button variant="secondary" onClick={search} disabled={loading || !query.trim()}>
          {loading ? <Spinner size="sm" /> : <i className="bi bi-search" />} Find
        </Button>
      </InputGroup>
      {error && <div className="small text-danger mb-2">{error}</div>}
      {results && (
        <CandidateList
          candidates={results}
          selected={selected}
          onSelect={(candidate) => {
            setSelected(candidate.artwork_url + candidate.title);
            onSelect(candidate);
          }}
        />
      )}
    </div>
  );
}

/** Editable tag fields. */
export function MetadataFields({ value, onChange }: { value: TrackMetadata; onChange: (value: TrackMetadata) => void }) {
  const field = (name: keyof TrackMetadata) => ({
    value: value[name] ?? "",
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      const numeric = name === "year" || name === "track_number";
      onChange({ ...value, [name]: numeric ? (raw ? Number(raw) : null) : raw });
    },
  });
  return (
    <Row className="g-2">
      <Col xs={12}>
        <Form.Group controlId="meta-title">
          <Form.Label className="small">Title</Form.Label>
          <Form.Control required maxLength={500} {...field("title")} />
        </Form.Group>
      </Col>
      <Col sm={6}>
        <Form.Group controlId="meta-artist">
          <Form.Label className="small">Artist</Form.Label>
          <Form.Control required maxLength={255} {...field("artist")} />
        </Form.Group>
      </Col>
      <Col sm={6}>
        <Form.Group controlId="meta-album">
          <Form.Label className="small">Album</Form.Label>
          <Form.Control maxLength={255} {...field("album")} />
        </Form.Group>
      </Col>
      <Col sm={6}>
        <Form.Group controlId="meta-album-artist">
          <Form.Label className="small">Album artist</Form.Label>
          <Form.Control maxLength={255} placeholder="Same as artist" {...field("album_artist")} />
        </Form.Group>
      </Col>
      <Col sm={6}>
        <Form.Group controlId="meta-genre">
          <Form.Label className="small">Genre</Form.Label>
          <Form.Control maxLength={100} {...field("genre")} />
        </Form.Group>
      </Col>
      <Col xs={6}>
        <Form.Group controlId="meta-year">
          <Form.Label className="small">Year</Form.Label>
          <Form.Control type="number" min={1000} max={9999} {...field("year")} />
        </Form.Group>
      </Col>
      <Col xs={6}>
        <Form.Group controlId="meta-track">
          <Form.Label className="small">Track no.</Form.Label>
          <Form.Control type="number" min={1} max={999} {...field("track_number")} />
        </Form.Group>
      </Col>
    </Row>
  );
}
