import { Stack, router, useLocalSearchParams } from "expo-router";
import { FlatList, View } from "react-native";

import DetailHeader from "@/components/DetailHeader";
import TrackRow from "@/components/TrackRow";
import { Artwork, Card, EmptyState, Loading, SectionTitle, Shelf } from "@/components/ui";
import { pluralize } from "@/lib/format";
import { useArtist } from "@/lib/queries";
import { spacing } from "@/lib/theme";
import { usePlayer } from "@/store/player";

export default function ArtistScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const artist = useArtist(id);
  const data = artist.data;
  if (!data) return artist.isPending ? <Loading /> : <EmptyState icon="cloud-offline-outline" title="Artist not available" />;
  const play = (index: number, shuffle?: boolean) =>
    usePlayer.getState().playTracks(data.tracks, index, { type: "artist", id: data.id, name: data.name }, shuffle);

  return (
    <>
      <Stack.Screen options={{ title: data.name }} />
      <FlatList
        data={data.tracks}
        keyExtractor={(track) => String(track.id)}
        ListHeaderComponent={
          <>
            <DetailHeader
              cover={<Artwork sha1={data.artwork} size="100%" round icon="person" full />}
              title={data.name}
              meta={`${pluralize(data.tracks.length, "song")} · ${pluralize(data.albums.length, "album")}`}
              onPlay={() => play(0, false)}
              onShuffle={() => play(0, true)}
            />
            {data.albums.length > 0 && (
              <View style={{ marginTop: spacing.md }}>
                <Shelf title="Albums">
                  {data.albums.map((album) => (
                    <Card
                      key={album.id}
                      title={album.title}
                      subtitle={album.year ? String(album.year) : undefined}
                      cover={<Artwork sha1={album.artwork} size={140} icon="disc" />}
                      onPress={() => router.push(`/album/${album.id}`)}
                    />
                  ))}
                </Shelf>
              </View>
            )}
            <SectionTitle>Songs</SectionTitle>
          </>
        }
        renderItem={({ item, index }) => <TrackRow track={item} onPress={() => play(index, false)} />}
      />
    </>
  );
}
