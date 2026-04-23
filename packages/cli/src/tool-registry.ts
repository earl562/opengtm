import { randomUUID } from 'node:crypto'
import { exec as execCallback, spawn } from 'node:child_process'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import path from 'node:path'
import { openSystemBrowser } from './oauth.js'

export type OpenGtmHarnessPrimitiveCategory =
  | 'file'
  | 'shell'
  | 'web'
  | 'lsp'
  | 'interaction'
  | 'planning'
  | 'subagent'

export interface OpenGtmHarnessPrimitive {
  name: string
  category: OpenGtmHarnessPrimitiveCategory
  description: string
  available: boolean
  rationale: string
}

const exec = promisify(execCallback)
const PROCESS_STORE_PATH = '.opengtm/processes.json'
const TODO_STORE_PATH = '.opengtm/todos.json'
const INTERACTION_STORE_PATH = '.opengtm/interactions.json'

export interface OpenGtmBackgroundProcessRecord {
  id: string
  command: string
  cwd: string
  pid: number
  status: 'running' | 'exited' | 'killed' | 'failed'
  outputPath: string
  startedAt: string
  endedAt?: string
}

export interface OpenGtmTodoRecord {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  updatedAt: string
}

export interface OpenGtmInteractionPromptRecord {
  id: string
  kind: 'ask_user' | 'present_plan'
  prompt: string
  choices: string[]
  plan?: unknown
  response?: string | null
  respondedAt?: string | null
  createdAt: string
}

const OPEN_GTM_HARNESS_PRIMITIVES: readonly OpenGtmHarnessPrimitive[] = [
  { name: 'read_file', category: 'file', description: 'Read file contents with line awareness.', available: true, rationale: 'Implemented through local filesystem utilities and CLI handlers.' },
  { name: 'write_file', category: 'file', description: 'Create or overwrite files explicitly.', available: true, rationale: 'Implemented through local filesystem utilities and CLI handlers.' },
  { name: 'edit_file', category: 'file', description: 'Apply in-place file edits.', available: true, rationale: 'Implemented through local filesystem utilities and edit flows.' },
  { name: 'list_files', category: 'file', description: 'List directories and search by glob.', available: true, rationale: 'Implemented through CLI and filesystem helpers.' },
  { name: 'search', category: 'file', description: 'Search content across files.', available: true, rationale: 'Implemented through grep-style search helpers.' },
  { name: 'run_command', category: 'shell', description: 'Execute shell commands and capture output.', available: true, rationale: 'Implemented through command execution in the harness environment.' },
  { name: 'list_processes', category: 'shell', description: 'Inspect background process state.', available: true, rationale: 'Implemented with a persisted local process store.' },
  { name: 'get_process_output', category: 'shell', description: 'Read captured output from background tasks.', available: true, rationale: 'Implemented with persisted output files for background commands.' },
  { name: 'kill_process', category: 'shell', description: 'Stop a running background task.', available: true, rationale: 'Implemented against the persisted local process store.' },
  { name: 'fetch_url', category: 'web', description: 'Fetch and summarize web content.', available: true, rationale: 'Implemented through web fetch helpers and connector flows.' },
  { name: 'web_search', category: 'web', description: 'Search the web for supporting context.', available: true, rationale: 'Implemented through a lightweight web search surface.' },
  { name: 'capture_web_screenshot', category: 'web', description: 'Capture visual web state.', available: true, rationale: 'Implemented through Playwright CLI screenshot capture.' },
  { name: 'open_browser', category: 'web', description: 'Open the system browser for interactive flows.', available: true, rationale: 'Implemented for OAuth and browser-assisted flows.' },
  { name: 'find_symbol', category: 'lsp', description: 'Resolve symbol definitions semantically.', available: true, rationale: 'Implemented through repository-wide symbol search heuristics.' },
  { name: 'find_referencing_symbols', category: 'lsp', description: 'Find semantic symbol references.', available: true, rationale: 'Implemented through repository-wide reference search heuristics.' },
  { name: 'rename_symbol', category: 'lsp', description: 'Rename symbols across the workspace.', available: true, rationale: 'Implemented through repository-wide rename updates.' },
  { name: 'replace_symbol_body', category: 'lsp', description: 'Replace the body of a named symbol.', available: true, rationale: 'Implemented through named-symbol text replacement heuristics.' },
  { name: 'insert_before_symbol', category: 'lsp', description: 'Insert content before a named symbol.', available: true, rationale: 'Implemented through named-symbol text insertion heuristics.' },
  { name: 'insert_after_symbol', category: 'lsp', description: 'Insert content after a named symbol.', available: true, rationale: 'Implemented through named-symbol text insertion heuristics.' },
  { name: 'ask_user', category: 'interaction', description: 'Pause for structured user input or approval.', available: true, rationale: 'Implemented through interactive CLI flows and approval surfaces.' },
  { name: 'list_interactions', category: 'interaction', description: 'List pending or answered interaction prompts.', available: true, rationale: 'Implemented through the persisted interaction store.' },
  { name: 'respond_interaction', category: 'interaction', description: 'Record an operator response to a prompt or plan review.', available: true, rationale: 'Implemented through the persisted interaction store.' },
  { name: 'write_todos', category: 'planning', description: 'Track execution tasks in the harness.', available: true, rationale: 'Implemented through a persisted todo store.' },
  { name: 'present_plan', category: 'planning', description: 'Present and refine an execution plan.', available: true, rationale: 'Implemented through persisted plan records in the harness store.' },
  { name: 'task_complete', category: 'planning', description: 'Signal explicit task completion.', available: true, rationale: 'Implemented through todo completion signaling.' },
  { name: 'list_todos', category: 'planning', description: 'List tracked harness todo items.', available: true, rationale: 'Implemented through the persisted todo store.' },
  { name: 'update_todo', category: 'planning', description: 'Update an existing tracked todo item.', available: true, rationale: 'Implemented through the persisted todo store.' },
  { name: 'complete_todo', category: 'planning', description: 'Mark a tracked todo item completed.', available: true, rationale: 'Implemented through the persisted todo store.' },
  { name: 'search_tools', category: 'subagent', description: 'Search available primitives and tools by intent.', available: true, rationale: 'Implemented through this primitive registry search surface.' },
  { name: 'spawn_subagent', category: 'subagent', description: 'Delegate focused work to specialist subagents.', available: true, rationale: 'Implemented as a lightweight child-process delegation surface.' },
  { name: 'invoke_skill', category: 'subagent', description: 'Invoke prebuilt procedural skills on demand.', available: true, rationale: 'Implemented as a lightweight skill inspection/invocation surface.' },
  { name: 'batch_tool', category: 'subagent', description: 'Execute multiple independent tool calls in one grouped action.', available: true, rationale: 'Implemented through sequential grouped primitive execution.' }
] as const

