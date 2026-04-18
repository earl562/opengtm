export * from './parse.js'
export * from './config.js'
export * from './router.js'
export * from './handlers/init.js'
export * from './handlers/research.js'
export * from './handlers/build.js'
export * from './handlers/approvals.js'
export * from './handlers/daemon.js'
export * from './handlers/traces.js'
export * from './handlers/artifacts.js'

export async function runOpenGtmCli(args: string[]) {
  const router = await import('./router.js').then((m) => m.createCliRouter())
  try {
    const result = await router(args)
    console.log(JSON.stringify(result, null, 2))
    return 0
  } catch (error) {
    console.error(String(error))
    return 1
  }
}
