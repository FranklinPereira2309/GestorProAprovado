const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// === CONFIGURAÇÃO DO BANCO DE DADOS LOCAL ===
const userDataPath = ipcRenderer.sendSync('get-user-data-path');
const DB_FILE = path.join(userDataPath, 'database.json');

const db = {
    init: () => {
        try {
            if (!fs.existsSync(userDataPath)) {
                fs.mkdirSync(userDataPath, { recursive: true });
            }
            if (!fs.existsSync(DB_FILE)) {
                const initialData = { products: [], sales: [], users: [], quotes: [], receivables: [], customers: [], settings: { expirationDate: null } };
                fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
            } else {
                const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
                let updated = false;
                if (!data.quotes) { data.quotes = []; updated = true; }
                if (!data.receivables) { data.receivables = []; updated = true; }
                if (!data.customers) { data.customers = []; updated = true; }
                if (!data.settings) { data.settings = { expirationDate: null }; updated = true; }
                
                data.products.forEach(p => {
                    if(!p.code) {
                        p.code = Math.random().toString(36).substring(2, 10).toUpperCase();
                        updated = true;
                    }
                });
                if(updated) fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
            }
        } catch (error) {
            console.error('Erro ao inicializar banco:', error);
        }
    },
    read: () => {
        try {
            const content = fs.readFileSync(DB_FILE, 'utf8');
            return JSON.parse(content);
        } catch (e) {
            return { products: [], sales: [], users: [], quotes: [], receivables: [], customers: [], settings: { expirationDate: null } };
        }
    },
    save: (data) => {
        try {
            fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
            return true;
        } catch (e) {
            return false;
        }
    },
    getTable: (table) => {
        const data = db.read();
        return data[table] || [];
    },
    updateTable: (table, newData) => {
        const fullDb = db.read();
        fullDb[table] = newData;
        return db.save(fullDb);
    },
    getSettings: () => {
        const data = db.read();
        return data.settings || { expirationDate: null };
    },
    updateSettings: (newSettings) => {
        const fullDb = db.read();
        fullDb.settings = { ...fullDb.settings, ...newSettings };
        return db.save(fullDb);
    }
};

db.init();

// === ESTADO DO APLICATIVO ===
const state = {
    currentUser: JSON.parse(localStorage.getItem('active_user') || 'null'),
    activeTab: 'dashboard',
    products: [],
    sales: [],
    quotes: [],
    receivables: [],
    customers: [],
    isRegistering: false,
    currentCart: [],
    currentQuoteItems: [],
    isAdminSession: false
};

