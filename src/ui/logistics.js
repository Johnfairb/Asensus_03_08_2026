import { store } from '../state/store.js';
import { generateGroceryList } from '../domain/grocery.js';
import { loadInventory } from './fuel.js';

// ==========================================
// 13. LIVE CART ENGINE
// ==========================================
function getShopCheckboxes() {
    return Array.from(document.querySelectorAll('#inline-grocery-list .cart-checkbox'));
}

function getCheckedShopRows() {
    return getShopCheckboxes()
        .filter(box => box.checked)
        .map(box => box.closest('.grocery-row'))
        .filter(Boolean);
}

function updateAisleLeftCounts() {
    document.querySelectorAll('#inline-grocery-list [data-aisle-card]').forEach(card => {
        const boxes = card.querySelectorAll('.cart-checkbox');
        const left = Array.from(boxes).filter(b => !b.checked).length;
        const el = card.querySelector('[data-aisle-left]');
        if (el) el.textContent = `${left} left`;
    });
}

export function updateShoppingSelection() {
    const boxes = getShopCheckboxes();
    const checked = boxes.filter(box => box.checked);
    const left = boxes.length - checked.length;

    const el = document.getElementById('shopping-selected-count');
    if (el) {
        el.textContent = left > 0 ? `${left} left` : '';
        el.classList.toggle('hidden', left <= 0);
        el.removeAttribute('hidden');
        el.style.removeProperty('display');
    }

    updateAisleLeftCounts();

    let total = 0;
    checked.forEach(box => {
        const row = box.closest('.grocery-row');
        const cost = parseFloat(row?.dataset?.cost);
        if (Number.isFinite(cost)) total += cost;
    });
    const cartTotal = document.getElementById('shopping-cart-total');
    if (cartTotal) cartTotal.textContent = `£${total.toFixed(2)}`;
}

/** Single entry point for cart checkbox toggles (strike + counts + total). */
export function onShopCartToggle(checkbox) {
    if (typeof window.toggleCartStrike === 'function') {
        window.toggleCartStrike(checkbox);
    } else {
        const parent = checkbox?.closest?.('.grocery-row') || checkbox?.closest?.('.card');
        if (parent) {
            if (checkbox.checked) {
                parent.classList.add('is-checked');
                parent.style.opacity = '0.45';
            } else {
                parent.classList.remove('is-checked');
                parent.style.opacity = '1';
            }
        }
    }
    updateShoppingSelection();
}

/** Cart checkbox toggles via delegation (survives list re-renders). */
export function wireShoppingSelectionUpdates() {
    const list = document.getElementById('inline-grocery-list');
    if (!list || list.dataset.selectionWired === '1') return;
    list.dataset.selectionWired = '1';
    list.addEventListener('change', (e) => {
        const t = e.target;
        if (t && t.classList && t.classList.contains('cart-checkbox')) {
            onShopCartToggle(t);
        }
    });
}

export function openShoppingCostBreakdown() {
    const rows = getCheckedShopRows().map(row => ({
        name: row.dataset.name || 'Item',
        val: parseFloat(row.dataset.cost) || 0
    })).filter(r => r.val > 0)
      .sort((a, b) => b.val - a.val);

    const total = rows.reduce((s, r) => s + r.val, 0);
    const listEl = document.getElementById('macro-breakdown-list');
    const titleEl = document.getElementById('macro-breakdown-title');
    const subEl = document.getElementById('macro-breakdown-subtitle');
    const sheet = document.getElementById('macro-breakdown-sheet');
    if (!listEl || !sheet) return;

    if (titleEl) titleEl.textContent = 'Shopping cost';
    if (subEl) subEl.textContent = `£${total.toFixed(2)} selected`;

    if (rows.length === 0) {
        listEl.innerHTML = `<p style="font-size:13px; color:var(--text-silver); margin:12px 0 0;">No items selected.</p>`;
    } else {
        listEl.innerHTML = rows.map(r => {
            const pct = total > 0 ? Math.round((r.val / total) * 100) : 0;
            return `<div style="display:flex; justify-content:space-between; gap:12px; padding:8px 0; border-bottom:1px solid var(--border-subtle); font-size:12px;">
                <span style="color:var(--text-main);">${r.name}</span>
                <span style="color:var(--text-silver); font-family:'Roboto Mono'; white-space:nowrap;">£${r.val.toFixed(2)} · ${pct}%</span>
            </div>`;
        }).join('');
    }
    sheet.classList.remove('hidden');
}

