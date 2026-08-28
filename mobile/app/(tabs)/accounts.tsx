import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { api } from "../../src/api/client";
import { formatMoney } from "../../src/lib/format";
import { Icon, PrimaryButton, ScreenMessage } from "../../src/ui/components";
import { colors, commonStyles, radii, spacing, typography } from "../../src/ui/theme";

export default function Accounts() {
  const query = useQuery({ queryKey: ["accounts"], queryFn: api.accounts });
  if (query.isPending) return <ScreenMessage title="Cargando cuentas" detail="Un momento…" icon="hourglass-outline" />;
  if (query.isError) return <ScreenMessage title="No se pudieron cargar las cuentas" detail="Comprobá el acceso al servidor y deslizá para reintentar." />;
  return <FlatList style={commonStyles.page} contentContainerStyle={styles.content} data={query.data} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }} tintColor={colors.primary} />} keyExtractor={item => String(item.id)} ListHeaderComponent={<PrimaryButton label="Nueva cuenta" icon="add" onPress={() => router.push("/account/new")} />} ListEmptyComponent={<View style={styles.empty}><Icon name="wallet-outline" size={30} color={colors.muted} /><Text style={styles.emptyTitle}>No tenés cuentas todavía.</Text><Text style={styles.muted}>Creá tu primera cuenta para empezar.</Text><PrimaryButton label="Crear primera cuenta" icon="add" onPress={() => router.push("/account/new")} /></View>} renderItem={({ item }) => <Pressable onPress={() => router.push({ pathname: "/account/[id]", params: { id: item.id } })} style={({ pressed }) => [styles.item, pressed && styles.pressed]}><View style={styles.icon}><Icon name="wallet-outline" size={24} color={colors.primary} /></View><View style={styles.flex}><Text style={styles.title}>{item.name}</Text><Text style={styles.muted}>{item.currency}{item.is_active ? "" : " · Archivada"}</Text></View><Text style={styles.amount}>{formatMoney(item.current_balance, item.currency)}</Text><Icon name="chevron-forward" size={18} color={colors.muted} /></Pressable>} />;
}

const styles = StyleSheet.create({
  content: { ...commonStyles.content, gap: spacing.md, paddingBottom: spacing.xxl },
  item: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radii.md, flexDirection: "row", gap: spacing.md, minHeight: 78, padding: spacing.md },
  icon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radii.pill, height: 44, justifyContent: "center", width: 44 },
  flex: { flex: 1 },
  title: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  amount: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  muted: { ...typography.muted, marginTop: spacing.xs },
  empty: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: radii.md, gap: spacing.sm, padding: spacing.xl },
  emptyTitle: { ...typography.heading, textAlign: "center" },
  pressed: { opacity: 0.75 },
});
