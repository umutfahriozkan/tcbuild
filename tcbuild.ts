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
import * as glob from 'glob'

// #region Util
declare global {
  var is_debug: boolean
  var is_win: boolean
  var is_linux: boolean
  var build_dir: string
  var preset: typeof _preset
}

global.is_debug = process.argv[2] !== 'release'
global.is_win = process.platform === 'win32'
global.is_linux = process.platform === 'linux'

//global.build_dir = `build/${is_debug ? "debug" : "release"}/${platform}`;
global.build_dir = `build/${is_debug ? 'debug' : 'release'}`

// Preset
function _preset() {
  extFlags('c', '-c -MMD -MF {out}.d -o {out} {in}')

  if (is_debug) {
    extFlags('c', '-ggdb -O0')
  } else {
    extFlags('c', '-g0 -O2')
  }

  extFlags('cpp', extFlags('c'))
}
// Preset
global.preset = _preset
// #endregion

// #region Tree Builder
declare global {
  var build: typeof _build
  var extExecutable: typeof _extExecutable
  var extFlags: typeof _extFlags
  var extSuffix: typeof _extSuffix
  var extIncludeInFinalOutput: typeof _extIncludeInFinalOutput
  var srcExecutable: typeof _srcExecutable
  var srcFlags: typeof _srcFlags
  var groupFinalExecutable: typeof _groupFinalExecutable
  var groupFinalExecutableSuffix: typeof _groupFinalExecutableSuffix
  var groupFinalFlags: typeof _groupFinalFlags
  var groupFinalFlagsInputPattern: typeof _groupFinalFlagsInputPattern
  var groupFile: typeof _groupFile
  var group: typeof _group
  var groupGlob: typeof _groupGlob
  //  var import: typeof _import
}
//console.info('INFO: Current build mode: ' + (is_debug ? 'debug' : 'release'))

const contextStack: string[] = []

async function _build(name: string = '', cb?: () => any) {
  let prevStack = contextStack.join('/')
  if (name !== '') contextStack.push(name)

  if (cb) {
    cb()
    if (name !== '') contextStack.pop()
  } else {
    try {
      const file = path.join(process.cwd(), prevStack, name, 'build.js')

      if (!file.startsWith(path.resolve(process.cwd())))
        throw 'Build system outside of own working directory'
      await import(url.pathToFileURL(file).href)
    } catch (e) {
      console.log("Can't load build.js, is file existing?")
      throw e
    } finally {
      if (name !== '') contextStack.pop()
    }
  }
}
global.build = _build

type StringKeyValue = Record<string, string>
type StringKeyBooleanValue = Record<string, boolean>

type Group = {
  name: string
  files: Record<
    string,
    {
      executable: string
      flags: string
      toBeRemoved: string[]
      includeInFinalOutput: boolean
    }
  >
  extFlags: StringKeyValue
  extExecutable: StringKeyValue
  extSuffix: StringKeyValue
  extIncludeInFinalOutput: StringKeyBooleanValue
  finalFlags: string
  finalFlagsToBeRemoved: string[]
  finalExe: string
  finalExeSuffix: string
  finalInputPattern: string
}

const globalExtExecutable: StringKeyValue = {}
const globalExtFlags: StringKeyValue = {}
const globalExtSuffix: StringKeyValue = {}
const globalExtIncludeInFinalOutput: StringKeyBooleanValue = {}
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

function _extIncludeInFinalOutput(ext: string, include?: boolean) {
  let assign = globalExtIncludeInFinalOutput
  if (currentGroup !== null) assign = currentGroup.extIncludeInFinalOutput
  if (include !== undefined) assign[ext] = include
  return assign[ext] ?? true
}
global.extIncludeInFinalOutput = _extIncludeInFinalOutput

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

