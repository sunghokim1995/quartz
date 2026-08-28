function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")
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
    <title>ResearchOS</title>
  </head>
  <body>
    <p><a href="${safeDestination}">ResearchOS Home으로 이동</a></p>
  </body>
</html>
`
}
