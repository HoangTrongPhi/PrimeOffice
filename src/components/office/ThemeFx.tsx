import { useEffect, useRef } from "react";
import type { ThemeFxKind } from "../../lib/studios";

/**
 * Light effects over the office floor for the special themes (Christmas snow, Tết petals, code rain…).
 * A canvas on top of the office frame that never takes a click; ~30 fps, paused while the window is
 * hidden, off when the system asks for reduced motion. Kept faint so the agents stay easy to read.
 */
export function ThemeFx({ kind }: { kind: ThemeFxKind | null | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !kind) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const fx = makeFx(kind);
    let raf = 0;
    let last = 0;
    let w = 0;
    let h = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || t - last < 33) return;
      const dt = Math.min(0.1, (t - (last || t)) / 1000);
      last = t;
      ctx.clearRect(0, 0, w, h);
      fx(ctx, w, h, dt, t / 1000);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [kind]);

  if (!kind) return null;
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 z-[1] size-full" />;
}

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, dt: number, t: number) => void;

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  s: number;
  a: number;
  r: number;
  life: number;
  c: string;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** Particles kept per area (one per `per` square px, at most `max`), respawned by `spawn`. */
function pool(per: number, max: number, spawn: (w: number, h: number, fresh: boolean) => P) {
  const ps: P[] = [];
  return (w: number, h: number) => {
    const want = Math.min(max, Math.round((w * h) / per));
    while (ps.length < want) ps.push(spawn(w, h, true));
    ps.length = want;
    return ps;
  };
}

function bat(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, flap: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  const up = Math.sin(flap) * s * 0.6;
  ctx.moveTo(x, y);
  ctx.lineTo(x - s, y - up);
  ctx.lineTo(x - s * 0.5, y + s * 0.2);
  ctx.lineTo(x, y + s * 0.35);
  ctx.lineTo(x + s * 0.5, y + s * 0.2);
  ctx.lineTo(x + s, y - up);
  ctx.closePath();
  ctx.fill();
}

