---
name: mixamo-simpleplayer-nla
description: >-
  Import Mixamo FBX clips onto SimplePlayer.arma, clean hinge joints, optionally
  rebase to idle, and push muted NLA tracks in Blender 5.x. Use when adding Mixamo
  animations, melee/swim/float/locomotion clips, fixing hyperextended joints,
  idle blending, or managing player NLA actions for Third-Person-MC.
---

# Mixamo → SimplePlayer NLA

Project workflow for bringing Mixamo motion onto `SimplePlayer.arma` and storing clips as muted NLA tracks.

## Hard constraints

- Target armature: **`SimplePlayer.arma`** (13 bones, Minecraft-style).
- Hinge bones flex on local **X** only (same convention as `idle` / punch actions):
  - Arms lower: negative X
  - Legs lower: positive X
- Blender **5.x slotted actions**: player slot id is `OBSimplePlayer.arma`.
- Default NLA convention: new combat/locomotion tracks are **muted**; usually only `tpose` unmuted while editing.
- Prefer `pnpm` for repo commands; Blender work goes through Blender MCP / Blender Python.

## Source FBX types (important)

| Source | Bone names | Quality on this rig | What to do |
|--------|------------|---------------------|------------|
| Mixamo **Y Bot / mixamorig** | `mixamorig:*` | Best | World-space retarget → SimplePlayer, then NLA |
| Mixamo **Motion-only retargeted to SimplePlayer** | `MAIN`, `Arm:Right:Upper`, … | Often twisted elbows/knees | Import → hinge-lock → optional idle rebase → NLA |

Most files in `D:\axe_pose_fbx` are the second type (`MotionOnlyScene; Retargeted Clip; Skeleton SimplePlayer.arma`). Import-option tweaks will **not** fix bad Mixamo retarget curves; hinge-lock is required for this stylized rig.

## Bone map (SimplePlayer)

```
MAIN
└ center
  ├ Body → Chest → Head
  │         ├ Arm:Left:Upper → Arm:Left:Lower
  │         └ Arm:Right:Upper → Arm:Right:Lower
  ├ Leg:Left:Upper → Leg:Left:Lower
  └ Leg:Right:Upper → Leg:Right:Lower
```

If the FBX is Y Bot, map at least:

| Mixamo | SimplePlayer |
|--------|--------------|
| Hips | center |
| Spine / Spine1 | Body |
| Spine2 | Chest |
| Head | Head |
| LeftArm / RightArm | Arm:Left:Upper / Arm:Right:Upper |
| LeftForeArm / RightForeArm | Arm:Left:Lower / Arm:Right:Lower |
| LeftUpLeg / RightUpLeg | Leg:Left:Upper / Leg:Right:Upper |
| LeftLeg / RightLeg | Leg:Left:Lower / Leg:Right:Lower |

Skip fingers, toes, shoulders, neck extras on this rig.

## Pipeline (SimplePlayer motion-only FBX)

Run in Blender (MCP `execute_blender_code` or Scripting). Preferred helper:

`scripts/import_mixamo_to_nla.py` in this skill folder.

### Steps

1. **Import FBX**
   - `use_anim=True`, `anim_offset=1.0`, `ignore_leaf_bones=True`
   - `automatic_bone_orientation=False`, `use_prepost_rot=True`
2. **Copy action** to a clean snake_case name (`melee_downward`, `swimming`, …).
3. **Set action slot** to `OBSimplePlayer.arma`; enable fake user.
4. **Strip object root motion** — delete Action fcurves whose `data_path` is **not** under `pose.bones[...]` (`location` / `rotation_euler` / `scale` on the armature object). Mixamo often bakes tiny root translation/rotation here; it reads as whole-body jitter/slide.
5. **Hinge-lock** `Arm:*:Lower` and `Leg:*:Lower` to pure X rotations (see signs above). Zero non-root bone locations; force scale keys to `1`.
6. **Idle rebase** (ground clips that must blend with idle):

   ```text
   q'(t) = q_idle * q_start^{-1} * q(t)
   ```

   Makes frame 1 (and usually last frame, if cyclic) match `idle`.
   - Use for: melee, dance, most standing actions.
   - Skip for: `swimming`, `floating`, and other non-standing states.
7. **Optional lower-body freeze** (melee): set `center` + all `Leg:*` rotations to constant `idle` pose so only arms/torso swing.
8. **Push NLA** on `SimplePlayer.arma`: muted track, strip start at frame 1, `extrapolation='NOTHING'`, `blend_type='REPLACE'`, bind suitable action slot.
9. **Cleanup**: delete temp import armatures; remove orphan `*|mixamo.com|Layer0*` actions.

## Naming conventions

| FBX (example) | Action / NLA track |
|---------------|--------------------|
| Standing Melee Attack Horizontal | `melee_horizontal` |
| Standing Melee Attack Downward | `melee_downward` |
| Standing Melee Attack 360 High | `melee_360_high` |
| Standing Melee Combo Attack Ver. 3 | `melee_combo_v3` |
| Bboy Hip Hop Move | `bboy_hip_hop` |
| Floating | `floating` |
| Swimming | `swimming` |

Keep names lowercase snake_case; track name == action name.

## Verification checklist

- [ ] Rest pose of import vs `SimplePlayer.arma`: major bone axes aligned (or Y Bot retarget used).
- [ ] Lower arm/leg eulers are `[±fold, 0, 0]` after hinge-lock.
- [ ] For idle-blended clips: frame 1 arm/chest match `idle` (avg quat diff ~0).
- [ ] NLA strip exists, muted, correct frame range, slot `OBSimplePlayer.arma`.
- [ ] No leftover `SimplePlayer.arma.00*|mixamo.com|*` actions/armatures.
- [ ] User saved the `.blend`.

## Known failure modes

1. **Hyperextended joints** after “just assigning” Mixamo action  
   Cause: SimplePlayer motion-only curves contain Y/Z on hinge bones. Fix: hinge-lock.

2. **Looks fine on Mixamo.com Y Bot, broken on player**  
   Cause: downloaded Motion-only for SimplePlayer, not Y Bot. Prefer re-download with **Y Bot**, then retarget.

3. **Hard to blend back to idle**  
   Cause: clip starts in combat/T-like stance. Fix: idle rebase.

4. **Action plays on wrong object / no motion in Blender 5**  
   Cause: action slot still `OBSlot`. Fix: rename/bind `OBSimplePlayer.arma`.

5. **Whole body slides/jitters like translation during a clip**  
   Cause: object-level `location`/`rotation_euler` on the Action (Mixamo root motion). Fix: delete all non-`pose.bones` fcurves; reset armature object transform.

## Agent execution notes

- Use Blender MCP tools; pass `user_prompt` when required.
- Do not commit `.blend` or `D:\axe_pose_fbx` binaries unless the user asks.
- After batch imports, always orphan-clean mixamo actions.
- Prefer editing actions already on `SimplePlayer.arma` NLA rather than leaving animations on temp armatures.

## Helper script

See [scripts/import_mixamo_to_nla.py](scripts/import_mixamo_to_nla.py).

Paste into Blender’s Text Editor or run via MCP after editing the `JOBS` list at the bottom of the file.
