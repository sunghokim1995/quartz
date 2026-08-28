import type { QuartzTransformerPlugin } from "@quartz-community/types"

const DERIVED_VIEW_ROUTES = new Map([
  ["_views/completed research.md", "completed-research"],
  ["_views/publications.md", "publications"],
])

export function derivedViewRoute(relativePath: string): string | null {
  const normalizedPath = relativePath.replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase()
  return DERIVED_VIEW_ROUTES.get(normalizedPath) ?? null
}

export const DerivedViewRoutes: QuartzTransformerPlugin = () => ({
  name: "ResearchOSDerivedViewRoutes",
  markdownPlugins() {
    return [
      () => (_tree, file) => {
        const route = derivedViewRoute(String(file.data.relativePath ?? file.data.filePath ?? ""))
        if (route) file.data.slug = route as typeof file.data.slug
      },
    ]
  },
})
