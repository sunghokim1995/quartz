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
    return !(node.isFolder && node.slugSegments?.length === 1 && hidden.includes(node.slugSegment))
  },
  mapFn: (node: any) => {
    const labels: Record<string, string> = {
      projects: "프로젝트",
      inbox: "인박스",
      literature: "문헌",
      decisions: "결정",
      experiments: "실험",
      analyses: "분석",
      calculations: "계산",
      concepts: "개념",
      molecules: "분자",
      dashboard: "대시보드",
      workflows: "워크플로",
      playbooks: "플레이북",
    }
    if (node.isFolder && node.slugSegments?.length === 1 && labels[node.slugSegment]) {
      node.displayName = labels[node.slugSegment]
    }
    return node
  },
  sortFn: (a: any, b: any) => {
    const priority = [
      "projects",
      "inbox",
      "literature",
      "decisions",
      "experiments",
      "analyses",
      "calculations",
      "concepts",
      "molecules",
      "dashboard",
      "workflows",
      "playbooks",
    ]
    const aIndex = a.isFolder && a.slugSegments?.length === 1 ? priority.indexOf(a.slugSegment) : -1
    const bIndex = b.isFolder && b.slugSegments?.length === 1 ? priority.indexOf(b.slugSegment) : -1
    if (aIndex !== bIndex && (aIndex >= 0 || bIndex >= 0)) {
      return (aIndex >= 0 ? aIndex : priority.length) - (bIndex >= 0 ? bIndex : priority.length)
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
