import * as Device from "expo-device";
import { Image } from "expo-image";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/ui";
import { api, errorMessage, normalizeServer } from "@/lib/api";
import { colors, radius, spacing } from "@/lib/theme";
import type { User } from "@/lib/types";
import { useSession } from "@/store/session";

export default function LoginScreen() {
  const [server, setServer] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError("");
    const base = normalizeServer(server);
    try {
      const health = await api<{ app?: string }>("/health/", { server: base, auth: false, timeoutMs: 8000 });
      if (health?.app !== "michi-playlist") throw new Error("This is not a Michi Playlist server");
      const result = await api<{ token: string; user: User }>("/auth/token/", {
        server: base,
        auth: false,
        body: { username, password, device_name: Device.deviceName ?? Device.modelName ?? "Phone" },
      });
      await useSession.getState().save({ server: base, token: result.token, user: result.user });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Image source={require("../../assets/splash-icon.png")} style={styles.logo} />
          <Text style={styles.heading}>Michi Playlist</Text>
          <Text style={styles.hint}>Connect to your server through the VPN.</Text>

          <View style={styles.form}>
            <Text style={styles.label}>Server address</Text>
            <TextInput
              style={styles.input}
              value={server}
              onChangeText={setServer}
              placeholder="10.8.0.1:4000"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="username"
            />
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              onSubmitEditing={submit}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button title="Log in" onPress={submit} loading={busy} disabled={!server || !username || !password} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: spacing.xl },
  logo: { width: 72, height: 72, alignSelf: "center" },
  heading: { color: colors.text, fontSize: 28, fontWeight: "800", textAlign: "center", marginTop: spacing.md },
  hint: { color: colors.textSecondary, textAlign: "center", marginTop: spacing.xs, marginBottom: spacing.xl },
  form: { gap: spacing.sm },
  label: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surface2,
    color: colors.text,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  error: { color: colors.danger, marginVertical: spacing.sm },
});
