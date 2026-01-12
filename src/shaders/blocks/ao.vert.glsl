/**
 * AO Vertex Shader
 * Receives 6 AO values via instanceAO attribute and selects based on face normal
 * 
 * Note: instanceAO is a 6-component InstancedBufferAttribute that WebGL
 * will interpret as 6 floats per instance. We access components via
 * dot notation or indexing in a way GLSL supports.
 */

// instanceAO contains 6 floats: [+X, -X, +Y, -Y, +Z, -Z]
// Three.js InstancedBufferAttribute with itemSize 6 provides this data
attribute vec4 instanceAO;   // First 4 components: px, nx, py, ny
attribute vec2 instanceAO2;  // Last 2 components: pz, nz (need separate attribute)

varying float vAO;

void main() {
    // Select AO based on face normal
    vec3 n = normal;
    
    float ao = 1.0;  // Default: no occlusion
    
    // Determine which face based on dominant normal component
    if (n.x > 0.5) {
        ao = instanceAO.x;       // +X face
    } else if (n.x < -0.5) {
        ao = instanceAO.y;       // -X face
    } else if (n.y > 0.5) {
        ao = instanceAO.z;       // +Y face
    } else if (n.y < -0.5) {
        ao = instanceAO.w;       // -Y face
    } else if (n.z > 0.5) {
        ao = instanceAO2.x;      // +Z face
    } else if (n.z < -0.5) {
        ao = instanceAO2.y;      // -Z face
    }
    
    vAO = ao;
    
    // Standard MVP transformation for InstancedMesh
    csm_PositionRaw = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
