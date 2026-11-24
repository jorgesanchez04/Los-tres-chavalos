import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, deleteDoc, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Global Data Models & Application State
const TABLES = ["Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Mesa 5", "Mesa 6", "Barra 1", "Barra 2", "Terraza 1", "Terraza 2", "VIP 1", "VIP 2"];
const CATEGORIES = ["Miches","Cervezas", "Cocteles", "Tragos / Licores", "Alimentos", "Sin Alcohol"];

const PRODUCTS = [
    { id: "p1", name: "Miche de mango", price: 95.00, category: "Miches", icon: "fa-beer-mug-empty", color: "text-amber-400" },
    { id: "p2", name: "Cerveza Lager Draft", price: 75.00, category: "Cervezas", icon: "fa-glass-water", color: "text-amber-300" },
    { id: "p3", name: "Stout Negra", price: 105.00, category: "Cervezas", icon: "fa-beer-mug-empty", color: "text-amber-600" },
    { id: "p4", name: "Margarita Neón", price: 140.00, category: "Cocteles", icon: "fa-martini-glass-citrus", color: "text-emerald-400" },
    { id: "p5", name: "Mojito Cubano", price: 130.00, category: "Cocteles", icon: "fa-glass-water-droplet", color: "text-emerald-300" },
    { id: "p6", name: "Old Fashioned", price: 160.00, category: "Tragos / Licores", icon: "fa-whiskey-glass", color: "text-amber-500" },
    { id: "p7", name: "Tequila Doble", price: 120.00, category: "Tragos / Licores", icon: "fa-glass-whiskey", color: "text-amber-300" },
    { id: "p8", name: "Hamburguesa Taproom", price: 185.00, category: "Alimentos", icon: "fa-burger", color: "text-orange-400" },
    { id: "p9", name: "Nachos con Queso & Chile", price: 145.00, category: "Alimentos", icon: "fa-cheese", color: "text-yellow-400" },
    { id: "p10", name: "Alitas BBQ (8 unidades)", price: 165.00, category: "Alimentos", icon: "fa-drumstick-bite", color: "text-red-400" },
    { id: "p11", name: "Refresco 355ml", price: 45.00, category: "Sin Alcohol", icon: "fa-bottle-water", color: "text-blue-400" },
    { id: "p12", name: "Agua Mineral 500ml", price: 40.00, category: "Sin Alcohol", icon: "fa-glass-water", color: "text-cyan-300" }
];

let activeTable = "Mesa 1";
let activeCategory = "Cervezas";
let allOrders = {};
let dailySales = [];
let kdsFilter = "all";
let soundEnabled = true;

// Multi-tab local broadcast channel
const broadcastChannel = new BroadcastChannel("neon_taproom_pos_channel");

// Firebase references
let db = null;
let auth = null;
let currentUser = null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'neon-taproom-pos';

// Synthesized Audio Notifications (Web Audio API)
function playNotificationSound(type = 'new_order') {
    if (!soundEnabled) return;
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const audioCtx = new AudioContext();
        const now = audioCtx.currentTime;
        
        if (type === 'new_order') {
            const osc1 = audioCtx.createOscillator();
            const osc2 = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc1.type = 'sine';
            osc2.type = 'triangle';

            osc1.frequency.setValueAtTime(587.33, now);
            osc1.frequency.setValueAtTime(880, now + 0.12);
            
            osc2.frequency.setValueAtTime(293.66, now);
            osc2.frequency.setValueAtTime(440, now + 0.12);

            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(audioCtx.destination);

            osc1.start(now);
            osc2.start(now);
            osc1.stop(now + 0.5);
            osc2.stop(now + 0.5);
        } else if (type === 'status_ready') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, now);
            osc.frequency.setValueAtTime(659.25, now + 0.1);
            osc.frequency.setValueAtTime(783.99, now + 0.2);
            
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.45);
        }
    } catch (err) {
        console.log("Audio play blocked or unsupported:", err);
    }
}

