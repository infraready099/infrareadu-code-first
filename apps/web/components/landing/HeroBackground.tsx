"use client";

export function HeroBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Base black */}
      <div className="absolute inset-0 bg-black" />

      {/* Top radial glow — primary atmosphere */}
      <div
        className="absolute"
        style={{
          top: "-10%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "900px",
          height: "600px",
          background: "radial-gradient(ellipse at center, rgba(0,229,255,0.12) 0%, rgba(0,229,255,0.04) 40%, transparent 70%)",
          filter: "blur(1px)",
        }}
      />

      {/* Left orb */}
      <div
        className="absolute animate-float"
        style={{
          top: "15%",
          left: "-8%",
          width: "480px",
          height: "480px",
          background: "radial-gradient(circle, rgba(0,229,255,0.08) 0%, transparent 70%)",
          borderRadius: "50%",
          filter: "blur(60px)",
        }}
      />

      {/* Right orb */}
      <div
        className="absolute animate-float-delayed"
        style={{
          top: "5%",
          right: "-5%",
          width: "560px",
          height: "560px",
          background: "radial-gradient(circle, rgba(14,165,233,0.07) 0%, transparent 70%)",
          borderRadius: "50%",
          filter: "blur(80px)",
        }}
      />

      {/* 3D perspective grid floor */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "62%",
          backgroundImage: [
            "linear-gradient(rgba(0,229,255,0.07) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(0,229,255,0.07) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "50px 50px",
          transform: "perspective(600px) rotateX(55deg)",
          transformOrigin: "50% 100%",
          maskImage: "linear-gradient(to top, black 0%, transparent 75%)",
          WebkitMaskImage: "linear-gradient(to top, black 0%, transparent 75%)",
        }}
      />

      {/* Scan line over grid */}
      <div
        className="absolute animate-scan"
        style={{
          bottom: "0",
          left: 0,
          right: 0,
          height: "2px",
          background: "linear-gradient(90deg, transparent 0%, rgba(0,229,255,0.6) 50%, transparent 100%)",
          filter: "blur(1px)",
        }}
      />

      {/* Particle dots */}
      {[
        { top: "12%", left: "18%", delay: "0s", size: "2px" },
        { top: "25%", left: "72%", delay: "0.8s", size: "1.5px" },
        { top: "38%", left: "55%", delay: "1.4s", size: "2px" },
        { top: "18%", left: "88%", delay: "0.3s", size: "1.5px" },
        { top: "55%", left: "8%", delay: "1.1s", size: "2px" },
        { top: "8%", left: "40%", delay: "2s", size: "1.5px" },
        { top: "45%", left: "92%", delay: "0.6s", size: "2px" },
        { top: "30%", left: "28%", delay: "1.7s", size: "1.5px" },
      ].map((dot, i) => (
        <div
          key={i}
          className="absolute rounded-full animate-pulse-glow"
          style={{
            top: dot.top,
            left: dot.left,
            width: dot.size,
            height: dot.size,
            backgroundColor: "rgba(0,229,255,0.7)",
            boxShadow: "0 0 6px rgba(0,229,255,0.8)",
            animationDelay: dot.delay,
          }}
        />
      ))}

      {/* Bottom vignette — blends grid into content */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height: "200px",
          background: "linear-gradient(to top, #000000 0%, transparent 100%)",
        }}
      />
    </div>
  );
}
