import { Stack } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../src/auth/AuthProvider";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });

export default function RootLayout() {
  return <QueryClientProvider client={queryClient}><AuthProvider><Stack screenOptions={{ headerShown: false }} /></AuthProvider></QueryClientProvider>;
}
