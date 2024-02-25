export class FromToBufferEntity {
    toId: number
    msgId?: number
    constructor(toId: number, msgId?: number) {
        this.toId = toId
        if (msgId) this.msgId = msgId
    }
}
