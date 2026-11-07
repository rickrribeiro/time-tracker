// Aplica a skin/tema salvos antes da primeira pintura (sem piscar).
// O padrão de cada plataforma fica em src/styles/skin.ts (DEFAULT_SKIN), aplicado por applySkin().
(function () {
  var d = document.documentElement
  var desktop = navigator.userAgent.indexOf('Electron') !== -1
  try {
    var q = new URLSearchParams(location.search)
    var skin = q.get('skin') || localStorage.getItem('rickos-skin-' + (desktop ? 'desktop' : 'web'))
    var theme = q.get('theme') || localStorage.getItem('rickos-theme')
    if (skin) d.dataset.skin = skin
    if (theme) d.dataset.theme = theme
  } catch (e) {}
})()
