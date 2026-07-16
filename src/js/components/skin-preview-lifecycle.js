/**
 * 创建皮肤预览，并在异步初始化期间组件已卸载时立即释放迟到实例。
 * @param {object} options - 生命周期依赖
 * @param {() => Promise<import('./skin-preview-scene.js').default>} options.createPreview
 * @param {() => boolean} options.isUnmounted
 * @returns {Promise<import('./skin-preview-scene.js').default|null>}
 */
export async function mountSkinPreview({ createPreview, isUnmounted }) {
  const preview = await createPreview()
  if (isUnmounted()) {
    preview.dispose()
    return null
  }
  return preview
}
