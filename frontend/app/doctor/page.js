"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Mic, ArrowRight, Save, Activity, CheckCircle, AlertCircle, FileText, Pill } from "lucide-react";

export default function DoctorPortal() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  
  // Audio state
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const [activeSpeaker, setActiveSpeaker] = useState("doctor"); // "doctor" | "patient"
  const activeSpeakerRef = useRef("doctor"); // always tracks latest speaker for use in callbacks
  const [pendingTranslation, setPendingTranslation] = useState(null);
  
  // Processing state
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  
  // Data state
  const [transcript, setTranscript] = useState(""); // full Doctor:/Patient: log
  const [conversation, setConversation] = useState("");
  const [clinicalData, setClinicalData] = useState(null);
  const [saving, setSaving] = useState(false);

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
    formData.append("target_lang", "en-IN");
    formData.append("patient_id", "PAT-992");
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

      // Save the translated text for TTS playback on toggle
      if (data.raw_transcript) {
        setPendingTranslation(data.raw_transcript);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  }, []);

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
    
    // Play TTS if there's pending translation
    if (pendingTranslation && typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        const utter = new SpeechSynthesisUtterance(pendingTranslation);
        // Kannada if patient selected, English if doctor selected
        utter.lang = newSpeaker === "patient" ? "kn-IN" : "en-IN";
        window.speechSynthesis.speak(utter);
        setPendingTranslation(null); // Clear after playing
      } catch (err) {
        console.error("TTS playback failed:", err);
      }
    }
  };

  const handleInputChange = (field, value) => {
    setClinicalData(prev => ({ ...prev, [field]: value }));
  };

  const handleArrayChange = (field, index, value) => {
    setClinicalData(prev => {
      const newArr = [...prev[field]];
      newArr[index] = value;
      return { ...prev, [field]: newArr };
    });
  };

  const approveAndSign = async () => {
    setSaving(true);
    try {
      const payload = {
        patient_id: "PAT-992",
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
          <span className="text-sm text-neutral-400">Dr. Smith ({user.user_id})</span>
          <button onClick={() => { localStorage.removeItem("clinical_session"); router.push("/"); }} className="text-sm text-red-400 hover:text-red-300">Logout</button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Column: Input Control */}
        <div className="space-y-6">
          <div className="bg-neutral-900 rounded-xl p-6 border border-neutral-800">
            <h2 className="text-lg font-semibold text-white mb-4">Live Patient Consultation</h2>
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
                    body: JSON.stringify({ conversation_text: conversation || transcript }),
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
                  <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Requested Lab Tests</label>
                  <div className="space-y-2">
                    {clinicalData.lab_tests?.map((lab, idx) => (
                      <input 
                        key={idx}
                        type="text" 
                        value={lab}
                        onChange={(e) => handleArrayChange('lab_tests', idx, e.target.value)}
                        className="w-full bg-neutral-950 border border-neutral-700 rounded-lg p-2.5 text-sm text-neutral-300 focus:border-blue-500 outline-none"
                      />
                    ))}
                    {(!clinicalData.lab_tests || clinicalData.lab_tests.length === 0) && (
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
        </div>
      </main>
    </div>
  );
}
