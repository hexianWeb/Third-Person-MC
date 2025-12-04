uniform sampler2D uTopTexture;
uniform sampler2D uSideTexture;
uniform vec3 uColor;
uniform float uTime;

varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormal;

void main()
{
    // 简单的纹理采样
    vec4 topColor = texture2D(uTopTexture, vUv);
    
    // 颜色混合 (Tinting)
    // 假设 topTexture 是灰度图，我们需要将其与 uColor (草绿色) 混合
    vec3 finalColor = topColor.rgb * uColor;

    // 暂时直接输出 Top 纹理颜色
    // 未来可以根据 vNormal 或高度混合 uSideTexture
    
    gl_FragColor = vec4(finalColor, 1.0);
    
    // 简单的光照模拟 (可选，增加一点立体感)
    // vec3 light = normalize(vec3(1.0, 1.0, 0.5));
    // float shading = max(0.0, dot(vNormal, light));
    // gl_FragColor = vec4(finalColor * (0.5 + 0.5 * shading), 1.0);
}

