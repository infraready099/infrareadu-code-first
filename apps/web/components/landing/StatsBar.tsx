"use client";

import { motion, type Variants } from "framer-motion";

interface Stat {
  value: string;
  label: string;
  color: string;
  dot: string;
}

const stats: Stat[] = [
  { value: "20 min", label: "avg deploy time", color: "text-sky-400", dot: "bg-sky-400" },
  { value: "11", label: "AWS modules", color: "text-violet-400", dot: "bg-violet-400" },
  { value: "SOC2", label: "ready from day one", color: "text-emerald-400", dot: "bg-emerald-400" },
  { value: "0", label: "vendor lock-in", color: "text-amber-400", dot: "bg-amber-400" },
];

const container: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07 },
  },
};

const item: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

export function StatsBar() {
  return (
    <section className="px-6 py-0 relative z-10 -mt-4 mb-0">
      <div className="max-w-5xl mx-auto">
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-px rounded-2xl border border-white/[0.07] bg-white/[0.07] overflow-hidden backdrop-blur-md shadow-xl shadow-black/30"
        >
          {stats.map((stat) => (
            <motion.div
              key={stat.label}
              variants={item}
              className="flex flex-col items-center justify-center gap-1 bg-[#04091A]/90 py-6 px-4 text-center group hover:bg-white/[0.03] transition-colors duration-200"
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${stat.dot} shrink-0`} aria-hidden />
                <span className={`text-2xl font-bold tracking-tight ${stat.color}`}>
                  {stat.value}
                </span>
              </div>
              <span className="text-xs text-slate-500 font-medium leading-snug">{stat.label}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
