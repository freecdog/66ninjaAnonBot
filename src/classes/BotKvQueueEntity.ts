import { FromToBufferEntity } from './FromToBufferEntity.ts'

export type BotKvQueueEntity = {
    messageType: string
    key: number
    value?: FromToBufferEntity
}
