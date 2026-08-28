import type { Element, Nodes, Root } from "hast"

function isInternalLink(node: Element): boolean {
  const className = node.properties.className
  const classes = Array.isArray(className)
    ? className.map(String)
    : String(className ?? "").split(" ")
  return node.tagName === "a" && classes.includes("internal")
}

function visit(node: Nodes, publishedSlugs: Set<string>): void {
  if (node.type === "element" && isInternalLink(node)) {
    const target = String(node.properties["data-slug"] ?? node.properties.dataSlug ?? "")
    if (target && !publishedSlugs.has(target)) {
      node.tagName = "span"
      node.properties = {
        className: ["unpublished-reference"],
        title: "발행 범위에 포함되지 않은 참조",
      }
    }
  }

  if ("children" in node) {
    for (const child of node.children) visit(child as Nodes, publishedSlugs)
  }
}

export function neutralizeUnpublishedLinks(tree: Root, publishedSlugs: Set<string>): void {
  visit(tree, publishedSlugs)
}
