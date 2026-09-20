/**
 * Development-only preview viewer gate.
 *
 * Both flags are explicit opt-ins that no deployment sets: fixtures must be on,
 * and so must the preview flag. Shared by the proxy, server pages and
 * `services/index.ts`, which is why it reads a plain env record.
 */
type EnvLike = Partial<Record<string, string | undefined>>;

export function previewViewerEnabled(env: EnvLike = process.env): boolean {
  return env.NEXT_PUBLIC_KOVA_DATA_SOURCE === "fixtures" && env.NEXT_PUBLIC_KOVA_PREVIEW_VIEWER === "1";
}
