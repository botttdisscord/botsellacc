const axios_tsr = require('axios');
const crypto_tsr = require('crypto');
const PARTNER_ID_TSR = process.env.TSR_PARTNER_ID;
const PARTNER_KEY_TSR = process.env.TSR_PARTNER_KEY;
if (!PARTNER_ID_TSR || !PARTNER_KEY_TSR) {
    console.warn('[CẢNH BÁO] TSR_PARTNER_ID hoặc TSR_PARTNER_KEY chưa được thiết lập.');
}
async function chargeCard(telco, code, serial, amount, requestId) {
    if (!PARTNER_ID_TSR || !PARTNER_KEY_TSR) {
        throw new Error('Chưa cấu hình Partner ID hoặc Partner Key của TheSieuRe.');
    }
    const sign = crypto_tsr.createHash('md5').update(PARTNER_KEY_TSR + code + serial).digest('hex');
    const payload = { request_id: requestId, code, partner_id: PARTNER_ID_TSR, serial, telco, amount, command: 'charging', sign };
    try {
        console.log('[TheSieuRe] Đang gửi yêu cầu gạch thẻ:', payload);
        const response = await axios_tsr.post('https://thesieure.com/chargingws/v2', payload);
        console.log('[TheSieuRe] Phản hồi từ API:', response.data);
        return response.data;
    } catch (error) {
        console.error('[TheSieuRe] Lỗi khi gọi API:', error.response ? error.response.data : error.message);
        return { status: 99, message: 'Không thể kết nối đến cổng thanh toán.' };
    }
}
module.exports = { chargeCard };
