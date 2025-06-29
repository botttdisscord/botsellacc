const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.resolve(__dirname, '..', '..', 'database.sqlite'));

function initializeDatabase() {
    console.log('Initializing database...');
    db.pragma('foreign_keys = ON');
    
    const createAccountsTable = `
    CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price INTEGER NOT NULL, description TEXT,
        image_urls TEXT, category TEXT, username BLOB NOT NULL, password BLOB NOT NULL,
        status TEXT NOT NULL DEFAULT 'available', added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`;
    
    const createOrdersTable = `
    CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY, buyer_id TEXT NOT NULL, account_id INTEGER,
        amount INTEGER NOT NULL, status TEXT NOT NULL, payment_method TEXT, coupon_code TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );`;

    const createCouponsTable = `
    CREATE TABLE IF NOT EXISTS coupons (
        code TEXT PRIMARY KEY,
        discount_percentage INTEGER NOT NULL,
        uses_left INTEGER NOT NULL,
        expiry_date DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`;
    
    db.exec(createAccountsTable);
    db.exec(createOrdersTable);
    db.exec(createCouponsTable);
    console.log('✅ Database is ready.');
}
initializeDatabase();

function addAccount(name, price, description, imageUrlsJson, category, encryptedUsername, encryptedPassword) {
    const stmt = db.prepare(`INSERT INTO accounts (name, price, description, image_urls, category, username, password) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(name, price, description, imageUrlsJson, category, encryptedUsername, encryptedPassword);
}

function getAllAccounts() {
    const stmt = db.prepare("SELECT id, name, price, status, image_urls, category, description FROM accounts WHERE status = 'available' ORDER BY added_at DESC");
    return stmt.all();
}

function getAccountsByCategory(category) {
    const stmt = db.prepare("SELECT id, name, price, status, image_urls, category, description FROM accounts WHERE status = 'available' AND category = ? ORDER BY added_at DESC");
    return stmt.all(category);
}

function getAccountById(id) {
    const stmt = db.prepare('SELECT * FROM accounts WHERE id = ?');
    return stmt.get(id);
}

const deleteAccountTransaction = db.transaction((id) => {
    const deleteOrdersStmt = db.prepare('DELETE FROM orders WHERE account_id = ?');
    deleteOrdersStmt.run(id);
    const deleteAccountStmt = db.prepare('DELETE FROM accounts WHERE id = ?');
    const result = deleteAccountStmt.run(id);
    return result.changes > 0;
});

function deleteAccountById(id) {
    try {
        return deleteAccountTransaction(id);
    } catch (error) {
        console.error(`Error deleting account ID ${id}:`, error);
        return false;
    }
}

function updateAccountStatus(accountId, status) {
    const stmt = db.prepare('UPDATE accounts SET status = ? WHERE id = ?');
    stmt.run(status, accountId);
}

function createOrder(orderId, buyerId, accountId, amount, paymentMethod, couponCode) {
    const stmt = db.prepare('INSERT INTO orders (id, buyer_id, account_id, amount, status, payment_method, coupon_code) VALUES (?, ?, ?, ?, ?, ?, ?)');
    stmt.run(orderId, buyerId, accountId, amount, 'pending', paymentMethod, couponCode);
}

function findPendingOrderByUser(buyerId) {
    const stmt = db.prepare("SELECT * FROM orders WHERE buyer_id = ? AND status = 'pending'");
    return stmt.get(buyerId);
}

function updateOrderStatus(orderId, status) {
    const stmt = db.prepare('UPDATE orders SET status = ? WHERE id = ?');
    stmt.run(status, orderId);
}

function getSoldOrders() {
    const stmt = db.prepare(`
        SELECT o.id, o.buyer_id, o.amount, o.created_at, o.payment_method, o.coupon_code, a.name as account_name
        FROM orders o LEFT JOIN accounts a ON o.account_id = a.id
        WHERE o.status = 'paid' ORDER BY o.created_at DESC
    `);
    return stmt.all();
}

function calculateTotalRevenue() {
    const stmt = db.prepare("SELECT SUM(amount) as total FROM orders WHERE status = 'paid'");
    const result = stmt.get();
    return result.total || 0;
}

function getPurchaseHistory(buyerId) {
    const stmt = db.prepare(`
        SELECT a.name, a.username, a.password
        FROM orders o JOIN accounts a ON o.account_id = a.id
        WHERE o.buyer_id = ? AND o.status = 'paid' ORDER BY o.created_at DESC
    `);
    return stmt.all(buyerId);
}

function addCoupon(code, discountPercentage, uses, expiryDate) {
    const stmt = db.prepare('INSERT INTO coupons (code, discount_percentage, uses_left, expiry_date) VALUES (?, ?, ?, ?)');
    stmt.run(code.toUpperCase(), discountPercentage, uses, expiryDate);
}

function getCoupon(code) {
    const stmt = db.prepare('SELECT * FROM coupons WHERE code = ?');
    return stmt.get(code.toUpperCase());
}

function useCoupon(code) {
    const stmt = db.prepare('UPDATE coupons SET uses_left = uses_left - 1 WHERE code = ? AND uses_left != -1');
    stmt.run(code.toUpperCase());
}

function getAllCoupons() {
    const stmt = db.prepare('SELECT * FROM coupons ORDER BY created_at DESC');
    return stmt.all();
}

module.exports = {
    addAccount, getAllAccounts, getAccountById, deleteAccountById, updateAccountStatus,
    createOrder, findPendingOrderByUser, updateOrderStatus,
    getSoldOrders, calculateTotalRevenue, getPurchaseHistory, getAccountsByCategory,
    addCoupon, getCoupon, useCoupon, getAllCoupons
};
