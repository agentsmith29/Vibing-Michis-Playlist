import Constants from "expo-constants";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { formatBytes, pluralize } from "@/lib/format";
import { colors, radius, spacing } from "@/lib/theme";
import { useConnectivity } from "@/store/connectivity";
import { useDownloads } from "@/store/downloads";
import { usePlayer } from "@/store/player";
import { useSession } from "@/store/session";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export default function SettingsScreen() {
  const session = useSession((s) => s.session);
  const reachable = useConnectivity((s) => s.serverReachable && s.networkUp);
  const tracks = useDownloads((s) => s.tracks);
  const size = Object.values(tracks).reduce((sum, entry) => sum + entry.size, 0);

  const logout = () =>
    Alert.alert("Log out?", "Downloads stay on this phone and are available again after logging in.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          usePlayer.getState().stop();
          // Revoke this device's token on the server; ignore failures while offline.
          await api("/auth/token/logout/", { method: "POST" }).catch(() => {});
          await useSession.getState().clear();
        },
      },
    ]);

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
      <View style={styles.panel}>
        <Row label="Server" value={session?.server ?? "–"} />
        <Row label="Status" value={reachable ? "Connected" : "Not reachable (VPN off?)"} />
        <Row label="Signed in as" value={session?.user.username ?? "–"} />
      </View>
      <View style={styles.panel}>
        <Row label="Downloads" value={`${pluralize(Object.keys(tracks).length, "song")} · ${formatBytes(size)}`} />
        <Row label="App version" value={Constants.expoConfig?.version ?? "–"} />
      </View>
      <Text style={styles.hint}>
        You can also sign this phone out from the web player under Settings → Connected apps.
      </Text>
      <Button title="Log out" variant="danger" icon="log-out-outline" onPress={logout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surface2, borderRadius: radius.lg, paddingHorizontal: spacing.lg },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  label: { color: colors.textSecondary },
  value: { color: colors.text, flexShrink: 1, textAlign: "right" },
  hint: { color: colors.textTertiary, fontSize: 13 },
});