function makeFx(kind: ThemeFxKind): Draw {
  switch (kind) {
    case "snow": {
      const get = pool(1200, 500, (w, h, fresh) => ({ x: rand(0, w), y: fresh ? rand(0, h) : -4, vx: rand(-8, 8), vy: rand(18, 45), s: Math.round(rand(2, 4)), a: rand(0.6, 0.95), r: rand(0, 6), life: 0, c: "" }));
      return (ctx, w, h, dt, t) => {
        ctx.fillStyle = "#ffffff";
        for (const p of get(w, h)) {
          p.y += p.vy * dt;
          p.x += (p.vx + Math.sin(t + p.r) * 10) * dt;
          if (p.y > h + 4) Object.assign(p, { x: rand(0, w), y: -4 });
          ctx.globalAlpha = p.a;
          ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
        }
        ctx.globalAlpha = 1;
      };
    }
    case "petals": {
      const get = pool(4000, 200, (w, h, fresh) => ({ x: rand(0, w), y: fresh ? rand(0, h) : -6, vx: rand(5, 20), vy: rand(14, 30), s: rand(2, 3.5), a: rand(0.6, 0.95), r: rand(0, 6), life: 0, c: pick(["#f7a3c0", "#f28ab0", "#ffd0e0", "#f5c542"]) }));
      const bursts: { x: number; y: number; t: number; c: string }[] = [];
      let next = 2;
      return (ctx, w, h, dt, t) => {
        for (const p of get(w, h)) {
          p.y += p.vy * dt;
          p.x += (p.vx + Math.sin(t * 1.5 + p.r) * 14) * dt;
          p.r += dt * 2;
          if (p.y > h + 6 || p.x > w + 6) Object.assign(p, { x: rand(-20, w), y: -6 });
          ctx.globalAlpha = p.a;
          ctx.fillStyle = p.c;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.r);
          ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2 + 1);
          ctx.restore();
        }
        // Fireworks now and then, high on the floor.
        next -= dt;
        if (next <= 0) {
          bursts.push({ x: rand(w * 0.1, w * 0.9), y: rand(h * 0.08, h * 0.4), t: 0, c: pick(["#ff4d4d", "#f5c542", "#ff9a3c", "#ffe066"]) });
          next = rand(2.5, 6);
        }
        for (let i = bursts.length - 1; i >= 0; i--) {
          const b = bursts[i];
          b.t += dt;
          if (b.t > 1.4) {
            bursts.splice(i, 1);
            continue;
          }
          const r = 10 + b.t * 40;
          ctx.globalAlpha = Math.max(0, 0.9 - b.t / 1.4);
          ctx.fillStyle = b.c;
          for (let k = 0; k < 18; k++) {
            const a = (k / 18) * Math.PI * 2;
            ctx.fillRect(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r + b.t * b.t * 12, 2, 2);
          }
        }
        ctx.globalAlpha = 1;
      };
    }
    case "spooky": {
      const bats: P[] = [];
      let next = 0.5;
      return (ctx, w, h, dt, t) => {
        // Fog along the bottom, drifting.
        const g = ctx.createLinearGradient(0, h * 0.65, 0, h);
        g.addColorStop(0, "rgba(140,110,190,0)");
        g.addColorStop(1, `rgba(140,110,190,${0.16 + Math.sin(t * 0.4) * 0.04})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, h * 0.65, w, h * 0.35);
        next -= dt;
        if (next <= 0 && bats.length < 7) {
          const left = Math.random() < 0.5;
          bats.push({ x: left ? -20 : w + 20, y: rand(h * 0.05, h * 0.7), vx: (left ? 1 : -1) * rand(60, 120), vy: 0, s: rand(5, 9), a: 0.85, r: rand(0, 6), life: 0, c: "#120c18" });
          next = rand(0.8, 2.5);
        }
        for (let i = bats.length - 1; i >= 0; i--) {
          const b = bats[i];
          b.x += b.vx * dt;
          b.y += Math.sin(t * 3 + b.r) * 20 * dt;
          if (b.x < -40 || b.x > w + 40) bats.splice(i, 1);
          else bat(ctx, b.x, b.y, b.s, t * 18 + b.r, b.c);
        }
      };
    }
    case "cave": {
      const bats: P[] = [];
      const drips = pool(30000, 40, (w, h) => ({ x: rand(0, w), y: rand(0, h * 0.9), vx: 0, vy: 0, s: rand(10, 40), a: 0, r: rand(0, 6), life: rand(0, 3), c: "" }));
      let next = 1;
      return (ctx, w, h, dt, t) => {
        // Dark edges: a cave around the floor.
        const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, "rgba(0,0,0,0.45)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "rgba(170,210,240,0.7)";
        for (const d of drips(w, h)) {
          d.life += dt;
          if (d.life > 3) Object.assign(d, { x: rand(0, w), y: rand(0, h * 0.9), life: 0 });
          if (d.life < 0.5) ctx.fillRect(d.x, d.y + d.life * d.s * 2, 1, 3);
        }
        next -= dt;
        if (next <= 0 && bats.length < 4) {
          const left = Math.random() < 0.5;
          bats.push({ x: left ? -20 : w + 20, y: rand(h * 0.05, h * 0.5), vx: (left ? 1 : -1) * rand(90, 160), vy: 0, s: rand(5, 8), a: 1, r: rand(0, 6), life: 0, c: "#06060a" });
          next = rand(3, 7);
        }
        for (let i = bats.length - 1; i >= 0; i--) {
          const b = bats[i];
          b.x += b.vx * dt;
          b.y += Math.sin(t * 4 + b.r) * 25 * dt;
          if (b.x < -40 || b.x > w + 40) bats.splice(i, 1);
          else bat(ctx, b.x, b.y, b.s, t * 22 + b.r, b.c);
        }
      };
    }
    case "neon": {
      const get = pool(4000, 220, (w, h, fresh) => ({ x: rand(0, w + 100), y: fresh ? rand(0, h) : rand(-60, -10), vx: -40, vy: rand(380, 520), s: rand(8, 16), a: rand(0.15, 0.35), r: 0, life: 0, c: pick(["#2ff3ff", "#ff2fd1", "#7a5aff"]) }));
      return (ctx, w, h, dt, t) => {
        ctx.lineWidth = 1;
        for (const p of get(w, h)) {
          p.y += p.vy * dt;
          p.x += p.vx * dt;
          if (p.y > h + 20) Object.assign(p, { x: rand(0, w + 100), y: rand(-60, -10) });
          ctx.globalAlpha = p.a;
          ctx.strokeStyle = p.c;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.vx * 0.02, p.y + p.s);
          ctx.stroke();
        }
        // Scanlines and a flicker now and then.
        ctx.globalAlpha = 0.05;
        ctx.fillStyle = "#000";
        for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
        if (Math.sin(t * 7.3) > 0.985) {
          ctx.globalAlpha = 0.06;
          ctx.fillStyle = "#ff2fd1";
          ctx.fillRect(0, 0, w, h);
        }
        ctx.globalAlpha = 1;
      };
    }
    case "code": {
      const glyphs = "アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789:.=*+<>";
      const size = 12;
      let drops: number[] = [];
      let speed: number[] = [];
      return (ctx, w, h, dt) => {
        const cols = Math.ceil(w / size);
        if (drops.length !== cols) {
          drops = Array.from({ length: cols }, () => rand(-h, h) / size);
          speed = Array.from({ length: cols }, () => rand(4, 12));
        }
        ctx.font = `${size}px monospace`;
        for (let i = 0; i < cols; i++) {
          drops[i] += speed[i] * dt;
          const head = Math.floor(drops[i]);
          for (let k = 0; k < 14; k++) {
            const y = (head - k) * size;
            if (y < -size || y > h) continue;
            ctx.globalAlpha = k === 0 ? 0.55 : 0.32 * (1 - k / 14);
            ctx.fillStyle = k === 0 ? "#c8ffd6" : "#2bd24f";
            ctx.fillText(glyphs[(i * 7 + head - k + 1000) % glyphs.length], i * size, y);
          }
          if (head * size - 14 * size > h) {
            drops[i] = rand(-20, 0);
            speed[i] = rand(4, 12);
          }
        }
        ctx.globalAlpha = 1;
      };
    }
    case "bubbles": {
      const get = pool(9000, 120, (w, h, fresh) => ({ x: rand(0, w), y: fresh ? rand(0, h) : h + 6, vx: 0, vy: -rand(18, 45), s: rand(1.5, 4.5), a: rand(0.3, 0.6), r: rand(0, 6), life: 0, c: "" }));
      return (ctx, w, h, dt, t) => {
        // Light ripples from above.
        ctx.globalAlpha = 0.07;
        ctx.fillStyle = "#bff3ff";
        for (let k = 0; k < 6; k++) {
          const x = ((k / 6) * w + Math.sin(t * 0.3 + k) * 60 + t * 12) % (w + 120) - 60;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x + 40, 0);
          ctx.lineTo(x + 120, h);
          ctx.lineTo(x + 60, h);
          ctx.fill();
        }
        ctx.strokeStyle = "#e9fbff";
        ctx.lineWidth = 1;
        for (const p of get(w, h)) {
          p.y += p.vy * dt;
          p.x += Math.sin(t * 2 + p.r) * 8 * dt;
          if (p.y < -6) Object.assign(p, { x: rand(0, w), y: h + 6 });
          ctx.globalAlpha = p.a;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      };
    }
    case "justice": {
      const get = pool(12000, 90, (w, h) => ({ x: rand(0, w), y: rand(0, h), vx: 0, vy: -rand(2, 6), s: rand(1, 2.5), a: 0, r: rand(0, 6), life: rand(0, 4), c: pick(["#f5d76e", "#ffffff", "#9cc3ff"]) }));
      return (ctx, w, h, dt, t) => {
        // Soft beams of light from the top.
        for (let k = 0; k < 3; k++) {
          const x = w * (0.2 + k * 0.3) + Math.sin(t * 0.2 + k) * 30;
          const g = ctx.createLinearGradient(x, 0, x + 80, h);
          g.addColorStop(0, "rgba(255,236,170,0.10)");
          g.addColorStop(1, "rgba(255,236,170,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(x - 30, 0);
          ctx.lineTo(x + 30, 0);
          ctx.lineTo(x + 160, h);
          ctx.lineTo(x + 40, h);
          ctx.fill();
        }
        for (const p of get(w, h)) {
          p.life += dt;
          p.y += p.vy * dt;
          if (p.life > 4) Object.assign(p, { x: rand(0, w), y: rand(0, h), life: 0 });
          const a = Math.sin((p.life / 4) * Math.PI);
          ctx.globalAlpha = a * 0.8;
          ctx.fillStyle = p.c;
          ctx.fillRect(p.x - p.s, p.y, p.s * 2 + 1, 1);
          ctx.fillRect(p.x, p.y - p.s, 1, p.s * 2 + 1);
        }
        ctx.globalAlpha = 1;
      };
    }
  }
}
