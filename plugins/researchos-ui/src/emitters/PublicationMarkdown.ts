import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import type { FilePath, QuartzEmitterPlugin } from "@quartz-community/types"
import YAML from "yaml"
import { createRootRedirectHtml } from "./RootRedirect"

export interface PublicationDownloadPage {
  slug: string
  source: string
  frontmatter: Record<string, unknown> | undefined
}

const DOWNLOADABLE_TYPES = new Set([
  "project",
  "concept",
  "molecule",
  "question",
  "hypothesis",
  "evidence",
  "claim",
  "decision",
  "literature",
  "material",
  "method",
])

const FRONTMATTER_ALLOWLIST = [
  "type",
  "title",
  "status",
  "project_id",
  "id",
  "molecule_id",
  "project_status",
  "publication_status",
  "concept_type",
  "epistemic_status",
  "evidence_type",
  "question_status",
  "formula",
  "aliases",
  "related_projects",
] as const

const PROJECT_PUBLICATION_STATUSES = new Set(["none", "drafting", "submitted", "published"])

const WINDOWS_ABSOLUTE_PATH = /\b[A-Za-z]:\\(?:[^\\/:*?"<>|\s`]+\\)*[^\\/:*?"<>|\s`,;:!?)]*/g
const OWNER_CREDENTIAL = /OWNER(?:_TOKEN)?\s*[:=]\s*[^\s`]+/gi

export function normalizePublicText(value: string): string {
  return value
    .replace(WINDOWS_ABSOLUTE_PATH, (match) => {
      const basename = match.split("\\").at(-1) || "local artifact"
      return `[local artifact: ${basename}]`
    })
    .replace(OWNER_CREDENTIAL, "[redacted credential]")
}

function stripSourceFrontmatter(source: string): string {
  const normalized = source.replaceAll("\r\n", "\n")
  if (!normalized.startsWith("---\n")) return normalized

  const closingDelimiter = normalized.indexOf("\n---\n", 4)
  return closingDelimiter >= 0 ? normalized.slice(closingDelimiter + 5) : normalized
}

function normalizeRelatedProjects(value: unknown): string[] | undefined {
  const candidates = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : []
  const identifiers = candidates.map((item) => String(item).trim()).filter(Boolean)
  if (identifiers.length === 0) return undefined
  if (!identifiers.every((item) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(item))) return undefined
  return identifiers
}

function safeFrontmatter(
  frontmatter: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of FRONTMATTER_ALLOWLIST) {
    const value = frontmatter?.[key]
    if (value === undefined || value === null || value === "") continue

    if (key === "related_projects") {
      const projects = normalizeRelatedProjects(value)
      if (projects) result[key] = projects
      continue
    }

    if (
      key === "publication_status" &&
      String(frontmatter?.type ?? "").toLowerCase() === "project"
    ) {
      const publicationStatus = String(value).trim().toLowerCase()
      if (PROJECT_PUBLICATION_STATUSES.has(publicationStatus)) result[key] = publicationStatus
      continue
    }

    if (typeof value === "string") {
      result[key] = normalizePublicText(value)
    } else if (typeof value === "number" || typeof value === "boolean") {
      result[key] = value
    } else if (Array.isArray(value)) {
      result[key] = value
        .filter((item) => ["string", "number", "boolean"].includes(typeof item))
        .map((item) => (typeof item === "string" ? normalizePublicText(item) : item))
    }
  }
  return result
}

export function isDownloadableCanonical(frontmatter: Record<string, unknown> | undefined): boolean {
  const type = String(frontmatter?.type ?? "")
    .trim()
    .toLowerCase()
  const status = String(frontmatter?.status ?? "")
    .trim()
    .toLowerCase()
  const isPrivate =
    frontmatter?.private === true ||
    frontmatter?.internal === true ||
    frontmatter?.unlisted === true ||
    frontmatter?.password !== undefined

  return DOWNLOADABLE_TYPES.has(type) && status !== "draft" && !isPrivate
}

export function createPublicationMarkdown(
  source: string,
  frontmatter: Record<string, unknown> | undefined,
): string {
  const normalizedFrontmatter = YAML.stringify(safeFrontmatter(frontmatter), {
    lineWidth: 0,
  }).trimEnd()
  const body = normalizePublicText(stripSourceFrontmatter(source)).trimStart()
  return `---\n${normalizedFrontmatter}\n---\n${body.endsWith("\n") ? body : `${body}\n`}`
}

export async function writePublicationDownloads(
  outputDir: string,
  pages: PublicationDownloadPage[],
): Promise<string[]> {
  const resolvedOutput = path.resolve(outputDir)
  const downloadRoot = path.resolve(resolvedOutput, "downloads", "markdown")
  if (!downloadRoot.startsWith(`${resolvedOutput}${path.sep}`)) {
    throw new Error("Refusing to emit Markdown outside the Quartz output directory")
  }

  await rm(downloadRoot, { recursive: true, force: true })
  const written: string[] = []
  for (const page of [...pages].sort((a, b) => a.slug.localeCompare(b.slug))) {
    if (!isDownloadableCanonical(page.frontmatter)) continue

    const target = path.resolve(downloadRoot, `${page.slug}.md`)
    if (!target.startsWith(`${downloadRoot}${path.sep}`)) {
      throw new Error(`Unsafe Markdown download slug: ${page.slug}`)
    }

    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, createPublicationMarkdown(page.source, page.frontmatter), "utf8")
    written.push(target)
  }

  return written
}

export const PublicationArtifacts: QuartzEmitterPlugin = () => ({
  name: "ResearchOSPublicationArtifacts",
  async emit(ctx, content) {
    const pages: PublicationDownloadPage[] = content.map(([_tree, file]) => ({
      slug: String(file.data.slug ?? ""),
      source: String(file.value ?? ""),
      frontmatter: file.data.frontmatter as Record<string, unknown> | undefined,
    }))
    const markdownPaths = await writePublicationDownloads(ctx.argv.output, pages)
    const rootPath = path.resolve(ctx.argv.output, "index.html")
    await mkdir(path.dirname(rootPath), { recursive: true })
    await writeFile(rootPath, createRootRedirectHtml("/home"), "utf8")
    return [...markdownPaths, rootPath] as FilePath[]
  },
  async partialEmit(ctx, content) {
    const pages: PublicationDownloadPage[] = content.map(([_tree, file]) => ({
      slug: String(file.data.slug ?? ""),
      source: String(file.value ?? ""),
      frontmatter: file.data.frontmatter as Record<string, unknown> | undefined,
    }))
    const markdownPaths = await writePublicationDownloads(ctx.argv.output, pages)
    const rootPath = path.resolve(ctx.argv.output, "index.html")
    await mkdir(path.dirname(rootPath), { recursive: true })
    await writeFile(rootPath, createRootRedirectHtml("/home"), "utf8")
    return [...markdownPaths, rootPath] as FilePath[]
  },
})
