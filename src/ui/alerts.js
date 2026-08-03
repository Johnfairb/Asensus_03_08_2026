export function installAlerts() {
  window.alert = function(msg) {
    const box = document.getElementById('tactical-alert-box');
    const text = document.getElementById('tactical-alert-text');
    if(box && text) {
        if(navigator.vibrate) navigator.vibrate([50, 50, 50]);
        text.innerText = msg;
        box.style.top = '40px';
        setTimeout(() => { box.style.top = '-100px'; }, 4000);
    } else {
        console.log("ALERT:", msg);
    }
  };

  window.toggleCartStrike = function(checkbox) {
    const parent = checkbox.closest('.grocery-row') || checkbox.closest('.card');
    if (!parent) return;
    if (checkbox.checked) {
      parent.classList.add('is-checked');
      parent.style.opacity = '0.45';
    } else {
      parent.classList.remove('is-checked');
      parent.style.opacity = '1';
    }
  };
}