export function listHarnessPrimitives() {
  return [...OPEN_GTM_HARNESS_PRIMITIVES]
}

export function searchHarnessPrimitives(query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return listHarnessPrimitives()
  return OPEN_GTM_HARNESS_PRIMITIVES.filter((primitive) =>
    primitive.name.toLowerCase().includes(normalized)
    || primitive.category.toLowerCase().includes(normalized)
    || primitive.description.toLowerCase().includes(normalized)
    || primitive.rationale.toLowerCase().includes(normalized)
  )
}

export function getHarnessPrimitive(name: string) {
  return OPEN_GTM_HARNESS_PRIMITIVES.find((primitive) => primitive.name === name) || null
}

export async function executeHarnessPrimitive(args: {
  cwd: string
  name: string
  input: Record<string, unknown>
}): Promise<any> {
  const primitive = getHarnessPrimitive(args.name)
  if (!primitive) {
    throw new Error(`Unknown primitive: ${args.name}`)
  }
  if (!primitive.available) {
    throw new Error(`Primitive ${args.name} is not yet available in the live harness.`)
  }

  switch (args.name) {
    case 'read_file':
      return runReadFile(args.cwd, args.input)
    case 'write_file':
      return runWriteFile(args.cwd, args.input)
    case 'edit_file':
      return runEditFile(args.cwd, args.input)
    case 'list_files':
      return runListFiles(args.cwd, args.input)
    case 'search':
      return runSearch(args.cwd, args.input)
    case 'run_command':
      return runCommand(args.cwd, args.input)
    case 'list_processes':
      return runListProcesses(args.cwd)
    case 'get_process_output':
      return runGetProcessOutput(args.cwd, args.input)
    case 'kill_process':
      return runKillProcess(args.cwd, args.input)
    case 'fetch_url':
      return runFetchUrl(args.input)
    case 'web_search':
      return runWebSearch(args.input)
    case 'capture_web_screenshot':
      return runCaptureWebScreenshot(args.cwd, args.input)
    case 'find_symbol':
      return runFindSymbol(args.cwd, args.input)
    case 'find_referencing_symbols':
      return runFindReferencingSymbols(args.cwd, args.input)
    case 'rename_symbol':
      return runRenameSymbol(args.cwd, args.input)
    case 'replace_symbol_body':
      return runReplaceSymbolBody(args.cwd, args.input)
    case 'insert_before_symbol':
      return runInsertAroundSymbol(args.cwd, args.input, 'before')
    case 'insert_after_symbol':
      return runInsertAroundSymbol(args.cwd, args.input, 'after')
    case 'open_browser':
      return runOpenBrowser(args.input)
    case 'ask_user':
      return runAskUser(args.cwd, args.input)
    case 'list_interactions':
      return runListInteractions(args.cwd)
    case 'respond_interaction':
      return runRespondInteraction(args.cwd, args.input)
    case 'write_todos':
      return runWriteTodos(args.cwd, args.input)
    case 'present_plan':
      return runPresentPlan(args.cwd, args.input)
    case 'task_complete':
      return runTaskComplete(args.cwd, args.input)
    case 'list_todos':
      return runListTodos(args.cwd)
    case 'update_todo':
      return runUpdateTodo(args.cwd, args.input)
    case 'complete_todo':
      return runCompleteTodo(args.cwd, args.input)
    case 'search_tools':
      return {
        kind: 'primitive.search_tools',
        query: String(args.input.query || ''),
        matches: searchHarnessPrimitives(String(args.input.query || ''))
      }
    case 'spawn_subagent':
      return runSpawnSubagent(args.cwd, args.input)
    case 'invoke_skill':
      return runInvokeSkill(args.cwd, args.input)
    case 'batch_tool':
      return runBatchTool(args.cwd, args.input)
    default:
      throw new Error(`Primitive ${args.name} is not executable yet.`)
  }
}

