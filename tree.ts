import url from "node:url";
import path from "node:path"

declare global {
  var groups: Record<string, Group>
  var build: typeof _build
  var extExecutable: typeof _extExecutable
  var extFlags: typeof _extFlags
  var extSuffix: typeof _extSuffix
  var groupFinalExecutable: typeof _groupFinalExecutable
  var groupFinalExecutableSuffix: typeof _groupFinalExecutableSuffix
  var groupFinalFlags: typeof _groupFinalFlags
  var groupFile: typeof _groupFile
  var group: typeof _group
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
}

const globalExtExecutable: StringKeyValue = {}
const globalExtFlags: StringKeyValue = {}
const globalExtSuffix: StringKeyValue = {}
global.groups = {}
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
    if (suffix) {globalExtSuffix[ext] = suffix; return suffix }
    else return globalExtSuffix[ext]
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
      finalExeSuffix: ''
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

export {globalExtExecutable, globalExtSuffix, globalExtFlags}