import { Navbar } from "../components/Navbar";

export default function Loading() {
  return (
    <>
      <Navbar orgName="Loading..." />
      <main className="shell">
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
          <div
            style={{
              width: "20px",
              height: "20px",
              border: "3px solid #e2e8f0",
              borderTopColor: "#3b82f6",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite"
            }}
          />
          <span style={{ fontSize: "0.95rem", color: "#64748b", fontWeight: "600" }}>
            Connecting to control plane & fetching live telemetry...
          </span>
        </div>

        <section className="metricGrid">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="metricCard" style={{ opacity: 0.6, minHeight: "100px" }}>
              <div style={{ height: "14px", width: "60%", background: "#e2e8f0", borderRadius: "4px" }} />
              <div style={{ height: "28px", width: "40%", background: "#cbd5e1", borderRadius: "4px", margin: "12px 0 8px 0" }} />
              <div style={{ height: "12px", width: "80%", background: "#f1f5f9", borderRadius: "4px" }} />
            </div>
          ))}
        </section>

        <section className="workspace" style={{ marginTop: "24px" }}>
          <div className="panel wide" style={{ opacity: 0.6, minHeight: "220px" }}>
            <div style={{ height: "20px", width: "250px", background: "#e2e8f0", borderRadius: "4px" }} />
            <div style={{ height: "12px", width: "400px", background: "#f1f5f9", borderRadius: "4px", marginTop: "8px" }} />
            <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ height: "36px", background: "#f8fafc", borderRadius: "6px" }} />
              <div style={{ height: "36px", background: "#f8fafc", borderRadius: "6px" }} />
              <div style={{ height: "36px", background: "#f8fafc", borderRadius: "6px" }} />
            </div>
          </div>
        </section>

        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </main>
    </>
  );
}
