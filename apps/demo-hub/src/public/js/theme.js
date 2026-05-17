/* Theme toggle — Light / Dark, persisted to localStorage */
;(function () {
  const saved = localStorage.getItem('theme') || 'dark'
  document.documentElement.setAttribute('data-theme', saved)

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('theme-toggle')
    if (!btn) return

    function updateLabel(theme) {
      btn.textContent = theme === 'dark' ? '☀ Light' : '☾ Dark'
      btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode')
    }

    updateLabel(saved)

    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme')
      const next = current === 'dark' ? 'light' : 'dark'
      document.documentElement.setAttribute('data-theme', next)
      localStorage.setItem('theme', next)
      updateLabel(next)
    })
  })
})()
