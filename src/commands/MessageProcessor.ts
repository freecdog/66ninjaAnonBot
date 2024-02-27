import { Bot, Context, InlineKeyboard } from 'grammy'
import { Message } from 'grammy_types'
import i18next from '../i18n.ts'
import { BotKvQueueEntity } from '../classes/BotKvQueueEntity.ts'
import { 
    EMOJI_CROSS_MARK, 
    EMOJI_EYES,
    EMOJI_NINJA,
    EMOJI_RIGHT_ARROW_CURVING_LEFT,
    START_PARAMS_SEPARATOR,
} from '../consts.ts'
import {
    isAcceptableMessage,
    isAllowedToSend,
    parseChatId
} from '../utils/utils.ts'
import { FromToBufferEntity } from '../classes/FromToBufferEntity.ts'


export async function processMessage(ctx: Context, kv: Deno.Kv, bot: Bot) {
    // console.log('AnonBot processMessage ctx', new Date().toISOString(), JSON.stringify(ctx))
    if (!ctx.message) return
    const message = ctx.message!
    const fromUserId = message.from.id

    if (message.left_chat_member) {
        return leftChatMember(ctx, message)
    }
    if (message.new_chat_members) {
        return newChatMember(ctx, message)
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
            const setQ: BotKvQueueEntity = {
                messageType: 'set',
                key: fromUserId,
                value: new FromToBufferEntity(chatId),
            }
            await kv.enqueue(setQ)

            return ctx.reply(i18next.t('process.chatIdAccepted', {chatId: chatId}))
        }
    }

    const entry = await kv.get([fromUserId])
    if (!entry || !entry.value) {
        return ctx.reply(i18next.t('process.inputChatIdRequest'))
    }

    const fromToEl = entry.value as FromToBufferEntity
    const deleteQ: BotKvQueueEntity = {
        messageType: 'delete',
        key: fromUserId,
    }
    await kv.enqueue(deleteQ)

    const isAllowed = await isAllowedToSend(ctx, fromToEl.toId, ctx.me.id, fromUserId)
    if (!isAllowed) {
        return ctx.reply(i18next.t('process.errorNoPermissions'))
    }

    // prepare action buttons (inline keyboard)
    const chatMessageIK = new InlineKeyboard()
        // .url(`bot info`, `tg://user?id=${ctx.me.id}`)
        .url(`${i18next.t('process.inlineSendAnonymously')} ${EMOJI_NINJA}`, `https://t.me/${ctx.me.username}?start=${fromToEl.toId}`)
        .text(`${EMOJI_CROSS_MARK}`, 'callbackReport')
    const otherOptions = { reply_markup: chatMessageIK }
    // add a quote to the other message
    if (fromToEl.msgId) {
        // @ts-ignore
        otherOptions.reply_parameters = { message_id: fromToEl.msgId }
    }

    // Copy message to the group
    const messageCopy = await bot.api.copyMessage(fromToEl.toId, fromUserId, message.message_id, otherOptions)
    const sentToChatInfo = await bot.api.getChat(fromToEl.toId)

    // if chat.type === 'group', you can't link message by message_id. When does a group become a supergroup https://stackoverflow.com/a/62291433?
    if (sentToChatInfo.type === 'supergroup') {
        // Add action buttons (inline keyboard) to copied message in the chat
        const chatMessageCopyIK = new InlineKeyboard()
            .url(`${i18next.t('process.inlineReplyAnonymously')} ${EMOJI_RIGHT_ARROW_CURVING_LEFT}`, `https://t.me/${ctx.me.username}?start=${fromToEl.toId}${START_PARAMS_SEPARATOR}${messageCopy.message_id}`)
            .text(`${EMOJI_CROSS_MARK}`, 'callbackReport')
        bot.api.editMessageReplyMarkup(fromToEl.toId, messageCopy.message_id, {
            reply_markup: chatMessageCopyIK
        }).then()

        // Reply privately to the user's message with button to see the message in the group
        const privateMessageIK = new InlineKeyboard()
            .url(`${i18next.t('process.inlineSeeInTheChat')} ${EMOJI_EYES}`,
                `https://t.me/c/${fromToEl.toId.toString().slice(-10)}/${messageCopy.message_id}`)
        return ctx.reply(i18next.t('process.messageSent'), { reply_markup: privateMessageIK})
    }

    return ctx.reply(i18next.t('process.messageSent'))
    // Messages types https://core.telegram.org/bots/api#message
    // Works fine ctx.message.text (emoji too), photo, document, sticker, animation, poll, location
    // migrate_to_chat_id? group to supergroup (when chat history becomes visible for everyone)
    // forward other message. Looks like that's not an issue, because when you forward, it's needed to add some text, and only the text is used by the bot
}

function leftChatMember(ctx: Context, message: Message) {
    const participant = message.left_chat_member!
    if (participant.id === ctx.me.id) {
        console.log('AnonBot, ow, I was kicked from chat_id:', message.chat.id)
    }
}

function newChatMember(ctx: Context, message: Message) {
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
