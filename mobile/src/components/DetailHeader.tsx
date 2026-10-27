import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, spacing } from "@/lib/theme";
import { IconButton } from "./ui";

interface Props {
  cover: ReactNode;
  title: string;
  subtitle?: string;
  meta?: string;
  onPlay?: () => void;
  onShuffle?: () => void;
  actions?: ReactNode;
}

/** Cover, title and play/shuffle row for album, artist and playlist screens. */
export default function DetailHeader({ cover, title, subtitle, meta, onPlay, onShuffle, actions }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.cover}>{cover}</View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      <View style={styles.actions}>
        <View style={styles.secondary}>{actions}</View>
        {onShuffle && <IconButton name="shuffle" size={26} label="Shuffle" onPress={onShuffle} color={colors.textSecondary} />}
        {onPlay && (
          <IconButton
            name="play"
            size={30}
            label="Play"
            onPress={onPlay}
            color={colors.accentContrast}
            style={styles.play}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, paddingBottom: spacing.sm },
  cover: { width: "62%", alignSelf: "center", marginBottom: spacing.lg },
  title: { color: colors.text, fontSize: 24, fontWeight: "800" },
  subtitle: { color: colors.text, fontSize: 14, fontWeight: "600", marginTop: spacing.xs },
  meta: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.xs },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.lg, marginTop: spacing.md },
  secondary: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.lg },
  play: { backgroundColor: colors.accent, width: 56, height: 56, borderRadius: 28, paddingLeft: 3 },
});