// Toast Notifications
function showToast(message, color = 'amber') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const colors = {
        amber: 'border-amber-500/50 bg-gray-900 text-amber-300',
        emerald: 'border-emerald-500/50 bg-gray-900 text-emerald-300',
        rose: 'border-rose-500/50 bg-gray-900 text-rose-300'
    };

    const toast = document.createElement('div');
    toast.className = `p-3 rounded-xl border shadow-xl text-xs font-semibold flex items-center gap-2 transition-all transform translate-y-0 opacity-100 ${colors[color] || colors.amber}`;
    toast.innerHTML = `<i class="fa-solid fa-bell"></i><span>${message}</span>`;
    
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Firebase Initialization & Sync Setup
async function initFirebase() {
    try {
        if (typeof __firebase_config !== 'undefined') {
            const firebaseConfig = JSON.parse(__firebase_config);
            const app = initializeApp(firebaseConfig);
            db = getFirestore(app);
            auth = getAuth(app);

            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                await signInWithCustomToken(auth, __initial_auth_token);
            } else {
                await signInAnonymously(auth);
            }

            onAuthStateChanged(auth, (user) => {
                currentUser = user;
                if (user) {
                    listenToCloudOrders();
                    fetchDailySales();
                }
            });
        } else {
            document.getElementById('sync-status').innerText = 'Modo Local (Broadcast)';
        }
    } catch (e) {
        console.warn("Firebase fallback to local BroadcastChannel:", e);
        document.getElementById('sync-status').innerText = 'Modo Local (Broadcast)';
    }
}

function listenToCloudOrders() {
    if (!db || !currentUser) return;
    const ordersRef = collection(db, 'artifacts', appId, 'public', 'data', 'orders');
    
    onSnapshot(ordersRef, (snapshot) => {
        let updated = false;
        snapshot.docChanges().forEach((change) => {
            const orderData = change.doc.data();
            const table = change.doc.id;

            if (change.type === "added" || change.type === "modified") {
                const existing = allOrders[table];
                if (!existing || existing.lastUpdated !== orderData.lastUpdated) {
                    if (orderData.status === 'pendiente' && (!existing || existing.status !== 'pendiente')) {
                        showToast(`¡Nuevo pedido enviado en ${table}!`, 'amber');
                        playNotificationSound('new_order');
                    } else if (orderData.status === 'listo' && existing && existing.status !== 'listo') {
                        showToast(`¡Pedido LISTO en ${table}!`, 'emerald');
                        playNotificationSound('status_ready');
                    }
                }
                allOrders[table] = orderData;
                updated = true;
            } else if (change.type === "removed") {
                delete allOrders[table];
                updated = true;
            }
        });

        if (updated) {
            renderCart();
            renderTables();
            renderKDS();
        }
    }, (error) => {
        console.error("Firestore Snapshot error:", error);
    });
}

// Persistence Helper (Firebase + BroadcastChannel)
async function syncOrder(table, orderData) {
    allOrders[table] = orderData;
    broadcastChannel.postMessage({ action: 'ORDER_UPDATED', payload: { table, order: orderData } });

    if (db && currentUser) {
        try {
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', table);
            await setDoc(docRef, orderData);
        } catch (e) {
            console.error("Error guardando orden en Firebase:", e);
        }
    }
}

async function removeOrder(table) {
    delete allOrders[table];
    broadcastChannel.postMessage({ action: 'ORDER_DELETED', payload: { table } });

    if (db && currentUser) {
        try {
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'orders', table);
            await deleteDoc(docRef);
        } catch (e) {
            console.error("Error eliminando orden en Firebase:", e);
        }
    }
}

broadcastChannel.onmessage = (event) => {
    const { action, payload } = event.data;
    if (action === 'ORDER_UPDATED') {
        allOrders[payload.table] = payload.order;
        if (payload.order.status === 'pendiente') {
            showToast(`¡Nuevo pedido en ${payload.table}!`, 'amber');
            playNotificationSound('new_order');
        } else if (payload.order.status === 'listo') {
            showToast(`¡Pedido LISTO en ${payload.table}!`, 'emerald');
            playNotificationSound('status_ready');
        }
        renderCart();
        renderTables();
        renderKDS();
    } else if (action === 'ORDER_DELETED') {
        delete allOrders[payload.table];
        renderCart();
        renderTables();
        renderKDS();
    } else if (action === 'SALE_ADDED') {
        dailySales.unshift(payload.sale);
        renderSales();
    }
};

// Calculations Helper
function calculateOrderTotals(items = []) {
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tipSelect = document.getElementById('tip-percentage');
    const tipRate = tipSelect ? parseFloat(tipSelect.value) || 0 : 0;
    const tip = subtotal * tipRate;
    const total = subtotal + tip;

    return { subtotal, tip, total };
}

