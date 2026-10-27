import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Col, Form, Modal, ProgressBar, Row, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";

import { api, errorMessage, uploadWithProgress } from "../api/client";
import { useInvalidateLibrary, useJobs, usePlaylists } from "../api/queries";
import type { Job, Track, TrackMetadata, YouTubeResult } from "../api/types";
import { CandidateList, MetadataFields, MetadataSearch, fromCandidate } from "../components/MetadataForm";
import { formatTime } from "../lib/format";
import { toast } from "../store/ui";

function PlaylistSelect({ value, onChange, label = "Add to playlist" }: { value: string; onChange: (v: string) => void; label?: string }) {
  const playlists = usePlaylists();
  return (
    <Form.Group>
      <Form.Label className="small">{label}</Form.Label>
      <Form.Select size="sm" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">None</option>
        {playlists.data?.map((playlist) => (
          <option key={playlist.id} value={playlist.id}>
            {playlist.name}
          </option>
        ))}
      </Form.Select>
    </Form.Group>
  );
}

function YouTubeForm() {
  const client = useQueryClient();
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [autoAccept, setAutoAccept] = useState(false);
  const [playlist, setPlaylist] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api<Job>("/import/youtube/", {
        body: { url, query, auto_accept: autoAccept, playlist_id: playlist ? Number(playlist) : null },
      });
      setUrl("");
      setQuery("");
      toast("Download started");
      client.invalidateQueries({ queryKey: ["jobs"] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Form onSubmit={submit} className="panel h-100">
      <h2 className="h5 fw-bold mb-1">
        <i className="bi bi-youtube text-danger me-2" />
        From YouTube
      </h2>
      <p className="small text-body-secondary">Paste a link; the audio is saved as mp3 and tagged with title, artist, album and cover.</p>
      <Form.Group className="mb-2" controlId="yt-url">
        <Form.Control
          required
          placeholder="https://www.youtube.com/watch?v=…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={(e) => setUrl(e.clipboardData.getData("text").trim())}
        />
      </Form.Group>
      <Form.Group className="mb-2" controlId="yt-query">
        <Form.Control size="sm" placeholder="Search metadata for… (optional, e.g. “Phil Collins In The Air Tonight”)" value={query} onChange={(e) => setQuery(e.target.value)} />
      </Form.Group>
      <Row className="g-2 align-items-end mb-3">
        <Col sm={7}>
          <PlaylistSelect value={playlist} onChange={setPlaylist} />
        </Col>
        <Col sm={5}>
          <Form.Check type="switch" id="yt-auto" label="Skip review" checked={autoAccept} onChange={(e) => setAutoAccept(e.target.checked)} />
        </Col>
      </Row>
      {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}
      <Button type="submit" disabled={busy || !url.trim()}>
        {busy ? <Spinner size="sm" /> : <i className="bi bi-download" />} Download
      </Button>
    </Form>
  );
}

function Dropzone({ accept, multiple, onFiles, children }: { accept: string; multiple?: boolean; onFiles: (files: File[]) => void; children: React.ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`dropzone ${over ? "dragover" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {children}
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
    </div>
  );
}

function UploadForm() {
  const invalidate = useInvalidateLibrary();
  const [playlist, setPlaylist] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const upload = async (files: File[]) => {
    const mp3s = files.filter((file) => file.name.toLowerCase().endsWith(".mp3"));
    if (!mp3s.length) {
      setErrors(["Please choose mp3 files"]);
      return;
    }
    const form = new FormData();
    mp3s.forEach((file) => form.append("files", file));
    if (playlist) form.append("playlist_id", playlist);
    setErrors([]);
    setProgress(0);
    try {
      const result = await uploadWithProgress<{ tracks: Track[]; errors: string[] }>("/import/upload/", form, setProgress);
      toast(`Added ${result.tracks.length} song${result.tracks.length === 1 ? "" : "s"}`);
      setErrors(result.errors);
      invalidate();
    } catch (err) {
      const data = (err as { data?: { errors?: string[] } }).data;
      setErrors(data?.errors?.length ? data.errors : [errorMessage(err)]);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="panel h-100">
      <h2 className="h5 fw-bold mb-1">
        <i className="bi bi-file-earmark-music text-accent me-2" />
        Upload songs
      </h2>
      <p className="small text-body-secondary">mp3 files are added to your music folder with their existing tags.</p>
      {progress !== null ? (
        <div className="py-4">
          <ProgressBar now={progress * 100} label={`${Math.round(progress * 100)}%`} />
          <div className="small text-body-secondary mt-2">{progress >= 1 ? "Processing…" : "Uploading…"}</div>
        </div>
      ) : (
        <Dropzone accept=".mp3,audio/mpeg" multiple onFiles={upload}>
          <i className="bi bi-cloud-arrow-up fs-2 text-body-secondary" />
          <div className="fw-semibold">Drop mp3 files here</div>
          <div className="small text-body-secondary">or click to choose</div>
        </Dropzone>
      )}
      <div className="mt-3">
        <PlaylistSelect value={playlist} onChange={setPlaylist} />
      </div>
      {errors.length > 0 && (
        <Alert variant="warning" className="mt-3 mb-0 small py-2">
          {errors.map((error) => (
            <div key={error}>{error}</div>
          ))}
        </Alert>
      )}
    </div>
  );
}

function ZipForm() {
  const client = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [createPlaylist, setCreatePlaylist] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    form.append("playlist_name", name);
    form.append("create_playlist", String(createPlaylist));
    setError("");
    setProgress(0);
    try {
      await uploadWithProgress<Job>("/import/zip/", form, setProgress);
      toast("Zip uploaded, importing…");
      setFile(null);
      setName("");
      client.invalidateQueries({ queryKey: ["jobs"] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setProgress(null);
    }
  };

  return (
    <Form onSubmit={submit} className="panel h-100">
      <h2 className="h5 fw-bold mb-1">
        <i className="bi bi-file-earmark-zip text-teal me-2" style={{ color: "var(--teal)" }} />
        Import a playlist (zip)
      </h2>
      <p className="small text-body-secondary">All mp3s are extracted into their own folder. An included .m3u file defines the order.</p>
      {progress !== null ? (
        <div className="py-4">
          <ProgressBar now={progress * 100} label={`${Math.round(progress * 100)}%`} />
        </div>
      ) : (
        <Dropzone
          accept=".zip,application/zip"
          onFiles={(files) => {
            const zip = files.find((f) => f.name.toLowerCase().endsWith(".zip"));
            setFile(zip ?? null);
            if (zip && !name) setName(zip.name.replace(/\.zip$/i, ""));
          }}
        >
          <i className="bi bi-file-earmark-zip fs-2 text-body-secondary" />
          <div className="fw-semibold text-truncate">{file ? file.name : "Drop a zip file here"}</div>
          <div className="small text-body-secondary">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : "or click to choose"}</div>
        </Dropzone>
      )}
      <Form.Group className="mt-3" controlId="zip-name">
        <Form.Label className="small">Playlist name</Form.Label>
        <Form.Control size="sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name of the zip file" />
      </Form.Group>
      <Form.Check className="mt-2" type="switch" id="zip-playlist" label="Create a playlist" checked={createPlaylist} onChange={(e) => setCreatePlaylist(e.target.checked)} />
      {error && <Alert variant="danger" className="mt-2 mb-0 py-2 small">{error}</Alert>}
      <Button type="submit" className="mt-3" disabled={!file || progress !== null}>
        <i className="bi bi-upload" /> Import
      </Button>
    </Form>
  );
}

function ReviewModal({ job, onHide }: { job: Job | null; onHide: () => void }) {
  const client = useQueryClient();
  const invalidate = useInvalidateLibrary();
  const result = job?.result as YouTubeResult | undefined;
  const [value, setValue] = useState<TrackMetadata | null>(null);
  const [preview, setPreview] = useState("");
  const [selected, setSelected] = useState<string>();
  const [playlist, setPlaylist] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!result) return;
    setValue(fromCandidate(result.suggested));
    setPreview(result.suggested.artwork_preview);
    setSelected(result.suggested.artwork_url + result.suggested.title);
    setPlaylist(job?.payload.playlist_id ? String(job.payload.playlist_id) : "");
    setError("");
  }, [job?.id]);

  const choose = (candidate: YouTubeResult["suggested"]) => {
    setValue(fromCandidate(candidate));
    setPreview(candidate.artwork_preview);
    setSelected(candidate.artwork_url + candidate.title);
  };

  const finish = async (action: "finalize" | "discard") => {
    if (!job || !value) return;
    setBusy(true);
    setError("");
    try {
      if (action === "finalize") {
        await api(`/import/youtube/${job.id}/finalize/`, { body: { ...value, playlist_id: playlist ? Number(playlist) : null } });
        toast(`Added “${value.title}”`);
        invalidate();
      } else {
        await api(`/import/youtube/${job.id}/discard/`, { method: "POST" });
      }
      client.invalidateQueries({ queryKey: ["jobs"] });
      onHide();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal show={!!job} onHide={onHide} size="xl" centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title>Review download</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {result && value && (
          <Row className="g-4">
            <Col lg={5}>
              <div className="small text-body-secondary mb-1">YouTube video</div>
              <div className="d-flex gap-2 align-items-center mb-3">
                {result.video.thumbnail && <img src={result.video.thumbnail} alt="" width={96} className="rounded" referrerPolicy="no-referrer" />}
                <div className="min-w-0 small">
                  <div className="fw-semibold">{result.video.title}</div>
                  <div className="text-body-secondary">
                    {result.video.uploader} · {formatTime(result.video.duration)}
                  </div>
                </div>
              </div>
              <div className="small text-body-secondary mb-1">Matches for “{result.query}”</div>
              <CandidateList candidates={[...result.candidates, { ...result.fallback, album: result.fallback.album || "From the video" }]} selected={selected} onSelect={choose} />
              <details className="metadata-lookup mt-3">
                <summary className="small fw-semibold">Search again</summary>
                <div className="mt-2">
                  <MetadataSearch initialQuery={result.query} onSelect={choose} />
                </div>
              </details>
            </Col>
            <Col lg={7}>
              <div className="d-flex gap-3 align-items-start">
                <div className="edit-cover">
                  {preview ? (
                    <img src={preview} alt="Cover" className="artwork artwork-radius" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="artwork artwork-placeholder artwork-radius">
                      <i className="bi bi-music-note-beamed" />
                    </div>
                  )}
                </div>
                <div className="flex-grow-1 min-w-0">
                  <MetadataFields value={value} onChange={setValue} />
                  <div className="mt-2">
                    <PlaylistSelect value={playlist} onChange={setPlaylist} />
                  </div>
                </div>
              </div>
              {error && <Alert variant="danger" className="mt-3 mb-0">{error}</Alert>}
            </Col>
          </Row>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" className="me-auto" onClick={() => finish("discard")} disabled={busy}>
          <i className="bi bi-trash" /> Discard
        </Button>
        <Button onClick={() => finish("finalize")} disabled={busy || !value?.title.trim() || !value?.artist.trim()}>
          {busy ? <Spinner size="sm" /> : <i className="bi bi-check-lg" />} Save to library
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

const KIND_ICON: Record<Job["kind"], string> = {
  youtube: "youtube",
  zip_import: "file-earmark-zip",
  scan: "arrow-repeat",
  update_ytdlp: "cloud-download",
};

const STATUS_BADGE: Record<Job["status"], [string, string]> = {
  queued: ["secondary", "Queued"],
  running: ["info", "Running"],
  review: ["warning", "Needs review"],
  done: ["success", "Done"],
  failed: ["danger", "Failed"],
  cancelled: ["secondary", "Discarded"],
};

function jobTitle(job: Job): string {
  const result = job.result as Partial<YouTubeResult> & { folder?: string };
  if (job.kind === "youtube") return result.video?.title ?? String(job.payload.url ?? "YouTube download");
  if (job.kind === "zip_import") return String(job.payload.filename ?? "Zip import");
  if (job.kind === "scan") return "Library scan";
  return "yt-dlp update";
}

export function JobList({ jobs, onReview }: { jobs: Job[]; onReview?: (job: Job) => void }) {
  const client = useQueryClient();
  return (
    <div>
      {jobs.map((job) => {
        const [variant, label] = STATUS_BADGE[job.status];
        const active = job.status === "queued" || job.status === "running";
        return (
          <div key={job.id} className="job-row">
            <div className="job-icon">
              <i className={`bi bi-${KIND_ICON[job.kind]}`} />
            </div>
            <div className="min-w-0 flex-grow-1">
              <div className="d-flex align-items-center gap-2">
                <span className="fw-semibold text-truncate">{jobTitle(job)}</span>
                <Badge bg={variant} className="flex-shrink-0">
                  {label}
                </Badge>
              </div>
              <div className="small text-body-secondary text-truncate">{job.status === "failed" ? job.error : job.message}</div>
              {active && <ProgressBar now={job.progress} className="mt-1" style={{ height: 4 }} animated={job.status === "running"} />}
            </div>
            {job.status === "review" && onReview && (
              <Button size="sm" onClick={() => onReview(job)}>
                Review
              </Button>
            )}
            {job.status === "done" && typeof job.result.playlist_id === "number" && (
              <Link to={`/playlists/${job.result.playlist_id}`} className="btn btn-sm btn-secondary">
                Open
              </Link>
            )}
            {(job.status === "done" || job.status === "failed" || job.status === "cancelled") && (
              <button
                type="button"
                className="icon-button"
                aria-label="Remove from list"
                onClick={() => api(`/jobs/${job.id}/`, { method: "DELETE" }).then(() => client.invalidateQueries({ queryKey: ["jobs"] }))}
              >
                <i className="bi bi-x-lg" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ImportPage() {
  const jobs = useJobs();
  const client = useQueryClient();
  const invalidate = useInvalidateLibrary();
  const [reviewing, setReviewing] = useState<Job | null>(null);
  const list = (jobs.data ?? []).filter((job) => job.kind === "youtube" || job.kind === "zip_import");

  // Refresh library views when an import finishes.
  const finished = list.filter((job) => job.status === "done").length;
  useEffect(() => {
    if (finished) invalidate();
  }, [finished]);

  return (
    <>
      <h1 className="page-title mt-2 mb-3">Add music</h1>
      <Row className="g-3 mb-4">
        <Col xl={4} md={6}>
          <YouTubeForm />
        </Col>
        <Col xl={4} md={6}>
          <UploadForm />
        </Col>
        <Col xl={4}>
          <ZipForm />
        </Col>
      </Row>

      <section className="panel">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h2 className="h5 fw-bold mb-0">Activity</h2>
          {list.some((job) => ["done", "failed", "cancelled"].includes(job.status)) && (
            <button
              type="button"
              className="btn btn-sm btn-link text-body-secondary"
              onClick={() => api("/jobs/clear/", { method: "POST" }).then(() => client.invalidateQueries({ queryKey: ["jobs"] }))}
            >
              Clear finished
            </button>
          )}
        </div>
        {jobs.isPending ? (
          <Spinner size="sm" />
        ) : list.length ? (
          <JobList jobs={list} onReview={setReviewing} />
        ) : (
          <p className="small text-body-secondary mb-0">Downloads and imports will show up here.</p>
        )}
      </section>
      <ReviewModal job={reviewing} onHide={() => setReviewing(null)} />
    </>
  );
}
