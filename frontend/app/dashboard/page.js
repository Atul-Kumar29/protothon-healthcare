"use client";

import { useEffect, useState } from "react";
import { RefreshCw, AlertTriangle, CheckCircle, Search } from "lucide-react";

export default function DashboardPage() {
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [patientFilter, setPatientFilter] = useState("");

  const fetchDashboardData = async (patientId) => {
    setLoading(true);
    setError(null);
    try {
      const url = patientId
        ? `http://localhost:8000/api/records?patient_id=${encodeURIComponent(patientId)}`
        : "http://localhost:8000/api/audits";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      const data = await res.json();
      setAudits(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Clinical Records Dashboard</h1>
            <p className="text-slate-500 mt-1">Search and review clinical voice logs by patient.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 py-2 w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={patientFilter}
                onChange={(e) => setPatientFilter(e.target.value)}
                placeholder="Filter by Patient ID (e.g. PAT-992)"
                className="bg-transparent outline-none text-sm text-slate-900 flex-1 placeholder:text-slate-400"
              />
            </div>
            <button 
              onClick={() => fetchDashboardData(patientFilter.trim() || undefined)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-white rounded-lg transition-colors border border-slate-300 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {patientFilter.trim() ? "Search" : "Refresh Logs"}
            </button>
          </div>
        </header>

        {error && (
          <div className="bg-red-950/50 border border-red-900 text-red-400 px-4 py-3 rounded-lg flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50/50 text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-medium">Date/Time</th>
                  <th className="px-6 py-4 font-medium">Patient ID</th>
                  <th className="px-6 py-4 font-medium">Voice Log Transcript</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Diagnosis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading && audits.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                      Loading clinical records...
                    </td>
                  </tr>
                ) : audits.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className="space-y-4">
                        <p className="text-slate-500">
                          No clinical records found.
                        </p>
                        <div className="text-sm text-slate-400 space-y-2">
                          <p>Possible reasons:</p>
                          <ul className="list-disc list-inside text-left max-w-md mx-auto">
                            <li>No audio files uploaded yet</li>
                            <li>Spark job has not processed the data</li>
                            <li>Backend API not running on port 8000</li>
                            <li>Check Docker containers are running</li>
                          </ul>
                          <p className="pt-4">
                            <a href="http://localhost:8000/api/debug/data" target="_blank" rel="noopener noreferrer" 
                               className="text-blue-400 hover:text-blue-300 underline">
                              Check data flow debug info
                            </a>
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  audits.map((audit, idx) => {
                    // Determine status color
                    const status = audit.status || "unknown";
                    const isPending = status.includes("pending");
                    const isCompleted = status.includes("completed") || status.includes("dispensed");
                    
                    return (
                      <tr 
                        key={idx} 
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-6 py-4 text-slate-700">
                          {audit.timestamp || "N/A"}
                        </td>
                        <td className="px-6 py-4 font-mono text-slate-700">
                          {audit.patient_id || "N/A"}
                        </td>
                        <td className="px-6 py-4 max-w-md truncate" title={audit.raw_transcript || ""}>
                          {audit.raw_transcript || "No transcript"}
                        </td>
                        <td className="px-6 py-4">
                          {isPending ? (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-900/30 text-yellow-400 border border-yellow-800/50 text-xs font-semibold">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {status}
                            </div>
                          ) : isCompleted ? (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-900/30 text-green-400 border border-green-800/50 text-xs font-semibold">
                              <CheckCircle className="w-3.5 h-3.5" />
                              {status}
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-300 text-xs font-semibold">
                              {status}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {audit.diagnosis || "Pending"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
