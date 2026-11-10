#!/usr/bin/env node
import React, { useEffect, useState } from 'react'
import { Box, Text, render, useApp, useInput } from 'ink'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

type Value = boolean | number | string
type Values = Record<string, Value>
type Condition = (values: Readonly<Values>) => boolean

interface NodeBase {
  title: string
  help?: string
  dependsOn?: Condition
  visibleIf?: Condition
  dependsOnText?: string
}

interface MenuNode extends NodeBase {
  type: 'menu'
  name?: string
  symbolType?: 'bool' | 'tristate'
  default?: boolean | 'n' | 'm' | 'y'
  children: ConfigNode[]
}

interface CommentNode extends NodeBase {
  type: 'comment'
}

interface BoolNode extends NodeBase {
  type: 'bool'
  name: string
  default?: boolean
}

interface TristateNode extends NodeBase {
  type: 'tristate'
  name: string
  default?: 'n' | 'm' | 'y'
}

interface ChoiceNode extends NodeBase {
  type: 'choice'
  name: string
  options: { value: string; title: string }[]
  default?: string
}

interface StringNode extends NodeBase {
  type: 'string'
  name: string
  default?: string
  pattern?: string
}

interface NumberNode extends NodeBase {
  type: 'int' | 'hex'
  name: string
  default?: number
  min?: number
  max?: number
}

type ConfigNode =
  | MenuNode
  | CommentNode
  | BoolNode
  | TristateNode
  | ChoiceNode
  | StringNode
  | NumberNode
type SymbolNode =
  | Exclude<ConfigNode, MenuNode | CommentNode>
  | (MenuNode & { name: string; symbolType: 'bool' | 'tristate' })

interface MenuState {
  menu: MenuNode
  cursor: number
  scroll: number
}

interface SearchResult {
  node: ConfigNode
  parents: MenuNode[]
}

