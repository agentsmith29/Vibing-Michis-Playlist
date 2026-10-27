import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { Artwork, EmptyState, IconButton } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { colors, spacing } from "@/lib/theme";
import { usePlayer } from "@/store/player";

export default function QueueScreen() {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const context = usePlayer((s) => s.context);

  if (!queue.length) return <EmptyState icon="list" title="The queue is empty" />;

  return (
    <FlatList
      data={queue}
      keyExtractor={(item) => item.key}
      initialScrollIndex={Math.max(0, index - 1)}
      getItemLayout={(_, i) => ({ length: 60, offset: 60 * i + 28, index: i })}
      ListHeaderComponent={<Text style={styles.heading}>{context?.name ? `Playing from ${context.name}` : "Queue"}</Text>}
      renderItem={({ item, index: position }) => {
        const current = position === index;
        return (
          <Pressable
            onPress={() => usePlayer.getState().jumpTo(position)}
            style={[styles.row, current && { backgroundColor: colors.surface3 }, position < index && { opacity: 0.45 }]}
          >
            <Artwork sha1={item.track.artwork} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, current && { color: colors.accent }]} numberOfLines={1}>
                {item.track.title}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {item.track.artist} · {formatTime(item.track.duration)}
              </Text>
            </View>
            {!current && (
              <IconButton
                name="close"
                size={20}
                color={colors.textSecondary}
                label="Remove from queue"
                onPress={() => usePlayer.getState().removeAt(position)}
              />
            )}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  heading: { color: colors.textSecondary, fontSize: 13, fontWeight: "700", padding: spacing.lg, paddingBottom: spacing.sm, height: 28 + spacing.lg },
  row: { height: 60, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg },
  title: { color: colors.text, fontSize: 15, fontWeight: "500" },
  subtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
});
