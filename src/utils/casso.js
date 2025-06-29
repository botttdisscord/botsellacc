const axios = require('axios');
const CASSO_API_KEY = process.env.CASSO_API_KEY;

if (!CASSO_API_KEY) {
    console.warn('[CẢNH BÁO] CASSO_API_KEY chưa được thiết lập. Bot sẽ không thể kiểm tra giao dịch.');
}

async function getRecentTransactions() {
    try {
        const response = await axios.get('https://oauth.casso.vn/v2/transactions', {
            headers: { 'Authorization': `Apikey ${CASSO_API_KEY}`, 'Content-Type': 'application/json' }
        });
        if (response.data.error === 0) return response.data.data.records;
        else { console.error('Lỗi từ Casso API:', response.data.message); return []; }
    } catch (error) {
        console.error('Lỗi khi gọi đến Casso API:', error.message);
        return [];
    }
}
module.exports = { getRecentTransactions };