type Mode =
  | { type: 'normal' }
  | { type: 'search'; query: string }
  | { type: 'edit'; node: StringNode | NumberNode; draft: string }
  | { type: 'help' | 'info'; node: ConfigNode | undefined }
  | { type: 'instructions' }
  | { type: 'exit' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateNodes(nodes: unknown, symbols = new Set<string>()): asserts nodes is ConfigNode[] {
  if (!Array.isArray(nodes)) throw new Error('The options export must contain an options array.')

  for (const candidate of nodes) {
    if (!isRecord(candidate) || typeof candidate.type !== 'string')
      throw new Error('Every option must be an object with a type.')
    if (typeof candidate.title !== 'string' || candidate.title.trim() === '')
      throw new Error('Every option must have a non-empty title.')

    if (candidate.type === 'menu') {
      if (candidate.name !== undefined) {
        if (typeof candidate.name !== 'string' || candidate.name.trim() === '')
          throw new Error(`Menu "${candidate.title}" has an invalid symbol name.`)
        if (symbols.has(candidate.name)) throw new Error(`Duplicate option name: ${candidate.name}`)
        symbols.add(candidate.name)
        if (candidate.symbolType !== 'bool' && candidate.symbolType !== 'tristate')
          throw new Error(`${candidate.name}.symbolType must be bool or tristate.`)
      }
      validateNodes(candidate.children, symbols)
      continue
    }
    if (candidate.type === 'comment') continue

    if (!['bool', 'tristate', 'choice', 'string', 'int', 'hex'].includes(candidate.type))
      throw new Error(`Unknown option type: ${candidate.type}`)
    if (typeof candidate.name !== 'string' || candidate.name.trim() === '')
      throw new Error(`Option "${candidate.title}" must have a name.`)
    if (symbols.has(candidate.name)) throw new Error(`Duplicate option name: ${candidate.name}`)
    symbols.add(candidate.name)
    if (candidate.dependsOn !== undefined && typeof candidate.dependsOn !== 'function')
      throw new Error(`${candidate.name}.dependsOn must be a JavaScript function.`)
    if (candidate.visibleIf !== undefined && typeof candidate.visibleIf !== 'function')
      throw new Error(`${candidate.name}.visibleIf must be a JavaScript function.`)

    if (candidate.type === 'choice') {
      if (!Array.isArray(candidate.options) || candidate.options.length === 0)
        throw new Error(`${candidate.name} must define at least one choice option.`)
      for (const option of candidate.options) {
        if (
          !isRecord(option) ||
          typeof option.value !== 'string' ||
          typeof option.title !== 'string'
        )
          throw new Error(`${candidate.name} options need string value and title fields.`)
      }
    }
  }
}

function defaultValues(nodes: ConfigNode[]): Values {
  const values: Values = {}
  const visit = (node: ConfigNode) => {
    if (node.type === 'menu') {
      if (node.name && node.symbolType) {
        values[node.name] = node.default ?? (node.symbolType === 'bool' ? false : 'n')
      }
      node.children.forEach(visit)
    } else if (node.type !== 'comment') {
      switch (node.type) {
        case 'bool':
          values[node.name] = node.default ?? false
          break
        case 'tristate':
          values[node.name] = node.default ?? 'n'
          break
        case 'choice':
          values[node.name] =
            node.default && node.options.some(option => option.value === node.default)
              ? node.default
              : node.options[0].value
          break
        case 'string':
          values[node.name] = node.default ?? ''
          break
        case 'int':
        case 'hex':
          values[node.name] = node.default ?? 0
          break
      }
    }
  }
  nodes.forEach(visit)
  return values
}

function collectSymbols(nodes: ConfigNode[]): SymbolNode[] {
  const symbols: SymbolNode[] = []
  const visit = (node: ConfigNode) => {
    if (node.type === 'menu') {
      if (isMenuSymbol(node)) symbols.push(node)
      node.children.forEach(visit)
    } else if (node.type !== 'comment') symbols.push(node)
  }
  nodes.forEach(visit)
  return symbols
}

function configSymbolName(node: SymbolNode): string {
  return node.name.startsWith('CONFIG_') ? node.name.slice(7) : node.name
}

function configSymbolType(node: SymbolNode): string {
  return node.type === 'menu' ? node.symbolType : node.type
}

function serializeConfig(nodes: ConfigNode[], values: Values): string {
  return collectSymbols(nodes).map(node => {
    const key = `CONFIG_${configSymbolName(node)}`
    const value = values[node.name]
    const type = configSymbolType(node)
    if (type === 'bool' || type === 'tristate') {
      const state = type === 'bool' ? (value ? 'y' : 'n') : value
      return state === 'n' ? `# ${key} is not set` : `${key}=${state}`
    }
    if (type === 'string' || type === 'choice') return `${key}=${JSON.stringify(value)}`
    if (type === 'hex') return `${key}=0x${Number(value).toString(16)}`
    return `${key}=${value}`
  }).join('\n') + '\n'
}

function parseConfig(contents: string, symbols: SymbolNode[]): Values {
  try {
    const document: unknown = JSON.parse(contents)
    const stored = isRecord(document) && isRecord(document.values) ? document.values : document
    if (isRecord(stored)) {
      const values: Values = {}
      for (const node of symbols) {
        const storedValue = stored[node.name]
        if (storedValue !== undefined && validValue(node, storedValue))
          values[node.name] = storedValue
      }
      return values
    }
  } catch {
    // Parse the standard .config text format below.
  }

  const stored = new Map<string, string>()
  for (const line of contents.split(/\r?\n/)) {
    const unset = /^# CONFIG_([\w]+) is not set$/.exec(line)
    const setting = /^CONFIG_([\w]+)=(.*)$/.exec(line)
    if (unset) stored.set(unset[1], 'n')
    else if (setting) stored.set(setting[1], setting[2])
  }

  const values: Values = {}
  for (const node of symbols) {
    const raw = stored.get(configSymbolName(node))
    if (raw === undefined) continue
    const type = configSymbolType(node)
    let value: Value | undefined
    if (type === 'bool') value = raw === 'y'
    else if (type === 'tristate' && ['n', 'm', 'y'].includes(raw)) value = raw
    else if (type === 'int' && /^[-+]?\d+$/.test(raw)) value = Number(raw)
    else if (type === 'hex' && /^(?:0x)?[\da-f]+$/i.test(raw))
      value = Number.parseInt(raw.replace(/^0x/i, ''), 16)
    else if (type === 'string' || type === 'choice') {
      try {
        value = raw.startsWith('"') ? JSON.parse(raw) : raw
      } catch {
        value = undefined
      }
    }
    if (value !== undefined && validValue(node, value)) values[node.name] = value
  }
  return values
}

function validValue(node: SymbolNode, value: unknown): value is Value {
  switch (node.type) {
    case 'menu':
      return node.symbolType === 'bool'
        ? typeof value === 'boolean'
        : value === 'n' || value === 'm' || value === 'y'
    case 'bool':
      return typeof value === 'boolean'
    case 'tristate':
      return value === 'n' || value === 'm' || value === 'y'
    case 'choice':
      return typeof value === 'string' && node.options.some(option => option.value === value)
    case 'string':
      if (typeof value !== 'string') return false
      if (!node.pattern) return true
      try {
        return new RegExp(node.pattern).test(value)
      } catch {
        return false
      }
    case 'int':
    case 'hex':
      return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        (node.type !== 'hex' || value >= 0) &&
        (node.min === undefined || value >= node.min) &&
        (node.max === undefined || value <= node.max)
      )
  }
}

