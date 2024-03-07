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
import {
    inviteToGroup,
    migrateChatFromTo,
    recordPublishedAnonMessageTime,
    recordReceivedChatId,
    recordReceivedMessage,
    removeFromGroup,
} from './Stats.ts'

export async function processMessage(ctx: Context, kv: Deno.Kv, bot: Bot) {
    // console.log('AnonBot processMessage ctx', new Date().toISOString(), JSON.stringify(ctx))
    if (!ctx.message) return
    const message = ctx.message!
    const fromUserId = message.from.id

    if (message.group_chat_created || message.supergroup_chat_created) {
        return newChatCreated(ctx, message, kv)
    }
    // TODO critical I would say, on chat deletion the event isn't catched, so leftMemberChat() doesn't work
    if (message.left_chat_member) {
        return leftChatMember(ctx, message, kv)
    }
    if (message.new_chat_members) {
        return newChatMember(ctx, message, kv)
    }
    // TODO there are 2 events "migrate_from_chat_id" and "migrate_to_chat_id", may be consider to catch both
    if (message.migrate_to_chat_id) {
        return migrateChatMessage(ctx, message, kv, message.migrate_to_chat_id, bot)
    }

    // avoid reading chat messages
    if (message.chat.type !== 'private') {
        return
    }

    // don't count messages that aren't private
    recordReceivedMessage(kv)

    // filter allowed messages
    if (!isAcceptableMessage(message)) {
        return ctx.reply(i18next.t('process.errorWrongMessageType'))
    }

    if (message.text) {
        const chatId = parseChatId(message.text)
        if (chatId) {
            // TODO refactor it
            const setQ: BotKvQueueEntity = {
                tableName: 'ANON_MESSAGES',
                messageType: 'set',
                key: fromUserId,
                value: new FromToBufferEntity(chatId),
            }
            await kv.enqueue(setQ)

            recordReceivedChatId(kv)

            return ctx.reply(i18next.t('process.chatIdAccepted', {chatId: chatId}))
        }
    }

    // TODO should/could it be enqueued?
    const entry = await kv.get(['ANON_MESSAGES', fromUserId])
    if (!entry.value) {
        return ctx.reply(i18next.t('process.inputChatIdRequest'))
    }

    const fromToEl = entry.value as FromToBufferEntity
    const deleteQ: BotKvQueueEntity = {
        tableName: 'ANON_MESSAGES',
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

    recordPublishedAnonMessageTime(kv, fromToEl.toId, message.date)

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

function newChatCreated(ctx: Context, message: Message, kv: Deno.Kv) {
    const chatId = message.chat.id

    inviteToGroup(kv, message)

    const ik = new InlineKeyboard()
        .url(`${i18next.t('newChat.inlineSendAnonymously')} ${EMOJI_NINJA}`, `https://t.me/${ctx.me.username}?start=${chatId}`)
    const otherOptions = {reply_markup: ik}
    return ctx.reply(i18next.t('newChat.welcome', {chatId: chatId}), otherOptions)
}

function leftChatMember(ctx: Context, message: Message, kv: Deno.Kv) {
    const participant = message.left_chat_member!
    if (participant.id === ctx.me.id) {
        console.log('AnonBot, ow, I was kicked from chat_id:', message.chat.id)
        return removeFromGroup(kv, message)
    }
}

function newChatMember(ctx: Context, message: Message, kv: Deno.Kv) {
    const participants = message.new_chat_members!
    for (let i = 0; i < participants.length; i++) {
        const participant = participants[i]
        if (participant.id === ctx.me.id) {
            const chatId = message.chat.id
            console.log('AnonBot, ow, I was added to chat_id:', chatId)
            
            inviteToGroup(kv, message)
            
            const ik = new InlineKeyboard()
                .url(`${i18next.t('newChat.inlineSendAnonymously')} ${EMOJI_NINJA}`, `https://t.me/${ctx.me.username}?start=${chatId}`)
            const otherOptions = {reply_markup: ik}
            return ctx.reply(i18next.t('newChat.welcome', {chatId: chatId}), otherOptions)
        }
    }
}

async function migrateChatMessage(ctx: Context, message: Message, kv: Deno.Kv, migrate_to_chat_id: number, bot: Bot) {
    await migrateChatFromTo(kv, message, migrate_to_chat_id)

    const ik = new InlineKeyboard()
        .url(`${i18next.t('migrateChat.inlineSendAnonymously')} ${EMOJI_NINJA}`, `https://t.me/${ctx.me.username}?start=${migrate_to_chat_id}`)
    const otherOptions = {reply_markup: ik}
    // TODO there are 2 events: "migrate_to_chat_id" and "migrate_to_chat_id", it's better to process both of them
    return bot.api.sendMessage(migrate_to_chat_id, i18next.t('migrateChat.welcome', {chatId: migrate_to_chat_id}), otherOptions)
}
