import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} from 'discord.js'
import type {
  OpenGtmGateway,
  OpenGtmGatewayEvent,
  OpenGtmGatewayCommandEvent,
  OpenGtmGatewayApprovalDecisionEvent,
  OpenGtmGatewayRenderApprovalInput,
  OpenGtmGatewaySendMessageInput
} from '@opengtm/gateways'

export interface OpenGtmDiscordGatewayConfig {
  gatewayId?: string
  token: string
  clientId: string
  guildId?: string
}

export function createDiscordGateway(config: OpenGtmDiscordGatewayConfig): OpenGtmGateway {
  const gatewayId = config.gatewayId || 'discord'
  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  })

  const handlers = new Set<(event: OpenGtmGatewayEvent) => Promise<void> | void>()

  function emit(event: OpenGtmGatewayEvent) {
    for (const handler of handlers) {
      void handler(event)
    }
  }

  async function registerCommands() {
    const opengtm = new SlashCommandBuilder()
      .setName('opengtm')
      .setDescription('OpenGTM harness')
      .addSubcommand((sub) => sub.setName('help').setDescription('Show help'))
      .addSubcommand((sub) => sub.setName('status').setDescription('Show status'))
      .addSubcommand((sub) =>
        sub
          .setName('init')
          .setDescription('Initialize workspace')
          .addStringOption((opt) => opt.setName('name').setDescription('Workspace name'))
      )
      .addSubcommand((sub) =>
        sub
          .setName('run')
          .setDescription('Run a lane')
          .addStringOption((opt) =>
            opt
              .setName('lane')
              .setDescription('Lane')
              .setRequired(true)
              .addChoices(
                { name: 'research', value: 'research' },
                { name: 'build', value: 'build' },
                { name: 'ops', value: 'ops' }
              )
          )
          .addStringOption((opt) => opt.setName('goal').setDescription('Goal').setRequired(true))
      )
      .addSubcommand((sub) => sub.setName('approvals').setDescription('List approvals'))

    const rest = new REST({ version: '10' }).setToken(config.token)
    const payload = [opengtm.toJSON()]

    if (config.guildId) {
      await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
        body: payload
      })
    } else {
      await rest.put(Routes.applicationCommands(config.clientId), {
        body: payload
      })
    }
  }

  client.on('interactionCreate', async (interaction) => {
    const receivedAt = new Date().toISOString()

    if (interaction.isChatInputCommand() && interaction.commandName === 'opengtm') {
      const sub = interaction.options.getSubcommand()
      const args: string[] = []
      if (sub === 'init') {
        const name = interaction.options.getString('name')
        if (name) args.push(`--name=${name}`)
      }
      if (sub === 'run') {
        const lane = interaction.options.getString('lane', true)
        const goal = interaction.options.getString('goal', true)
        args.push(lane, goal)
      }

      const event: OpenGtmGatewayCommandEvent = {
        gatewayId,
        receivedAt,
        type: 'command',
        userId: String(interaction.user.id),
        channelId: String(interaction.channelId),
        command: `opengtm ${sub}`,
        args
      }

      emit(event)
      if (sub === 'help') {
        await interaction.reply({
          content: 'Commands: help, status, init, run, approvals',
          ephemeral: true
        })
        return
      }

      if (sub === 'status') {
        await interaction.reply({ content: 'OpenGTM gateway is running.', ephemeral: true })
        return
      }

      await interaction.reply({ content: '✅ Received', ephemeral: true })
      return
    }

    if (interaction.isButton()) {
      const [prefix, action, approvalRequestId] = interaction.customId.split(':')
      if (prefix !== 'opengtm' || (action !== 'approve' && action !== 'deny')) return

      const event: OpenGtmGatewayApprovalDecisionEvent = {
        gatewayId,
        receivedAt,
        type: 'approval.decision',
        approvalRequestId,
        decision: action === 'approve' ? 'approved' : 'denied',
        decidedBy: String(interaction.user.id),
        decidedAt: receivedAt
      }
      emit(event)
      await interaction.reply({ content: `Recorded: ${event.decision}`, ephemeral: true })
    }
  })

  return {
    id: gatewayId,
    async start() {
      await client.login(config.token)
      await registerCommands()
    },
    async stop() {
      await client.destroy()
    },
    onEvent(handler) {
      handlers.add(handler)
    },
    async sendMessage(input: OpenGtmGatewaySendMessageInput) {
      const channel = await client.channels.fetch(input.channelId)
      if (!channel || !channel.isTextBased()) throw new Error('Channel not found or not text-based')
      await (channel as any).send({ content: input.text })
    },
    async renderApproval(input: OpenGtmGatewayRenderApprovalInput) {
      const channel = await client.channels.fetch(input.channelId)
      if (!channel || !channel.isTextBased()) throw new Error('Channel not found or not text-based')

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`opengtm:approve:${input.approvalRequestId}`)
          .setLabel('Approve')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`opengtm:deny:${input.approvalRequestId}`)
          .setLabel('Deny')
          .setStyle(ButtonStyle.Danger)
      )

      await (channel as any).send({
        content: `Approval requested: ${input.summary}`,
        components: [row]
      })
    }
  }
}
