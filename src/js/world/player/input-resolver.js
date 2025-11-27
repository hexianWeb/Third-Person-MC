/**
 * 解析原始输入，处理冲突并返回有效方向 + 归一化权重
 * @param {object} rawInput - { forward, backward, left, right }
 * @returns {{ resolvedInput: object, weights: object }}
 */
export function resolveDirectionInput(rawInput) {
  const resolvedInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    shift: rawInput.shift,
    v: rawInput.v,
    space: rawInput.space,
  }

  // 1. 相反方向互相抵消 (Cancel Opposites)
  // forward vs backward
  let zAxis = 0
  if (rawInput.forward)
    zAxis += 1
  if (rawInput.backward)
    zAxis -= 1

  // left vs right
  let xAxis = 0
  if (rawInput.left)
    xAxis += 1
  if (rawInput.right)
    xAxis -= 1

  // 2. 根據抵消後的結果設置 resolvedInput
  if (zAxis > 0)
    resolvedInput.forward = true
  else if (zAxis < 0)
    resolvedInput.backward = true

  if (xAxis > 0)
    resolvedInput.left = true
  else if (xAxis < 0)
    resolvedInput.right = true

  // 3. 計算歸一化權重
  const weights = {
    forward: 0,
    backward: 0,
    left: 0,
    right: 0,
  }

  let activeCount = 0
  if (resolvedInput.forward)
    activeCount++
  if (resolvedInput.backward)
    activeCount++
  if (resolvedInput.left)
    activeCount++
  if (resolvedInput.right)
    activeCount++

  if (activeCount > 0) {
    const weightPerDir = 1.0 / activeCount
    if (resolvedInput.forward)
      weights.forward = weightPerDir
    if (resolvedInput.backward)
      weights.backward = weightPerDir
    if (resolvedInput.left)
      weights.left = weightPerDir
    if (resolvedInput.right)
      weights.right = weightPerDir
  }

  return { resolvedInput, weights }
}
