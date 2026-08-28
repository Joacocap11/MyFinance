import { useQuery } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../../src/api/client";
import { currentMonth, formatDate, formatMoney } from "../../src/lib/format";
import { Icon, ScreenMessage, SectionHeader } from "../../src/ui/components";
import { colors, commonStyles, radii, spacing, typography } from "../../src/ui/theme";

function transactionIcon(kind: "income" | "expense" | "transfer") {
  if (kind === "income") return "arrow-down-circle-outline" as const;
  if (kind === "expense") return "arrow-up-circle-outline" as const;
  return "swap-horizontal-outline" as const;
}

export default function Dashboard() {
  const report = useQuery({ queryKey: ["dashboard", currentMonth(), "UYU"], queryFn: () => api.dashboard(currentMonth(), "UYU") });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: api.accounts });
  const refresh = () => { void report.refetch(); void accounts.refetch(); };
  if (report.isPending || accounts.isPending) return <ScreenMessage title="Cargando tu resumen" detail="Estamos trayendo tus últimos datos…" icon="hourglass-outline" />;
  if (report.isError || accounts.isError) return <ScreenMessage title="No se pudo cargar el resumen" detail="Deslizá hacia abajo para reintentar." />;
  const data = report.data;
  return <ScrollView style={commonStyles.page} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={report.isRefetching || accounts.isRefetching} onRefresh={refresh} tintColor={colors.primary} /> }>
    <View style={styles.header}><View><Text style={styles.eyebrow}>ESTE MES</Text><Text style={typography.title}>{data.month}</Text></View><Icon name="sparkles-outline" size={26} color={colors.primary} /></View>
    <View style={styles.heroCard}><Text style={styles.cardLabel}>Resultado del mes</Text><Text style={[styles.heroAmount, { color: Number(data.net) >= 0 ? colors.success : colors.danger }]}>{formatMoney(data.net, data.currency)}</Text><View style={styles.metrics}><View><Text style={styles.cardLabel}>Ingresos</Text><Text style={styles.metricValue}>{formatMoney(data.income, data.currency)}</Text></View><View><Text style={styles.cardLabel}>Gastos</Text><Text style={styles.metricValue}>{formatMoney(data.expenses, data.currency)}</Text></View></View></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Nuevo movimiento" onPress={() => router.push("/movement/new")} style={({ pressed }) => [styles.fab, pressed && styles.pressed]}><Icon name="add" size={24} color={colors.surface} /><Text style={styles.fabText}>Nuevo movimiento</Text></Pressable>
    <SectionHeader title="Cuentas" action="Ver todas" onAction={() => router.push("/(tabs)/accounts")} />
    {accounts.data.length ? accounts.data.map(account => <Link key={account.id} href={{ pathname: "/account/[id]", params: { id: account.id } }} asChild><Pressable style={styles.listCard}><View style={styles.rowIcon}><Icon name="wallet-outline" size={21} color={colors.primary} /></View><View style={styles.flex}><Text style={styles.itemTitle}>{account.name}</Text><Text style={styles.muted}>{account.currency}</Text></View><Text style={styles.itemAmount}>{formatMoney(account.current_balance, account.currency)}</Text><Icon name="chevron-forward" size={18} color={colors.muted} /></Pressable></Link>) : <View style={styles.empty}><Icon name="wallet-outline" size={26} color={colors.muted} /><Text style={styles.muted}>Todavía no tenés cuentas.</Text></View>}
    <SectionHeader title="Últimos movimientos" />
    {data.recent_transactions.length ? data.recent_transactions.slice(0, 5).map(transaction => <Link key={transaction.id} href={{ pathname: "/movement/[id]", params: { id: transaction.id } }} asChild><Pressable style={styles.listCard}><View style={[styles.rowIcon, transaction.kind === "income" ? styles.incomeIcon : transaction.kind === "expense" ? styles.expenseIcon : styles.transferIcon]}><Icon name={transactionIcon(transaction.kind)} size={21} color={transaction.kind === "income" ? colors.success : transaction.kind === "expense" ? colors.danger : colors.primary} /></View><View style={styles.flex}><Text style={styles.itemTitle}>{transaction.description}</Text><Text style={styles.muted}>{formatDate(transaction.date)} · {transaction.is_voided ? "Anulado" : transaction.kind === "income" ? "Ingreso" : transaction.kind === "expense" ? "Gasto" : "Transferencia"}</Text></View><Text style={[styles.itemAmount, { color: transaction.kind === "income" ? colors.success : transaction.kind === "expense" ? colors.danger : colors.ink }]}>{transaction.kind === "expense" ? "−" : transaction.kind === "income" ? "+" : ""}{formatMoney(transaction.amount, data.currency)}</Text></Pressable></Link>) : <View style={styles.empty}><Icon name="receipt-outline" size={26} color={colors.muted} /><Text style={styles.muted}>Todavía no hay movimientos.</Text></View>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.sm },
  content: { ...commonStyles.content, paddingBottom: spacing.xxl },
  eyebrow: { color: colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  heroCard: { ...commonStyles.card, backgroundColor: colors.ink, padding: spacing.xl },
  cardLabel: { color: "#aebbd0", fontSize: 13, fontWeight: "700" },
  heroAmount: { fontSize: 32, fontWeight: "800", marginVertical: spacing.sm },
  metrics: { borderTopColor: "#314157", borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md, paddingTop: spacing.md },
  metricValue: { color: colors.surface, fontSize: 16, fontWeight: "800", marginTop: spacing.xs },
  fab: { alignItems: "center", alignSelf: "stretch", backgroundColor: colors.primary, borderRadius: radii.md, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 52, padding: spacing.md },
  fabText: { color: colors.surface, fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.8 },
  listCard: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radii.md, flexDirection: "row", gap: spacing.md, minHeight: 68, padding: spacing.md },
  rowIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radii.pill, height: 40, justifyContent: "center", width: 40 },
  incomeIcon: { backgroundColor: colors.successSoft },
  expenseIcon: { backgroundColor: colors.dangerSoft },
  transferIcon: { backgroundColor: colors.primarySoft },
  flex: { flex: 1 },
  itemTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  itemAmount: { color: colors.ink, fontSize: 14, fontWeight: "800", textAlign: "right" },
  muted: { ...typography.muted, marginTop: spacing.xs },
  empty: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: radii.md, gap: spacing.sm, padding: spacing.xl },
});
