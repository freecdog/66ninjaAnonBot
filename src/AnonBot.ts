import {
    Bot,
    Context,
    webhookCallback,
} from 'grammy'

import { BotKvQueueEntity } from './classes/BotKvQueueEntity.ts'

import { cancelCmd } from './commands/Cancel.ts'
import { helpCmd } from './commands/Help.ts'
import { processCallbackReport } from './commands/CallbackReport.ts'
import { processMessage } from './commands/MessageProcessor.ts'
import { startCmd } from './commands/Start.ts'

export class AnonBot {
    private readonly bot: Bot
    private readonly BOT_TOKEN: string

    private handleUpdate: any
    // @ts-ignore
    private kv: Deno.Kv

    constructor(BOT_TOKEN: string) {
        console.log('AnonBot is starting', new Date().toISOString())

        this.BOT_TOKEN = BOT_TOKEN
        this.bot = new Bot(this.BOT_TOKEN)

        this.processWebhook = this.processWebhook.bind(this)
        this.queueListener = this.queueListener.bind(this)
        this.runBotWithPoll = this.runBotWithPoll.bind(this)
        this.runBotWithWebhook = this.runBotWithWebhook.bind(this)

        Deno.openKv()
            .then((kv) => {
                this.kv = kv
                this.kv.listenQueue(this.queueListener)

                this.init()
            })
            .catch((err) => {
                console.error('AnonBot_error_kv', JSON.stringify(err))
            })
    }

    init() {
        this.bot.command('start', (ctx: Context) => startCmd(ctx, this.kv))
        this.bot.command('help', helpCmd)
        this.bot.command('cancel', (ctx: Context) => cancelCmd(ctx, this.kv))

        this.bot.on('message', (ctx: Context) => processMessage(ctx, this.kv, this.bot))

        // TODO if spam messages it's failing with 400 "same message". Update isn't instant, but may be it's fine
        this.bot.callbackQuery('callbackReport', processCallbackReport)

        this.bot.catch(this.processError)
    }

    async runBotWithPoll() {
        // using long polling, read more https://grammy.dev/guide/deployment-types
        await this.bot.api.deleteWebhook()
        return this.bot.start()
    }

    runBotWithWebhook() {
        this.handleUpdate = webhookCallback(this.bot, 'std/http')
        Deno.serve(this.processWebhook)
    }

    async processWebhook(req: Request) {
        if (req.method === 'POST') {
            const url = new URL(req.url)
            if (url.pathname.slice(1) === this.BOT_TOKEN) {
                try {
                    return await this.handleUpdate(req)
                } catch (err) {
                    console.error('AnonBot_error_wh', JSON.stringify(err))
                }
            }
        }
        return new Response()
    }

    queueListener(message: BotKvQueueEntity) {
        switch (message.messageType) {
            case 'set':
                this.kv.set([message.key], message.value)
                break
            case 'delete':
                this.kv.delete([message.key])
                break
            default:
                console.error('AnonBot_error_queue unknown messageType')
                break
        }
    }

    processError(err: Error) {
        console.error('AnonBot_error', JSON.stringify(err))
    }

    // TODO STATS deleting, reporting, sending, ...
    // TODO what if reply quote? Can speed up if read chat id from the quote in private chat?
    // TODO forward message to the bot (if possible by the chat rules) to reply faster?
    // TODO welcome or (/help) on group_chat_created
}
