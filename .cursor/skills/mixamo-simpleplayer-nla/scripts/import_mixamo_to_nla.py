"""
Import Mixamo SimplePlayer motion-only FBX clips onto SimplePlayer.arma NLA.

Usage (Blender 5.x Scripting or MCP execute_blender_code):
  1. Edit JOBS below
  2. Run script

Pipeline: import → copy/rename action → slot OBSimplePlayer.arma →
hinge-lock lowers → optional idle rebase → muted NLA → cleanup temps
"""

from __future__ import annotations

import math
import re
from pathlib import Path

import bpy
from mathutils import Euler, Quaternion

PLAYER_NAME = 'SimplePlayer.arma'
PLAYER_SLOT = 'OBSimplePlayer.arma'

HINGE_BONES = {
  'Arm:Left:Lower': -1.0,
  'Arm:Right:Lower': -1.0,
  'Leg:Left:Lower': 1.0,
  'Leg:Right:Lower': 1.0,
}

# Edit this list per batch
JOBS = [
  # (fbx_path, action_name, rebase_to_idle)
  # (r'D:\axe_pose_fbx\Standing Melee Attack Downward.fbx', 'melee_downward', True),
  # (r'D:\axe_pose_fbx\Swimming.fbx', 'swimming', False),
]


def get_player():
  player = bpy.data.objects.get(PLAYER_NAME)
  if player is None or player.type != 'ARMATURE':
    raise RuntimeError(f'Missing armature {PLAYER_NAME}')
  if not player.animation_data:
    player.animation_data_create()
  return player


def get_bag(action):
  return action.layers[0].strips[0].channelbags[0]


def wipe_temp_armatures():
  for obj in list(bpy.data.objects):
    if obj.type == 'ARMATURE' and obj.name != PLAYER_NAME:
      bpy.data.objects.remove(obj, do_unlink=True)


def remove_action(name):
  act = bpy.data.actions.get(name)
  if act:
    bpy.data.actions.remove(act)


def remove_track(player, name):
  tracks = player.animation_data.nla_tracks
  if name in tracks:
    tracks.remove(tracks[name])


def bone_curves(bag, bone, prop):
  path = f'pose.bones["{bone}"].{prop}'
  return path, {fc.array_index: fc for fc in bag.fcurves if fc.data_path == path}


def replace_quat_keys(fcs, frames_vals):
  for i in range(4):
    fc = fcs[i]
    while fc.keyframe_points:
      fc.keyframe_points.remove(fc.keyframe_points[0])
    for f, q in frames_vals:
      fc.keyframe_points.insert(f, q[i], options={'FAST'})
    for kp in fc.keyframe_points:
      kp.interpolation = 'BEZIER'
      kp.handle_left_type = 'AUTO_CLAMPED'
      kp.handle_right_type = 'AUTO_CLAMPED'
    fc.update()


def strip_object_root_motion(action):
  """Remove armature-object location/rotation/scale curves (Mixamo root jitter)."""
  bag = get_bag(action)
  removed = 0
  for fc in list(bag.fcurves):
    if not fc.data_path.startswith('pose.bones'):
      bag.fcurves.remove(fc)
      removed += 1
  return removed


def hinge_lock(action):
  bag = get_bag(action)
  frames = sorted({
    kp.co[0]
    for fc in bag.fcurves
    if 'rotation_quaternion' in fc.data_path
    for kp in fc.keyframe_points
  })
  for bone, sign in HINGE_BONES.items():
    _path, fcs = bone_curves(bag, bone, 'rotation_quaternion')
    if set(fcs) != {0, 1, 2, 3}:
      continue
    new_keys = []
    prev = None
    for f in frames:
      q = Quaternion([fcs[i].evaluate(f) for i in range(4)]).normalized()
      e = q.to_euler('XYZ')
      fold = abs(e.x)
      if fold < math.radians(1.0):
        fold = abs(q.angle)
      fold = min(fold, math.radians(160.0))
      qc = Euler((sign * fold, 0.0, 0.0), 'XYZ').to_quaternion().normalized()
      if prev is not None and prev.dot(qc) < 0:
        qc = -qc
      prev = qc
      new_keys.append((f, qc))
    replace_quat_keys(fcs, new_keys)

  for fc in list(bag.fcurves):
    if '.scale' in fc.data_path:
      for kp in fc.keyframe_points:
        kp.co[1] = 1.0
      fc.update()
    elif '.location' in fc.data_path:
      m = re.search(r'pose\.bones\["([^"]+)"\]', fc.data_path)
      if m and m.group(1) not in {'MAIN', 'center'}:
        for kp in fc.keyframe_points:
          kp.co[1] = 0.0
        fc.update()


