import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { formatTime } from "@/lib/format";
import { colors, spacing } from "@/lib/theme";
import type { Track } from "@/lib/types";
import { useOnline } from "@/store/connectivity";
import { useDownloadJob, useIsDownloaded, useIsOutdated } from "@/store/downloads";
import { useCurrentTrack } from "@/store/player";
import { useSheet } from "@/store/sheet";
import { Artwork, IconButton } from "./ui";

interface Props {
  track: Track;
  onPress: () => void;
  number?: number;
  playlistId?: number;
  entryId?: number;
}

/** Where the song comes from: on the phone (orange arrow), outdated copy, downloading, or streamed (cloud). */
export function SourceIcon({ trackId }: { trackId: number }) {
  const downloaded = useIsDownloaded(trackId);
  const outdated = useIsOutdated(trackId);
  const job = useDownloadJob(trackId);
  if (job?.status === "downloading") return <ActivityIndicator size="small" color={colors.textSecondary} style={{ transform: [{ scale: 0.6 }] }} />;
  if (job?.status === "queued") return <Ionicons name="time-outline" size={14} color={colors.textTertiary} accessibilityLabel="Download queued" />;
  if (job?.status === "failed") return <Ionicons name="alert-circle" size={14} color={colors.danger} accessibilityLabel="Download failed" />;
  if (outdated) return <Ionicons name="sync-circle" size={14} color={colors.accent} accessibilityLabel="Update available" />;
  if (downloaded) return <Ionicons name="arrow-down-circle" size={14} color={colors.accent} accessibilityLabel="Available offline" />;
  return <Ionicons name="cloud-outline" size={14} color={colors.textTertiary} accessibilityLabel="Streamed from server" />;
}

export default function TrackRow({ track, onPress, number, playlistId, entryId }: Props) {
  const current = useCurrentTrack();
  const online = useOnline();
  const downloaded = useIsDownloaded(track.id);
  const active = current?.id === track.id;
  // Without a connection only downloaded songs can be played.
  const available = online || downloaded;

  return (
    <Pressable
      onPress={available ? onPress : undefined}
      style={({ pressed }) => [styles.row, { opacity: available ? (pressed ? 0.6 : 1) : 0.35 }]}
    >
      {number !== undefined ? (
        <Text style={[styles.number, active && styles.active]}>{number}</Text>
      ) : (
        <Artwork sha1={track.artwork} size={48} />
      )}
      <View style={styles.info}>
        <Text style={[styles.title, active && styles.active]} numberOfLines={1}>
          {track.title}
        </Text>
        <View style={styles.subRow}>
          <SourceIcon trackId={track.id} />
          <Text style={styles.subtitle} numberOfLines={1}>
            {track.artist} · {formatTime(track.duration)}
          </Text>
        </View>
      </View>
      <IconButton
        name="ellipsis-vertical"
        size={20}
        color={colors.textSecondary}
        label={`More options for ${track.title}`}
        onPress={() => useSheet.setState({ track, playlistId, entryId })}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 6 },
  number: { width: 28, textAlign: "center", color: colors.textSecondary, fontVariant: ["tabular-nums"] },
  info: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 16, fontWeight: "500" },
  active: { color: colors.accent },
  subRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  subtitle: { color: colors.textSecondary, fontSize: 13, flexShrink: 1 },
});