function conditionResult(condition: Condition, values: Values): boolean {
  try {
    return condition(values)
  } catch {
    return false
  }
}

function visibleNodes(menu: MenuNode, values: Values, showAll: boolean): ConfigNode[] {
  return menu.children.filter(node => {
    if (node.visibleIf && !conditionResult(node.visibleIf, values)) return false
    return showAll || !node.dependsOn || conditionResult(node.dependsOn, values)
  })
}

function symbolValue(node: ConfigNode | undefined, values: Values): string {
  if (!node || node.type === 'comment') return ''
  const name = node.name
  if (!name) return ''
  const value = values[name]
  if (node.type === 'menu')
    return node.symbolType === 'tristate'
      ? value === 'y' ? 'Yes' : value === 'm' ? 'Module' : 'No'
      : value ? 'Yes' : 'No'
  if (node.type === 'bool') return value ? 'Yes' : 'No'
  if (node.type === 'tristate') return value === 'y' ? 'Yes' : value === 'm' ? 'Module' : 'No'
  if (node.type === 'choice')
    return node.options.find(option => option.value === value)?.title ?? String(value)
  if (node.type === 'hex') return `0x${Number(value).toString(16)}`
  return String(value)
}

function marker(node: ConfigNode, values: Values): string {
  if (node.type === 'menu') return node.name ? markerValue(node, values) : '    '
  if (node.type === 'comment') return '--- '
  if (node.type === 'bool') return values[node.name] ? '[*] ' : '[ ] '
  if (node.type === 'tristate') {
    const value = values[node.name]
    return value === 'y' ? '<*> ' : value === 'm' ? '<M> ' : '< > '
  }
  return `<${symbolValue(node, values)}>`
}

function markerValue(node: MenuNode, values: Values): string {
  if (node.symbolType === 'tristate') {
    const value = values[node.name!]
    return value === 'y' ? '-*- ' : value === 'm' ? '<M> ' : '[ ] '
  }
  return values[node.name!] ? '[*] ' : '[ ] '
}

function rowLabel(node: ConfigNode, values: Values): string {
  const prefix = marker(node, values)
  const separator = prefix.endsWith(' ') || prefix.length === 0 ? '' : ' '
  return `${prefix}${separator}${node.title}${node.type === 'menu' ? '  --->' : ''}`
}

function isMenuSymbol(node: ConfigNode | undefined): node is MenuNode & {
  name: string
  symbolType: 'bool' | 'tristate'
} {
  return node?.type === 'menu' && node.name !== undefined && node.symbolType !== undefined
}

function flattenSearch(
  menu: MenuNode,
  values: Values,
  showAll: boolean,
  parents: MenuNode[] = []
): SearchResult[] {
  const results: SearchResult[] = []
  for (const node of visibleNodes(menu, values, showAll)) {
    results.push({ node, parents: [...parents, menu] })
    if (node.type === 'menu') results.push(...flattenSearch(node, values, showAll, [...parents, menu]))
  }
  return results
}

