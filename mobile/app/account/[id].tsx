import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, router, useLocalSearchParams } from "expo-router";
import { Alert, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError, api } from "../../src/api/client";
import { formatDate, formatMoney } from "../../src/lib/format";
import { Icon, PrimaryButton, ScreenMessage } from "../../src/ui/components";
import { SafeAreaFlatList } from "../../src/ui/Screen";
import { colors, commonStyles, radii, spacing, typography } from "../../src/ui/theme";

export default function AccountDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const accountId = Number(id);
  const client = useQueryClient();
  const account = useQuery({ queryKey: ["account", id], queryFn: () => api.account(accountId) });
  const transactions = useQuery({ queryKey: ["transactions", 1, accountId], queryFn: () => api.transactions({ page: 1, account_id: accountId }) });
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const update = useMutation({ mutationFn: (isActive?: boolean) => api.updateAccount(accountId, isActive === undefined ? { name: name.trim() } : { is_active: isActive }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ["account", id] }); await client.invalidateQueries({ queryKey: ["accounts"] }); setError(null); }, onError: (reason: unknown) => setError(reason instanceof ApiError ? reason.message : "No se pudo actualizar la cuenta.") });
  if (account.isPending) return <ScreenMessage title="Cargando cuenta" detail="Un momento…" icon="hourglass-outline" />;
  if (account.isError) return <ScreenMessage title="No se pudo cargar la cuenta" detail="Deslizá hacia abajo para reintentar." />;
  const data = account.data;
  const currentName = name || data.name;
  return <SafeAreaFlatList style={commonStyles.page} contentContainerStyle={styles.content} data={transactions.data?.items ?? []} keyExtractor={item => String(item.id)} refreshControl={<RefreshControl refreshing={account.isRefetching || transactions.isRefetching} onRefresh={() => { void account.refetch(); void transactions.refetch(); }} />} ListHeaderComponent={<View style={styles.header}><Text style={styles.title}>{data.name}</Text><Text style={styles.currency}>{data.currency}</Text><Text style={styles.amount}>{formatMoney(data.current_balance, data.currency)}</Text><Text style={styles.muted}>Saldo calculado por el backend</Text><View style={styles.card}><Text style={styles.label}>Nombre de cuenta</Text><TextInput accessibilityLabel="Nombre de cuenta" style={commonStyles.input} value={currentName} onChangeText={setName} /><PrimaryButton label={update.isPending ? "Guardando…" : "Guardar nombre"} icon="checkmark" disabled={!name.trim() || name.trim() === data.name || update.isPending} onPress={() => update.mutate()} /><PrimaryButton label={data.is_active ? "Archivar cuenta" : "Reactivar cuenta"} icon={data.is_active ? "archive-outline" : "refresh-outline"} disabled={update.isPending} onPress={() => Alert.alert(data.is_active ? "¿Archivar cuenta?" : "¿Reactivar cuenta?", data.is_active ? "Conservará su historial y no podrá usarse en nuevos movimientos." : "Volverá a estar disponible para nuevos movimientos.", [{ text: "Cancelar", style: "cancel" }, { text: data.is_active ? "Archivar" : "Reactivar", onPress: () => update.mutate(!data.is_active) }])} />{error ? <Text style={styles.error}>{error}</Text> : null}</View><View><PrimaryButton label="Reconciliar saldo" icon="checkmark-circle-outline" onPress={() => router.push(`/account/reconcile?id=${accountId}`)} /></View><Text style={styles.heading}>Movimientos recientes</Text></View>} ListEmptyComponent={<View style={styles.empty}><Icon name="receipt-outline" size={28} color={colors.muted} /><Text style={styles.muted}>No hay movimientos asociados.</Text></View>} renderItem={({ item }) => <Link href={{ pathname: "/movement/[id]", params: { id: item.id } }} asChild><Pressable style={styles.item}><Text style={styles.itemTitle}>{item.description}</Text><Text style={styles.muted}>{formatDate(item.date)}</Text><Text style={styles.itemAmount}>{formatMoney(item.amount, data.currency)}</Text></Pressable></Link>} />;
}

const styles = StyleSheet.create({ content: { padding: spacing.lg, paddingBottom: spacing.xxl }, header: { gap: spacing.sm }, title: { color: colors.ink, fontSize: 26, fontWeight: "800" }, currency: { color: colors.muted }, amount: { color: colors.ink, fontSize: 32, fontWeight: "800", marginVertical: spacing.sm }, muted: { ...typography.muted }, card: { ...commonStyles.card, gap: spacing.md, marginVertical: spacing.lg }, label: { ...typography.label }, heading: { ...typography.heading, marginBottom: spacing.sm, marginTop: spacing.md }, item: { backgroundColor: colors.surface, borderRadius: radii.md, marginBottom: spacing.sm, padding: spacing.md }, itemTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" }, itemAmount: { color: colors.ink, fontSize: 14, fontWeight: "800", marginTop: spacing.xs }, empty: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderRadius: radii.md, gap: spacing.sm, marginTop: spacing.md, padding: spacing.xl }, error: { backgroundColor: colors.dangerSoft, borderRadius: radii.sm, color: colors.danger, padding: spacing.md } });
