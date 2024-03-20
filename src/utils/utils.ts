import { crypto } from '$std/crypto/mod.ts'
import * as hex from '$std/encoding/hex.ts'

import { Context } from 'grammy'
import type { Message } from 'grammy_types'

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
    // TODO can bot with "restricted" use getChatMember()? Seems like yes, but it'd be good to check for groups where users are hidden
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

export function parseChatId(rawText: string): number | undefined {
    let text = rawText.trim()
    if (text.charAt(text.length - 1) === '.') {
        text = text.substring(0, text.length - 1)
    }
    if (text.charAt(0) !== '-') {
        text = '-' + text
    }
    const chatId = parseInt(text)
    if (isNaN(chatId)) return
    if (text.length !== chatId.toString().length) return
    // TODO seems fine, but I don't know is it ok or not
    if (text.length < 10 || text.length > 14) return
    return chatId
}

// Deno.KvU64 BigInt replacer
export function denoKvU64BigIntReplacer(key: string, value: any): any {
    if (value instanceof Deno.KvU64) {
        return value.toString() + 'n'
    }
    return value
}

// Deno.KvU64 BigInt reviver
export function denoKvU64BigIntReviver(key: string, value: any): any {
    if (typeof value === 'string' && /^\d+n$/.test(value)) {
        return new Deno.KvU64(BigInt(value.slice(0, -1)))
    }
    return value
}


export function formatDateToUTCString(date: Date): string {
    const year = date.getUTCFullYear()
    const month = padWithZero(date.getUTCMonth() + 1)   // Month starts from 0
    const day = padWithZero(date.getUTCDate())
    const hour = padWithZero(date.getUTCHours())
    const minute = padWithZero(date.getUTCMinutes())
    const second = padWithZero(date.getUTCSeconds())

    return `${year}${month}${day}_${hour}${minute}${second}`
}

function padWithZero(number: number): string {
    return number.toString().padStart(2, '0')
}
