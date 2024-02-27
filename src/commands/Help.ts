import { Context, InlineKeyboard } from 'grammy'
import { Message } from 'grammy_types'
import i18next from '../i18n.ts'
import { EMOJI_NINJA } from '../consts.ts'

export function helpCmd(ctx: Context) {
    if (!ctx.message) return
    const message = ctx.message!

    if (message.chat.type !== 'private') {
        return privateChatHelp(ctx, message)
    }

    return publicChatHelp(ctx)
}

function privateChatHelp(ctx: Context, message: Message) {
    const helpMessageIK = new InlineKeyboard()
        .url(`${i18next.t('help.inlineSendAnonymously')} ${EMOJI_NINJA}`, `https://t.me/${ctx.me.username}?start=${message.chat.id}`)

    const otherOptions = { reply_markup: helpMessageIK }
    return ctx.reply(i18next.t('help.chatMessage', {chatId: message.chat.id}), otherOptions)
}

function publicChatHelp(ctx: Context) {
    return ctx.reply(i18next.t('help.privateMessage'))
}
