"use client";

import { useRef, useCallback, CSSProperties } from "react";

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
  intensity?: number;
}

export function TiltCard({ children, className = "", style, intensity = 8 }: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!cardRef.current) return;

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }

      frameRef.current = requestAnimationFrame(() => {
        if (!cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;

        const rotateX = -y * intensity;
        const rotateY = x * intensity;

        cardRef.current.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(8px)`;
        cardRef.current.style.transition = "transform 0.1s ease-out";
      });
    },
    [intensity]
  );

  const handleMouseLeave = useCallback(() => {
    if (!cardRef.current) return;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }
    cardRef.current.style.transform =
      "perspective(800px) rotateX(0deg) rotateY(0deg) translateZ(0px)";
    cardRef.current.style.transition = "transform 0.5s ease-out";
  }, []);

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
      style={{
        willChange: "transform",
        transformStyle: "preserve-3d",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