// Navigation & UI Controls
function switchTab(tab) {
    const views = ['pos', 'kds', 'sales'];
    views.forEach(v => {
        const viewEl = document.getElementById(`view-${v}`);
        const btnEl = document.getElementById(`btn-tab-${v}`);
        if (v === tab) {
            viewEl.classList.remove('hidden');
            viewEl.classList.add('flex');
            btnEl.className = "px-4 py-2 rounded-lg flex items-center gap-2 bg-amber-500 text-gray-950 font-semibold shadow transition-all relative";
        } else {
            viewEl.classList.add('hidden');
            viewEl.classList.remove('flex');
            btnEl.className = "px-4 py-2 rounded-lg flex items-center gap-2 text-gray-400 hover:text-white transition-all relative";
        }
    });

    if (tab === 'sales') renderSales();
    if (tab === 'kds') renderKDS();
}

function toggleAudio() {
    soundEnabled = !soundEnabled;
    const icon = document.getElementById('sound-icon');
    const btn = document.getElementById('btn-sound-toggle');
    if (soundEnabled) {
        icon.className = "fa-solid fa-volume-high";
        btn.classList.replace('text-gray-500', 'text-amber-400');
        playNotificationSound('status_ready');
        showToast("Audio de notificaciones activado", "emerald");
    } else {
        icon.className = "fa-solid fa-volume-xmark";
        btn.classList.replace('text-amber-400', 'text-gray-500');
        showToast("Audio silenciado", "rose");
    }
}

// POS Rendering Functions
function renderTables() {
    const grid = document.getElementById('tables-grid');
    if (!grid) return;
    grid.innerHTML = '';

    TABLES.forEach(table => {
        const order = allOrders[table];
        const hasItems = order && order.items && order.items.length > 0;
        const isSelected = activeTable === table;

        let statusDot = '';
        if (hasItems) {
            const dotColor = order.status === 'listo' ? 'bg-emerald-400' : (order.status === 'preparacion' ? 'bg-blue-400' : 'bg-amber-400');
            statusDot = `<span class="w-2 h-2 rounded-full ${dotColor} inline-block"></span>`;
        }

        const btn = document.createElement('button');
        btn.onclick = () => selectTable(table);
        btn.className = `p-2.5 rounded-xl border text-xs font-semibold transition flex flex-col items-center justify-center gap-1 ${
            isSelected 
                ? 'bg-amber-500/20 border-amber-500 text-amber-300 glow-amber' 
                : hasItems 
                    ? 'bg-gray-800/90 border-gray-600 text-gray-100 hover:border-amber-500/50' 
                    : 'bg-gray-900/60 border-gray-800 text-gray-400 hover:bg-gray-800'
        }`;
        btn.innerHTML = `
            <div class="flex items-center gap-1.5">${statusDot}<span>${table}</span></div>
            <span class="text-[10px] font-mono ${hasItems ? 'text-amber-400' : 'text-gray-600'}">
                ${hasItems ? `$${calculateOrderTotals(order.items).subtotal.toFixed(0)}` : 'Libre'}
            </span>
        `;
        grid.appendChild(btn);
    });
}

function selectTable(table) {
    activeTable = table;
    document.getElementById('selected-table-badge').innerText = table;
    const order = allOrders[table];
    const statusLabel = order && order.status && order.status !== 'borrador' ? `Estado: ${order.status.toUpperCase()}` : 'Nuevo Pedido';
    document.getElementById('current-order-table-name').innerText = `${table} - ${statusLabel}`;
    renderTables();
    renderCart();
}

function renderCategories() {
    const bar = document.getElementById('categories-bar');
    if (!bar) return;
    bar.innerHTML = '';

    CATEGORIES.forEach(cat => {
        const isSelected = activeCategory === cat;
        const btn = document.createElement('button');
        btn.onclick = () => {
            activeCategory = cat;
            renderCategories();
            renderProducts();
        };
        btn.className = `px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap border transition ${
            isSelected 
                ? 'bg-amber-500 text-gray-950 border-amber-400 shadow' 
                : 'bg-bar-card text-gray-300 border-bar-border hover:bg-gray-800'
        }`;
        btn.innerText = cat;
        bar.appendChild(btn);
    });
}

