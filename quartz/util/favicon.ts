import { joinSegments } from "./path"

export const FAVICON_VERSION = "af322dcc"

export function getFaviconHref(baseDir: string): string {
  return `${joinSegments(baseDir, "static/icon.png")}?v=${FAVICON_VERSION}`
}
