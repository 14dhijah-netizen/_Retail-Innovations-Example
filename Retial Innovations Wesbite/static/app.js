/* ============================================================
   RETAIL INNOVATIONS LTD — Application Logic
   Auth + Role-based CRUD via Supabase
   ============================================================ */

// ─── State ──────────────────────────────────────────────────
let supabase = null;
let currentUser = null;   // Supabase auth user
let currentProfile = null; // user_profiles row
let isAdmin = false;

let productsCache = [];
let customersCache = [];
let ordersCache = [];
let rewardsCache = [];

let authMode = 'login'; // 'login' | 'register'

// ─── Boot ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    loadLocalSession();
});

// ============================================================
// LOCAL SESSION + STORAGE (no Supabase)
// ============================================================
function readStore(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch (e) { return []; } }
function writeStore(key, data) { localStorage.setItem(key, JSON.stringify(data)); }
function generateId(prefix = 'id') { return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`; }

function loadLocalSession() {
    const u = localStorage.getItem('ri_user');
    if (u) {
        currentUser = JSON.parse(u);
        currentProfile = JSON.parse(localStorage.getItem('ri_profile') || '{}');
        isAdmin = currentProfile.role === 'admin';
        document.getElementById('authStatusDot').classList.toggle('connected', !!currentUser);
        document.getElementById('authStatusText').textContent = currentUser ? `Signed in as ${currentUser.email || currentUser.username}` : 'Signed out';
        enterApp();
    } else {
        // Show login UI by default
        const cfg = document.getElementById('authConfig');
        if (cfg) cfg.remove();
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('authStatusText').textContent = 'Signed out';
    }
} 

// ============================================================
// AUTH: LOGIN / REGISTER / LOGOUT
// ============================================================

function toggleAuthMode() {
    if (authMode === 'login') {
        authMode = 'register';
        document.getElementById('authSubtitle').textContent = 'Create a new account';
        document.getElementById('authSubmitBtn').textContent = 'Create Account';
        document.getElementById('registerFields').style.display = 'block';
        document.getElementById('authToggleText').textContent = 'Already have an account?';
        document.getElementById('authToggleBtn').textContent = 'Sign in';
    } else {
        authMode = 'login';
        document.getElementById('authSubtitle').textContent = 'Sign in to your account';
        document.getElementById('authSubmitBtn').textContent = 'Sign In';
        document.getElementById('registerFields').style.display = 'none';
        document.getElementById('authToggleText').textContent = "Don't have an account?";
        document.getElementById('authToggleBtn').textContent = 'Create one';
    }
}

function handleAuth() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    if (!email || !password) { showToast('Please enter email/username and password.', 'error'); return; }
    if (authMode === 'register') {
        localRegister(email, password);
    } else {
        localLogin(email, password);
    }
} 

function localLogin(email, password) {
    // Hardcoded admin user
    if (email === 'dhillonjsd14@gmail.com' && password === 'Kingjsd14') {
        currentUser = { id: 'admin_1', email };
        currentProfile = { full_name: 'Administrator', role: 'admin' };
        isAdmin = true;
        localStorage.setItem('ri_user', JSON.stringify(currentUser));
        localStorage.setItem('ri_profile', JSON.stringify(currentProfile));
        showToast('Signed in as admin.', 'success');
        enterApp();
        return;
    }

    const users = readStore('ri_users');
    const user = users.find(u => u.email === email);
    if (user) {
        if (user.password !== password) { showToast('Invalid credentials.', 'error'); return; }
        currentUser = { id: user.id, email: user.email };
        currentProfile = { full_name: user.full_name || user.email.split('@')[0], role: user.role || 'customer' };
        isAdmin = currentProfile.role === 'admin';
        localStorage.setItem('ri_user', JSON.stringify(currentUser));
        localStorage.setItem('ri_profile', JSON.stringify(currentProfile));
        showToast('Signed in (local).', 'success');
        enterApp();
        return;
    }

    showToast('User not found. Register or check credentials.', 'error');
} 

function localRegister(email, password) {
    const fullName = document.getElementById('authFullName').value.trim();
    if (password.length < 3) { showToast('Use a longer password (dev).', 'error'); return; }
    const users = readStore('ri_users');
    if (users.find(u => u.email === email)) { showToast('User already exists.', 'error'); return; }
    const newUser = { id: generateId('u'), email, password, full_name: fullName || email.split('@')[0], role: 'customer' };
    users.unshift(newUser);
    writeStore('ri_users', users);
    currentUser = { id: newUser.id, email: newUser.email };
    currentProfile = { full_name: newUser.full_name, role: newUser.role };
    isAdmin = false;
    localStorage.setItem('ri_user', JSON.stringify(currentUser));
    localStorage.setItem('ri_profile', JSON.stringify(currentProfile));
    showToast('Account created (local). Signed in.', 'success');
    enterApp();
} 

function handleLogout() {
    currentUser = null;
    currentProfile = null;
    isAdmin = false;
    localStorage.removeItem('ri_user');
    localStorage.removeItem('ri_profile');
    document.body.classList.remove('is-admin');

    // Show auth, hide app
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('appWrapper').style.display = 'none';
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('authStatusDot').classList.remove('connected');
    document.getElementById('authStatusText').textContent = 'Signed out';
    showToast('Signed out (local).', 'info');
} 

// ============================================================
// USER PROFILE + ROLE
// ============================================================

async function loadUserProfile() {
    if (!currentUser) return;

    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        if (error) {
            // Profile might not exist yet if trigger hasn't fired
            console.warn('Profile not found, using defaults');
            currentProfile = { email: currentUser.email, full_name: '', role: 'customer' };
        } else {
            currentProfile = data;
        }

        isAdmin = currentProfile.role === 'admin';
    } catch (e) {
        currentProfile = { email: currentUser.email, full_name: '', role: 'customer' };
        isAdmin = false;
    }
}

// ============================================================
// ENTER THE APP (after auth)
// ============================================================

function enterApp() {
    // Hide auth screen, show app
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('appWrapper').style.display = 'flex';

    // Set admin class on body
    if (isAdmin) {
        document.body.classList.add('is-admin');
    } else {
        document.body.classList.remove('is-admin');
    }

    // Update user badge
    const name = currentProfile?.full_name || currentUser?.email?.split('@')[0] || 'User';
    document.getElementById('userName').textContent = name;
    document.getElementById('userAvatar').textContent = name.charAt(0).toUpperCase();

    const roleEl = document.getElementById('userRole');
    roleEl.textContent = isAdmin ? 'Admin' : 'Customer';
    if (isAdmin) roleEl.classList.add('role-admin');
    else roleEl.classList.remove('role-admin');

    // Update UI labels for role
    if (isAdmin) {
        document.getElementById('ordersSubtitle').textContent = 'All customer orders (admin view)';
        document.getElementById('statOrdersLabel').textContent = 'All orders';
        document.getElementById('statRevenueLabel').textContent = 'Total revenue';
    } else {
        document.getElementById('ordersSubtitle').textContent = 'Your orders';
        document.getElementById('statOrdersLabel').textContent = 'Your orders';
        document.getElementById('statRevenueLabel').textContent = 'Your spend';
    }

    // Load all data
    loadAllData();
}

// ============================================================
// NAVIGATION
// ============================================================

function initNavigation() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.section-panel').forEach(p => p.classList.remove('active'));
            const panel = document.getElementById(`panel-${tab.dataset.tab}`);
            if (panel) panel.classList.add('active');
        });
    });

    // Allow Enter key to submit auth
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const authScreen = document.getElementById('authScreen');
            if (!authScreen.classList.contains('hidden')) {
                if (document.getElementById('loginForm').style.display !== 'none') {
                    handleAuth();
                }
            }
        }
    });
}

// ============================================================
// TOASTS
// ============================================================

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const icons = { success: '✓', error: '✗', info: 'ℹ' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('leaving'); setTimeout(() => toast.remove(), 300); }, 3500);
}

// ============================================================
// MODAL HELPERS
// ============================================================

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('active');
    });
});

// ============================================================
// LOAD ALL DATA
// ============================================================

async function loadAllData() {
    await Promise.all([
        loadProducts(),
        isAdmin ? loadCustomers() : Promise.resolve(),
        loadOrders(),
        loadRewards()
    ]);
    loadDashboard();
} 

// ============================================================
// PRODUCTS — CRUD
// ============================================================

async function loadProducts() {
    try {
        if (supabase) {
            const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            productsCache = data || [];
        } else {
            productsCache = readStore('ri_products');
        }
        renderProducts(productsCache);
        populateCategoryFilter();
    } catch (err) { showToast(`Products: ${err.message}`, 'error'); }
} 

function renderProducts(products) {
    const tbody = document.getElementById('productsTableBody');
    if (!products.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-state-icon">📦</div><div class="empty-state-text">No products found</div></td></tr>`;
        document.getElementById('productCount').textContent = '0 products';
        return;
    }
    const adminActions = isAdmin;
    tbody.innerHTML = products.map(p => `
        <tr>
            <td>
                <div class="product-cell">
                    <img class="product-thumb" src="${p.image_url || ''}" alt="" onerror="this.style.display='none'">
                    <div>
                        <div class="product-info-name">${esc(p.name)}</div>
                        <div class="product-info-sku">${esc(p.sku)}</div>
                    </div>
                </div>
            </td>
            <td>${esc(p.category)}</td>
            <td>£${Number(p.price).toFixed(2)}</td>
            <td>${p.stock_quantity}</td>
            <td><span class="badge ${p.is_active ? 'badge-active' : 'badge-inactive'}">${p.is_active ? 'Active' : 'Inactive'}</span></td>
            ${adminActions ? `<td><div class="cell-actions">
                <button class="btn btn-sm" onclick="editProduct('${p.id}')">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteProduct('${p.id}','${esc(p.name)}')">Delete</button>
            </div></td>` : '<td></td>'}
        </tr>
    `).join('');
    document.getElementById('productCount').textContent = `${products.length} product${products.length !== 1 ? 's' : ''}`;
}

