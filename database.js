const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');
const fs = require('fs');

const userDataPath = app.getPath('userData');
//this line would create db insie appdata
const dbPath = path.join(userDataPath, 'point_of_sale.db');

// this would create db file inside the root area of the app
// const dbPath = path.join(__dirname, 'point_of_sale.db');


if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
}

const db = new Database(dbPath, { verbose: console.log });

const initializeDB = () => {
    try {
        db.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, usertype TEXT CHECK(usertype IN ('Admin', 'User')) DEFAULT 'User')`);
        db.exec(`CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, barcode TEXT UNIQUE, cost_price REAL DEFAULT 0.0, price REAL NOT NULL, stock INTEGER DEFAULT 0, min_stock_level INTEGER DEFAULT 0, category TEXT)`);
        db.exec(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL)`);
        db.exec(`CREATE TABLE IF NOT EXISTS purchases (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER, quantity INTEGER, cost_price REAL DEFAULT 0.0, supplier TEXT, purchase_date DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(product_id) REFERENCES products(id))`);
        db.exec(`CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    customer_name TEXT, 
    total REAL, 
    discount REAL DEFAULT 0.0, 
    cash_received REAL DEFAULT 0.0, 
    change_due REAL DEFAULT 0.0, 
    payment_method TEXT, -- <--- New Column
    sale_date DATETIME DEFAULT CURRENT_TIMESTAMP, 
    processed_by TEXT, 
    refund_amount REAL DEFAULT 0.0, 
    return_date DATETIME
)`);

        db.exec(`CREATE TABLE IF NOT EXISTS return_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER,
    product_id INTEGER,
    quantity_returned INTEGER,
    refund_amount REAL,
    return_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sale_id) REFERENCES sales(id),
    FOREIGN KEY (product_id) REFERENCES products(id))`);

        db.exec(`CREATE TABLE IF NOT EXISTS sale_items (id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER, product_id INTEGER, quantity INTEGER, price REAL, FOREIGN KEY(sale_id) REFERENCES sales(id))`);

        const userCount = db.prepare('SELECT count(*) as count FROM users').get();
        if (userCount.count === 0) {
            db.prepare('INSERT INTO users (username, password, usertype) VALUES (?, ?, ?)')
              .run('Admin', 'admin123', 'Admin');
        }
    } catch (err) { console.error("DB Init Error:", err); }
};
initializeDB();

// --- FUNCTIONS ---
function checkUser(username, password) { return db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password); }
function addUser(userData) { return db.prepare('INSERT INTO users (username, password, usertype) VALUES (?, ?, ?)').run(userData.username, userData.password, userData.usertype); }
function getAllUsers() { return db.prepare('SELECT id, username FROM users').all(); }
function addProduct(item) {
    return db.prepare(`INSERT INTO products (name, barcode, cost_price, price, stock, min_stock_level, category) VALUES (?, ?, ?, ?, ?, ?, ?)` )
             .run(item.name, item.barcode, item.cost_price, item.price, item.stock, item.min_stock_level, item.category);
}
function getAllProducts() { return db.prepare('SELECT * FROM products ORDER BY id DESC').all(); }
function getProductByBarcode(barcode) { return db.prepare('SELECT * FROM products WHERE barcode = ?').get(barcode); }
function addCategory(name) { try { db.prepare('INSERT INTO categories (name) VALUES (?)').run(name); return { success: true }; } catch (e) { return { success: false, error: e.message }; } }
function getCategories() { try { const rows = db.prepare('SELECT id, name FROM categories ORDER BY name ASC').all(); return { success: true, categories: rows }; } catch (e) { return { success: false, error: e.message }; } }

function addPurchase(data) {
    const transaction = db.transaction(() => {
        db.prepare('INSERT INTO purchases (product_id, quantity, cost_price, supplier) VALUES (?, ?, ?, ?)').run(data.productId, data.quantity, data.costPrice, data.supplier);
        db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(data.quantity, data.productId);
    });
    return transaction();
}

function processSaleManual(saleData) {
    const { 
        customerName, total, discount, cashReceived, 
        changeDue, items, processedBy, paymentMethod 
    } = saleData;

    const transaction = db.transaction(() => {
        // 1. Insert into Sales Table
        const info = db.prepare(`
            INSERT INTO sales (
                customer_name, total, discount, cash_received, 
                change_due, payment_method, processed_by, sale_date
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        `).run(customerName, total, discount, cashReceived, changeDue, paymentMethod, processedBy);

        const saleId = info.lastInsertRowid;

        // 2. Prepare statements for the loop
        const insertItem = db.prepare(`
            INSERT INTO sale_items (sale_id, product_id, quantity, price) 
            VALUES (?, ?, ?, ?)
        `);
        const updateStock = db.prepare(`
            UPDATE products SET stock = stock - ? WHERE id = ?
        `);

        // 3. Loop through items to record them and update inventory
        for (const item of items) {
            insertItem.run(saleId, item.id, item.qty, item.price);
            updateStock.run(item.qty, item.id);
        }

        return { success: true, saleId };
    });

    try {
        return transaction();
    } catch (err) {
        console.error("Sale Process Error:", err);
        return { success: false, error: err.message };
    }
}


