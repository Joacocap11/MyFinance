import { StyleSheet } from "react-native";

export const colors = {
  background: "#f6f8fb",
  surface: "#ffffff",
  surfaceMuted: "#eef2f7",
  ink: "#122033",
  muted: "#66758a",
  border: "#dbe3ed",
  primary: "#2367d1",
  primarySoft: "#e8f0ff",
  success: "#147a4b",
  successSoft: "#e8f7ef",
  danger: "#b42318",
  dangerSoft: "#fff0ef",
  warning: "#9a6700",
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radii = { sm: 8, md: 12, lg: 18, pill: 999 } as const;
export const typography = StyleSheet.create({
  title: { color: colors.ink, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  heading: { color: colors.ink, fontSize: 19, fontWeight: "800" },
  body: { color: colors.ink, fontSize: 16 },
  label: { color: colors.muted, fontSize: 13, fontWeight: "700", letterSpacing: 0.2 },
  muted: { color: colors.muted, fontSize: 14 },
});

export const commonStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg, shadowColor: "#10233f", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  sectionTitle: { ...typography.heading, marginTop: spacing.sm },
  field: { gap: spacing.sm },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, color: colors.ink, fontSize: 16, minHeight: 52, paddingHorizontal: spacing.md },
});