def eval_pose(action, frame, bones):
  bag = get_bag(action)
  pose = {}
  for bone in bones:
    path = f'pose.bones["{bone}"].rotation_quaternion'
    vals = [None] * 4
    for fc in bag.fcurves:
      if fc.data_path == path and 0 <= fc.array_index <= 3:
        vals[fc.array_index] = fc.evaluate(frame)
    pose[bone] = (
      Quaternion(vals).normalized()
      if all(v is not None for v in vals)
      else Quaternion((1, 0, 0, 0))
    )
  return pose


def rebase_to_idle(player, action):
  idle = bpy.data.actions.get('idle')
  if idle is None:
    raise RuntimeError('Missing idle action for rebase')
  bones = [b.name for b in player.data.bones]
  idle_pose = eval_pose(idle, float(idle.frame_range[0]), bones)
  start_pose = eval_pose(action, float(action.frame_range[0]), bones)
  bag = get_bag(action)
  frames = sorted({
    kp.co[0]
    for fc in bag.fcurves
    if 'rotation_quaternion' in fc.data_path
    for kp in fc.keyframe_points
  })
  for bone in bones:
    _path, fcs = bone_curves(bag, bone, 'rotation_quaternion')
    if set(fcs) != {0, 1, 2, 3}:
      continue
    delta = idle_pose[bone] @ start_pose[bone].inverted()
    new_keys = []
    prev = None
    for f in frames:
      q = Quaternion([fcs[i].evaluate(f) for i in range(4)]).normalized()
      qc = (delta @ q).normalized()
      if prev is not None and prev.dot(qc) < 0:
        qc = -qc
      prev = qc
      new_keys.append((f, qc))
    replace_quat_keys(fcs, new_keys)


def push_nla(player, action_name):
  remove_track(player, action_name)
  act = bpy.data.actions[action_name]
  track = player.animation_data.nla_tracks.new()
  track.name = action_name
  track.mute = True
  strip = track.strips.new(action_name, 1, act)
  strip.name = action_name
  if strip.action_suitable_slots:
    strip.action_slot = strip.action_suitable_slots[0]
  strip.action_frame_start = float(act.frame_range[0])
  strip.action_frame_end = float(act.frame_range[1])
  strip.extrapolation = 'NOTHING'
  strip.blend_type = 'REPLACE'


def cleanup_mixamo_orphans():
  removed = []
  for act in list(bpy.data.actions):
    if 'mixamo.com' not in act.name and not act.name.startswith('SimplePlayer.arma.'):
      continue
    act.use_fake_user = False
    try:
      act.user_clear()
    except Exception:
      pass
    if act.users == 0:
      removed.append(act.name)
      bpy.data.actions.remove(act)
  return removed


def import_job(player, fbx_path, action_name, rebase_to_idle_flag):
  path = Path(fbx_path)
  if not path.exists():
    return {'name': action_name, 'error': f'missing file {fbx_path}'}

  wipe_temp_armatures()
  before = set(bpy.data.objects.keys())
  bpy.ops.import_scene.fbx(
    filepath=str(path),
    use_anim=True,
    anim_offset=1.0,
    ignore_leaf_bones=True,
    automatic_bone_orientation=False,
    use_prepost_rot=True,
  )
  imported = next(
    (
      bpy.data.objects[n]
      for n in set(bpy.data.objects.keys()) - before
      if bpy.data.objects[n].type == 'ARMATURE'
    ),
    None,
  )
  if not imported or not imported.animation_data or not imported.animation_data.action:
    return {'name': action_name, 'error': 'import failed'}

  src = imported.animation_data.action
  remove_action(action_name)
  act = src.copy()
  act.name = action_name
  act.use_fake_user = True
  if act.slots:
    try:
      act.slots[0].name_set(PLAYER_SLOT)
    except Exception:
      pass

  strip_object_root_motion(act)
  hinge_lock(act)
  if rebase_to_idle_flag:
    rebase_to_idle(player, act)
  push_nla(player, action_name)

  src_name = src.name
  bpy.data.objects.remove(imported, do_unlink=True)
  src2 = bpy.data.actions.get(src_name)
  if src2 and src2.users == 0:
    bpy.data.actions.remove(src2)

  return {
    'name': action_name,
    'frames': list(act.frame_range),
    'rebased': rebase_to_idle_flag,
  }


def run(jobs=None):
  jobs = jobs if jobs is not None else JOBS
  if not jobs:
    raise RuntimeError('JOBS is empty — add (fbx_path, action_name, rebase_to_idle) entries')

  player = get_player()
  results = [import_job(player, *job) for job in jobs]
  wipe_temp_armatures()
  removed = cleanup_mixamo_orphans()

  for t in player.animation_data.nla_tracks:
    t.mute = (t.name != 'tpose')
  player.animation_data.action = None
  bpy.context.scene.frame_set(1)

  print({'results': results, 'removed_orphans': removed})
  return results


if __name__ == '__main__':
  run()