function renderProducts() {
    const grid = document.getElementById('products-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const filtered = PRODUCTS.filter(p => p.category === activeCategory);
    filtered.forEach(prod => {
        const card = document.createElement('button');
        card.onclick = () => addToCart(prod);
        card.className = "bg-bar-card hover:bg-gray-800/90 active:scale-95 border border-bar-border hover:border-amber-500/40 rounded-2xl p-3.5 text-left transition flex flex-col justify-between gap-3 group";
        card.innerHTML = `
            <div class="w-10 h-10 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center text-lg ${prod.color} group-hover:scale-110 transition">
                <i class="fa-solid ${prod.icon}"></i>
            </div>
            <div>
                <p class="font-semibold text-xs text-gray-200 line-clamp-2">${prod.name}</p>
                <p class="font-mono font-bold text-sm text-amber-400 mt-1">$${prod.price.toFixed(2)}</p>
            </div>
        `;
        grid.appendChild(card);
    });
}

function addToCart(product) {
    const currentOrder = allOrders[activeTable] || {
        table: activeTable,
        items: [],
        status: 'borrador',
        createdAt: new Date().toISOString()
    };

    const existingItem = currentOrder.items.find(i => i.id === product.id);
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        currentOrder.items.push({ ...product, quantity: 1 });
    }

    currentOrder.lastUpdated = Date.now();
    allOrders[activeTable] = currentOrder;
    renderCart();
    renderTables();
}

function updateQuantity(productId, delta) {
    const order = allOrders[activeTable];
    if (!order) return;

    const itemIndex = order.items.findIndex(i => i.id === productId);
    if (itemIndex === -1) return;

    order.items[itemIndex].quantity += delta;
    if (order.items[itemIndex].quantity <= 0) {
        order.items.splice(itemIndex, 1);
    }

    if (order.items.length === 0) {
        removeOrder(activeTable);
    } else {
        order.lastUpdated = Date.now();
        allOrders[activeTable] = order;
    }

    renderCart();
    renderTables();
    renderKDS();
}

function clearCurrentOrder() {
    if (!allOrders[activeTable]) return;
    removeOrder(activeTable);
    renderCart();
    renderTables();
    renderKDS();
    showToast(`Comanda de ${activeTable} limpiada`, 'rose');
}

function renderCart() {
    const container = document.getElementById('cart-items-list');
    const emptyState = document.getElementById('cart-empty-state');
    const btnSend = document.getElementById('btn-send-order');
    const btnPay = document.getElementById('btn-pay-order');

    if (!container) return;

    const order = allOrders[activeTable];

    if (!order || !order.items || order.items.length === 0) {
        container.innerHTML = '';
        if (emptyState) {
            container.appendChild(emptyState);
            emptyState.classList.remove('hidden');
        }

        document.getElementById('summary-subtotal').innerText = '$0.00';
        document.getElementById('summary-tip').innerText = '$0.00';
        document.getElementById('summary-total').innerText = '$0.00';

        if (btnSend) btnSend.disabled = true;
        if (btnPay) btnPay.disabled = true;
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    container.innerHTML = '';

    order.items.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = "flex items-center justify-between bg-gray-900/60 p-2.5 rounded-xl border border-gray-800";
        
        itemEl.innerHTML = `
            <div class="flex-1 pr-2">
                <p class="font-medium text-xs text-gray-200">${item.name}</p>
                <p class="text-[11px] font-mono text-amber-400">$${item.price.toFixed(2)} c/u</p>
            </div>
            <div class="flex items-center gap-2">
                <div class="flex items-center bg-gray-800 rounded-lg border border-gray-700">
                    <button onclick="updateQuantity('${item.id}', -1)" class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white transition">-</button>
                    <span class="w-6 text-center text-xs font-bold font-mono text-gray-200">${item.quantity}</span>
                    <button onclick="updateQuantity('${item.id}', 1)" class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white transition">+</button>
                </div>
                <span class="font-mono font-bold text-xs text-gray-100 min-w-[50px] text-right">$${(item.price * item.quantity).toFixed(2)}</span>
            </div>
        `;
        container.appendChild(itemEl);
    });

    const totals = calculateOrderTotals(order.items);
    document.getElementById('summary-subtotal').innerText = `$${totals.subtotal.toFixed(2)}`;
    document.getElementById('summary-tip').innerText = `$${totals.tip.toFixed(2)}`;
    document.getElementById('summary-total').innerText = `$${totals.total.toFixed(2)}`;

    if (btnSend) btnSend.disabled = false;
    if (btnPay) btnPay.disabled = false;
}

