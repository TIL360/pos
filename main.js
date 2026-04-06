const { app, BrowserWindow, globalShortcut, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { shell } = require('electron'); // Add this at the top

// 1. EXPIRY CONFIGURATION
const EXPIRY_DATE = new Date(2026, 6, 30); // Dec 31, 2025 (Format: Year, Month-1, Day)

// 2. IMPORT FROM DATABASE.JS
const { 
    db, 
    checkUser, 
    addUser, 
    addProduct, 
    addPurchase, 
    getAllProducts, 
    getProductByBarcode,
    addCategory, getBillDetails,
    getCategories,
    processCustomerReturn, 
    processSupplierReturn,
    getReturnHistory,
    getReturnHistoryBySale,
    changeUserPassword,
    processSale
} = require('./database.js');
 

let win;

function createWindow() {
    // EXPIRY CHECK
    const today = new Date();
    if (today > EXPIRY_DATE) {
        dialog.showErrorBox(
            "System Lock", 
            "Your license has expired. Please contact the administrator to continue using this software. Contact: 0322-5366745, E-mail: itsmeaamer85@gmail.com"
        );
        app.quit();
        return;
    }

    win = new BrowserWindow({
        width: 1100,
        height: 850,
        titleBarStyle: "default",
        backgroundColor: "#fdf0d5",
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'), 
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // FIX: Using path.join for reliable file loading
    win.loadFile(path.join(__dirname, 'components', 'login.html'));
    win.on('closed', () => { win = null; });
}
//licence status
ipcMain.handle('get-license-status', () => {
    const today = new Date();
    const diffTime = EXPIRY_DATE - today;
    
    if (diffTime <= 0) return "Expired";

    const totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const months = Math.floor(totalDays / 30);
    const days = totalDays % 30;

    return `${months} Months, ${days} Days Remaining`;
});


// Add a function to create sales windows
function createSalesWindow(page, user) {
  const salesWin = new BrowserWindow({
    width: 1000,
    height: 800,
    backgroundColor: "#fdf0d5",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Construct the path with the user as a query parameter
  const filePath = path.join(__dirname, 'components', page);
  salesWin.loadURL(`file://${filePath}?user=${encodeURIComponent(user)}`);
}


// Add an IPC listener to trigger these windows
ipcMain.on('open-sales-window', (event, data) => {
  // data will be an object like { page: 'sale.html', user: 'Admin' }
  createSalesWindow(data.page, data.user);
});
// --- IPC HANDLERS ---

// Navigation Helper (Use this to change pages from your frontend)
ipcMain.on('change-page', (event, fileName) => {
    if (win) {
        win.loadFile(path.join(__dirname, 'components', fileName));
    }
});

// Auth
ipcMain.handle('login-attempt', async (event, credentials) => {
    try {
        const user = checkUser(credentials.username, credentials.password);
        return user ? { success: true, user } : { success: false, message: "Invalid credentials" };
    } catch (err) { return { success: false, message: "Database Error" }; }
});

ipcMain.handle('add-user', async (event, userData) => {
    try { addUser(userData); return { success: true }; } 
    catch (err) { return { success: false, error: err.message }; }
});

ipcMain.on('logout-trigger', () => { 
    if (win) win.loadFile(path.join(__dirname, 'components', 'login.html')); 
});

// Inventory
ipcMain.handle('add-item', async (event, itemData) => {
    try {
        const info = addProduct(itemData);
        return { success: true, id: info.lastInsertRowid };
    } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('get-products', async () => {
    try { return db.prepare('SELECT id, name FROM products').all(); } 
    catch (err) { return []; }
});

ipcMain.handle('get-all-inventory', async () => {
    try { return getAllProducts(); } 
    catch (err) { return []; }
});

ipcMain.handle('save-purchase', async (event, purchaseData) => {
    try { addPurchase(purchaseData); return { success: true }; } 
    catch (err) { return { success: false, error: err.message }; }
});

// Sales & Categories
ipcMain.handle('process-sale', async (event, saleData) => {
    try { return processSale(saleData); } 
    catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('process-sale-manual', async (event, saleData) => {
    try {
        const { customerName, total, items, processedBy } = saleData;

        // Insert into sales table
        const stmt = db.prepare("INSERT INTO sales (customer_name, total, processed_by, sale_date) VALUES (?, ?, ?, datetime('now', 'localtime'))");
        const info = stmt.run(customerName, total, processedBy); // <--- Use processedBy here
        
        const saleId = info.lastInsertRowid;

        // ... (rest of your logic to insert sale_items)
        
        return { success: true };
    } catch (err) {
        console.error(err);
        return { success: false, error: err.message };
    }
});


ipcMain.handle('get-product-by-barcode', (event, barcode) => {
    try { return getProductByBarcode(barcode); } catch (err) { return null; }
});

ipcMain.handle('add-category', async (event, categoryName) => {
    try { return addCategory(categoryName); } 
    catch (error) { return { success: false, error: error.message }; }
});

ipcMain.handle('get-categories', async () => {
    try { return getCategories(); } catch (error) { return []; }
});

ipcMain.handle('get-bill-details', async (event, billId) => {
    return getBillDetails(billId); // Calls the function in database.js
});
// User Management
ipcMain.handle('get-all-users', async () => {
    try {
        const { getAllUsers } = require('./database.js'); 
        return getAllUsers();
    } catch (err) {
        console.error("Error fetching users:", err);
        return [];
    }
});
// Update your search handler to use the 'db' object correctly
// Update your search handler to use the 'better-sqlite3' syntax
ipcMain.handle('search-products', async (event, query) => {
    try {
        // Professional "type-to-select" matching using better-sqlite3 syntax
        const sql = "SELECT id, name, price, stock FROM products WHERE name LIKE ? LIMIT 8";
        const rows = db.prepare(sql).all(`%${query}%`);
        return rows;
    } catch (err) {
        console.error("SQL Search Error:", err);
        return [];
    }
});

ipcMain.handle('delete-user', async (event, id) => {
    try {
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

// UI Fixes
ipcMain.on('fix-focus', (event) => {
    const focusedWindow = BrowserWindow.fromWebContents(event.sender);
    if (focusedWindow) {
        focusedWindow.setIgnoreMouseEvents(false); 
        focusedWindow.blur();
        setTimeout(() => {
            if (!focusedWindow.isDestroyed()) {
                focusedWindow.focus();
                focusedWindow.webContents.focus();
            }
        }, 50);
    }
});

// Product Updates
ipcMain.handle('update-price', async (event, { id, price }) => {
    try {
        const stmt = db.prepare('UPDATE products SET price = ? WHERE id = ?');
        stmt.run(price, id);
        return { success: true };
    } catch (err) {
        console.error("Price Update Error:", err);
        return { success: false, error: err.message };
    }
});

// Low Stock Reporting

// Add this in main.js along with your other ipcMain.handle functions
ipcMain.handle('get-dashboard-stats', async () => {
    const { getDashboardStats } = require('./database.js'); // Ensure it's imported
    return getDashboardStats();
});

// In main.js
ipcMain.handle('get-inventory', async () => {
    // Make sure 'selling_price' and 'quantity' are explicitly in the SELECT
    const sql = `SELECT id, name, barcode, selling_price, quantity, min_stock_level, category FROM products`;
    return db.prepare(sql).all();
});

//low stock report

ipcMain.handle('get-low-stock-report', async () => {
    try {
        // We need 'barcode' and 'min_stock_level' specifically
       const sql = `
    SELECT barcode, name, stock, stock, min_stock_level
    FROM products
    WHERE stock < (min_stock_level / 2.0)
`;
        return db.prepare(sql).all();
    } catch (err) {
        console.error("Database Error:", err);
        return [];
    }
});


// --- RETURNS HANDLERS ---

// Customer Return (Increases Stock)
ipcMain.handle('process-customer-return', async (event, returnData) => {
    try {
        processCustomerReturn(returnData); // Calls the new logic above
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});
// In main.js
ipcMain.handle('get-sale-details', async (event, saleId) => {
    try {
        // Query to get items based on the JOIN you have in your terminal
        const sql = `
            SELECT si.product_id, p.name, p.barcode, si.quantity, p.price 
            FROM sale_items si
            JOIN products p ON si.product_id = p.id
            WHERE si.sale_id = ?`;
        
        const rows = await db.all(sql, [saleId]); // Use your DB's 'all' method

        if (rows.length > 0) {
            // Return an object containing the items array
            return { success: true, items: rows };
        } else {
            return { success: false, items: [] };
        }
    } catch (err) {
        console.error(err);
        return { success: false, error: err.message };
    }
});

//sale report
// Add this in main.js with other ipcMain.handle functions
ipcMain.handle('get-sales-report', async (event, { date, username }) => {
    try {
        const { getSalesReportWithDetails } = require('./database.js');
        return getSalesReportWithDetails(date, username);
    } catch (err) {
        console.error("Report Error:", err);
        return [];
    }
});





// Supplier Return (Decreases Stock)
ipcMain.handle('process-supplier-return', async (event, returnData) => {
    try {
        processSupplierReturn(returnData);
        return { success: true };
    } catch (err) {
        console.error("Supplier Return Error:", err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('update-product-stock-level', async (event, id, newLevel) => {
    try {
        const sql = `UPDATE products SET min_stock_level = ? WHERE id = ?`;
        const stmt = db.prepare(sql);
        stmt.run(newLevel, id);
        return { success: true };
    } catch (err) {
        console.error("Database Error:", err);
        return { success: false, error: err.message };
    }
});


// Around line 344 in main.js
ipcMain.handle('get-return-history', async () => {
    return getReturnHistory(); // Make sure 'db' matches the name you used for require('./database.js')
});
//return item detail
ipcMain.handle('get-return-history-by-sale', async (event, saleId) => {
    return getReturnHistoryBySale(saleId);
});

//change password
ipcMain.handle('change-password', async (event, currentP, newP) => {
    return changeUserPassword(currentP, newP);
});


//low stock report ends
// --- LIFECYCLE ---
app.whenReady().then(createWindow);
ipcMain.on('open-db-folder', () => {
  const userDataPath = app.getPath('userData');
  shell.openPath(userDataPath); // This opens the folder for the user automatically
});
app.on('window-all-closed', () => { 
    if (process.platform !== 'darwin') app.quit(); 
});

app.on('will-quit', () => { 
    globalShortcut.unregisterAll(); 
    if (db) db.close(); 
});
