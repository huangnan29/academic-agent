import { unsupportedPermissions } from './browser'

export const systemPermissionsApi: Window['paperAgent']['systemPermissions'] = {
  async get() {
    return unsupportedPermissions()
  },
  async requestFullAccess() {
    return unsupportedPermissions()
  },
  async requestMicrophone() {
    return unsupportedPermissions()
  },
  async openSettings() {
    throw new Error('浏览器演示无法申请 macOS 系统权限，请使用桌面应用。')
  },
}
