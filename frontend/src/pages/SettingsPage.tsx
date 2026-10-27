import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert, Badge, Button, Col, Form, Row, Spinner, ToggleButton, ToggleButtonGroup } from "react-bootstrap";

import { api, errorMessage } from "../api/client";
import { useInvalidateLibrary, useJobs, useLogout, useSession, useStats, useSystem } from "../api/queries";
import type { Job } from "../api/types";
import { formatBytes, formatLongDuration } from "../lib/format";
import { getThemePreference, setThemePreference, type ThemePreference } from "../lib/theme";
import { toast } from "../store/ui";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <div className="stat-value">{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function LibraryCard() {
  const stats = useStats();
  const jobs = useJobs({ kind: "scan" });
  const client = useQueryClient();
  const invalidate = useInvalidateLibrary();
  const scan = jobs.data?.[0];
  const scanning = scan?.status === "queued" || scan?.status === "running";

  useEffect(() => {
    if (scan?.status === "done") invalidate();
  }, [scan?.id, scan?.status]);

  const start = async () => {
    try {
      await api<Job>("/library/scan/", { method: "POST" });
      client.invalidateQueries({ queryKey: ["jobs"] });
    } catch (error) {
      toast(errorMessage(error), "danger");
    }
  };

  return (
    <section className="panel mb-3">
      <h2 className="h5 fw-bold">Library</h2>
      {stats.data && (
        <>
          <Row className="g-2 mb-3">
            <Col xs={6} md={3}>
              <Stat label="Songs" value={stats.data.tracks} />
            </Col>
            <Col xs={6} md={3}>
              <Stat label="Artists" value={stats.data.artists} />
            </Col>
            <Col xs={6} md={3}>
              <Stat label="Albums" value={stats.data.albums} />
            </Col>
            <Col xs={6} md={3}>
              <Stat label="Playlists" value={stats.data.playlists} />
            </Col>
          </Row>
          <p className="small text-body-secondary mb-3">
            {formatLongDuration(stats.data.duration)} of music · {formatBytes(stats.data.size)} in <code>{stats.data.music_root}</code>
            <br />
            {stats.data.scan_interval
              ? `New and changed files in the folder are picked up automatically every ${Math.round(stats.data.scan_interval / 60)} min.`
              : "Automatic scanning is disabled."}
          </p>
        </>
      )}
      <div className="d-flex align-items-center gap-3">
        <Button variant="secondary" onClick={start} disabled={scanning}>
          {scanning ? <Spinner size="sm" /> : <i className="bi bi-arrow-repeat" />} Scan music folder now
        </Button>
        {scan && <span className="small text-body-secondary">{scan.status === "failed" ? scan.error : scan.message}</span>}
      </div>
    </section>
  );
}

function DownloaderCard() {
  const system = useSystem();
  const jobs = useJobs({ kind: "update_ytdlp" });
  const client = useQueryClient();
  const update = jobs.data?.[0];
  const updating = update?.status === "queued" || update?.status === "running";

  useEffect(() => {
    if (update?.status === "done") client.invalidateQueries({ queryKey: ["system"] });
  }, [update?.id, update?.status]);

  const start = async () => {
    try {
      await api<Job>("/system/update-ytdlp/", { method: "POST" });
      client.invalidateQueries({ queryKey: ["jobs"] });
    } catch (error) {
      toast(errorMessage(error), "danger");
    }
  };

  const data = system.data;
  return (
    <section className="panel mb-3">
      <h2 className="h5 fw-bold">YouTube downloader</h2>
      {data && (
        <ul className="list-unstyled small mb-3">
          <li>
            yt-dlp <strong>{data.ytdlp.active}</strong>
            {data.ytdlp.updated && <span className="text-body-secondary"> (updated, bundled {data.ytdlp.bundled})</span>}
          </li>
          <li>
            ffmpeg {data.ffmpeg ? <Badge bg="success">available</Badge> : <Badge bg="danger">missing</Badge>}{" "}
            deno {data.deno ? <Badge bg="success">available</Badge> : <Badge bg="warning">missing</Badge>}
          </li>
        </ul>
      )}
      <p className="small text-body-secondary">
        YouTube changes often. If downloads start failing, install the newest yt-dlp version here (no rebuild needed).
      </p>
      <div className="d-flex align-items-center gap-3">
        <Button variant="secondary" onClick={start} disabled={updating}>
          {updating ? <Spinner size="sm" /> : <i className="bi bi-cloud-download" />} Update yt-dlp
        </Button>
        {update && <span className="small text-body-secondary text-truncate">{update.status === "failed" ? update.error : update.message}</span>}
      </div>
    </section>
  );
}

interface Device {
  id: number;
  name: string;
  hint: string;
  created_at: string;
  last_used_at: string | null;
}

function DevicesCard() {
  const client = useQueryClient();
  const devices = useQuery({ queryKey: ["devices"], queryFn: () => api<Device[]>("/auth/devices/") });
  const revoke = async (device: Device) => {
    try {
      await api(`/auth/devices/${device.id}/`, { method: "DELETE" });
      toast(`${device.name} signed out`);
      client.invalidateQueries({ queryKey: ["devices"] });
    } catch (error) {
      toast(errorMessage(error), "danger");
    }
  };

  return (
    <section className="panel mb-3">
      <h2 className="h5 fw-bold">Connected apps</h2>
      <p className="small text-body-secondary">Phones signed in with the Michi Playlist app. Removing one signs it out immediately.</p>
      {devices.data?.length === 0 && <p className="small text-body-tertiary mb-0">No apps connected yet.</p>}
      {devices.data?.map((device) => (
        <div key={device.id} className="job-row">
          <div className="job-icon">
            <i className="bi bi-phone" />
          </div>
          <div className="min-w-0 flex-grow-1">
            <div className="fw-semibold text-truncate">{device.name}</div>
            <div className="small text-body-secondary">
              Last used {device.last_used_at ? new Date(device.last_used_at).toLocaleString() : "never"}
            </div>
          </div>
          <Button size="sm" variant="outline-danger" onClick={() => revoke(device)}>
            Remove
          </Button>
        </div>
      ))}
    </section>
  );
}

function AppearanceCard() {
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference());
  return (
    <section className="panel mb-3">
      <h2 className="h5 fw-bold">Appearance</h2>
      <ToggleButtonGroup
        type="radio"
        name="theme"
        value={theme}
        onChange={(value: ThemePreference) => {
          setTheme(value);
          setThemePreference(value);
        }}
      >
        {(["dark", "light", "system"] as const).map((option) => (
          <ToggleButton key={option} id={`theme-${option}`} value={option} variant="outline-secondary" size="sm" className="text-capitalize">
            {option}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </section>
  );
}

function AccountCard() {
  const session = useSession();
  const logout = useLogout();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/password/", { body: { current_password: current, new_password: next } });
      setCurrent("");
      setNext("");
      toast("Password changed");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel mb-3">
      <h2 className="h5 fw-bold">Account</h2>
      <p className="small text-body-secondary">
        Signed in as <strong>{session.data?.user?.username}</strong>
        {session.data?.user?.is_staff && (
          <>
            {" "}
            · <a href="/admin/" className="link-accent">Admin panel</a>
          </>
        )}
      </p>
      <Form onSubmit={submit} className="mb-3" style={{ maxWidth: 420 }}>
        <Form.Control className="mb-2" type="password" autoComplete="current-password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        <Form.Control className="mb-2" type="password" autoComplete="new-password" placeholder="New password" value={next} onChange={(e) => setNext(e.target.value)} required />
        {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}
        <Button type="submit" variant="secondary" size="sm" disabled={busy}>
          Change password
        </Button>
      </Form>
      <Button variant="outline-danger" size="sm" onClick={() => logout.mutate()}>
        <i className="bi bi-box-arrow-right" /> Log out
      </Button>
    </section>
  );
}

export default function SettingsPage() {
  const system = useSystem();
  return (
    <>
      <h1 className="page-title mt-2 mb-3">Settings</h1>
      <Row className="g-3">
        <Col xl={7}>
          <LibraryCard />
          <DownloaderCard />
        </Col>
        <Col xl={5}>
          <AppearanceCard />
          <AccountCard />
          <DevicesCard />
          <p className="small text-body-tertiary px-1">
            Michi Playlist {system.data?.version} · Django {system.data?.django}
          </p>
        </Col>
      </Row>
    </>
  );
}