export function createToolCallRequest(toolName: string, input: Record<string, unknown> = {}, callId: string = randomUUID()) {
  return {
    kind: 'tool.call.request',
    callId,
    tool: toolName,
    input,
    lifecycle: {},
    permissions: {}
  }
}

function resolvePath(cwd: string, value: unknown) {
  const target = String(value || '').trim()
  if (!target) {
    throw new Error('A path value is required.')
  }
  return path.isAbsolute(target) ? target : path.join(cwd, target)
}

async function runReadFile(cwd: string, input: Record<string, unknown>) {
  const filePath = resolvePath(cwd, input.path)
  const content = await readFile(filePath, 'utf8')
  return {
    kind: 'primitive.read_file',
    filePath,
    content
  }
}

async function runWriteFile(cwd: string, input: Record<string, unknown>) {
  const filePath = resolvePath(cwd, input.path)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, String(input.content || ''), 'utf8')
  return {
    kind: 'primitive.write_file',
    filePath,
    bytes: Buffer.byteLength(String(input.content || ''), 'utf8')
  }
}

async function runEditFile(cwd: string, input: Record<string, unknown>) {
  const filePath = resolvePath(cwd, input.path)
  const before = await readFile(filePath, 'utf8')
  const search = String(input.search || '')
  if (!search) {
    throw new Error('edit_file requires a search string.')
  }
  const replace = String(input.replace || '')
  const replaceAll = input.replaceAll === true || input.replaceAll === 'true'
  let after = before
  if (before.includes(search)) {
    after = replaceAll ? before.split(search).join(replace) : before.replace(search, replace)
  } else {
    const normalizedSearch = search.replace(/\s+/g, ' ').trim()
    const normalizedSource = before.replace(/\s+/g, ' ')
    const normalizedIndex = normalizedSource.indexOf(normalizedSearch)
    if (normalizedIndex < 0) {
      throw new Error('edit_file could not locate the search string.')
    }
    after = before.replace(new RegExp(escapeRegExp(search.trim()), replaceAll ? 'g' : ''), replace)
  }
  await writeFile(filePath, after, 'utf8')
  return {
    kind: 'primitive.edit_file',
    filePath,
    changed: before !== after
  }
}

async function runListFiles(cwd: string, input: Record<string, unknown>) {
  const root = input.path ? resolvePath(cwd, input.path) : cwd
  const recursive = input.recursive === true || input.recursive === 'true'
  const pattern = typeof input.pattern === 'string' ? input.pattern.trim() : ''
  const entries = recursive ? await collectFiles(root) : (await readdir(root, { withFileTypes: true })).map((entry) => path.join(root, `${entry.name}${entry.isDirectory() ? '/' : ''}`))
  const mapped = entries
    .map((entry) => entry.startsWith(root) ? entry.slice(root.length + (root.endsWith(path.sep) ? 0 : 1)) : entry)
    .filter((entry) => !pattern || entry.toLowerCase().includes(pattern.toLowerCase()))
  return {
    kind: 'primitive.list_files',
    root,
    entries: mapped
  }
}

async function runSearch(cwd: string, input: Record<string, unknown>) {
  const root = input.path ? resolvePath(cwd, input.path) : cwd
  const query = String(input.query || '')
  if (!query) {
    throw new Error('search requires a query string.')
  }
  const useRegexp = input.useRegexp === true || input.useRegexp === 'true'
  const pattern = useRegexp ? new RegExp(query, 'i') : null
  const files = await collectFiles(root)
  const matches: Array<{ filePath: string; lines: string[] }> = []
  for (const filePath of files.slice(0, 200)) {
    try {
      const raw = await readFile(filePath, 'utf8')
      const lines = raw.split('\n')
      const matchedLines = lines
        .map((line, index) => ({ line, index }))
        .filter((item) => useRegexp ? Boolean(pattern?.test(item.line)) : item.line.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 5)
        .map((item) => `${item.index + 1}: ${item.line}`)
      if (matchedLines.length > 0) {
        matches.push({ filePath, lines: matchedLines })
      }
    } catch {
      continue
    }
  }
  return {
    kind: 'primitive.search',
    root,
    query,
    matches
  }
}

