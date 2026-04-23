import type { OpenGtmConfig } from '../config.js'
import { listReferenceWorkflows } from '../workflows.js'
import { listProviderCatalog, listSandboxProfiles } from '../catalog.js'

export async function handleHelp(args: {
  config: OpenGtmConfig | null
}) {
  const workflows = listReferenceWorkflows()
  const providers = listProviderCatalog()
  const liveWorkflows = workflows.filter((workflow) => workflow.supportTier === 'live').length
  const referenceWorkflows = workflows.filter((workflow) => workflow.supportTier === 'reference-only').length

  return {
    kind: 'dashboard',
    title: 'OpenGTM',
    subtitle: 'Primitive-driven GTM and coding harness CLI for workflows, approvals, traces, memory, and governed terminal automation.',
    current: {
      workspace: args.config?.workspaceName || null,
      initiative: args.config?.initiativeTitle || null,
      provider: args.config?.preferences?.currentProvider || 'mock',
      model: args.config?.preferences?.currentModel || 'mock-0',
      sandboxProfile: args.config?.preferences?.sandboxProfile || 'read-only'
    },
    commandGroups: [
      {
        title: 'Get started',
        commands: [
          'opengtm init --name="My Workspace" --initiative="Q2 Pipeline"',
          'opengtm status',
          'opengtm code "inspect the source tree and search for oauth support"',
          'opengtm tool list',
          'opengtm tool run read_file --path=packages/cli/src/oauth.ts',
          'opengtm workflow list',
          'opengtm workflow run crm.roundtrip "Pat Example"',
          'opengtm agent harness run "Research Acme and draft safe follow-up"'
        ]
      },
      {
        title: 'Control plane',
        commands: [
          'opengtm auth status',
          'opengtm auth login openai',
          'opengtm auth login openai --oauth-redirect-url="http://127.0.0.1:1455/auth/callback?code=...&state=..."',
          'opengtm provider list',
          'opengtm models list',
          'opengtm sandbox status'
        ]
      },
      {
        title: 'Coding harness',
        commands: [
          'opengtm tool list',
          'opengtm tool show find_symbol',
          'opengtm tool run search --path=packages/cli/src --query=handleAuth',
          'opengtm tool run run_command --command="npm test"',
          'opengtm tool run capture_web_screenshot --url=https://example.com --path=.opengtm/screenshots/example.png'
        ]
      },
      {
        title: 'Governed execution',
        commands: [
          'opengtm approvals list',
          'opengtm traces list',
          'opengtm artifacts list',
          'opengtm memory list',
          'opengtm evals run canonical'
        ]
      },
      {
        title: 'Extension surface',
        commands: [
          'opengtm skill list',
          'opengtm skill new outbound_followup',
          'opengtm agent list',
          'opengtm agent new research_assistant',
          'opengtm agent harness run "Check account intelligence for Acme"',
          'opengtm learn review'
        ]
      }
    ],
    support: {
      liveWorkflows,
      referenceWorkflows,
      providers: providers.length,
      sandboxProfiles: listSandboxProfiles().length
    },
    truthfulness: [
      'Canonical live path: crm.roundtrip',
      'Additional live workflows: sdr.lead_research, sdr.outreach_compose',
      'Remaining workflow catalog entries are reference-only until promoted',
      'OpenAI provider auth supports a PKCE OAuth flow for Codex-style login inside the harness',
      'Custom OpenAI-compatible endpoints remain API-key based'
    ],
    nextAction: args.config
      ? 'Run `opengtm status` to inspect the current workspace, provider, sandbox, and workflow posture.'
      : 'Run `opengtm init --name="My Workspace"` to bootstrap a local OpenGTM workspace.'
  }
}
