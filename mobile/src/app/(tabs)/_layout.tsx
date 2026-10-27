import Ionicons from "@expo/vector-icons/Ionicons";
import { BottomTabBar, Tabs } from "expo-router/tabs";
import { View, type ColorValue } from "react-native";

import MiniPlayer from "@/components/MiniPlayer";
import { colors } from "@/lib/theme";
import type { IconName } from "@/components/ui";

const icon =
  (name: IconName, focusedName: IconName) =>
  ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => (
    <Ionicons name={focused ? focusedName : name} color={color as string} size={size} />
  );

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => (
        <View style={{ backgroundColor: colors.background }}>
          <MiniPlayer />
          <BottomTabBar {...props} />
        </View>
      )}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("home-outline", "home") }} />
      <Tabs.Screen name="search" options={{ title: "Search", tabBarIcon: icon("search-outline", "search") }} />
      <Tabs.Screen name="library" options={{ title: "Library", tabBarIcon: icon("library-outline", "library") }} />
      <Tabs.Screen
        name="downloads"
        options={{ title: "Downloads", tabBarIcon: icon("arrow-down-circle-outline", "arrow-down-circle") }}
      />
    </Tabs>
  );
}
