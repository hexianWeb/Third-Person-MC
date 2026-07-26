import { ATTACK_STYLES, ITEM_BY_ID } from '../../config/items-config.js'
import { AnimationClips } from './animation-config.js'

const ATTACK_SEQUENCES = Object.freeze({
  [ATTACK_STYLES.UNARMED]: Object.freeze([
    AnimationClips.STRAIGHT_PUNCH,
    AnimationClips.RIGHT_STRAIGHT_PUNCH,
  ]),
  // melee_horizontal 已从循环中分离，暂不参与序列
  [ATTACK_STYLES.MELEE]: Object.freeze([
    AnimationClips.MELEE_DOWNWARD,
    AnimationClips.MELEE_360_HIGH,
    AnimationClips.MELEE_COMBO_V3,
  ]),
})

/**
 * Resolve one accepted air swing and the next sequence index.
 * @param {number | null} itemId
 * @param {number} sequenceIndex
 * @returns {{ clip: string, nextIndex: number }}
 */
export function resolveAirSwingAnimation(itemId, sequenceIndex = 0) {
  const style = ITEM_BY_ID[itemId]?.attackStyle ?? ATTACK_STYLES.UNARMED
  const sequence = ATTACK_SEQUENCES[style] ?? ATTACK_SEQUENCES[ATTACK_STYLES.UNARMED]
  const index = Math.max(0, sequenceIndex) % sequence.length
  return {
    clip: sequence[index],
    nextIndex: (index + 1) % sequence.length,
  }
}