function populateCategoryFilter() {
    const sel = document.getElementById('productCategoryFilter');
    const cats = [...new Set(productsCache.map(p => p.category))].sort();
    sel.innerHTML = '<option value="">All Categories</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

function filterProducts() {
    const s = document.getElementById('productSearch').value.toLowerCase();
    const c = document.getElementById('productCategoryFilter').value;
    renderProducts(productsCache.filter(p =>
        (!s || p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s)) &&
        (!c || p.category === c)
    ));
}

function openProductModal(product = null) {
    if (!isAdmin) { showToast('Admin access required.', 'error'); return; }
    document.getElementById('productModalTitle').textContent = product ? 'Edit Product' : 'Add Product';
    document.getElementById('productEditId').value = product ? product.id : '';
    document.getElementById('prodName').value = product ? product.name : '';
    document.getElementById('prodSku').value = product ? product.sku : '';
    document.getElementById('prodCategory').value = product ? product.category : '';
    document.getElementById('prodPrice').value = product ? product.price : '';
    document.getElementById('prodStock').value = product ? product.stock_quantity : '';
    document.getElementById('prodDesc').value = product ? (product.description || '') : '';
    document.getElementById('prodImage').value = product ? (product.image_url || '') : '';
    document.getElementById('prodActive').checked = product ? product.is_active : true;
    openModal('productModal');
}