async function runCommand(cwd: string, input: Record<string, unknown>) {
  const command = String(input.command || '')
  if (!command) {
    throw new Error('run_command requires a command string.')
  }
  if (input.background === true || input.background === 'true') {
    return runCommandInBackground(cwd, command)
  }
  const result = await exec(command, { cwd, maxBuffer: 1024 * 1024 })
  return {
    kind: 'primitive.run_command',
    command,
    stdout: result.stdout,
    stderr: result.stderr
  }
}

async function runCommandInBackground(cwd: string, command: string) {
  const id = randomUUID()
  const outputPath = path.join(cwd, '.opengtm', 'process-output', `${id}.log`)
  await mkdir(path.dirname(outputPath), { recursive: true })

  const child = spawn(command, {
    cwd,
    shell: true,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  const chunks: string[] = []
  child.stdout?.on('data', (chunk) => chunks.push(String(chunk)))
  child.stderr?.on('data', (chunk) => chunks.push(String(chunk)))
  child.on('close', async () => {
    await writeFile(outputPath, chunks.join(''), 'utf8')
    const processes = await loadProcessStore(cwd)
    const record = processes.find((process) => process.id === id)
    if (!record) return
    record.status = 'exited'
    record.endedAt = new Date().toISOString()
    await saveProcessStore(cwd, processes)
  })
  child.unref()

  const record: OpenGtmBackgroundProcessRecord = {
    id,
    command,
    cwd,
    pid: child.pid || 0,
    status: 'running',
    outputPath,
    startedAt: new Date().toISOString()
  }
  const processes = await loadProcessStore(cwd)
  processes.push(record)
  await saveProcessStore(cwd, processes)

  return {
    kind: 'primitive.run_command',
    command,
    background: true,
    processId: id,
    pid: record.pid,
    outputPath
  }
}

async function runListProcesses(cwd: string) {
  return {
    kind: 'primitive.list_processes',
    processes: await loadProcessStore(cwd)
  }
}

async function runGetProcessOutput(cwd: string, input: Record<string, unknown>) {
  const processId = String(input.processId || '')
  if (!processId) {
    throw new Error('get_process_output requires processId.')
  }
  const processes = await loadProcessStore(cwd)
  const record = processes.find((process) => process.id === processId)
  if (!record) {
    throw new Error(`Unknown process: ${processId}`)
  }
  let output = ''
  try {
    output = await readFile(record.outputPath, 'utf8')
  } catch {}
  return {
    kind: 'primitive.get_process_output',
    process: record,
    output
  }
}

async function runKillProcess(cwd: string, input: Record<string, unknown>) {
  const processId = String(input.processId || '')
  if (!processId) {
    throw new Error('kill_process requires processId.')
  }
  const processes = await loadProcessStore(cwd)
  const record = processes.find((process) => process.id === processId)
  if (!record) {
    throw new Error(`Unknown process: ${processId}`)
  }
  try {
    process.kill(record.pid)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('ESRCH')) {
      throw error
    }
  }
  record.status = 'killed'
  record.endedAt = new Date().toISOString()
  await saveProcessStore(cwd, processes)
  return {
    kind: 'primitive.kill_process',
    process: record
  }
}

async function runFetchUrl(input: Record<string, unknown>) {
  const url = String(input.url || '')
  if (!url) {
    throw new Error('fetch_url requires a url.')
  }
  const response = await fetch(url)
  const body = await response.text()
  return {
    kind: 'primitive.fetch_url',
    url,
    status: response.status,
    body: body.slice(0, 10000)
  }
}

async function runWebSearch(input: Record<string, unknown>) {
  const query = String(input.query || '')
  if (!query) {
    throw new Error('web_search requires a query string.')
  }
  const endpoint = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const response = await fetch(endpoint)
  const body = await response.text()
  const matches = [...body.matchAll(/<a[^>]*class="result__a"[^>]*>(.*?)<\/a>/g)]
    .slice(0, 5)
    .map((match) => match[1].replace(/<[^>]+>/g, '').trim())
  return {
    kind: 'primitive.web_search',
    query,
    matches,
    source: endpoint
  }
}

async function runCaptureWebScreenshot(cwd: string, input: Record<string, unknown>) {
  const url = String(input.url || '')
  if (!url) {
    throw new Error('capture_web_screenshot requires a url.')
  }
  const filePath = input.path
    ? resolvePath(cwd, input.path)
    : path.join(cwd, '.opengtm', 'screenshots', `${randomUUID()}.png`)
  await mkdir(path.dirname(filePath), { recursive: true })
  const command = `npx playwright screenshot ${JSON.stringify(url)} ${JSON.stringify(filePath)}`
  const result = await exec(command, { cwd, maxBuffer: 1024 * 1024 })
  return {
    kind: 'primitive.capture_web_screenshot',
    url,
    filePath,
    stdout: result.stdout,
    stderr: result.stderr
  }
}

async function runOpenBrowser(input: Record<string, unknown>) {
  const url = String(input.url || '')
  if (!url) {
    throw new Error('open_browser requires a url.')
  }
  await openSystemBrowser(url)
  return {
    kind: 'primitive.open_browser',
    url,
    opened: true
  }
}

async function runFindSymbol(cwd: string, input: Record<string, unknown>) {
  const symbol = String(input.symbol || input.query || '').trim()
  if (!symbol) {
    throw new Error('find_symbol requires symbol.')
  }
  const semanticRoot = input.path ? resolvePath(cwd, input.path) : cwd
  const match = await findTypeScriptSymbol(semanticRoot, symbol)
  const matches = match
    ? [match]
    : (await runSearch(cwd, { query: symbol, path: input.path || '.' })).matches.map((item: { filePath: string; lines: string[] }) => ({
        filePath: item.filePath,
        line: item.lines[0] || ''
      }))
  return { kind: 'primitive.find_symbol', symbol, matches }
}

async function runFindReferencingSymbols(cwd: string, input: Record<string, unknown>) {
  const symbol = String(input.symbol || input.query || '').trim()
  if (!symbol) {
    throw new Error('find_referencing_symbols requires symbol.')
  }
  const semanticRoot = input.path ? resolvePath(cwd, input.path) : cwd
  const semanticMatches = await findTypeScriptReferences(semanticRoot, symbol)
  if (semanticMatches.length > 0) {
    return { kind: 'primitive.find_referencing_symbols', symbol, matches: semanticMatches }
  }
  const fallback = await runSearch(cwd, { query: symbol, path: input.path || '.' })
  return { kind: 'primitive.find_referencing_symbols', symbol, matches: fallback.matches }
}

async function runRenameSymbol(cwd: string, input: Record<string, unknown>) {
  const symbol = String(input.symbol || '').trim()
  const newName = String(input.newName || '').trim()
  if (!symbol || !newName) {
    throw new Error('rename_symbol requires symbol and newName.')
  }
  const changed = await renameTypeScriptSymbol(cwd, symbol, newName)
  return { kind: 'primitive.rename_symbol', symbol, newName, changed }
}

async function runReplaceSymbolBody(cwd: string, input: Record<string, unknown>) {
  const symbol = String(input.symbol || '').trim()
  const body = String(input.body || '').trim()
  if (!symbol) {
    throw new Error('replace_symbol_body requires symbol.')
  }
  return runStructuredSymbolRewrite(cwd, symbol, (_prefix) => body)
}

async function runInsertAroundSymbol(cwd: string, input: Record<string, unknown>, position: 'before' | 'after') {
  const symbol = String(input.symbol || '').trim()
  const content = String(input.content || '').trim()
  if (!symbol || !content) {
    throw new Error(`${position === 'before' ? 'insert_before_symbol' : 'insert_after_symbol'} requires symbol and content.`)
  }
  const files = await collectFiles(cwd)
  for (const filePath of files.slice(0, 300)) {
    const raw = await safeReadText(filePath)
    if (!raw) continue
    const lines = raw.split('\n')
    const index = lines.findIndex((line) => line.includes(symbol) && /(function|const|class|interface|type|export)/.test(line))
    if (index >= 0) {
      const updatedLines = [...lines]
      updatedLines.splice(position === 'before' ? index : index + 1, 0, content)
      await writeFile(filePath, updatedLines.join('\n'), 'utf8')
      return { kind: `primitive.${position === 'before' ? 'insert_before_symbol' : 'insert_after_symbol'}`, filePath, symbol }
    }
  }
  throw new Error(`Could not locate symbol ${symbol}.`)
}

async function runSpawnSubagent(cwd: string, input: Record<string, unknown>) {
  const prompt = String(input.prompt || '').trim()
  if (!prompt) {
    throw new Error('spawn_subagent requires prompt.')
  }
  const escapedPrompt = JSON.stringify(prompt)
  return runCommandInBackground(cwd, `node --input-type=module -e "import { handleInteractiveInput, loadOrCreateInteractiveSession } from './packages/cli/dist/index.js'; const cwd = process.cwd(); const session = await loadOrCreateInteractiveSession(cwd); const result = await handleInteractiveInput({ cwd, line: ${escapedPrompt}, session, recordTranscript:false }); console.log(result.output);"`)
}

async function runInvokeSkill(cwd: string, input: Record<string, unknown>) {
  const skillName = String(input.skill || '').trim()
  if (!skillName) {
    throw new Error('invoke_skill requires skill.')
  }
  const { handleSkills } = await import('./handlers/skills.js')
  const result = await handleSkills({ cwd, action: 'show', skillId: skillName })
  return { kind: 'primitive.invoke_skill', skill: skillName, result }
}

async function runBatchTool(cwd: string, input: Record<string, unknown>): Promise<any> {
  const steps = Array.isArray(input.steps) ? input.steps : []
  const parallel = input.parallel === true || input.parallel === 'true'
  const tasks = steps.map((step) => {
    const value = step as Record<string, unknown>
    return () => executeHarnessPrimitive({
      cwd,
      name: String(value.name || ''),
      input: (value.input as Record<string, unknown>) || {}
    })
  })
  const results = parallel
    ? await Promise.all(tasks.map((task) => task()))
    : await tasks.reduce<Promise<any[]>>(async (accPromise, task) => {
        const acc = await accPromise
        acc.push(await task())
        return acc
      }, Promise.resolve([]))
  return { kind: 'primitive.batch_tool', results }
}

async function runWriteTodos(cwd: string, input: Record<string, unknown>) {
  const rawTodos = Array.isArray(input.todos) ? input.todos : []
  const todos: OpenGtmTodoRecord[] = rawTodos.map((entry, index) => {
    const value = entry as Record<string, unknown>
    return {
      id: typeof value.id === 'string' && value.id ? value.id : `${Date.now()}-${index}`,
      content: String(value.content || `todo-${index + 1}`),
      status: normalizeTodoStatus(value.status),
      updatedAt: new Date().toISOString()
    }
  })
  await saveTodoStore(cwd, todos)
  return {
    kind: 'primitive.write_todos',
    todos
  }
}

async function runAskUser(cwd: string, input: Record<string, unknown>) {
  const prompt = String(input.prompt || '').trim()
  if (!prompt) {
    throw new Error('ask_user requires prompt.')
  }
  const record: OpenGtmInteractionPromptRecord = {
    id: randomUUID(),
    kind: 'ask_user',
    prompt,
    choices: Array.isArray(input.choices) ? input.choices.map((value) => String(value)) : [],
    response: null,
    respondedAt: null,
    createdAt: new Date().toISOString()
  }
  const interactions = await loadInteractionStore(cwd)
  interactions.push(record)
  await saveInteractionStore(cwd, interactions)
  return {
    kind: 'primitive.ask_user',
    prompt: record,
    nextAction: 'Review the persisted interaction prompt and collect a user response.'
  }
}

async function runPresentPlan(cwd: string, input: Record<string, unknown>) {
  const prompt = String(input.summary || input.prompt || 'Plan review').trim()
  const record: OpenGtmInteractionPromptRecord = {
    id: randomUUID(),
    kind: 'present_plan',
    prompt,
    choices: ['approve', 'revise', 'cancel'],
    plan: input.plan || null,
    response: null,
    respondedAt: null,
    createdAt: new Date().toISOString()
  }
  const interactions = await loadInteractionStore(cwd)
  interactions.push(record)
  await saveInteractionStore(cwd, interactions)
  return {
    kind: 'primitive.present_plan',
    prompt: record,
    nextAction: 'Review the persisted plan prompt and collect operator approval.'
  }
}

async function runListInteractions(cwd: string) {
  return {
    kind: 'primitive.list_interactions',
    interactions: await loadInteractionStore(cwd)
  }
}

async function runRespondInteraction(cwd: string, input: Record<string, unknown>) {
  const id = String(input.id || '').trim()
  const response = String(input.response || '').trim()
  if (!id || !response) {
    throw new Error('respond_interaction requires id and response.')
  }
  const interactions = await loadInteractionStore(cwd)
  const record = interactions.find((entry) => entry.id === id)
  if (!record) {
    throw new Error(`Unknown interaction: ${id}`)
  }
  record.response = response
  record.respondedAt = new Date().toISOString()
  await saveInteractionStore(cwd, interactions)
  return {
    kind: 'primitive.respond_interaction',
    interaction: record
  }
}

async function runListTodos(cwd: string) {
  return {
    kind: 'primitive.list_todos',
    todos: await loadTodoStore(cwd)
  }
}

async function runUpdateTodo(cwd: string, input: Record<string, unknown>) {
  const todoId = String(input.id || '')
  if (!todoId) {
    throw new Error('update_todo requires id.')
  }
  const todos = await loadTodoStore(cwd)
  const todo = todos.find((entry) => entry.id === todoId)
  if (!todo) {
    throw new Error(`Unknown todo: ${todoId}`)
  }
  if (input.content !== undefined) {
    todo.content = String(input.content)
  }
  if (input.status !== undefined) {
    todo.status = normalizeTodoStatus(input.status)
  }
  todo.updatedAt = new Date().toISOString()
  await saveTodoStore(cwd, todos)
  return {
    kind: 'primitive.update_todo',
    todo
  }
}

async function runCompleteTodo(cwd: string, input: Record<string, unknown>) {
  return runUpdateTodo(cwd, {
    ...input,
    status: 'completed'
  })
}

async function runTaskComplete(cwd: string, input: Record<string, unknown>) {
  if (input.id) {
    return runCompleteTodo(cwd, input)
  }
  return {
    kind: 'primitive.task_complete',
    task: input.task || null,
    completed: true
  }
}

function normalizeTodoStatus(input: unknown): OpenGtmTodoRecord['status'] {
  const value = String(input || 'pending')
  return value === 'in_progress' || value === 'completed' || value === 'cancelled'
    ? value
    : 'pending'
}

async function loadProcessStore(cwd: string): Promise<OpenGtmBackgroundProcessRecord[]> {
  try {
    const raw = await readFile(path.join(cwd, PROCESS_STORE_PATH), 'utf8')
    const parsed = JSON.parse(raw) as { processes?: OpenGtmBackgroundProcessRecord[] }
    return parsed.processes || []
  } catch {
    return []
  }
}

async function saveProcessStore(cwd: string, processes: OpenGtmBackgroundProcessRecord[]) {
  await mkdir(path.join(cwd, '.opengtm'), { recursive: true })
  await writeFile(path.join(cwd, PROCESS_STORE_PATH), JSON.stringify({ processes }, null, 2), 'utf8')
}

async function loadTodoStore(cwd: string): Promise<OpenGtmTodoRecord[]> {
  try {
    const raw = await readFile(path.join(cwd, TODO_STORE_PATH), 'utf8')
    const parsed = JSON.parse(raw) as { todos?: OpenGtmTodoRecord[] }
    return parsed.todos || []
  } catch {
    return []
  }
}

async function loadInteractionStore(cwd: string): Promise<OpenGtmInteractionPromptRecord[]> {
  try {
    const raw = await readFile(path.join(cwd, INTERACTION_STORE_PATH), 'utf8')
    const parsed = JSON.parse(raw) as { interactions?: OpenGtmInteractionPromptRecord[] }
    return parsed.interactions || []
  } catch {
    return []
  }
}

async function saveTodoStore(cwd: string, todos: OpenGtmTodoRecord[]) {
  await mkdir(path.join(cwd, '.opengtm'), { recursive: true })
  await writeFile(path.join(cwd, TODO_STORE_PATH), JSON.stringify({ todos }, null, 2), 'utf8')
}

async function saveInteractionStore(cwd: string, interactions: OpenGtmInteractionPromptRecord[]) {
  await mkdir(path.join(cwd, '.opengtm'), { recursive: true })
  await writeFile(path.join(cwd, INTERACTION_STORE_PATH), JSON.stringify({ interactions }, null, 2), 'utf8')
}

async function collectFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const collected: string[] = []
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
        continue
      }
      collected.push(...await collectFiles(fullPath))
    } else if (entry.isFile()) {
      collected.push(fullPath)
    }
  }
  return collected
}

