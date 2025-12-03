/**
 * Speed Lines - Vertex Shader
 * 标准后处理顶点着色器
 * 将全屏四边形的 UV 坐标传递给片段着色器
 */

varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