function editProduct(id) { const p = productsCache.find(x => x.id === id); if (p) openProductModal(p); }

async function saveProduct() {
    const id = document.getElementById('productEditId').value;
    const payload = {
        name: document.getElementById('prodName').value.trim(),
        sku: document.getElementById('prodSku').value.trim(),
        category: document.getElementById('prodCategory').value.trim(),
        price: parseFloat(document.getElementById('prodPrice').value) || 0,
        stock_quantity: parseInt(document.getElementById('prodStock').value) || 0,
        description: document.getElementById('prodDesc').value.trim(),
        image_url: document.getElementById('prodImage').value.trim(),
        is_active: document.getElementById('prodActive').checked,
    };
    if (!payload.name || !payload.sku || !payload.category) { showToast('Fill in Name, SKU, and Category.', 'error'); return; }
    try {
        if (supabase) {
            const result = id
                ? await supabase.from('products').update(payload).eq('id', id).select()
                : await supabase.from('products').insert(payload).select();
            if (result.error) throw result.error;
            showToast(id ? 'Product updated!' : 'Product created!', 'success');
            closeModal('productModal');
            await loadProducts(); loadDashboard();
        } else {
            if (id) {
                const idx = productsCache.findIndex(p => p.id === id);
                if (idx !== -1) Object.assign(productsCache[idx], payload, { updated_at: new Date().toISOString() });
            } else {
                const newItem = Object.assign(payload, { id: generateId('p'), created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
                productsCache.unshift(newItem);
            }
            writeStore('ri_products', productsCache);
            showToast(id ? 'Product updated (local)!' : 'Product created (local)!', 'success');
            closeModal('productModal');
            renderProducts(productsCache);
            loadDashboard();
        }
    } catch (err) { showToast(`Error: ${err.message}`, 'error'); }
} 

async function deleteProduct(id, name) {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
        if (supabase) {
            const { error } = await supabase.from('products').delete().eq('id', id);
            if (error) throw error;
            showToast('Product deleted.', 'success');
            await loadProducts(); loadDashboard();
        } else {
            productsCache = productsCache.filter(p => p.id !== id);
            writeStore('ri_products', productsCache);
            showToast('Product deleted (local).', 'success');
            renderProducts(productsCache);
            loadDashboard();
        }
    } catch (err) { showToast(`Error: ${err.message}`, 'error'); }
} 

// ============================================================
// CUSTOMERS — CRUD (Admin only)
// ============================================================

async function loadCustomers() {
    if (!isAdmin) return;
    try {
        if (supabase) {
            const { data, error } = await supabase.from('customers').select('*').order('joined_at', { ascending: false });
            if (error) throw error;
            customersCache = data || [];
        } else {
            customersCache = readStore('ri_customers');
        }
        renderCustomers(customersCache);
    } catch (err) { showToast(`Customers: ${err.message}`, 'error'); }
} 

function renderCustomers(customers) {
    const tbody = document.getElementById('customersTableBody');
    if (!customers.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-text">No customers found</div></td></tr>`;
        document.getElementById('customerCount').textContent = '0 customers';
        return;
    }
    tbody.innerHTML = customers.map(c => `
        <tr>
            <td><div><div style="font-weight:500">${esc(c.full_name)}</div><div class="product-info-sku">${esc(c.email)}</div></div></td>
            <td>${esc(c.phone || '—')}</td>
            <td style="font-family:var(--font-mono)">${c.loyalty_points.toLocaleString()}</td>
            <td><span class="badge badge-${c.loyalty_tier.toLowerCase()}">${c.loyalty_tier}</span></td>
            <td>£${Number(c.total_spent).toFixed(2)}</td>
            <td><div class="cell-actions">
                <button class="btn btn-sm" onclick="editCustomer('${c.id}')">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteCustomer('${c.id}','${esc(c.full_name)}')">Delete</button>
            </div></td>
        </tr>
    `).join('');
    document.getElementById('customerCount').textContent = `${customers.length} customer${customers.length !== 1 ? 's' : ''}`;
}

function filterCustomers() {
    const s = document.getElementById('customerSearch').value.toLowerCase();
    const t = document.getElementById('customerTierFilter').value;
    renderCustomers(customersCache.filter(c =>
        (!s || c.full_name.toLowerCase().includes(s) || c.email.toLowerCase().includes(s)) &&
        (!t || c.loyalty_tier === t)
    ));
}

function openCustomerModal(customer = null) {
    document.getElementById('customerModalTitle').textContent = customer ? 'Edit Customer' : 'Add Customer';
    document.getElementById('customerEditId').value = customer ? customer.id : '';
    document.getElementById('custName').value = customer ? customer.full_name : '';
    document.getElementById('custEmail').value = customer ? customer.email : '';
    document.getElementById('custPhone').value = customer ? (customer.phone || '') : '';
    document.getElementById('custPoints').value = customer ? customer.loyalty_points : 0;
    document.getElementById('custTier').value = customer ? customer.loyalty_tier : 'Bronze';
    openModal('customerModal');
}

function editCustomer(id) { const c = customersCache.find(x => x.id === id); if (c) openCustomerModal(c); }

async function saveCustomer() {
    const id = document.getElementById('customerEditId').value;
    const payload = {
        full_name: document.getElementById('custName').value.trim(),
        email: document.getElementById('custEmail').value.trim(),
        phone: document.getElementById('custPhone').value.trim(),
        loyalty_points: parseInt(document.getElementById('custPoints').value) || 0,
        loyalty_tier: document.getElementById('custTier').value,
        total_spent: 0
    };
    if (!payload.full_name || !payload.email) { showToast('Fill in Name and Email.', 'error'); return; }
    try {
        if (supabase) {
            const result = id
                ? await supabase.from('customers').update(payload).eq('id', id).select()
                : await supabase.from('customers').insert(payload).select();
            if (result.error) throw result.error;
            showToast(id ? 'Customer updated!' : 'Customer added!', 'success');
            closeModal('customerModal');
            await loadCustomers(); loadDashboard();
        } else {
            if (id) {
                const idx = customersCache.findIndex(c => c.id === id);
                if (idx !== -1) Object.assign(customersCache[idx], payload, { updated_at: new Date().toISOString() });
            } else {
                const newItem = Object.assign(payload, { id: generateId('c'), joined_at: new Date().toISOString(), updated_at: new Date().toISOString(), total_spent: 0 });
                customersCache.unshift(newItem);
            }
            writeStore('ri_customers', customersCache);
            showToast(id ? 'Customer updated (local)!' : 'Customer added (local)!', 'success');
            closeModal('customerModal');
            renderCustomers(customersCache);
            loadDashboard();
        }
    } catch (err) { showToast(`Error: ${err.message}`, 'error'); }
} 

async function deleteCustomer(id, name) {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
        if (supabase) {
            const { error } = await supabase.from('customers').delete().eq('id', id);
            if (error) throw error;
            showToast('Customer deleted.', 'success');
            await loadCustomers(); loadDashboard();
        } else {
            customersCache = customersCache.filter(c => c.id !== id);
            writeStore('ri_customers', customersCache);
            showToast('Customer deleted (local).', 'success');
            renderCustomers(customersCache);
            loadDashboard();
        }
    } catch (err) { showToast(`Error: ${err.message}`, 'error'); }
} 

