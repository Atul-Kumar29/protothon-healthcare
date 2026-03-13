"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Pill, CheckCircle, Clock, AlertTriangle, Search, Activity, RefreshCw, User } from "lucide-react";

export default function PharmacyPortal() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dispensingId, setDispensingId] = useState(null);

  useEffect(() => {
    const session = localStorage.getItem("clinical_session");
    if (!session) {
      router.push("/");
    } else {
      const parsed = JSON.parse(session);
      if (parsed.role !== "pharmacy") router.push("/");
      setUser(parsed);
    }
  }, [router]);

  const fetchQueue = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/records?status=pending_pharmacy");
      if (res.ok) {
        const data = await res.json();
        setQueue(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Poll Delta Lake every 2.5 seconds for new prescriptions hitting the queue
  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 2500);
    return () => clearInterval(interval);
  }, []);

  const handleDispense = async (record) => {
    setDispensingId(record.timestamp);
    try {
      const payload = {
        patient_id: record.patient_id,
        timestamp: record.timestamp
      };

      const res = await fetch("http://localhost:8000/api/dispense-prescription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        // Optimistically remove from UI
        setQueue(prev => prev.filter(q => q.timestamp !== record.timestamp));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDispensingId(null);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200">
      <nav className="bg-neutral-900 border-b border-neutral-800 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Pill className="text-purple-500 w-6 h-6" />
          <h1 className="font-bold text-white tracking-wide">Pharmacy Fulfillment</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-purple-900/30 text-purple-400 rounded-full text-xs font-semibold border border-purple-800">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
            </span>
            Live Delta Lake Polling
          </div>
          <span className="text-sm text-neutral-400 font-medium ml-2">ID: {user.user_id}</span>
          <button onClick={() => { localStorage.removeItem("clinical_session"); router.push("/"); }} className="text-sm text-red-400 hover:text-red-300">Logout</button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-6 mt-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              Pending Prescriptions
              <span className="bg-neutral-800 text-neutral-300 text-sm py-0.5 px-2.5 rounded-full border border-neutral-700">
                {queue.length}
              </span>
            </h2>
            <p className="text-neutral-400 mt-1">Awaiting fulfillment processing and hand-off to patients.</p>
          </div>
        </div>

        {loading && queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-neutral-500">
            <RefreshCw className="w-8 h-8 animate-spin mb-4" />
            <p>Loading prescription queue...</p>
          </div>
        ) : queue.length === 0 ? (
          <div className="bg-neutral-900 rounded-xl p-12 border border-neutral-800 text-center flex flex-col items-center justify-center">
            <CheckCircle className="w-16 h-16 text-emerald-500/50 mb-4 shadow-sm" />
            <h3 className="text-xl font-medium text-white mb-2">Queue is Empty</h3>
            <p className="text-neutral-400 max-w-sm">All pending prescriptions have been fulfilled. The clinical workflow is completely clear.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {queue.map((record, idx) => {
              const reqDate = new Date(record.timestamp);
              
              return (
                <div key={idx} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden hover:border-neutral-700 transition-colors shadow-lg flex flex-col">
                  
                  {/* Card Header */}
                  <div className="bg-neutral-950 px-5 py-4 border-b border-neutral-800 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-neutral-500" />
                      <span className="font-semibold text-white tracking-wide">{record.patient_id}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-neutral-500 bg-neutral-900 px-2 py-1 rounded border border-neutral-800 shadow-inner">
                      <Clock className="w-3.5 h-3.5" />
                      {reqDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                  </div>
                  
                  {/* Card Body */}
                  <div className="p-5 flex-1 flex flex-col gap-4">
                    
                    <div>
                      <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-blue-500" /> 
                        Prescribed Medication
                      </h4>
                      <div className="bg-blue-950/20 border border-blue-900/30 rounded-lg p-3">
                        <p className="text-white font-medium text-lg leading-tight mb-1">{record.medication || "Unknown Medication"}</p>
                        <p className="text-blue-400 text-sm">{record.dosage || "Check with doctor"}</p>
                      </div>
                    </div>

                    <div className="mt-auto pt-2">
                      <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">Doctor diagnosis code</h4>
                      <p className="text-sm text-neutral-400 truncate border border-neutral-800 bg-neutral-950 p-2 text-center rounded">
                        {record.diagnosis || "General Consult"}
                      </p>
                    </div>

                  </div>
                  
                  {/* Card Footer / Action */}
                  <div className="px-5 py-4 bg-neutral-950 border-t border-neutral-800">
                    <button
                      onClick={() => handleDispense(record)}
                      disabled={dispensingId === record.timestamp}
                      className="w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                      {dispensingId === record.timestamp ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle className="w-5 h-5" />
                          Mark as Dispensed
                        </>
                      )}
                    </button>
                  </div>
                  
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
