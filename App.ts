import { AnonBot } from './src/AnonBot.ts'
import { load } from '$std/dotenv/mod.ts'

start()

async function start() {
    const cfg = await getEnvConfig()
    const anonBot = new AnonBot(cfg)
    if (cfg.isDevelopment) {
        return anonBot.runBotWithPoll()
    }
    return anonBot.runBotWithWebhook()
}

async function getEnvConfig() {
    const cfg = {
        BOT_TOKEN: '' as string | undefined,
        STATS_SECRET: '' as string | undefined,
        isDevelopment: false
    }
    cfg.BOT_TOKEN = Deno.env.get('BOT_TOKEN')
    cfg.STATS_SECRET = Deno.env.get('STATS_SECRET')
    if (cfg.BOT_TOKEN) {
        return cfg
    }

    // local config
    const envs = await load({ envPath: '.env.local' })
    cfg.BOT_TOKEN = envs['BOT_TOKEN']
    cfg.STATS_SECRET = envs['STATS_SECRET']
    if (!cfg.BOT_TOKEN) {
        throw new Error('no configuration')
    }
    cfg.isDevelopment = true
    return cfg
}
