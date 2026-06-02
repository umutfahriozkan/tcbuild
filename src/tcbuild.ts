/*
    tcbuild - Build system

    Copyright (C) 2026 Umut Fahri Ozkan

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import fs from "node:fs"
import path from "node:path"
import url from "node:url"

declare global {
  var is_debug: boolean
  var is_win: boolean
  var is_linux: boolean
  var build_dir: string

  function extExecutable(ext: string, exec: string): void;
  function extExecutable(ext: string): string;
  function debExtExecutable(ext: string, exec: string): void;
  function relExtExecutable(ext: string, exec: string): void;

  function extFlags(ext: string): string;
  function extFlags(ext: string, flags: string): void;
  function debExtFlags(ext: string, flags: string): void;
  function relExtFlags(ext: string, flags: string): void;

  function groupFinalFlags(flags: string): void;
  function debGroupFinalFlags(flags: string): void;
  function relGroupFinalFlags(flags: string): void;
  function groupFinalExecutable(exec: string): void;
  function debGroupFinalExecutable(exe: string): void;
  function relGroupFinalExecutable(exe: string): void;
  function groupFinalExecutableSuffix(suffix: string): void;
  function debGroupFinalExecutableSuffix(suffix: string): void;
  function relGroupFinalExecutableSuffix(suffix: string): void;

  function groupFile(file: string, flags: string): void;
  function debGroupFile(file: string, flags: string): void;
  function relGroupFile(file: string, flags: string): void;
  function group(name: string, fn: () => void): void;
}
/*****/
let is_debug = true;
if (process.argv[2] === "release") is_debug = false;
//
global.is_debug = is_debug;
global.is_win = (process.platform === "win32");
global.is_linux = (process.platform === "linux");
let platform;
switch (process.platform) {
  case "win32":
    platform = "win32"
    break;
  default:
    throw "Platform support needed"
}
//global.build_dir = `build/${is_debug ? "debug" : "release"}/${platform}`;
global.build_dir = "build"

const cwd = process.cwd()
const buildConfig = path.join(cwd, "build.js");
if(!fs.existsSync(buildConfig)) {
  console.error("build.js not found on cwd directory, halting");
  process.exit(1);
}

/*****/
console.info("INFO: Current build mode: " + (is_debug ? "debug" : "release"))

type StringKeyValue = Record<string, string>;

type GroupFileObject = {
  flags: string
  executable: string
}

type Group = {
  name: string;
  files: Record<string, GroupFileObject>;
  extFlags: StringKeyValue;
  extExecutable: StringKeyValue;
  finalFlags: string;
  finalExe: string;
  finalExeSuffix: string;
};

const globalExtExecutable: StringKeyValue = {}
const globalExtFlags: StringKeyValue = {}
const groups: Record<string, Group> = {}
let currentGroup: Group | null = null;

function extExecutable(ext: string, exec: string): void;
function extExecutable(ext: string): string;
function extExecutable(ext: string, exec?: string) {
  if (currentGroup === null) {
    if (exec)
      globalExtExecutable[ext] = exec;
    else
      return globalExtExecutable[ext];
  } else {
    if (exec)
      currentGroup.extExecutable[ext] = exec;
    else
      return currentGroup.extExecutable[ext]
  }
}

function debExtExecutable(ext: string, exe: string): void {
  if (is_debug) return extExecutable(ext, exe)
}

function relExtExecutable(ext: string, exe: string): void {
  if (!is_debug) return extExecutable(ext, exe)
}

function extFlags(ext: string): string;
function extFlags(ext: string, flags: string): void;
function extFlags(ext: string, flags?: string) {
  if (currentGroup === null) {
    if (!globalExtFlags[ext]) globalExtFlags[ext] = "";
    if (flags)
      globalExtFlags[ext] += ` ${flags}`;
    else
      return globalExtFlags[ext];
  } else {
    if (!currentGroup.extFlags[ext]) currentGroup.extFlags[ext] = "";
    if (flags)
      currentGroup.extFlags[ext] += ` ${flags}`;
    else
      return currentGroup.extFlags[ext];
  }
}

function debExtFlags(ext: string, flags: string): void {
  if (is_debug) return extFlags(ext, flags)
}

function relExtFlags(ext: string, flags: string): void {
  if (!is_debug) return extFlags(ext, flags)
}

