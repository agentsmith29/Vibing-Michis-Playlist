import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/lib/theme";
import { useCurrentTrack, usePlayer, useProgress } from "@/store/player";
import { Artwork, IconButton } from "./ui";

/** Compact player above the tab bar; tapping it opens the full player. */
export default function MiniPlayer() {
  const track = useCurrentTrack();
  const isPlaying = usePlayer((s) => s.isPlaying);
  const position = useProgress((s) => s.position);
  const duration = useProgress((s) => s.duration);
  if (!track) return null;

  return (
    <Pressable onPress={() => router.push("/player")} style={styles.container} accessibilityLabel="Open player">
      <View style={styles.row}>
        <Artwork sha1={track.artwork} size={42} />
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {track.artist}
          </Text>
        </View>
        <IconButton
          name={isPlaying ? "pause" : "play"}
          size={28}
          label={isPlaying ? "Pause" : "Play"}
          onPress={() => usePlayer.getState().togglePlay()}
        />
        <IconButton name="play-skip-forward" size={24} label="Next" onPress={() => usePlayer.getState().next()} />
      </View>
      <View style={styles.track}>
        <View style={[styles.progress, { width: `${duration ? Math.min(100, (position / duration) * 100) : 0}%` }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.sm,
    marginBottom: spacing.xs,
    backgroundColor: colors.surface3,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: 6, paddingRight: spacing.md },
  info: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontWeight: "600" },
  artist: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },
  track: { height: 2, backgroundColor: "rgba(255,255,255,0.15)" },
  progress: { height: 2, backgroundColor: colors.text },
});