interface groupFileObj {
  getFlags(): string
  setFlags(flags: string): groupFileObj
  appendFlags(flags?: string): groupFileObj
  getFlagsToBeRemoved(): string[]
  appendFlagsToBeRemoved(flagsToBeRemoved?: string | string[]): groupFileObj
  getExecutable(): string
  setExecutable(executable: string): groupFileObj
  getIncludeInFinalOutput(): boolean
  setIncludeInFinalOutput(includeInFinalOutput: boolean): groupFileObj
}

function _groupFile(fileName: string): groupFileObj {
  if (!currentGroup) throw 'any group function called outside of group'
  const file = contextStack.join('/') + (contextStack.length > 0 ? '/' : '') + fileName
  if (!path.resolve(path.join(process.cwd(), file)).startsWith(path.resolve(process.cwd())))
    throw 'Build system outside of own working directory'
  let currentGroupFile = currentGroup.files[file]
  if (!currentGroupFile) {
    currentGroup.files[file] = currentGroupFile = {
      executable: '',
      flags: '',
      toBeRemoved: [],
      includeInFinalOutput: true
    }
  }

  const self: groupFileObj = {
    getFlags: () => {
      return currentGroupFile.flags
    },
    setFlags: (flags: string) => {
      if (flags && flags.length > 0) currentGroupFile.flags = flags
      return self
    },
    appendFlags: (flags?: string) => {
      if (flags && flags.length > 0) currentGroupFile.flags += ` ${flags}`
      return self
    },
    getFlagsToBeRemoved: () => {
      return currentGroupFile.toBeRemoved
    },
    appendFlagsToBeRemoved: (flagsToBeRemoved?: string | string[]) => {
      if (flagsToBeRemoved && flagsToBeRemoved.length > 0) {
        if (typeof flagsToBeRemoved === 'string')
          currentGroupFile.toBeRemoved.push(flagsToBeRemoved)
        else if (Array.isArray(flagsToBeRemoved)) {
          currentGroupFile.toBeRemoved.push(...flagsToBeRemoved)
        }
      }
      return self
    },
    getExecutable: () => {
      return currentGroupFile.executable
    },
    setExecutable: (executable: string) => {
      if (executable != undefined) currentGroupFile.executable = executable
      return self
    },
    getIncludeInFinalOutput: () => {
      return currentGroupFile.includeInFinalOutput
    },
    setIncludeInFinalOutput: (includeInFinalOutput: boolean) => {
      if (includeInFinalOutput !== undefined)
        currentGroupFile.includeInFinalOutput = includeInFinalOutput
      return self
    }
  }

  return self
}
global.groupFile = _groupFile

