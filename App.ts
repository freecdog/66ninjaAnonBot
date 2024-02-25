import { AnonBot } from './src/AnonBot.ts'
import { load } from '$std/dotenv/mod.ts'

const BOT_TOKEN = await getBotToken()
const anonBot = new AnonBot(BOT_TOKEN)
anonBot.runBot().then(() => {
    console.log('the bot has been stopped')
})

async function getBotToken() {
    let BOT_TOKEN = Deno.env.get("BOT_TOKEN")
    if (BOT_TOKEN) {
        console.log('bot_token is not falsy')
        return BOT_TOKEN
    }

    // local config
    const cfg = await load({ envPath: '.env.local' })
    BOT_TOKEN = cfg['BOT_TOKEN']
    if (!BOT_TOKEN) {
        throw new Error('no configuration')
    }
    return BOT_TOKEN
}
