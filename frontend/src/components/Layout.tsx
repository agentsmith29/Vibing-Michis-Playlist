import { useEffect, useState } from "react";
import { Dropdown, Toast, ToastContainer } from "react-bootstrap";
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useLogout, usePlaylists, useSession } from "../api/queries";
import { useUi } from "../store/ui";
import AudioEngine from "./AudioEngine";
import { Mosaic } from "./common";
import { ConfirmModal, EditTrackModal, PlaylistFormModal } from "./Modals";
import NowPlaying from "./NowPlaying";
import PlayerBar from "./PlayerBar";
import QueuePanel from "./QueuePanel";

const NAV = [
  { to: "/", icon: "house", activeIcon: "house-fill", label: "Home", end: true },
  { to: "/search", icon: "search", activeIcon: "search", label: "Search", mobileOnly: true },
  { to: "/library", icon: "collection", activeIcon: "collection-fill", label: "Library" },
  { to: "/playlists", icon: "music-note-list", activeIcon: "music-note-list", label: "Playlists" },
  { to: "/import", icon: "plus-circle", activeIcon: "plus-circle-fill", label: "Add music" },
  { to: "/settings", icon: "gear", activeIcon: "gear-fill", label: "Settings" },
];

function Sidebar() {
  const playlists = usePlaylists();
  const set = useUi((s) => s.set);
  return (
    <aside className="sidebar d-none d-lg-flex">
      <Link to="/" className="brand">
        <img src="/mango_icon.png" alt="" width={32} height={32} />
        <span>Michi Playlist</span>
      </Link>
      <nav className="sidebar-nav">
        {NAV.filter((item) => !item.mobileOnly).map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="sidebar-link">
            {({ isActive }) => (
              <>
                <i className={`bi bi-${isActive ? item.activeIcon : item.icon}`} /> {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-section">
        <div className="d-flex align-items-center justify-content-between px-2 mb-2">
          <span className="sidebar-heading">Your playlists</span>
          <button type="button" className="icon-button" aria-label="New playlist" title="New playlist" onClick={() => set({ playlistForm: {} })}>
            <i className="bi bi-plus-lg" />
          </button>
        </div>
        <div className="sidebar-playlists">
          {playlists.data?.map((playlist) => (
            <NavLink key={playlist.id} to={`/playlists/${playlist.id}`} className="sidebar-playlist">
              <Mosaic artworks={playlist.artworks} className="sidebar-playlist-cover" />
              <div className="min-w-0">
                <div className="text-truncate">{playlist.name}</div>
                <div className="text-truncate small text-body-secondary">{playlist.track_count} songs</div>
              </div>
            </NavLink>
          ))}
          {playlists.data?.length === 0 && <p className="small text-body-secondary px-2">No playlists yet.</p>}
        </div>
      </div>
    </aside>
  );
}

function MobileNav() {
  return (
    <nav className="mobile-nav d-lg-none">
      {NAV.filter((item) => item.to !== "/settings").map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className="mobile-nav-link">
          {({ isActive }) => (
            <>
              <i className={`bi bi-${isActive ? item.activeIcon : item.icon}`} />
              <span>{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function SearchBox() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const onSearchPage = location.pathname === "/search";
  const [value, setValue] = useState(onSearchPage ? params.get("q") ?? "" : "");

  useEffect(() => {
    if (!onSearchPage) setValue("");
  }, [onSearchPage]);

  // Debounced navigation to the search page.
  useEffect(() => {
    const current = onSearchPage ? params.get("q") ?? "" : "";
    if (value === current || (!value && !onSearchPage)) return;
    const timer = window.setTimeout(
      () => navigate(`/search${value ? `?q=${encodeURIComponent(value)}` : ""}`, { replace: onSearchPage }),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <div className="search-box">
      <i className="bi bi-search" />
      <input
        type="search"
        className="form-control"
        placeholder="Songs, artists, albums, playlists"
        aria-label="Search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => !onSearchPage && navigate("/search")}
      />
    </div>
  );
}

function TopBar() {
  const navigate = useNavigate();
  const session = useSession();
  const logout = useLogout();
  return (
    <div className="top-bar">
      <div className="d-none d-lg-flex gap-2">
        <button type="button" className="round-button" aria-label="Back" onClick={() => navigate(-1)}>
          <i className="bi bi-chevron-left" />
        </button>
        <button type="button" className="round-button" aria-label="Forward" onClick={() => navigate(1)}>
          <i className="bi bi-chevron-right" />
        </button>
      </div>
      <Link to="/" className="brand d-lg-none">
        <img src="/mango_icon.png" alt="Home" width={28} height={28} />
      </Link>
      <SearchBox />
      <Dropdown align="end">
        <Dropdown.Toggle variant="link" className="round-button no-caret" aria-label="Account">
          <i className="bi bi-person-fill" />
        </Dropdown.Toggle>
        <Dropdown.Menu className="shadow">
          <Dropdown.Header>Signed in as {session.data?.user?.username}</Dropdown.Header>
          <Dropdown.Item as={Link} to="/settings">
            <i className="bi bi-gear me-2" /> Settings
          </Dropdown.Item>
          <Dropdown.Item onClick={() => logout.mutate()}>
            <i className="bi bi-box-arrow-right me-2" /> Log out
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>
    </div>
  );
}

function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  return (
    <ToastContainer className="toast-area" position="bottom-center">
      {toasts.map((item) => (
        <Toast key={item.id} onClose={() => dismiss(item.id)} bg={item.variant === "danger" ? "danger" : undefined} className="app-toast">
          <Toast.Body className="d-flex align-items-center gap-2">
            <i className={`bi bi-${item.variant === "danger" ? "exclamation-circle" : item.variant === "info" ? "info-circle" : "check-circle-fill text-accent"}`} />
            <span className="flex-grow-1">{item.message}</span>
          </Toast.Body>
        </Toast>
      ))}
    </ToastContainer>
  );
}

export default function Layout() {
  const location = useLocation();
  const queueOpen = useUi((s) => s.queueOpen);

  // Scroll the content back to the top on navigation.
  useEffect(() => {
    document.querySelector(".main-view")?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className={`app-shell ${queueOpen ? "queue-open" : ""}`}>
      <AudioEngine />
      <Sidebar />
      <main className="main-view">
        <TopBar />
        <div className="page">
          <Outlet />
        </div>
      </main>
      <PlayerBar />
      <MobileNav />
      <QueuePanel />
      <NowPlaying />
      <EditTrackModal />
      <PlaylistFormModal />
      <ConfirmModal />
      <Toasts />
    </div>
  );
}
