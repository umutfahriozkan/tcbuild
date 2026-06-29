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

import './util.js'
import { globalExtExecutable, globalExtFlags, globalExtSuffix } from './tree.js'
build()

import fs from 'node:fs'

function needsRebuild(src: string, obj: string): boolean {
  if (!fs.existsSync(src)) throw new Error(`${src} does not existis!`)
  if (!fs.existsSync(obj)) return true

  const srcTime = fs.statSync(src).mtimeMs
  const objTime = fs.statSync(obj).mtimeMs

  if (srcTime > objTime) return true

  const dep = obj + ".d"
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

process.once('beforeExit', async () => {
  let targets = ''
  let make_out = ''

  for (const [name, group] of Object.entries(groups)) {
    const out_name = `${build_dir}/${name}`
    targets += `${out_name}${group.finalExeSuffix} `

    let recipe = ''
    let objects = ''
    let non_objects = ''
    for (const fileName in group.files) {
      if (!Object.hasOwn(group.files, fileName)) continue
      const file = group.files[fileName]!
      const fileLastExt = fileName.split('.').pop()!

      let obj_out = `${build_dir}/${fileName}${globalExtSuffix[fileLastExt] ? `.${globalExtSuffix[fileLastExt]}` : ''}`
      if (file.includeInFinalOutput) objects += ` ${obj_out}`
      else non_objects += ` ${obj_out}`

      let final_flags = `${/* globalSrcFileFlags */ ''} ${file.flags ?? ''}`

      for (const ext of fileName.split('.').slice(1)) {
        if (ext.length <= 0) continue

        final_flags += `${globalExtFlags[ext] ?? ''} ${group.extFlags[ext] ?? ''}`
      }

      if (file.toBeRemoved.length > 0)
        for (const remove of file.toBeRemoved) final_flags = final_flags.replaceAll(remove, '')

      recipe += `${obj_out}: ${fileName}\n\t@mkdir -p $(dir $@)\n\t${file.executable || /*globalSrcFileExec ||*/ group.extExecutable[fileLastExt] || globalExtExecutable[fileLastExt]} ${final_flags}\n`
    }
    let group_final_flags = group.finalFlags
    if (group.finalFlagsToBeRemoved.length > 0)
      for (const remove of group.finalFlagsToBeRemoved)
        group_final_flags = group_final_flags.replaceAll(remove, '')

    make_out += `OBJ_${name}=${objects}\n${out_name}${group.finalExeSuffix}:${non_objects} $(OBJ_${name})\n\t${group.finalExe} ${group_final_flags}\n${recipe}-include $(OBJ_${name}:=.d)\n`
  }

  await fs.promises.writeFile('./Makefile', `all: ${targets}\n${make_out}`)
})
