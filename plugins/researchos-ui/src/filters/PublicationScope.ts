import type { QuartzFilterPlugin } from "@quartz-community/types"

type Frontmatter = Record<string, unknown> | undefined

const PUBLISHED_DERIVED_VIEWS = new Set(["_views/completed research.md", "_views/publications.md"])

export function isPublicationCandidate(relativePath: string, frontmatter: Frontmatter): boolean {
  const normalizedPath = relativePath.replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase()
  const pathSegments = normalizedPath.split("/")
  const type = String(frontmatter?.type ?? "")
    .trim()
    .toLowerCase()
  const status = String(frontmatter?.status ?? "")
    .trim()
    .toLowerCase()
  const draft = frontmatter?.draft === true || frontmatter?.draft === "true"
  const explicitlyPrivate =
    frontmatter?.private === true ||
    frontmatter?.internal === true ||
    frontmatter?.publish === false ||
    frontmatter?.publish === "false"

  if (PUBLISHED_DERIVED_VIEWS.has(normalizedPath)) {
    return type === "view" && status === "active" && frontmatter?.generated === true
  }

  if (pathSegments.includes("_templates") || pathSegments.includes("_views")) return false
  if (type === "template" || type === "view") return false
  if (status === "draft" || draft || explicitlyPrivate) return false

  return true
}

export const PublicationScope: QuartzFilterPlugin = () => ({
  name: "ResearchOSPublicationScope",
  shouldPublish(_ctx, [_tree, file]) {
    return isPublicationCandidate(
      String(file.data.relativePath ?? file.data.filePath ?? ""),
      file.data.frontmatter,
    )
  },
})
