import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import TrackRow from "@/components/TrackRow";
import { Artwork, Card, EmptyState, Loading, Mosaic, OfflineBanner, SectionTitle, Shelf } from "@/components/ui";
import { pluralize } from "@/lib/format";
import { useSearch } from "@/lib/queries";
import { colors, radius, spacing } from "@/lib/theme";
import { useOnline } from "@/store/connectivity";
import { usePlayer } from "@/store/player";

export default function SearchScreen() {
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const online = useOnline();
  const search = useSearch(query);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const data = search.data;
  const empty = data && !data.tracks.length && !data.artists.length && !data.albums.length && !data.playlists.length;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.surface }}>
      <OfflineBanner />
      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color={colors.textSecondary} />
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Songs, artists, albums, playlists"
          placeholderTextColor={colors.textTertiary}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>
      <ScrollView keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: spacing.xl }}>
        {!online ? (
          <EmptyState icon="cloud-offline-outline" title="Search needs a connection" />
        ) : !query ? (
          <EmptyState icon="search" title="Find your music" />
        ) : search.isPending ? (
          <Loading />
        ) : empty ? (
          <EmptyState icon="sad-outline" title={`No results for “${query}”`} />
        ) : data ? (
          <>
            {data.tracks.length > 0 && (
              <View style={{ marginBottom: spacing.xl }}>
                <SectionTitle>Songs</SectionTitle>
                {data.tracks.slice(0, 20).map((track, index) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    onPress={() => usePlayer.getState().playTracks(data.tracks, index, { type: "search", name: query }, false)}
                  />
                ))}
              </View>
            )}
            {data.artists.length > 0 && (
              <Shelf title="Artists">
                {data.artists.map((artist) => (
                  <Card
                    key={artist.id}
                    title={artist.name}
                    subtitle="Artist"
                    cover={<Artwork sha1={artist.artwork} size={120} round icon="person" />}
                    width={120}
                    onPress={() => router.push(`/artist/${artist.id}`)}
                  />
                ))}
              </Shelf>
            )}
            {data.albums.length > 0 && (
              <Shelf title="Albums">
                {data.albums.map((album) => (
                  <Card
                    key={album.id}
                    title={album.title}
                    subtitle={album.artist}
                    cover={<Artwork sha1={album.artwork} size={140} icon="disc" />}
                    onPress={() => router.push(`/album/${album.id}`)}
                  />
                ))}
              </Shelf>
            )}
            {data.playlists.length > 0 && (
              <Shelf title="Playlists">
                {data.playlists.map((playlist) => (
                  <Card
                    key={playlist.id}
                    title={playlist.name}
                    subtitle={pluralize(playlist.track_count, "song")}
                    cover={<Mosaic artworks={playlist.artworks} size={140} />}
                    onPress={() => router.push(`/playlist/${playlist.id}`)}
                  />
                ))}
              </Shelf>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    margin: spacing.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface3,
    borderRadius: radius.md,
  },
  input: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 12 },
});
