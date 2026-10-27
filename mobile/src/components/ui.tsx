import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { colors, radius, spacing } from "@/lib/theme";
import { useOnline } from "@/store/connectivity";
import { localCoverUri } from "@/store/downloads";
import { authHeaders, serverUrl } from "@/store/session";

export type IconName = ComponentProps<typeof Ionicons>["name"];

/** Cover image: downloaded file if available, otherwise loaded (and disk-cached) from the server. */
export function Artwork({
  sha1,
  size,
  round = false,
  icon = "musical-notes",
  full = false,
}: {
  sha1: string | null | undefined;
  size: number | "100%";
  round?: boolean;
  icon?: IconName;
  full?: boolean;
}) {
  const style = {
    width: size,
    aspectRatio: 1,
    borderRadius: round ? 9999 : size === "100%" || size > 100 ? radius.md : radius.sm,
    backgroundColor: colors.surface3,
  } as const;
  const local = full ? null : localCoverUri(sha1);
  if (!sha1) {
    return (
      <View style={[style, styles.placeholder]}>
        <Ionicons name={icon} size={typeof size === "number" ? size * 0.4 : 64} color={colors.textTertiary} />
      </View>
    );
  }
  const source = local
    ? { uri: local }
    : { uri: serverUrl(`/api/artwork/${sha1}/${full ? "" : "?size=thumb"}`), headers: authHeaders() };
  return <Image source={source} style={style} cachePolicy="disk" recyclingKey={sha1} transition={150} />;
}

export function Mosaic({ artworks, size }: { artworks: string[]; size: number | "100%" }) {
  if (artworks.length < 4) return <Artwork sha1={artworks[0]} size={size} icon="list" />;
  const cell = typeof size === "number" ? size / 2 : "50%";
  return (
    <View style={[styles.mosaic, { width: size, aspectRatio: 1 }]}>
      {artworks.slice(0, 4).map((sha1) => (
        <Image
          key={sha1}
          source={{ uri: serverUrl(`/api/artwork/${sha1}/?size=thumb`), headers: authHeaders() }}
          style={{ width: cell, aspectRatio: 1 }}
          cachePolicy="disk"
        />
      ))}
    </View>
  );
}

export function IconButton({
  name,
  onPress,
  size = 24,
  color = colors.text,
  label,
  disabled,
  style,
}: {
  name: IconName;
  onPress: () => void;
  size?: number;
  color?: string;
  label: string;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, style, { opacity: disabled ? 0.35 : pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={name} size={size} color={color} />
    </Pressable>
  );
}

export function Button({
  title,
  icon,
  onPress,
  variant = "primary",
  disabled,
  loading,
}: {
  title: string;
  icon?: IconName;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
}) {
  const background = variant === "primary" ? colors.accent : variant === "danger" ? "transparent" : colors.surface3;
  const foreground = variant === "primary" ? colors.accentContrast : variant === "danger" ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        variant === "danger" && { borderWidth: 1, borderColor: colors.danger },
      ]}
    >
      {loading ? <ActivityIndicator color={foreground} /> : icon && <Ionicons name={icon} size={18} color={foreground} />}
      <Text style={[styles.buttonText, { color: foreground }]}>{title}</Text>
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Shelf({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: spacing.xl }}>
      <SectionTitle>{title}</SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}>
        {children}
      </ScrollView>
    </View>
  );
}

export function Card({
  title,
  subtitle,
  cover,
  onPress,
  width = 140,
}: {
  title: string;
  subtitle?: string;
  cover: ReactNode;
  onPress: () => void;
  width?: number;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ width, opacity: pressed ? 0.7 : 1 })}>
      {cover}
      <Text style={styles.cardTitle} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

export function EmptyState({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <View style={[styles.center, { paddingHorizontal: spacing.xl }]}>
      <Ionicons name={icon} size={48} color={colors.textTertiary} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {children ? <Text style={styles.emptyText}>{children}</Text> : null}
    </View>
  );
}

/** Shown when the server cannot be reached (VPN off, no network). */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <View style={styles.banner}>
      <Ionicons name="cloud-offline" size={16} color={colors.accentContrast} />
      <Text style={styles.bannerText}>Offline – your downloads are still available</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  placeholder: { alignItems: "center", justifyContent: "center" },
  mosaic: { flexDirection: "row", flexWrap: "wrap", borderRadius: radius.md, overflow: "hidden" },
  iconButton: { padding: 4, alignItems: "center", justifyContent: "center" },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
  },
  buttonText: { fontWeight: "700", fontSize: 15 },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  cardTitle: { color: colors.text, fontWeight: "600", marginTop: spacing.sm, fontSize: 14 },
  cardSubtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 48 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: "700", marginTop: spacing.md, textAlign: "center" },
  emptyText: { color: colors.textSecondary, marginTop: spacing.sm, textAlign: "center" },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  bannerText: { color: colors.accentContrast, fontWeight: "600", fontSize: 13 },
});
