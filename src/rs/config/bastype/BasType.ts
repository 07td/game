import { ByteBuffer } from "../../io/ByteBuffer";
import { Type } from "../Type";

export class BasType extends Type {
    idleSeqId = -1;
    walkSeqId = -1;
    crawlSeqId = -1;
    crawlBackSeqId = -1;
    crawlLeftSeqId = -1;
    crawlRightSeqId = -1;
    runSeqId = -1;
    runBackSeqId = -1;
    runLeftSeqId = -1;
    runRightSeqId = -1;
    idleLeftSeqId = -1;
    idleRightSeqId = -1;
    walkBackSeqId = -1;
    walkLeftSeqId = -1;
    walkRightSeqId = -1;
    op43SeqId = -1;
    op44SeqId = -1;
    op45SeqId = -1;
    op46SeqId = -1;
    op47SeqId = -1;
    op48SeqId = -1;
    op49SeqId = -1;
    op50SeqId = -1;
    op51SeqId = -1;

    modelRotateTranslate?: number[][];

    override decodeOpcode(opcode: number, buffer: ByteBuffer): void {
        if (opcode === 1) {
            this.idleSeqId = buffer.readUnsignedShort();
            this.walkSeqId = buffer.readUnsignedShort();
            if (this.idleSeqId === 0xffff) {
                this.idleSeqId = -1;
            }
            if (this.walkSeqId === 0xffff) {
                this.walkSeqId = -1;
            }
        } else if (opcode === 2) {
            this.crawlSeqId = buffer.readUnsignedShort();
        } else if (opcode === 3) {
            this.crawlBackSeqId = buffer.readUnsignedShort();
        } else if (opcode === 4) {
            this.crawlLeftSeqId = buffer.readUnsignedShort();
        } else if (opcode === 5) {
            this.crawlRightSeqId = buffer.readUnsignedShort();
        } else if (opcode === 6) {
            this.runSeqId = buffer.readUnsignedShort();
        } else if (opcode === 7) {
            this.runBackSeqId = buffer.readUnsignedShort();
        } else if (opcode === 8) {
            this.runLeftSeqId = buffer.readUnsignedShort();
        } else if (opcode === 9) {
            this.runRightSeqId = buffer.readUnsignedShort();
        } else if (opcode === 26) {
            const anInt1059 = buffer.readUnsignedByte() * 4;
            const anInt1050 = buffer.readUnsignedByte() * 4;
        } else if (opcode === 27) {
            if (!this.modelRotateTranslate) {
                this.modelRotateTranslate = new Array(12);
            }
            const bodyPartId = buffer.readUnsignedByte();
            this.modelRotateTranslate[bodyPartId] = new Array(6);
            for (let type = 0; type < 6; type++) {
                /*
                 * 0 -Rotate X
                 * 1 - Rotate Y
                 * 2 - Rotate Z
                 * 3 - Translate X
                 * 4 - Translate Y
                 * 5 - Translate Z
                 */
                this.modelRotateTranslate[bodyPartId][type] = buffer.readShort();
            }
        } else if (opcode === 29) {
            const yawAcceleration = buffer.readUnsignedByte();
        } else if (opcode === 30) {
            const yawMaxSpeed = buffer.readUnsignedShort();
        } else if (opcode === 31) {
            const rollAcceleration = buffer.readUnsignedByte();
        } else if (opcode === 32) {
            const rollMaxSpeed = buffer.readUnsignedShort();
        } else if (opcode === 33) {
            const rollTargetAngle = buffer.readShort();
        } else if (opcode === 34) {
            const pitchAcceleration = buffer.readUnsignedByte();
        } else if (opcode === 35) {
            const pitchMaxSpeed = buffer.readUnsignedShort();
        } else if (opcode === 36) {
            const pitchTargetAngle = buffer.readShort();
        } else if (opcode === 37) {
            const movementAcceleration = buffer.readUnsignedByte();
        } else if (opcode === 38) {
            this.idleLeftSeqId = buffer.readUnsignedShort();
        } else if (opcode === 39) {
            this.idleRightSeqId = buffer.readUnsignedShort();
        } else if (opcode === 40) {
            this.walkBackSeqId = buffer.readUnsignedShort();
        } else if (opcode === 41) {
            this.walkLeftSeqId = buffer.readUnsignedShort();
        } else if (opcode === 42) {
            this.walkRightSeqId = buffer.readUnsignedShort();
        } else if (opcode === 43) {
            this.op43SeqId = buffer.readUnsignedShort();
        } else if (opcode === 44) {
            this.op44SeqId = buffer.readUnsignedShort();
        } else if (opcode === 45) {
            this.op45SeqId = buffer.readUnsignedShort();
        } else if (opcode === 46) {
            this.op46SeqId = buffer.readUnsignedShort();
        } else if (opcode === 47) {
            this.op47SeqId = buffer.readUnsignedShort();
        } else if (opcode === 48) {
            this.op48SeqId = buffer.readUnsignedShort();
        } else if (opcode === 49) {
            this.op49SeqId = buffer.readUnsignedShort();
        } else if (opcode === 50) {
            this.op50SeqId = buffer.readUnsignedShort();
        } else if (opcode === 51) {
            this.op51SeqId = buffer.readUnsignedShort();
        } else if (opcode === 52) {
            const count = buffer.readUnsignedByte();
            for (let i = 0; i < count; i++) {
                buffer.readUnsignedShort();
                buffer.readUnsignedByte();
            }
        } else if (opcode === 53) {
            const bool = false;
        } else if (opcode === 54) {
            const v0 = buffer.readUnsignedByte() << 6;
            const v1 = buffer.readUnsignedByte() << 6;
        } else if (opcode === 55) {
            const bodyPartId = buffer.readUnsignedByte();
            buffer.readUnsignedShort();
        } else if (opcode === 54) {
            const bodyPartId = buffer.readUnsignedByte();
            for (let i = 0; i < 3; i++) {
                buffer.readShort();
            }
        } else {
            throw new Error("BasType: Unknown opcode: " + opcode);
        }
    }
}