async function safeReadText(filePath: string) {
  try {
    return await readFile(filePath, 'utf8')
  } catch {
    return null
  }
}

async function createTypeScriptLanguageService(cwd: string) {
  const tsModule = await import('typescript')
  const files = (await collectFiles(cwd))
    .filter((filePath) => /\.(ts|tsx|js|jsx)$/.test(filePath))
  const versions = new Map(files.map((filePath) => [filePath, '1']))
  const contents = new Map<string, string>()

  for (const filePath of files) {
    const raw = await safeReadText(filePath)
    if (raw !== null) {
      contents.set(filePath, raw)
    }
  }

  const compilerOptions = {
    allowJs: true,
    checkJs: false,
    jsx: tsModule.JsxEmit.React,
    target: tsModule.ScriptTarget.ES2022,
    module: tsModule.ModuleKind.NodeNext,
    moduleResolution: tsModule.ModuleResolutionKind.NodeNext,
    esModuleInterop: true,
    skipLibCheck: true,
    allowSyntheticDefaultImports: true
  }

  const servicesHost = {
    getScriptFileNames: () => files,
    getScriptVersion: (fileName: string) => versions.get(fileName) || '1',
    getScriptSnapshot: (fileName: string) => {
      const content = contents.get(fileName)
      return content !== undefined ? tsModule.ScriptSnapshot.fromString(content) : undefined
    },
    getCurrentDirectory: () => cwd,
    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName: (options: unknown) => tsModule.getDefaultLibFilePath(options as any),
    fileExists: tsModule.sys.fileExists,
    readFile: tsModule.sys.readFile,
    readDirectory: tsModule.sys.readDirectory,
    directoryExists: tsModule.sys.directoryExists,
    getDirectories: tsModule.sys.getDirectories
  }

  return {
    ts: tsModule,
    files,
    contents,
    service: tsModule.createLanguageService(servicesHost as any, tsModule.createDocumentRegistry())
  }
}

