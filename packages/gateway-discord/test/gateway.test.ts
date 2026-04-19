import { beforeEach, describe, expect, it, vi } from 'vitest'

const discordMock = vi.hoisted(() => {
  const state = {
    client: null as any,
    sent: [] as any[],
    restCalls: [] as Array<{ route: string; body: unknown }>,
    loginToken: null as string | null
  }

  class MockChannel {
    isTextBased() {
      return true
    }
    async send(payload: unknown) {
      state.sent.push(payload)
    }
  }

  class MockClient {
    handlers: Record<string, Function> = {}
    channels = {
      fetch: async () => new MockChannel()
    }
    constructor() {
      state.client = this
    }
    on(event: string, handler: Function) {
      this.handlers[event] = handler
    }
    async login(token: string) {
      state.loginToken = token
    }
    async destroy() {}
    async emitInteraction(interaction: unknown) {
      await this.handlers.interactionCreate?.(interaction)
    }
  }

  class MockREST {
    setToken() {
      return this
    }
    async put(route: string, args: { body: unknown }) {
      state.restCalls.push({ route, body: args.body })
    }
  }

  class MockSlashCommandBuilder {
    json = {
      name: 'opengtm',
      subcommands: [] as string[]
    }
    setName(name: string) {
      this.json.name = name
      return this
    }
    setDescription() {
      return this
    }
    addSubcommand(builder: (sub: any) => any) {
      const sub = {
        setName: (name: string) => {
          this.json.subcommands.push(name)
          return sub
        },
        setDescription: () => sub,
        addStringOption: (fn: (opt: any) => any) => {
          const opt = {
            setName: () => opt,
            setDescription: () => opt,
            setRequired: () => opt,
            addChoices: () => opt
          }
          fn(opt)
          return sub
        }
      }
      builder(sub)
      return this
    }
    toJSON() {
      return this.json
    }
  }

  class MockActionRowBuilder<T> {
    components: T[] = []
    addComponents(...components: T[]) {
      this.components.push(...components)
      return this
    }
  }

  class MockButtonBuilder {
    data: Record<string, unknown> = {}
    setCustomId(value: string) {
      this.data.customId = value
      return this
    }
    setLabel(value: string) {
      this.data.label = value
      return this
    }
    setStyle(value: string) {
      this.data.style = value
      return this
    }
  }

  return {
    state,
    Client: MockClient,
    REST: MockREST,
    SlashCommandBuilder: MockSlashCommandBuilder,
    ActionRowBuilder: MockActionRowBuilder,
    ButtonBuilder: MockButtonBuilder,
    ButtonStyle: {
      Success: 'success',
      Danger: 'danger'
    },
    GatewayIntentBits: {
      Guilds: 1
    },
    Routes: {
      applicationCommands: (clientId: string) => `applications/${clientId}/commands`,
      applicationGuildCommands: (clientId: string, guildId: string) => `applications/${clientId}/guilds/${guildId}/commands`
    }
  }
})

vi.mock('discord.js', () => discordMock)

import { createDiscordGateway } from '../src/index.js'

describe('gateway-discord', () => {
  beforeEach(() => {
    discordMock.state.sent = []
    discordMock.state.restCalls = []
    discordMock.state.loginToken = null
  })

  it('registers commands on start and sends outbound messages', async () => {
    const gateway = createDiscordGateway({
      token: 'token-1',
      clientId: 'client-1',
      guildId: 'guild-1'
    })

    await gateway.start()
    await gateway.sendMessage({ channelId: 'c1', text: 'hello team' })
    await gateway.renderApproval({
      channelId: 'c1',
      approvalRequestId: 'approval-1',
      summary: 'Ship the outreach draft'
    })

    expect(discordMock.state.loginToken).toBe('token-1')
    expect(discordMock.state.restCalls).toHaveLength(1)
    expect(discordMock.state.restCalls[0].route).toContain('guilds/guild-1/commands')
    expect(discordMock.state.sent).toHaveLength(2)
  })

  it('emits command and approval decision events from Discord interactions', async () => {
    const gateway = createDiscordGateway({
      token: 'token-2',
      clientId: 'client-2'
    })
    const events: Array<{ type?: string; command?: string; decision?: string }> = []
    gateway.onEvent((event) => {
      events.push(event as any)
    })

    await gateway.start()

    const replies: string[] = []
    await discordMock.state.client.emitInteraction({
      isChatInputCommand: () => true,
      isButton: () => false,
      commandName: 'opengtm',
      options: {
        getSubcommand: () => 'run',
        getString: (name: string) => (name === 'lane' ? 'research' : 'find top accounts')
      },
      user: { id: 'user-1' },
      channelId: 'channel-1',
      reply: async ({ content }: { content: string }) => {
        replies.push(content)
      }
    })

    await discordMock.state.client.emitInteraction({
      isChatInputCommand: () => false,
      isButton: () => true,
      customId: 'opengtm:approve:approval-99',
      user: { id: 'user-2' },
      reply: async ({ content }: { content: string }) => {
        replies.push(content)
      }
    })

    expect(events.map((event) => event.type)).toEqual(['command', 'approval.decision'])
    expect(events[0].command).toBe('opengtm run')
    expect(events[1].decision).toBe('approved')
    expect(replies).toContain('✅ Received')
    expect(replies).toContain('Recorded: approved')
  })
})
