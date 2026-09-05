/**
 * React Bits Radar (OGL) — patched: ResizeObserver sizing, loop paused while
 * off-screen or hidden, context released on unmount. Mounted by the caller
 * only while its section is near the viewport.
 */
import { Renderer, Program, Mesh, Triangle } from 'ogl';
import { useEffect, useRef } from 'react';
import './Radar.css';

function hexToVec3(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 0, 1); }
`;

const fragmentShader = `
precision highp float;
uniform float uTime;
uniform vec3 uResolution;
uniform float uSpeed;
uniform float uScale;
uniform float uRingCount;
uniform float uSpokeCount;
uniform float uRingThickness;
uniform float uSpokeThickness;
uniform float uSweepSpeed;
uniform float uSweepWidth;
uniform float uSweepLobes;
uniform vec3 uColor;
uniform float uFalloff;
uniform float uBrightness;
uniform vec2 uMouse;
uniform float uMouseInfluence;
uniform bool uEnableMouse;
#define TAU 6.28318530718
void main() {
  vec2 st = gl_FragCoord.xy / uResolution.xy;
  st = st * 2.0 - 1.0;
  st.x *= uResolution.x / uResolution.y;
  if (uEnableMouse) { vec2 mShift = (uMouse * 2.0 - 1.0); mShift.x *= uResolution.x / uResolution.y; st -= mShift * uMouseInfluence; }
  st *= uScale;
  float dist = length(st);
  float theta = atan(st.y, st.x);
  float t = uTime * uSpeed;
  float ringPhase = dist * uRingCount - t;
  float ringDist = abs(fract(ringPhase) - 0.5);
  float ringGlow = 1.0 - smoothstep(0.0, uRingThickness, ringDist);
  float spokeAngle = abs(fract(theta * uSpokeCount / TAU + 0.5) - 0.5) * TAU / uSpokeCount;
  float arcDist = spokeAngle * dist;
  float spokeGlow = (1.0 - smoothstep(0.0, uSpokeThickness, arcDist)) * smoothstep(0.0, 0.1, dist);
  float sweepPhase = t * uSweepSpeed;
  float sweepBeam = pow(max(0.5 * sin(uSweepLobes * theta + sweepPhase) + 0.5, 0.0), uSweepWidth);
  float fade = smoothstep(1.05, 0.85, dist) * pow(max(1.0 - dist, 0.0), uFalloff);
  float intensity = max((ringGlow + spokeGlow + sweepBeam) * fade * uBrightness, 0.0);
  vec3 col = uColor * intensity;
  float alpha = clamp(length(col), 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`;

export default function Radar({
  speed = 0.5,
  scale = 0.55,
  ringCount = 8,
  spokeCount = 12,
  ringThickness = 0.04,
  spokeThickness = 0.008,
  sweepSpeed = 1.2,
  sweepWidth = 3,
  sweepLobes = 1,
  color = '#00f0ff',
  falloff = 1.8,
  brightness = 0.9,
  enableMouseInteraction = true,
  mouseInfluence = 0.08,
}) {
  const containerRef = useRef(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    let renderer;
    try { renderer = new Renderer({ alpha: true, premultipliedAlpha: false, dpr: Math.min(window.devicePixelRatio || 1, 1.5) }); } catch { return undefined; }
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    let program;
    const currentMouse = [0.5, 0.5];
    let targetMouse = [0.5, 0.5];
    const onMove = (e) => {
      const rect = gl.canvas.getBoundingClientRect();
      targetMouse = [(e.clientX - rect.left) / rect.width, 1 - (e.clientY - rect.top) / rect.height];
    };
    const onLeave = () => { targetMouse = [0.5, 0.5]; };
    const resize = () => {
      renderer.setSize(container.offsetWidth, container.offsetHeight);
      if (program) program.uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height];
    };
    const geometry = new Triangle(gl);
    program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [1, 1, 1] },
        uSpeed: { value: speed }, uScale: { value: scale }, uRingCount: { value: ringCount }, uSpokeCount: { value: spokeCount },
        uRingThickness: { value: ringThickness }, uSpokeThickness: { value: spokeThickness }, uSweepSpeed: { value: sweepSpeed },
        uSweepWidth: { value: sweepWidth }, uSweepLobes: { value: sweepLobes }, uColor: { value: hexToVec3(color) },
        uFalloff: { value: falloff }, uBrightness: { value: brightness }, uMouse: { value: new Float32Array([0.5, 0.5]) },
        uMouseInfluence: { value: mouseInfluence }, uEnableMouse: { value: enableMouseInteraction },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });
    container.appendChild(gl.canvas);
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();
    if (enableMouseInteraction) { window.addEventListener('mousemove', onMove, { passive: true }); document.addEventListener('mouseleave', onLeave); }
    let raf = 0; let running = false;
    const update = (time) => {
      if (!running) return;
      raf = requestAnimationFrame(update);
      program.uniforms.uTime.value = time * 0.001;
      currentMouse[0] += 0.05 * (targetMouse[0] - currentMouse[0]);
      currentMouse[1] += 0.05 * (targetMouse[1] - currentMouse[1]);
      program.uniforms.uMouse.value[0] = currentMouse[0];
      program.uniforms.uMouse.value[1] = currentMouse[1];
      renderer.render({ scene: mesh });
    };
    const start = () => { if (running) return; running = true; raf = requestAnimationFrame(update); };
    const stop = () => { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; };
    let onScreen = true; let pageVisible = !document.hidden;
    const sync = () => { if (onScreen && pageVisible) start(); else stop(); };
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }, { threshold: 0 });
    io.observe(container);
    const onVis = () => { pageVisible = !document.hidden; sync(); };
    document.addEventListener('visibilitychange', onVis);
    sync();
    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      if (enableMouseInteraction) { window.removeEventListener('mousemove', onMove); document.removeEventListener('mouseleave', onLeave); }
      if (gl.canvas.parentElement === container) container.removeChild(gl.canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [speed, scale, ringCount, spokeCount, ringThickness, spokeThickness, sweepSpeed, sweepWidth, sweepLobes, color, falloff, brightness, enableMouseInteraction, mouseInfluence]);
  return <div ref={containerRef} className="radar-container" aria-hidden="true" />;
}
