import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Artwork, Card, EmptyState, IconButton, Loading, Mosaic, OfflineBanner, Shelf } from "@/components/ui";
import { greeting, pluralize } from "@/lib/format";
import { useHome } from "@/lib/queries";
import { colors, radius, spacing } from "@/lib/theme";
import type { Track } from "@/lib/types";
import { useOnline } from "@/store/connectivity";
import { useDownloads } from "@/store/downloads";
import { usePlayer } from "@/store/player";

function playFrom(tracks: Track[], index: number, name: string) {
  usePlayer.getState().playTracks(tracks, index, { type: "home", name }, false);
}

/** Offline home: the downloaded playlists and songs. */
function OfflineHome() {
  // Select the stored objects (stable references) and derive lists from them; selectors
  // returning new arrays would re-render forever.
  const offlinePlaylists = useDownloads((s) => s.playlists);
  const offlineTracks = useDownloads((s) => s.tracks);
  const playlists = useMemo(() => Object.values(offlinePlaylists), [offlinePlaylists]);
  const tracks = useMemo(() => Object.values(offlineTracks).map((entry) => entry.track), [offlineTracks]);
  if (!playlists.length && !tracks.length) {
    return (
      <EmptyState icon="cloud-offline-outline" title="No connection">
        Connect the VPN to stream. Download songs or playlists to listen offline.
      </EmptyState>
    );
  }
  return (
    <>
      {playlists.length > 0 && (
        <Shelf title="Offline playlists">
          {playlists.map(({ playlist }) => (
            <Card
              key={playlist.id}
              title={playlist.name}
              subtitle={pluralize(playlist.track_count, "song")}
              cover={<Mosaic artworks={playlist.artworks} size={140} />}
              onPress={() => router.push(`/playlist/${playlist.id}`)}
            />
          ))}
        </Shelf>
      )}
      {tracks.length > 0 && (
        <Shelf title="Downloaded songs">
          {tracks.slice(0, 20).map((track, index) => (
            <Card
              key={track.id}
              title={track.title}
              subtitle={track.artist}
              cover={<Artwork sha1={track.artwork} size={140} />}
              onPress={() => playFrom(tracks, index, "Downloads")}
            />
          ))}
        </Shelf>
      )}
    </>
  );
}

export default function HomeScreen() {
  const online = useOnline();
  const home = useHome();
  const data = home.data;
  const quick = data ? (data.recent_playlists.length ? data.recent_playlists : data.playlists).slice(0, 6) : [];

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }}>
      <OfflineBanner />
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        refreshControl={<RefreshControl refreshing={home.isRefetching} onRefresh={() => void home.refetch()} tintColor={colors.accent} />}
      >
        <View style={styles.header}>
          <Text style={styles.greeting}>{greeting()}</Text>
          <IconButton name="settings-outline" label="Settings" onPress={() => router.push("/settings")} />
        </View>

        {!online ? (
          <OfflineHome />
        ) : home.isPending ? (
          <Loading />
        ) : !data ? null : data.track_count === 0 ? (
          <EmptyState icon="musical-notes-outline" title="Your library is empty">
            Add music on the web player first.
          </EmptyState>
        ) : (
          <>
            {quick.length > 0 && (
              <View style={styles.quickGrid}>
                {quick.map((playlist) => (
                  <Pressable key={playlist.id} style={styles.quickTile} onPress={() => router.push(`/playlist/${playlist.id}`)}>
                    <Mosaic artworks={playlist.artworks} size={52} />
                    <Text style={styles.quickText} numberOfLines={2}>
                      {playlist.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            {data.recent_tracks.length > 0 && (
              <Shelf title="Recently played">
                {data.recent_tracks.map((track, index) => (
                  <Card
                    key={track.id}
                    title={track.title}
                    subtitle={track.artist}
                    cover={<Artwork sha1={track.artwork} size={140} />}
                    onPress={() => playFrom(data.recent_tracks, index, "Recently played")}
                  />
                ))}
              </Shelf>
            )}
            <Shelf title="Recently added">
              {data.recently_added.map((track, index) => (
                <Card
                  key={track.id}
                  title={track.title}
                  subtitle={track.artist}
                  cover={<Artwork sha1={track.artwork} size={140} />}
                  onPress={() => playFrom(data.recently_added, index, "Recently added")}
                />
              ))}
            </Shelf>
            {data.recent_albums.length > 0 && (
              <Shelf title="Albums">
                {data.recent_albums.map((album) => (
                  <Card
                    key={album.id}
                    title={album.title}
                    subtitle={album.artist}
                    cover={<Artwork sha1={album.artwork} size={140} icon="disc" />}
                    onPress={() => router.push(`/album/${album.id}`)}
                  />
                ))}
              </Shelf>
            )}
            {data.playlists.length > 0 && (
              <Shelf title="Your playlists">
                {data.playlists.map((playlist) => (
                  <Card
                    key={playlist.id}
                    title={playlist.name}
                    subtitle={pluralize(playlist.track_count, "song")}
                    cover={<Mosaic artworks={playlist.artworks} size={140} />}
                    onPress={() => router.push(`/playlist/${playlist.id}`)}
                  />
                ))}
              </Shelf>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  greeting: { color: colors.text, fontSize: 26, fontWeight: "800" },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.xl },
  quickTile: {
    width: "48.5%",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface3,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  quickText: { color: colors.text, fontWeight: "700", fontSize: 13, flex: 1, paddingRight: spacing.sm },
});
