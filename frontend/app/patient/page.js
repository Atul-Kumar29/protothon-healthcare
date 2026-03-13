"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { User, Activity, Clock, FileText, Pill, CheckCircle, Search, RefreshCw, AlertCircle, FlaskConical } from "lucide-react";

export default function PatientPortal() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [records, setRecords] = useState([]);
  const [labReports, setLabReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzingIds, setAnalyzingIds] = useState(new Set());
  const [aiSummaries, setAiSummaries] = useState({});
  const [error, setError] = useState(null);

  // Live translation state for this patient
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const [liveTranscript, setLiveTranscript] = useState("");
  const ttsPendingRef = useRef(false);

  useEffect(() => {
    const session = localStorage.getItem("clinical_session");
    if (!session) {
      router.push("/");
    } else {
      try {
        const parsed = JSON.parse(session);
        if (parsed.role !== "patient") {
          router.push("/");
          return;
        }
        
        const activeId = localStorage.getItem("active_patient_id");
        const finalId = activeId || parsed.user_id || "PAT-992";
        parsed.user_id = finalId;
        setUser(parsed);
        fetchTimeline(finalId);
        fetchLabReports(finalId);
      } catch (err) {
        console.error("Session parse error:", err);
        router.push("/");
      }
    }

    const handleStorageChange = (e) => {
      if (e.key === "active_patient_id" && e.newValue) {
        setUser(prev => prev ? { ...prev, user_id: e.newValue } : null);
        fetchTimeline(e.newValue);
      }
    };

    const handleCustomChange = () => {
      const newId = localStorage.getItem("active_patient_id");
      if (newId) {
        setUser(prev => prev ? { ...prev, user_id: newId } : null);
        fetchTimeline(newId);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("patient_id_changed", handleCustomChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("patient_id_changed", handleCustomChange);
    };
  }, [router]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => setAudioChunks(chunks);

      setMediaRecorder(recorder);
      recorder.start();
      setIsRecording(true);
      setError(null);
      setLiveTranscript("");
    } catch (err) {
      setError("Microphone access denied or unavailable.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    }
  };

  // When we have a full blob, send to backend for translation
  useEffect(() => {
    const uploadAudio = async () => {
      if (!audioChunks.length) return;
      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("file", audioBlob, "patient-consult.webm");
      formData.append("source_lang", "hi-IN");
      formData.append("target_lang", "en-IN");
      formData.append("patient_id", "PAT-992");

      try {
        const res = await fetch("http://localhost:8000/upload-audio", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) throw new Error("Voice translation failed. Check API connection.");
        const data = await res.json();
        setLiveTranscript(data.raw_transcript || "");
        ttsPendingRef.current = true;
      } catch (err) {
        setError(err.message);
      }
    };

    if (!isRecording && audioChunks.length > 0) {
      uploadAudio();
    }
  }, [isRecording, audioChunks]);

  // Simple browser TTS for translated text so patient hears the doctor in their language
  useEffect(() => {
    if (!liveTranscript || !ttsPendingRef.current) return;
    ttsPendingRef.current = false;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      const utter = new SpeechSynthesisUtterance(liveTranscript);
      // You can tweak this to patient's true locale
      utter.lang = "en-IN";
      window.speechSynthesis.speak(utter);
    } catch {
      // Ignore TTS failures; text is still visible
    }
  }, [liveTranscript]);

  const fetchTimeline = async (patientId) => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8000/api/records?patient_id=${patientId}`);
      if (res.ok) {
        const data = await res.json();
        setRecords(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLabReports = async (patientId) => {
    try {
      const res = await fetch(`http://localhost:8000/api/lab-reports/${patientId}`);
      if (res.ok) {
        const data = await res.json();
        setLabReports(data);
      }
    } catch (err) {
      console.error("Failed to fetch lab reports:", err);
    }
  };

  const analyzeLabReport = async (report) => {
    setAnalyzingIds(prev => new Set(prev).add(report.report_id));
    try {
      const res = await fetch("http://localhost:8000/api/analyze-lab-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lab_tests: report.lab_tests })
      });
      if (res.ok) {
        const data = await res.json();
        setAiSummaries(prev => ({ ...prev, [report.report_id]: data }));
      }
    } catch (err) {
      console.error("AI analysis failed:", err);
    } finally {
      setAnalyzingIds(prev => {
        const next = new Set(prev);
        next.delete(report.report_id);
        return next;
      });
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200">
      <nav className="bg-neutral-900 border-b border-neutral-800 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <User className="text-emerald-500 w-6 h-6" />
          <h1 className="font-bold text-white tracking-wide">Patient Portal</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-emerald-400">ID: {user.user_id}</span>
          <button onClick={() => { localStorage.removeItem("clinical_session"); router.push("/"); }} className="text-sm text-red-400 hover:text-red-300">Logout</button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto p-6 mt-8">
        {/* Live translation strip */}
        <div className="mb-8 grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.7fr)] items-start">
          <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-500" />
              Live Conversation (Patient Side)
            </h3>
            <p className="text-xs text-neutral-500 mb-4">
              Hold the button and speak in your native language to hear the translated response.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 py-4">
              <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onMouseLeave={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                disabled={loading}
                className={`px-6 py-3 rounded-full border text-sm font-medium shadow-md transition-all ${
                  isRecording
                    ? "bg-red-500/20 text-red-400 border-red-500"
                    : "bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-500"
                }`}
              >
                {isRecording ? "Recording..." : "Hold to Speak"}
              </button>
              {error && <p className="text-xs text-red-400 text-center">{error}</p>}
            </div>
          </div>
          <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800 min-h-[120px]">
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
              Translated Line
            </h3>
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-200 min-h-[64px]">
              {liveTranscript || (
                <span className="text-neutral-500">Your translated text will appear here.</span>
              )}
            </div>
          </div>
        </div>

        {/* Lab Reports Section */}
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-6">
            <FlaskConical className="w-6 h-6 text-indigo-500" />
            <h2 className="text-xl font-bold text-white">Laboratory Reports</h2>
          </div>

          {labReports.length === 0 ? (
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-6 text-center text-neutral-500">
              <p className="text-sm italic">No laboratory reports available yet.</p>
            </div>
          ) : (
            <div className="grid gap-6">
              {labReports.map((report) => (
                <div key={report.report_id} className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
                  <div className="p-4 bg-neutral-800/50 border-b border-neutral-800 flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-white uppercase text-sm tracking-wider">{report.report_type}</h3>
                      <p className="text-[10px] text-neutral-500 font-mono mt-0.5">{report.report_id} • {report.date}</p>
                    </div>
                    <button 
                      onClick={() => analyzeLabReport(report)}
                      disabled={analyzingIds.has(report.report_id)}
                      className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      {analyzingIds.has(report.report_id) ? <RefreshCw className="w-3 h-3 animate-spin"/> : <FileText className="w-3 h-3"/>}
                      {aiSummaries[report.report_id] ? "Re-analyze with AI" : "AI Summary"}
                    </button>
                  </div>
                  
                  <div className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <h4 className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest">Test Metrics</h4>
                        <div className="space-y-2">
                          {report.lab_tests.map((test, i) => (
                            <div key={i} className="flex items-center justify-between text-sm bg-neutral-950 p-2 rounded border border-neutral-800">
                              <span className="text-neutral-400">{test.test_name}</span>
                              <div className="flex items-center gap-3">
                                <span className="text-white font-medium">{test.value}</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                  test.status === "NORMAL" ? "bg-emerald-900/20 text-emerald-500 border border-emerald-900/50" : 
                                  test.status === "HIGH" || test.status === "LOW" ? "bg-amber-900/20 text-amber-500 border border-amber-900/50" :
                                  test.status === "FAIL" ? "bg-red-900/20 text-red-500 border border-red-900/50" : "bg-neutral-800 text-neutral-400"
                                }`}>
                                  {test.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* AI Summary Sidebar */}
                      <div className="space-y-3">
                        <h4 className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5" /> AI Insight
                        </h4>
                        <div className="bg-indigo-950/20 border border-indigo-900/30 rounded-lg p-3 min-h-[100px]">
                          {aiSummaries[report.report_id] ? (
                            <div className="space-y-4">
                              <p className="text-sm text-neutral-200 italic leading-relaxed">
                                "{aiSummaries[report.report_id].summary}"
                              </p>
                              <div className="flex gap-4">
                                <div>
                                  <p className="text-[10px] text-indigo-400 uppercase font-bold mb-1">Risk Level</p>
                                  <p className={`text-xs font-bold ${
                                    aiSummaries[report.report_id].risk_level === "High" ? "text-red-400" :
                                    aiSummaries[report.report_id].risk_level === "Medium" ? "text-amber-400" : "text-emerald-400"
                                  }`}>
                                    {aiSummaries[report.report_id].risk_level}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-indigo-400 uppercase font-bold mb-1">Recommendation</p>
                                  <p className="text-xs text-neutral-300">
                                    {aiSummaries[report.report_id].recommendation}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center h-full text-neutral-600 py-6">
                              <FileText className="w-8 h-8 opacity-20 mb-2" />
                              <p className="text-xs">Click AI Summary to analyze these results</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white">Clinical Timeline</h2>
            <p className="text-neutral-400 mt-1">Your recent visits, diagnoses, and prescriptions.</p>
          </div>
          <button 
            onClick={() => fetchTimeline(user.user_id)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded-lg text-sm transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {loading && records.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-neutral-500">
            <RefreshCw className="w-8 h-8 animate-spin mb-4" />
            <p>Loading historical records from Delta Lake...</p>
          </div>
        ) : records.length === 0 ? (
          <div className="bg-neutral-900 rounded-xl p-8 border border-neutral-800 text-center">
            <Search className="w-12 h-12 text-neutral-600 mx-auto mb-4" />
            <p className="text-neutral-400">No clinical records found for your ID.</p>
          </div>
        ) : (
          <div className="relative border-l border-neutral-800 ml-4 space-y-12 pb-12">
            {records.map((record, idx) => {
              const date = new Date(record.timestamp);
              const formattedDate = date.toLocaleDateString("en-US", { month: 'short', day: 'numeric', year: 'numeric' });
              const formattedTime = date.toLocaleTimeString("en-US", { hour: '2-digit', minute: '2-digit' });
              
              const isFulfilled = record.status === "fulfilled";
              
              return (
                <div key={idx} className="relative pl-8">
                  {/* Timeline Node */}
                  <div className="absolute -left-3.5 top-1 w-7 h-7 rounded-full bg-neutral-900 border-2 border-emerald-500 flex items-center justify-center">
                    <Activity className="w-3.5 h-3.5 text-emerald-500" />
                  </div>
                  
                  {/* Card Content */}
                  <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
                    
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="bg-neutral-950 p-2 rounded-lg border border-neutral-800">
                          <Clock className="w-5 h-5 text-neutral-400" />
                        </div>
                        <div>
                          <p className="text-white font-medium">{formattedDate}</p>
                          <p className="text-xs text-neutral-500">{formattedTime}</p>
                        </div>
                      </div>
                      
                      <div className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 border ${
                        isFulfilled 
                          ? "bg-emerald-900/30 text-emerald-400 border-emerald-800/50" 
                          : "bg-amber-900/30 text-amber-500 border-amber-800/50"
                      }`}>
                        {isFulfilled ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                        Medication: {isFulfilled ? "Dispensed" : "Pending Pharmacy"}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                      
                      {/* Clinical Notes */}
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5" /> Diagnosis
                          </h4>
                          <p className="text-sm text-neutral-300 bg-neutral-950 p-3 rounded-md border border-neutral-800">
                            {record.diagnosis || "Not specified."}
                          </p>
                        </div>
                        
                        <div>
                          <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">Reported Symptoms</h4>
                          <ul className="text-sm text-neutral-400 list-disc list-inside bg-neutral-950 p-3 rounded-md border border-neutral-800">
                            {record.symptoms && record.symptoms.length > 0 
                              ? record.symptoms.map((s, i) => <li key={i}>{s}</li>)
                              : <li>No notable symptoms.</li>
                            }
                          </ul>
                        </div>
                      </div>

                      {/* Prescriptions & Labs */}
                      <div className="space-y-4">
                        <div className="bg-blue-950/20 border border-blue-900/30 p-4 rounded-lg">
                          <h4 className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <Pill className="w-3.5 h-3.5" /> Prescription
                          </h4>
                          
                          <div className="flex justify-between items-center border-b border-blue-900/30 pb-2 mb-2">
                            <span className="text-sm text-neutral-300 font-medium">{record.medication || "None"}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-blue-500/70">Dosage:</span>
                            <span className="text-blue-300">{record.dosage || "N/A"}</span>
                          </div>
                        </div>

                        {record.lab_tests && record.lab_tests.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">Requested Labs</h4>
                            <div className="flex flex-wrap gap-2 text-xs">
                              {record.lab_tests.map((lab, i) => (
                                <span key={i} className="bg-neutral-800 text-neutral-300 px-2 py-1 rounded border border-neutral-700">
                                  {lab}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                    </div>
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
