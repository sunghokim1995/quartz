import type {
  FullSlug,
  QuartzComponent,
  QuartzComponentConstructor,
  QuartzPluginData,
} from "@quartz-community/types"
import { resolveRelative } from "@quartz-community/utils"
import React from "preact/compat"

void React

type ProjectStatus = "ongoing" | "completed" | "beta-test" | "unknown"

export interface ProjectExplorerMetadata {
  folderPath: string
  overviewSlug: string
  title: string
  status: ProjectStatus
}

interface ExplorerNode {
  isFolder: boolean
  slugSegment: string
  slugSegments?: string[]
  displayName?: string
}

const statusPriority: Record<ProjectStatus, number> = {
  ongoing: 0,
  completed: 1,
  "beta-test": 2,
  unknown: 3,
}

function normalizeProjectStatus(value: unknown): ProjectStatus {
  const status = String(value ?? "")
    .trim()
    .toLowerCase()
  if (status === "ongoing" || status === "completed" || status === "beta-test") {
    return status
  }
  return "unknown"
}

export function buildProjectExplorerMetadata(files: QuartzPluginData[]): ProjectExplorerMetadata[] {
  return files
    .flatMap((file) => {
      const slug = String(file.slug ?? "")
      const frontmatter = (file.frontmatter ?? {}) as Record<string, unknown>
      if (
        String(frontmatter.type ?? "").toLowerCase() !== "project" ||
        !slug.startsWith("projects/") ||
        !slug.endsWith("/overview")
      ) {
        return []
      }

      const status = normalizeProjectStatus(frontmatter.project_status)
      const projectSlug = slug.slice(0, -"/overview".length)
      return [
        {
          metadata: {
            folderPath: `${projectSlug}/index`,
            overviewSlug: slug,
            title: String(frontmatter.title ?? projectSlug),
            status,
          } satisfies ProjectExplorerMetadata,
          title: String(frontmatter.title ?? projectSlug),
        },
      ]
    })
    .sort(
      (a, b) =>
        statusPriority[a.metadata.status] - statusPriority[b.metadata.status] ||
        a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }),
    )
    .map(({ metadata }) => metadata)
}

// Explorer serializes this function and evaluates it in the browser, so it must remain self-contained.
export function compareResearchOSExplorerNodes(a: ExplorerNode, b: ExplorerNode): number {
  const rootPriority = ["home", "projects", "knowledge", "entities", "methods", "literature"]
  const aIndex = a.slugSegments?.length === 1 ? rootPriority.indexOf(a.slugSegment) : -1
  const bIndex = b.slugSegments?.length === 1 ? rootPriority.indexOf(b.slugSegment) : -1
  if (aIndex !== bIndex && (aIndex >= 0 || bIndex >= 0)) {
    return (
      (aIndex >= 0 ? aIndex : rootPriority.length) - (bIndex >= 0 ? bIndex : rootPriority.length)
    )
  }

  const aOverview =
    !a.isFolder &&
    a.slugSegment === "overview" &&
    a.slugSegments?.[0] === "projects" &&
    a.slugSegments.length === 3
  const bOverview =
    !b.isFolder &&
    b.slugSegment === "overview" &&
    b.slugSegments?.[0] === "projects" &&
    b.slugSegments.length === 3
  if (aOverview !== bOverview) return aOverview ? -1 : 1

  if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
  return String(a.displayName).localeCompare(String(b.displayName), undefined, {
    numeric: true,
    sensitivity: "base",
  })
}

interface ExplorerLayoutSet {
  defaults: { left?: unknown[] }
  byPageType: Record<string, { left?: unknown[] }>
}

export function attachExplorerRefinement(layouts: ExplorerLayoutSet, refinement: unknown): void {
  const sidebarLayouts = [layouts.defaults, ...Object.values(layouts.byPageType)]
  for (const layout of sidebarLayouts) {
    if (!layout.left || layout.left.length === 0 || layout.left.includes(refinement)) continue
    layout.left = [...layout.left, refinement]
  }
}

