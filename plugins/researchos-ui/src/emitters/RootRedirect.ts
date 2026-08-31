import { readFile, writeFile } from "node:fs/promises"
import { getFaviconHref } from "../../../../quartz/util/favicon"

type EmittedFiles = Promise<string[]> | AsyncGenerator<string>
type RedirectEmitter = {
  name: string
  emit: (...args: never[]) => EmittedFiles
  partialEmit?: (...args: never[]) => EmittedFiles | null
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")
}

const redirectFaviconLink = `<link rel="icon" href="${getFaviconHref("/")}">`

export function addFaviconToRedirectHtml(html: string): string {
  if (!/<meta\s+http-equiv=["']refresh["']/i.test(html)) return html
  if (/<link\s+[^>]*rel=["'][^"']*\bicon\b[^"']*["']/i.test(html)) return html
  return html.replace(/<\/head>/i, `${redirectFaviconLink}\n</head>`)
}

async function patchRedirectOutputs(emitted: EmittedFiles): Promise<string[]> {
  const output = await emitted
  const files: string[] = []
  for await (const file of output) {
    const html = await readFile(file, "utf8")
    const patched = addFaviconToRedirectHtml(html)
    if (patched !== html) await writeFile(file, patched, "utf8")
    files.push(file)
  }
  return files
}

export function withRedirectFavicon<T>(emitter: T): T {
  const delegate = emitter as RedirectEmitter
  return {
    ...delegate,
    emit: (...args: never[]) => patchRedirectOutputs(delegate.emit(...args)),
    ...(delegate.partialEmit && {
      partialEmit: (...args: never[]) => {
        const emitted = delegate.partialEmit!(...args)
        return emitted === null ? null : patchRedirectOutputs(emitted)
      },
    }),
  } as T
}

export function createRootRedirectHtml(destination: string): string {
  const safeDestination = escapeAttribute(destination)
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="0; url=${safeDestination}">
    <link rel="canonical" href="${safeDestination}">
    ${redirectFaviconLink}
    <title>ResearchOS</title>
  </head>
  <body>
    <p><a href="${safeDestination}">ResearchOS Home으로 이동</a></p>
  </body>
</html>
`
}
