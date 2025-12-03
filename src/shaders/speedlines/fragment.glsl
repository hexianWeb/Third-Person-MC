/**
 * Speed Lines - Fragment Shader
 * 实现从屏幕边缘向中心延伸的尖锐三角形速度线效果
 * 
 * 算法说明：
 * 1. 将屏幕坐标转换为极坐标 (r, θ)
 * 2. 将圆周分割为 N 个扇区，每个扇区可能生成一个三角形
 * 3. 使用伪随机函数决定每个扇区是否显示三角形
 * 4. 三角形尖端位置随时间脉冲变化，产生动态效果
 */

uniform sampler2D tDiffuse;    // 输入纹理（上一个 Pass 的输出）
uniform float uTime;           // 时间（用于动画）
uniform float uOpacity;        // 整体透明度（0-1，用于淡入淡出）
uniform vec3 uColor;           // 速度线颜色
uniform float uDensity;        // 三角形密度（扇区数量）
uniform float uSpeed;          // 脉冲速度
uniform float uThickness;      // 三角形底边宽度（角度）
uniform float uMinRadius;      // 三角形尖端最小半径（距离中心）
uniform float uMaxRadius;      // 三角形起始半径（屏幕边缘外）
uniform float uRandomness;     // 随机性强度

varying vec2 vUv;

// ==================== 工具函数 ====================

/**
 * 伪随机函数 - 基于输入值生成 0-1 范围的伪随机数
 */
float random(float seed) {
    return fract(sin(seed * 12.9898) * 43758.5453);
}

/**
 * 二维伪随机函数
 */
float random2D(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

// ==================== 主函数 ====================

void main() {
    // 获取原始场景颜色
    vec4 sceneColor = texture2D(tDiffuse, vUv);
    
    // 如果透明度为 0，直接返回原始颜色（优化性能）
    if (uOpacity <= 0.001) {
        gl_FragColor = sceneColor;
        return;
    }
    
    // 将 UV 坐标转换为以屏幕中心为原点的坐标 (-1 到 1)
    vec2 centeredUv = (vUv - 0.5) * 2.0;
    
    // 计算极坐标
    float radius = length(centeredUv);                    // 到中心的距离
    float angle = atan(centeredUv.y, centeredUv.x);       // 角度 (-PI 到 PI)
    float normalizedAngle = (angle + 3.14159265) / (2.0 * 3.14159265); // 归一化到 0-1
    
    // 计算当前像素所在的扇区索引
    float sectorCount = uDensity;
    float sectorIndex = floor(normalizedAngle * sectorCount);
    
    // 计算在当前扇区内的相对位置 (0-1)
    float sectorProgress = fract(normalizedAngle * sectorCount);
    
    // 扇区中心位置
    float sectorCenter = 0.5;
    
    // ==================== 三角形生成逻辑 ====================
    
    // 使用扇区索引生成随机种子（决定该扇区是否显示三角形）
    float sectorSeed = random(sectorIndex + 0.5);
    
    // 约 60% 的扇区显示三角形
    float showTriangle = step(0.4, sectorSeed);
    
    // 三角形的随机偏移（让每个三角形位置稍有不同）
    float angleOffset = (random(sectorIndex + 1.5) - 0.5) * uRandomness * 0.3;
    
    // 计算三角形尖端的脉冲位置
    // 使用正弦函数 + 随机相位，让每个三角形有不同的脉冲节奏
    float phase = random(sectorIndex + 2.5) * 6.28318; // 随机初始相位
    float pulse = sin(uTime * uSpeed + phase) * 0.5 + 0.5; // 0-1 脉冲
    
    // 三角形尖端半径（从边缘向中心脉冲）
    float tipRadius = mix(uMaxRadius, uMinRadius, pulse);
    
    // 三角形底边半径（始终在屏幕边缘外）
    float baseRadius = uMaxRadius + 0.2;
    
    // ==================== 三角形形状计算 ====================
    
    // 计算当前像素到扇区中心的角度偏移
    float angleFromCenter = abs(sectorProgress - sectorCenter + angleOffset);
    
    // 三角形的半宽度（角度）
    float halfWidth = uThickness * 0.5;
    
    // 根据半径计算当前位置的三角形宽度（线性插值，尖端窄，底部宽）
    // 当 radius 接近 tipRadius 时，允许的宽度趋近于 0
    // 当 radius 接近 baseRadius 时，允许的宽度为 halfWidth
    float radiusProgress = clamp((radius - tipRadius) / (baseRadius - tipRadius), 0.0, 1.0);
    float allowedWidth = halfWidth * radiusProgress;
    
    // 判断当前像素是否在三角形内
    float inTriangle = step(angleFromCenter, allowedWidth) * 
                       step(tipRadius, radius) * 
                       step(radius, baseRadius) *
                       showTriangle;
    
    // ==================== 颜色混合 ====================
    
    // 三角形边缘柔化（抗锯齿）
    float edgeSoftness = 0.02;
    float softEdge = 1.0 - smoothstep(allowedWidth - edgeSoftness, allowedWidth, angleFromCenter);
    softEdge *= smoothstep(tipRadius - edgeSoftness, tipRadius + edgeSoftness, radius);
    softEdge *= 1.0 - smoothstep(baseRadius - edgeSoftness, baseRadius, radius);
    softEdge *= showTriangle;
    
    // 沿半径方向的渐变（尖端更透明）
    float radialFade = radiusProgress;
    
    // 最终三角形 alpha
    float triangleAlpha = softEdge * radialFade * uOpacity;
    
    // 混合速度线颜色和场景颜色
    vec3 finalColor = mix(sceneColor.rgb, uColor, triangleAlpha);
    
    gl_FragColor = vec4(finalColor, sceneColor.a);
}

