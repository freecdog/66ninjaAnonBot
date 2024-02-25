import { crypto } from "$std/crypto/mod.ts"
import * as hex from "$std/encoding/hex.ts"

import { Context } from "grammy"
import type { Message } from "grammy_types"

/**
 * bot is allowed to post messages with "restricted" status. "restricted" means that it can't read
 */
const allowedMembersSet: Set<string> = new Set<string>([
    'creator',
    'administrator',
    'member',
    'restricted'])

/**
 * Messages types https://core.telegram.org/bots/api#message or @grammyjs/types/message.d.ts
 */
const allowedMessagesTypeSet: Set<string> = new Set<string>([
    'text',
    'entities',
    'animation',
    'audio',
    'document',
    'photo',
    'sticker',
    'story',
    'video',
    'video_note',
    'voice',
    'contact',
    'dice',
    'game',
    'poll',
    'venue',
    'location'])

export function isAcceptableMessage(message: Message): boolean {
    for (const messageType of allowedMessagesTypeSet) {
        if (Object.hasOwn(message, messageType)) return true
    }
    return false
}

export async function isAllowedToSend(ctx: Context, chatId: number, botId: number, userId: number): Promise<boolean> {
    // TODO can bot with "restricted" use getChatMember()?
    // status: 'creator' is shown, what if user is a default user
    try {
        const botMember = await ctx.api.getChatMember(chatId, botId)
        const userMember = await ctx.api.getChatMember(chatId, userId)
        return allowedMembersSet.has(userMember.status) && allowedMembersSet.has(botMember.status)
    } catch {
        return false
    }
}

export async function md5string(data: string): Promise<string> {
    const messageBuffer = new TextEncoder().encode(data)
    const hashBuffer = await crypto.subtle.digest('MD5', messageBuffer)
    return hex.encodeHex(hashBuffer)
}

export function parseChatId(text: string): number | undefined {
    const chatId = parseInt(text)
    if (isNaN(chatId)) return
    if (text.length !== chatId.toString().length) return
    // TODO seems fine, but I don't know is it ok or not
    if (text.length < 10 || text.length > 14) return
    return chatId
}
