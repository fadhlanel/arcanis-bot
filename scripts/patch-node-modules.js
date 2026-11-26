#!/usr/bin/env node
/**
 * Apply persistent patches to node_modules after npm install.
 * Run via postinstall script.
 *
 * Idempotent: if the target already contains the patched text, it is skipped.
 */

const fs = require('fs');
const path = require('path');

let failed = 0;

function patchFile(filePath, oldStr, newStr, description) {
    try {
        const fullPath = path.resolve(__dirname, '..', filePath);
        if (!fs.existsSync(fullPath)) {
            console.warn(`[patch] File not found: ${fullPath}`);
            failed++;
            return false;
        }
        let content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes(newStr)) {
            console.log(`[patch] Already applied: ${description}`);
            return true;
        }
        if (!content.includes(oldStr)) {
            console.warn(`[patch] Pattern not found in ${filePath} (${description})`);
            failed++;
            return false;
        }
        content = content.replace(oldStr, newStr);
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`[patch] Applied: ${description}`);
        return true;
    } catch (err) {
        console.error(`[patch] Failed ${description}:`, err.message);
        failed++;
        return false;
    }
}

console.log('[patch] Applying persistent patches...');

// 1. @xbibzlibrary/whatsbibz: FPS 12 -> 24 in sound-sticker.js
patchFile(
    'node_modules/@xbibzlibrary/whatsbibz/lib/Utils/sound-sticker.js',
    'for (const [fps, quality] of [[12, 70], [12, 55], [10, 42], [8, 30], [6, 20]]) {',
    'for (const [fps, quality] of [[24, 70], [24, 55], [10, 42], [8, 30], [6, 20]]) {',
    'whatsbibz FPS 12->24'
);

// 2. @whiskeysockets/baileys: Add audioStickerMessage field 134 to WAProto
// 2a. WAProto.proto
patchFile(
    'node_modules/@whiskeysockets/baileys/WAProto/WAProto.proto',
    'optional PollResultSnapshotMessage pollResultSnapshotMessageV3 = 114;\n    message AlbumMessage {',
    'optional PollResultSnapshotMessage pollResultSnapshotMessageV3 = 114;\n    optional FutureProofMessage audioStickerMessage = 134;\n    message AlbumMessage {',
    'WAProto.proto add audioStickerMessage field 134'
);

// 2b. WAProto/index.js - prototype property
patchFile(
    'node_modules/@whiskeysockets/baileys/WAProto/index.js',
    'Message.prototype.pollResultSnapshotMessageV3 = null;\n\n        let $oneOfFields;',
    'Message.prototype.pollResultSnapshotMessageV3 = null;\n        Message.prototype.audioStickerMessage = null;\n\n        let $oneOfFields;',
    'WAProto/index.js prototype audioStickerMessage'
);

// 2c. WAProto/index.js - OneOf getter/setter
patchFile(
    'node_modules/@whiskeysockets/baileys/WAProto/index.js',
    'Object.defineProperty(Message.prototype, "_pollResultSnapshotMessageV3", {\n            get: $util.oneOfGetter($oneOfFields = ["pollResultSnapshotMessageV3"]),\n            set: $util.oneOfSetter($oneOfFields)\n        });\n\n        Message.create = function create(properties) {',
    'Object.defineProperty(Message.prototype, "_pollResultSnapshotMessageV3", {\n            get: $util.oneOfGetter($oneOfFields = ["pollResultSnapshotMessageV3"]),\n            set: $util.oneOfSetter($oneOfFields)\n        });\n\n        // Virtual OneOf for proto3 optional field\n        Object.defineProperty(Message.prototype, "_audioStickerMessage", {\n            get: $util.oneOfGetter($oneOfFields = ["audioStickerMessage"]),\n            set: $util.oneOfSetter($oneOfFields)\n        });\n\n        Message.create = function create(properties) {',
    'WAProto/index.js OneOf audioStickerMessage'
);

