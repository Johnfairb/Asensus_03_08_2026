// ==========================================
// THEME
// ==========================================
export function toggleTheme() {
    const isLight = document.getElementById('toggle-light-mode').checked;
    document.body.classList.toggle('light-theme', isLight);
    localStorage.setItem('ascensus_theme', isLight ? 'light' : 'dark');
    localStorage.setItem('ascensus_theme_chosen', '1');
}

if (localStorage.getItem('ascensus_theme') === 'light') {
    document.body.classList.add('light-theme');
    window.addEventListener('DOMContentLoaded', () => {
        const toggle = document.getElementById('toggle-light-mode');
        if (toggle) toggle.checked = true;
    });
}
