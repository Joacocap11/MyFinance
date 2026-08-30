import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Redirect, Stack, useSegments } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/auth/AuthProvider";
import { colors } from "../src/ui/theme";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

function AuthGate() {
  const { status } = useAuth();
  const segments = useSegments();
  const inPrivateArea = segments[0] === "(tabs)";
  const onLogin = segments[0] === "login";
  if (status === "loading") return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (status === "unauthenticated" && inPrivateArea) return <Redirect href="/login" />;
  if (status === "authenticated" && onLogin) return <Redirect href="/(tabs)" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return <SafeAreaProvider><QueryClientProvider client={queryClient}><AuthProvider><AuthGate /></AuthProvider></QueryClientProvider></SafeAreaProvider>;
}