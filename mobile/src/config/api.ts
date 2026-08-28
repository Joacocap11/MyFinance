const configuredUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

if (!configuredUrl && process.env.NODE_ENV !== "test") {
  throw new Error("EXPO_PUBLIC_API_BASE_URL is required");
}

export const API_BASE_URL = (configuredUrl ?? "").replace(/\/$/, "");
