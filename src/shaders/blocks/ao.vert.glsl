/**
 * Top-Column AO Vertex Shader
 * Receives single AO value per instance via aAo attribute.
 * 
 * aAo: 0 = no occlusion (bright), 1 = max occlusion (darkest)
 * vAO: passed to fragment shader, inverted so 1 = no occlusion
 */

attribute float aAo;

varying float vAO;

void main() {
    // Invert: vAO = 1 - aAo so that vAO=1 means no occlusion (bright)
    // This maintains compatibility with the existing fragment shader
    vAO = 1.0 - aAo;
    
    // Standard MVP transformation for InstancedMesh
    csm_PositionRaw = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
