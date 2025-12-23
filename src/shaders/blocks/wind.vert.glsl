uniform float uTime;
uniform float uWindSpeed;
uniform float uSwayAmplitude;
uniform float uPhaseScale;

void main() {
    vec3 instancePos = instanceMatrix[3].xyz;

    float phase = (instancePos.x * 0.7 + instancePos.z * 1.3) * uPhaseScale;

    float heightFactor = clamp(position.y, 0.0, 1.0);
    heightFactor *= heightFactor;

    float baseWave = sin(uTime * uWindSpeed + phase);
    float detailWave = sin(uTime * uWindSpeed * 2.7 + phase * 1.9);

    float sway = (baseWave * 0.7 + detailWave * 0.3);

    float instanceRand = fract(sin(dot(instancePos.xz, vec2(12.9898,78.233))) * 43758.5453);
    float amplitude = uSwayAmplitude * mix(0.7, 1.3, instanceRand);

    vec2 windDir = normalize(vec2(0.8, 0.6));

    vec3 displacedPosition = position;
    displacedPosition.x += windDir.x * sway * amplitude * heightFactor;
    displacedPosition.z += windDir.y * sway * amplitude * heightFactor;

    csm_PositionRaw =
        projectionMatrix *
        modelViewMatrix *
        instanceMatrix *
        vec4(displacedPosition, 1.0);
}
