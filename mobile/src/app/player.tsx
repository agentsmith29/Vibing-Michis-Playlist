import Ionicons from "@expo/vector-icons/Ionicons";
import Slider from "@react-native-community/slider";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Artwork, IconButton } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { colors, spacing } from "@/lib/theme";
import { localCoverUri, useIsDownloaded, useIsOutdated } from "@/store/downloads";
import { useCurrentTrack, usePlayer, useProgress } from "@/store/player";
import { authHeaders, serverUrl } from "@/store/session";
import { useSheet } from "@/store/sheet";

function SeekBar() {
  const position = useProgress((s) => s.position);
  const duration = useProgress((s) => s.duration);
  const [dragging, setDragging] = useState<number | null>(null);
  const value = dragging ?? position;
  return (
    <View>
      <Slider
        minimumValue={0}
        maximumValue={duration || 1}
        value={value}
        onValueChange={setDragging}
        onSlidingComplete={(seconds) => {
          usePlayer.getState().seek(seconds);
          setDragging(null);
        }}
        minimumTrackTintColor={colors.text}
        maximumTrackTintColor="rgba(255,255,255,0.25)"
        thumbTintColor={colors.text}
      />
      <View style={styles.times}>
        <Text style={styles.time}>{formatTime(value)}</Text>
        <Text style={styles.time}>{formatTime(duration)}</Text>
      </View>
    </View>
  );
}

/** "Playing offline" for downloaded songs, "Streaming" for everything else. */
function SourceBadge({ trackId }: { trackId: number }) {
  const offline = useIsDownloaded(trackId);
  const outdated = useIsOutdated(trackId);
  const label = offline ? (outdated ? "Playing offline · update available" : "Playing offline") : "Streaming";
  return (
    <View style={styles.badge}>
      <Ionicons name={offline ? "arrow-down-circle" : "cloud-outline"} size={14} color={offline ? colors.accent : colors.textSecondary} />
      <Text style={[styles.badgeText, offline && { color: colors.accent }]}>{label}</Text>
    </View>
  );
}

export default function PlayerScreen() {
  const track = useCurrentTrack();
  const isPlaying = usePlayer((s) => s.isPlaying);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const context = usePlayer((s) => s.context);
  const buffering = useProgress((s) => s.buffering);
  const player = usePlayer.getState;

  if (!track) {
    router.back();
    return null;
  }
  const background = localCoverUri(track.artwork)
    ? { uri: localCoverUri(track.artwork)! }
    : track.artwork
      ? { uri: serverUrl(`/api/artwork/${track.artwork}/?size=thumb`), headers: authHeaders() }
      : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      {background && <Image source={background} style={StyleSheet.absoluteFill} blurRadius={60} cachePolicy="disk" />}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.55)" }]} />
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <IconButton name="chevron-down" size={28} label="Close" onPress={() => router.back()} />
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={styles.contextLabel}>PLAYING FROM {(context?.type ?? "library").toUpperCase()}</Text>
            <Text style={styles.contextName} numberOfLines={1}>
              {context?.name ?? "Your library"}
            </Text>
          </View>
          <IconButton name="list" size={24} label="Queue" onPress={() => router.push("/queue")} />
        </View>

        <View style={styles.art}>
          <Artwork sha1={track.artwork} size="100%" full />
        </View>

        <View style={styles.infoRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {track.title}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {track.artist}
            </Text>
            <SourceBadge trackId={track.id} />
          </View>
          <IconButton name="ellipsis-horizontal" label="More" onPress={() => useSheet.setState({ track })} />
        </View>

        <SeekBar />

        <View style={styles.controls}>
          <IconButton
            name="shuffle"
            size={24}
            color={shuffle ? colors.accent : colors.text}
            label="Shuffle"
            onPress={() => player().toggleShuffle()}
          />
          <IconButton name="play-skip-back" size={36} label="Previous" onPress={() => player().previous()} />
          <IconButton
            name={isPlaying ? "pause-circle" : "play-circle"}
            size={80}
            label={isPlaying ? "Pause" : "Play"}
            onPress={() => player().togglePlay()}
            disabled={buffering && !isPlaying}
          />
          <IconButton name="play-skip-forward" size={36} label="Next" onPress={() => player().next()} />
          <IconButton
            name={repeat === "one" ? "repeat" : "repeat-outline"}
            size={24}
            color={repeat !== "off" ? colors.accent : colors.text}
            label={`Repeat: ${repeat}`}
            onPress={() => player().cycleRepeat()}
          />
        </View>
        {repeat === "one" && <Text style={styles.repeatOne}>Repeating this song</Text>}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  topBar: { flexDirection: "row", alignItems: "center", paddingTop: spacing.sm },
  contextLabel: { color: colors.textSecondary, fontSize: 11, letterSpacing: 1 },
  contextName: { color: colors.text, fontWeight: "700" },
  art: { flex: 1, justifyContent: "center", paddingVertical: spacing.xl },
  infoRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  title: { color: colors.text, fontSize: 22, fontWeight: "800" },
  artist: { color: colors.textSecondary, fontSize: 16, marginTop: 2 },
  times: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.sm },
  time: { color: colors.textSecondary, fontSize: 12, fontVariant: ["tabular-nums"] },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md },
  repeatOne: { color: colors.accent, textAlign: "center", fontSize: 12, marginTop: spacing.sm },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.xs },
  badgeText: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
});
