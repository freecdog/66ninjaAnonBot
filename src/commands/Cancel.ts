import { Context } from 'grammy'
import i18next from '../i18n.ts'
import { BotKvQueueEntity } from '../classes/BotKvQueueEntity.ts'

export async function cancelCmd(ctx: Context, kv: Deno.Kv) {
    if (!ctx.message) return
    const message = ctx.message!
    const fromUserId = message.from.id
    const deleteQ: BotKvQueueEntity = {
        tableName: 'ANON_MESSAGES',
        messageType: 'delete',
        key: fromUserId,
    }
    await kv.enqueue(deleteQ)
    return ctx.reply(i18next.t('cancel.default'))
}
