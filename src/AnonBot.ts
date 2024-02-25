import { Bot, Context, InlineKeyboard } from 'grammy'
import { InlineKeyboardButton, InlineKeyboardMarkup, Message } from 'grammy_types'
import i18next from './i18n.ts'

import { FromToBufferEntity } from './classes/FromToBufferEntity.ts'
import { 
    isAcceptableMessage, 
    isAllowedToSend, 
    md5string, 
    parseChatId
} from './utils/utils.ts'

const EMOJI_CROSS_MARK = '❌'
const EMOJI_RIGHT_ARROW_CURVING_LEFT = '↩️'
const EMOJI_NINJA = '🥷'
const EMOJI_EYES = '👀'

const reCountCrosses = RegExp(String.raw`${EMOJI_CROSS_MARK}`, 'g')

export class AnonBot {
    private readonly REPORTS_NEEDED_TO_DELETE: number = 3
    private readonly START_PARAMS_SEPARATOR = '---'
    private readonly CALLBACK_REPORT_SEPARATOR = ': '
    private readonly CALLBACK_REPORT_IDS_SEPARATOR = ', '

    private readonly bot: Bot
    private readonly fromToBuffer: Map<number, FromToBufferEntity>

    constructor(BOT_TOKEN: string) {
        console.log('AnonBot is starting', new Date().toISOString())
        this.fromToBuffer = new Map()

        this.bot = new Bot(BOT_TOKEN)

        this.processMessage = this.processMessage.bind(this)
        this.processCallbackReport = this.processCallbackReport.bind(this)
        this.runBot = this.runBot.bind(this)
        this.startCmd = this.startCmd.bind(this)

        this.init()
    }

    init() {
        this.bot.command('start', this.startCmd)
        this.bot.command('help', this.helpCmd)

        this.bot.on('message', this.processMessage)

        // TODO if spam messages it's failing with 400 "same message". Update isn't instant, but may be it's fine
        this.bot.callbackQuery('callbackReport', this.processCallbackReport)

        this.bot.catch(this.processError)
    }

    async runBot() {
        await this.bot.api.deleteWebhook()
        // using long polling, read more https://grammy.dev/guide/deployment-types
        return this.bot.start()
    }

    async startCmd(ctx: Context) {
        // console.log('AnonBot startCmd ctx', new Date().toISOString(), JSON.stringify(ctx))
        if (!ctx.message) return
        const message = ctx.message!

        if (!ctx.match) {
            return ctx.reply(i18next.t('start.welcome'))
        }

        if (message.chat.type !== 'private') {
            return ctx.reply(i18next.t('start.paramsInPublicChat'))
        }

        const match = ctx.match.toString()
        const paramsArr = match.split(this.START_PARAMS_SEPARATOR)
        const parsedChatId = parseChatId(paramsArr[0])
        const parsedReplyMsgId = Number.parseInt(paramsArr[1])
        const fromUserId = message.from.id

        if (!parsedChatId) {
            return ctx.reply(i18next.t('start.errorFirstParam'))
        }

        const isAllowed = await isAllowedToSend(ctx, parsedChatId, ctx.me.id, fromUserId)
        if (!isAllowed) {
            return ctx.reply(i18next.t('start.errorNoPermissions'))
        }

        this.fromToBuffer.set(fromUserId, new FromToBufferEntity(parsedChatId, parsedReplyMsgId))
        return ctx.reply(i18next.t('start.inputMessageRequest', {chatId: parsedChatId}))
    }

    helpCmd(ctx: Context) {
        // console.log('AnonBot helpCmd ctx', new Date().toISOString(), JSON.stringify(ctx))
        if (!ctx.message) return
        const message = ctx.message!

        if (message.chat.type !== 'private') {
            const helpMessageIK = new InlineKeyboard()
                .url(`${i18next.t('help.inlineSendAnonymously')} ${EMOJI_NINJA}`, `https://t.me/${ctx.me.username}?start=${message.chat.id}`)

            const otherOptions = { reply_markup: helpMessageIK }
            return ctx.reply(i18next.t('help.chatMessage', {chatId: message.chat.id}), otherOptions)
        }

        return ctx.reply(i18next.t('help.privateMessage'))
    }

