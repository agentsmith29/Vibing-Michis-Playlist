import { Stack, useLocalSearchParams } from "expo-router";
import { FlatList, RefreshControl } from "react-native";

import DetailHeader from "@/components/DetailHeader";
import TrackRow from "@/components/TrackRow";
import { EmptyState, IconButton, Loading, Mosaic, OfflineBanner } from "@/components/ui";
import { formatLongDuration, pluralize } from "@/lib/format";
import { usePlaylist } from "@/lib/queries";
import { colors } from "@/lib/theme";
import { useDownloads } from "@/store/downloads";
import { usePlayer } from "@/store/player";

export default function PlaylistScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const playlist = usePlaylist(id);
  const offline = useDownloads((s) => !!s.playlists[id]);
  const data = playlist.data;

  if (!data) {
    return playlist.isPending ? <Loading /> : <EmptyState icon="cloud-offline-outline" title="Playlist not available offline" />;
  }
  const tracks = data.entries.map((entry) => entry.track);
  const play = (index: number, shuffle?: boolean) =>
    usePlayer.getState().playTracks(tracks, index, { type: "playlist", id: data.id, name: data.name }, shuffle);

  return (
    <>
      <Stack.Screen options={{ title: data.name }} />
      <OfflineBanner />
      <FlatList
        data={data.entries}
        keyExtractor={(entry) => String(entry.id)}
        refreshControl={<RefreshControl refreshing={playlist.isRefetching} onRefresh={() => void playlist.refetch()} tintColor={colors.accent} />}
        ListHeaderComponent={
          <DetailHeader
            cover={<Mosaic artworks={data.artworks} size="100%" />}
            title={data.name}
            subtitle={data.description || undefined}
            meta={`${pluralize(data.track_count, "song")}${data.duration ? ` · ${formatLongDuration(data.duration)}` : ""}${
              playlist.isOfflineCopy ? " · offline copy" : ""
            }`}
            onPlay={tracks.length ? () => play(0, false) : undefined}
            onShuffle={tracks.length ? () => play(0, true) : undefined}
            actions={
              <IconButton
                name={offline ? "arrow-down-circle" : "arrow-down-circle-outline"}
                size={28}
                color={offline ? colors.accent : colors.textSecondary}
                label={offline ? "Remove download" : "Download playlist"}
                onPress={() =>
                  offline ? useDownloads.getState().removePlaylist(data.id) : useDownloads.getState().downloadPlaylist(data)
                }
              />
            }
          />
        }
        ListEmptyComponent={<EmptyState icon="list" title="This playlist is empty" />}
        renderItem={({ item, index }) => (
          <TrackRow track={item.track} onPress={() => play(index, false)} playlistId={data.id} entryId={item.id} />
        )}
      />
    </>
  );
}
