import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, commonStyles, radii, spacing, typography } from "./theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

export function Icon({ name, size = 22, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}

export function ScreenMessage({ title, detail, icon = "cloud-offline-outline" }: { title: string; detail?: string; icon?: IconName }) {
  return <View style={commonStyles.centered} accessibilityRole="alert"><Icon name={icon} size={38} color={colors.muted} /><Text style={styles.messageTitle}>{title}</Text>{detail ? <Text style={styles.messageDetail}>{detail}</Text> : null}</View>;
}

export function PrimaryButton({ label, onPress, disabled = false, icon = "arrow-forward-outline" as IconName }: { label: string; onPress: () => void; disabled?: boolean; icon?: IconName }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.primaryButton, disabled && styles.disabled, pressed && styles.pressed]}><Text style={styles.primaryText}>{label}</Text><Icon name={icon} size={19} color={colors.surface} /></Pressable>;
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <View style={styles.sectionHeader}><Text style={typography.heading}>{title}</Text>{action && onAction ? <Pressable accessibilityRole="button" onPress={onAction}><Text style={styles.action}>{action}</Text></Pressable> : null}</View>;
}

export const styles = StyleSheet.create({
  messageTitle: { ...typography.heading, marginTop: spacing.md, textAlign: "center" },
  messageDetail: { ...typography.muted, marginTop: spacing.sm, textAlign: "center" },
  primaryButton: { alignItems: "center", backgroundColor: colors.primary, borderRadius: radii.md, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 52, paddingHorizontal: spacing.lg },
  primaryText: { color: colors.surface, fontSize: 16, fontWeight: "800" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  action: { color: colors.primary, fontWeight: "800" },
});
