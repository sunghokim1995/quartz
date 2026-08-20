import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import { componentRegistry } from "./quartz/components/registry"

componentRegistry.setOptionOverrides("@quartz-community/explorer", {
  title: "탐색",
  order: ["filter", "map", "sort"],
  filterFn: (node: any) => {
    const hidden = [
      "raw",
      "templates",
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
    ]
    const segments = node.slugSegments ?? []
    const isProjectChild =
      segments.length === 4 &&
      segments[0] === "projects" &&
      ["ongoing", "completed", "beta-test"].includes(segments[1])

    if (node.isFolder && segments.length === 1 && hidden.includes(node.slugSegment)) {
      return false
    }

    // Keep the project overview and canonical containers, but hide direct technical support notes.
    return !isProjectChild || node.isFolder || node.slugSegment === "project"
  },
  mapFn: (node: any) => {
    const rootLabels: Record<string, string> = {
      projects: "프로젝트",
      concepts: "개념",
      experiments: "실험",
      analyses: "분석",
      literature: "문헌",
      inbox: "인박스",
      decisions: "결정",
      calculations: "계산",
      molecules: "분자",
      dashboard: "대시보드",
      workflows: "워크플로",
      playbooks: "플레이북",
    }
    const projectLabels: Record<string, string> = {
      ongoing: "진행 중 프로젝트",
      completed: "완료된 프로젝트",
      "beta-test": "베타 테스트 프로젝트",
    }
    const segments = node.slugSegments ?? []
    if (node.isFolder && node.slugSegments?.length === 1 && rootLabels[node.slugSegment]) {
      node.displayName = rootLabels[node.slugSegment]
    }
    if (
      node.isFolder &&
      node.slugSegments?.length === 2 &&
      node.slugSegments[0] === "projects" &&
      projectLabels[node.slugSegment]
    ) {
      node.displayName = projectLabels[node.slugSegment]
    }
    if (
      node.isFolder &&
      segments.length === 3 &&
      segments[0] === "projects" &&
      ["ongoing", "completed", "beta-test"].includes(segments[1])
    ) {
      const overview = node.children.find(
        (child: any) => !child.isFolder && child.slugSegment === "project",
      )
      const title = overview?.data?.title
      const projectId = overview?.data?.project_id
      node.displayName =
        (typeof title === "string" && title.trim()) ||
        (typeof projectId === "string" && projectId.trim()) ||
        node.slugSegment
    }
    if (
      !node.isFolder &&
      segments.length === 4 &&
      segments[0] === "projects" &&
      ["ongoing", "completed", "beta-test"].includes(segments[1]) &&
      node.slugSegment === "project"
    ) {
      node.displayName = "개요"
    }
    return node
  },
  sortFn: (a: any, b: any) => {
    const rootPriority = [
      "home",
      "projects",
      "concepts",
      "experiments",
      "analyses",
      "literature",
      "inbox",
      "decisions",
      "calculations",
      "molecules",
      "dashboard",
      "workflows",
      "playbooks",
    ]
    const projectPriority = ["ongoing", "completed", "beta-test"]
    const aIndex = a.slugSegments?.length === 1 ? rootPriority.indexOf(a.slugSegment) : -1
    const bIndex = b.slugSegments?.length === 1 ? rootPriority.indexOf(b.slugSegment) : -1
    if (aIndex !== bIndex && (aIndex >= 0 || bIndex >= 0)) {
      return (
        (aIndex >= 0 ? aIndex : rootPriority.length) - (bIndex >= 0 ? bIndex : rootPriority.length)
      )
    }
    const aProjectIndex =
      a.isFolder && a.slugSegments?.length === 2 && a.slugSegments[0] === "projects"
        ? projectPriority.indexOf(a.slugSegment)
        : -1
    const bProjectIndex =
      b.isFolder && b.slugSegments?.length === 2 && b.slugSegments[0] === "projects"
        ? projectPriority.indexOf(b.slugSegment)
        : -1
    if (aProjectIndex !== bProjectIndex && (aProjectIndex >= 0 || bProjectIndex >= 0)) {
      return (
        (aProjectIndex >= 0 ? aProjectIndex : projectPriority.length) -
        (bProjectIndex >= 0 ? bProjectIndex : projectPriority.length)
      )
    }
    if (a.isFolder !== b.isFolder) {
      return a.isFolder ? -1 : 1
    }
    return String(a.displayName).localeCompare(String(b.displayName), undefined, {
      numeric: true,
      sensitivity: "base",
    })
  },
})

const config = await loadQuartzConfig()

export default config
export const layout = await loadQuartzLayout()