// 2d. WAProto/index.js - fromObject case
patchFile(
    'node_modules/@whiskeysockets/baileys/WAProto/index.js',
    'if (d.pollResultSnapshotMessageV3 != null) {\n                if (typeof d.pollResultSnapshotMessageV3 !== "object")\n                    throw TypeError(".proto.Message.pollResultSnapshotMessageV3: object expected");\n                m.pollResultSnapshotMessageV3 = $root.proto.Message.PollResultSnapshotMessage.fromObject(d.pollResultSnapshotMessageV3);\n            }\n            return m;',
    'if (d.pollResultSnapshotMessageV3 != null) {\n                if (typeof d.pollResultSnapshotMessageV3 !== "object")\n                    throw TypeError(".proto.Message.pollResultSnapshotMessageV3: object expected");\n                m.pollResultSnapshotMessageV3 = $root.proto.Message.PollResultSnapshotMessage.fromObject(d.pollResultSnapshotMessageV3);\n            }\n            if (d.audioStickerMessage != null) {\n                if (typeof d.audioStickerMessage !== "object")\n                    throw TypeError(".proto.Message.audioStickerMessage: object expected");\n                m.audioStickerMessage = $root.proto.Message.FutureProofMessage.fromObject(d.audioStickerMessage);\n            }\n            return m;',
    'WAProto/index.js fromObject audioStickerMessage'
);

// 2e. WAProto/index.js - encode case
patchFile(
    'node_modules/@whiskeysockets/baileys/WAProto/index.js',
    '$root.proto.Message.PollResultSnapshotMessage.encode(m.pollResultSnapshotMessageV3, w.uint32(914).fork()).ldelim();\n            return w;',
    '$root.proto.Message.PollResultSnapshotMessage.encode(m.pollResultSnapshotMessageV3, w.uint32(914).fork()).ldelim();\n            if (m.audioStickerMessage != null && Object.hasOwnProperty.call(m, "audioStickerMessage"))\n                $root.proto.Message.FutureProofMessage.encode(m.audioStickerMessage, w.uint32(1074).fork()).ldelim();\n            return w;',
    'WAProto/index.js encode audioStickerMessage'
);

// 2e. WAProto/index.js - decode case
patchFile(
    'node_modules/@whiskeysockets/baileys/WAProto/index.js',
    'case 114: {\n                        m.pollResultSnapshotMessageV3 = $root.proto.Message.PollResultSnapshotMessage.decode(r, r.uint32());\n                        break;\n                    }\n                default:',
    'case 114: {\n                        m.pollResultSnapshotMessageV3 = $root.proto.Message.PollResultSnapshotMessage.decode(r, r.uint32());\n                        break;\n                    }\n                case 134: {\n                        m.audioStickerMessage = $root.proto.Message.FutureProofMessage.decode(r, r.uint32());\n                        break;\n                    }\n                default:',
    'WAProto/index.js decode audioStickerMessage'
);

// 2f. WAProto/index.js - toObject case
patchFile(
    'node_modules/@whiskeysockets/baileys/WAProto/index.js',
    'if (m.pollResultSnapshotMessageV3 != null && m.hasOwnProperty("pollResultSnapshotMessageV3")) {\n                d.pollResultSnapshotMessageV3 = $root.proto.Message.PollResultSnapshotMessage.toObject(m.pollResultSnapshotMessageV3, o);\n                if (o.oneofs)\n                    d._pollResultSnapshotMessageV3 = "pollResultSnapshotMessageV3";\n            }\n            return d;',
    'if (m.pollResultSnapshotMessageV3 != null && m.hasOwnProperty("pollResultSnapshotMessageV3")) {\n                d.pollResultSnapshotMessageV3 = $root.proto.Message.PollResultSnapshotMessage.toObject(m.pollResultSnapshotMessageV3, o);\n                if (o.oneofs)\n                    d._pollResultSnapshotMessageV3 = "pollResultSnapshotMessageV3";\n            }\n            if (m.audioStickerMessage != null && m.hasOwnProperty("audioStickerMessage")) {\n                d.audioStickerMessage = $root.proto.Message.FutureProofMessage.toObject(m.audioStickerMessage, o);\n                if (o.oneofs)\n                    d._audioStickerMessage = "audioStickerMessage";\n            }\n            return d;',
    'WAProto/index.js toObject audioStickerMessage'
);