const explorerRefinementScript = `
function setupResearchOSExplorerRefinement() {
  const metadataElement = document.querySelector(
    ".researchos-explorer-metadata[data-researchos-projects]",
  )
  const explorer = document.querySelector("div.explorer")
  if (!metadataElement || !explorer) return
  if (explorer.dataset.researchosRefinementAttached === "true") return
  explorer.dataset.researchosRefinementAttached = "true"

  let projects = []
  try {
    projects = JSON.parse(
      decodeURIComponent(metadataElement.dataset.researchosProjects || "%5B%5D"),
    )
  } catch (error) {
    console.error("[ResearchOS Explorer] Invalid project metadata", error)
    return
  }

  const projectByPath = new Map(projects.map((project) => [project.folderPath, project]))
  const priorityByPath = new Map(projects.map((project, index) => [project.folderPath, index]))

  const applyRefinement = () => {
    const projectsContainer = explorer.querySelector(
      '.folder-container[data-folderpath="projects/index"]',
    )
    const projectList = projectsContainer?.nextElementSibling?.querySelector(":scope > ul")
    if (!projectList) return

    const savedPaths = new Set()
    try {
      const savedState = JSON.parse(localStorage.getItem("fileTree") || "[]")
      for (const item of savedState) {
        if (item && typeof item.path === "string") savedPaths.add(item.path)
      }
    } catch (error) {
      console.error("[ResearchOS Explorer] Invalid saved Explorer state", error)
    }

    const currentSlug = (document.body.dataset.slug || location.pathname)
      .replace(/^\\/+|\\/+$/g, "")
    const basepath = (document.body.dataset.basepath || "").replace(/\\/$/, "")
    const projectsListItem = projectsContainer.closest("li")
    let ongoingSection = explorer.querySelector(".researchos-ongoing-section")
    const ongoingTemplate = document.querySelector("template.researchos-ongoing-template")
    if (!ongoingSection && ongoingTemplate?.content.firstElementChild) {
      ongoingSection = ongoingTemplate.content.firstElementChild.cloneNode(true)
      projectsListItem?.before(ongoingSection)
    } else if (
      ongoingSection &&
      projectsListItem &&
      ongoingSection.nextElementSibling !== projectsListItem
    ) {
      projectsListItem.before(ongoingSection)
    }

    for (const link of ongoingSection?.querySelectorAll("a.researchos-ongoing-link") || []) {
      const projectSlug = link.dataset.projectPath
      const overviewSlug = link.dataset.overviewSlug
      const isCurrentProject =
        projectSlug && (currentSlug === projectSlug || currentSlug.startsWith(projectSlug + "/"))
      link.classList.toggle("is-current", Boolean(isCurrentProject))
      if (isCurrentProject) link.setAttribute("aria-current", "location")
      else link.removeAttribute("aria-current")
      if (overviewSlug) link.setAttribute("href", basepath + "/" + overviewSlug)
    }

    const projectItems = Array.from(projectList.children).filter((item) =>
      item.querySelector(":scope > .folder-container"),
    )
    const matchedItems = []

    for (const item of projectItems) {
      const container = item.querySelector(":scope > .folder-container")
      const folderPath = container?.dataset.folderpath
      const project = folderPath ? projectByPath.get(folderPath) : undefined
      if (!container || !folderPath || !project) continue

      matchedItems.push(item)
      item.dataset.projectStatus = project.status
      container.dataset.projectStatus = project.status

      const titleLink = container.querySelector("a.folder-button")
      if (titleLink) {
        const basepath = (document.body.dataset.basepath || "").replace(/\\/$/, "")
        titleLink.setAttribute("href", basepath + "/" + project.overviewSlug)
      }

      if (!savedPaths.has(folderPath)) {
        const children = container.nextElementSibling
        const projectSlug = folderPath.replace(/\\/index$/, "")
        const isCurrentProject =
          currentSlug === projectSlug || currentSlug.startsWith(projectSlug + "/")
        if (isCurrentProject) children?.classList.add("open")
        else children?.classList.remove("open")
      }
    }

    const sortedItems = [...matchedItems].sort(
      (a, b) =>
        priorityByPath.get(
          a.querySelector(":scope > .folder-container")?.dataset.folderpath,
        ) -
        priorityByPath.get(
          b.querySelector(":scope > .folder-container")?.dataset.folderpath,
        ),
    )
    if (sortedItems.some((item, index) => item !== matchedItems[index])) {
      for (const item of sortedItems) projectList.appendChild(item)
    }
  }

  applyRefinement()
  const observer = new MutationObserver(applyRefinement)
  observer.observe(explorer, { childList: true, subtree: true })
  window.addCleanup(() => {
    observer.disconnect()
    delete explorer.dataset.researchosRefinementAttached
  })
}

document.addEventListener("nav", setupResearchOSExplorerRefinement)
document.addEventListener("render", setupResearchOSExplorerRefinement)
`

const ExplorerRefinement: QuartzComponentConstructor = () => {
  const Component: QuartzComponent = ({ allFiles, fileData }) => {
    const projects = buildProjectExplorerMetadata(allFiles)
    if (projects.length === 0) return null
    const currentSlug = String(fileData.slug ?? "index")
    const ongoingProjects = projects.filter((project) => project.status === "ongoing")

    return (
      <>
        {ongoingProjects.length > 0 && (
          <template class="researchos-ongoing-template">
            <li class="researchos-ongoing-section">
              <div class="researchos-ongoing-heading">Ongoing</div>
              <ul class="researchos-ongoing-list">
                {ongoingProjects.map((project) => {
                  const projectSlug = project.folderPath.replace(/\/index$/, "")
                  const isCurrentProject =
                    currentSlug === projectSlug || currentSlug.startsWith(projectSlug + "/")
                  return (
                    <li>
                      <a
                        class={"researchos-ongoing-link" + (isCurrentProject ? " is-current" : "")}
                        href={resolveRelative(
                          currentSlug as FullSlug,
                          project.overviewSlug as FullSlug,
                        )}
                        data-project-path={projectSlug}
                        data-overview-slug={project.overviewSlug}
                        aria-current={isCurrentProject ? "location" : undefined}
                      >
                        {project.title}
                      </a>
                    </li>
                  )
                })}
              </ul>
            </li>
          </template>
        )}
        <div
          class="researchos-explorer-metadata"
          hidden
          data-researchos-projects={encodeURIComponent(JSON.stringify(projects))}
        />
      </>
    )
  }

  Component.afterDOMLoaded = explorerRefinementScript
  return Component
}

export default ExplorerRefinement
