#!/usr/bin/env node
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

import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import { execSync } from 'node:child_process'

// #region Util
declare global {
  var is_debug: boolean
  var is_win: boolean
  var is_linux: boolean
  var build_dir: string
}

global.is_debug = process.argv[2] !== 'release'
global.is_win = process.platform === 'win32'
global.is_linux = process.platform === 'linux'

//global.build_dir = `build/${is_debug ? "debug" : "release"}/${platform}`;
global.build_dir = `build/${is_debug ? 'debug' : 'release'}`

// Preset
function preset() {
//build_ext_c_flags+=" -c -MMD -MF \$@.d -o \$@ \$<"

//if [ "$BUILD_MODE" == "debug" ]; then
//build_ext_c_flags+=" -ggdb -O0"
//fi

//if [ "$BUILD_MODE" == "release" ]; then
//build_ext_c_flags+=" -g0 -O2"
//fi
}
// Preset

// #endregion

// #region Tree Builder
declare global {
  var build: typeof _build
  var extExecutable: typeof _extExecutable
  var extFlags: typeof _extFlags
  var extSuffix: typeof _extSuffix
  var srcExecutable: typeof _srcExecutable
  var srcFlags: typeof _srcFlags
  var groupFinalExecutable: typeof _groupFinalExecutable
  var groupFinalExecutableSuffix: typeof _groupFinalExecutableSuffix
  var groupFinalFlags: typeof _groupFinalFlags
  var groupFinalFlagsInputPattern: typeof _groupFinalFlagsInputPattern
  var groupFile: typeof _groupFile
  var groupFileExecutable: typeof _groupFileExecutable
  var group: typeof _group
//  var import: typeof _import
}
//console.info('INFO: Current build mode: ' + (is_debug ? 'debug' : 'release'))

const contextStack: string[] = []

async function _build(name: string = '') {
  const file = path.join(process.cwd(), contextStack.join('/'), name, 'build.js')

  if (name !== '') contextStack.push(name)

  try {
    await import(url.pathToFileURL(file).href)
  } catch (e) {
    console.log("Can't load build.js, is file existing?")
    throw e
  } finally {
    if (name !== '') contextStack.pop()
  }
}
global.build = _build

type StringKeyValue = Record<string, string>

type Group = {
  name: string
  files: Record<
    string,
    {
      executable: string
      flags: string
      toBeRemoved: string[]
      includeInFinalOutput: boolean | 'notconfigured'
    }
  >
  extFlags: StringKeyValue
  extExecutable: StringKeyValue
  extSuffix: StringKeyValue
  finalFlags: string
  finalFlagsToBeRemoved: string[]
  finalExe: string
  finalExeSuffix: string
  finalInputPattern: string
}

const globalExtExecutable: StringKeyValue = {}
const globalExtFlags: StringKeyValue = {}
const globalExtSuffix: StringKeyValue = {}
const globalSrcExecutable: StringKeyValue = {}
const globalSrcFlags: StringKeyValue = {}

const groups: Record<string, Group> = {}
let currentGroup: Group | null = null

//
function _extExecutable(ext: string, exec?: string) {
  let assign = globalExtExecutable
  if (currentGroup !== null) assign = currentGroup.extExecutable
  if (exec) assign[ext] = exec
  return assign[ext] ?? ''
}
global.extExecutable = _extExecutable

function _extFlags(ext: string, flags?: string) {
  let assign = globalExtFlags
  if (currentGroup !== null) assign = currentGroup.extFlags
  if (!assign[ext]) assign[ext] = ''
  if (flags && flags.length > 0) assign[ext] += ` ${flags}`
  return assign[ext] ?? ''
}
global.extFlags = _extFlags

function _extSuffix(ext: string, suffix?: string) {
  let assign = globalExtSuffix
  if (currentGroup !== null) assign = currentGroup.extSuffix
  if (suffix) assign[ext] = suffix
  return assign[ext] ?? ''
}
global.extSuffix = _extSuffix

function _srcExecutable(src: string, exec?: string) {
  if (currentGroup !== null) throw 'src function called inside group'
  const srcName = contextStack.join('/') + (contextStack.length > 0 ? '/' : '') + src
  if (exec) globalSrcExecutable[srcName] = exec
  return globalSrcExecutable[srcName] ?? ''
}
global.srcExecutable = _srcExecutable

function _srcFlags(src: string, flags?: string) {
  if (currentGroup !== null) throw 'src function called inside group'
  const srcName = contextStack.join('/') + (contextStack.length > 0 ? '/' : '') + src
  if (!globalSrcFlags[srcName]) globalSrcFlags[srcName] = ''
  if (flags && flags.length > 0) globalSrcFlags[srcName] += ` ${flags}`
  return globalSrcFlags[srcName] ?? ''
}
global.srcFlags = _srcFlags

