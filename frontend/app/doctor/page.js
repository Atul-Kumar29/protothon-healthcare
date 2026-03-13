"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Mic, ArrowRight, Save, Activity, CheckCircle, AlertCircle, FileText, Pill, FlaskConical, RefreshCw, Search } from "lucide-react";

export default function DoctorPortal() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  
  // Audio state
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const [activeSpeaker, setActiveSpeaker] = useState("doctor"); // "doctor" | "patient"
  const activeSpeakerRef = useRef("doctor"); // always tracks latest speaker for use in callbacks
  const [pendingAudio, setPendingAudio] = useState(null); // stores base64 audio from Sarvam TTS
  const [pendingText, setPendingText] = useState(null);
  
  // Processing state
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  
  // Data state
  const [transcript, setTranscript] = useState(""); // full Doctor:/Patient: log
  const [conversation, setConversation] = useState("");
  const [clinicalData, setClinicalData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [currentPatientId, setCurrentPatientId] = useState("PAT-992");
  
  // Lab Reports state
  const [labReports, setLabReports] = useState([]);
  const [analyzingIds, setAnalyzingIds] = useState(new Set());
  const [aiSummaries, setAiSummaries] = useState({});
  const [selectedManualTest, setSelectedManualTest] = useState("Blood Test");
  const [requestingLab, setRequestingLab] = useState(false);

  useEffect(() => {
    const savedId = localStorage.getItem("active_patient_id");
    if (savedId) {
      setCurrentPatientId(savedId);
      fetchLabReports(savedId);
    }
  }, []);

  useEffect(() => {
    // Basic auth check
    const session = localStorage.getItem("clinical_session");
    if (!session) {
      router.push("/");
    } else {
      const parsed = JSON.parse(session);
      if (parsed.role !== "doctor") router.push("/");
      setUser(parsed);
    }
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
    } catch (err) {
      setError("Microphone access denied or unavailable.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
  };

  const uploadAudioBLOB = useCallback(async (chunks) => {
    // Read activeSpeaker from ref to always get the latest value (avoids stale closure)
    const currentSpeaker = activeSpeakerRef.current;
    setProcessing(true);
    const audioBlob = new Blob(chunks, { type: "audio/webm" });
    const formData = new FormData();
    formData.append("file", audioBlob, "consultation.webm");
    formData.append("source_lang", currentSpeaker === "doctor" ? "hi-IN" : "kn-IN");
    formData.append("target_lang", currentSpeaker === "doctor" ? "kn-IN" : "en-IN");
    formData.append("patient_id", currentPatientId);
    formData.append("speaker", currentSpeaker);

    try {
      const res = await fetch("http://localhost:8000/upload-audio", {
        method: "POST",
        body: formData,
      });
      
      if (!res.ok) throw new Error("Voice processing failed. Check API connection.");
      const data = await res.json();
      
      const newLine = data.line || data.raw_transcript;
      setTranscript(prev => (prev ? `${prev}\n${newLine}` : newLine));
      setConversation(prev => (prev ? `${prev}\n${newLine}` : newLine));

      // Save the translated text/audio for TTS playback on toggle
      if (data.raw_transcript) {
        setPendingText(data.raw_transcript);
        
        // Fetch Sarvam TTS for the *other* person who will hear this
        // If doctor spoke, generate Kannada audio for patient.
        // If patient spoke, generate English audio for doctor.
        const ttsLang = currentSpeaker === "doctor" ? "kn-IN" : "en-IN";
        try {
          const ttsRes = await fetch("http://localhost:8000/api/text-to-speech", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              text: data.raw_transcript, 
              language_code: ttsLang 
            })
          });
          const ttsData = await ttsRes.json();
          if (ttsData.status === "success") {
            setPendingAudio(ttsData.audio_base64);
          }
        } catch (ttsErr) {
          console.error("Sarvam TTS generation failed:", ttsErr);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  }, [currentPatientId]);

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

  const handleRequestLabTest = async () => {
    if (!currentPatientId) return;
    setRequestingLab(true);
    try {
      const res = await fetch("http://localhost:8000/api/request-lab-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_id: currentPatientId,
          test_type: selectedManualTest,
          requested_by: user.user_id
        })
      });
      if (res.ok) {
        // Add to current draft if it exists
        if (clinicalData) {
          setClinicalData(prev => ({
            ...prev,
            lab_tests: [...(prev.lab_tests || []), `${selectedManualTest} - Pending Laboratory`]
          }));
        } else {
          // If no draft yet, start one with just this test
          setClinicalData({
            symptoms: [],
            diagnosis: "Pending",
            medication: "None",
            dosage: "None",
            lab_tests: [`${selectedManualTest} - Pending Laboratory`]
          });
        }
        alert(`Requested ${selectedManualTest} for ${currentPatientId}`);
      }
    } catch (err) {
      console.error("Failed to request lab test:", err);
    } finally {
      setRequestingLab(false);
    }
  };

  // Upload audio automatically once chunks are assembled
  // Pass chunks directly to avoid stale closure on audioChunks state
  useEffect(() => {
    if (!isRecording && audioChunks.length > 0) {
      uploadAudioBLOB(audioChunks);
      setAudioChunks([]); // Clear immediately to prevent re-trigger on re-renders
    }
  }, [isRecording, audioChunks, uploadAudioBLOB]);

  const handleSpeakerToggle = (newSpeaker) => {
    activeSpeakerRef.current = newSpeaker; // sync ref immediately
    setActiveSpeaker(newSpeaker);
    
    // Play Sarvam TTS if there's pending audio
    if (pendingAudio) {
      try {
        const audio = new Audio(`data:audio/wav;base64,${pendingAudio}`);
        audio.play();
        setPendingAudio(null);
        setPendingText(null);
      } catch (err) {
        console.error("Audio playback failed:", err);
      }
    }
  };

  const handleInputChange = (field, value) => {
    setClinicalData(prev => ({ ...prev, [field]: value }));
  };

  const handleArrayChange = (field, index, value) => {
    setClinicalData(prev => {
      const newArr = [...(prev[field] || [])];
      newArr[index] = value;
      return { ...prev, [field]: newArr };
    });
  };

  const addArrayItem = (field) => {
    setClinicalData(prev => ({
      ...prev,
      [field]: [...(prev[field] || []), ""]
    }));
  };

  const removeArrayItem = (field, index) => {
    setClinicalData(prev => ({
      ...prev,
      [field]: (prev[field] || []).filter((_, i) => i !== index)
    }));
  };

  const approveAndSign = async () => {
    setSaving(true);
    try {
      const payload = {
        patient_id: currentPatientId,
        symptoms: clinicalData.symptoms || [],
        diagnosis: clinicalData.diagnosis,
        medication: clinicalData.medication,
        dosage: clinicalData.dosage,
        lab_tests: clinicalData.lab_tests || [],
        raw_transcript: conversation || transcript
      };

      const res = await fetch("http://localhost:8000/api/approve-clinical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Failed to save and trigger workflow");
      
      // Cleanup UI
      setClinicalData(null);
      setTranscript("");
      setConversation("");
      alert("Consultation finalized! Pharmacy & Delta Lake workflow triggered.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200">
      <nav className="bg-neutral-900 border-b border-neutral-800 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Activity className="text-blue-500 w-6 h-6" />
          <h1 className="font-bold text-white tracking-wide">Doctor Workstation</h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push("/laboratory")}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-900/30 text-indigo-400 border border-indigo-800/50 rounded-lg text-sm hover:bg-indigo-900/50 transition-colors"
          >
            <FlaskConical className="w-4 h-4" />
            Lab reports
          </button>
          <span className="text-sm text-neutral-400">Dr. Smith ({user.user_id})</span>
          <button onClick={() => { localStorage.removeItem("clinical_session"); router.push("/"); }} className="text-sm text-red-400 hover:text-red-300">Logout</button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Column: Input Control */}
        <div className="space-y-6">
          <div className="bg-neutral-900 rounded-xl p-6 border border-neutral-800">
            <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" />
              Live Patient Consultation
            </h2>
            
            {/* Patient Confirmation Section */}
            <div className="mb-6 bg-neutral-950 p-4 rounded-lg border border-neutral-800">
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Confirm Patient ID</label>
              <div className="flex gap-3">
                <input 
                  type="text" 
                  value={currentPatientId}
                  onChange={(e) => {
                    const newId = e.target.value.toUpperCase();
                    setCurrentPatientId(newId);
                    localStorage.setItem("active_patient_id", newId);
                    window.dispatchEvent(new Event("patient_id_changed"));
                    fetchLabReports(newId);
                  }}
                  placeholder="e.g. PAT-992"
                  className="bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none w-full transition-all"
                />
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-900/20 text-blue-400 rounded-lg border border-blue-800/50 text-xs whitespace-nowrap">
                  <CheckCircle className="w-3.5 h-3.5" />
                  ID Verified
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-neutral-400">Active speaker:</span>
              <div className="inline-flex rounded-lg border border-neutral-700 bg-neutral-950 p-0.5">
                <button
                  type="button"
                  onClick={() => handleSpeakerToggle("doctor")}
                  className={`px-3 py-1 text-xs rounded-md ${
                    activeSpeaker === "doctor" ? "bg-blue-600 text-white" : "text-neutral-300"
                  }`}
                >
                  Doctor
                </button>
                <button
                  type="button"
                  onClick={() => handleSpeakerToggle("patient")}
                  className={`px-3 py-1 text-xs rounded-md ${
                    activeSpeaker === "patient" ? "bg-emerald-600 text-white" : "text-neutral-300"
                  }`}
                >
                  Patient
                </button>
              </div>
            </div>

            <div className="bg-neutral-950 p-8 rounded-lg border border-neutral-800 flex flex-col items-center justify-center min-h-[250px] shadow-inner relative">
              
              {isRecording && (
                <div className="absolute top-4 right-4 flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>
                  <span className="text-xs text-red-400 font-medium">Recording translated audio...</span>
                </div>
              )}

              <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onMouseLeave={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                disabled={processing}
                className={`p-6 rounded-full transition-all duration-300 shadow-xl ${
                  isRecording 
                    ? "bg-red-500/20 text-red-500 scale-110 border-2 border-red-500" 
                    : processing 
                      ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-500 hover:scale-105"
                }`}
              >
                <Mic className="w-10 h-10" />
              </button>
              <p className="mt-6 text-sm text-neutral-400 font-medium">
                Hold to capture {activeSpeaker === "doctor" ? "doctor" : "patient"} speech
              </p>
            </div>
            
            {error && <p className="text-red-400 text-sm mt-4 text-center">{error}</p>}
          </div>

          {(transcript || processing) && (
            <div className="bg-neutral-900 rounded-xl p-6 border border-neutral-800 shadow-lg">
              <h3 className="text-sm font-semibold text-neutral-400 mb-3 uppercase tracking-wider">
                Conversation Transcript (Doctor / Patient)
              </h3>
              <div className="bg-neutral-950 p-4 rounded border border-neutral-800 min-h-[100px] overflow-auto text-sm text-neutral-300 font-mono whitespace-pre-wrap">
                {processing ? (
                  <span className="animate-pulse text-blue-400">Transcribing via Sarvam AI...</span>
                ) : (
                  transcript
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: AI Extraction & Human Validation */}
        <div className="space-y-6">
          <div className="bg-neutral-900 rounded-xl p-6 border border-neutral-800 shadow-lg min-h-[600px] flex flex-col">
            <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-500" />
              Clinical Extraction Draft
            </h2>
            <p className="text-sm text-neutral-400 mb-4">
              Review the AI-generated JSON wrapper below before pushing to the Pharmacy Pipeline.
            </p>

            <button
              type="button"
              disabled={processing || !conversation}
              onClick={async () => {
                try {
                  setProcessing(true);
                  setError(null);
                  const res = await fetch("http://localhost:8000/api/generate-prescription", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                      conversation_text: conversation || transcript,
                      patient_id: currentPatientId 
                    }),
                  });
                  if (!res.ok) throw new Error("Failed to generate prescription from AI");
                  const data = await res.json();
                  setClinicalData(data.structured_data);
                } catch (err) {
                  setError(err.message);
                } finally {
                  setProcessing(false);
                }
              }}
              className="mb-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-600 text-emerald-400 text-sm hover:bg-emerald-600/10 disabled:opacity-50"
            >
              <ArrowRight className="w-4 h-4" />
              Send confirmed transcript to AI
            </button>

            {!clinicalData ? (
              <div className="flex-1 flex flex-col items-center justify-center text-neutral-600 space-y-4">
                <AlertCircle className="w-12 h-12 opacity-50" />
                <p>Awaiting clinical input...</p>
              </div>
            ) : (
              <div className="flex-1 space-y-5 overflow-auto pr-2 pb-6">
                
                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Diagnosis</label>
                  <input 
                    type="text" 
                    value={clinicalData.diagnosis === "Pending" ? "" : clinicalData.diagnosis}
                    onChange={(e) => handleInputChange('diagnosis', e.target.value)}
                    placeholder="Enter final diagnosis..."
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Medication</label>
                    <div className="relative">
                      <Pill className="w-4 h-4 text-neutral-500 absolute left-3 top-3.5" />
                      <input 
                        type="text" 
                        value={clinicalData.medication}
                        onChange={(e) => handleInputChange('medication', e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-3 pl-10 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Dosage</label>
                    <input 
                      type="text" 
                      value={clinicalData.dosage}
                      onChange={(e) => handleInputChange('dosage', e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Reported Symptoms</label>
                  <div className="space-y-2">
                    {clinicalData.symptoms?.map((sym, idx) => (
                      <input 
                        key={idx}
                        type="text" 
                        value={sym}
                        onChange={(e) => handleArrayChange('symptoms', idx, e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2.5 text-sm text-neutral-300 focus:border-blue-500 outline-none"
                      />
                    ))}
                    {(!clinicalData.symptoms || clinicalData.symptoms.length === 0) && (
                      <p className="text-xs text-neutral-500 italic">No symptoms extracted.</p>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider">Requested Lab Tests</label>
                    <button 
                      onClick={() => addArrayItem('lab_tests')}
                      className="text-[10px] text-blue-400 hover:text-blue-300 font-bold"
                    >
                      + Add Manual
                    </button>
                  </div>
                  <div className="space-y-2">
                    {clinicalData.lab_tests?.map((lab, idx) => (
                      <div key={idx} className="flex gap-2">
                        <input 
                          type="text" 
                          value={lab}
                          onChange={(e) => handleArrayChange('lab_tests', idx, e.target.value)}
                          className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2.5 text-sm text-neutral-300 focus:border-blue-500 outline-none"
                        />
                        <button 
                          onClick={() => removeArrayItem('lab_tests', idx)}
                          className="p-2 text-neutral-500 hover:text-red-400 transition-colors"
                        >
                          <AlertCircle className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <div className="mt-4 pt-4 border-t border-neutral-800">
                      <label className="block text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">Quick Request</label>
                      <div className="flex gap-2">
                        <select 
                          value={selectedManualTest}
                          onChange={(e) => setSelectedManualTest(e.target.value)}
                          className="flex-1 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none"
                        >
                          <option>Blood Test</option>
                          <option>Sugar Test</option>
                          <option>Hemoglobin</option>
                          <option>Cholesterol</option>
                        </select>
                        <button 
                          onClick={handleRequestLabTest}
                          disabled={requestingLab}
                          className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-4 py-2 rounded-lg font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                          {requestingLab ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                          Request
                        </button>
                      </div>
                    </div>
                    {(!clinicalData.lab_tests || clinicalData.lab_tests.length === 0) && !clinicalData.lab_tests.some(t => t === "") && (
                      <p className="text-xs text-neutral-500 italic">No lab tests requested.</p>
                    )}
                  </div>
                </div>

              </div>
            )}
            
            {clinicalData && (
              <button
                onClick={approveAndSign}
                disabled={saving}
                className="mt-4 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium p-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <>Processing Delta Lake Write...</>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Approve & Sign Record
                  </>
                )}
              </button>
            )}
          </div>

          {/* Patient Lab Reports Section */}
          <div className="bg-neutral-900 rounded-xl p-6 border border-neutral-800 shadow-lg">
            <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-indigo-500" />
              Patient Lab Reports
            </h2>

            {labReports.length === 0 ? (
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-8 text-center">
                <FlaskConical className="w-10 h-10 text-neutral-700 mx-auto mb-3 opacity-50" />
                <p className="text-sm text-neutral-500 italic">No laboratory reports found for this patient.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {labReports.map((report) => (
                  <div key={report.report_id} className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
                    <div className="p-3 bg-neutral-900/50 border-b border-neutral-800 flex justify-between items-center">
                      <div>
                        <h3 className="font-bold text-white uppercase text-[11px] tracking-wider">{report.report_type}</h3>
                        <p className="text-[10px] text-neutral-500 font-mono">{report.date}</p>
                      </div>
                      <div className="flex gap-2">
                        {report.file_path && (
                          <button 
                            onClick={() => window.open(`http://localhost:8000/data/raw_clinical/${report.file_path}`, '_blank')}
                            className="text-[10px] bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-2 py-1 rounded-md font-medium flex items-center gap-1.5 transition-colors border border-neutral-700"
                          >
                            <FileText className="w-3 h-3"/>
                            Full Report
                          </button>
                        )}
                        <button 
                          onClick={() => analyzeLabReport(report)}
                          disabled={analyzingIds.has(report.report_id)}
                          className="text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded-md font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          {analyzingIds.has(report.report_id) ? <RefreshCw className="w-3 h-3 animate-spin"/> : <Search className="w-3 h-3"/>}
                          {aiSummaries[report.report_id] ? "Re-analyze" : "AI Review"}
                        </button>
                      </div>
                    </div>
                    
                    <div className="p-4">
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                          <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Metrics</h4>
                          <div className="grid grid-cols-2 gap-2">
                            {report.lab_tests.map((test, i) => (
                              <div key={i} className="flex flex-col gap-1 bg-neutral-900 p-2 rounded border border-neutral-800">
                                <span className="text-[11px] text-neutral-400 truncate">{test.test_name}</span>
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-white font-bold">{test.value}</span>
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${
                                    test.status === "NORMAL" ? "text-emerald-500" : 
                                    test.status === "HIGH" || test.status === "LOW" ? "text-amber-500" :
                                    "text-red-500"
                                  }`}>
                                    {test.status}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* AI Summary Sidebar */}
                        {aiSummaries[report.report_id] && (
                          <div className="mt-2 pt-3 border-t border-neutral-800">
                            <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5 mb-2">
                              <Activity className="w-3 h-3" /> AI Insight
                            </h4>
                            <div className="bg-indigo-950/20 border border-indigo-900/30 rounded-lg p-2.5">
                              <p className="text-[11px] text-neutral-300 italic mb-2 leading-relaxed">
                                {aiSummaries[report.report_id].summary}
                              </p>
                              <div className="flex gap-4">
                                <span className="text-[10px] font-bold">
                                  Risk: <span className={aiSummaries[report.report_id].risk_level === 'High' ? 'text-red-400' : 'text-emerald-400'}>
                                    {aiSummaries[report.report_id].risk_level}
                                  </span>
                                </span>
                                <span className="text-[10px] text-neutral-400">
                                  Rec: {aiSummaries[report.report_id].recommendation}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
