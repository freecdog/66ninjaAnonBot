import { Context } from 'grammy'
import { Message } from 'grammy_types'
import { REPORTS_NEEDED_TO_DELETE } from '../consts.ts'
import i18next from '../i18n.ts'

// STATS scheme, + is implemented
// +STATS
// 	+MESSAGES_RECEIVED		: Deno.KvU64

// 	+CHAT_IDS_RECEIVED		: BigInt
// 	+MESSAGES_PUBLISHED		: Deno.KvU64
// 	+MESSAGES_DELETED		: Deno.KvU64
	
// 	+CALLBACKS_RECEIVED		: Deno.KvU64
// 	+COMMANDS_RECEIVED		: Deno.KvU64
	
// 	+ACTIVE_CHATS			: Deno.KvU64

// +CHATS
// 	chat_id
// 		+ACTIVITY		: bool
// 		+LOGS
// 			date		: {"action":"invited/removed/migrated","chat":{}}
// 		+SETTINGS		: { "reportsNeededForDeletion": "number" }
// 		+MESSAGES_PUBLISHED_DATES
// 			date		: bool
// 		+MESSAGES_PUBLISHED_COUNT	: Deno.KvU64
// 		+MESSAGES_DELETED_COUNT		: Deno.KvU64
//      +CALLBACKS_RECEIVED_COUNT   : Deno.KvU64

// +ANON_MESSAGES
// 	user_id				: { "toId": "number", "msgId": "number" }

// TODO MESSAGES_DELETED_COUNT
// TODO change Settings

export async function statsCmd(ctx: Context, kv: Deno.Kv, STATS_SECRET: string) {
    if (!ctx.message) return
    const message = ctx.message!

    await recordReceivedCommand(kv)

    if (message.chat.type !== 'private') {
        return await chatStats(ctx, message, kv)
    }

    if (message.text?.split(' ')[1] !== STATS_SECRET) {
        return await ctx.reply(i18next.t('stats.nothing'))
    }

    const [
        publishedMessagesRes,
        callbacksRes,
        chatIdsRes,
        commandsRes,
        messagesRes,
        deletedRes,
    ] = await countAllOperations(kv)
    const publishedMessagesCount = publishedMessagesRes.value as bigint
    const callbacksCount = callbacksRes.value as bigint
    const chatIdsCount = chatIdsRes.value as bigint
    const commandsCount = commandsRes.value as bigint
    const messagesCount = messagesRes.value as bigint
    const deletedCount = deletedRes.value as bigint

    const activeChats = (await countAllActiveChats(kv)).value as bigint

    const mainStats = `activeChats: ${activeChats}
TotalOperations: ${messagesCount + callbacksCount + commandsCount}
ReceivedMessages: ${messagesCount}
ReceivedChatIds: ${chatIdsCount}
PublishedMessages: ${publishedMessagesCount}
ReceivedCommands: ${commandsCount}
ReceivedCallbacks: ${callbacksCount}
DeletedMessages: ${deletedCount}`
    return await ctx.reply(mainStats)

// DEBUG SECTION
    // const dump = await getKVDumpByPrefix(kv, [])
    // console.log('dump', dump)
}

async function chatStats(ctx: Context, message: Message, kv: Deno.Kv) {
    const chatId = message.chat.id
    const [
        chatPublishedMessagesRes,
        chatCallbacksReceivedRes,
        chatMessagesDeletedRes,
    ] = await Promise.all([
        countChatMessagesPublished(kv, chatId),
        countChatCallbacksReceivedCount(kv, chatId),
        countChatMessagesDeletedCount(kv, chatId),
    ])
    const chatPublishedMessages = chatPublishedMessagesRes.value as bigint
    const chatCallbacksReceived = chatCallbacksReceivedRes.value as bigint
    const chatMessagesDeleted = chatMessagesDeletedRes.value as bigint
    return ctx.reply(i18next.t('stats.info', {
        chatPublishedMessages, 
        chatCallbacksReceived,
        chatMessagesDeleted,
    }))
}

export function inviteToGroup(kv: Deno.Kv, message: Message) {
    const chat = message.chat
    const chatId = chat.id
    const date = message.date
    const chatsActivityKey = ['CHATS', chatId, 'ACTIVITY']
    const chatsLogsKey = ['CHATS', chatId, 'LOGS', date]

    // const [itemRes, userRes] = await kv.getMany<[Item, User]>([itemKey, userKey]);
    // const item = itemRes.value;

    return Promise.all([
        kv.atomic()
            .set(chatsActivityKey, true)
            .set(chatsLogsKey, {
                action: 'invite',
                chat,
            })
            .commit(),
        changeChatSettings(kv, chatId, {
            reportsNeededForDeletion: REPORTS_NEEDED_TO_DELETE
        }),
        recordChatActivity(kv, true)
    ])
}

