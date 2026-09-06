import { Navbar } from "../../../components/Navbar";

export default function ExecutionDetailLoading() {
  return (
    <>
      <Navbar orgName="Execution Context" />
      <main className="shell">
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
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
            Loading execution details and tool call traces...
          </span>
        </div>

        <div className="panel wide" style={{ minHeight: "120px", opacity: 0.6, marginBottom: "16px" }}>
          <div style={{ height: "16px", width: "120px", background: "#e2e8f0", borderRadius: "4px" }} />
          <div style={{ height: "28px", width: "60%", background: "#cbd5e1", borderRadius: "4px", margin: "12px 0" }} />
          <div style={{ height: "14px", width: "40%", background: "#f1f5f9", borderRadius: "4px" }} />
        </div>

        <section className="metricGrid" style={{ marginBottom: "16px" }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="metricCard" style={{ opacity: 0.6, minHeight: "90px" }}>
              <div style={{ height: "12px", width: "50%", background: "#e2e8f0", borderRadius: "4px" }} />
              <div style={{ height: "20px", width: "70%", background: "#cbd5e1", borderRadius: "4px", marginTop: "8px" }} />
            </div>
          ))}
        </section>

        <section className="workspace">
          <div className="panel wide" style={{ opacity: 0.6, minHeight: "300px" }}>
            <div style={{ height: "20px", width: "200px", background: "#e2e8f0", borderRadius: "4px" }} />
            <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ height: "80px", background: "#f8fafc", borderRadius: "8px" }} />
              <div style={{ height: "80px", background: "#f8fafc", borderRadius: "8px" }} />
              <div style={{ height: "80px", background: "#f8fafc", borderRadius: "8px" }} />
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
