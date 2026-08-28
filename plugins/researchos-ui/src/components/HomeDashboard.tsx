import type { FullSlug, QuartzComponent, QuartzPluginData } from "@quartz-community/types"
import { resolveRelative } from "@quartz-community/utils"
import React from "preact/compat"

void React

type Frontmatter = Record<string, unknown>

interface DashboardLink {
  slug: string
  title: string
}

interface ProjectCard extends DashboardLink {
  projectId?: string
  status: "ongoing" | "submitted" | "beta-test"
  counts: {
    concepts: number
    molecules: number
  }
}

export interface HomeDashboardData {
  projects: {
    ongoing: ProjectCard[]
    submitted: ProjectCard[]
    betaTest: ProjectCard[]
  }
  concepts: {
    descriptor: DashboardLink[]
    mechanism: DashboardLink[]
    outcome: DashboardLink[]
  }
  moleculeCount: number
  literatureCount: number
  openQuestions: DashboardLink[]
}

function frontmatterOf(file: QuartzPluginData): Frontmatter {
  return (file.frontmatter ?? {}) as Frontmatter
}

function titleOf(file: QuartzPluginData): string {
  const frontmatter = frontmatterOf(file)
  return String(frontmatter.title ?? file.slug ?? "Untitled")
}

function countRelations(frontmatter: Frontmatter): ProjectCard["counts"] {
  const relations = Array.isArray(frontmatter.relations) ? frontmatter.relations : []
  let concepts = 0
  let molecules = 0
  for (const relation of relations) {
    if (!relation || typeof relation !== "object") continue
    const target = String((relation as Record<string, unknown>).target ?? "").toUpperCase()
    if (target.startsWith("CONCEPT-")) concepts += 1
    if (target.startsWith("MOL-")) molecules += 1
  }
  return { concepts, molecules }
}

function alphabetically<T extends DashboardLink>(items: T[]): T[] {
  return items.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }))
}

export function buildHomeDashboardData(files: QuartzPluginData[]): HomeDashboardData {
  const data: HomeDashboardData = {
    projects: { ongoing: [], submitted: [], betaTest: [] },
    concepts: { descriptor: [], mechanism: [], outcome: [] },
    moleculeCount: 0,
    literatureCount: 0,
    openQuestions: [],
  }

  for (const file of files) {
    if (!file.slug) continue
    const frontmatter = frontmatterOf(file)
    const type = String(frontmatter.type ?? "").toLowerCase()
    const status = String(frontmatter.status ?? "").toLowerCase()

    if (type === "project") {
      const projectStatus = String(frontmatter.project_status ?? "").toLowerCase()
      if (!["ongoing", "submitted", "beta-test"].includes(projectStatus)) continue
      const card: ProjectCard = {
        slug: String(file.slug),
        title: titleOf(file),
        projectId: frontmatter.project_id ? String(frontmatter.project_id) : undefined,
        status: projectStatus as ProjectCard["status"],
        counts: countRelations(frontmatter),
      }
      if (projectStatus === "ongoing") data.projects.ongoing.push(card)
      if (projectStatus === "submitted") data.projects.submitted.push(card)
      if (projectStatus === "beta-test") data.projects.betaTest.push(card)
    }

    if (type === "concept") {
      const conceptType = String(frontmatter.concept_type ?? "").toLowerCase()
      if (conceptType in data.concepts) {
        data.concepts[conceptType as keyof HomeDashboardData["concepts"]].push({
          slug: String(file.slug),
          title: titleOf(file),
        })
      }
    }

    if (type === "molecule") data.moleculeCount += 1
    if (type === "literature") data.literatureCount += 1
    if (type === "question" && status === "active") {
      data.openQuestions.push({ slug: String(file.slug), title: titleOf(file) })
    }
  }

  alphabetically(data.projects.ongoing)
  alphabetically(data.projects.submitted)
  alphabetically(data.projects.betaTest)
  alphabetically(data.concepts.descriptor)
  alphabetically(data.concepts.mechanism)
  alphabetically(data.concepts.outcome)
  data.openQuestions = alphabetically(data.openQuestions).slice(0, 6)
  return data
}

