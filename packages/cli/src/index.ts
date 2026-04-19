export * from './parse.js'
export * from './autonomy.js'
export * from './config.js'
export * from './router.js'
export * from './render/index.js'
export * from './reporting.js'
export * from './recovery.js'
export * from './handlers/init.js'
export * from './handlers/research.js'
export * from './handlers/build.js'
export * from './handlers/approvals.js'
export * from './handlers/evals.js'
export * from './handlers/feedback.js'
export * from './handlers/daemon.js'
export * from './handlers/ops.js'
export * from './handlers/traces.js'
export * from './handlers/workflows.js'
export * from './handlers/artifacts.js'
export * from './handlers/memory.js'
export * from './handlers/connectors.js'
export * from './handlers/opengtm.js'
export * from './workflows.js'

export async function runOpenGtmCli(args: string[]) {
  const parsed = await import('./parse.js').then((m) => m.parseCliArgs(args))
  const router = await import('./router.js').then((m) => m.createCliRouter())
  const renderCliOutput = await import('./render/index.js').then((m) => m.renderCliOutput)
  try {
    const result = await router(args)
    console.log(renderCliOutput({ parsed, result }))
    return 0
  } catch (error) {
    console.error(String(error))
    return 1
  }
}
