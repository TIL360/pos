const { contextBridge, ipcRenderer } = require('electron');

// We expose everything under 'authAPI' to match your HTML calls
contextBridge.exposeInMainWorld('authAPI', {
    // --- Auth ---
    changePassword: (currentP, newP) => ipcRenderer.invoke('change-password', currentP, newP),

openDBFolder: () => ipcRenderer.send('open-db-folder'),
  searchProductsByName: (query) => ipcRenderer.invoke('search-products', query),
    attemptLogin: (credentials) => ipcRenderer.invoke('login-attempt', credentials),
     updateProductStockLevel: (id, newLevel) => ipcRenderer.invoke('update-product-stock-level', id, newLevel),
    logout: () => ipcRenderer.send('logout-trigger'), 
    addUser: (userData) => ipcRenderer.invoke('add-user', userData),
    getAllUsers: () => ipcRenderer.invoke('get-all-users'),
    deleteUser: (id) => ipcRenderer.invoke('delete-user', id),
    updateProductPrice: (id, price) => ipcRenderer.invoke('update-price', { id, price }),
    getLowStockReport: () => ipcRenderer.invoke('get-low-stock-report'),
    
    processSaleManual: (saleData) => ipcRenderer.invoke('process-sale-manual', saleData),

    getBillDetails: (saleId) => ipcRenderer.invoke('get-bill-details', saleId),    
 processCustomerReturn: (data) => ipcRenderer.invoke('process-customer-return', data),
    supplierReturn: (data) => ipcRenderer.invoke('process-supplier-return', data),
    // --- Inventory & Products ---
    addItem: (itemData) => ipcRenderer.invoke('add-item', itemData),
    getProducts: () => ipcRenderer.invoke('get-products'),
    getAllProducts: () => ipcRenderer.invoke('get-all-inventory'), 
    getProductByBarcode: (barcode) => ipcRenderer.invoke('get-product-by-barcode', barcode),
    
    // --- Categories ---
    addCategory: (name) => ipcRenderer.invoke('add-category', name),
    getCategories: () => ipcRenderer.invoke('get-categories'),

    // --- Sales & Purchases ---
    savePurchase: (data) => ipcRenderer.invoke('save-purchase', data),
    getSalesReport: (filters) => ipcRenderer.invoke('get-sales-report', filters),
    processSale: (saleData) => ipcRenderer.invoke('process-sale', saleData),

    // --- Utils ---
    send: (channel, data) => ipcRenderer.send(channel, data),
    
    // ... your existing functions ...
    getReturnHistory: () => ipcRenderer.invoke('get-return-history'),
getReturnHistoryBySale: (saleId) => ipcRenderer.invoke('get-return-history-by-sale', saleId),

});

// Also exposing as inventoryAPI for backwards compatibility with purchase.html
contextBridge.exposeInMainWorld('inventoryAPI', {
    getProducts: () => ipcRenderer.invoke('get-products'),
    savePurchase: (data) => ipcRenderer.invoke('save-purchase', data)
});

// Change 'authAPI' to 'api'
contextBridge.exposeInMainWorld('api', { 
     send: (channel, data) => {
        let validChannels = ['open-sales-window'];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
     getLicenseStatus: () => ipcRenderer.invoke('get-license-status'),
    getDashboardStats: () => ipcRenderer.invoke('get-dashboard-stats'),
    getLowStockReport: () => ipcRenderer.invoke('get-low-stock-report'),
    generatePDFFromWindow: () => ipcRenderer.invoke('generate-pdf-from-window'),
    


    // ... keep your other functions here

});
