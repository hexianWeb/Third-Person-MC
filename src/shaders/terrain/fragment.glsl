uniform sampler2D uTopTexture;
uniform sampler2D uSideTexture;
uniform float uTime;

varying vec3 vObjectNormal;
varying vec2 vUv;
// varying vec3 vColor; // Already defined by Three.js when vertexColors is true

void main() {
    vec4 topColor = texture2D(uTopTexture, vUv);
    vec4 sideColor = texture2D(uSideTexture, vUv);
    
    // 使用对象空间法线判断顶部
    // Group 不再旋转，局部 Y 轴指向世界 Y（上）
    // 所以局部 Y+ 面是顶部
    float isTop = step(0.9, vObjectNormal.y);
    
    vec4 finalTextureColor = mix(sideColor, topColor, isTop);
    
    csm_DiffuseColor = finalTextureColor * vec4(vColor, 1.0);
}