async function findTypeScriptSymbol(cwd: string, symbol: string) {
  const env = await createTypeScriptLanguageService(cwd)
  const items = env.service.getNavigateToItems(symbol)
    .filter((item: any) => item.name === symbol)
    .filter((item: any) => item.kind !== 'alias')

  if (items.length === 0) {
    return null
  }

  const preferred = items.find((item: any) => ['function', 'const', 'class', 'interface', 'type'].includes(item.kind)) || items[0]
  const source = env.contents.get(preferred.fileName) || await safeReadText(preferred.fileName) || ''
  const sf = env.ts.createSourceFile(preferred.fileName, source, env.ts.ScriptTarget.Latest, true)
  const pos = env.ts.getLineAndCharacterOfPosition(sf, preferred.textSpan.start)
  return {
    filePath: preferred.fileName,
    line: `${pos.line + 1}: ${(source.split('\n')[pos.line] || '').trim()}`
  }
}

async function findTypeScriptReferences(cwd: string, symbol: string) {
  const env = await createTypeScriptLanguageService(cwd)
  const pattern = new RegExp(`\b${escapeRegExp(symbol)}\b`)

  for (const filePath of env.files) {
    const content = env.contents.get(filePath)
    if (!content) continue
    const match = pattern.exec(content)
    if (!match || match.index < 0) continue
    const references = env.service.findReferences(filePath, match.index)
    if (!references || references.length === 0) continue
    const grouped = new Map<string, string[]>()
    for (const reference of references) {
      for (const entry of reference.references) {
        const source = env.contents.get(entry.fileName) || await safeReadText(entry.fileName) || ''
        const sf = env.ts.createSourceFile(entry.fileName, source, env.ts.ScriptTarget.Latest, true)
        const pos = env.ts.getLineAndCharacterOfPosition(sf, entry.textSpan.start)
        const lines = grouped.get(entry.fileName) || []
        lines.push(`${pos.line + 1}: ${(source.split('\n')[pos.line] || '').trim()}`)
        grouped.set(entry.fileName, lines)
      }
    }
    return [...grouped.entries()].map(([fileName, lines]) => ({
      filePath: fileName,
      lines: lines.slice(0, 5)
    }))
  }

  return []
}