function processSale(saleData) {
    const { 
        customerName, total, discount, cashReceived, 
        changeDue, items, processedBy, paymentMethod 
    } = saleData;

    const transaction = db.transaction(() => {
        // 1. Insert into Sales Table
        const info = db.prepare(`
            INSERT INTO sales (
                customer_name, total, discount, cash_received, 
                change_due, payment_method, processed_by, sale_date
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
        `).run(customerName, total, discount, cashReceived, changeDue, paymentMethod, processedBy);

        const saleId = info.lastInsertRowid;

        // 2. Prepare statements for the loop
        const insertItem = db.prepare(`
            INSERT INTO sale_items (sale_id, product_id, quantity, price) 
            VALUES (?, ?, ?, ?)
        `);
        const updateStock = db.prepare(`
            UPDATE products SET stock = stock - ? WHERE id = ?
        `);

        // 3. Loop through items to record them and update inventory
        for (const item of items) {
            insertItem.run(saleId, item.id, item.qty, item.price);
            updateStock.run(item.qty, item.id);
        }

        return { success: true, saleId };
    });

    try {
        return transaction();
    } catch (err) {
        console.error("Sale Process Error:", err);
        return { success: false, error: err.message };
    }
}











function getSalesReportByUser(date, username) {
    return db.prepare('SELECT id, customer_name, total, sale_date FROM sales WHERE date(sale_date) = ? AND processed_by = ? ORDER BY sale_date DESC').all(date, username);
}

function getReorderList() {
    return db.prepare('SELECT name, stock, min_stock_level, category FROM products WHERE stock <= (min_stock_level * 0.5)').all();
}

