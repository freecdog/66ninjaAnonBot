import { FromToBufferEntity } from './FromToBufferEntity.ts'

export type BotKvQueueEntity = {
    tableName: string
    messageType: string
    key: number
    value?: FromToBufferEntity
}
