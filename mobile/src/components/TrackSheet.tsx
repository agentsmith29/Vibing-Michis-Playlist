import Ionicons from "@expo/vector-icons/Ionicons";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/lib/api";
import { useAddToPlaylist, usePlaylists } from "@/lib/queries";
import { colors, spacing } from "@/lib/theme";
import { useOnline } from "@/store/connectivity";
import { useDownloads } from "@/store/downloads";
import { usePlayer } from "@/store/player";
import { useSheet } from "@/store/sheet";
import { Artwork, type IconName } from "./ui";

function Action({ icon, label, onPress, color = colors.text }: { icon: IconName; label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.surface3 }]}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

export default function TrackSheet() {
  const { track, playlistId, entryId } = useSheet();
  const insets = useSafeAreaInsets();
  const online = useOnline();
  const playlists = usePlaylists();
  const addToPlaylist = useAddToPlaylist();
  const client = useQueryClient();
  const downloaded = useDownloads((s) => (track ? !!s.tracks[track.id]?.pinned : false));
  const onDevice = useDownloads((s) => (track ? !!s.tracks[track.id] : false));
  const outdated = useDownloads((s) => (track ? !!s.tracks[track.id]?.outdated : false));
  const [choosing, setChoosing] = useState(false);

  const close = () => {
    setChoosing(false);
    useSheet.setState({ track: null, playlistId: undefined, entryId: undefined });
  };
  const run = (action: () => void) => () => {
    close();
    action();
  };

  if (!track) return null;
  const player = usePlayer.getState();

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.header}>
          <Artwork sha1={track.artwork} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {track.title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {track.artist}
              {track.album ? ` · ${track.album}` : ""}
            </Text>
          </View>
        </View>

        {choosing ? (
          <ScrollView style={{ maxHeight: 360 }}>
            {playlists.data?.map((playlist) => (
              <Action
                key={playlist.id}
                icon="list"
                label={playlist.name}
                onPress={run(() =>
                  addToPlaylist.mutate(
                    { id: playlist.id, trackIds: [track.id] },
                    { onError: (error) => Alert.alert("Could not add song", errorMessage(error)) },
                  ),
                )}
              />
            ))}
            <Action icon="arrow-back" label="Back" onPress={() => setChoosing(false)} color={colors.textSecondary} />
          </ScrollView>
        ) : (
          <>
            <Action icon="play-skip-forward" label="Play next" onPress={run(() => player.playNext([track]))} />
            <Action icon="list" label="Add to queue" onPress={run(() => player.addToQueue([track]))} />
            {downloaded ? (
              <Action icon="trash-outline" label="Remove download" onPress={run(() => useDownloads.getState().removeTrack(track.id))} />
            ) : (
              <Action
                icon="arrow-down-circle-outline"
                label="Download"
                onPress={run(() => useDownloads.getState().downloadTracks([track]))}
              />
            )}
            {online && onDevice && (
              <Action
                icon="sync"
                label={outdated ? "Update download (changed on server)" : "Re-download"}
                color={outdated ? colors.accent : colors.text}
                onPress={run(() => useDownloads.getState().redownload([track.id]))}
              />
            )}
            {online && <Action icon="add-circle-outline" label="Add to playlist" onPress={() => setChoosing(true)} />}
            {online && playlistId && entryId && (
              <Action
                icon="remove-circle-outline"
                label="Remove from this playlist"
                onPress={run(async () => {
                  try {
                    const playlist = await api(`/playlists/${playlistId}/entries/${entryId}/`, { method: "DELETE" });
                    client.setQueryData(["playlist", playlistId], playlist);
                    client.invalidateQueries({ queryKey: ["playlists"] });
                  } catch (error) {
                    Alert.alert("Could not remove song", errorMessage(error));
                  }
                })}
              />
            )}
            {online && <Action icon="person-outline" label="Go to artist" onPress={run(() => router.push(`/artist/${track.artist_id}`))} />}
            {online && track.album_id && (
              <Action icon="disc-outline" label="Go to album" onPress={run(() => router.push(`/album/${track.album_id}`))} />
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: colors.surface2,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: "600" },
  subtitle: { color: colors.textSecondary, marginTop: 2 },
  action: { flexDirection: "row", alignItems: "center", gap: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: 14 },
  actionText: { fontSize: 16 },
});