    async processMessage(ctx: Context) {
        // console.log('AnonBot processMessage ctx', new Date().toISOString(), JSON.stringify(ctx))
        if (!ctx.message) return
        const message = ctx.message!
        const fromUserId = message.from.id

        if (message.left_chat_member) {
            return this.leftChatMember(ctx, message)
        }
        if (message.new_chat_members) {
            return this.newChatMember(ctx, message)
        }

        // avoid reading chat messages
        if (message.chat.type !== 'private') {
            return
        }

        // filter allowed messages
        if (!isAcceptableMessage(message)) {
            return ctx.reply(i18next.t('process.errorWrongMessageType'))
        }


        if (message.text) {
            const chatId = parseChatId(message.text)
            if (chatId) {
                this.fromToBuffer.set(fromUserId, new FromToBufferEntity(chatId))
                return ctx.reply(i18next.t('process.chatIdAccepted', {chatId: chatId}))
            }
        }

        if (!this.fromToBuffer.has(fromUserId)) {
            return ctx.reply(i18next.t('process.inputChatIdRequest'))
        }

        const fromToEl = this.fromToBuffer.get(fromUserId)!
        this.fromToBuffer.delete(fromUserId)

        const isAllowed = await isAllowedToSend(ctx, fromToEl.toId, ctx.me.id, fromUserId)
        if (!isAllowed) {
            return ctx.reply(i18next.t('process.errorNoPermissions'))
        }

        // prepare action buttons (inline keyboard)
        const chatMessageIK = new InlineKeyboard()
            // .url(`bot info`, `tg://user?id=${ctx.me.id}`)
            .url(`${i18next.t('process.inlineSendAnonymously')} ${EMOJI_RIGHT_ARROW_CURVING_LEFT}`, `https://t.me/${ctx.me.username}?start=${fromToEl.toId}`)
            .text(`${EMOJI_CROSS_MARK}`, 'callbackReport')
        const otherOptions = { reply_markup: chatMessageIK }
        // add a quote to the other message
        if (fromToEl.msgId) {
            // @ts-ignore
            otherOptions.reply_parameters = { message_id: fromToEl.msgId }
        }

        // Copy message to the group
        const messageCopy = await this.bot.api.copyMessage(fromToEl.toId, fromUserId, message.message_id, otherOptions)

        // Add action buttons (inline keyboard) to copied message in the chat
        const chatMessageCopyIK = new InlineKeyboard()
            .url(`${i18next.t('process.inlineReplyAnonymously')} ${EMOJI_RIGHT_ARROW_CURVING_LEFT}`, `https://t.me/${ctx.me.username}?start=${fromToEl.toId}${this.START_PARAMS_SEPARATOR}${messageCopy.message_id}`)
            .text(`${EMOJI_CROSS_MARK}`, 'callbackReport')
        this.bot.api.editMessageReplyMarkup(fromToEl.toId, messageCopy.message_id, {
            reply_markup: chatMessageCopyIK
        }).then()

        // Reply privately to the user's message
        // TODO if chat.type != supergroup, need to check how to get the chat_id, may be take last 10 numbers? Example for group {"id": -4084936279, "type": "group"}
        const privateMessageIK = new InlineKeyboard()
            .url(`${i18next.t('process.inlineSeeInTheChat')} ${EMOJI_EYES}`,
                `https://t.me/c/${fromToEl.toId.toString().slice(-10)}/${messageCopy.message_id}`)
        return ctx.reply(i18next.t('process.messageSent'), { reply_markup: privateMessageIK})

        // Messages types https://core.telegram.org/bots/api#message
        // Works fine ctx.message.text (emoji too), photo, document, sticker, animation, poll, location
        // migrate_to_chat_id? group to supergroup (when chat history becomes visible for everyone)
        // forward other message. Looks like that's not an issue, because when you forward, it's needed to add some text, and only the text is used by the bot
    }

