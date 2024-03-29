import { Context } from 'grammy'
import i18next from '../i18n.ts'
import { BotKvQueueEntity } from '../classes/BotKvQueueEntity.ts'
import { START_PARAMS_SEPARATOR } from '../consts.ts'
import { isAllowedToSend, parseChatId } from '../utils/utils.ts'
import { FromToBufferEntity } from '../classes/FromToBufferEntity.ts'
import { recordReceivedCommand } from './Stats.ts'

export async function startCmd(ctx: Context, kv: Deno.Kv) {
    // console.log('AnonBot startCmd ctx', new Date().toISOString(), JSON.stringify(ctx))
    if (!ctx.message) return
    const message = ctx.message!

    recordReceivedCommand(kv)

    if (!ctx.match) {
        return await ctx.reply(i18next.t('start.welcome'))
    }

    if (message.chat.type !== 'private') {
        return await ctx.reply(i18next.t('start.paramsInPublicChat'))
    }

    const match = ctx.match.toString()
    const paramsArr = match.split(START_PARAMS_SEPARATOR)
    const parsedChatId = parseChatId(paramsArr[0])
    const parsedReplyMsgId = Number.parseInt(paramsArr[1])
    const fromUserId = message.from.id

    if (!parsedChatId) {
        return await ctx.reply(i18next.t('start.errorFirstParam'))
    }

    const isAllowed = await isAllowedToSend(ctx, parsedChatId, ctx.me.id, fromUserId)
    if (!isAllowed) {
        return await ctx.reply(i18next.t('start.errorNoPermissions'))
    }

    const setQ: BotKvQueueEntity = {
        tableName: 'ANON_MESSAGES',
        messageType: 'set',
        key: fromUserId,
        value: new FromToBufferEntity(parsedChatId, parsedReplyMsgId),
    }
    await kv.enqueue(setQ)

    return await ctx.reply(i18next.t('start.inputMessageRequest', {chatId: parsedChatId}))
}