function href(from: string, to: string): string {
  return resolveRelative(from as FullSlug, to as FullSlug)
}

function ProjectSection({
  title,
  projects,
  fromSlug,
  empty,
}: {
  title: string
  projects: ProjectCard[]
  fromSlug: string
  empty?: string
}) {
  const sectionId = `section-${title.toLowerCase().replaceAll(" ", "-")}`
  return (
    <section class="researchos-home-section" aria-labelledby={sectionId}>
      <div class="researchos-section-heading">
        <h2 id={sectionId}>{title}</h2>
        <span>{projects.length}</span>
      </div>
      {projects.length > 0 ? (
        <div class="researchos-project-grid">
          {projects.map((project) => (
            <a class="researchos-project-card" href={href(fromSlug, project.slug)}>
              <span class={`researchos-badge researchos-badge-${project.status}`}>
                {project.status.toUpperCase()}
              </span>
              <h3>{project.title}</h3>
              {project.projectId && <code>{project.projectId}</code>}
              <dl>
                <div>
                  <dt>Concepts</dt>
                  <dd>{project.counts.concepts}</dd>
                </div>
                <div>
                  <dt>Molecules</dt>
                  <dd>{project.counts.molecules}</dd>
                </div>
              </dl>
            </a>
          ))}
        </div>
      ) : (
        <p class="researchos-empty-state">{empty ?? "등록된 프로젝트가 없습니다."}</p>
      )}
    </section>
  )
}

const HomeDashboard: QuartzComponent = ({ fileData, allFiles }) => {
  const fromSlug = String(fileData.slug ?? "home")
  const data = buildHomeDashboardData(allFiles)
  const conceptGroups = [
    ["Descriptors", data.concepts.descriptor],
    ["Mechanisms", data.concepts.mechanism],
    ["Outcomes", data.concepts.outcome],
  ] as const

  return (
    <main class="researchos-home" data-project-count={data.projects.ongoing.length}>
      <header class="researchos-hero">
        <p class="researchos-eyebrow">Scientific knowledge workspace</p>
        <h1>ResearchOS</h1>
        <p class="researchos-hero-copy">
          Projects, scientific objects, and evidence connected through one canonical research vault.
        </p>
      </header>

      <ProjectSection
        title="Ongoing Projects"
        projects={data.projects.ongoing}
        fromSlug={fromSlug}
      />
      <ProjectSection
        title="Submitted Projects"
        projects={data.projects.submitted}
        fromSlug={fromSlug}
      />
      <ProjectSection
        title="Beta-test"
        projects={data.projects.betaTest}
        fromSlug={fromSlug}
        empty="현재 beta-test 프로젝트가 없습니다."
      />

      <section class="researchos-home-section researchos-knowledge" aria-labelledby="knowledge">
        <div class="researchos-section-heading">
          <h2 id="knowledge">Knowledge</h2>
          <span>{Object.values(data.concepts).flat().length + data.moleculeCount}</span>
        </div>
        <div class="researchos-knowledge-grid">
          <article class="researchos-knowledge-card">
            <p class="researchos-card-kicker">Canonical concepts</p>
            <h3>Concepts</h3>
            {conceptGroups.map(([label, concepts]) => (
              <div class="researchos-concept-group">
                <strong>{label}</strong>
                <span>{concepts.length}</span>
                <ul>
                  {concepts.map((concept) => (
                    <li>
                      <a href={href(fromSlug, concept.slug)}>{concept.title}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </article>
          <a
            class="researchos-knowledge-card researchos-knowledge-link"
            href={href(fromSlug, "entities/molecules")}
          >
            <p class="researchos-card-kicker">Registered entities</p>
            <h3>Molecules</h3>
            <strong>{data.moleculeCount}</strong>
            <span>canonical molecule records</span>
          </a>
        </div>
      </section>

      <section class="researchos-home-section" aria-labelledby="open-questions">
        <div class="researchos-section-heading">
          <h2 id="open-questions">Open Questions</h2>
          <span>{data.openQuestions.length}</span>
        </div>
        <ol class="researchos-question-list">
          {data.openQuestions.map((question) => (
            <li>
              <a href={href(fromSlug, question.slug)}>{question.title}</a>
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}

export default HomeDashboard