// ============================================================
// ORDERS — CRUD
// Admin: sees ALL orders, can edit any order's status/details
// Customer: sees only their own orders
// ============================================================

async function loadOrders() {
    try {
        if (supabase) {
            let query = supabase.from('orders').select('*, customers(full_name)').order('created_at', { ascending: false });
            if (!isAdmin) query = query.eq('user_id', currentUser.id);
            const { data, error } = await query;
            if (error) throw error;
            ordersCache = data || [];
        } else {
            const all = readStore('ri_orders');
            ordersCache = isAdmin ? all : all.filter(o => o.user_id === currentUser?.id);
        }
        renderOrders(ordersCache);
    } catch (err) { showToast(`Orders: ${err.message}`, 'error'); }
} 

function renderOrders(orders) {
    const tbody = document.getElementById('ordersTableBody');
    if (!orders.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-state-icon">🧾</div><div class="empty-state-text">No orders found</div></td></tr>`;
        document.getElementById('orderCount').textContent = '0 orders';
        return;
    }
    tbody.innerHTML = orders.map(o => {
        const canEdit = isAdmin || (o.user_id === currentUser.id && o.status === 'pending');
        return `
        <tr>
            <td><span style="font-family:var(--font-mono);font-size:0.78rem">${o.id.slice(0, 8)}…</span></td>
            ${isAdmin ? `<td>${o.customers ? esc(o.customers.full_name) : '<span style="color:var(--color-text-dim)">—</span>'}</td>` : ''}
            <td style="font-weight:600">£${Number(o.total_amount).toFixed(2)}</td>
            <td><span class="badge badge-${o.status}">${cap(o.status)}</span></td>
            <td style="font-size:0.82rem;color:var(--color-text-muted)">${new Date(o.created_at).toLocaleDateString('en-GB')}</td>
            <td>
                <div class="cell-actions">
                    ${canEdit ? `<button class="btn btn-sm" onclick="editOrder('${o.id}')">Edit</button>` : ''}
                    ${isAdmin ? `<button class="btn btn-sm btn-danger" onclick="deleteOrder('${o.id}')">Delete</button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');
    document.getElementById('orderCount').textContent = `${orders.length} order${orders.length !== 1 ? 's' : ''}`;
}

function filterOrders() {
    const s = document.getElementById('orderSearch').value.toLowerCase();
    const st = document.getElementById('orderStatusFilter').value;
    renderOrders(ordersCache.filter(o => {
        const name = o.customers?.full_name?.toLowerCase() || '';
        return (!s || name.includes(s) || o.id.includes(s)) && (!st || o.status === st);
    }));
}

function openOrderModal(order = null) {
    document.getElementById('orderModalTitle').textContent = order ? 'Edit Order' : 'New Order';
    document.getElementById('orderEditId').value = order ? order.id : '';
    document.getElementById('orderTotal').value = order ? order.total_amount : '';
    document.getElementById('orderStatus').value = order ? order.status : 'pending';
    document.getElementById('orderPayment').value = order ? (order.payment_method || '') : '';
    document.getElementById('orderNotes').value = order ? (order.notes || '') : '';

    // Populate customer dropdown (admin only)
    if (isAdmin) {
        const sel = document.getElementById('orderCustomer');
        sel.innerHTML = '<option value="">Select customer...</option>' +
            customersCache.map(c => `<option value="${c.id}" ${order && order.customer_id === c.id ? 'selected' : ''}>${esc(c.full_name)}</option>`).join('');
    }

    // If not admin, disable status field (they can only keep pending)
    document.getElementById('orderStatus').disabled = !isAdmin;

    openModal('orderModal');
}

function editOrder(id) { const o = ordersCache.find(x => x.id === id); if (o) openOrderModal(o); }

async function saveOrder() {
    const id = document.getElementById('orderEditId').value;
    const payload = {
        total_amount: parseFloat(document.getElementById('orderTotal').value) || 0,
        status: document.getElementById('orderStatus').value,
        payment_method: document.getElementById('orderPayment').value.trim(),
        notes: document.getElementById('orderNotes').value.trim(),
    };

    if (isAdmin) {
        payload.customer_id = document.getElementById('orderCustomer').value || null;
    }

    if (!id) {
        payload.user_id = currentUser?.id || 'guest';
        payload.created_at = new Date().toISOString();
    }

    if (!payload.total_amount) { showToast('Enter the order total.', 'error'); return; }

    try {
        if (supabase) {
            const result = id
                ? await supabase.from('orders').update(payload).eq('id', id).select()
                : await supabase.from('orders').insert(payload).select();
            if (result.error) throw result.error;
            showToast(id ? 'Order updated!' : 'Order created!', 'success');
            closeModal('orderModal');
            await loadOrders(); loadDashboard();
        } else {
            if (id) {
                const idx = ordersCache.findIndex(o => o.id === id);
                if (idx !== -1) Object.assign(ordersCache[idx], payload, { updated_at: new Date().toISOString() });
            } else {
                const newItem = Object.assign(payload, { id: generateId('o'), created_at: new Date().toISOString() });
                ordersCache.unshift(newItem);
            }
            writeStore('ri_orders', ordersCache);
            showToast(id ? 'Order updated (local)!' : 'Order created (local)!', 'success');
            closeModal('orderModal');
            renderOrders(ordersCache);
            loadDashboard();
        }
    } catch (err) { showToast(`Error: ${err.message}`, 'error'); }
} 

async function deleteOrder(id) {
    if (!confirm('Delete this order?')) return;
    try {
        if (supabase) {
            const { error } = await supabase.from('orders').delete().eq('id', id);
            if (error) throw error;
            showToast('Order deleted.', 'success');
            await loadOrders(); loadDashboard();
        } else {
            ordersCache = ordersCache.filter(o => o.id !== id);
            writeStore('ri_orders', ordersCache);
            showToast('Order deleted (local).', 'success');
            renderOrders(ordersCache);
            loadDashboard();
        }
    } catch (err) { showToast(`Error: ${err.message}`, 'error'); }
} 

// ============================================================
// LOYALTY REWARDS — CRUD
// ============================================================

async function loadRewards() {
    try {
        if (supabase) {
            const { data, error } = await supabase.from('loyalty_rewards').select('*').order('points_required', { ascending: true });
            if (error) throw error;
            rewardsCache = data || [];
        } else {
            rewardsCache = readStore('ri_rewards');
        }
        renderRewards(rewardsCache);
    } catch (err) { showToast(`Rewards: ${err.message}`, 'error'); }
} 

function renderRewards(rewards) {
    const tbody = document.getElementById('rewardsTableBody');
    const types = { discount_percent: 'Discount (%)', discount_fixed: 'Discount (£)', free_product: 'Free Product', free_shipping: 'Free Shipping' };
    if (!rewards.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-state-icon">🎁</div><div class="empty-state-text">No rewards configured</div></td></tr>`;
        document.getElementById('rewardCount').textContent = '0 rewards';
        return;
    }
    tbody.innerHTML = rewards.map(r => `
        <tr>
            <td><div><div style="font-weight:500">${esc(r.name)}</div><div class="product-info-sku">${esc(r.description || '')}</div></div></td>
            <td>${types[r.reward_type] || r.reward_type}</td>
            <td style="font-family:var(--font-mono)">${r.reward_type.includes('percent') ? r.reward_value + '%' : '£' + Number(r.reward_value).toFixed(2)}</td>
            <td style="font-family:var(--font-mono)">${r.points_required.toLocaleString()} pts</td>
            <td><span class="badge ${r.is_active ? 'badge-active' : 'badge-inactive'}">${r.is_active ? 'Active' : 'Inactive'}</span></td>
            ${isAdmin ? `<td><div class="cell-actions">
                <button class="btn btn-sm" onclick="editReward('${r.id}')">Edit</button>
                <button class="btn btn-sm btn-danger" onclick="deleteReward('${r.id}','${esc(r.name)}')">Delete</button>
            </div></td>` : '<td></td>'}
        </tr>
    `).join('');
    document.getElementById('rewardCount').textContent = `${rewards.length} reward${rewards.length !== 1 ? 's' : ''}`;
}

function openRewardModal(reward = null) {
    if (!isAdmin) { showToast('Admin access required.', 'error'); return; }
    document.getElementById('rewardModalTitle').textContent = reward ? 'Edit Reward' : 'Add Reward';
    document.getElementById('rewardEditId').value = reward ? reward.id : '';
    document.getElementById('rewName').value = reward ? reward.name : '';
    document.getElementById('rewDesc').value = reward ? (reward.description || '') : '';
    document.getElementById('rewType').value = reward ? reward.reward_type : 'discount_percent';
    document.getElementById('rewValue').value = reward ? reward.reward_value : '';
    document.getElementById('rewPoints').value = reward ? reward.points_required : '';
    document.getElementById('rewActive').checked = reward ? reward.is_active : true;
    openModal('rewardModal');
}

function editReward(id) { const r = rewardsCache.find(x => x.id === id); if (r) openRewardModal(r); }

async function saveReward() {
    const id = document.getElementById('rewardEditId').value;
    const payload = {
        name: document.getElementById('rewName').value.trim(),
        description: document.getElementById('rewDesc').value.trim(),
        reward_type: document.getElementById('rewType').value,
        reward_value: parseFloat(document.getElementById('rewValue').value) || 0,
        points_required: parseInt(document.getElementById('rewPoints').value) || 0,
        is_active: document.getElementById('rewActive').checked,
    };
    if (!payload.name || !payload.points_required) { showToast('Fill in Name and Points Required.', 'error'); return; }
    try {
        if (supabase) {
            const result = id
                ? await supabase.from('loyalty_rewards').update(payload).eq('id', id).select()
                : await supabase.from('loyalty_rewards').insert(payload).select();
            if (result.error) throw result.error;
            showToast(id ? 'Reward updated!' : 'Reward created!', 'success');
            closeModal('rewardModal');
            await loadRewards();
        } else {
            if (id) {
                const idx = rewardsCache.findIndex(r => r.id === id);
                if (idx !== -1) Object.assign(rewardsCache[idx], payload, { updated_at: new Date().toISOString() });
            } else {
                const newItem = Object.assign(payload, { id: generateId('r'), created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
                rewardsCache.unshift(newItem);
            }
            writeStore('ri_rewards', rewardsCache);
            showToast(id ? 'Reward updated (local)!' : 'Reward created (local)!', 'success');
            closeModal('rewardModal');
            renderRewards(rewardsCache);
        }
    } catch (err) { showToast(`Error: ${err.message}`, 'error'); }
} 

async function deleteReward(id, name) {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
        if (supabase) {
            const { error } = await supabase.from('loyalty_rewards').delete().eq('id', id);
            if (error) throw error;
            showToast('Reward deleted.', 'success');
            await loadRewards();
        } else {
            rewardsCache = rewardsCache.filter(r => r.id !== id);
            writeStore('ri_rewards', rewardsCache);
            showToast('Reward deleted (local).', 'success');
            renderRewards(rewardsCache);
        }
    } catch (err) { showToast(`Error: ${err.message}`, 'error'); }
} 

// ============================================================
// DASHBOARD
// ============================================================

function loadDashboard() {
    document.getElementById('statProducts').textContent = productsCache.length;
    document.getElementById('statCustomers').textContent = customersCache.length;
    document.getElementById('statOrders').textContent = ordersCache.length;

    const rev = ordersCache.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    document.getElementById('statRevenue').textContent = `£${rev.toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;

    if (isAdmin) {
        renderBarChart();
        renderDonutChart();
    }
}

function renderBarChart() {
    const chart = document.getElementById('barChart');
    const cats = {};
    productsCache.forEach(p => { cats[p.category] = (cats[p.category] || 0) + 1; });
    const entries = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const max = Math.max(...entries.map(e => e[1]), 1);
    if (!entries.length) { chart.innerHTML = '<div style="color:var(--color-text-dim)">No data</div>'; return; }
    chart.innerHTML = entries.map(([cat, count]) => `
        <div class="bar-col">
            <div class="bar" style="height:${(count/max)*100}%" title="${cat}: ${count}"></div>
            <div class="bar-label">${cat.slice(0,6)}</div>
        </div>
    `).join('');
}

function renderDonutChart() {
    const ring = document.getElementById('donutRing');
    const legend = document.getElementById('donutLegend');
    const tiers = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0 };
    customersCache.forEach(c => { if (tiers.hasOwnProperty(c.loyalty_tier)) tiers[c.loyalty_tier]++; });
    const total = customersCache.length || 1;
    const colors = { Bronze: '#CD7F32', Silver: '#C0C0C0', Gold: '#FFD700', Platinum: '#A0C8FF' };
    let parts = [], deg = 0;
    Object.entries(tiers).forEach(([t, n]) => { const d = (n / total) * 360; parts.push(`${colors[t]} ${deg}deg ${deg + d}deg`); deg += d; });
    ring.style.background = parts.length ? `conic-gradient(${parts.join(', ')})` : 'var(--color-surface)';
    ring.innerHTML = `<div class="donut-center"><div class="donut-center-value">${total}</div><div class="donut-center-label">Total</div></div>`;
    legend.innerHTML = Object.entries(tiers).map(([t, n]) => `<div class="legend-item"><div class="legend-dot" style="background:${colors[t]}"></div><span>${t}: ${n}</span></div>`).join('');
}



// ============================================================
// UTILITIES
// ============================================================

function esc(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
