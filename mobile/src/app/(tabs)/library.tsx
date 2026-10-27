import { router } from "expo-router";
import { useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import TrackRow from "@/components/TrackRow";
import { Artwork, Button, EmptyState, Loading, Mosaic, OfflineBanner } from "@/components/ui";
import { errorMessage } from "@/lib/api";
import { pluralize } from "@/lib/format";
import { fetchAllTracks, useAlbums, useArtists, usePlaylists, useTracks } from "@/lib/queries";
import { colors, spacing } from "@/lib/theme";
import { useOnline } from "@/store/connectivity";
import { usePlayer } from "@/store/player";

type Tab = "playlists" | "albums" | "artists" | "songs";
const TABS: { key: Tab; label: string }[] = [
  { key: "playlists", label: "Playlists" },
  { key: "albums", label: "Albums" },
  { key: "artists", label: "Artists" },
  { key: "songs", label: "Songs" },
];

function ListItem({ cover, title, subtitle, onPress }: { cover: React.ReactNode; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]}>
      {cover}
      <View style={{ flex: 1 }}>
        <Text style={styles.itemTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.itemSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

function Playlists() {
  const playlists = usePlaylists();
  if (playlists.isPending) return <Loading />;
  return (
    <FlatList
      data={playlists.data ?? []}
      keyExtractor={(item) => String(item.id)}
      ListEmptyComponent={<EmptyState icon="list" title="No playlists yet" />}
      renderItem={({ item }) => (
        <ListItem
          cover={<Mosaic artworks={item.artworks} size={56} />}
          title={item.name}
          subtitle={`Playlist · ${pluralize(item.track_count, "song")}`}
          onPress={() => router.push(`/playlist/${item.id}`)}
        />
      )}
    />
  );
}

function Albums() {
  const albums = useAlbums({});
  const items = albums.data?.pages.flatMap((page) => page.results) ?? [];
  if (albums.isPending) return <Loading />;
  return (
    <FlatList
      data={items}
      keyExtractor={(item) => String(item.id)}
      onEndReached={() => albums.hasNextPage && !albums.isFetchingNextPage && albums.fetchNextPage()}
      ListEmptyComponent={<EmptyState icon="disc-outline" title="No albums yet" />}
      renderItem={({ item }) => (
        <ListItem
          cover={<Artwork sha1={item.artwork} size={56} icon="disc" />}
          title={item.title}
          subtitle={`${item.artist}${item.year ? ` · ${item.year}` : ""}`}
          onPress={() => router.push(`/album/${item.id}`)}
        />
      )}
    />
  );
}

function Artists() {
  const artists = useArtists({});
  const items = artists.data?.pages.flatMap((page) => page.results) ?? [];
  if (artists.isPending) return <Loading />;
  return (
    <FlatList
      data={items}
      keyExtractor={(item) => String(item.id)}
      onEndReached={() => artists.hasNextPage && !artists.isFetchingNextPage && artists.fetchNextPage()}
      ListEmptyComponent={<EmptyState icon="person-outline" title="No artists yet" />}
      renderItem={({ item }) => (
        <ListItem
          cover={<Artwork sha1={item.artwork} size={56} round icon="person" />}
          title={item.name}
          subtitle={pluralize(item.track_count, "song")}
          onPress={() => router.push(`/artist/${item.id}`)}
        />
      )}
    />
  );
}

function Songs() {
  const tracks = useTracks({ ordering: "title" });
  const items = tracks.data?.pages.flatMap((page) => page.results) ?? [];
  const total = tracks.data?.pages[0]?.count ?? 0;
  const play = async (index: number, shuffle: boolean) => {
    try {
      const all = total > items.length ? await fetchAllTracks({ ordering: "title" }) : items;
      usePlayer.getState().playTracks(all, index, { type: "library", name: "Your library" }, shuffle);
    } catch (error) {
      Alert.alert("Could not start playback", errorMessage(error));
    }
  };
  if (tracks.isPending) return <Loading />;
  return (
    <FlatList
      data={items}
      keyExtractor={(item) => String(item.id)}
      onEndReached={() => tracks.hasNextPage && !tracks.isFetchingNextPage && tracks.fetchNextPage()}
      ListHeaderComponent={
        total ? (
          <View style={styles.songActions}>
            <View style={{ flex: 1 }}>
              <Button title="Shuffle all" icon="shuffle" onPress={() => play(0, true)} />
            </View>
          </View>
        ) : undefined
      }
      ListEmptyComponent={<EmptyState icon="musical-notes-outline" title="No songs yet" />}
      renderItem={({ item, index }) => <TrackRow track={item} onPress={() => play(index, false)} />}
    />
  );
}

export default function LibraryScreen() {
  const [tab, setTab] = useState<Tab>("playlists");
  const online = useOnline();

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }}>
      <OfflineBanner />
      <Text style={styles.heading}>Library</Text>
      <View style={styles.tabs}>
        {TABS.map(({ key, label }) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[styles.chip, tab === key && styles.chipActive]}>
            <Text style={[styles.chipText, tab === key && styles.chipTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {!online ? (
        <EmptyState icon="cloud-offline-outline" title="Library needs a connection">
          Your downloads are on the Downloads tab.
        </EmptyState>
      ) : tab === "playlists" ? (
        <Playlists />
      ) : tab === "albums" ? (
        <Albums />
      ) : tab === "artists" ? (
        <Artists />
      ) : (
        <Songs />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  heading: { color: colors.text, fontSize: 26, fontWeight: "800", paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  tabs: { flexDirection: "row", gap: spacing.sm, padding: spacing.lg },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: colors.surface3 },
  chipActive: { backgroundColor: colors.accent },
  chipText: { color: colors.text, fontWeight: "600" },
  chipTextActive: { color: colors.accentContrast },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 6 },
  itemTitle: { color: colors.text, fontSize: 16, fontWeight: "500" },
  itemSubtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  songActions: { flexDirection: "row", paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
});