export function removeFromGroup(kv: Deno.Kv, message: Message) {
    const chat = message.chat
    const chatId = chat.id
    const date = message.date
    const chatsActivityKey = ['CHATS', chatId, 'ACTIVITY']
    const chatsLogsKey = ['CHATS', chatId, 'LOGS', date]

    return Promise.all([
        kv.atomic()
            .set(chatsActivityKey, false)
            .set(chatsLogsKey, {
                action: 'remove',
                chat,
            })
            .commit(),
        recordChatActivity(kv, false),
    ])
}

export async function migrateChatFromTo(kv: Deno.Kv, message: Message, migrate_to_chat_id: number) {
    const chat = message.chat
    const chatId = chat.id
    const date = message.date

    console.log('migrateChatFromTo', chatId, migrate_to_chat_id)
    
    const oldChatsActivityKey = ['CHATS', chatId, 'ACTIVITY']
    const oldChatsLogsKey = ['CHATS', chatId, 'LOGS', date]
    const oldChatsSettingsKey = ['CHATS', chatId, 'SETTINGS']
    const newChatsActivityKey = ['CHATS', migrate_to_chat_id, 'ACTIVITY']
    const newChatsLogsKey = ['CHATS', migrate_to_chat_id, 'LOGS', date]
    
    const oldChatSettings = await kv.get(oldChatsSettingsKey)

    return Promise.all([
        kv.atomic()
            .set(oldChatsActivityKey, false)
            .set(oldChatsLogsKey, {
                action: 'migrate',
                chat,
            })
            .set(newChatsActivityKey, true)
            .set(newChatsLogsKey, {
                action: 'migrate',
                chat,
            })
            .commit(),
        changeChatSettings(kv, migrate_to_chat_id, oldChatSettings),
    ])
}

export function recordReceivedMessage(kv: Deno.Kv) {
    const statsMessagesReceivedKey = ['STATS', 'MESSAGES_RECEIVED']
    const u64 = new Deno.KvU64(1n)
    // no need to init in empty DB
    return kv.atomic()
        .sum(statsMessagesReceivedKey, u64.value)
        .commit()
}
function countAllReceivedMessages(kv: Deno.Kv) {
    const statsMessagesReceivedKey = ['STATS', 'MESSAGES_RECEIVED']
    return kv.get(statsMessagesReceivedKey)
}

export function recordPublishedAnonMessageTime(kv: Deno.Kv, chatId: number, date: number) {
    const chatsPublishedAnonMessagesDatesKey = ['CHATS', chatId, 'MESSAGES_PUBLISHED_DATES', date]
    const chatsPublishedAnonMessagesCountKey = ['CHATS', chatId, 'MESSAGES_PUBLISHED_COUNT']
    const statsPublishedAnonMessagesKey = ['STATS', 'MESSAGES_PUBLISHED']
    const u64 = new Deno.KvU64(1n)
    return kv.atomic()
        .set(chatsPublishedAnonMessagesDatesKey, true)
        .sum(chatsPublishedAnonMessagesCountKey, u64.value)
        .sum(statsPublishedAnonMessagesKey, u64.value)
        .commit()
}
function countAllPublishedAnonMessages(kv: Deno.Kv) {
    const statsPublishedAnonMessagesKey = ['STATS', 'MESSAGES_PUBLISHED']
    return kv.get(statsPublishedAnonMessagesKey)
}

export function recordReceivedChatId(kv: Deno.Kv) {
    const statsChatIdsReceivedKey = ['STATS', 'CHAT_IDS_RECEIVED']
    // it'd be automatically converted to Deno.KvU64 for storage
    const u64 = BigInt(1n)
    return kv.atomic()
        .sum(statsChatIdsReceivedKey, u64)
        .commit()
}
function countAllReceivedChatIds(kv: Deno.Kv) {
    const statsChatIdsReceivedKey = ['STATS', 'CHAT_IDS_RECEIVED']
    return kv.get(statsChatIdsReceivedKey)
}

export function recordReceivedCommand(kv: Deno.Kv) {
    const statsCommandsReceivedKey = ['STATS', 'COMMANDS_RECEIVED']
    const u64 = new Deno.KvU64(1n)
    return kv.atomic()
        .sum(statsCommandsReceivedKey, u64.value)
        .commit()
}
function countAllReceivedCommands(kv: Deno.Kv) {
    const statsCommandsReceivedKey = ['STATS', 'COMMANDS_RECEIVED']
    return kv.get(statsCommandsReceivedKey)
}

export function recordReceivedCallback(kv: Deno.Kv, chatId: number) {
    const statsCallbacksReceivedKey = ['STATS', 'CALLBACKS_RECEIVED']
    const chatCallbacksReceivedCountKey = ['CHATS', chatId, 'CALLBACKS_RECEIVED_COUNT']
    const u64 = new Deno.KvU64(1n)
    return kv.atomic()
        .sum(statsCallbacksReceivedKey, u64.value)
        .sum(chatCallbacksReceivedCountKey, u64.value)
        .commit()
}
function countAllReceivedCallbacks(kv: Deno.Kv) {
    const statsCallbacksReceivedKey = ['STATS', 'CALLBACKS_RECEIVED']
    return kv.get(statsCallbacksReceivedKey)
}
function countChatCallbacksReceivedCount(kv: Deno.Kv, chatId: number) {
    const chatCallbacksReceivedCountKey = ['CHATS', chatId, 'CALLBACKS_RECEIVED_COUNT']
    return kv.get(chatCallbacksReceivedCountKey)
}