export function openGroceryDetail(row) {
    if (!row) return;
    const modal = document.getElementById('grocery-detail-modal');
    const title = document.getElementById('grocery-detail-title');
    const body = document.getElementById('grocery-detail-body');
    if (!modal || !title || !body) return;

    title.textContent = row.dataset.name || 'Item';
    const stock = row.dataset.stock || '—';
    const need = row.dataset.need || '—';
    const buy = row.dataset.buy || '—';
    const packs = row.dataset.packs;
    const packLabel = row.dataset.packLabel || 'pack';
    const cost = row.dataset.cost;
    const coverage = row.dataset.coverage || '';

    const packLine = packs != null && packs !== '' && packs !== '—'
        ? `<div style="display:flex; justify-content:space-between; gap:12px; padding:8px 0; border-bottom:1px solid var(--border-subtle);"><span>Buy</span><span style="color:var(--text-main); font-family:'Roboto Mono';">${buy} · ${packs} ${packLabel}</span></div>`
        : '';
    const costLine = cost !== '—'
        ? `<div style="display:flex; justify-content:space-between; gap:12px; padding:8px 0; border-bottom:1px solid var(--border-subtle);"><span>Line price</span><span style="color:var(--text-main); font-family:'Roboto Mono'; font-weight:600;">£${cost}</span></div>`
        : '';

    body.innerHTML = `
        <div style="display:flex; justify-content:space-between; gap:12px; padding:8px 0; border-bottom:1px solid var(--border-subtle);"><span>In stock</span><span style="color:var(--text-main); font-family:'Roboto Mono';">${stock}</span></div>
        <div style="display:flex; justify-content:space-between; gap:12px; padding:8px 0; border-bottom:1px solid var(--border-subtle);"><span>Need (period)</span><span style="color:var(--text-main); font-family:'Roboto Mono';">${need}</span></div>
        ${packLine}
        ${costLine}
        ${coverage ? `<p style="margin:14px 0 0; font-size:12px; color:var(--text-silver); font-family:'Roboto Mono';">${coverage}</p>` : ''}
    `;
    modal.classList.remove('hidden');
}

export function closeGroceryDetail() {
    document.getElementById('grocery-detail-modal')?.classList.add('hidden');
}

export async function executeCheckout() {
    const checkboxes = document.querySelectorAll('.cart-checkbox:checked');
    if (checkboxes.length === 0) return alert("Select items in your cart first.");

    const status = document.getElementById('checkout-status');
    if (status) status.innerText = "Syncing Inventory...";

    let updates = [];
    checkboxes.forEach(box => {
        let f = store.globalFoodDB.find(food => food.id == box.getAttribute('data-id'));
        if (f) {
            let newStock = (f.stock_g || 0) + parseFloat(box.getAttribute('data-mass'));
            f.stock_g = newStock;
            updates.push({ id: f.id, stock_g: newStock });
        }
    });

    for (let u of updates) {
        await store.supabaseClient.from('food_inventory').update({ stock_g: u.stock_g }).eq('id', u.id);
    }

    if (status) {
        status.style.color = "var(--gold-accent)";
        status.innerText = "Inventory synced.";
    }
    loadInventory();
    generateGroceryList();
    closeGroceryDetail();

    setTimeout(() => {
        if (status) status.innerText = "";
    }, 2000);
}
