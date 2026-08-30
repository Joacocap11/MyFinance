import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../src/auth/AuthProvider";

export default function Index() {
  const { status } = useAuth();
  if (status === "loading") return <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><ActivityIndicator size="large" color="#2563eb" /></View>;
  return <Redirect href={status === "authenticated" ? "/(tabs)" : "/login"} />;
}
