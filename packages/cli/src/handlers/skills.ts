import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadGtmSkillArtifacts } from '@opengtm/skills'

function toSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

async function loadCustomSkills(cwd: string) {
  const root = path.join(cwd, '.opengtm', 'skills')
  const manifestPaths = await collectSkillManifestPaths(root)
  const manifests = await Promise.all(
    manifestPaths.map(async (manifestPath) => {
      const raw = await readFile(manifestPath, 'utf-8')
      return {
        manifest: JSON.parse(raw),
        path: manifestPath
      }
    })
  )
  return manifests
}

async function collectSkillManifestPaths(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    const nested = await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(root, entry.name)
      if (entry.isDirectory()) {
        return collectSkillManifestPaths(fullPath)
      }
      if (entry.isFile() && entry.name === 'skill.json') {
        return [fullPath]
      }
      return []
    }))

    return nested.flat()
  } catch {
    return []
  }
}

export async function handleSkills(args: {
  cwd: string
  action: 'list' | 'show' | 'new'
  skillId?: string
}) {
  const builtIn = loadGtmSkillArtifacts().map((artifact) => ({
    id: artifact.manifest.id,
    name: artifact.manifest.name,
    persona: artifact.manifest.persona,
    summary: artifact.manifest.summary,
    source: 'built-in' as const,
    path: artifact.contentPath || null,
    manifest: artifact.manifest
  }))
  const custom = (await loadCustomSkills(args.cwd)).map((item) => ({
    id: item.manifest.id,
    name: item.manifest.name,
    persona: item.manifest.persona,
    summary: item.manifest.summary,
    source: 'custom' as const,
    path: item.path,
    manifest: item.manifest
  }))
  const allSkills = [...builtIn, ...custom]

  if (args.action === 'list') {
    return {
      kind: 'skills',
      action: 'list',
      skills: allSkills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        persona: skill.persona,
        summary: skill.summary,
        source: skill.source
      })),
      nextAction: 'Use `opengtm skill show <id>` for full details or `opengtm skill new <name>` to scaffold a new skill.'
    }
  }

  if (args.action === 'show') {
    const skill = allSkills.find((item) => item.id === args.skillId)
    if (!skill) {
      throw new Error(`Unknown skill: ${args.skillId}`)
    }

    return {
      kind: 'skills',
      action: 'show',
      skill: {
        ...skill.manifest,
        source: skill.source,
        path: skill.path
      },
      nextAction: 'Review triggers, preconditions, steps, and validations before binding this skill into a workflow.'
    }
  }

  if (!args.skillId) {
    throw new Error('Skill scaffolding requires a name.')
  }

  const skillId = toSlug(args.skillId)
  const skillDir = path.join(args.cwd, '.opengtm', 'skills', skillId)
  const manifestPath = path.join(skillDir, 'skill.json')
  const readmePath = path.join(skillDir, 'README.md')
  await mkdir(skillDir, { recursive: true })

  const manifest = {
    id: skillId,
    name: args.skillId,
    version: '0.1.0',
    persona: 'cross',
    summary: `Custom OpenGTM skill scaffold for ${args.skillId}.`,
    triggers: [{ type: 'intent', match: `run ${skillId}` }],
    preconditions: ['document expected inputs before activation'],
    steps: [
      { id: 'inspect', description: 'Inspect the relevant GTM context and artifacts' },
      { id: 'act', description: 'Execute the core skill procedure' },
      { id: 'verify', description: 'Write a durable artifact with results and next actions' }
    ],
    antiPatterns: ['do not mutate systems of record without an approval path'],
    validations: ['result artifact exists', 'operator-facing next action is explicit'],
    requiredConnectors: [],
    tags: ['custom', 'review-required'],
    composition: 'serial'
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
  await writeFile(
    readmePath,
    `# ${args.skillId}\n\nUse this scaffold to define a reviewable OpenGTM skill.\n\n## Notes\n- Keep outputs artifact-first.\n- Add validations before promoting to live use.\n`,
    'utf-8'
  )

  return {
    kind: 'skills',
    action: 'new',
    skill: {
      ...manifest,
      source: 'custom',
      path: manifestPath
    },
    nextAction: `Edit ${manifestPath} and ${readmePath}, then review the scaffold before adding it to any live workflow.`
  }
}
