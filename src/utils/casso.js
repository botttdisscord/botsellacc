const axios = require('axios');

const CASSO_API_URL = 'https://oauth.casso.vn/v2/transactions';
const CASSO_API_KEY = process.env.CASSO_API_KEY;

if (!CASSO_API_KEY) {
    console.warn('[CẢNH BÁO] CASSO_API_KEY chưa được thiết lập trong Secrets. Bot sẽ không thể kiểm tra giao dịch.');
}

/**
 * Kiểm tra các giao dịch gần đây trên Casso
 * @returns {Promise<Array>} Danh sách các giao dịch
 */
async function getRecentTransactions() {
    try {
        const response = await axios.get(CASSO_API_URL, {
            headers: {
                'Authorization': `Apikey ${CASSO_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        if (response.data.error === 0) {
            return response.data.data.records;
        } else {
            console.error('Lỗi từ Casso API:', response.data.message);
            return [];
        }
    } catch (error) {
        console.error('Lỗi khi gọi đến Casso API:', error.message);
        return [];
    }
}

module.exports = {
    getRecentTransactions
};