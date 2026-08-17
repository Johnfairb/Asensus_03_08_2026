/**
 * Pre-power fatigue check: >4 drops intensity one band; >7 advises skipping.
 */
function glassRoot() {
    return document.querySelector('.iphone-screen') || document.body;
}

function ensureModal() {
    let modal = document.getElementById('power-fatigue-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'power-fatigue-modal';
        glassRoot().appendChild(modal);
    }
    modal.className = 'hidden';
    modal.style.cssText = 'position:fixed; inset:0; z-index:22000; display:flex; justify-content:center; align-items:flex-end; padding:16px; box-sizing:border-box; background:rgba(0,0,0,0.45);';
    return modal;
}

function hide(modal) {
    modal.classList.add('hidden');
    modal.innerHTML = '';
}

/**
 * @returns {Promise<{ proceed: boolean, fatigue: number }>}
 */
export function promptPowerFatigueCheck() {
    return new Promise((resolve) => {
        const modal = ensureModal();
        modal.innerHTML = `
            <div class="modal-content stealth-panel" style="width:100%; max-width:390px; max-height:min(88%, calc(100% - 48px)); overflow:auto; background:var(--bg-surface); padding:18px 16px 16px; border-radius:16px 16px 12px 12px; box-sizing:border-box;" onclick="event.stopPropagation()">
                <div style="font-family:'Roboto Mono', monospace; font-size:10px; color:var(--gold-accent); font-weight:800; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">Power session</div>
                <h2 style="color:var(--text-main); margin:0 0 8px 0; font-family:'Roboto Mono', monospace; letter-spacing:1px; text-transform:uppercase; font-size:15px;">How fatigued do you feel?</h2>
                <p style="font-size:12px; color:var(--text-muted); margin:0 0 16px 0; line-height:1.45;">Plyometrics need to be fresh and maximal. 1 is fully recovered; 10 is exhausted.</p>
                <div id="power-fatigue-options" style="display:grid; grid-template-columns:repeat(5, 1fr); gap:8px;"></div>
            </div>`;
        const box = document.getElementById('power-fatigue-options');
        for (let n = 1; n <= 10; n++) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-primary is-secondary';
            btn.style.cssText = 'margin:0; padding:12px 0; font-size:14px; font-weight:800;';
            btn.textContent = String(n);
            btn.addEventListener('click', () => onScore(n));
            box.appendChild(btn);
        }
        modal.classList.remove('hidden');
        modal.onclick = (e) => {
            if (e.target === modal) {
                hide(modal);
                resolve({ proceed: false, fatigue: 0 });
            }
        };

        function onScore(fatigue) {
            if (fatigue > 7) {
                showSkipAdvice(fatigue);
                return;
            }
            hide(modal);
            resolve({ proceed: true, fatigue });
        }

        function showSkipAdvice(fatigue) {
            modal.innerHTML = `
                <div class="modal-content stealth-panel" style="width:100%; max-width:390px; overflow:auto; background:var(--bg-surface); padding:18px 16px 16px; border-radius:16px 16px 12px 12px; box-sizing:border-box;" onclick="event.stopPropagation()">
                    <div style="font-family:'Roboto Mono', monospace; font-size:10px; color:var(--gold-accent); font-weight:800; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">Power session</div>
                    <h2 style="color:var(--text-main); margin:0 0 8px 0; font-family:'Roboto Mono', monospace; letter-spacing:1px; text-transform:uppercase; font-size:15px;">Skip power today</h2>
                    <p style="font-size:12px; color:var(--text-muted); margin:0 0 16px 0; line-height:1.45;">Fatigue above 7 means you are not fresh enough for maximal plyometrics. Do a strength or hypertrophy session, or rest, instead.</p>
                    <button type="button" class="btn-primary is-primary" style="margin:0 0 8px 0; width:100%;" id="power-fatigue-skip">Skip power</button>
                    <button type="button" class="btn-primary is-secondary" style="margin:0; width:100%;" id="power-fatigue-anyway">Do it anyway</button>
                </div>`;
            document.getElementById('power-fatigue-skip')?.addEventListener('click', () => {
                hide(modal);
                resolve({ proceed: false, fatigue });
            });
            document.getElementById('power-fatigue-anyway')?.addEventListener('click', () => {
                hide(modal);
                resolve({ proceed: true, fatigue });
            });
        }
    });
}
