import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import test from "node:test"
import { build } from "esbuild"
import { sassPlugin } from "esbuild-sass-plugin"
import { transform } from "lightningcss"
import render from "preact-render-to-string"

const execFileAsync = promisify(execFile)

async function compileVisualCss() {
  const result = await build({
    entryPoints: [path.resolve("quartz/styles/custom.scss")],
    bundle: true,
    write: false,
    plugins: [sassPlugin()],
  })
  const compiledCss = result.outputFiles[0]?.text ?? ""
  return transform({ code: Buffer.from(compiledCss) }).code.toString()
}

test("compiled dark materials use the fixed palette and distinct Liquid Glass depth", async () => {
  const css = await compileVisualCss()

  for (const [token, value] of [
    ["--ros-graphite", "#18171d"],
    ["--ros-silver", "#b3b3ba"],
    ["--ros-cobalt", "#1c28c7"],
  ]) {
    assert.match(css, new RegExp(`${token}:\\s*${value}`), token)
  }

  for (const token of [
    "--ros-bg-elevated",
    "--ros-glass-thin",
    "--ros-glass-regular",
    "--ros-glass-strong",
    "--ros-accent-soft",
    "--ros-text-primary",
    "--ros-text-secondary",
    "--ros-glass-saturation",
  ]) {
    assert.match(css, new RegExp(`${token}:`), token)
  }

  assert.match(css, /body\s*\{[^}]*background-image:\s*var\(--ros-ambient-light\)/s)
  assert.match(
    css,
    /\.sidebar\.right\s*>\s*\.toc[^{]*\{[^}]*background:\s*var\(--ros-glass-strong\)/s,
  )
  assert.match(
    css,
    /\.researchos-page-meta-actions[^{]*\{[^}]*background:\s*var\(--ros-glass-regular\)/s,
  )
  assert.match(css, /\.explorer-content a[^}]*background:\s*var\(--ros-accent-soft\)/s)
  assert.match(css, /\.researchos-badge-ongoing[^{]*\{[^}]*var\(--ros-cobalt\)/s)
  assert.match(css, /\.researchos-badge-completed[^{]*\{/s)
  assert.match(css, /\.researchos-badge-beta-test[^{]*\{/s)
  assert.match(css, /\.researchos-badge-publication[^{]*\{/s)
  assert.match(css, /\.researchos-badge-published[^{]*\{/s)
  assert.doesNotMatch(css, /\.researchos-badge-accepted[^{]*\{/s)
  assert.match(css, /@media\s+print[\s\S]*background:\s*#fff\s*!important/)
})

test("compiled UI accents share the BDFE_min semantic accent without dusty theme colors", async () => {
  const css = await compileVisualCss()
  const { default: YAML } = await import("yaml")
  const quartzConfig = YAML.parse(await readFile("quartz.config.yaml", "utf8"))

  assert.match(
    css,
    /--ros-accent:\s*color-mix\(in srgb,\s*var\(--ros-cobalt\) 38%,\s*var\(--ros-text-primary\)\)/,
  )
  assert.match(css, /--secondary:\s*var\(--ros-accent\)/)
  assert.match(css, /--tertiary:\s*var\(--ros-accent-hover\)/)
  assert.match(css, /\.page-title a[^{]*\{[^}]*color:\s*var\(--ros-accent\)/s)
  assert.match(css, /\.breadcrumb-container a[^{]*\{[^}]*color:\s*var\(--ros-accent\)/s)
  assert.match(css, /\.backlinks a[^{]*\{[^}]*color:\s*var\(--ros-accent\)/s)
  assert.match(
    css,
    /article a\.internal\[href\*="\/concepts\/"\][^{]*\{[^}]*color:\s*var\(--ros-accent\)/s,
  )

  for (const mode of ["lightMode", "darkMode"]) {
    assert.equal(quartzConfig.configuration.theme.colors[mode].secondary.toLowerCase(), "#1c28c7")
    assert.equal(quartzConfig.configuration.theme.colors[mode].tertiary.toLowerCase(), "#1c28c7")
  }
})

test("compiled visual system separates material content from accessible functional glass", async () => {
  const css = await compileVisualCss()

  for (const token of [
    "--ros-bg-deep",
    "--ros-material-bg",
    "--ros-glass-bg",
    "--ros-glass-border",
    "--ros-glass-highlight",
    "--ros-glass-shadow",
    "--ros-glass-radius",
    "--ros-glass-blur",
  ]) {
    assert.match(css, new RegExp(`${token}:`), token)
  }

  assert.match(css, /\.researchos-project-card[^{]*\{[^}]*background:\s*var\(--ros-material-bg\)/s)
  assert.doesNotMatch(css, /\.researchos-project-card[^{]*\{[^}]*backdrop-filter:/s)
  assert.match(css, /\.researchos-page-meta-actions[^{]*\{[^}]*backdrop-filter:/s)
  assert.match(css, /\.sidebar\.right\s*>\s*\.toc[^{]*\{[^}]*backdrop-filter:/s)
  assert.match(css, /(?<!-webkit-)backdrop-filter:/)
  assert.match(css, /prefers-reduced-transparency:\s*reduce/)
  assert.match(css, /@supports\s+not[^\{]*backdrop-filter/)
  assert.match(
    css,
    /@media\s*\(width\s*<=\s*799px\)[\s\S]*?\.researchos-page-meta-actions\s*\{[^}]*backdrop-filter:\s*none/s,
  )
  assert.match(
    css,
    /@media\s*\(width\s*<=\s*799px\)[\s\S]*?\.researchos-page-actions a[^{]*\{[^}]*backdrop-filter:/s,
  )
  assert.match(css, /@media\s+print[\s\S]*backdrop-filter:\s*none\s*!important/)
  assert.match(css, /@media\s+print[\s\S]*box-shadow:\s*none\s*!important/)
})

test("publication scope excludes utility and draft pages while retaining canonical content", async () => {
  const { isPublicationCandidate } = await import("./src/filters/PublicationScope.ts")

  const cases = [
    { path: "_templates/Project.md", frontmatter: { type: "template" }, want: false },
    { path: "_views/Projects.md", frontmatter: { type: "view", generated: true }, want: false },
    {
      path: "_views/Completed Research.md",
      frontmatter: { type: "view", status: "active", generated: true },
      want: true,
    },
    {
      path: "_views/Publications.md",
      frontmatter: { type: "view", status: "active", generated: true },
      want: true,
    },
    {
      path: "_views/Active Research.md",
      frontmatter: { type: "view", status: "active", generated: true },
      want: false,
    },
    { path: "Ideas/Maybe.md", frontmatter: { type: "idea", status: "draft" }, want: false },
    {
      path: "Home.md",
      frontmatter: { type: "home", status: "active", generated: true },
      want: true,
    },
    {
      path: "Projects/EMS-LHCE Electrolyte/Overview.md",
      frontmatter: { type: "project", status: "active", project_status: "ongoing" },
      want: true,
    },
  ] as const

  for (const fixture of cases) {
    assert.equal(
      isPublicationCandidate(fixture.path, fixture.frontmatter),
      fixture.want,
      fixture.path,
    )
  }
})

test(
  "production build projects only the two allowlisted canonical views onto clean routes",
  { timeout: 120_000 },
  async () => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), "researchos-view-fixture-"))
    const outputRoot = await mkdtemp(path.join(tmpdir(), "researchos-view-output-"))

    try {
      await mkdir(path.join(fixtureRoot, "_views"), { recursive: true })
      await mkdir(path.join(fixtureRoot, "Projects", "Synthetic Published"), { recursive: true })
      await writeFile(
        path.join(fixtureRoot, "Home.md"),
        "---\ntype: home\ntitle: Home\nstatus: active\ngenerated: true\n---\n# Home\n",
      )
      await writeFile(
        path.join(fixtureRoot, "Projects", "Synthetic Published", "Overview.md"),
        "---\ntype: project\nproject_id: synthetic-published\ntitle: Synthetic Published\nstatus: active\nproject_status: completed\npublication_status: published\n---\n# Synthetic Published\n",
      )
      await writeFile(
        path.join(fixtureRoot, "_views", "Completed Research.md"),
        "---\ntype: view\ntitle: Completed Research\nstatus: active\ngenerated: true\n---\n# Completed Research\n\n- [[Projects/Synthetic Published/Overview|Synthetic Published]]\n",
      )
      await writeFile(
        path.join(fixtureRoot, "_views", "Publications.md"),
        "---\ntype: view\ntitle: Publications\nstatus: active\ngenerated: true\n---\n# Publications\n\n## PUBLISHED\n\n- [[Projects/Synthetic Published/Overview|Synthetic Published]]\n",
      )
      await writeFile(
        path.join(fixtureRoot, "_views", "Active Research.md"),
        "---\ntype: view\ntitle: Active Research\nstatus: active\ngenerated: true\n---\n# Active Research\n\nC:\\private\\must-not-publish.txt\n",
      )

      await execFileAsync(
        process.execPath,
        [
          "quartz/bootstrap-cli.mjs",
          "build",
          "--concurrency",
          "1",
          "-d",
          fixtureRoot,
          "-o",
          outputRoot,
        ],
        { cwd: path.resolve("."), maxBuffer: 10 * 1024 * 1024 },
      )

      const completed = await readFile(path.join(outputRoot, "completed-research.html"), "utf8")
      const publications = await readFile(path.join(outputRoot, "publications.html"), "utf8")
      assert.match(completed, /Completed Research/)
      assert.match(completed, /Synthetic Published/)
      assert.match(publications, /Publications/)
      assert.match(publications, /PUBLISHED/)
      await assert.rejects(access(path.join(outputRoot, "active-research.html")))
      await assert.rejects(access(path.join(outputRoot, "_views")))

      const publicText = `${completed}\n${publications}`
      assert.doesNotMatch(publicText, /C:\\private|must-not-publish/)
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true })
      await rm(outputRoot, { recursive: true, force: true })
    }
  },
)

test("Markdown downloads include only public canonical page types", async () => {
  const { isDownloadableCanonical } = await import("./src/emitters/PublicationMarkdown.ts")

  assert.equal(isDownloadableCanonical({ type: "project", status: "active" }), true)
  assert.equal(isDownloadableCanonical({ type: "concept", status: "active" }), true)
  assert.equal(isDownloadableCanonical({ type: "home", status: "active" }), false)
  assert.equal(isDownloadableCanonical({ type: "view", status: "active" }), false)
  assert.equal(isDownloadableCanonical({ type: "project", status: "draft" }), false)
  assert.equal(isDownloadableCanonical({ type: "project", status: "active", private: true }), false)
})

test("normalized Markdown exposes only allowlisted frontmatter", async () => {
  const { createPublicationMarkdown } = await import("./src/emitters/PublicationMarkdown.ts")
  const output = createPublicationMarkdown(
    "---\ntitle: Original\nlegacy_path: C:\\\\private\\source.md\n---\n# Original\n\nBody.\n",
    {
      type: "project",
      title: "Original",
      status: "active",
      project_id: "published-project",
      project_status: "completed",
      publication_status: "published",
      related_projects: "project-one, project-two",
      legacy_path: "C:\\private\\source.md",
      imported_at: "2026-01-01",
      source_refs: ["secret"],
      password: "do-not-publish",
    },
  )

  assert.match(
    output,
    /^---\ntype: project\ntitle: Original\nstatus: active\nproject_id: published-project\nproject_status: completed\npublication_status: published\n/,
  )
  assert.match(output, /related_projects:\n  - project-one\n  - project-two/)
  assert.doesNotMatch(output, /legacy_path|imported_at|source_refs|password|C:\\/i)
})

test("normalized Project Markdown omits a non-canonical accepted publication status", async () => {
  const { createPublicationMarkdown } = await import("./src/emitters/PublicationMarkdown.ts")
  const output = createPublicationMarkdown("# Invalid lifecycle\n", {
    type: "project",
    title: "Invalid lifecycle",
    status: "active",
    project_status: "ongoing",
    publication_status: "accepted",
  })

  assert.doesNotMatch(output, /^publication_status:/m)
})

test("normalized Markdown preserves scientific syntax and redacts machine-local locators", async () => {
  const { createPublicationMarkdown } = await import("./src/emitters/PublicationMarkdown.ts")
  const source = [
    "---",
    "type: evidence",
    "title: Result",
    "---",
    "# Result",
    "",
    "| axis | concept |",
    "| --- | --- |",
    "| x | [[Knowledge/Concepts/X\\|X]] |",
    "",
    "$$E = mc^2$$",
    "",
    "Original artifact: `C:\\calc\\ex_verdict6.json`.",
    "Credential: `OWNER_TOKEN=super-secret`.",
    "",
  ].join("\n")
  const output = createPublicationMarkdown(source, {
    type: "evidence",
    title: "Result",
    status: "active",
  })

  assert.match(output, /\| x \| \[\[Knowledge\/Concepts\/X\\\|X\]\] \|/)
  assert.match(output, /\$\$E = mc\^2\$\$/)
  assert.match(output, /\[local artifact: ex_verdict6\.json\]/)
  assert.doesNotMatch(output, /C:\\|super-secret|OWNER_TOKEN/)
})

test("Markdown emission removes stale downloads and writes only current canonical pages", async () => {
  const { writePublicationDownloads } = await import("./src/emitters/PublicationMarkdown.ts")
  const outputDir = await mkdtemp(path.join(tmpdir(), "researchos-ui-"))

  try {
    const downloadDir = path.join(outputDir, "downloads", "markdown")
    await mkdir(downloadDir, { recursive: true })
    const stalePath = path.join(downloadDir, "stale.md")
    await writeFile(stalePath, "stale")

    const written = await writePublicationDownloads(outputDir, [
      {
        slug: "projects/current",
        source: "# Current\n",
        frontmatter: { type: "project", title: "Current", status: "active" },
      },
      {
        slug: "home",
        source: "# Home\n",
        frontmatter: { type: "home", title: "Home", status: "active" },
      },
    ])

    assert.deepEqual(
      written.map((item) => path.relative(outputDir, item).replaceAll("\\", "/")),
      ["downloads/markdown/projects/current.md"],
    )
    await assert.rejects(access(stalePath))
    assert.match(await readFile(written[0], "utf8"), /title: Current/)
  } finally {
    await rm(outputDir, { recursive: true, force: true })
  }
})

test("root redirect is static and points to the canonical Home route", async () => {
  const { createRootRedirectHtml } = await import("./src/emitters/RootRedirect.ts")
  const html = createRootRedirectHtml("/home")

  assert.match(html, /http-equiv="refresh" content="0; url=\/home"/)
  assert.match(html, /rel="canonical" href="\/home"/)
  assert.doesNotMatch(html, /<script/i)
})

test("render sanitization removes only a first H1 that duplicates the frontmatter title", async () => {
  const { sanitizeRenderedContent } = await import("./src/transformers/CanonicalTitle.ts")
  const tree = {
    type: "root",
    children: [
      { type: "text", value: "\n" },
      {
        type: "element",
        tagName: "h1",
        properties: {},
        children: [{ type: "text", value: "Project A" }],
      },
      {
        type: "element",
        tagName: "h2",
        properties: {},
        children: [{ type: "text", value: "Scope" }],
      },
    ],
  }

  sanitizeRenderedContent(tree as never, "  Project   A ")

  assert.equal(
    tree.children.some((child) => "tagName" in child && child.tagName === "h1"),
    false,
  )
  assert.equal(
    tree.children.some((child) => "tagName" in child && child.tagName === "h2"),
    true,
  )

  const distinctTree = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "h1",
        properties: {},
        children: [{ type: "text", value: "Different" }],
      },
    ],
  }
  sanitizeRenderedContent(distinctTree as never, "Project A")
  assert.equal(distinctTree.children.length, 1)
})

test("render sanitization preserves artifact identity but removes its absolute locator", async () => {
  const { sanitizeRenderedContent } = await import("./src/transformers/CanonicalTitle.ts")
  const tree = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "p",
        properties: {},
        children: [
          { type: "text", value: "Source " },
          {
            type: "element",
            tagName: "code",
            properties: {},
            children: [{ type: "text", value: "C:\\calc\\ex_verdict6.json" }],
          },
        ],
      },
    ],
  }

  sanitizeRenderedContent(tree as never, "Evidence")
  const serialized = JSON.stringify(tree)
  assert.match(serialized, /local artifact: ex_verdict6\.json/)
  assert.doesNotMatch(serialized, /C:\\\\calc/)
})

test("Home dashboard groups build-time canonical data without body scraping", async () => {
  const { buildHomeDashboardData } = await import("./src/components/HomeDashboard.tsx")
  const files = [
    ...["A", "B", "C", "D"].map((title, index) => ({
      slug: `projects/${title.toLowerCase()}`,
      frontmatter: {
        type: "project",
        title,
        project_id: `project-${index}`,
        project_status: "ongoing",
        relations:
          index === 0
            ? [
                { type: "uses", target: "CONCEPT-D-0001" },
                { type: "related_to", target: "MOL-0001" },
              ]
            : [],
      },
    })),
    ...["E", "F"].map((title, index) => ({
      slug: `projects/${title.toLowerCase()}`,
      frontmatter: {
        type: "project",
        title,
        project_id: `completed-${index}`,
        project_status: "completed",
        publication_status: "published",
      },
    })),
    {
      slug: "knowledge/concepts/descriptor",
      frontmatter: { type: "concept", title: "Descriptor", concept_type: "descriptor" },
    },
    {
      slug: "knowledge/concepts/mechanism",
      frontmatter: { type: "concept", title: "Mechanism", concept_type: "mechanism" },
    },
    {
      slug: "entities/molecules/mol-1",
      frontmatter: { type: "molecule", title: "Molecule", molecule_id: "MOL-0001" },
    },
    ...Array.from({ length: 7 }, (_, index) => ({
      slug: `research/questions/q-${index}`,
      frontmatter: {
        type: "question",
        title: `Question ${index}`,
        status: index === 6 ? "resolved" : "active",
      },
    })),
    {
      slug: "_templates/literature",
      frontmatter: { type: "template", title: "Literature", status: "draft" },
    },
  ]

  const data = buildHomeDashboardData(files as never[])

  assert.equal(data.projects.ongoing.length, 4)
  assert.equal(data.projects.completed.length, 2)
  assert.equal(data.projects.betaTest.length, 0)
  assert.deepEqual(data.projects.ongoing[0].counts, { concepts: 1, molecules: 1 })
  assert.equal(data.projects.ongoing[0].publicationStatus, "none")
  assert.equal(data.projects.completed[0].publicationStatus, "published")
  assert.equal(data.concepts.descriptor.length, 1)
  assert.equal(data.concepts.mechanism.length, 1)
  assert.equal(data.concepts.outcome.length, 0)
  assert.equal(data.moleculeCount, 1)
  assert.equal(data.openQuestions.length, 6)
  assert.equal(data.literatureCount, 0)

  const invalidPublication = buildHomeDashboardData([
    {
      slug: "projects/invalid-publication",
      frontmatter: {
        type: "project",
        title: "Invalid publication",
        project_id: "invalid-publication",
        project_status: "ongoing",
        publication_status: "accepted",
      },
    },
  ] as never[])
  assert.equal(invalidPublication.projects.ongoing[0].publicationStatus, "none")
})

test("Explorer project metadata derives status-first navigation from canonical frontmatter", async () => {
  const { buildProjectExplorerMetadata } = await import("./src/components/ExplorerRefinement.tsx")
  const files = [
    {
      slug: "projects/beta/overview",
      frontmatter: { type: "project", title: "Beta", project_status: "completed" },
    },
    {
      slug: "projects/zeta/overview",
      frontmatter: { type: "project", title: "Zeta", project_status: "ongoing" },
    },
    {
      slug: "projects/alpha/overview",
      frontmatter: { type: "project", title: "Alpha", project_status: "ongoing" },
    },
    {
      slug: "projects/gamma/overview",
      frontmatter: { type: "project", title: "Gamma", project_status: "beta-test" },
    },
    {
      slug: "projects/omega/overview",
      frontmatter: { type: "project", title: "Omega", project_status: "unmapped" },
    },
    {
      slug: "knowledge/concepts/descriptor",
      frontmatter: { type: "concept", title: "Descriptor" },
    },
  ]

  assert.deepEqual(buildProjectExplorerMetadata(files as never[]), [
    {
      folderPath: "projects/alpha/index",
      overviewSlug: "projects/alpha/overview",
      title: "Alpha",
      status: "ongoing",
    },
    {
      folderPath: "projects/zeta/index",
      overviewSlug: "projects/zeta/overview",
      title: "Zeta",
      status: "ongoing",
    },
    {
      folderPath: "projects/beta/index",
      overviewSlug: "projects/beta/overview",
      title: "Beta",
      status: "completed",
    },
    {
      folderPath: "projects/gamma/index",
      overviewSlug: "projects/gamma/overview",
      title: "Gamma",
      status: "beta-test",
    },
    {
      folderPath: "projects/omega/index",
      overviewSlug: "projects/omega/overview",
      title: "Omega",
      status: "unknown",
    },
  ])
})

test("Explorer quick access renders canonical ongoing projects as direct Overview links", async () => {
  const { default: ExplorerRefinement } = await import("./src/components/ExplorerRefinement.tsx")
  const Component = ExplorerRefinement()
  const html = render(
    Component({
      ctx: {},
      externalResources: { css: [], js: [], additionalHead: [] },
      cfg: {},
      children: [],
      tree: { type: "root", children: [] },
      fileData: { slug: "projects/zeta/overview" },
      allFiles: [
        {
          slug: "projects/beta/overview",
          frontmatter: { type: "project", title: "Beta", project_status: "completed" },
        },
        {
          slug: "projects/zeta/overview",
          frontmatter: { type: "project", title: "Zeta", project_status: "ongoing" },
        },
        {
          slug: "projects/alpha/overview",
          frontmatter: { type: "project", title: "Alpha", project_status: "ongoing" },
        },
      ],
    } as never),
  )

  assert.match(html, /<template class="researchos-ongoing-template">/)
  assert.match(html, /class="researchos-ongoing-heading"[^>]*>Ongoing<\/div>/)
  assert.match(
    html,
    /<a(?=[^>]*class="researchos-ongoing-link")(?=[^>]*href="\.\.\/\.\.\/projects\/alpha\/overview")[^>]*>Alpha<\/a>/,
  )
  assert.match(
    html,
    /<a(?=[^>]*class="researchos-ongoing-link is-current")(?=[^>]*href="\.\.\/\.\.\/projects\/zeta\/overview")(?=[^>]*aria-current="location")[^>]*>Zeta<\/a>/,
  )
  assert.doesNotMatch(html, />Beta<\/a>/)
  assert.doesNotMatch(html, /folder-icon|folder-button|>Overview<\/a>/)
})

test("Explorer node ordering keeps Overview before project child folders", async () => {
  const { compareResearchOSExplorerNodes } = await import("./src/components/ExplorerRefinement.tsx")
  const nodes = [
    {
      isFolder: true,
      slugSegment: "questions",
      slugSegments: ["projects", "alpha", "questions"],
      displayName: "Questions",
    },
    {
      isFolder: false,
      slugSegment: "overview",
      slugSegments: ["projects", "alpha", "overview"],
      displayName: "Overview",
    },
    {
      isFolder: true,
      slugSegment: "claims",
      slugSegments: ["projects", "alpha", "claims"],
      displayName: "Claims",
    },
  ]

  assert.deepEqual(
    nodes.sort(compareResearchOSExplorerNodes as never).map((node) => node.displayName),
    ["Overview", "Claims", "Questions"],
  )
})

test("Explorer refinement is attached to explicit page-type sidebars", async () => {
  const { attachExplorerRefinement } = await import("./src/components/ExplorerRefinement.tsx")
  const shared = (() => null) as never
  const content = (() => null) as never
  const refinement = (() => null) as never
  const layouts = {
    defaults: { left: [shared] },
    byPageType: {
      content: { left: [content] },
      folder: { left: [content] },
      home: { left: [] },
      "404": { left: [] },
    },
  }

  attachExplorerRefinement(layouts as never, refinement)

  assert.deepEqual(layouts.defaults.left, [shared, refinement])
  assert.deepEqual(layouts.byPageType.content.left, [content, refinement])
  assert.deepEqual(layouts.byPageType.folder.left, [content, refinement])
  assert.deepEqual(layouts.byPageType.home.left, [])
  assert.deepEqual(layouts.byPageType["404"].left, [])
})

test("page presentation exposes badges and downloads only for canonical content", async () => {
  const { getPagePresentation } = await import("./src/components/PageMetaActions.tsx")
  const project = getPagePresentation("projects/ems/overview", {
    type: "project",
    title: "EMS",
    status: "active",
    project_status: "ongoing",
    publication_status: "submitted",
    project_id: "dft-lifsi-organic-solvents",
  })

  assert.deepEqual(project?.badges, [
    { label: "ONGOING", axis: "research" },
    { label: "SUBMITTED", axis: "publication" },
  ])
  assert.deepEqual(project?.metadata, ["dft-lifsi-organic-solvents"])
  assert.equal(project?.markdownPath, "downloads/markdown/projects/ems/overview.md")

  const invalidPublication = getPagePresentation("projects/invalid/overview", {
    type: "project",
    title: "Invalid",
    status: "active",
    project_status: "ongoing",
    publication_status: "accepted",
    project_id: "invalid-publication",
  })
  assert.deepEqual(invalidPublication?.badges, [{ label: "ONGOING", axis: "research" }])

  assert.equal(getPagePresentation("home", { type: "home", status: "active" }), null)
  assert.equal(getPagePresentation("_views/projects", { type: "view", status: "active" }), null)
  assert.equal(
    getPagePresentation("projects/private", { type: "project", status: "active", private: true }),
    null,
  )
})

test("Home page type owns only type:home content and uses the full-width frame", async () => {
  const { HomePage } = await import("./src/pageTypes/HomePage.tsx")
  const pageType = HomePage()

  assert.equal(
    pageType.match({
      slug: "home" as never,
      fileData: { frontmatter: { type: "home" } },
      cfg: {},
    }),
    true,
  )
  assert.equal(
    pageType.match({
      slug: "projects/a" as never,
      fileData: { frontmatter: { type: "project" } },
      cfg: {},
    }),
    false,
  )
  assert.equal(pageType.layout, "home")
  assert.equal(pageType.frame, "full-width")
})

test("page action component renders canonical download and print controls but not Home controls", async () => {
  const { default: PageMetaActions } = await import("./src/components/PageMetaActions.tsx")
  const Component = PageMetaActions(undefined)
  const common = {
    ctx: {},
    externalResources: { css: [], js: [], additionalHead: [] },
    cfg: {},
    children: [],
    tree: { type: "root", children: [] },
    allFiles: [],
  }
  const projectHtml = render(
    Component({
      ...common,
      fileData: {
        slug: "projects/ems/overview",
        frontmatter: {
          type: "project",
          title: "EMS",
          status: "active",
          project_status: "completed",
          publication_status: "published",
        },
      },
    } as never),
  )
  const homeHtml = render(
    Component({
      ...common,
      fileData: { slug: "home", frontmatter: { type: "home", status: "active" } },
    } as never),
  )

  assert.match(projectHtml, /downloads\/markdown\/projects\/ems\/overview\.md/)
  assert.match(projectHtml, /data-researchos-print/)
  assert.match(
    projectHtml,
    /class="researchos-badge researchos-badge-research researchos-badge-completed"[^>]*>COMPLETED</,
  )
  assert.match(
    projectHtml,
    /class="researchos-badge researchos-badge-publication researchos-badge-published"[^>]*>PUBLISHED</,
  )
  assert.equal(homeHtml, "")
})

test("render transformer also sanitizes the text used by the search content index", async () => {
  const { CanonicalTitle } = await import("./src/transformers/CanonicalTitle.ts")
  const instance = CanonicalTitle()
  const attacher = instance.htmlPlugins?.({} as never)?.[0] as (() => Function) | undefined
  assert.ok(attacher)
  const transform = attacher()
  const tree = { type: "root", children: [] }
  const file = {
    data: {
      frontmatter: { title: "Evidence" },
      text: "Aggregate at C:\\calc\\ex_verdict6.json",
    },
  }

  transform(tree, file)

  assert.match(file.data.text, /local artifact: ex_verdict6\.json/)
  assert.doesNotMatch(file.data.text, /C:\\/)
})

test("render transformer removes the duplicate title entry from the generated TOC", async () => {
  const { CanonicalTitle } = await import("./src/transformers/CanonicalTitle.ts")
  const instance = CanonicalTitle()
  const attacher = instance.htmlPlugins?.({} as never)?.[0] as (() => Function) | undefined
  assert.ok(attacher)
  const transform = attacher()
  const tree = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "h1",
        properties: {},
        children: [{ type: "text", value: "Project A" }],
      },
      {
        type: "element",
        tagName: "h2",
        properties: {},
        children: [{ type: "text", value: "Scope" }],
      },
    ],
  }
  const file = {
    data: {
      frontmatter: { title: "Project A" },
      toc: [
        { depth: 0, text: "Project A", slug: "project-a" },
        { depth: 1, text: "Scope", slug: "scope" },
      ],
    },
  }

  transform(tree, file)

  assert.deepEqual(file.data.toc, [{ depth: 1, text: "Scope", slug: "scope" }])
})

test("rendering keeps public internal links and neutralizes unpublished targets", async () => {
  const { neutralizeUnpublishedLinks } = await import("./src/transformers/PublicationLinks.ts")
  const tree = {
    type: "root",
    children: [
      {
        type: "element",
        tagName: "p",
        properties: {},
        children: [
          {
            type: "element",
            tagName: "a",
            properties: { className: ["internal"], "data-slug": "projects/public" },
            children: [{ type: "text", value: "Public" }],
          },
          { type: "text", value: " / " },
          {
            type: "element",
            tagName: "a",
            properties: { className: ["internal"], "data-slug": "projects/draft" },
            children: [{ type: "text", value: "Draft" }],
          },
        ],
      },
    ],
  }

  neutralizeUnpublishedLinks(tree as never, new Set(["projects/public"]))

  const links = JSON.stringify(tree)
  assert.match(links, /"tagName":"a"[^}]*projects\/public/)
  assert.match(links, /"tagName":"span"[^}]*unpublished-reference/)
  assert.doesNotMatch(links, /projects\/draft/)
})
