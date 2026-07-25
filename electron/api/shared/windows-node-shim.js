import { promises as fs } from "node:fs";
import path from "node:path";

const MAX_SHIM_BYTES = 32 * 1024;
const NODE_ENTRYPOINT_PATTERN =
  /(?:"%_prog%"|"%(?:dp0%|~dp0)\\node(?:\.exe)?")\s+"%(?:dp0%|~dp0)\\(node_modules\\[^"\r\n]+?\.(?:c?js|mjs))"\s+%\*\s*$/im;

export const parseNpmWindowsNodeShimTarget = (contents) => {
  const source = String(contents ?? "");
  if (!source || Buffer.byteLength(source, "utf8") > MAX_SHIM_BYTES) {
    return null;
  }

  const match = source.match(NODE_ENTRYPOINT_PATTERN);
  if (!match?.[1]) return null;

  const relativeTarget = path.win32.normalize(match[1]);
  if (
    path.win32.isAbsolute(relativeTarget) ||
    relativeTarget === "node_modules" ||
    !relativeTarget.toLowerCase().startsWith("node_modules\\") ||
    relativeTarget.split("\\").includes("..")
  ) {
    return null;
  }
  return relativeTarget;
};

const isInside = (pathApi, parent, child) => {
  const relative = pathApi.relative(parent, child);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${pathApi.sep}`) &&
    !pathApi.isAbsolute(relative)
  );
};

export const resolveNpmWindowsNodeShim = async (
  commandPath,
  {
    access = fs.access,
    nodeExecutable = process.execPath,
    readFile = fs.readFile,
    realpath = fs.realpath,
  } = {},
) => {
  if (path.win32.extname(commandPath).toLowerCase() !== ".cmd") {
    return null;
  }

  const shimContents = await readFile(commandPath, "utf8");
  const relativeTarget = parseNpmWindowsNodeShimTarget(shimContents);
  if (!relativeTarget) return null;

  const shimDirectory = path.win32.dirname(commandPath);
  const packageTree = path.win32.join(shimDirectory, "node_modules");
  const target = path.win32.resolve(shimDirectory, relativeTarget);
  const [realPackageTree, realTarget] = await Promise.all([
    realpath(packageTree),
    realpath(target),
  ]);
  if (!isInside(path.win32, realPackageTree, realTarget)) {
    return null;
  }
  await access(realTarget);

  return {
    argsPrefix: [realTarget],
    command: nodeExecutable,
    env: { ELECTRON_RUN_AS_NODE: "1" },
    shell: false,
  };
};
