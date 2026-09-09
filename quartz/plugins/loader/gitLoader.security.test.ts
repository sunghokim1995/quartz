import assert from "node:assert/strict"
import test from "node:test"
import path from "node:path"
import { pluginCachePath, pluginSubdirectoryPath } from "./gitLoader"

test("plugin cache paths reject traversal and absolute paths", () => {
  for (const unsafe of [
    "../outside",
    "plugin/../../outside",
    "/tmp/outside",
    "C:\\outside",
    "plugin\\..\\outside",
    "plugin/\0outside",
  ]) {
    assert.throws(() => pluginCachePath(unsafe), /Invalid plugin name/)
  }
  assert.match(
    pluginCachePath("@researchos/safe-plugin"),
    new RegExp(`${path.sep.replace("\\", "\\\\")}safe-plugin$`),
  )
})

test("plugin subdirectories remain confined to the cloned repository", () => {
  const root = path.join(path.sep, "tmp", "plugin-root")
  assert.equal(
    pluginSubdirectoryPath(root, "packages/plugin"),
    path.join(root, "packages", "plugin"),
  )
  for (const unsafe of [
    "../outside",
    "packages/../../outside",
    "/tmp/outside",
    "packages\\..\\outside",
  ]) {
    assert.throws(() => pluginSubdirectoryPath(root, unsafe), /Invalid plugin subdirectory/)
  }
})