export function recordMessageDeletion(kv: Deno.Kv, chatId: number) {
    const statsMessagesDeletedKey = ['STATS', 'MESSAGES_DELETED']
    const chatMessagesDeletedCountKey = ['CHATS', chatId, 'MESSAGES_DELETED_COUNT']
    const u64 = new Deno.KvU64(1n)
    return kv.atomic()
        .sum(statsMessagesDeletedKey, u64.value)
        .sum(chatMessagesDeletedCountKey, u64.value)
        .commit()
}
function countAllMessagesDeleted(kv: Deno.Kv) {
    const statsMessagesDeletedKey = ['STATS', 'MESSAGES_DELETED']
    return kv.get(statsMessagesDeletedKey)
}
function countChatMessagesDeletedCount(kv: Deno.Kv, chatId: number) {
    const chatMessagesDeletedCountKey = ['CHATS', chatId, 'MESSAGES_DELETED_COUNT']
    return kv.get(chatMessagesDeletedCountKey)
}

export function recordChatActivity(kv: Deno.Kv, value: boolean) {
    const statsActiveChatsKey = ['STATS', 'ACTIVE_CHATS']
    
    // TODO seems like Deno.KV bug, that I can't sum -1n
    if (value) {
        return kv.atomic()
            .sum(statsActiveChatsKey, (new Deno.KvU64(1n)).value)
            .commit()
    }
    
    return kv.get(statsActiveChatsKey).then((countRef) => {
        if (countRef.value) {
            const sumResult = BigInt(-1n) + (countRef.value as bigint)
            const u64 = new Deno.KvU64(sumResult)
            return kv.set(statsActiveChatsKey, u64)
        }
    })
    // const u64 = value ? new Deno.KvU64(1n) : new Deno.KvU64(-1n)
    // console.log('u64', u64)
    // return kv.atomic()
    //     .sum(statsActiveChatsKey, u64.value)
    //     .commit()
}
function countAllActiveChats(kv: Deno.Kv) {
    const statsActiveChatsKey = ['STATS', 'ACTIVE_CHATS']
    return kv.get(statsActiveChatsKey)
}

function countAllOperations(kv: Deno.Kv) {
    return Promise.all([
        countAllPublishedAnonMessages(kv),
        countAllReceivedCallbacks(kv),
        countAllReceivedChatIds(kv),
        countAllReceivedCommands(kv),
        countAllReceivedMessages(kv),
        countAllMessagesDeleted(kv),
    ])
}

// TODO remove it for optimization in .atomic() OR use in .atomic().chain
function changeChatSettings(kv: Deno.Kv, chatId: number, settings: any) {
    const chatSettingsKey = ['CHATS', chatId, 'SETTINGS']
    return kv.set(chatSettingsKey, settings)
}
export function getChatSettings(kv: Deno.Kv, chatId: number) {
    const chatSettingsKey = ['CHATS', chatId, 'SETTINGS']
    return kv.get(chatSettingsKey)
}

function countChatMessagesPublished(kv: Deno.Kv, chatId: number) {
    const chatsPublishedAnonMessagesCountKey = ['CHATS', chatId, 'MESSAGES_PUBLISHED_COUNT']
    return kv.get(chatsPublishedAnonMessagesCountKey)
}

// debugging

export async function getKVDumpByPrefix(kv: Deno.Kv, prefix: any[]) {
    const it = getIterator(kv, prefix, '')
    const items = await processIterator(it)
    return items
}

async function deleteKvByPrefix(kv: Deno.Kv, prefix: any[]) {
    const it = getIterator(kv, prefix, '')
    const keysDeleted = await processDeleteIterator(kv, it)
    return keysDeleted
}

function getIterator<T>(kv: Deno.Kv, prefix: any[], cursor: string): Deno.KvListIterator<T> {
    // may add "limit"
    const optionsArg = cursor !== '' ? { cursor } : {}
    // const iterator = kv.list<any>({ prefix: ["user_by_age"] }, optionsArg)
    const iterator = kv.list<any>({ prefix: prefix }, optionsArg)
    return iterator
}

async function processIterator<T>(iterator: Deno.KvListIterator<T>): Promise<T[]> {
    let result = await iterator.next()
    const items = []
    while (!result.done) {
        // result.value returns full KvEntry object
        // const item = result.value.value as T
        const item = result.value as T
        items.push(item)
        result = await iterator.next()
    }
    return items
}

async function processDeleteIterator<T>(kv: Deno.Kv, iterator: Deno.KvListIterator<T>): Promise<number> {
    let result = await iterator.next()
    const keysDeleted = 0
    while (!result.done) {
        kv.delete(result.value.key)
        result = await iterator.next()
    }
    return keysDeleted
}
