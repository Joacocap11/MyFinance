import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { api } from "../../src/api/client";
import { currentMonth, formatDate, formatMoney, formatMonth, shiftMonth } from "../../src/lib/format";
import type { MonthlyReport } from "../../src/api/types";
import { Icon, ScreenMessage, SectionHeader } from "../../src/ui/components";
import { ScrollableScreen } from "../../src/ui/Screen";
import { colors, commonStyles, radii, spacing, typography } from "../../src/ui/theme";

function transactionIcon(kind: "income" | "expense" | "transfer") {
  if (kind === "income") return "arrow-down-circle-outline" as const;
  if (kind === "expense") return "arrow-up-circle-outline" as const;
  return "swap-horizontal-outline" as const;
}

function CategoryBars({ report }: { report: MonthlyReport }) {
  const categories = report.categories.slice(0, 5);
  return <View style={styles.categoryList}>{categories.map(category => { const percentage = Math.max(0, Math.min(100, Number(category.percentage ?? 0))); return <View key={category.category_id ?? category.name} style={styles.category}><View style={styles.categoryHeader}><Text style={styles.categoryName}>{category.name}</Text><Text style={styles.categoryAmount}>{formatMoney(category.amount, report.currency)}</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${percentage}%` }]} /></View></View>; })}</View>;
}

export default function Dashboard() {
  const [month, setMonth] = useState(currentMonth());
  const report = useQuery({ queryKey: ["dashboard", month, "UYU"], queryFn: () => api.dashboard(month, "UYU") });
  const goMonth = (offset: number) => setMonth(value => shiftMonth(value, offset));
  const refresh = () => { void report.refetch(); };
  if (report.isPending) return <ScreenMessage title="Cargando tu resumen" detail="Estamos trayendo tus últimos datos…" icon="hourglass-outline" />;
  if (report.isError) return <ScreenMessage title="No se pudo cargar el resumen" detail="Deslizá hacia abajo para reintentar." />;
  const data = report.data;
  return <ScrollableScreen style={commonStyles.page} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={report.isRefetching} onRefresh={refresh} tintColor={colors.primary} />}>
    <View style={styles.monthHeader}><Pressable accessibilityLabel="Mes anterior" onPress={() => goMonth(-1)} style={styles.monthButton}><Icon name="chevron-back" size={24} color={colors.primary} /></Pressable><View style={styles.monthTitle}><Text style={styles.eyebrow}>MES SELECCIONADO</Text><Text style={typography.title}>{formatMonth(month)}</Text></View><Pressable accessibilityLabel="Mes siguiente" onPress={() => goMonth(1)} disabled={month >= currentMonth()} style={[styles.monthButton, month >= currentMonth() && styles.disabled]}><Icon name="chevron-forward" size={24} color={colors.primary} /></Pressable></View>
    {month !== currentMonth() ? <Pressable accessibilityRole="button" onPress={() => setMonth(currentMonth())}><Text style={styles.currentMonth}>Mes actual</Text></Pressable> : null}
    <View style={styles.heroCard}><Text style={styles.cardLabel}>Resultado del mes</Text><Text style={[styles.heroAmount, { color: Number(data.net) >= 0 ? colors.success : colors.danger }]}>{formatMoney(data.net, data.currency)}</Text><View style={styles.metrics}><View><Text style={styles.cardLabel}>Ingresos</Text><Text style={styles.metricValue}>{formatMoney(data.income, data.currency)}</Text></View><View><Text style={styles.cardLabel}>Gastos</Text><Text style={styles.metricValue}>{formatMoney(data.expenses, data.currency)}</Text></View></View></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Nuevo movimiento" onPress={() => router.push("/movement/new")} style={({ pressed }) => [styles.fab, pressed && styles.pressed]}><Icon name="add" size={24} color={colors.surface} /><Text style={styles.fabText}>Nuevo movimiento</Text></Pressable>
    <View style={styles.panel}><SectionHeader title="Gastos por categoría" /><CategoryBars report={data} /></View>
    <SectionHeader title="Últimos movimientos" />
    {data.recent_transactions.length ? data.recent_transactions.slice(0, 5).map(transaction => <Link key={transaction.id} href={{ pathname: "/movement/[id]", params: { id: transaction.id } }} asChild><Pressable style={styles.listCard}><View style={[styles.rowIcon, transaction.kind === "income" ? styles.incomeIcon : transaction.kind === "expense" ? styles.expenseIcon : styles.transferIcon]}><Icon name={transactionIcon(transaction.kind)} size={21} color={transaction.kind === "income" ? colors.success : transaction.kind === "expense" ? colors.danger : colors.primary} /></View><View style={styles.flex}><Text style={styles.itemTitle}>{transaction.description}</Text><Text style={styles.muted}>{formatDate(transaction.date)} · {transaction.is_voided ? "Anulado" : transaction.kind === "income" ? "Ingreso" : transaction.kind === "expense" ? "Gasto" : "Transferencia"}</Text></View><Text style={[styles.itemAmount, { color: transaction.kind === "income" ? colors.success : transaction.kind === "expense" ? colors.danger : colors.ink }]}>{transaction.kind === "expense" ? "−" : transaction.kind === "income" ? "+" : ""}{formatMoney(transaction.amount, data.currency)}</Text></Pressable></Link>) : <View style={styles.empty}><Text style={styles.muted}>No hay movimientos en este mes.</Text></View>}
  </ScrollableScreen>;
}

const styles = StyleSheet.create({
  content: { ...commonStyles.content, paddingBottom: spacing.xxl },
  monthHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.sm },
  monthTitle: { alignItems: "center", flex: 1 },
  monthButton: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radii.pill, height: 42, justifyContent: "center", width: 42 },
  disabled: { opacity: 0.35 },
  eyebrow: { color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginBottom: spacing.xs },
  currentMonth: { color: colors.primary, fontWeight: "800", textAlign: "center", marginBottom: spacing.sm },
  heroCard: { ...commonStyles.card, backgroundColor: colors.ink, padding: spacing.xl },
  cardLabel: { color: "#aebbd0", fontSize: 13, fontWeight: "700" },
  heroAmount: { fontSize: 32, fontWeight: "800", marginVertical: spacing.sm },
  metrics: { borderTopColor: "#314157", borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md, paddingTop: spacing.md },
  metricValue: { color: colors.surface, fontSize: 16, fontWeight: "800", marginTop: spacing.xs },
  fab: { alignItems: "center", alignSelf: "stretch", backgroundColor: colors.primary, borderRadius: radii.md, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 52, padding: spacing.md },
  fabText: { color: colors.surface, fontSize: 16, fontWeight: "800" },
  panel: { ...commonStyles.card, gap: spacing.md },
  categoryList: { gap: spacing.md },
  category: { gap: spacing.xs },
  categoryHeader: { flexDirection: "row", justifyContent: "space-between" },
  categoryName: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  categoryAmount: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  track: { backgroundColor: colors.surfaceMuted, borderRadius: radii.pill, height: 10, overflow: "hidden" },
  fill: { backgroundColor: colors.primary, borderRadius: radii.pill, height: "100%" },
  listCard: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radii.md, flexDirection: "row", gap: spacing.md, minHeight: 68, padding: spacing.md },
  rowIcon: { alignItems: "center", backgroundColor: colors.primarySoft, borderRadius: radii.pill, height: 40, justifyContent: "center", width: 40 },
  incomeIcon: { backgroundColor: colors.successSoft },
  expenseIcon: { backgroundColor: colors.dangerSoft },
  transferIcon: { backgroundColor: colors.primarySoft },
  flex: { flex: 1 },
  itemTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  itemAmount: { fontSize: 14, fontWeight: "800", textAlign: "right" },
  muted: { ...typography.muted, marginTop: spacing.xs },
  empty: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: radii.md, gap: spacing.sm, padding: spacing.xl },
  emptyTitle: { ...typography.heading, textAlign: "center" },
  pressed: { opacity: 0.8 },
});
