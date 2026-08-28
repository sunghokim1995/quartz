import type { QuartzComponent, QuartzComponentConstructor } from "@quartz-community/types"
import { pathToRoot } from "@quartz-community/utils"
import React from "preact/compat"
import { isDownloadableCanonical } from "../emitters/PublicationMarkdown"

void React

interface PresentationBadge {
  label: string
  axis: "research" | "publication" | "classification"
}

interface PagePresentation {
  badges: PresentationBadge[]
  metadata: string[]
  markdownPath: string
}

function textValue(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined
  const text = String(value).trim()
  return text || undefined
}

function badgeClass(badge: PresentationBadge): string {
  const variant = badge.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return variant
    ? `researchos-badge researchos-badge-${badge.axis} researchos-badge-${variant}`
    : `researchos-badge researchos-badge-${badge.axis}`
}

export function getPagePresentation(
  slug: string,
  frontmatter: Record<string, unknown> | undefined,
): PagePresentation | null {
  if (!isDownloadableCanonical(frontmatter)) return null

  const type = String(frontmatter?.type ?? "").toLowerCase()
  const badges: PresentationBadge[] = []
  const metadata: string[] = []
  const addBadge = (value: unknown, axis: PresentationBadge["axis"] = "classification") => {
    const text = textValue(value)
    if (text) badges.push({ label: text.toUpperCase(), axis })
  }
  const addMetadata = (value: unknown) => {
    const text = textValue(value)
    if (text) metadata.push(text)
  }

  if (type === "project") {
    addBadge(frontmatter?.project_status, "research")
    const publicationStatus = String(frontmatter?.publication_status ?? "none").toLowerCase()
    if (["drafting", "submitted", "published"].includes(publicationStatus)) {
      addBadge(publicationStatus, "publication")
    }
    addMetadata(frontmatter?.project_id)
  } else if (type === "concept") {
    addBadge(frontmatter?.concept_type)
    addMetadata(frontmatter?.id)
  } else if (type === "molecule") {
    addBadge(frontmatter?.molecule_id)
    addMetadata(frontmatter?.formula)
  } else {
    addBadge(type)
    addBadge(frontmatter?.epistemic_status ?? frontmatter?.evidence_type ?? frontmatter?.status)
    addMetadata(frontmatter?.question_status)
  }

  return {
    badges,
    metadata,
    markdownPath: `downloads/markdown/${slug}.md`,
  }
}

const printScript = `
function setupResearchOSPrintActions() {
  for (const button of document.querySelectorAll("[data-researchos-print]")) {
    const handlePrint = () => window.print()
    button.addEventListener("click", handlePrint)
    window.addCleanup(() => button.removeEventListener("click", handlePrint))
  }
}
document.addEventListener("nav", setupResearchOSPrintActions)
`

const PageMetaActions: QuartzComponentConstructor = () => {
  const Component: QuartzComponent = ({ fileData }) => {
    const slug = String(fileData.slug ?? "")
    const presentation = getPagePresentation(
      slug,
      fileData.frontmatter as Record<string, unknown> | undefined,
    )
    if (!presentation) return null

    const root = pathToRoot(fileData.slug!)
    const markdownHref = `${root}/${presentation.markdownPath}`
    const title = String(fileData.frontmatter?.title ?? slug.split("/").at(-1) ?? "page")
    const toc = Array.isArray(fileData.toc) ? fileData.toc : []

    return (
      <div class="researchos-page-meta-actions">
        <div class="researchos-object-meta" aria-label="페이지 분류와 식별자">
          {presentation.badges.map((badge) => (
            <span class={badgeClass(badge)} aria-label={`${badge.axis}: ${badge.label}`}>
              {badge.label}
            </span>
          ))}
          {presentation.metadata.map((item) => (
            <code>{item}</code>
          ))}
        </div>
        <div class="researchos-page-actions" aria-label="페이지 다운로드">
          <a href={markdownHref} download={`${title}.md`} aria-label={`${title} Markdown 다운로드`}>
            Markdown <span aria-hidden="true">↓</span>
          </a>
          <button
            type="button"
            data-researchos-print
            aria-label={`${title} PDF로 저장하기 위한 인쇄 대화상자 열기`}
            title="PDF로 저장(인쇄 대화상자)"
          >
            PDF / 인쇄
          </button>
        </div>
        {toc.length > 0 && (
          <details class="researchos-mobile-toc">
            <summary>On this page</summary>
            <nav aria-label="모바일 목차">
              <ol>
                {toc.map((entry) => (
                  <li class={`depth-${entry.depth}`}>
                    <a href={`#${entry.slug}`}>{entry.text}</a>
                  </li>
                ))}
              </ol>
            </nav>
          </details>
        )}
      </div>
    )
  }

  Component.afterDOMLoaded = printScript
  return Component
}

export default PageMetaActions
