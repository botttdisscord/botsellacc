require('dotenv').config();
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const IV_LENGTH = 16;

console.log("--- Encryption Service ---");
if (!ENCRYPTION_KEY) {
    console.error("!!! FATAL: ENCRYPTION_KEY is NOT found in .env file.");
    throw new Error('ENCRYPTION_KEY is not set.');
} else if (ENCRYPTION_KEY.length !== 32) {
    console.error(`!!! FATAL: ENCRYPTION_KEY has length ${ENCRYPTION_KEY.length}, but it MUST be 32 characters long.`);
    throw new Error('ENCRYPTION_KEY must be 32 characters long.');
} else {
    console.log("✅ ENCRYPTION_KEY loaded successfully.");
}

function encrypt(text) {
    console.log(`[Encrypt] Bắt đầu mã hóa văn bản: "${text}"`);
    try {
        let iv = crypto.randomBytes(IV_LENGTH);
        let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        const result = iv.toString('hex') + ':' + encrypted.toString('hex');
        console.log(`[Encrypt] Kết quả (dạng hex): ${result}`);
        return result;
    } catch (error) {
        console.error("[Encrypt] Lỗi nghiêm trọng khi đang mã hóa:", error);
        throw error;
    }
}

function decrypt(text) {
    console.log(`[Decrypt] Chuẩn bị giải mã chuỗi hex: "${text}"`);
    try {
        let textParts = text.split(':');
        if (textParts.length < 2) {
            console.error("[Decrypt] Lỗi: Định dạng văn bản mã hóa không hợp lệ. Thiếu dấu ':' phân cách.");
            throw new Error("Invalid encrypted text format.");
        }
        let iv = Buffer.from(textParts.shift(), 'hex');
        let encryptedText = Buffer.from(textParts.join(':'), 'hex');
        let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        const result = decrypted.toString();
        console.log(`[Decrypt] Giải mã thành công. Kết quả: "${result}"`);
        return result;
    } catch (error) {
        console.error("[Decrypt] Lỗi nghiêm trọng khi đang giải mã:", error);
        throw error;
    }
}

function toBuffer(hex) { return Buffer.from(hex, 'hex'); }
function fromBuffer(buffer) { return buffer.toString('hex'); }

module.exports = { encrypt, decrypt, toBuffer, fromBuffer };