function initialValue(node: StringNode | NumberNode, value: Value): string {
  if (node.type === 'hex') return `0x${Number(value).toString(16)}`
  return String(value)
}

function App({
  root,
  configTitle,
  savePath,
  defaults,
  initialValues
}: {
  root: MenuNode
  configTitle: string
  savePath: string
  defaults: Values
  initialValues: Values
}) {
  const { exit } = useApp()
  const [dimensions, setDimensions] = useState({
    width: process.stdout.columns ?? 600,
    height: process.stdout.rows ?? 460
  })
  const [stack, setStack] = useState<MenuState[]>([{ menu: root, cursor: 0, scroll: 0 }])
  const [values, setValues] = useState<Values>(initialValues)
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(initialValues))
  const [mode, setMode] = useState<Mode>({ type: 'normal' })
  const [showAll, setShowAll] = useState(false)
  const [searchCursor, setSearchCursor] = useState(0)
  const [status, setStatus] = useState('')

  useEffect(() => {
    const resize = () =>
      setDimensions({
        width: process.stdout.columns ?? 80,
        height: process.stdout.rows ?? 24
      })
    process.stdout.on('resize', resize)
    return () => {
      process.stdout.off('resize', resize)
    }
  }, [])

  const current = stack[stack.length - 1]
  const entries = visibleNodes(current.menu, values, showAll)
  const maxCursor = Math.max(0, entries.length - 1)
  const selectedIndex = Math.min(current.cursor, maxCursor)
  const selected = entries[selectedIndex]
  const dirty = JSON.stringify(values) !== savedSnapshot
  const searchResults =
    mode.type === 'search' && mode.query.trim()
      ? flattenSearch(root, values, showAll).filter(result => {
          const query = mode.query.toLocaleLowerCase()
          const name = 'name' in result.node ? result.node.name : ''
          return `${result.node.title} ${name} ${result.node.help ?? ''}`
            .toLocaleLowerCase()
            .includes(query)
        })
      : []
  const viewEntries = mode.type === 'search' ? searchResults.map(result => result.node) : entries
  const cursor =
    mode.type === 'search'
      ? Math.max(0, Math.min(searchCursor, searchResults.length - 1))
      : selectedIndex
  const listHeight = Math.max(1, dimensions.height - 6)
  const scroll =
    mode.type === 'search'
      ? Math.max(0, Math.min(cursor, viewEntries.length - listHeight))
      : Math.min(current.scroll, Math.max(0, viewEntries.length - listHeight))
  const visibleEntries = viewEntries.slice(scroll, scroll + listHeight)
  const selectedNode = viewEntries[cursor]
  const screenWidth = Math.max(1, dimensions.width)
  const frameHeight = Math.max(6, dimensions.height - 1)
  const innerWidth = Math.max(1, screenWidth - 2)
  const labels = viewEntries.map(node => rowLabel(node, values))
  const menuWidth = Math.max(1, Math.min(innerWidth, Math.max(1, ...labels.map(label => label.length))))
  const menuIndent = Math.max(0, Math.floor((innerWidth - menuWidth) / 2))
  const footer =
    'F1Help─F2Sym Info─F3Insts─F4Config─F5Back─F6Save─F7Load─F8Sym Search─F9Exit'
  const footerLine = footer + '─'.repeat(Math.max(0, innerWidth - footer.length))

  function setCurrentCursor(next: number) {
    const bounded = Math.max(0, Math.min(entries.length - 1, next))
    setStack(previous =>
      previous.map((state, index) =>
        index === previous.length - 1
          ? { ...state, cursor: bounded, scroll: Math.max(0, bounded - listHeight + 1) }
          : state
      )
    )
  }

  function setSymbol(node: SymbolNode, value: Value) {
    if (validValue(node, value)) setValues(previous => ({ ...previous, [node.name]: value }))
  }

  function activate(node: ConfigNode | undefined) {
    if (!node) return
    if (node.type === 'menu') {
      setStack(previous => [...previous, { menu: node, cursor: 0, scroll: 0 }])
      setMode({ type: 'normal' })
    } else if (node.type === 'bool') {
      setSymbol(node, !values[node.name])
    } else if (node.type === 'tristate') {
      const value = values[node.name]
      setSymbol(node, value === 'n' ? 'm' : value === 'm' ? 'y' : 'n')
    } else if (node.type === 'choice') {
      const index = node.options.findIndex(option => option.value === values[node.name])
      setSymbol(node, node.options[(index + 1) % node.options.length].value)
    } else if (node.type !== 'comment') {
      setMode({ type: 'edit', node, draft: initialValue(node, values[node.name]) })
    }
  }

  function adjust(node: ConfigNode | undefined, direction: number) {
    if (!node) return
    if (isMenuSymbol(node)) {
      if (node.symbolType === 'bool') setSymbol(node, !values[node.name])
      else {
        const order: Array<'n' | 'm' | 'y'> = ['n', 'm', 'y']
        const index = order.indexOf(values[node.name] as 'n' | 'm' | 'y')
        setSymbol(node, order[(index + direction + order.length) % order.length])
      }
    } else if (node.type === 'tristate') {
      const order: Array<'n' | 'm' | 'y'> = ['n', 'm', 'y']
      const index = order.indexOf(values[node.name] as 'n' | 'm' | 'y')
      setSymbol(node, order[(index + direction + order.length) % order.length])
    } else if (node.type === 'choice') {
      const index = node.options.findIndex(option => option.value === values[node.name])
      setSymbol(node, node.options[(index + direction + node.options.length) % node.options.length].value)
    } else if (node.type === 'bool') setSymbol(node, !values[node.name])
  }

  function save(): boolean {
    try {
      fs.mkdirSync(path.dirname(savePath), { recursive: true })
      fs.writeFileSync(savePath, serializeConfig(root.children, values))
      setSavedSnapshot(JSON.stringify(values))
      setStatus(`Saved ${path.relative(process.cwd(), savePath) || savePath}`)
      return true
    } catch (error) {
      setStatus(`Save failed: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  function load() {
    try {
      const contents = fs.readFileSync(savePath, 'utf8')
      const next = { ...defaults, ...parseConfig(contents, collectSymbols(root.children)) }
      setValues(next)
      setSavedSnapshot(JSON.stringify(next))
      setStatus(`Loaded ${path.relative(process.cwd(), savePath) || savePath}`)
    } catch (error) {
      setStatus(`Load failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  function requestExit() {
    if (dirty) setMode({ type: 'exit' })
    else exit()
  }

  function chooseSearchResult(result: SearchResult | undefined) {
    if (!result) return
    const nextStack = result.parents.map((menu, index) => {
      const child = result.parents[index + 1] ?? result.node
      const childIndex = visibleNodes(menu, values, showAll).indexOf(child)
      return { menu, cursor: Math.max(0, childIndex), scroll: 0 }
    })
    setStack(nextStack)
    setMode({ type: 'normal' })
  }

  useInput((input, key) => {
    const namedKey = key as typeof key & {
      f1?: boolean
      f2?: boolean
      f3?: boolean
      f4?: boolean
      f5?: boolean
      f6?: boolean
      f7?: boolean
      f8?: boolean
      f9?: boolean
    }

    if (mode.type === 'edit') {
      if (key.escape) setMode({ type: 'normal' })
      else if (key.return) {
        const { node, draft } = mode
        let value: Value | undefined
        if (node.type === 'string') value = draft
        else if (node.type === 'int' && /^[-+]?\d+$/.test(draft)) value = Number(draft)
        else if (node.type === 'hex' && /^(?:0x)?[\da-f]+$/i.test(draft))
          value = Number.parseInt(draft.replace(/^0x/i, ''), 16)
        if (value !== undefined && validValue(node, value)) {
          setSymbol(node, value)
          setMode({ type: 'normal' })
          setStatus(`${node.name} updated`)
        } else setStatus(`Invalid value for ${node.name}`)
      } else if (key.backspace || key.delete) setMode({ ...mode, draft: mode.draft.slice(0, -1) })
      else if (input && !key.ctrl && !key.meta && input >= ' ')
        setMode({ ...mode, draft: mode.draft + input })
      return
    }

    if (mode.type === 'search') {
      if (key.escape) setMode({ type: 'normal' })
      else if (key.return) chooseSearchResult(searchResults[cursor])
      else if (key.upArrow) setSearchCursor(Math.max(0, searchCursor - 1))
      else if (key.downArrow)
        setSearchCursor(Math.max(0, Math.min(searchResults.length - 1, searchCursor + 1)))
      else if (key.backspace || key.delete) {
        setMode({ type: 'search', query: mode.query.slice(0, -1) })
        setSearchCursor(0)
      } else if (input && !key.ctrl && !key.meta && input >= ' ') {
        setMode({ type: 'search', query: mode.query + input })
        setSearchCursor(0)
      }
      return
    }

    if (mode.type === 'help' || mode.type === 'info' || mode.type === 'instructions') {
      setMode({ type: 'normal' })
      return
    }

    if (mode.type === 'exit') {
      if (input.toLowerCase() === 'y') {
        if (save()) exit()
      } else if (input.toLowerCase() === 'n') exit()
      else if (input.toLowerCase() === 'c' || key.escape) setMode({ type: 'normal' })
      return
    }

    if (key.upArrow || (key.shift && key.tab)) setCurrentCursor(current.cursor - 1)
    else if (key.downArrow || key.tab) setCurrentCursor(current.cursor + 1)
    else if (key.pageUp) setCurrentCursor(current.cursor - listHeight)
    else if (key.pageDown) setCurrentCursor(current.cursor + listHeight)
    else if (key.home) setCurrentCursor(0)
    else if (key.end) setCurrentCursor(entries.length - 1)
    else if (key.leftArrow && (isMenuSymbol(selected) || selected?.type === 'choice' || selected?.type === 'tristate'))
      adjust(selected, -1)
    else if (key.rightArrow && (isMenuSymbol(selected) || selected?.type === 'choice' || selected?.type === 'tristate'))
      adjust(selected, 1)
    else if (key.return || (key.rightArrow && selected?.type === 'menu')) activate(selected)
    else if (input === ' ' && isMenuSymbol(selected)) adjust(selected, 1)
    else if (input === ' ') activate(selected)
    else if (key.leftArrow || key.escape) {
      if (stack.length > 1) setStack(stack.slice(0, -1))
    } else if (namedKey.f1 || input === '?')
      setMode({ type: 'help', node: selected })
    else if (namedKey.f2 || input === 'i') setMode({ type: 'info', node: selected })
    else if (namedKey.f3) setMode({ type: 'instructions' })
    else if (namedKey.f4 || input === 'a') setShowAll(value => !value)
    else if (namedKey.f5 && stack.length > 1) setStack(stack.slice(0, -1))
    else if (namedKey.f6 || input === 's') save()
    else if (namedKey.f7 || input === 'l') load()
    else if (namedKey.f8 || input === '/') {
      setMode({ type: 'search', query: '' })
      setSearchCursor(0)
    } else if (namedKey.f9 || input.toLowerCase() === 'q' || (key.ctrl && input === 'c'))
      requestExit()
    else if (input === 'y' && selected?.type === 'bool') setSymbol(selected, true)
    else if (input === 'n' && selected?.type === 'bool') setSymbol(selected, false)
    else if (input === 'm' && selected?.type === 'tristate') setSymbol(selected, 'm')
    else if (input === 'y' && selected?.type === 'tristate') setSymbol(selected, 'y')
    else if (input === 'n' && selected?.type === 'tristate') setSymbol(selected, 'n')
    else if (input === 'y' && isMenuSymbol(selected))
      setSymbol(selected, selected.symbolType === 'bool' ? true : 'y')
    else if (input === 'n' && isMenuSymbol(selected))
      setSymbol(selected, selected.symbolType === 'bool' ? false : 'n')
    else if (input === 'm' && isMenuSymbol(selected) && selected.symbolType === 'tristate')
      setSymbol(selected, 'm')
  })

  return (
    <Box width={screenWidth} height={dimensions.height} flexDirection="column" 
        borderStyle="single">
        <Box top={-1} justifyContent='center'>
          <Text inverse bold>{` ${configTitle} `}</Text>
        </Box>
        <Box
          width={screenWidth - 2}
          flexGrow={1}
          alignItems="center"
          justifyContent="flex-start"
          flexDirection="column"
        >
            {mode.type === 'search' ? (
              <Text color="yellow">Symbol Search: {mode.query}_</Text>
            ) : null}
            {mode.type === 'help' || mode.type === 'info' ? (
              <>
                <Text bold>{mode.node?.title ?? 'No selection'}</Text>
                {mode.type === 'info' && mode.node && mode.node.type !== 'comment' ? (
                  <Text>Symbol: {'name' in mode.node ? mode.node.name : ''}  Value: {symbolValue(mode.node, values)}</Text>
                ) : null}
                {(mode.node?.help ?? 'No help text is available for this item.')
                  .split('\n')
                  .map((line, index) => <Text key={index}>{line}</Text>)}
                <Text dimColor>Press any key to return</Text>
              </>
            ) : mode.type === 'instructions' ? (
              <>
                <Text bold>Configuration instructions</Text>
                <Text>Use the arrow keys to navigate and Enter to open a submenu.</Text>
                <Text>Press Space, Y, N, or M to change the selected symbol.</Text>
                <Text>F1 Help  F2 Symbol Info  F4 Show Config  F5 Back</Text>
                <Text>F6 Save  F7 Load  F8 Symbol Search  F9 Exit</Text>
                <Text dimColor>Press any key to return</Text>
              </>
            ) : mode.type === 'edit' ? (
              <>
                <Text bold>{mode.node.title}</Text>
                <Text>Value: {mode.draft}_</Text>
                <Text>Enter accepts, Esc cancels</Text>
              </>
            ) : mode.type === 'exit' ? (
              <>
                <Text bold>Unsaved changes</Text>
                <Text>Save configuration before exiting? [Y]es [N]o [C]ancel</Text>
              </>
            ) : visibleEntries.length === 0 ? (
              <Text>No matching symbols</Text>
            ) : (
              visibleEntries.map((node, offset) => {
                const rowIndex = scroll + offset
                const isSelected = rowIndex === cursor
                const label = rowLabel(node, values)
                const clipped = label.length > menuWidth ? `${label.slice(0, menuWidth - 1)}…` : label
                return (
                  <Text
                    key={`${node.type}-${'name' in node ? node.name : node.title}-${rowIndex}`}
                    inverse={isSelected}
                    color={node.type === 'comment' ? 'yellow' : 'white'}
                  >
                    {clipped.padEnd(menuWidth)}
                  </Text>
                )
              })
            )}
          </Box>
        <Box position='absolute' bottom={-1}>
          <Text>{footerLine.slice(0, innerWidth)}</Text>
        </Box>
      </Box>
  )
}

async function main() {
  const configArgument = process.argv[2]
  if (configArgument === '--help' || configArgument === '-h') {
    console.log('Usage: nconfig [options.js]')
    return
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error('nconfig needs an interactive terminal.')

  const configPath = path.resolve(process.cwd(), configArgument ?? 'options.js')
  const imported = await import(pathToFileURL(configPath).href)
  const rawConfig: unknown = imported.default ?? imported.config
  if (!isRecord(rawConfig)) throw new Error(`${configPath} must default-export a configuration object.`)
  validateNodes(rawConfig.options)

  const root: MenuNode = {
    type: 'menu',
    title: typeof rawConfig.title === 'string' ? rawConfig.title : 'Main Menu',
    children: rawConfig.options
  }
  const defaults = defaultValues(root.children)
  const savePath = path.resolve(
    process.cwd(),
    typeof rawConfig.saveFile === 'string' ? rawConfig.saveFile : '.config'
  )
  const symbols = collectSymbols(root.children)
  const initialValues = fs.existsSync(savePath)
    ? { ...defaults, ...parseConfig(fs.readFileSync(savePath, 'utf8'), symbols) }
    : defaults
  process.stdout.write('\x1b[?1049h\x1b[?7l')
  const instance = render(
    <App
      root={root}
      configTitle={root.title}
      savePath={savePath}
      defaults={defaults}
      initialValues={initialValues}
    />
  )
  try {
    await instance.waitUntilExit()
  } finally {
    instance.unmount()
    process.stdout.write('\x1b[?7h\x1b[?1049l')
  }
}

main().catch(error => {
  console.error(`nconfig: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})