async function renameTypeScriptSymbol(cwd: string, symbol: string, newName: string) {
  const env = await createTypeScriptLanguageService(cwd)
  const pattern = new RegExp(`\b${escapeRegExp(symbol)}\b`)

  for (const filePath of env.files) {
    const content = env.contents.get(filePath)
    if (!content) continue
    const match = pattern.exec(content)
    if (!match || match.index < 0) continue
    const locations = env.service.findRenameLocations(filePath, match.index, false, false, true)
    if (!locations || locations.length === 0) continue

    const editsByFile = new Map<string, any[]>()
    for (const location of locations) {
      const edits = editsByFile.get(location.fileName) || []
      edits.push(location)
      editsByFile.set(location.fileName, edits)
    }

    const changed: string[] = []
    for (const [targetFile, edits] of editsByFile) {
      const source = env.contents.get(targetFile) || await safeReadText(targetFile)
      if (source == null) continue
      const ordered = [...edits].sort((left, right) => right.textSpan.start - left.textSpan.start)
      let updated = source
      for (const edit of ordered) {
        updated = `${updated.slice(0, edit.textSpan.start)}${newName}${updated.slice(edit.textSpan.start + edit.textSpan.length)}`
      }
      await writeFile(targetFile, updated, 'utf8')
      changed.push(targetFile)
    }
    return changed
  }

  return []
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function runStructuredSymbolRewrite(cwd: string, symbol: string, bodyFactory: (prefix: string) => string) {
  const files = await collectFiles(cwd)
  for (const filePath of files.slice(0, 300)) {
    const raw = await safeReadText(filePath)
    if (!raw) continue
    const lines = raw.split('\n')
    const index = lines.findIndex((line) => line.includes(symbol) && /(function|const|class|interface|type|export)/.test(line))
    if (index < 0) continue
    const prefix = lines[index]
    const updated = [...lines]
    updated[index] = prefix
    updated.splice(index + 1, 0, bodyFactory(prefix))
    await writeFile(filePath, updated.join('\n'), 'utf8')
    return { kind: 'primitive.replace_symbol_body', filePath, symbol }
  }
  throw new Error(`Could not locate symbol ${symbol}.`)
}

export function createToolCallResult(
  callId: string,
  toolName: string,
  output: unknown,
  status: 'ok' | 'error' = 'ok',
  error: unknown = null
) {
  return {
    kind: 'tool.call.result',
    callId,
    tool: toolName,
    status,
    output,
    lifecycle: { state: status === 'ok' ? 'completed' : 'failed' },
    error: error
      ? {
          code: 'TOOL_ERROR',
          message: String(error),
          retryable: false
        }
      : undefined
  }
}
