import type { QuartzPageTypePlugin } from "@quartz-community/types"
import HomeDashboard from "../components/HomeDashboard"
import { neutralizeUnpublishedLinks } from "../transformers/PublicationLinks"

export const HomePage: QuartzPageTypePlugin = () => ({
  name: "ResearchOSHomePage",
  priority: 100,
  match: ({ fileData }) => String(fileData.frontmatter?.type ?? "").toLowerCase() === "home",
  layout: "home",
  frame: "full-width",
  body: () => HomeDashboard,
  treeTransforms: () => [
    (tree, _slug, componentData) => {
      const publishedSlugs = new Set<string>()
      for (const file of componentData.allFiles) {
        const slug = String(file.slug ?? "")
        if (!slug) continue
        publishedSlugs.add(slug)
        if (slug.endsWith("/index")) publishedSlugs.add(slug.slice(0, -6))
      }
      neutralizeUnpublishedLinks(tree, publishedSlugs)
    },
  ],
})