// DASHBOARD STATS FUNCTION
function getDashboardStats() {
    try {
        const revenue = db.prepare(`SELECT SUM(total) as total FROM sales WHERE date(sale_date) = date('now', 'localtime')`).get().total || 0;
        const orders = db.prepare(`SELECT COUNT(*) as count FROM sales WHERE date(sale_date) = date('now', 'localtime')`).get().count || 0;
        const lowStock = db.prepare(`SELECT COUNT(*) as count FROM products WHERE stock <= min_stock_level`).get().count || 0;
        return { success: true, revenue, orders, lowStock };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

//low stcok function
function getLowStockReport() {
    try {
        // This query finds items at 50% or less of their minimum stock level
        const sql = `
            SELECT id, name, stock, min_stock_level as target, 
            (min_stock_level - stock) as order_qty 
            FROM products 
            WHERE stock <= (min_stock_level * 0.5)
        `;
        return db.prepare(sql).all();
    } catch (err) {
        console.error("Database Error:", err);
        return [];
    }
}
//low stock code ends
//return
// --- RETURN FUNCTIONS ---

// 1. Customer Return: Customer -> You (Inventory Increases)
/**
 * Processes a customer return, updates inventory, 
 * updates the bill totals, and logs the history.
 */
function processCustomerReturn(returnData) {
    const { saleItemId, saleId, returnQty } = returnData;

    try {
        const transaction = db.transaction(() => {
            // 1. Get current item details from the sale
            const item = db.prepare('SELECT product_id, price, quantity FROM sale_items WHERE id = ?').get(saleItemId);
            
            if (!item) {
                throw new Error("Item not found on this bill.");
            }
            
            if (item.quantity < returnQty) {
                throw new Error("Return quantity exceeds purchase quantity.");
            }

            const refundValue = item.price * returnQty;

            // 2. Log into Return History Table
            db.prepare(`
                INSERT INTO return_history (sale_id, product_id, quantity_returned, refund_amount)
                VALUES (?, ?, ?, ?)
            `).run(saleId, item.product_id, returnQty, refundValue);

            // 3. Update sale_items: Reduce the quantity purchased
            db.prepare('UPDATE sale_items SET quantity = quantity - ? WHERE id = ?')
              .run(returnQty, saleItemId);

            // 4. Update Sales table: Reduce total and track refund
            db.prepare(`
                UPDATE sales 
                SET total = total - ?,  
                    refund_amount = IFNULL(refund_amount, 0) + ?, 
                    return_date = CURRENT_TIMESTAMP 
                WHERE id = ?
            `).run(refundValue, refundValue, saleId);

            // 5. Update Products Stock: Increase inventory
            db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?')
              .run(returnQty, item.product_id);

            // 6. Cleanup: Remove item from bill if quantity reaches 0
            db.prepare('DELETE FROM sale_items WHERE id = ? AND quantity <= 0')
              .run(saleItemId);

            return { success: true };
        });

        return transaction();
    } catch (error) {
        console.error("Database Return Error:", error);
        return { success: false, message: error.message };
    }
}

/**
 * Fetches all return records to display in the History UI
 */
function getReturnHistory() {
    try {
        return db.prepare(`
            SELECT 
                rh.id, 
                rh.sale_id, 
                p.name AS product_name, 
                rh.quantity_returned, 
                rh.refund_amount, 
                rh.return_date 
            FROM return_history rh
            JOIN products p ON rh.product_id = p.id
            ORDER BY rh.return_date DESC
        `).all();
    } catch (error) {
        console.error("Error fetching return history:", error);
        return [];
    }
}






// 2. Supplier Return: You -> Supplier (Inventory Decreases)
function processSupplierReturn(returnData) {
    const transaction = db.transaction(() => {
        // Decrease stock because items are leaving your shop
        db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?')
          .run(returnData.quantity, returnData.productId);
          
        // Record the transaction in the purchases table as a negative or specific type
        db.prepare('INSERT INTO purchases (product_id, quantity, cost_price, supplier) VALUES (?, ?, ?, ?)')
          .run(returnData.productId, -returnData.quantity, returnData.costPrice, returnData.supplier);
    });
    return transaction();
}

// Add this to database.js
function getBillDetails(billId) {
    try {
        const bill = db.prepare("SELECT id, total, discount, cash_received, change_due, customer_name, refund_amount, return_date FROM sales WHERE id = ?").get(billId);
        if (!bill) return { success: false, message: "Bill not found" };

        const items = db.prepare(`
            SELECT 
                si.id AS sale_item_id,  -- FIX 1: You MUST select the ID here
                p.name, 
                p.barcode, 
                si.quantity, 
                si.price 
            FROM sale_items si
            JOIN products p ON si.product_id = p.id
            WHERE si.sale_id = ?        -- FIX 2: This must be sale_id
        `).all(billId);

        return { success: true, bill, items };
    } catch (err) {
        return { success: false, message: err.message };
    }
}


//return item detail

// database.js
function getReturnHistoryBySale(saleId) {
    // Note: use 'quantity_returned' as per your schema
    return db.prepare(`
        SELECT p.name, rh.quantity_returned, rh.refund_amount, rh.return_date 
        FROM return_history rh
        JOIN products p ON rh.product_id = p.id
        WHERE rh.sale_id = ?
    `).all(saleId);
}

// REMEMBER: Add getReturnHistoryBySale to your module.exports at the bottom!



//change password
// database.js
function changeUserPassword(currentPass, newPass) {
    try {
        // 1. Check if the current password is correct (Assuming user ID 1 for single-user system)
        const user = db.prepare("SELECT password FROM users WHERE id = 1").get();
        
        if (user.password !== currentPass) {
            return { success: false, message: "Current password incorrect." };
        }
        
        // 2. Update to new password
        db.prepare("UPDATE users SET password = ? WHERE id = 1").run(newPass);
        return { success: true };
    } catch (err) {
        return { success: false, message: err.message };
    }
}

// Don't forget to add changeUserPassword to module.exports!
function getSalesReportWithDetails(date, username) {
    const sql = `
        SELECT 
            s.id as sale_id, s.customer_name, s.sale_date, 
            s.total as grand_total, s.payment_method, -- Added payment_method
            si.product_id, p.name as product_name, si.quantity, si.price
        FROM sales s
        JOIN sale_items si ON s.id = si.sale_id
        JOIN products p ON si.product_id = p.id
        WHERE date(s.sale_date) = ? AND s.processed_by = ?
        ORDER BY s.sale_date DESC
    `;
    const rows = db.prepare(sql).all(date, username);
    
    const report = [];
    rows.forEach(row => {
        let sale = report.find(s => s.id === row.sale_id);
        if (!sale) {
            sale = {
                id: row.sale_id,
                customer: row.customer_name || 'Walking Customer',
                time: row.sale_date,
                total: row.grand_total,
                method: row.payment_method, // Capture payment method here
                items: []
            };
            report.push(sale);
        }
        sale.items.push({
            id: row.product_id,
            name: row.product_name,
            qty: row.quantity,
            price: row.price
        });
    });
    return report;
}


function updateCategory(id, newName) {
    return db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(newName, id);
}
// Don't forget to add getSaleDetails to your module.exports!

// CRITICAL: ALL FUNCTIONS MUST BE EXPORTED HERE
module.exports = { 
    db,
    getAllUsers,
    checkUser, 
    addUser, 
    addProduct, 
    addPurchase, 
    getAllProducts, 
    processSaleManual, 
    processSale,
    getProductByBarcode, 
    addCategory, 
    getCategories,
    getReorderList,
    getSalesReportByUser,
    getDashboardStats, // <--- ADD THIS LINE HERE
    getLowStockReport,
    processSupplierReturn,
    processCustomerReturn,
    getBillDetails, getReturnHistory, getReturnHistoryBySale, changeUserPassword,
    getSalesReportWithDetails, updateCategory
};  