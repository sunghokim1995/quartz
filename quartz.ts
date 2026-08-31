import { componentRegistry } from "./quartz/components/registry"
import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import { PageTypes } from "./quartz/plugins"
import PageMetaActions from "./plugins/researchos-ui/src/components/PageMetaActions"
import ExplorerRefinement, {
  attachExplorerRefinement,
  compareResearchOSExplorerNodes,
} from "./plugins/researchos-ui/src/components/ExplorerRefinement"
import { PublicationArtifacts } from "./plugins/researchos-ui/src/emitters/PublicationMarkdown"
import { withRedirectFavicon } from "./plugins/researchos-ui/src/emitters/RootRedirect"
import { PublicationScope } from "./plugins/researchos-ui/src/filters/PublicationScope"
import { HomePage } from "./plugins/researchos-ui/src/pageTypes/HomePage"
import { CanonicalTitle } from "./plugins/researchos-ui/src/transformers/CanonicalTitle"
import { DerivedViewRoutes } from "./plugins/researchos-ui/src/transformers/DerivedViewRoutes"

componentRegistry.setOptionOverrides("@quartz-community/explorer", {
  title: "탐색",
  folderDefaultState: "collapsed",
  folderClickBehavior: "link",
  useSavedState: false,
  order: ["filter", "map", "sort"],
  filterFn: (node: any) => {
    const segments = node.slugSegments ?? []
    const hiddenSegments = new Set([
      "_templates",
      "_views",
      "raw",
      "samples",
      "instruments",
      "profile",
      "preferences",
      "principles",
      "goals",
      "ideas",
      "lessons",
      "failures",
      "tags",
    ])
    return !segments.some((segment: string) => hiddenSegments.has(segment.toLowerCase()))
  },
  mapFn: (node: any) => {
    const segments = node.slugSegments ?? []
    const rootLabels: Record<string, string> = {
      projects: "Projects",
      knowledge: "Knowledge",
      entities: "Entities",
      methods: "Methods",
      literature: "Literature",
    }
    const knowledgeLabels: Record<string, string> = {
      concepts: "Concepts",
      descriptors: "Descriptors",
      mechanisms: "Mechanisms",
      outcomes: "Outcomes",
      molecules: "Molecules",
    }

    if (node.isFolder && segments.length === 1 && rootLabels[node.slugSegment]) {
      node.displayName = rootLabels[node.slugSegment]
    }
    if (node.isFolder && segments.length >= 2 && knowledgeLabels[node.slugSegment]) {
      node.displayName = knowledgeLabels[node.slugSegment]
    }
    if (node.isFolder && segments.length === 2 && segments[0] === "projects") {
      const overview = node.children.find(
        (child: any) => !child.isFolder && child.slugSegment === "overview",
      )
      const title = overview?.data?.title
      if (typeof title === "string" && title.trim()) node.displayName = title.trim()
    }
    if (
      !node.isFolder &&
      segments.length === 3 &&
      segments[0] === "projects" &&
      node.slugSegment === "overview"
    ) {
      node.displayName = "Overview"
    }
    return node
  },
  sortFn: compareResearchOSExplorerNodes,
})

const config = await loadQuartzConfig()
const researchOSLayout = await loadQuartzLayout()
const pageMetaActions = PageMetaActions(undefined)
const explorerRefinement = ExplorerRefinement()

attachExplorerRefinement(researchOSLayout, explorerRefinement)

researchOSLayout.defaults.beforeBody = [
  ...(researchOSLayout.defaults.beforeBody ?? []),
  pageMetaActions,
]
researchOSLayout.byPageType.content = {
  ...researchOSLayout.byPageType.content,
  beforeBody: [
    ...(researchOSLayout.byPageType.content?.beforeBody ??
      researchOSLayout.defaults.beforeBody.slice(0, -1)),
    pageMetaActions,
  ],
}

config.plugins.transformers.push(DerivedViewRoutes(), CanonicalTitle())
config.plugins.filters.push(PublicationScope())
config.plugins.pageTypes ??= []
config.plugins.pageTypes.push(HomePage())
config.plugins.emitters = config.plugins.emitters.filter(
  (emitter) => emitter.name !== "PageTypeDispatcher",
)
config.plugins.emitters = config.plugins.emitters.map((emitter) =>
  emitter.name === "AliasRedirects" ? withRedirectFavicon(emitter) : emitter,
)
config.plugins.emitters.push(
  PageTypes.PageTypeDispatcher({
    defaults: researchOSLayout.defaults,
    byPageType: researchOSLayout.byPageType,
  }),
  PublicationArtifacts(),
)

export default config
export const layout = researchOSLayout
