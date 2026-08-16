// 应用图标资源；注意路径从 src/lib 指向工程根目录的 build。
export const appIconUrl = new URL('../../build/icon.png', import.meta.url).href
export const darkDockIconUrl = new URL('../../build/dock-icon-dark.png', import.meta.url).href
