import { useQuery } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { api } from "../../src/api/client";
import { formatDate, formatMoney } from "../../src/lib/format";
import { Icon, PrimaryButton, ScreenMessage } from "../../src/ui/components";
import { colors, commonStyles, radii, spacing, typography } from "../../src/ui/theme";

function transactionIcon(kind: "income" | "expense" | "transfer") {
  if (kind === "income") return "arrow-down-circle-outline" as const;
  if (kind === "expense") return "arrow-up-circle-outline" as const;
  return "swap-horizontal-outline" as const;
}

export default function Movements() {
  const query = useQuery({ queryKey: ["transactions", 1], queryFn: () => api.transactions(1) });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: api.accounts });
  if (query.isPending || accounts.isPending) return <ScreenMessage title="Cargando movimientos" detail="Un momento…" icon="hourglass-outline" />;
  if (query.isError || accounts.isError || !accounts.data) return <ScreenMessage title="No se pudieron cargar los movimientos" detail="Comprobá el acceso al servidor y deslizá para reintentar." />;
  return <View style={commonStyles.page}><FlatList contentContainerStyle={styles.content} data={query.data.items} keyExtractor={item => String(item.id)} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => { void query.refetch(); }} tintColor={colors.primary} />} ListHeaderComponent={<PrimaryButton label="Nuevo movimiento" onPress={() => router.push("/movement/new")} icon="add" />} ListEmptyComponent={<View style={styles.empty}><Icon name="receipt-outline" size={30} color={colors.muted} /><Text style={styles.emptyTitle}>Todavía no hay movimientos</Text><Text style={styles.muted}>Registrá tu primer gasto, ingreso o transferencia.</Text></View>} renderItem={({ item }) => <Link href={{ pathname: "/movement/[id]", params: { id: item.id } }} asChild><Pressable style={({ pressed }) => [styles.item, pressed && styles.pressed]}><View style={[styles.icon, item.kind === "income" ? styles.income : item.kind === "expense" ? styles.expense : styles.transfer]}><Icon name={transactionIcon(item.kind)} size={22} color={item.kind === "income" ? colors.success : item.kind === "expense" ? colors.danger : colors.primary} /></View><View style={styles.flex}><Text style={styles.title}>{item.description}</Text><Text style={styles.muted}>{formatDate(item.date)} · {item.is_voided ? "Anulado" : item.kind === "income" ? "Ingreso" : item.kind === "expense" ? "Gasto" : "Transferencia"}</Text></View><Text style={[styles.amount, { color: item.kind === "income" ? colors.success : item.kind === "expense" ? colors.danger : colors.ink }]}>{item.kind === "expense" ? "−" : item.kind === "income" ? "+" : ""}{formatMoney(item.amount, accounts.data.find(account => account.id === item.account_id)?.currency ?? "UYU")}</Text></Pressable></Link>} />;</View>;
}

const styles = StyleSheet.create({
  content: { ...commonStyles.content, paddingBottom: spacing.xxl },
  item: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radii.md, flexDirection: "row", gap: spacing.md, minHeight: 72, padding: spacing.md },
  icon: { alignItems: "center", borderRadius: radii.pill, height: 42, justifyContent: "center", width: 42 },
  income: { backgroundColor: colors.successSoft },
  expense: { backgroundColor: colors.dangerSoft },
  transfer: { backgroundColor: colors.primarySoft },
  flex: { flex: 1 },
  title: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  amount: { fontSize: 14, fontWeight: "800", textAlign: "right" },
  muted: { ...typography.muted, marginTop: spacing.xs },
  empty: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: radii.md, gap: spacing.sm, marginTop: spacing.xl, padding: spacing.xl },
  emptyTitle: { ...typography.heading, textAlign: "center" },
  pressed: { opacity: 0.75 },
});
