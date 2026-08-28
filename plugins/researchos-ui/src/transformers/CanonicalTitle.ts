import type { Element, Nodes, Root, Text } from "hast"
import type { QuartzTransformerPlugin } from "@quartz-community/types"
import { normalizePublicText } from "../emitters/PublicationMarkdown"

function isElement(node: Nodes): node is Element {
  return node.type === "element"
}

function textContent(node: Nodes): string {
  if (node.type === "text") return node.value
  if ("children" in node) return node.children.map((child) => textContent(child as Nodes)).join("")
  return ""
}

function normalizeTitle(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase()
}

function sanitizeTextNodes(node: Nodes): void {
  if (node.type === "text") {
    ;(node as Text).value = normalizePublicText(node.value)
    return
  }
  if ("children" in node) {
    for (const child of node.children) sanitizeTextNodes(child as Nodes)
  }
}

export function sanitizeRenderedContent(tree: Root, title: string): void {
  const firstH1 = tree.children.findIndex(
    (node) => isElement(node as Nodes) && (node as Element).tagName === "h1",
  )
  if (firstH1 >= 0) {
    const candidate = tree.children[firstH1] as Element
    if (normalizeTitle(textContent(candidate)) === normalizeTitle(title)) {
      tree.children.splice(firstH1, 1)
    }
  }

  sanitizeTextNodes(tree)
}

export const CanonicalTitle: QuartzTransformerPlugin = () => ({
  name: "ResearchOSCanonicalTitle",
  htmlPlugins() {
    return [
      () => (tree, file) => {
        const title = String(file.data.frontmatter?.title ?? "")
        sanitizeRenderedContent(tree, title)
        if (
          Array.isArray(file.data.toc) &&
          file.data.toc.length > 0 &&
          normalizeTitle(String(file.data.toc[0]?.text ?? "")) === normalizeTitle(title)
        ) {
          file.data.toc = file.data.toc.slice(1)
        }
        if (typeof file.data.text === "string") {
          file.data.text = normalizePublicText(file.data.text)
        }
        if (typeof file.data.description === "string") {
          file.data.description = normalizePublicText(file.data.description)
        }
      },
    ]
  },
})