// 2g. WAProto/index.js - StickerMessage audioMessage field 26
patchFile(
    'node_modules/@whiskeysockets/baileys/WAProto/WAProto.proto',
    'optional Message.MediaKeyDomain mediaKeyDomain = 23;\n    }\n\n    message StickerPackMessage {',
    'optional Message.MediaKeyDomain mediaKeyDomain = 23;\n        optional AudioMessage audioMessage = 26;\n    }\n\n    message StickerPackMessage {',
    'WAProto.proto StickerMessage audioMessage 26'
);
patchFile(
    'node_modules/@whiskeysockets/baileys/WAProto/index.js',
    'StickerMessage.prototype.mediaKeyDomain = null;\n\n            let $oneOfFields;',
    'StickerMessage.prototype.mediaKeyDomain = null;\n            StickerMessage.prototype.audioMessage = null;\n\n            let $oneOfFields;',
    'WAProto/index.js StickerMessage prototype audioMessage'
);
patchFile(
    'node_modules/@whiskeysockets/baileys/WAProto/index.js',
    'if (m.mediaKeyDomain != null && Object.hasOwnProperty.call(m, "mediaKeyDomain"))\n                    w.uint32(184).int32(m.mediaKeyDomain);\n                return w;\n            };\n\n            StickerMessage.decode = function decode(r, l, e) {',
    'if (m.mediaKeyDomain != null && Object.hasOwnProperty.call(m, "mediaKeyDomain"))\n                    w.uint32(184).int32(m.mediaKeyDomain);\n                if (m.audioMessage != null && Object.hasOwnProperty.call(m, "audioMessage"))\n                    $root.proto.Message.AudioMessage.encode(m.audioMessage, w.uint32(210).fork()).ldelim();\n                return w;\n            };\n\n            StickerMessage.decode = function decode(r, l, e) {',
    'WAProto/index.js StickerMessage encode audioMessage'
);
patchFile(
    'node_modules/@whiskeysockets/baileys/WAProto/index.js',
    'case 23: {\n                            m.mediaKeyDomain = r.int32();\n                            break;\n                        }\n                    default:\n                        r.skipType(t & 7);\n                        break;\n                    }\n                }\n                return m;\n            };\n\n            StickerMessage.fromObject = function fromObject(d) {',
    'case 23: {\n                            m.mediaKeyDomain = r.int32();\n                            break;\n                        }\n                    case 26: {\n                            m.audioMessage = $root.proto.Message.AudioMessage.decode(r, r.uint32());\n                            break;\n                        }\n                    default:\n                        r.skipType(t & 7);\n                        break;\n                    }\n                }\n                return m;\n            };\n\n            StickerMessage.fromObject = function fromObject(d) {',
    'WAProto/index.js StickerMessage decode audioMessage'
);
patchFile(
    'node_modules/@whiskeysockets/baileys/WAProto/index.js',
    'case "BOT":\n                case 4:\n                    m.mediaKeyDomain = 4;\n                    break;\n                }\n                return m;\n            };\n\n            StickerMessage.toObject = function toObject(m, o) {',
    'case "BOT":\n                case 4:\n                    m.mediaKeyDomain = 4;\n                    break;\n                }\n                if (d.audioMessage != null) {\n                    if (typeof d.audioMessage !== "object")\n                        throw TypeError(".proto.Message.StickerMessage.audioMessage: object expected");\n                    m.audioMessage = $root.proto.Message.AudioMessage.fromObject(d.audioMessage);\n                }\n                return m;\n            };\n\n            StickerMessage.toObject = function toObject(m, o) {',
    'WAProto/index.js StickerMessage fromObject audioMessage'
);
patchFile(
    'node_modules/@whiskeysockets/baileys/WAProto/index.js',
    'if (m.mediaKeyDomain != null && m.hasOwnProperty("mediaKeyDomain")) {\n                    d.mediaKeyDomain = o.enums === String ? $root.proto.Message.MediaKeyDomain[m.mediaKeyDomain] === undefined ? m.mediaKeyDomain : $root.proto.Message.MediaKeyDomain[m.mediaKeyDomain] : m.mediaKeyDomain;\n                    if (o.oneofs)\n                        d._mediaKeyDomain = "mediaKeyDomain";\n                }\n                return d;\n            };\n\n            StickerMessage.prototype.toJSON = function toJSON() {',
    'if (m.mediaKeyDomain != null && m.hasOwnProperty("mediaKeyDomain")) {\n                    d.mediaKeyDomain = o.enums === String ? $root.proto.Message.MediaKeyDomain[m.mediaKeyDomain] === undefined ? m.mediaKeyDomain : $root.proto.Message.MediaKeyDomain[m.mediaKeyDomain] : m.mediaKeyDomain;\n                    if (o.oneofs)\n                        d._mediaKeyDomain = "mediaKeyDomain";\n                }\n                if (m.audioMessage != null && m.hasOwnProperty("audioMessage")) {\n                    d.audioMessage = $root.proto.Message.AudioMessage.toObject(m.audioMessage, o);\n                    if (o.oneofs)\n                        d._audioMessage = "audioMessage";\n                }\n                return d;\n            };\n\n            StickerMessage.prototype.toJSON = function toJSON() {',
    'WAProto/index.js StickerMessage toObject audioMessage'
);

console.log('[patch] Done.');
if (failed > 0) {
    process.exitCode = 1;
}