// === ÍCONES SVG ===
const ICONS = {
    edit: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>`,
    delete: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>`,
    print: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>`,
    receive: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
};

// === INICIALIZAÇÃO UI ===
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    initNavigation();
    initForms();
    initSettingsLogic();
    initReceivablesLogic();
    initCustomersLogic();
    initGlobalExit();
    
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if(splash) {
            splash.classList.add('splash-fade-out');
            setTimeout(() => {
                splash.style.display = 'none';
            }, 800);
        }
    }, 2800);

    render();
});

function checkSoftwareExpiration() {
    const settings = db.getSettings();
    if (!settings.expirationDate) return false;

    const expiration = new Date(settings.expirationDate);
    const today = new Date();

    if (today > expiration) {
        document.getElementById('main-app').classList.add('hidden');
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('expired-screen').classList.remove('hidden');
        return true;
    }
    return false;
}

function render() {
    if (checkSoftwareExpiration()) return;

    const content = document.getElementById('content-area');
    const mainApp = document.getElementById('main-app');
    const loginScreen = document.getElementById('login-screen');

    if (!state.currentUser) {
        loginScreen.classList.remove('hidden');
        mainApp.classList.add('hidden');
        return;
    }

    loginScreen.classList.add('hidden');
    mainApp.classList.remove('hidden');
    
    document.getElementById('user-name').innerText = state.currentUser.name;
    document.getElementById('user-avatar').innerText = state.currentUser.name[0].toUpperCase();

    state.products = db.getTable('products');
    state.sales = db.getTable('sales');
    state.quotes = db.getTable('quotes');
    state.receivables = db.getTable('receivables');
    state.customers = db.getTable('customers');

    switch (state.activeTab) {
        case 'dashboard': renderDashboard(content); break;
        case 'inventory': renderInventory(content); break;
        case 'sales': renderSales(content); break;
        case 'receivables': renderReceivables(content); break;
        case 'customers': renderCustomers(content); break;
        case 'quotes': renderQuotes(content); break;
    }
}

function initCustomersLogic() {
    const customerForm = document.getElementById('customer-form');
    if (customerForm) {
        customerForm.onsubmit = (e) => {
            e.preventDefault();
            const id = document.getElementById('customer-id').value;
            let customers = db.getTable('customers');
            
            const customerData = {
                id: id || Date.now().toString(),
                name: document.getElementById('c-name').value,
                address: document.getElementById('c-address').value,
                phone: document.getElementById('c-phone').value,
                email: document.getElementById('c-email').value,
                createdAt: id ? customers.find(c => c.id === id).createdAt : new Date().toISOString()
            };

            if (id) {
                customers = customers.map(c => c.id === id ? customerData : c);
            } else {
                customers.push(customerData);
            }

            db.updateTable('customers', customers);
            document.getElementById('customer-modal').classList.add('hidden');
            render();
        };
    }
}

function initReceivablesLogic() {
    const btnConfirm = document.getElementById('btn-confirm-receive');
    if (btnConfirm) {
        btnConfirm.onclick = () => {
            const id = document.getElementById('receive-id').value;
            const finalMethod = document.getElementById('receive-pay-method').value;
            const receivables = db.getTable('receivables');
            const sales = db.getTable('sales');

            const rec = receivables.find(r => r.id == id);
            if (!rec) return;

            const completedSale = {
                ...rec,
                paymentMethod: finalMethod,
                receivedAt: new Date().toISOString()
            };

            sales.push(completedSale);
            const updatedRec = receivables.filter(r => r.id != id);

            db.updateTable('sales', sales);
            db.updateTable('receivables', updatedRec);

            alert('Recebimento finalizado com sucesso!');
            document.getElementById('receive-payment-modal').classList.add('hidden');
            render();
        };
    }
}

function initSettingsLogic() {
    const selectExp = document.getElementById('set-expiration');
    const customContainer = document.getElementById('custom-date-container');
    if (selectExp && customContainer) {
        selectExp.onchange = () => {
            selectExp.value === 'custom' ? customContainer.classList.remove('hidden') : customContainer.classList.add('hidden');
        };
    }

    const btnConfig = document.getElementById('btn-config-access');
    if (btnConfig) {
        btnConfig.onclick = () => {
            if (state.isAdminSession) {
                openSettingsModal();
            } else {
                document.getElementById('adm-user').value = '';
                document.getElementById('adm-pass').value = '';
                document.getElementById('admin-login-modal').classList.remove('hidden');
            }
        };
    }

    const adminForm = document.getElementById('admin-access-form');
    if (adminForm) {
        adminForm.onsubmit = (e) => {
            e.preventDefault();
            const u = document.getElementById('adm-user').value;
            const p = document.getElementById('adm-pass').value;
            if (u === 'Administrator' && p === '@F81152655') {
                state.isAdminSession = true;
                document.getElementById('admin-login-modal').classList.add('hidden');
                openSettingsModal();
            } else {
                alert('Credenciais Administrativas Inválidas.');
            }
        };
    }

    const btnSaveSettings = document.getElementById('btn-save-settings');
    if (btnSaveSettings) {
        btnSaveSettings.onclick = () => {
            const period = document.getElementById('set-expiration').value;
            let expirationDate = null;
            const now = new Date();
            if (period === '7d') now.setDate(now.getDate() + 7);
            else if (period === '1m') now.setMonth(now.getMonth() + 1);
            else if (period === '6m') now.setMonth(now.getMonth() + 6);
            else if (period === '1y') now.setFullYear(now.getFullYear() + 1);
            else if (period === 'custom') {
                const customDateValue = document.getElementById('custom-exp-date-picker').value;
                if (!customDateValue) return alert('Selecione uma data.');
                now.setTime(new Date(customDateValue + 'T23:59:59').getTime());
            }
            expirationDate = period === 'none' ? null : now.toISOString();
            db.updateSettings({ expirationDate });
            alert('Licença atualizada.');
            document.getElementById('settings-modal').classList.add('hidden');
            render();
        };
    }
}

function openSettingsModal() {
    const settings = db.getSettings();
    const modal = document.getElementById('settings-modal');
    const display = document.getElementById('current-exp-date');
    if (settings.expirationDate) {
        const d = new Date(settings.expirationDate);
        display.innerText = `Expira em: ${d.toLocaleDateString()} às ${d.toLocaleTimeString()}`;
        display.className = "text-xs font-black text-amber-600";
    } else {
        display.innerText = 'Licença Vitalícia (Ilimitada)';
        display.className = "text-xs font-black text-green-600";
    }
    modal.classList.remove('hidden');
}

function initGlobalExit() {
    const quitAppAction = (e) => {
        e.preventDefault();
        if (confirm('Deseja realmente encerrar a aplicação GestorPro?')) ipcRenderer.send('quit-app');
    };
    document.getElementById('exit-login-btn').onclick = quitAppAction;
    document.getElementById('exit-app-btn').onclick = quitAppAction;
}

function initNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.activeTab = btn.dataset.tab;
            render();
        };
    });
}

function renderDashboard(container) {
    const revenue = state.sales.reduce((acc, s) => acc + s.totalPrice, 0);
    const stockVal = state.products.reduce((acc, p) => acc + (p.buyPrice * p.quantity), 0);
    const pendingReceivables = state.receivables.reduce((acc, r) => acc + r.totalPrice, 0);
    const lowStockItems = state.products.filter(p => p.quantity <= 5);

    container.innerHTML = `
        <div class="space-y-4 animate-fade-in">
            <header>
                <h2 class="text-3xl font-black text-gray-800 tracking-tight">Painel de Controle</h2>
                <p class="text-gray-500 font-medium text-sm">Resumo financeiro e operacional</p>
            </header>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                ${createStatCard('Vendas Liquidadas', `R$ ${revenue.toFixed(2)}`, '💰', 'text-green-600')}
                ${createStatCard('A Receber (Crediário)', `R$ ${pendingReceivables.toFixed(2)}`, '🧾', 'text-amber-600')}
                ${createStatCard('Valor em Estoque', `R$ ${stockVal.toFixed(2)}`, '🏛️', 'text-gray-700')}
                <div onclick="showCriticalItems()" class="glass win-shadow p-5 rounded-[2rem] border border-white transition-all hover:scale-[1.02] cursor-pointer hover:bg-amber-50">
                    <div class="text-2xl mb-1">⚠️</div>
                    <div class="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight">Itens Críticos</div>
                    <div class="text-2xl font-black text-amber-500">${lowStockItems.length}</div>
                </div>
            </div>
            <div class="grid grid-cols-1 gap-6">
                <div class="glass win-shadow p-6 rounded-[2rem] border border-white w-full overflow-hidden">
                    <h3 class="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Análise de Estoque</h3>
                    <div class="h-60"><canvas id="chartStock"></canvas></div>
                </div>
            </div>
        </div>
    `;
    setTimeout(initCharts, 50);
}

function createStatCard(label, value, icon, colorClass) {
    return `
        <div class="glass win-shadow p-5 rounded-[2rem] border border-white transition-transform hover:scale-[1.02]">
            <div class="text-2xl mb-1">${icon}</div>
            <div class="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight">${label}</div>
            <div class="text-xl font-black ${colorClass}">${value}</div>
        </div>
    `;
}

function renderCustomers(container) {
    container.innerHTML = `
        <div class="space-y-6 animate-fade-in h-full flex flex-col">
            <div class="flex justify-between items-end shrink-0">
                <div>
                    <h2 class="text-3xl font-black text-gray-800 tracking-tight">Gestão de Clientes</h2>
                    <p class="text-gray-500 font-medium text-sm">Base de dados de clientes cadastrados.</p>
                </div>
                <button id="btn-new-customer" class="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all">Novo Cliente</button>
            </div>

            <div class="glass win-shadow rounded-[2rem] border border-white overflow-hidden flex flex-col flex-1 max-h-[calc(115vh-280px)]">
                <div class="overflow-y-auto flex-1 custom-scrollbar">
                    <table class="w-full text-left table-fixed border-collapse">
                        <thead class="bg-white sticky top-0 z-10 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                            <tr>
                                <th class="px-5 py-5 w-[30%]">Nome</th>
                                <th class="px-4 py-5 w-[30%]">Endereço</th>
                                <th class="px-4 py-5 w-[15%]">Contato</th>
                                <th class="px-4 py-5 w-[15%]">E-mail</th>
                                <th class="px-5 py-5 text-right w-[10%]">Ações</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            ${state.customers.length === 0 ? `<tr><td colspan="5" class="py-20 text-center text-gray-300 italic">Nenhum cliente cadastrado</td></tr>` : 
                            [...state.customers].sort((a,b) => a.name.localeCompare(b.name)).map(c => `
                                <tr class="hover:bg-white/40 transition-colors group">
                                    <td class="px-5 py-4 truncate font-bold text-gray-800">${c.name}</td>
                                    <td class="px-4 py-4 truncate text-[11px] text-gray-500">${c.address}</td>
                                    <td class="px-4 py-4 font-black text-gray-400 text-[10px]">${c.phone}</td>
                                    <td class="px-4 py-4 truncate text-[10px] text-gray-400">${c.email}</td>
                                    <td class="px-5 py-4 text-right">
                                        <div class="flex justify-end gap-2">
                                            <button onclick="editCustomer('${c.id}')" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">${ICONS.edit}</button>
                                            <button onclick="deleteCustomer('${c.id}')" class="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors">${ICONS.delete}</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    document.getElementById('btn-new-customer').onclick = () => {
        document.getElementById('customer-form').reset();
        document.getElementById('customer-id').value = '';
        document.getElementById('customer-modal-title').innerText = 'Novo Cliente';
        document.getElementById('customer-modal').classList.remove('hidden');
    };
}

window.editCustomer = (id) => {
    const c = state.customers.find(x => x.id === id);
    if (!c) return;
    document.getElementById('customer-id').value = c.id;
    document.getElementById('c-name').value = c.name;
    document.getElementById('c-address').value = c.address;
    document.getElementById('c-phone').value = c.phone;
    document.getElementById('c-email').value = c.email;
    document.getElementById('customer-modal-title').innerText = 'Editar Cliente';
    document.getElementById('customer-modal').classList.remove('hidden');
};

window.deleteCustomer = (id) => {
    if (confirm('Excluir cadastro do cliente?')) {
        db.updateTable('customers', state.customers.filter(c => c.id !== id));
        render();
    }
};

function renderReceivables(container) {
    container.innerHTML = `
        <div class="space-y-6 animate-fade-in h-full flex flex-col">
            <div class="flex justify-between items-end shrink-0">
                <div>
                    <h2 class="text-3xl font-black text-gray-800 tracking-tight">Recebimentos (Crediário)</h2>
                    <p class="text-gray-500 font-medium text-sm">Gerencie pagamentos pendentes de clientes.</p>
                </div>
            </div>

            <div class="glass win-shadow rounded-[2rem] border border-white overflow-hidden flex flex-col flex-1 max-h-[calc(115vh-280px)]">
                <div class="overflow-y-auto flex-1 custom-scrollbar">
                    <table class="w-full text-left table-fixed border-collapse">
                        <thead class="bg-white sticky top-0 z-10 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                            <tr>
                                <th class="px-5 py-5 w-[15%]">Vencimento</th>
                                <th class="px-4 py-5 w-[25%]">Cliente</th>
                                <th class="px-4 py-5 text-center w-[15%]">Status</th>
                                <th class="px-4 py-5 text-right w-[15%]">Valor</th>
                                <th class="px-5 py-5 text-right w-[30%]">Ações</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            ${state.receivables.length === 0 ? `<tr><td colspan="5" class="py-20 text-center text-gray-300 italic">Nenhum título pendente</td></tr>` : 
                            [...state.receivables].sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate)).map(r => {
                                const today = new Date();
                                today.setHours(0,0,0,0);
                                const dueDate = new Date(r.dueDate + 'T00:00:00');
                                const isExpired = dueDate < today;
                                return `
                                <tr class="hover:bg-white/40 transition-colors group">
                                    <td class="px-5 py-4">
                                        <div class="text-[10px] font-bold ${isExpired ? 'text-red-500' : 'text-gray-500'}">${new Date(r.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
                                    </td>
                                    <td class="px-4 py-4 truncate font-bold text-gray-800">${r.customer || 'Consumidor'}</td>
                                    <td class="px-4 py-4 text-center">
                                        <span class="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${isExpired ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}">
                                            ${isExpired ? 'Atrasado' : 'A Vencer'}
                                        </span>
                                    </td>
                                    <td class="px-4 py-4 font-black text-gray-900 text-xs text-right whitespace-nowrap">R$ ${r.totalPrice.toFixed(2)}</td>
                                    <td class="px-5 py-4 text-right">
                                        <button onclick="openReceiveModal('${r.id}')" class="bg-blue-600 text-white px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all">Realizar Pagamento</button>
                                    </td>
                                </tr>
                            `}).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

window.openReceiveModal = (id) => {
    const rec = state.receivables.find(r => r.id == id);
    if (!rec) return;
    document.getElementById('receive-id').value = id;
    document.getElementById('receive-amount-display').innerText = `R$ ${rec.totalPrice.toFixed(2)}`;
    document.getElementById('receive-payment-modal').classList.remove('hidden');
};

function renderQuotes(container) {
    container.innerHTML = `
        <div class="space-y-6 animate-fade-in h-full flex flex-col">
            <div class="flex justify-between items-end shrink-0">
                <div>
                    <h2 class="text-3xl font-black text-gray-800 tracking-tight">Propostas e Orçamentos</h2>
                    <p class="text-gray-500 font-medium text-sm">Gerencie suas cotações de forma organizada e simétrica.</p>
                </div>
                <button id="btn-new-quote" class="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all">Novo Orçamento</button>
            </div>

            <div class="glass win-shadow rounded-[2rem] border border-white overflow-hidden flex flex-col flex-1 max-h-[calc(115vh-280px)]">
                <div class="overflow-y-auto flex-1 custom-scrollbar">
                    <table class="w-full text-left table-fixed border-collapse">
                        <thead class="bg-white sticky top-0 z-10 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                            <tr>
                                <th class="px-5 py-5 w-[15%]">Data/Hora</th>
                                <th class="px-4 py-5 w-[25%]">Cliente</th>
                                <th class="px-4 py-5 text-center w-[20%]">Contato</th>
                                <th class="px-2 py-5 text-center w-[10%]">Itens</th>
                                <th class="px-4 py-5 text-right w-[12%]">Total</th>
                                <th class="px-5 py-5 text-right w-[18%]">Ações</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                            ${[...state.quotes].reverse().map(q => `
                                <tr class="hover:bg-white/40 transition-colors group">
                                    <td class="px-5 py-4">
                                        <div class="text-[10px] text-gray-500 font-bold">${new Date(q.createdAt).toLocaleDateString('pt-BR')}</div>
                                        <div class="text-[9px] text-gray-400 font-black uppercase tracking-tight">${new Date(q.createdAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}</div>
                                    </td>
                                    <td class="px-4 py-4">
                                        <div class="text-[11px] font-bold text-gray-800 truncate" title="${q.customer || 'Consumidor'}">${q.customer || 'Consumidor'}</div>
                                    </td>
                                    <td class="px-4 py-4 text-center">
                                        <div class="text-[9px] font-bold text-gray-500 uppercase truncate">${q.customerPhone || '-'}</div>
                                        <div class="text-[8px] text-gray-400 truncate">${q.customerEmail || ''}</div>
                                    </td>
                                    <td class="px-2 py-4 text-center">
                                        <span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-[10px] font-black text-gray-500">${q.items.length}</span>
                                    </td>
                                    <td class="px-4 py-4 font-black text-gray-900 text-xs text-right whitespace-nowrap">
                                        R$ ${q.totalPrice.toFixed(2)}
                                    </td>
                                    <td class="px-5 py-4 text-right">
                                        <div class="flex justify-end gap-3">
                                            <button onclick="printQuote('${q.id}')" title="Imprimir" class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">${ICONS.print}</button>
                                            <button onclick="editQuote('${q.id}')" title="Editar" class="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">${ICONS.edit}</button>
                                            <button onclick="deleteQuote('${q.id}')" title="Excluir" class="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors">${ICONS.delete}</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    document.getElementById('btn-new-quote').onclick = () => {
        state.currentQuoteItems = [];
        document.getElementById('quote-id').value = '';
        document.getElementById('q-customer').value = '';
        document.getElementById('q-email').value = '';
        document.getElementById('q-phone').value = '';
        document.getElementById('q-validity').value = '7';
        
        // Popular select de clientes no orçamento (APENAS CADASTRADOS)
        const cSelect = document.getElementById('q-customer-select');
        if (state.customers.length === 0) {
            cSelect.innerHTML = '<option value="">NENHUM CLIENTE CADASTRADO!</option>';
        } else {
            cSelect.innerHTML = '<option value="">SELECIONE UM CLIENTE CADASTRADO...</option>' + 
                state.customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        }
        
        cSelect.onchange = (e) => {
            const selected = state.customers.find(c => c.id === e.target.value);
            if (selected) {
                document.getElementById('q-customer').value = selected.name;
                document.getElementById('q-email').value = selected.email;
                document.getElementById('q-phone').value = selected.phone;
            } else {
                document.getElementById('q-customer').value = '';
                document.getElementById('q-email').value = '';
                document.getElementById('q-phone').value = '';
            }
        };

        updateQuoteCartUI();
        const select = document.getElementById('q-product');
        select.innerHTML = '<option value="">Selecione um produto...</option>' + 
            state.products.map(p => `<option value="${p.id}">${p.description} - R$ ${p.sellPrice.toFixed(2)}</option>`).join('');
        document.getElementById('quote-modal').classList.remove('hidden');
    };
}

function initQuoteForms() {
    const btnAdd = document.getElementById('btn-add-to-quote');
    if(btnAdd) {
        btnAdd.onclick = () => {
            const prodId = document.getElementById('q-product').value;
            const qty = parseInt(document.getElementById('q-qty').value);
            if (!prodId || qty < 1) return;
            const prod = state.products.find(p => p.id === prodId);
            state.currentQuoteItems.push({
                id: prodId,
                description: prod.description,
                quantity: qty,
                price: prod.sellPrice,
                total: prod.sellPrice * qty
            });
            updateQuoteCartUI();
        };
    }

    const btnSave = document.getElementById('btn-save-quote');
    if(btnSave) {
        btnSave.onclick = () => {
            const cId = document.getElementById('q-customer-select').value;
            if (!cId) return alert('Por favor, selecione um cliente cadastrado para prosseguir.');
            if (state.currentQuoteItems.length === 0) return alert('Adicione pelo menos um item à proposta.');
            
            let id = document.getElementById('quote-id').value;
            let quotes = db.getTable('quotes');
            if (!id) {
                const sequentialIds = quotes.map(q => Number(q.id)).filter(idNum => !isNaN(idNum) && idNum >= 100);
                id = (sequentialIds.length > 0 ? Math.max(...sequentialIds) + 1 : 100).toString();
            }
            const quote = {
                id,
                customer: document.getElementById('q-customer').value,
                customerEmail: document.getElementById('q-email').value,
                customerPhone: document.getElementById('q-phone').value,
                items: [...state.currentQuoteItems],
                totalPrice: state.currentQuoteItems.reduce((acc, i) => acc + i.total, 0),
                validity: document.getElementById('q-validity').value,
                createdAt: document.getElementById('quote-id').value ? state.quotes.find(q => q.id === id).createdAt : new Date().toISOString()
            };
            document.getElementById('quote-id').value ? quotes = quotes.map(q => q.id === id ? quote : q) : quotes.push(quote);
            db.updateTable('quotes', quotes);
            document.getElementById('quote-modal').classList.add('hidden');
            render();
        };
    }
}

function updateQuoteCartUI() {
    const list = document.getElementById('quote-items-list');
    if (!list) return;
    if (state.currentQuoteItems.length === 0) {
        list.innerHTML = '<div class="text-center py-10 text-gray-300 italic">Lista de itens vazia</div>';
        document.getElementById('quote-total-display').innerText = `R$ 0,00`;
        return;
    }
    list.innerHTML = state.currentQuoteItems.map((item, index) => `
        <div class="flex flex-col border-b border-gray-100 pb-2 mb-2 group">
            <div class="flex justify-between items-start">
                <div class="flex flex-col">
                    <span class="font-bold text-gray-800 uppercase text-[10px]">${item.description}</span>
                    <span class="text-[9px] text-gray-400 font-bold">${item.quantity} UN x R$ ${item.price.toFixed(2)}</span>
                </div>
                <div class="flex flex-col items-end">
                    <span class="font-black text-gray-900">R$ ${item.total.toFixed(2)}</span>
                    <button onclick="removeFromQuote(${index})" class="text-red-400 text-[8px] font-black uppercase mt-1 opacity-0 group-hover:opacity-100 transition-opacity">Remover</button>
                </div>
            </div>
        </div>
    `).join('');
    const total = state.currentQuoteItems.reduce((acc, i) => acc + i.total, 0);
    document.getElementById('quote-total-display').innerText = `R$ ${total.toFixed(2)}`;
}

window.removeFromQuote = (index) => {
    state.currentQuoteItems.splice(index, 1);
    updateQuoteCartUI();
};

window.editQuote = (id) => {
    const q = state.quotes.find(x => x.id === id);
    if (!q) return;
    state.currentQuoteItems = [...q.items];
    document.getElementById('quote-id').value = q.id;
    document.getElementById('q-customer').value = q.customer || '';
    document.getElementById('q-email').value = q.customerEmail || '';
    document.getElementById('q-phone').value = q.customerPhone || '';
    document.getElementById('q-validity').value = q.validity || '7';
    updateQuoteCartUI();
    const select = document.getElementById('q-product');
    select.innerHTML = '<option value="">Selecione um produto...</option>' + state.products.map(p => `<option value="${p.id}">${p.description} - R$ ${p.sellPrice.toFixed(2)}</option>`).join('');
    document.getElementById('quote-modal').classList.remove('hidden');
};

window.deleteQuote = (id) => {
    if (confirm('Excluir este orçamento definitivamente?')) {
        db.updateTable('quotes', state.quotes.filter(q => q.id !== id));
        render();
    }
};

window.printQuote = (id) => {
    const q = state.quotes.find(x => x.id === id);
    if (!q) return;
    const printArea = document.getElementById('print-area');
    const dateStr = new Date(q.createdAt).toLocaleDateString();
    let html = `
        <div style="font-family: 'Inter', sans-serif; padding: 40px; color: #1a1a1a;">
            <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px;">
                <div><h1 style="margin: 0; color: #2563eb; font-weight: 900;">GESTORPRO</h1><p style="margin: 0; font-size: 10px; font-weight: 800; color: #64748b;">ORÇAMENTO LOCAL</p></div>
                <div style="text-align: right;"><p style="margin: 0; font-weight: 900;">Nº ${q.id}</p><p style="margin: 0; font-size: 10px; color: #64748b;">Data: ${dateStr}</p></div>
            </div>
            <div style="margin-bottom: 30px;"><p style="margin: 0; font-size: 10px; font-weight: 900; color: #2563eb; text-transform: uppercase;">Cliente</p><p style="margin: 0; font-size: 16px; font-weight: 800;">${q.customer || 'Consumidor Final'}</p></div>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                <thead style="border-bottom: 1px solid #e2e8f0;"><tr><th style="text-align: left; padding: 10px 0; font-size: 10px;">DESCRIÇÃO</th><th style="text-align: center; padding: 10px 0; font-size: 10px;">QTD</th><th style="text-align: right; padding: 10px 0; font-size: 10px;">TOTAL</th></tr></thead>
                <tbody>${q.items.map(i => `<tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 10px 0; font-size: 11px; font-weight: 700;">${i.description}</td><td style="text-align: center; padding: 10px 0; font-size: 11px;">${i.quantity}</td><td style="text-align: right; padding: 10px 0; font-size: 11px; font-weight: 900;">R$ ${i.total.toFixed(2)}</td></tr>`).join('')}</tbody>
            </table>
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 30px; border-top: 2px solid #1a1a1a; padding-top: 15px;">
                <div style="text-align: left;"><p style="margin: 0; font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Validade da Proposta</p><p style="margin: 4px 0 0 0; font-size: 12px; font-weight: 700; color: #111827;">${q.validity || '7'} dias</p></div>
                <div style="text-align: right; min-width: 200px;"><p style="margin: 0; font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Total Estimado</p><p style="margin: 4px 0 0 0; font-size: 18px; font-weight: 900; color: #111827;">R$ ${q.totalPrice.toFixed(2)}</p></div>
            </div>
        </div>
    `;
    printArea.innerHTML = html; window.print();
};

window.printInventory = () => {
    const printArea = document.getElementById('print-area');
    const prods = state.products;
    const dateStr = new Date().toLocaleDateString('pt-BR');
    let html = `
        <div style="font-family: 'Inter', sans-serif; padding: 40px; color: #1a1a1a;">
            <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #10b981; padding-bottom: 15px; margin-bottom: 25px;">
                <div><h1 style="margin: 0; color: #10b981; font-weight: 900;">GESTORPRO</h1><p style="margin: 0; font-size: 10px; font-weight: 800; color: #64748b;">RELATÓRIO DE ESTOQUE ATUAL</p></div>
                <div style="text-align: right;"><p style="margin: 0; font-weight: 900;">DATA: ${dateStr}</p></div>
            </div>
            <table style="width: 100%; border-collapse: collapse;">
                <thead style="border-bottom: 2px solid #1a1a1a;"><tr><th style="text-align: left; padding: 8px; font-size: 9px;">CÓDIGO (SKU)</th><th style="text-align: left; padding: 8px; font-size: 9px;">DESCRIÇÃO</th><th style="text-align: left; padding: 8px; font-size: 9px;">CATEGORIA</th><th style="text-align: center; padding: 8px; font-size: 9px;">QTD</th><th style="text-align: right; padding: 8px; font-size: 9px;">PREÇO</th></tr></thead>
                <tbody>${prods.map(p => `<tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 8px; font-size: 10px; font-weight: 700; color: #64748b;">${p.code}</td><td style="padding: 8px; font-size: 10px; font-weight: 800;">${p.description}</td><td style="padding: 8px; font-size: 9px; color: #94a3b8;">${p.category}</td><td style="text-align: center; padding: 8px; font-size: 10px; font-weight: 900;">${p.quantity}</td><td style="text-align: right; padding: 8px; font-size: 10px; font-weight: 900;">R$ ${p.sellPrice.toFixed(2)}</td></tr>`).join('')}</tbody>
            </table>
        </div>
    `;
    printArea.innerHTML = html; window.print();
};

window.printLabels = () => {
    const printArea = document.getElementById('print-area');
    let html = `<div style="display: flex; flex-wrap: wrap; gap: 0; justify-content: flex-start;">${state.products.map(p => `<div style="width: 3cm; height: 3cm; border: 0.1px solid #eee; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2px; box-sizing: border-box; overflow: hidden; page-break-inside: avoid;"><span style="font-size: 6px; font-weight: 900; text-align: center; display: block; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px;">${p.description.toUpperCase()}</span><svg class="barcode-item" data-value="${p.code}"></svg><span style="font-size: 7px; font-weight: 900; margin-top: 2px;">R$ ${p.sellPrice.toFixed(2)}</span></div>`).join('')}</div>`;
    printArea.innerHTML = html;
    setTimeout(() => {
        document.querySelectorAll('.barcode-item').forEach(el => JsBarcode(el, el.dataset.value, { format: "CODE128", width: 1, height: 30, displayValue: true, fontSize: 8, margin: 0 }));
        window.print();
    }, 100);
};

window.printSaleCoupon = (id) => {
    const sale = state.sales.find(s => s.id == id);
    if (!sale) return;
    const printArea = document.getElementById('print-area');
    let html = `
        <div style="width: 80mm; font-family: 'JetBrains Mono', monospace; font-size: 11px; padding: 10px; color: #000; background: #fff;">
            <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 10px; margin-bottom: 10px;"><h1 style="margin: 0; font-size: 18px; font-weight: 900;">GESTORPRO</h1><p style="margin: 2px 0;">SISTEMA DE GESTÃO LOCAL</p><p style="margin: 2px 0;">DATA: ${new Date(sale.createdAt).toLocaleString()}</p><p style="margin: 2px 0; font-weight: bold;">VENDA Nº ${sale.id}</p></div>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;"><thead style="border-bottom: 1px dashed #000;"><tr style="text-align: left;"><th style="padding: 5px 0;">DESC</th><th style="text-align: center;">QTD</th><th style="text-align: right;">TOTAL</th></tr></thead><tbody>${sale.items.map(item => `<tr><td style="padding: 5px 0;">${item.description.substring(0, 15)}</td><td style="text-align: center;">${item.quantity}</td><td style="text-align: right;">${item.total.toFixed(2)}</td></tr>`).join('')}</tbody></table>
            <div style="border-top: 1px dashed #000; padding-top: 10px; text-align: right;"><p style="margin: 5px 0; font-size: 14px; font-weight: 900;">TOTAL: R$ ${sale.totalPrice.toFixed(2)}</p><p style="margin: 2px 0;">PAGTO: ${sale.paymentMethod.toUpperCase()}</p><p style="margin: 2px 0;">CLIENTE: ${sale.customer || 'NÃO IDENTIFICADO'}</p></div>
            <div style="margin-top: 20px; text-align: center; font-size: 9px; border-top: 1px dashed #000; padding-top: 10px;"><p>Obrigado pela preferência!</p></div>
        </div>
    `;
    printArea.innerHTML = html; window.print();
};

window.printSalesReport = (start, end) => {
    const startDate = new Date(start + 'T00:00:00');
    const endDate = new Date(end + 'T23:59:59');
    const filteredSales = state.sales.filter(s => { const d = new Date(s.createdAt); return d >= startDate && d <= endDate; });
    const printArea = document.getElementById('print-area');
    const totalRevenue = filteredSales.reduce((acc, s) => acc + s.totalPrice, 0);
    let html = `
        <div style="font-family: 'Inter', sans-serif; padding: 40px; color: #1a1a1a;">
            <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px;">
                <div><h1 style="margin: 0; color: #2563eb; font-weight: 900;">GESTORPRO</h1><p style="margin: 0; font-size: 10px; font-weight: 800; color: #64748b;">Relatório de Vendas</p></div>
                <div style="text-align: right;"><p style="margin: 0; font-weight: 900;">${start} até ${end}</p></div>
            </div>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;"><thead style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;"><tr><th style="padding: 12px; font-size: 10px; font-weight: 900;">ID</th><th style="padding: 12px; font-size: 10px; font-weight: 900;">Data</th><th style="padding: 12px; font-size: 10px; font-weight: 900;">Valor Total</th></tr></thead><tbody>${filteredSales.map(s => `<tr style="border-bottom: 1px solid #f1f5f9;"><td style="padding: 12px; font-size: 11px;">#${s.id}</td><td style="padding: 12px; font-size: 11px;">${new Date(s.createdAt).toLocaleString()}</td><td style="padding: 12px; text-align: right; font-size: 11px; font-weight: 900;">R$ ${s.totalPrice.toFixed(2)}</td></tr>`).join('')}</tbody></table>
            <div style="text-align: right; border-top: 2px solid #1a1a1a; padding-top: 15px;"><p style="margin: 0; font-size: 10px; font-weight: 800;">Faturamento Total: R$ ${totalRevenue.toFixed(2)}</p></div>
        </div>
    `;
    printArea.innerHTML = html; window.print();
};

function initForms() {
    initQuoteForms();
    
    const selectPay = document.getElementById('s-pay');
    const dueContainer = document.getElementById('crediario-date-container');
    if (selectPay && dueContainer) {
        selectPay.onchange = () => {
            selectPay.value === 'Crediário Próprio' ? dueContainer.classList.remove('hidden') : dueContainer.classList.add('hidden');
        };
    }

    document.getElementById('report-filter-form').onsubmit = (e) => {
        e.preventDefault();
        window.printSalesReport(document.getElementById('report-date-start').value, document.getElementById('report-date-end').value);
        document.getElementById('report-filter-modal').classList.add('hidden');
    };

    const calc = () => {
        const buy = parseFloat(document.getElementById('p-buy').value) || 0;
        const margin = parseFloat(document.getElementById('p-margin').value) || 0;
        const sell = buy * (1 + margin/100);
        const sellDisplay = document.getElementById('p-sell-display');
        if(sellDisplay) sellDisplay.innerText = `R$ ${sell.toFixed(2)}`;
    };
    
    if(document.getElementById('p-buy')) document.getElementById('p-buy').oninput = calc;
    if(document.getElementById('p-margin')) document.getElementById('p-margin').oninput = calc;

    document.querySelectorAll('.close-modal').forEach(b => b.onclick = () => {
        document.querySelectorAll('.fixed.inset-0.z-\\[6000\\], .fixed.inset-0.z-\\[7000\\], .fixed.inset-0.z-\\[7500\\], .fixed.inset-0.z-\\[8000\\]').forEach(m => m.classList.add('hidden'));
    });

    const pForm = document.getElementById('product-form');
    if(pForm) {
        pForm.onsubmit = (e) => {
            e.preventDefault();
            const id = document.getElementById('product-id').value;
            const buy = parseFloat(document.getElementById('p-buy').value);
            const margin = parseFloat(document.getElementById('p-margin').value);
            let prods = db.getTable('products');
            let product;
            if (id) {
                const existing = prods.find(p => p.id === id);
                product = { ...existing, description: document.getElementById('p-desc').value, category: document.getElementById('p-cat').value, quantity: parseInt(document.getElementById('p-qty').value), buyPrice: buy, margin: margin, sellPrice: buy * (1 + margin/100) };
                prods = prods.map(p => p.id === id ? product : p);
            } else {
                product = { id: Date.now().toString(), code: Math.random().toString(36).substring(2, 10).toUpperCase(), description: document.getElementById('p-desc').value, category: document.getElementById('p-cat').value, quantity: parseInt(document.getElementById('p-qty').value), buyPrice: buy, margin: margin, sellPrice: buy * (1 + margin/100) };
                prods.push(product);
            }
            db.updateTable('products', prods);
            document.getElementById('product-modal').classList.add('hidden'); render();
        };
    }

    const btnAddCart = document.getElementById('btn-add-to-cart');
    if(btnAddCart) {
        btnAddCart.onclick = () => {
            const prodId = document.getElementById('s-product').value;
            const qty = parseInt(document.getElementById('s-qty').value);
            if (!prodId || qty < 1) return alert('Selecione um produto');
            const prod = state.products.find(p => p.id === prodId);
            if (prod.quantity < qty) return alert('Estoque insuficiente');
            state.currentCart.push({ id: prodId, description: prod.description, quantity: qty, price: prod.sellPrice, total: prod.sellPrice * qty });
            updateCartUI();
        };
    }

    const saleForm = document.getElementById('sale-form');
    if(saleForm) {
        saleForm.onsubmit = (e) => {
            e.preventDefault();
            if (state.currentCart.length === 0) return;
            const payMethod = document.getElementById('s-pay').value;
            const dueDate = document.getElementById('s-due-date').value;
            const customerId = document.getElementById('s-customer-select').value;
            const customerName = customerId ? state.customers.find(c => c.id === customerId).name : 'Consumidor Final';

            if (payMethod === 'Crediário Próprio' && !dueDate) return alert('Defina a data de vencimento.');

            const sales = db.getTable('sales');
            const prods = db.getTable('products');
            const receivables = db.getTable('receivables');

            const sequentialIds = [...sales, ...receivables].map(s => Number(s.id)).filter(id => id >= 1000);
            const nextId = sequentialIds.length > 0 ? Math.max(...sequentialIds) + 1 : 1000;

            state.currentCart.forEach(item => {
                const p = prods.find(x => x.id === item.id);
                if (p) p.quantity -= item.quantity;
            });

            const trans = { 
                id: nextId, 
                customer: customerName,
                items: [...state.currentCart], 
                totalPrice: state.currentCart.reduce((acc, i) => acc + i.total, 0), 
                paymentMethod: payMethod,
                dueDate: payMethod === 'Crediário Próprio' ? dueDate : null,
                createdAt: new Date().toISOString() 
            };

            if (payMethod === 'Crediário Próprio') {
                receivables.push(trans);
                db.updateTable('receivables', receivables);
            } else {
                sales.push(trans);
                db.updateTable('sales', sales);
            }

            db.updateTable('products', prods);
            document.getElementById('sale-modal').classList.add('hidden');
            render();
        };
    }
}

function initAuth() {
    const authForm = document.getElementById('auth-form');
    const toggleBtn = document.getElementById('toggle-auth');
    if(toggleBtn) {
        toggleBtn.onclick = () => {
            state.isRegistering = !state.isRegistering;
            document.getElementById('name-field').classList.toggle('hidden', !state.isRegistering);
            document.getElementById('login-subtitle').innerText = state.isRegistering ? 'Criar nova conta admin' : 'Bem-vindo de volta';
            authForm.querySelector('button[type="submit"]').innerText = state.isRegistering ? 'Cadastrar e Entrar' : 'Entrar';
        };
    }
    if(authForm) {
        authForm.onsubmit = (e) => {
            e.preventDefault();
            const email = document.getElementById('auth-email').value.trim();
            const pass = document.getElementById('auth-password').value;
            const users = db.getTable('users');
            if (state.isRegistering) {
                const newUser = { id: Date.now(), name: document.getElementById('auth-name').value.trim(), email, pass };
                users.push(newUser); db.updateTable('users', users); state.currentUser = newUser;
            } else {
                const user = users.find(u => u.email === email && u.pass === pass);
                if (!user) return alert('Credenciais inválidas');
                state.currentUser = user;
            }
            localStorage.setItem('active_user', JSON.stringify(state.currentUser)); render();
        };
    }
    if(document.getElementById('logout-btn')) document.getElementById('logout-btn').onclick = () => { localStorage.removeItem('active_user'); state.currentUser = null; render(); };
}

function updateCartUI() {
    const list = document.getElementById('cart-items-list');
    if(!list) return;
    list.innerHTML = state.currentCart.map((item, index) => `<div class="flex flex-col border-b border-gray-100 pb-1 mb-1"><div class="flex justify-between font-bold"><span>${item.description.toUpperCase()}</span><span>R$ ${item.total.toFixed(2)}</span></div><div class="flex justify-between text-gray-400"><span>${item.quantity} un x R$ ${item.price.toFixed(2)}</span><button onclick="removeFromCart(${index})" class="text-red-400 text-[8px]">Remover</button></div></div>`).join('');
    if(document.getElementById('cart-total-display')) document.getElementById('cart-total-display').innerText = `R$ ${state.currentCart.reduce((acc, i) => acc + i.total, 0).toFixed(2)}`;
}

window.removeFromCart = (index) => { state.currentCart.splice(index, 1); updateCartUI(); };

function initCharts() {
    const canvas = document.getElementById('chartStock');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dataSlice = state.products.sort((a,b) => b.quantity - a.quantity).slice(0, 10);
    new Chart(ctx, {
        type: 'bar',
        data: { labels: dataSlice.map(p => p.description.substring(0, 8) + '...'), datasets: [{ data: dataSlice.map(p => p.quantity), backgroundColor: '#2563eb', borderRadius: 8 }] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { display: false } }, x: { grid: { display: false } } } }
    });
}

function renderInventory(container) {
    container.innerHTML = `
        <div class="space-y-6 animate-fade-in h-full flex flex-col">
            <div class="flex justify-between items-end shrink-0">
                <div><h2 class="text-3xl font-black text-gray-800 tracking-tight">Estoque de Produtos</h2><p class="text-gray-500 font-medium text-sm">Controle total e impressão de etiquetas.</p></div>
                <div class="flex gap-3"><button onclick="printInventory()" class="bg-gray-100 px-6 py-3 rounded-2xl font-black text-[9px] uppercase tracking-widest">Listagem</button><button onclick="printLabels()" class="bg-gray-100 px-6 py-3 rounded-2xl font-black text-[9px] uppercase tracking-widest">Etiquetas 3x3</button><button id="btn-add-product" class="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-blue-100">Novo Produto</button></div>
            </div>
            <div class="glass win-shadow rounded-[2rem] border border-white overflow-hidden flex flex-col flex-1 max-h-[calc(115vh-280px)]">
                <div class="overflow-y-auto flex-1 custom-scrollbar">
                    <table class="w-full text-left border-collapse">
                        <thead class="bg-white sticky top-0 z-10 text-[10px] font-black text-gray-400 uppercase tracking-widest"><tr><th class="px-8 py-5">Código</th><th class="px-8 py-5">Descrição</th><th class="px-6 py-5">Categoria</th><th class="px-6 py-5 text-center">Qtd</th><th class="px-6 py-5">Preço Venda</th><th class="px-8 py-5 text-right">Ações</th></tr></thead>
                        <tbody class="divide-y divide-gray-100">${state.products.map(p => `<tr class="hover:bg-white/40 transition-colors group"><td class="px-8 py-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">${p.code}</td><td class="px-8 py-4 font-bold text-gray-800">${p.description}</td><td class="px-6 py-4 text-[10px] font-black text-gray-400 uppercase">${p.category}</td><td class="px-6 py-4 text-center"><span class="px-3 py-1 rounded-full text-[10px] font-black ${p.quantity <= 5 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}">${p.quantity}</span></td><td class="px-6 py-4 font-black text-blue-600">R$ ${p.sellPrice.toFixed(2)}</td><td class="px-8 py-4 text-right"><div class="flex justify-end gap-2"><button onclick="editProduct('${p.id}')" class="p-2 text-blue-600">${ICONS.edit}</button><button onclick="deleteProduct('${p.id}')" class="p-2 text-red-400">${ICONS.delete}</button></div></td></tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    if(document.getElementById('btn-add-product')) document.getElementById('btn-add-product').onclick = () => { document.getElementById('product-form').reset(); document.getElementById('product-id').value = ''; document.getElementById('modal-title').innerText = 'Novo Produto'; document.getElementById('p-sell-display').innerText = 'R$ 0,00'; document.getElementById('product-modal').classList.remove('hidden'); };
}

window.editProduct = (id) => {
    const p = state.products.find(x => x.id === id);
    document.getElementById('product-id').value = p.id;
    document.getElementById('p-desc').value = p.description;
    document.getElementById('p-cat').value = p.category;
    document.getElementById('p-qty').value = p.quantity;
    document.getElementById('p-buy').value = p.buyPrice;
    document.getElementById('p-margin').value = p.margin;
    document.getElementById('p-sell-display').innerText = `R$ ${p.sellPrice.toFixed(2)}`;
    document.getElementById('modal-title').innerText = 'Editar Produto';
    document.getElementById('product-modal').classList.remove('hidden');
};

window.deleteProduct = (id) => { if (confirm('Excluir produto?')) { db.updateTable('products', state.products.filter(p => p.id !== id)); render(); } };

function renderSales(container) {
    container.innerHTML = `
        <div class="space-y-6 animate-fade-in h-full flex flex-col">
            <div class="flex justify-between items-end shrink-0">
                <div><h2 class="text-3xl font-black text-gray-800 tracking-tight">Histórico de Vendas</h2><p class="text-gray-500 font-medium">Registro de saídas liquidadas.</p></div>
                <div class="flex gap-3"><button id="btn-report" class="bg-gray-100 px-8 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest">Relatório</button><button id="btn-new-sale" class="bg-green-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-green-100">Ponto de Venda</button></div>
            </div>
            <div class="glass win-shadow rounded-[2rem] border border-white overflow-hidden flex flex-col flex-1 max-h-[calc(115vh-280px)]">
                <div class="overflow-y-auto flex-1 custom-scrollbar">
                    <table class="w-full text-left border-collapse">
                        <thead class="bg-white sticky top-0 z-10 text-[10px] font-black text-gray-400 uppercase tracking-widest"><tr><th class="px-8 py-5">ID / Data / Cliente</th><th class="px-6 py-5">Pagamento</th><th class="px-6 py-5 text-center">Itens</th><th class="px-6 py-5">Valor Total</th><th class="px-8 py-5 text-right">Ações</th></tr></thead>
                        <tbody class="divide-y divide-gray-100">${[...state.sales].reverse().map(s => `<tr class="hover:bg-white/40 transition-colors group"><td class="px-8 py-4"><div class="text-[10px] font-black text-gray-400 uppercase">#${s.id} - ${s.customer || 'Consumidor'}</div><div class="font-bold text-gray-800 text-xs">${new Date(s.createdAt).toLocaleString()}</div></td><td class="px-6 py-4"><span class="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[9px] font-black uppercase">${s.paymentMethod}</span></td><td class="px-6 py-4 text-center text-[10px] font-black text-gray-400">${s.items.length}</td><td class="px-6 py-4 font-black text-green-600">R$ ${s.totalPrice.toFixed(2)}</td><td class="px-8 py-4 text-right"><button onclick="printSaleCoupon(${s.id})" class="p-2 text-gray-600">${ICONS.print}</button></td></tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    document.getElementById('btn-new-sale').onclick = () => {
        state.currentCart = []; updateCartUI();
        const select = document.getElementById('s-product');
        select.innerHTML = '<option value="">Selecione...</option>' + state.products.filter(p => p.quantity > 0).map(p => `<option value="${p.id}">${p.description} - R$ ${p.sellPrice.toFixed(2)}</option>`).join('');
        
        // Popular select de clientes no PDV
        const sCustSelect = document.getElementById('s-customer-select');
        sCustSelect.innerHTML = '<option value="">Consumidor Final...</option>' + 
            state.customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

        document.getElementById('crediario-date-container').classList.add('hidden');
        document.getElementById('sale-modal').classList.remove('hidden');
    };
    document.getElementById('btn-report').onclick = () => document.getElementById('report-filter-modal').classList.remove('hidden');
}

function showCriticalItems() {
    const critical = state.products.filter(p => p.quantity <= 5);
    document.getElementById('critical-items-list').innerHTML = critical.map(p => `<tr><td class="px-6 py-4 font-bold text-gray-800">${p.description}</td><td class="px-6 py-4 text-center font-black text-red-500">${p.quantity}</td></tr>`).join('');
    document.getElementById('critical-modal').classList.remove('hidden');
}
