import { Context } from 'grammy'
import { InlineKeyboardButton, InlineKeyboardMarkup } from 'grammy_types'
import i18next from '../i18n.ts'
import { 
    CALLBACK_REPORT_IDS_SEPARATOR,
    CALLBACK_REPORT_SEPARATOR,
    EMOJI_CROSS_MARK,
    REPORTS_NEEDED_TO_DELETE,
} from '../consts.ts'
import { md5string } from '../utils/utils.ts'
import { recordReceivedCallback } from './Stats.ts'

const countCrosses = RegExp(String.raw`${EMOJI_CROSS_MARK}`, 'g')

export async function processCallbackReport(ctx: Context, kv: Deno.Kv) {
    if (!ctx.update.callback_query) {
        return
    }
    if (!ctx.update.callback_query.message) {
        return
    }

    const callback_query = ctx.update.callback_query
    const message = callback_query.message!
    const chatId = message.chat.id
    const fromUserId = callback_query.from.id.toString()
    const fromUserIdHash = (await md5string(fromUserId)).slice(-5)    // last 5 symbols of the md5 hash of a user id

    recordReceivedCallback(kv, chatId)

    // copy message inline keyboard
    const replyMarkup : InlineKeyboardMarkup = structuredClone(message.reply_markup)
    // find report button
    const inlineReportElement = replyMarkup!.inline_keyboard[0]?.find((x: InlineKeyboardButton) => {
        return x.text.indexOf(EMOJI_CROSS_MARK) > -1
    })!

    const callbackUserAnswer = { text: '' }
    let reportsCount = (inlineReportElement.text.match(countCrosses) || []).length
    if (reportsCount === 1) {
        // no reports yet, adding the first
        inlineReportElement.text = EMOJI_CROSS_MARK + inlineReportElement.text + CALLBACK_REPORT_SEPARATOR + fromUserIdHash
        callbackUserAnswer.text = i18next.t('callbackReport.reportDelivered')
    } else {
        // check if the user has already reported the message
        const reportsSplit = inlineReportElement.text.split(CALLBACK_REPORT_SEPARATOR)
        const reportsIds = reportsSplit[reportsSplit.length - 1].split(CALLBACK_REPORT_IDS_SEPARATOR)
        const idIndex = reportsIds.indexOf(fromUserIdHash)
        if (idIndex !== -1) {
            // found the user's report, reverting it
            if (reportsIds.length === 1) {
                inlineReportElement.text = EMOJI_CROSS_MARK
            } else {
                reportsIds.splice(idIndex, 1)
                reportsSplit[0] = reportsSplit[0].substring(1)  // cut first symbol
                reportsSplit[reportsSplit.length-1] = reportsIds.join(CALLBACK_REPORT_IDS_SEPARATOR)
                inlineReportElement.text = reportsSplit.join(CALLBACK_REPORT_SEPARATOR)
            }
            callbackUserAnswer.text = i18next.t('callbackReport.reportReverted')
            reportsCount--
        } else {
            inlineReportElement.text = EMOJI_CROSS_MARK + inlineReportElement.text + CALLBACK_REPORT_IDS_SEPARATOR + fromUserIdHash
            callbackUserAnswer.text = i18next.t('callbackReport.reportDelivered')
        }
    }
    // displays text message on the top of the current chat
    ctx.answerCallbackQuery(callbackUserAnswer).then()

    // TODO use kv([ "CHATS", chatId, "SETTINGS" ]).value.reportsNeededForDeletion, make settings
    // make /settings command and /settingsReset
    if (reportsCount >= REPORTS_NEEDED_TO_DELETE) {
        return ctx.deleteMessage()
    }
    return ctx.editMessageReplyMarkup({ reply_markup: replyMarkup })
}