async function _group(name: string | null, fn: () => void) {
  if (name && !groups[name])
    groups[name] = {
      name,
      files: {},
      extFlags: {},
      extExecutable: {},
      extSuffix: {},
      extIncludeInFinalOutput: {},
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

interface groupGlobOptions {
  globOptions?: any
  callBuildFiles?: boolean
  cb?: (_: groupFileObj) => void
}

async function _groupGlob(globXp: string, options?: groupGlobOptions) {
  if (!currentGroup) throw 'any group function called outside of group'

  const globbed = glob.globSync(globXp, { cwd: contextStack.join('/'), ...options?.globOptions })
  for (let realGlobPath of globbed) {
    const globPath = path.join(contextStack.join('/'), realGlobPath)
    if (!fs.statSync(path.join(process.cwd(), globPath)).isFile()) continue
    if (!path.join(process.cwd(), globPath).startsWith(path.resolve(process.cwd())))
      console.error('glob outside of working directory: ' + globPath)
    if (globPath.endsWith('/build.js')) {
      if (options?.callBuildFiles === true) await build(path.dirname(globPath))
    } else {
      if (options?.cb) {
        options?.cb(groupFile(realGlobPath))
      } else {
        groupFile(realGlobPath)
      }
    }
  }
}
global.groupGlob = _groupGlob

function _import(fromName: string, toName: string, deleteOldOne = true) {
  if (
    !(
      typeof fromName === 'string' &&
      fromName.length > 0 &&
      typeof toName === 'string' &&
      toName.length > 0
    )
  )
    throw 'import function got invalid arguments'

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
  src = path.join(process.cwd(), src)
  obj = path.join(process.cwd(), obj)
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
  output = path.join(process.cwd(), output)
  if (!fs.existsSync(output)) return true

  const outputTime = fs.statSync(output).mtimeMs

  for (const obj of objects) {
    if (fs.statSync(path.join(process.cwd(), obj)).mtimeMs > outputTime) return true
  }

  return false
}

function findExecutable(map: StringKeyValue | StringKeyBooleanValue, exts: string[], depth = -1): string | boolean | undefined {
  const ext = exts.at(depth);

  if (ext === undefined) {
    return undefined;
  }

  return map[ext] ?? findExecutable(map, exts, depth - 1);
}

process.once('beforeExit', async () => {
  fs.mkdirSync(path.dirname(path.join(process.cwd(), build_dir)), { recursive: true })
  const compileCommandsFiles: string[] = []
  for (const [name, group] of Object.entries(groups)) {
    const objects: string[] = []

    for (const [fileName, file] of Object.entries(group.files)) {
      const fileExts = fileName.split('.').slice(1)

      const suffix = findExecutable(group.extSuffix, fileExts) ?? findExecutable(globalExtSuffix, fileExts);
      const obj = `${build_dir}/${fileName}${suffix ? `.${suffix}` : ''}`
      if ((file.includeInFinalOutput || findExecutable(group.extIncludeInFinalOutput, fileExts) || findExecutable(globalExtIncludeInFinalOutput, fileExts)) === true) objects.push(obj)
      if (needsRebuild(fileName, obj)) {
        fs.mkdirSync(path.dirname(path.join(process.cwd(), obj)), { recursive: true })

        let objFlags = `${globalSrcFlags[fileName] ?? ''} ${file.flags ?? ''}`
        for (const ext of fileExts) {
          if (ext.length > 0)
            objFlags += ` ${globalExtFlags[ext] ?? ''} ${group.extFlags[ext] ?? ''}`
        }

        if (file.toBeRemoved.length > 0)
          for (const remove of file.toBeRemoved) objFlags = objFlags.replaceAll(remove, '')

        const executable =
          (file.executable.length > 0 ? file.executable : undefined) ||
          globalSrcExecutable[fileName] ||
          findExecutable(group.extExecutable, fileExts) ||
          findExecutable(globalExtExecutable, fileExts)
        const cmd = `${executable} ${objFlags.replaceAll('{in}', fileName).replaceAll('{out}', obj)}` // out and input handling
        if (!executable) {
          console.log(fileName + ' skipped due to wrong configuration')
          continue
        }
        console.log(cmd)
        execSync(cmd, { stdio: 'inherit' })
      }
      if (fs.existsSync(obj + '_compile_commands.json'))
        compileCommandsFiles.push(obj + '_compile_commands.json')
    }

    const finalOutName = `${build_dir}/${name}${group.finalExeSuffix ? `.${group.finalExeSuffix}` : ``}`
    if (group.finalExe.length > 0 && linkNeedsRebuild(finalOutName, objects)) {
      let finalFlags = group.finalFlags
      if (group.finalFlagsToBeRemoved.length > 0)
        for (const remove of group.finalFlagsToBeRemoved)
          finalFlags = finalFlags.replaceAll(remove, '')

      const cmd = `${group.finalExe} ${finalFlags.replaceAll('{out}', finalOutName).replaceAll('{in}', objects.map(x => group.finalInputPattern.replaceAll('{in}', x)).join(' '))}`
      console.log(cmd)
      execSync(cmd, {
        stdio: 'inherit'
      })
    }
  }
  if (compileCommandsFiles.length > 0) {
    let compileCommands = '['
    for (const file of compileCommandsFiles) compileCommands += fs.readFileSync(file)
    compileCommands += ']'
    fs.writeFileSync(path.join(process.cwd(), build_dir, 'compile_commands.json'), compileCommands)
  }
})

// #endregion