async function sendOrderToKitchen() {
    const order = allOrders[activeTable];
    if (!order || order.items.length === 0) return;

    order.status = 'pendiente';
    order.sentAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    order.lastUpdated = Date.now();

    await syncOrder(activeTable, order);
    selectTable(activeTable);
    renderKDS();
    playNotificationSound('new_order');
    showToast(`Comanda de ${activeTable} enviada a Barra/Cocina`, 'amber');
}

async function payAndCloseOrder() {
    const order = allOrders[activeTable];
    if (!order || order.items.length === 0) return;

    const totals = calculateOrderTotals(order.items);
    const saleRecord = {
        table: activeTable,
        closedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        items: [...order.items],
        subtotal: totals.subtotal,
        tip: totals.tip,
        total: totals.total,
        timestamp: Date.now()
    };

    dailySales.unshift(saleRecord);
    broadcastChannel.postMessage({ action: 'SALE_ADDED', payload: { sale: saleRecord } });

    if (db && currentUser) {
        try {
            const salesRef = collection(db, 'artifacts', appId, 'public', 'data', 'sales');
            await addDoc(salesRef, saleRecord);
        } catch (e) {
            console.error("Error guardando venta:", e);
        }
    }

    await removeOrder(activeTable);
    document.getElementById('tip-percentage').value = "0";
    selectTable(activeTable);
    renderKDS();
    renderSales();
    showToast(`Cuenta de ${activeTable} cobrada ($${totals.total.toFixed(2)})`, 'emerald');
}

// KDS (Kitchen Display System) Functions
function filterKDS(status, event) {
    kdsFilter = status;
    document.querySelectorAll('.kds-filter-btn').forEach(btn => {
        btn.className = "kds-filter-btn px-3 py-1 rounded-lg font-semibold bg-gray-800 text-gray-300 hover:bg-gray-700";
    });
    if (event && event.target) {
        event.target.className = "kds-filter-btn px-3 py-1 rounded-lg font-semibold bg-amber-500 text-gray-950";
    }
    renderKDS();
}

async function updateOrderStatus(table, newStatus) {
    const order = allOrders[table];
    if (!order) return;

    order.status = newStatus;
    order.lastUpdated = Date.now();
    await syncOrder(table, order);

    if (newStatus === 'listo') {
        playNotificationSound('status_ready');
        showToast(`¡Pedido de ${table} marcado como LISTO!`, 'emerald');
    }
    renderKDS();
    renderTables();
}

