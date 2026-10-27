import { useEffect, useState } from "react";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import { useNavigate } from "react-router-dom";

import { errorMessage } from "../api/client";
import { useCreatePlaylist, useUpdatePlaylist, useUpdateTrack } from "../api/queries";
import type { TrackMetadata } from "../api/types";
import { usePlayer } from "../store/player";
import { toast, useUi } from "../store/ui";
import { Artwork } from "./common";
import { MetadataFields, MetadataSearch, emptyMetadata, fromCandidate } from "./MetadataForm";

export function EditTrackModal() {
  const track = useUi((s) => s.editTrack);
  const set = useUi((s) => s.set);
  const update = useUpdateTrack();
  const [value, setValue] = useState<TrackMetadata>(emptyMetadata);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!track) return;
    update.reset();
    setPreview(null);
    setValue({
      title: track.title,
      artist: track.artist,
      album: track.album ?? "",
      album_artist: "",
      genre: track.genre,
      year: track.year,
      track_number: track.track_number,
      artwork_url: "",
    });
  }, [track]);

  const close = () => set({ editTrack: null });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!track) return;
    const { album_artist, ...rest } = value;
    // Only send album_artist when the user filled it in; otherwise keep what the file has.
    const data: Partial<TrackMetadata> = album_artist ? value : rest;
    update.mutate(
      { id: track.id, data },
      {
        onSuccess: (updated) => {
          usePlayer.getState().updateTrack(updated);
          toast("Song updated");
          close();
        },
      },
    );
  };

  return (
    <Modal show={!!track} onHide={close} size="lg" centered scrollable>
      <Form onSubmit={submit} className="d-contents">
        <Modal.Header closeButton>
          <Modal.Title>Edit song info</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {track && (
            <>
              <div className="d-flex gap-3 align-items-start mb-3">
                <div className="edit-cover">
                  {preview ? <img src={preview} alt="New cover" className="artwork artwork-radius" referrerPolicy="no-referrer" /> : <Artwork sha1={track.artwork} />}
                  {preview && <span className="badge text-bg-warning edit-cover-badge">new</span>}
                </div>
                <div className="flex-grow-1 min-w-0">
                  <MetadataFields value={value} onChange={setValue} />
                </div>
              </div>
              <details className="metadata-lookup">
                <summary className="fw-semibold">
                  <i className="bi bi-globe2 me-1" /> Find info and cover online
                </summary>
                <div className="mt-2">
                  <MetadataSearch
                    initialQuery={`${track.artist} ${track.title}`}
                    onSelect={(candidate) => {
                      setValue(fromCandidate(candidate));
                      setPreview(candidate.artwork_preview || null);
                    }}
                  />
                </div>
              </details>
              <div className="small text-body-tertiary mt-3 text-break">
                <i className="bi bi-file-earmark-music me-1" />
                {track.file_path}
              </div>
              {update.error && (
                <Alert variant="danger" className="mt-3 mb-0">
                  {errorMessage(update.error)}
                </Alert>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={update.isPending}>
            {update.isPending && <Spinner size="sm" className="me-1" />} Save
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

export function PlaylistFormModal() {
  const form = useUi((s) => s.playlistForm);
  const set = useUi((s) => s.set);
  const create = useCreatePlaylist();
  const update = useUpdatePlaylist();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const editing = form?.playlist;
  const mutation = editing ? update : create;

  useEffect(() => {
    if (!form) return;
    create.reset();
    update.reset();
    setName(form.playlist?.name ?? "");
    setDescription(form.playlist?.description ?? "");
  }, [form]);

  const close = () => set({ playlistForm: null });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (editing) {
      update.mutate({ id: editing.id, name, description }, { onSuccess: () => close() });
    } else {
      create.mutate(
        { name, description, track_ids: form?.trackIds },
        {
          onSuccess: (playlist) => {
            close();
            if (form?.trackIds?.length) toast(`Added to ${playlist.name}`);
            else navigate(`/playlists/${playlist.id}`);
          },
        },
      );
    }
  };

  return (
    <Modal show={!!form} onHide={close} centered>
      <Form onSubmit={submit}>
        <Modal.Header closeButton>
          <Modal.Title>{editing ? "Edit playlist" : "New playlist"}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3" controlId="playlist-name">
            <Form.Label>Name</Form.Label>
            <Form.Control autoFocus required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="My playlist" />
          </Form.Group>
          <Form.Group controlId="playlist-description">
            <Form.Label>Description</Form.Label>
            <Form.Control as="textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </Form.Group>
          {mutation.error && (
            <Alert variant="danger" className="mt-3 mb-0">
              {errorMessage(mutation.error)}
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={mutation.isPending || !name.trim()}>
            {editing ? "Save" : "Create"}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

export function ConfirmModal() {
  const confirm = useUi((s) => s.confirm);
  const set = useUi((s) => s.set);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const close = () => {
    set({ confirm: null });
    setError("");
  };

  const run = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await confirm.onConfirm();
      close();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal show={!!confirm} onHide={close} centered size="sm">
      <Modal.Header closeButton>
        <Modal.Title className="h5">{confirm?.title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-0">{confirm?.body}</p>
        {error && <Alert variant="danger" className="mt-3 mb-0">{error}</Alert>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <Button variant="danger" onClick={run} disabled={busy}>
          {busy && <Spinner size="sm" className="me-1" />} {confirm?.confirmLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