function _groupFinalFlags(flags: string, toBeRemoved: string | string[]) {
  if (!currentGroup) throw 'any group function called outside of group'
  if (flags) {
    if (flags.length > 0) currentGroup.finalFlags += ` ${flags}`
    if (toBeRemoved) {
      if (typeof toBeRemoved === 'string') currentGroup.finalFlagsToBeRemoved.push(toBeRemoved)
      else if (Array.isArray(toBeRemoved)) {
        currentGroup.finalFlagsToBeRemoved.push(...toBeRemoved)
      } else {
        throw 'What are you doing? ' + typeof toBeRemoved
      }
    }
  }
  return currentGroup.finalFlags
}
global.groupFinalFlags = _groupFinalFlags

function _groupFinalExecutable(exe: string) {
  if (!currentGroup) throw 'any group function called outside of group'
  if (exe) currentGroup.finalExe = exe
  return currentGroup.finalExe
}
global.groupFinalExecutable = _groupFinalExecutable

function _groupFinalExecutableSuffix(suffix: string) {
  if (!currentGroup) throw 'any group function called outside of group'
  if (suffix) currentGroup.finalExeSuffix = suffix
  return currentGroup.finalExeSuffix
}
global.groupFinalExecutableSuffix = _groupFinalExecutableSuffix

function _groupFinalFlagsInputPattern(pattern: string) {
  if (!currentGroup) throw 'any group function called outside of group'
  if (pattern) currentGroup.finalInputPattern = pattern
  return currentGroup.finalInputPattern
}
global.groupFinalFlagsInputPattern = _groupFinalFlagsInputPattern

function _groupFile(
  fileName: string,
  flags?: string,
  flagsToBeRemoved?: string | string[],
  includeInFinalOutput?: boolean | "notconfigured"
): void {
  if (!currentGroup) throw 'any group function called outside of group'
  const file = contextStack.join('/') + (contextStack.length > 0 ? '/' : '') + fileName
  let currentGroupFile = currentGroup.files[file]
  if (!currentGroupFile) {
    currentGroup.files[file] = currentGroupFile = {
      executable: '',
      flags: '',
      toBeRemoved: [],
      includeInFinalOutput: true
    }
  }

  if (flags && flags.length > 0) currentGroupFile.flags += ` ${flags}`
  if (flagsToBeRemoved && flagsToBeRemoved.length > 0) {
    if (typeof flagsToBeRemoved === 'string') currentGroupFile.toBeRemoved.push(flagsToBeRemoved)
    else if (Array.isArray(flagsToBeRemoved)) {
      currentGroupFile.toBeRemoved.push(...flagsToBeRemoved)
    } else {
      throw 'What are you doing? ' + typeof flagsToBeRemoved
    }
  }
  if(currentGroupFile.includeInFinalOutput === "notconfigured" && includeInFinalOutput !== "notconfigured")
    currentGroupFile.includeInFinalOutput = true
  if (includeInFinalOutput !== undefined)
    currentGroupFile.includeInFinalOutput = includeInFinalOutput
}
global.groupFile = _groupFile

function _groupFileExecutable(src: string, exec?: string) {
  if (!currentGroup) throw 'any group function called outside of group'
  const file = contextStack.join('/') + (contextStack.length > 0 ? '/' : '') + src
  if (!currentGroup.files[file]) groupFile(src, "", "", "notconfigured")
  // @ts-ignore
  if (exec) currentGroup.files[file].executable = exec
  return currentGroup.files[file]?.executable ?? '' 
}
global.groupFileExecutable = _groupFileExecutable

async function _group(name: string | null, fn: () => void) {
  if (name && !groups[name])
    groups[name] = {
      name,
      files: {},
      extFlags: {},
      extExecutable: {},
      extSuffix: {},
      finalFlags: '',
      finalFlagsToBeRemoved: [],
      finalExe: '',
      finalExeSuffix: '',
      finalInputPattern: '{in}'
    }

  if (!name) {
    currentGroup = null
    return
  }

  let oldGroup = currentGroup
  currentGroup = groups[name] ?? null
  if (typeof fn === 'function') {
    await fn()
    currentGroup = oldGroup
  }
}
global.group = _group

