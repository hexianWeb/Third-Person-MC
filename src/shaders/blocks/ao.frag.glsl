/**
 * AO Fragment Shader
 * Applies ambient occlusion darkening to the fragment color
 */

varying float vAO;

void main() {
    // Apply AO as a darkening factor
    // vAO is in range 0-1, where 0 = full occlusion, 1 = no occlusion
    // Map to a smoother range: avoid pure black, minimum brightness ~0.3
    float aoFactor = mix(0.3, 1.0, vAO);
    
    // Modify the diffuse color
    csm_DiffuseColor.rgb = vec3(aoFactor);
}
