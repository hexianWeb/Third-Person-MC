/**
 * Mining Vertex Shader
 * Passes UV coordinates and instance ID to fragment shader.
 */

// Output to fragment shader
varying vec2 vUv;
varying float vInstanceId;

void main() {
    // Pass UV coordinates
    vUv = uv;
    
    // Pass instance ID (convert to float)
    vInstanceId = float(gl_InstanceID);
    
    // Standard MVP transformation (using CSM's PositionRaw)
    csm_PositionRaw = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