function _import(fromName: string, toName: string, deleteOldOne = true) {
    if(!((typeof fromName === "string" && fromName.length > 0) && (typeof toName === "string" && toName.length > 0))) throw "import function got invalid arguments"

    const from = groups[fromName]
    const to = groups[toName]
    /*
    local temp

    temp="build_${from}_final_flags"
    declare -g "build_${to}_final_flags+= ${!temp}"

    for v in $(compgen -v "build_${from}_ext_"); do  
    if [[ "$v" == *_flags ]]; then
        declare -g "${v/build_${from}_ext_/build_${to}_ext_}+=${!v:+ ${!v}}"
    fi
    if [[ "$v" == *_exe ]]; then
        declare -g "${v/build_${from}_ext_/build_${to}_ext_}="
    fi
        declare -g "${v}="
    done


    temp="build_${from}_sources"
    for source in ${!temp}; do
        declare -g "build_${to}_sources+= $source"
        source="${source//[\/.]/_}"
        temp="build_${from}_src_${source}_flags"
        declare -g "build_${to}_src_${source}_flags+= ${!temp}"

        declare -g "build_${from}_src_${source}_exe="
        declare -g "build_${from}_src_${source}_flags="
    done

    declare -g "build_${from}_sources="
    declare -g "build_${from}_final_exe="
    declare -g "build_${from}_final_flags="

    temp="build_groups"
    declare -g "build_groups=${!temp//${from}/}"
    */
}
//global.build = _build

build() // Now build the tree
// #endregion

// #region Runtime
function needsRebuild(src: string, obj: string): boolean {
  if (!fs.existsSync(src)) throw new Error(`${src} does not existis!`)
  if (!fs.existsSync(obj)) return true

  const srcTime = fs.statSync(src).mtimeMs
  const objTime = fs.statSync(obj).mtimeMs

  if (srcTime > objTime) return true

  const dep = obj + '.d'
  if (fs.existsSync(dep)) {
    const depText = fs
      .readFileSync(dep, 'utf-8')
      .toString()
      .replace(/\\\r?\n/g, ' ')
    const depColon = depText.indexOf(':')
    if (depColon !== -1) {
      const deps = depText
        .slice(depColon + 1)
        .trim()
        .split(/\s+/)
        .filter(Boolean)

      for (const dep of deps) {
        if (!fs.existsSync(dep)) return true
        if (fs.statSync(dep).mtimeMs > objTime) return true
      }
    }
  }
  return false
}

function linkNeedsRebuild(output: string, objects: readonly string[]): boolean {
  if (!fs.existsSync(output)) return true

  const outputTime = fs.statSync(output).mtimeMs

  for (const obj of objects) {
    if (fs.statSync(obj).mtimeMs > outputTime) return true
  }

  return false
}

process.once('beforeExit', async () => {
  fs.mkdirSync(path.dirname(path.join(process.cwd(), build_dir)), { recursive: true })
  for (const [name, group] of Object.entries(groups)) {
    const objects: { obj: string; fullPath: string }[] = []

    for (const [fileName, file] of Object.entries(group.files)) {
      const fileLastExt = fileName.split('.').pop()!

      const suffix = globalExtSuffix[fileLastExt] ?? group.extSuffix[fileLastExt]
      const obj = `${build_dir}/${fileName}${suffix ? `.${suffix}` : ''}`
      const objFullPath = path.join(process.cwd(), obj)
      if (file.includeInFinalOutput === true) objects.push({ obj, fullPath: objFullPath })
      if (needsRebuild(path.join(process.cwd(), fileName), objFullPath)) {
        fs.mkdirSync(path.dirname(objFullPath), { recursive: true })

        let objFlags = `${globalSrcFlags[fileName] ?? ""} ${file.flags ?? ''}`
        for (const ext of fileName.split('.').slice(1)) {
          if (ext.length <= 0) continue
          objFlags += ` ${globalExtFlags[ext] ?? ''} ${group.extFlags[ext] ?? ''}`
        }

        if (file.toBeRemoved.length > 0)
          for (const remove of file.toBeRemoved) objFlags = objFlags.replaceAll(remove, '')

        const executable =
          (file.executable.length > 0 ? file.executable : undefined) ||
          globalSrcExecutable[fileName] ||
          group.extExecutable[fileLastExt] ||
          globalExtExecutable[fileLastExt]
        const cmd = `${executable} ${objFlags.replaceAll('{in}', fileName).replaceAll('{out}', obj)}` // out and input handling
        console.log(cmd)
        execSync(cmd, { stdio: 'inherit' })
      }
    }

    const finalOutName = `${build_dir}/${name}${group.finalExeSuffix ? `.${group.finalExeSuffix}` : ``}`
    const finalOutFullPath = path.join(process.cwd(), finalOutName)
    if (
      group.finalExe.length > 0 &&
      linkNeedsRebuild(
        finalOutFullPath,
        objects.map(x => x.fullPath)
      )
    ) {
      let finalFlags = group.finalFlags
      if (group.finalFlagsToBeRemoved.length > 0)
        for (const remove of group.finalFlagsToBeRemoved)
          finalFlags = finalFlags.replaceAll(remove, '')

      const cmd = `${group.finalExe} ${finalFlags.replaceAll('{out}', finalOutName).replaceAll('{in}', objects.map(x => group.finalInputPattern.replaceAll('{in}', x.obj)).join(' '))}`
      console.log(cmd)
      execSync(cmd, {
        stdio: 'inherit'
      })
    }
  }
})

// #endregion