function renderKDS() {
    const container = document.getElementById('kds-orders-container');
    const emptyState = document.getElementById('kds-empty-state');
    const badge = document.getElementById('kds-badge');
    if (!container) return;

    const activeOrders = Object.values(allOrders).filter(o => o.status && o.status !== 'borrador' && o.items && o.items.length > 0);
    
    // Update Header Badge
    const pendingCount = activeOrders.filter(o => o.status === 'pendiente' || o.status === 'preparacion').length;
    if (badge) {
        if (pendingCount > 0) {
            badge.innerText = pendingCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    const filteredOrders = kdsFilter === 'all' 
        ? activeOrders 
        : activeOrders.filter(o => o.status === kdsFilter);

    if (filteredOrders.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    container.innerHTML = '';

    const statusStyles = {
        pendiente: { border: 'border-amber-500/50', badge: 'bg-amber-500/20 text-amber-300', label: 'Pendiente' },
        preparacion: { border: 'border-blue-500/50', badge: 'bg-blue-500/20 text-blue-300', label: 'En Preparación' },
        listo: { border: 'border-emerald-500/50', badge: 'bg-emerald-500/20 text-emerald-300', label: 'Listo para Servir' }
    };

    filteredOrders.forEach(order => {
        const st = statusStyles[order.status] || statusStyles.pendiente;
        const card = document.createElement('div');
        card.className = `bg-bar-card border ${st.border} rounded-2xl p-4 flex flex-col justify-between gap-4 shadow-lg`;

        const itemsHtml = order.items.map(item => `
            <li class="flex justify-between items-center text-xs py-1.5 border-b border-gray-800/80 last:border-0">
                <span class="text-gray-200 font-medium">${item.name}</span>
                <span class="font-mono font-bold bg-gray-800 px-2 py-0.5 rounded text-amber-400">x${item.quantity}</span>
            </li>
        `).join('');

        let actionButton = '';
        if (order.status === 'pendiente') {
            actionButton = `<button onclick="updateOrderStatus('${order.table}', 'preparacion')" class="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition">Iniciar Preparación</button>`;
        } else if (order.status === 'preparacion') {
            actionButton = `<button onclick="updateOrderStatus('${order.table}', 'listo')" class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition">Marcar como Listo</button>`;
        } else {
            actionButton = `<div class="text-center text-xs text-emerald-400 font-semibold py-2 bg-emerald-950/30 rounded-xl border border-emerald-500/20"><i class="fa-solid fa-check-double mr-1"></i> Entregado / Listo</div>`;
        }

        card.innerHTML = `
            <div>
                <div class="flex justify-between items-center mb-3">
                    <span class="font-bold text-base text-white">${order.table}</span>
                    <span class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${st.badge}">${st.label}</span>
                </div>
                <p class="text-[11px] text-gray-400 mb-3"><i class="fa-regular fa-clock mr-1"></i> Recibido: ${order.sentAt || 'Ahora'}</p>
                <ul class="space-y-1">${itemsHtml}</ul>
            </div>
            <div class="pt-2">${actionButton}</div>
        `;
        container.appendChild(card);
    });
}

// Sales View Functions
async function fetchDailySales() {
    if (db && currentUser) {
        try {
            const salesRef = collection(db, 'artifacts', appId, 'public', 'data', 'sales');
            const snapshot = await getDocs(salesRef);
            dailySales = snapshot.docs.map(d => d.data()).sort((a, b) => b.timestamp - a.timestamp);
        } catch (e) {
            console.error("Error obteniendo ventas:", e);
        }
    }
    renderSales();
}

function renderSales() {
    const tbody = document.getElementById('sales-history-tbody');
    if (!tbody) return;

    const totalAmount = dailySales.reduce((acc, s) => acc + s.total, 0);
    const totalTips = dailySales.reduce((acc, s) => acc + s.tip, 0);

    document.getElementById('sales-total-amount').innerText = `$${totalAmount.toFixed(2)}`;
    document.getElementById('sales-total-count').innerText = dailySales.length;
    document.getElementById('sales-total-tips').innerText = `$${totalTips.toFixed(2)}`;

    if (dailySales.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-gray-500">No hay ventas registradas hoy.</td></tr>`;
        return;
    }

    tbody.innerHTML = dailySales.map(sale => {
        const productsSummary = sale.items.map(i => `${i.quantity}x ${i.name}`).join(', ');
        return `
            <tr class="hover:bg-gray-900/40 transition">
                <td class="p-3.5 font-semibold text-white">${sale.table}</td>
                <td class="p-3.5 font-mono text-gray-400">${sale.closedAt}</td>
                <td class="p-3.5 text-gray-300 max-w-xs truncate" title="${productsSummary}">${productsSummary}</td>
                <td class="p-3.5 text-right font-mono">$${sale.subtotal.toFixed(2)}</td>
                <td class="p-3.5 text-right font-mono text-purple-400">$${sale.tip.toFixed(2)}</td>
                <td class="p-3.5 text-right font-mono font-bold text-emerald-400">$${sale.total.toFixed(2)}</td>
            </tr>
        `;
    }).join('');
}

// Expose functions to global scope for inline HTML event handlers
window.switchTab = switchTab;
window.toggleAudio = toggleAudio;
window.updateQuantity = updateQuantity;
window.clearCurrentOrder = clearCurrentOrder;
window.renderCart = renderCart;
window.sendOrderToKitchen = sendOrderToKitchen;
window.payAndCloseOrder = payAndCloseOrder;
window.filterKDS = filterKDS;
window.updateOrderStatus = updateOrderStatus;
window.fetchDailySales = fetchDailySales;

// App Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    renderTables();
    renderCategories();
    renderProducts();
    renderCart();
    renderKDS();
    initFirebase();
});