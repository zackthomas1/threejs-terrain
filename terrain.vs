precision mediump float;

void main() {
  float dist = length(position.xy);
  
  // Calculate height based on distance from center (0,0)
  float h = max(0.0, 1.0 - (dist / 5.0));
  
  // Quintic ease curve: 6t^5 - 15t^4 + 10^t3
  float height = h * h * h * (h * (h * 6.0 - 15.0) + 10.0);

  vec3 newPosition = position;
  newPosition.z = height * 2.0f;
  
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}