function groupFinalFlags(flags: string): void {
  if (!currentGroup) throw "any group function called outside of group";
  currentGroup.finalFlags += ` ${flags}`
}

function debGroupFinalFlags(flags: string): void {
  if (is_debug) return groupFinalFlags(flags)
}

function relGroupFinalFlags(flags: string): void {
  if (!is_debug) return groupFinalFlags(flags)
}

function groupFinalExecutable(exe: string): void {
  if (!currentGroup) throw "any group function called outside of group";
  currentGroup.finalExe = exe;
}

function debGroupFinalExecutable(exe: string): void {
  if (is_debug) return groupFinalExecutable(exe)
}

function relGroupFinalExecutable(exe: string): void {
  if (!is_debug) return groupFinalExecutable(exe)
}

function groupFinalExecutableSuffix(suffix: string): void {
  if (!currentGroup) throw "any group function called outside of group";
  currentGroup.finalExeSuffix = suffix;
}

function debGroupFinalExecutableSuffix(suffix: string): void {
  if (is_debug) return groupFinalExecutableSuffix(suffix)
}

function relGroupFinalExecutableSuffix(suffix: string): void {
  if (!is_debug) return groupFinalExecutableSuffix(suffix)
}

function groupFile(file: string, flags: string): void {
  if (!currentGroup) throw "any group function called outside of group";
  const existisFile = currentGroup.files[file];
  if (existisFile) {
    existisFile.flags += ` ${flags}`
  } else {
    currentGroup.files[file] = {
      flags,
      executable: ""
    };
  }
}
function debGroupFile(file: string, flags: string): void {
  if (is_debug) return groupFile(file, flags)
}
function relGroupFile(file: string, flags: string): void {
  if (!is_debug) return groupFile(file,flags)
}

function group(name: string, fn: () => void): void {
  const g: Group = {
    name,
    files: {},
    extFlags: {},
    extExecutable: {},
    finalFlags: "",
    finalExe: "",
    finalExeSuffix: "",
  };

  groups[name] = g;

  currentGroup = g;
  fn();
  currentGroup = null;
}

Object.assign(globalThis, {
  extExecutable,
  debExtExecutable,
  relExtExecutable,
  extFlags,
  debExtFlags,
  relExtFlags,
  groupFinalFlags,
  debGroupFinalFlags,
  relGroupFinalFlags,
  groupFinalExecutable,
  debGroupFinalExecutable,
  relGroupFinalExecutable,
  groupFinalExecutableSuffix,
  debGroupFinalExecutableSuffix,
  relGroupFinalExecutableSuffix,
  groupFile,
  debGroupFile,
  relGroupFile,
  group
})


/////////// Tc Builder
let isDone = false;
process.on("beforeExit", async () => {
  if (isDone) return;
  let targets = ""
  let make_out = ""

  for (const name in groups) {
    if (!Object.hasOwn(groups, name)) continue;
    const out_name = `${build_dir}/${name}`
    const group = groups[name]!;
    targets += `${out_name}${group.finalExeSuffix} `

    let recipe = ""
    let objects = ""
    for (const fileName in group.files) {
      if (!Object.hasOwn(group.files, fileName)) continue;
      const file = group.files[fileName]!;
      const fileLastExt = fileName.split(".").pop()!

      let obj_out = `${build_dir}/${fileName}.o`
      objects += ` ${obj_out}`

      let final_flags = `${/* globalSrcFileFlags */ ""} ${file.flags ?? ""}`

      for (const ext of fileName.split('.').slice(1)) {
        if (ext.length <= 0) continue;

        final_flags += `${globalExtFlags[ext] ?? ""} ${group.extFlags[ext] ?? ""}`
      }

      recipe += `${obj_out}: ${fileName}\n\t@mkdir -p $(dir $@)\n\t${file.executable || /*globalSrcFileExec ||*/ group.extExecutable[fileLastExt] || globalExtExecutable[fileLastExt]} ${final_flags}\n`
    }
    make_out += `OBJ_${name}=${objects}\n${out_name}${group.finalExeSuffix}:$(OBJ_${name})\n\t${group.finalExe} ${group.finalFlags}\n${recipe}-include $(OBJ_${name}:=.d)\n`
  }

  await fs.promises.writeFile("./Makefile", `all: ${targets}\n${make_out}`)
  isDone = true;
});

// Import the build config
await import(url.pathToFileURL(buildConfig).href);