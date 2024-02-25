import { AnonBot } from './src/AnonBot.ts'
import { load } from '$std/dotenv/mod.ts'

await start().then(() => {
    console.log('the bot has been stopped')
})

async function start() {
    const { BOT_TOKEN, isDevelopment } = await getEnvConfig()
    const anonBot = new AnonBot(BOT_TOKEN!)
    if (isDevelopment) {
        return anonBot.runBotWithPoll()
    }
    return anonBot.runBotWithWebhook()
}

async function getEnvConfig() {
    const cfg = {
        BOT_TOKEN: '' as string | undefined,
        isDevelopment: false
    }
    cfg.BOT_TOKEN = Deno.env.get('BOT_TOKEN')
    if (cfg.BOT_TOKEN) {
        return cfg
    }

    // local config
    const envs = await load({ envPath: '.env.local' })
    cfg.BOT_TOKEN = envs['BOT_TOKEN']
    if (!cfg.BOT_TOKEN) {
        throw new Error('no configuration')
    }
    cfg.isDevelopment = true
    return cfg
}