    leftChatMember(ctx: Context, message: Message) {
        const participant = message.left_chat_member!
        if (participant.id === ctx.me.id) {
            console.log('AnonBot, ow, I was kicked from chat_id:', message.chat.id)
        }
    }

    newChatMember(ctx: Context, message: Message) {
        const participants = message.new_chat_members!
        for (let i = 0; i < participants.length; i++) {
            const participant = participants[i]
            if (participant.id === ctx.me.id) {
                console.log('AnonBot, ow, I was added to chat_id:', message.chat.id)
                const ik = new InlineKeyboard()
                    .url(`${i18next.t('newChat.inlineSendAnonymously')} ${EMOJI_NINJA}`, `https://t.me/${ctx.me.username}?start=${message.chat.id}`)
                const otherOptions = {reply_markup: ik}
                return ctx.reply(i18next.t('newChat.welcome', {chatId: message.chat.id}), otherOptions)
            }
        }
    }

    async processCallbackReport(ctx: Context) {
        if (!ctx.update.callback_query) return
        if (!ctx.update.callback_query.message) return

        const callback_query = ctx.update.callback_query
        const message = callback_query.message!
        const fromUserId = callback_query.from.id.toString()
        const fromUserIdHash = (await md5string(fromUserId)).slice(-5)    // last 5 symbols of the md5 hash of a user id

        // copy message inline keyboard
        const replyMarkup : InlineKeyboardMarkup = structuredClone(message.reply_markup)
        // find report button
        const inlineReportElement = replyMarkup!.inline_keyboard[0]?.find((x: InlineKeyboardButton) => {
            return x.text.indexOf(EMOJI_CROSS_MARK) > -1
        })!

        const callbackUserAnswer = { text: '' }
        const reportsCount = (inlineReportElement.text.match(reCountCrosses) || []).length
        if (reportsCount >= this.REPORTS_NEEDED_TO_DELETE) {
            return ctx.deleteMessage()
        } else if (reportsCount === 1) {
            inlineReportElement.text = EMOJI_CROSS_MARK + inlineReportElement.text + this.CALLBACK_REPORT_SEPARATOR + fromUserIdHash
            callbackUserAnswer.text = i18next.t('callbackReport.reportDelivered')
        } else {
            // check if the user has already reported the message
            const reportsSplit = inlineReportElement.text.split(this.CALLBACK_REPORT_SEPARATOR)
            const reportsIds = reportsSplit[reportsSplit.length - 1].split(this.CALLBACK_REPORT_IDS_SEPARATOR)
            const idIndex = reportsIds.indexOf(fromUserIdHash)
            if (idIndex !== -1) {
                // revert the user's report
                if (reportsIds.length === 1) {
                    inlineReportElement.text = EMOJI_CROSS_MARK
                } else {
                    reportsIds.splice(idIndex, 1)
                    reportsSplit[0] = reportsSplit[0].substring(1)  // cut first symbol
                    reportsSplit[reportsSplit.length-1] = reportsIds.join(this.CALLBACK_REPORT_IDS_SEPARATOR)
                    inlineReportElement.text = reportsSplit.join(this.CALLBACK_REPORT_SEPARATOR)
                }
                callbackUserAnswer.text = i18next.t('callbackReport.reportReverted')
            } else {
                inlineReportElement.text = EMOJI_CROSS_MARK + inlineReportElement.text + this.CALLBACK_REPORT_IDS_SEPARATOR + fromUserIdHash
                callbackUserAnswer.text = i18next.t('callbackReport.reportDelivered')
            }
        }
        // displays text message on the top of the current chat
        ctx.answerCallbackQuery(callbackUserAnswer).then()

        return ctx.editMessageReplyMarkup({ reply_markup: replyMarkup })
    }

    processError(err: Error) {
        console.error('AnonBot_error', JSON.stringify(err))
    }

    // TODO STATS deleting, reporting, sending, ...
    // TODO what if reply quote? Can speed up if read chat id from the quote in private chat?
    // TODO forward message to the bot (if possible by the chat rules) to reply faster?
}
