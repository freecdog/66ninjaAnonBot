import { load } from '$std/dotenv/mod.ts'
import { getKVDumpByPrefix } from './src/commands/Stats.ts'
import { 
    formatDateToUTCString,
    denoKvU64BigIntReplacer,
    denoKvU64BigIntReviver,
} from './src/utils/utils.ts'
import { patch } from './patches/patchExample.js'
// import { patch } from './dumps/dump20240306_231303.js'

doConnect().then((kv: Deno.Kv) => {
    // show in console
    // return getRemoteKvDump(kv).then((dump) => console.log('remote dump:', dump))
    
    // load to KV
    // return doPatch(kv).then((res) => {console.log('patch applied,', res.length, 'keys updated')})

    // save dump from KV
    // return saveRemoteKvDump(kv).then((res) => {console.log('dump saved to', res)})

    console.log('nothing has happened')
})

async function doConnect() {
    const cfg = await getLocalEnvConfig()
    return Deno.openKv(`https://api.deno.com/databases/${cfg.DENO_KV_ID}/connect`)
}

// simple backup

function doPatch(kv: Deno.Kv) {
    // console.log('patch input:', patch)
    // const promises = []
    const promises: Promise<Deno.KvCommitResult>[] = []
    patch.forEach((item: any) => {
        const valueProcessed = denoKvU64BigIntReviver(item.key, item.value)
        promises.push(kv.set(item.key, valueProcessed))
    })
    return Promise.all(promises)
}

async function saveRemoteKvDump(kv: Deno.Kv) {
    const dump = await getRemoteKvDump(kv)
    dump.forEach((item: any) => {
        const valueProcessed = denoKvU64BigIntReplacer(item.key, item.value)
        console.log('before', item.value, 'after', valueProcessed)
        item.value = valueProcessed
    })
    
    const dateStr = formatDateToUTCString(new Date())
    const filePath = `dumps/dump${dateStr}.js`
    await Deno.mkdir('dumps', { recursive: true })
    await Deno.writeTextFile(
        filePath,
        'export const patch = ' + JSON.stringify(dump))
    
    return filePath
}

function getRemoteKvDump(kv: Deno.Kv) {
    return getKVDumpByPrefix(kv, [])
}

async function getLocalEnvConfig() {
    const cfg = {
        DENO_KV_ID: '' as string | undefined,
        DENO_KV_ACCESS_TOKEN: '' as string | undefined,
    }

    const envs = await load({ envPath: '.env.local' })
    cfg.DENO_KV_ID = envs['DENO_KV_ID']
    cfg.DENO_KV_ACCESS_TOKEN = envs['DENO_KV_ACCESS_TOKEN']

    if (!cfg.DENO_KV_ID || !cfg.DENO_KV_ACCESS_TOKEN) {
        throw new Error('no configuration')
    }

    Deno.env.set('DENO_KV_ID', cfg.DENO_KV_ID)
    Deno.env.set('DENO_KV_ACCESS_TOKEN', cfg.DENO_KV_ACCESS_TOKEN)

    return cfg
}
