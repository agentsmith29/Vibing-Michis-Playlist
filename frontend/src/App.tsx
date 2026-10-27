import { Navigate, Route, Routes } from "react-router-dom";

import { useSession } from "./api/queries";
import { Loading } from "./components/common";
import Layout from "./components/Layout";
import AlbumPage from "./pages/AlbumPage";
import ArtistPage from "./pages/ArtistPage";
import HomePage from "./pages/HomePage";
import ImportPage from "./pages/ImportPage";
import LibraryPage from "./pages/LibraryPage";
import LoginPage from "./pages/LoginPage";
import PlaylistPage from "./pages/PlaylistPage";
import PlaylistsPage from "./pages/PlaylistsPage";
import SearchPage from "./pages/SearchPage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  const session = useSession();

  if (session.isPending) return <Loading />;
  if (!session.data?.authenticated) return <LoginPage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="albums/:id" element={<AlbumPage />} />
        <Route path="artists/:id" element={<ArtistPage />} />
        <Route path="playlists" element={<PlaylistsPage />} />
        <Route path="playlists/:id" element={<PlaylistPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
