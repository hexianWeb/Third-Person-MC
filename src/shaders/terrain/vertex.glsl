uniform float uTime;
uniform vec2 uTextureScale;

varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormal;

void main()
{
    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    
    // 预留高度变形逻辑
    // float elevation = sin(modelPosition.x * 0.5 + uTime) * 0.2;
    // modelPosition.y += elevation;

    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;

    gl_Position = projectedPosition;

    // 应用纹理缩放
    vUv = uv * uTextureScale;
    
    vPosition = modelPosition.xyz;
    vNormal = normalize(normalMatrix * normal);
}
