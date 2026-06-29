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
// #endregion

// #region Tree Builder
declare global {
  var build: typeof _build
  var extExecutable: typeof _extExecutable
  var extFlags: typeof _extFlags
  var extSuffix: typeof _extSuffix
  var groupFinalExecutable: typeof _groupFinalExecutable
  var groupFinalExecutableSuffix: typeof _groupFinalExecutableSuffix
  var groupFinalFlags: typeof _groupFinalFlags
  var groupFinalFlagsInputPattern: typeof _groupFinalFlagsInputPattern
  var groupFile: typeof _groupFile
  var group: typeof _group

  var globalExtSuffix: StringKeyValue
  var globalExtExecutable: StringKeyValue
  var globalExtFlags: StringKeyValue
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
      flags: string
      executable: string
      toBeRemoved: string[]
      includeInFinalOutput: boolean
    }
  >
  extFlags: StringKeyValue
  extExecutable: StringKeyValue
  finalFlags: string
  finalFlagsToBeRemoved: string[]
  finalExe: string
  finalExeSuffix: string
  finalInputPattern: string
}

global.globalExtExecutable = {}
global.globalExtFlags = {}
global.globalExtSuffix = {}

const groups: Record<string, Group> = {}
let currentGroup: Group | null = null

//
function _extExecutable(ext: string, exec?: string): string {
  if (currentGroup === null) {
    if (exec) globalExtExecutable[ext] = exec
    else return globalExtExecutable[ext] ?? ''
  } else {
    if (exec) currentGroup.extExecutable[ext] = exec
    else return currentGroup.extExecutable[ext] ?? ''
  }
  return ''
}
global.extExecutable = _extExecutable

function _extFlags(ext: string, flags?: string): string {
  if (currentGroup === null) {
    if (!globalExtFlags[ext]) globalExtFlags[ext] = ''
    if (flags) globalExtFlags[ext] += ` ${flags}`
    else return globalExtFlags[ext] ?? ''
  } else {
    if (!currentGroup.extFlags[ext]) currentGroup.extFlags[ext] = ''
    if (flags) currentGroup.extFlags[ext] += ` ${flags}`
    else return currentGroup.extFlags[ext] ?? ''
  }
  return ''
}
global.extFlags = _extFlags

function _extSuffix(ext: string, suffix?: string): string {
  if (!globalExtSuffix[ext]) globalExtSuffix[ext] = ''
  if (suffix) {
    globalExtSuffix[ext] = suffix
    return suffix
  } else return globalExtSuffix[ext]
}
global.extSuffix = _extSuffix

function _groupFinalFlags(flags: string, toBeRemoved: string) {
  if (!currentGroup) throw 'any group function called outside of group'
  if (flags) {
    currentGroup.finalFlags += ` ${flags}`
    if (toBeRemoved) currentGroup.finalFlagsToBeRemoved.push(toBeRemoved)
  } else return currentGroup.finalFlags
}
global.groupFinalFlags = _groupFinalFlags

function _groupFinalExecutable(exe: string) {
  if (!currentGroup) throw 'any group function called outside of group'
  if (exe) currentGroup.finalExe = exe
  else return currentGroup.finalExe
}
global.groupFinalExecutable = _groupFinalExecutable

function _groupFinalExecutableSuffix(suffix: string) {
  if (!currentGroup) throw 'any group function called outside of group'
  if (suffix) currentGroup.finalExeSuffix = suffix
  else return currentGroup.finalExeSuffix
}
global.groupFinalExecutableSuffix = _groupFinalExecutableSuffix

function _groupFinalFlagsInputPattern(pattern: string) {
  if (!currentGroup) throw 'any group function called outside of group'
  if (pattern) currentGroup.finalInputPattern = pattern
}
global.groupFinalFlagsInputPattern = _groupFinalFlagsInputPattern

function _groupFile(
  fileName: string,
  flags?: string,
  options?: { toBeRemoved?: string; includeInFinalOutput?: boolean }
): void {
  if (!currentGroup) throw 'any group function called outside of group'
  const file = contextStack.join('/') + (contextStack.length > 0 ? '/' : '') + fileName
  const existisFile = currentGroup.files[file]
  if (existisFile) {
    if (flags) existisFile.flags += ` ${flags}`
    if (options?.toBeRemoved) existisFile.toBeRemoved.push(options.toBeRemoved)
    if (options?.includeInFinalOutput !== undefined)
      existisFile.includeInFinalOutput = options.includeInFinalOutput
  } else {
    currentGroup.files[file] = {
      flags: flags ?? '',
      executable: '',
      toBeRemoved: [],
      includeInFinalOutput: true
    }
    if (options?.toBeRemoved) currentGroup.files[file].toBeRemoved.push(options.toBeRemoved)
    if (options?.includeInFinalOutput !== undefined)
      currentGroup.files[file].includeInFinalOutput = options.includeInFinalOutput
  }
}
global.groupFile = _groupFile

async function _group(name: string | null, fn: () => void) {
  if (name && !groups[name])
    groups[name] = {
      name,
      files: {},
      extFlags: {},
      extExecutable: {},
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

      const obj = `${build_dir}/${fileName}${globalExtSuffix[fileLastExt] ? `.${globalExtSuffix[fileLastExt]}` : ''}`
      const objFullPath = path.join(process.cwd(), obj)
      if (file.includeInFinalOutput) objects.push({ obj, fullPath: objFullPath })
      if (needsRebuild(path.join(process.cwd(), fileName), objFullPath)) {
        fs.mkdirSync(path.dirname(objFullPath), { recursive: true })

        let objFlags = `${/* globalSrcFileFlags */ ''}${file.flags ?? ''}`

        for (const ext of fileName.split('.').slice(1)) {
          if (ext.length <= 0) continue
          objFlags += `${globalExtFlags[ext] ?? ''} ${group.extFlags[ext] ?? ''}`
        }

        if (file.toBeRemoved.length > 0)
          for (const remove of file.toBeRemoved) objFlags = objFlags.replaceAll(remove, '')

        const executable =
          file.executable ||
          /*globalSrcFileExec ||*/ group.extExecutable[fileLastExt] ||
          globalExtExecutable[fileLastExt]
        const cmd = `${executable} ${objFlags.replaceAll('{in}', fileName).replaceAll('{out}', obj)}` // out and input handling
        console.log(cmd)
        execSync(cmd, { stdio: 'inherit' })
      }
    }

    const finalOutName = `${build_dir}/${name}${group.finalExeSuffix ? `.${group.finalExeSuffix}` : ``}`
    const finalOutFullPath = path.join(process.cwd(), finalOutName)
    if (
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
