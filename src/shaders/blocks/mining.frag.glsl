/**
 * Mining Fragment Shader
 * Overlays mining crack texture on block surface.
 */

// From vertex shader
varying vec2 vUv;
varying float vInstanceId;

// Uniforms
uniform sampler2D uCrackTexture;    // Current crack texture (selected by JS)
uniform float uMiningProgress;       // Mining progress [0, 1]
uniform float uTargetInstanceId;     // Instance ID being mined
uniform bool uIsBeingMined;          // Whether a block is being mined

void main() {
    // Only apply crack effect to target instance
    if (uIsBeingMined && abs(vInstanceId - uTargetInstanceId) < 0.5) {
        // Sample the crack texture
        vec4 crackColor = texture2D(uCrackTexture, vUv);
        
        // Blend crack onto original color (using alpha channel)
        // Higher progress = more visible crack
        float crackAlpha = crackColor.a * uMiningProgress * 0.9;
        csm_DiffuseColor.rgb = mix(csm_DiffuseColor.rgb, crackColor.rgb * 0.3, crackAlpha);
    }
}
