import { useCallback } from "react";
import Particles from "react-tsparticles";
import { loadSlim } from "tsparticles-slim";

export default function AnimatedBackground() {
  const init = useCallback(async (engine) => {
    await loadSlim(engine);
  }, []);

  return (
    <Particles
      id="tsparticles"
      init={init}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
      options={{
        fullScreen: { enable: false },
        background: { color: "transparent" },
        fpsLimit: 40,
        particles: {
          number: { value: 40, density: { enable: true, area: 900 } },
          color: { value: ["#7c8cff", "#a78bfa", "#00e5a0"] },
          links: {
            enable: true,
            color: "#7c8cff",
            opacity: 0.12,
            distance: 150,
            width: 1,
          },
          move: {
            enable: true,
            speed: 0.4,
            direction: "none",
            random: true,
            outModes: { default: "bounce" },
          },
          opacity: { value: 0.35 },
          size: { value: { min: 1, max: 2 } },
        },
        detectRetina: true,
      }}
    />
  );
}