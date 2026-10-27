import { Stack, router, useLocalSearchParams } from "expo-router";
import { FlatList } from "react-native";

import DetailHeader from "@/components/DetailHeader";
import TrackRow from "@/components/TrackRow";
import { Artwork, EmptyState, IconButton, Loading } from "@/components/ui";
import { formatLongDuration, pluralize } from "@/lib/format";
import { useAlbum } from "@/lib/queries";
import { colors } from "@/lib/theme";
import { useDownloads } from "@/store/downloads";
import { usePlayer } from "@/store/player";

export default function AlbumScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const album = useAlbum(id);
  const data = album.data;
  const allDownloaded = useDownloads((s) => !!data?.tracks.length && data.tracks.every((t) => s.tracks[t.id]?.pinned));

  if (!data) return album.isPending ? <Loading /> : <EmptyState icon="cloud-offline-outline" title="Album not available" />;
  const duration = data.tracks.reduce((sum, track) => sum + track.duration, 0);
  const play = (index: number, shuffle?: boolean) =>
    usePlayer.getState().playTracks(data.tracks, index, { type: "album", id: data.id, name: data.title }, shuffle);
  const toggleDownload = () => {
    const downloads = useDownloads.getState();
    if (allDownloaded) data.tracks.forEach((track) => downloads.removeTrack(track.id));
    else downloads.downloadTracks(data.tracks);
  };

  return (
    <>
      <Stack.Screen options={{ title: data.title }} />
      <FlatList
        data={data.tracks}
        keyExtractor={(track) => String(track.id)}
        ListHeaderComponent={
          <DetailHeader
            cover={<Artwork sha1={data.artwork} size="100%" icon="disc" full />}
            title={data.title}
            subtitle={data.artist}
            meta={[data.year, pluralize(data.tracks.length, "song"), formatLongDuration(duration)].filter(Boolean).join(" · ")}
            onPlay={() => play(0, false)}
            onShuffle={() => play(0, true)}
            actions={
              <>
                <IconButton
                  name={allDownloaded ? "arrow-down-circle" : "arrow-down-circle-outline"}
                  size={28}
                  color={allDownloaded ? colors.accent : colors.textSecondary}
                  label={allDownloaded ? "Remove download" : "Download album"}
                  onPress={toggleDownload}
                />
                <IconButton
                  name="person-outline"
                  size={24}
                  color={colors.textSecondary}
                  label="Go to artist"
                  onPress={() => router.push(`/artist/${data.artist_id}`)}
                />
              </>
            }
          />
        }
        renderItem={({ item, index }) => (
          <TrackRow track={item} number={item.track_number ?? index + 1} onPress={() => play(index, false)} />
        )}
      />
    </>
  );
}
