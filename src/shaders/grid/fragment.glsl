varying vec3 vWorldPosition;

uniform float uSize;
uniform vec3 uColor; // Grid line color
uniform float uFadeDistance;
uniform float uThickness;

// New uniforms for Plus pattern and Base
uniform vec3 uBaseColor;
uniform vec3 uPlusColor;
uniform float uPlusScale; // 0.0 to 1.0 relative to cell size
uniform float uPlusThickness;
uniform float uSubdiv; // Number of subdivisions (e.g. 1, 2, 3, 4)

void main() {
    // Grid logic
    // Divide world position by size to create grid cells
    vec2 coord = vWorldPosition.xz / uSize;
    
    // Calculate derivatives for anti-aliasing
    vec2 derivative = fwidth(coord);
    
    // --- Grid Lines ---
    // fract(coord - 0.5) centers the grid line
    vec2 grid = abs(fract(coord - 0.5) - 0.5) / derivative;
    float line = min(grid.x, grid.y);
    float gridStrength = 1.0 - min(line, uThickness);
    
    // Axes logic (override grid strength near axes)
    float xAxis = abs(vWorldPosition.z) / fwidth(vWorldPosition.z); 
    float zAxis = abs(vWorldPosition.x) / fwidth(vWorldPosition.x);
    float axisStrength = 1.0 - min(min(xAxis, zAxis), 2.0);
    gridStrength = max(gridStrength, axisStrength);

    // --- Plus Pattern ---
    // Subdivide the grid coordinate
    vec2 subCoord = coord * uSubdiv;
    
    // Center of the sub-cell in UV space (after fract) is 0.5, 0.5
    vec2 cellUV = fract(subCoord) - 0.5; // Range -0.5 to 0.5
    vec2 absUV = abs(cellUV);
    
    // Derivative for sub-cell (increases with subdivision)
    vec2 subDerivative = fwidth(subCoord);
    
    float plusHalfSize = uPlusScale * 0.5;
    
    // Calculate Plus line intensity
    // Vertical bar: x is near 0, y is within length
    float plusDistX = absUV.x / subDerivative.x;
    float plusDistY = absUV.y / subDerivative.y;
    
    // Thickness (using uPlusThickness)
    float pStrX = 1.0 - min(plusDistX, uPlusThickness);
    float pStrY = 1.0 - min(plusDistY, uPlusThickness);
    
    // Length masking
    // Use subDerivative for soft clipping at the ends of the plus
    float pMaskX = 1.0 - smoothstep(plusHalfSize - subDerivative.y * 2.0, plusHalfSize, absUV.y);
    float pMaskY = 1.0 - smoothstep(plusHalfSize - subDerivative.x * 2.0, plusHalfSize, absUV.x);
    
    // Combine vertical and horizontal bars of the plus
    float plusStrength = max(pStrX * pMaskX, pStrY * pMaskY);
    plusStrength = clamp(plusStrength, 0.0, 1.0);

    // --- Mixing Colors ---
    // Start with base color
    vec3 finalColor = uBaseColor;
    
    // Add Plus Pattern
    finalColor = mix(finalColor, uPlusColor, plusStrength);
    
    // Add Grid Lines (Grid sits on top)
    finalColor = mix(finalColor, uColor, gridStrength);

    // --- Distance Fading ---
    float d = distance(cameraPosition.xz, vWorldPosition.xz);
    float alpha = 1.0 - smoothstep(uFadeDistance * 0.2, uFadeDistance, d);

    // Optimization: discard fully transparent pixels
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(finalColor, alpha);
}