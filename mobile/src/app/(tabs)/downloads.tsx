import { router } from "expo-router";
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import TrackRow from "@/components/TrackRow";
import { Button, EmptyState, IconButton, Mosaic, OfflineBanner, SectionTitle } from "@/components/ui";
import { formatBytes, pluralize } from "@/lib/format";
import { colors, radius, spacing } from "@/lib/theme";
import { useDownloads } from "@/store/downloads";
import { usePlayer } from "@/store/player";

export default function DownloadsScreen() {
  const tracks = useDownloads((s) => s.tracks);
  const playlists = useDownloads((s) => s.playlists);
  const jobs = useDownloads((s) => s.jobs);
  const wifiOnly = useDownloads((s) => s.wifiOnly);
  const syncing = useDownloads((s) => s.syncing);

  const downloaded = Object.values(tracks)
    .map((entry) => entry.track)
    .sort((a, b) => a.title.localeCompare(b.title));
  const size = Object.values(tracks).reduce((sum, entry) => sum + entry.size, 0);
  const pending = Object.values(jobs);
  const active = pending.filter((job) => job.status !== "failed");
  const failed = pending.filter((job) => job.status === "failed");
  const downloading = pending.find((job) => job.status === "downloading");
  const outdated = Object.values(tracks).filter((entry) => entry.outdated);

  const confirmRemoveAll = () =>
    Alert.alert("Remove all downloads?", "Songs stay on the server and can be downloaded again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => useDownloads.getState().removeAll() },
    ]);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }}>
      <OfflineBanner />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <View style={styles.header}>
          <Text style={styles.heading}>Downloads</Text>
          <IconButton name="sync" label="Sync downloads" onPress={() => useDownloads.getState().sync()} disabled={syncing} />
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelText}>
            {pluralize(downloaded.length, "song")} · {formatBytes(size)}
          </Text>
          {active.length > 0 && (
            <Text style={styles.panelSub}>
              {downloading
                ? `Downloading “${downloading.track.title}” (${Math.round(downloading.progress * 100)}%) · `
                : "Waiting for connection · "}
              {active.length} left
            </Text>
          )}
          <View style={styles.switchRow}>
            <Text style={styles.panelText}>Download over Wi-Fi only</Text>
            <Switch
              value={wifiOnly}
              onValueChange={(value) => useDownloads.getState().setWifiOnly(value)}
              trackColor={{ true: colors.accent, false: colors.surface3 }}
            />
          </View>
          {outdated.length > 0 && (
            <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
              <Text style={[styles.panelSub, { color: colors.accent }]}>
                {pluralize(outdated.length, "song")} changed on the server
              </Text>
              <Button
                title="Update all"
                variant="secondary"
                icon="sync"
                onPress={() => useDownloads.getState().redownload(outdated.map((entry) => entry.track.id))}
              />
            </View>
          )}
          {failed.length > 0 && (
            <View style={{ marginTop: spacing.sm }}>
              <Text style={[styles.panelSub, { color: colors.danger }]}>{pluralize(failed.length, "download")} failed</Text>
              <Button title="Retry" variant="secondary" icon="refresh" onPress={() => useDownloads.getState().retryFailed()} />
            </View>
          )}
        </View>

        {Object.keys(playlists).length > 0 && (
          <View style={{ marginBottom: spacing.lg }}>
            <SectionTitle>Playlists</SectionTitle>
            {Object.values(playlists).map(({ playlist }) => (
              <View key={playlist.id} style={styles.playlistRow}>
                <Mosaic artworks={playlist.artworks} size={52} />
                <Text style={styles.playlistName} numberOfLines={1} onPress={() => router.push(`/playlist/${playlist.id}`)}>
                  {playlist.name}
                </Text>
                <IconButton
                  name="close-circle-outline"
                  label={`Remove ${playlist.name} download`}
                  color={colors.textSecondary}
                  onPress={() => useDownloads.getState().removePlaylist(playlist.id)}
                />
              </View>
            ))}
          </View>
        )}

        {downloaded.length > 0 ? (
          <>
            <SectionTitle>Songs</SectionTitle>
            {downloaded.map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                onPress={() => usePlayer.getState().playTracks(downloaded, index, { type: "downloads", name: "Downloads" }, false)}
              />
            ))}
            <View style={{ padding: spacing.lg }}>
              <Button title="Remove all downloads" variant="danger" icon="trash-outline" onPress={confirmRemoveAll} />
            </View>
          </>
        ) : (
          <EmptyState icon="arrow-down-circle-outline" title="Nothing downloaded yet">
            Use the download button on a playlist, album or song to listen without connection.
          </EmptyState>
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
  },
  heading: { color: colors.text, fontSize: 26, fontWeight: "800" },
  panel: { backgroundColor: colors.surface2, borderRadius: radius.lg, margin: spacing.lg, padding: spacing.lg, gap: spacing.xs },
  panelText: { color: colors.text, fontSize: 15 },
  panelSub: { color: colors.textSecondary, fontSize: 13 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  playlistRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 6 },
  playlistName: { flex: 1, color: colors.text, fontSize: 16, fontWeight: "500" },
});
