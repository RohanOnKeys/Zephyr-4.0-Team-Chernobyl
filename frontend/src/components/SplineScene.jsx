export default function SplineScene() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#050505] cursor-pointer">
      <div
        className="absolute inset-0"
        style={{
          zoom: 0.45,
        }}
      >
        <iframe
          src="https://my.spline.design/googlyeyes-SSbPVdKCMWzlrPH3q1US1MEV-9wA/"
          title="Googly Eyes"
          className="w-full h-full border-0"
          allow="autoplay; fullscreen"
          style={{
            cursor: "pointer",
          }}
        />
      </div>

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </div>
  );
}
