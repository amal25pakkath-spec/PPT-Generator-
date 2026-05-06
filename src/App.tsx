import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Sparkles, 
  Download, 
  Presentation, 
  Loader2, 
  ChevronRight, 
  ChevronLeft,
  Settings,
  Edit2,
  Check,
  X,
  Palette,
  GraduationCap,
  Layers,
  User,
  School,
  Hash,
  Image as ImageIcon,
  MessageCircle,
  Clock,
  ArrowRight,
  Plus,
  Upload,
  Camera,
  Type as TypeIcon,
  Trash2,
  Users,
  FileText,
  Link,
  FileDown,
  Monitor,
  Search,
  Eye,
  Lock,
  Zap
} from "lucide-react";
import { generatePresentation, generateImage, PresentationData, SlideData, CustomContent } from "./lib/gemini";
import { exportToPptx } from "./lib/pptx";
import { cn } from "./lib/utils";
import { ImageAssistantModal } from "./components/ImageAssistantModal";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { 
  db
} from "./lib/firebase";
import { 
  doc, 
  onSnapshot, 
  updateDoc, 
  increment, 
  setDoc, 
  collection, 
  addDoc, 
  serverTimestamp 
} from "firebase/firestore";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: "guest",
      email: "guest",
      emailVerified: false,
      isAnonymous: true,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const THEME_COLORS = [
  { name: "Yellow", value: "#f59e0b" },
  { name: "Teal", value: "#0f766e" },
  { name: "Emerald", value: "#059669" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Red", value: "#ef4444" },
  { name: "Rose", value: "#e11d48" },
];

type Step = "landing" | "metadata" | "blueprint" | "editor";

export default function App() {
  const [step, setStep] = useState<Step>("landing");
  const [topic, setTopic] = useState("");
  const [numSlides, setNumSlides] = useState(5);
  const [style, setStyle] = useState("Professional");
  const [eduLevel, setEduLevel] = useState("University");
  const [userRole, setUserRole] = useState<"Student" | "Professional" | "Teacher">("Student");
  const [complexity, setComplexity] = useState("Medium");
  const [themeColor, setThemeColor] = useState("#f59e0b");
  const [addImages, setAddImages] = useState(false);
  const [imagePlacement, setImagePlacement] = useState<"bottom" | "top" | "left" | "right" | "auto">("auto");
  
  // Student Metadata
  const [studentName, setStudentName] = useState("");
  const [batch, setBatch] = useState("");
  const [institution, setInstitution] = useState("");

  const [loading, setLoading] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [data, setData] = useState<PresentationData | null>(null);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  
  // AI Image States
  const [slideImages, setSlideImages] = useState<Record<number, string>>({});
  const [activeImageSlideIndex, setActiveImageSlideIndex] = useState<number | null>(null);
  const [showImageAssistant, setShowImageAssistant] = useState(false);

  // Custom Content States
  const [customContents, setCustomContents] = useState<CustomContent[]>([]);
  const [visualTemplate, setVisualTemplate] = useState<string | null>(null);
  const [showContentModal, setShowContentModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [contentType, setContentType] = useState<'text' | 'image'>('text');
  const [contentData, setContentData] = useState("");
  const [targetSlide, setTargetSlide] = useState(1);
  const [processMode, setProcessMode] = useState<'exact' | 'bullet'>('bullet');
  const [cameraActive, setCameraActive] = useState(false);

  // Stats States
  const [stats, setStats] = useState({ totalUsers: 0, totalPresentations: 0 });

  useEffect(() => {
    // Global Stats
    const statsDocRef = doc(db, "stats", "counters");
    const unsubscribeStats = onSnapshot(statsDocRef, (snapshot) => {
      if (snapshot.exists()) {
        setStats(snapshot.data() as any);
      }
    });

    return () => {
      unsubscribeStats();
    };
  }, []);

  const readingTimeEstimate = useMemo(() => {
    if (!data) return null;
    let wordCount = 0;
    data.slides.forEach(slide => {
      wordCount += slide.title.split(/\s+/).length;
      slide.content.forEach(point => {
        wordCount += point.split(/\s+/).length;
      });
    });
    
    const minutes = wordCount / 145;
    const min = Math.floor(minutes);
    const max = Math.ceil(minutes * 1.2); // Add some buffer
    return { min, max, wordCount };
  }, [data]);

  const incrementPresentationCount = async () => {
    try {
      const statsDocRef = doc(db, "stats", "counters");
      
      // Attempt update with a fast-fail catch
      await updateDoc(statsDocRef, {
        totalPresentations: increment(1)
      }).catch(async (err) => {
        console.warn("UpdateDoc failed, attempting setDoc:", err);
        await setDoc(statsDocRef, { totalPresentations: increment(1) }, { merge: true });
      });
    } catch (error) {
      // Don't use handleFirestoreError here as we don't want to show a fatal error to the user
      console.warn('Silent Stats Error: ', error);
    }
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!topic.trim()) return;

    const controller = new AbortController();
    setAbortController(controller);
    setLoading(true);
    setGenerationProgress(10);
    
    const progressInterval = setInterval(() => {
      setGenerationProgress(prev => {
        if (prev < 85) return prev + Math.random() * 2;
        return prev;
      });
    }, 300);
    
    try {
      // Small Delay for UX
      await new Promise(r => setTimeout(r, 800));
      if (controller.signal.aborted) return;
      setGenerationProgress(25);

      const result = await generatePresentation(topic, { 
        numSlides, 
        style, 
        eduLevel, 
        complexity,
        studentName,
        batch,
        institution,
        customContent: customContents,
        visualTemplate: visualTemplate || undefined
      });
      
      if (controller.signal.aborted) return;

      clearInterval(progressInterval);
      setGenerationProgress(90);
      await new Promise(r => setTimeout(r, 500));

      if (result.suggestedThemeColor) {
        setThemeColor(result.suggestedThemeColor);
      }
      
      // Fire and forget stats update
      setTimeout(() => {
        incrementPresentationCount().catch(e => console.warn("Silent stats fail", e));
      }, 0);
      
      setGenerationProgress(100);
      await new Promise(r => setTimeout(r, 400));

      setData(result);
      setStep("editor");
      setCurrentSlideIndex(0);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Generation cancelled by user');
        return;
      }
      console.error(error);
      alert("Something went wrong. Please try again.");
    } finally {
      clearInterval(progressInterval);
      setLoading(false);
      setGenerationProgress(0);
      setAbortController(null);
    }
  };

  const handleCancelGeneration = () => {
    if (abortController) {
      abortController.abort();
      setLoading(false);
      setGenerationProgress(0);
      setAbortController(null);
    }
  };

  const handleCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      
      const dataUrl = canvas.toDataURL('image/png');
      setContentData(dataUrl);
      setContentType('image');
      
      stream.getTracks().forEach(track => track.stop());
      setCameraActive(false);
    } catch (err) {
      console.error(err);
      alert("Camera access denied or failed.");
    }
  };

  const addContentToBench = () => {
    if (!contentData.trim() && contentType === 'text') return;
    const newContent: CustomContent = {
      type: contentType,
      data: contentData,
      targetSlide,
      mode: processMode
    };
    setCustomContents([...customContents, newContent]);
    setShowContentModal(false);
    setContentData("");
  };

  const handleLocalImageUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check file size (optional, e.g., 5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      alert("File is too large. Please select an image under 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setSlideImages(prev => ({ ...prev, [index]: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const openImageAssistant = (index: number) => {
    setActiveImageSlideIndex(index);
    setShowImageAssistant(true);
  };

  const [viewMode, setViewMode] = useState<'single' | 'gallery'>('gallery');

  const handleUpdateSlideAt = (index: number, updatedSlide: SlideData) => {
    if (!data) return;
    const newSlides = [...data.slides];
    newSlides[index] = updatedSlide;
    setData({ ...data, slides: newSlides });
  };

  const handleExport = async () => {
    if (!data) return;
    try {
      await exportToPptx(data, themeColor, slideImages);
    } catch (error) {
      console.error(error);
      alert("Failed to export. Please try again.");
    }
  };

  const handleExportPdf = async () => {
    if (!data) return;
    setLoading(true);
    try {
      const pdf = new jsPDF("l", "pt", "a4");
      const elements = document.querySelectorAll(".slide-preview-card");
      
      for (let i = 0; i < elements.length; i++) {
        const canvas = await html2canvas(elements[i] as HTMLElement, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff"
        });
        const imgData = canvas.toDataURL("image/png");
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      }
      
      pdf.save(`${data.title.replace(/\s+/g, "_")}.pdf`);
    } catch (error) {
      console.error(error);
      alert("Failed to export PDF. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-bg text-ink mesh-gradient selection:bg-brand/20">
      {/* Navbar */}
      <nav className="h-20 px-8 flex items-center justify-between glass sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-colors"
            style={{ backgroundColor: themeColor }}
          >
            <Presentation className="text-white w-6 h-6" />
          </div>
          <span className="font-display font-bold text-2xl tracking-tighter">SlideCraft<span style={{ color: themeColor }}>AI</span></span>
        </div>
        <div className="flex items-center gap-4">
          {step !== "landing" && (
            <button 
              onClick={() => { setStep("landing"); setData(null); setSlideImages({}); }}
              className="text-xs font-black uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity flex items-center gap-2"
            >
              <X className="w-4 h-4" /> Reset
            </button>
          )}
          <div className="w-10 h-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full flex items-center justify-center shadow-sm">
            <User className="w-5 h-5 opacity-40" />
          </div>
        </div>
      </nav>

      <main className="flex-1 flex flex-col">
        <AnimatePresence>
          {loading && (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-white/90 dark:bg-slate-900/90 backdrop-blur-3xl flex flex-col items-center justify-center p-8 space-y-12"
            >
              <div className="relative w-48 h-48 flex items-center justify-center">
                 <svg className="w-full h-full -rotate-90">
                    <circle 
                       cx="96" cy="96" r="88" 
                       className="stroke-slate-100 dark:stroke-slate-800 fill-none stroke-[8]" 
                    />
                    <motion.circle 
                       cx="96" cy="96" r="88" 
                       className="stroke-brand fill-none stroke-[8]" 
                       style={{ 
                          pathLength: generationProgress / 100,
                          strokeLinecap: "round"
                       }}
                       transition={{ duration: 0.5 }}
                    />
                 </svg>
                 <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-5xl font-black text-brand">{generationProgress}%</div>
                 </div>
              </div>
              <div className="space-y-4 text-center max-w-sm">
                 <h3 className="text-2xl font-display font-bold">SlideCraft AI is Building...</h3>
                 <p className="text-sm font-medium text-ink/40 dark:text-slate-400 leading-relaxed">
                   {generationProgress < 40 ? "Analyzing your topic blueprint..." : 
                    generationProgress < 70 ? "Synthesizing academic content..." : 
                    "Finalizing slides & visual layout..."}
                 </p>
              </div>

              <div className="flex flex-col items-center gap-6">
                <div className="w-64 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                   <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${generationProgress}%` }}
                      className="h-full bg-brand"
                   />
                </div>

                <button 
                  onClick={handleCancelGeneration}
                  className="px-6 py-2 rounded-full border border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase tracking-widest opacity-40 hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-100 transition-all"
                >
                  Cancel Generation
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {step === "landing" && (
            <motion.div 
              key="landing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col lg:flex-row min-h-0 w-full relative overflow-hidden bg-[#fcfcfb]"
            >
              {/* Left Side: Bold Report Style */}
              <div className="flex-1 flex flex-col justify-center p-12 lg:p-24 space-y-12 bg-white relative z-10 w-full lg:w-3/5">
                <div className="space-y-4">
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-2"
                  >
                    <div 
                      className="w-12 h-10 border-2 border-slate-900 flex items-center justify-center rounded-md bg-white shadow-[4px_4px_0px_0px_rgba(245,158,11,1)] group cursor-pointer hover:translate-y-[-2px] hover:shadow-[6px_6px_0px_0px_rgba(245,158,11,1)] transition-all"
                      title="SlideCraft AI Logo"
                    >
                      <div className="absolute top-1 left-1 w-2 h-0.5 bg-slate-900 rounded-full opacity-20" />
                      <span className="text-slate-900 font-black text-sm tracking-tighter">AI</span>
                    </div>
                    <span className="font-display font-bold text-xl tracking-tighter text-slate-900">Inno-AI Master</span>
                  </motion.div>
                  
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-1"
                  >
                    <h1 className="text-[60px] lg:text-[80px] font-display font-black leading-[0.9] tracking-[-0.04em] text-slate-900">
                      2026<br />
                      Inno-Ai<br />
                      Slides Master.
                    </h1>
                  </motion.div>
 
                  <motion.p 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="max-w-md text-lg font-bold text-slate-500/60 uppercase tracking-widest leading-tight"
                  >
                    Create your ppt slides with in seconds.
                  </motion.p>
                </div>

                <div className="pt-16 md:pt-32">
                   <div className="text-[11px] font-black uppercase tracking-[0.3em] text-[#0f172a] mb-2">
                     Presented By : {studentName || "SlideCraft Intelligence"}
                   </div>
                   <div className="h-0.5 w-12 bg-brand" />
                </div>
              </div>

              {/* Right Side: Yellow Interaction Zone */}
              <div className="w-full lg:w-2/5 bg-[#facc15] relative flex items-center justify-center p-8 lg:p-16">
                {/* Geometric Cutout Decoration */}
                <div className="absolute top-0 left-0 w-32 h-full bg-white -translate-x-1/2 -rotate-6 origin-top hidden lg:block" />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full h-fit relative z-10">
                  {/* Student Workspace (Active) */}
                  <motion.button
                    whileHover={{ y: -8, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { setUserRole("Student"); setStep("metadata"); }}
                    className="aspect-square bg-white rounded-[2rem] p-6 shadow-xl flex flex-col justify-between text-left group transition-all border border-brand/10 relative overflow-hidden"
                  >
                    <img 
                      src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&q=80&w=800" 
                      alt="Student"
                      className="absolute inset-0 w-full h-full object-cover opacity-20 group-hover:opacity-30 transition-opacity"
                    />
                    <div className="space-y-1 relative z-10">
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                        <GraduationCap className="w-3 h-3" /> Students
                      </div>
                      <h3 className="text-xl font-display font-bold text-slate-900 leading-none">Student<br />Suite</h3>
                    </div>
                    <div className="flex items-end justify-between relative z-10">
                       <div className="w-12 h-12 rounded-2xl bg-brand/10 flex items-center justify-center">
                          <GraduationCap className="w-6 h-6 text-brand" />
                       </div>
                       <div className="text-[8px] font-bold text-brand uppercase tracking-widest">Unlocked</div>
                    </div>
                  </motion.button>

                  {/* Professional Workspace (Locked) */}
                  <div className="aspect-square bg-brand rounded-[2rem] p-6 shadow-xl flex flex-col justify-between text-left text-white opacity-95 group relative overflow-hidden grayscale border border-white/20">
                    <img 
                      src="https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&q=80&w=800" 
                      alt="Business"
                      className="absolute inset-0 w-full h-full object-cover opacity-10"
                    />
                    <div className="space-y-1 relative z-10">
                      <div className="text-[9px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2">
                        <Users className="w-3 h-3" /> Professionals
                      </div>
                      <h3 className="text-xl font-display font-bold text-white leading-none">Business<br />Decks</h3>
                    </div>
                    <div className="flex items-end justify-between relative z-10">
                       <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
                          <Users className="w-6 h-6" />
                       </div>
                       <Lock className="w-4 h-4 opacity-40" />
                    </div>
                  </div>

                  {/* Teacher Workspace (Locked) */}
                  <div className="aspect-square bg-white rounded-[2rem] p-6 shadow-xl flex flex-col justify-between text-left border border-slate-100 opacity-90 grayscale relative overflow-hidden">
                    <img 
                      src="https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&q=80&w=800"
                      alt="Teacher"
                      className="absolute inset-0 w-full h-full object-cover opacity-10"
                    />
                    <div className="space-y-1 relative z-10">
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                        <School className="w-3 h-3" /> Teachers
                      </div>
                      <h3 className="text-xl font-display font-bold text-slate-900 leading-none">Educator<br />Tools</h3>
                    </div>
                    <div className="flex items-end justify-between relative z-10">
                       <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                          <School className="w-6 h-6 text-slate-400" />
                       </div>
                       <div className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">Locked</div>
                    </div>
                  </div>

                  {/* Stats Card */}
                  <div className="aspect-square bg-[#0f172a] rounded-[2rem] p-6 shadow-xl flex flex-col justify-center items-center text-center space-y-2">
                    <div className="text-3xl font-display font-bold text-[#facc15]">{stats.totalPresentations || "4.8k"}</div>
                    <div className="text-[8px] font-black uppercase tracking-[0.2em] text-white/40 leading-tight">Reports<br />Generated</div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {step === "metadata" && (
            <motion.div 
              key="metadata"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex flex-col items-center justify-center p-8 max-w-2xl mx-auto w-full"
            >
              <div className="w-full bg-white/70 p-16 rounded-[4rem] border border-white shadow-[0_60px_100px_-20px_rgba(0,0,0,0.1)] backdrop-blur-3xl space-y-12 text-center">
                 <div className="space-y-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 text-amber-600 text-[8px] font-black uppercase tracking-widest outline outline-1 outline-amber-100 mb-2">
                       {userRole === "Student" ? <GraduationCap className="w-3 h-3" /> : userRole === "Teacher" ? <School className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                       {userRole} Profile
                    </div>
                    <h2 className="text-4xl font-display font-bold tracking-tight">Identity Details</h2>
                    <p className="text-sm font-medium text-ink/40">Tell us who you are so we can personalize your deck's title slide.</p>
                 </div>

                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4 mb-2">
                       <div className="bg-white/50 border border-white rounded-3xl p-6 text-center shadow-sm">
                          <div className="flex items-center justify-center gap-2 mb-1">
                             <Users className="w-3 h-3 opacity-40" />
                             <span className="text-[8px] font-black uppercase tracking-widest opacity-40">Users</span>
                          </div>
                          <div className="text-xl font-display font-bold">{stats.totalUsers || "—"}</div>
                       </div>
                       <div className="bg-white/50 border border-white rounded-3xl p-6 text-center shadow-sm">
                          <div className="flex items-center justify-center gap-2 mb-1">
                             <Presentation className="w-3 h-3 opacity-40" />
                             <span className="text-[8px] font-black uppercase tracking-widest opacity-40">Global</span>
                          </div>
                          <div className="text-xl font-display font-bold">{stats.totalPresentations || "—"}</div>
                       </div>
                    </div>

                    <div className="relative">
                      <User className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 opacity-30" />
                      <input 
                        required
                        placeholder={userRole === "Student" ? "Full Name" : userRole === "Teacher" ? "Lecturer Name" : "Professional Name"}
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        className="w-full h-18 bg-white border border-slate-100 rounded-3xl px-16 font-bold text-lg focus:outline-none focus:border-brand shadow-sm" 
                      />
                    </div>
                    <div className="relative">
                      <Hash className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 opacity-30" />
                      <input 
                        required
                        placeholder={userRole === "Student" ? "Batch / ID" : userRole === "Teacher" ? "Dept / Batch" : "Designation / Dept"}
                        value={batch}
                        onChange={(e) => setBatch(e.target.value)}
                        className="w-full h-18 bg-white border border-slate-100 rounded-3xl px-16 font-bold text-lg focus:outline-none focus:border-brand shadow-sm" 
                      />
                    </div>
                    <div className="relative">
                      <School className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 opacity-30" />
                      <input 
                        required
                        placeholder={userRole === "Student" || userRole === "Teacher" ? "Educational Institution" : "Company / Organization"}
                        value={institution}
                        onChange={(e) => setInstitution(e.target.value)}
                        className="w-full h-18 bg-white border border-slate-100 rounded-3xl px-16 font-bold text-lg focus:outline-none focus:border-brand shadow-sm" 
                      />
                    </div>
                 </div>

                 <div className="flex gap-4">
                    <button 
                      onClick={() => setStep("landing")}
                      className="px-8 h-18 rounded-3xl font-black text-xs uppercase tracking-widest opacity-40 hover:bg-slate-50 transition-all"
                    >
                      Back
                    </button>
                    <button 
                      onClick={() => {
                        if (studentName && batch && institution) {
                          setStep("blueprint");
                        }
                      }}
                      disabled={!studentName || !batch || !institution}
                      className="flex-1 h-18 rounded-3xl bg-brand text-white font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:translate-y-[-2px] transition-all disabled:opacity-30"
                    >
                      Next: Build Blueprint
                    </button>
                 </div>
              </div>
            </motion.div>
          )}

          {step === "blueprint" && (
            <motion.div 
              key="blueprint"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 flex flex-col items-center justify-center p-8 max-w-5xl mx-auto w-full"
            >
              <div className="w-full bg-white/70 p-12 rounded-[4rem] border border-white shadow-[0_60px_100px_-20px_rgba(0,0,0,0.1)] backdrop-blur-3xl space-y-12 relative overflow-hidden">
                <div className="absolute top-10 left-10">
                   <button 
                     onClick={() => setStep("metadata")}
                     className="text-[10px] font-black uppercase tracking-widest opacity-20 hover:opacity-100 flex items-center gap-2 transition-opacity"
                   >
                     <ChevronLeft className="w-4 h-4" /> Identity Details
                   </button>
                </div>

                <div className="text-center space-y-2">
                  <h2 className="text-4xl font-display font-bold tracking-tight">Presentation Blueprint</h2>
                  <p className="text-sm font-medium text-ink/40">Adjust your requirements to help our AI engineer the perfect deck.</p>
                </div>

                <form onSubmit={handleGenerate} className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-10">
                  {/* General Config */}
                  <div className="space-y-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Presentation Topic</label>
                      <input
                        required
                        type="text"
                        value={topic}
                        onChange={(e) => setTopic(e.target.value)}
                        placeholder="E.g., Revolutionary AI Trends in 2026"
                        className="w-full h-16 bg-white border border-slate-100 rounded-2xl px-8 font-bold text-lg focus:outline-none focus:border-brand shadow-sm transition-all"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Slides (Max 9)</label>
                        <div className="relative">
                          <Layers className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-30" />
                          <input
                            type="number"
                            min="3"
                            max="9"
                            value={numSlides}
                            onChange={(e) => setNumSlides(Math.min(9, Math.max(3, Number(e.target.value))))}
                            className="w-full h-14 bg-white border border-slate-100 rounded-2xl px-12 font-bold text-sm focus:outline-none"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Complexity</label>
                        <select 
                          value={complexity}
                          onChange={(e) => setComplexity(e.target.value)}
                          className="w-full h-14 bg-white border border-slate-100 rounded-2xl px-4 font-bold text-sm focus:outline-none cursor-pointer"
                        >
                          {["Simple", "Medium", "Complex"].map(l => <option key={l} value={l}>{l} Detail</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Visual Theme Color</label>
                      <div className="flex flex-wrap gap-4">
                        {THEME_COLORS.map(c => (
                          <button
                            key={c.name}
                            type="button"
                            onClick={() => setThemeColor(c.value)}
                            className={cn(
                              "w-10 h-10 rounded-full border-4 transition-all hover:scale-110",
                              themeColor === c.value ? "border-slate-800 scale-110 shadow-lg" : "border-white"
                            )}
                            style={{ backgroundColor: c.value }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-8">
                    <label className="flex items-center gap-4 group cursor-pointer">
                       <div className="relative">
                         <input 
                           type="checkbox" 
                           checked={addImages} 
                           onChange={(e) => setAddImages(e.target.checked)}
                           className="sr-only" 
                         />
                         <div className={cn(
                           "w-12 h-6 rounded-full transition-colors",
                           addImages ? "bg-amber-400" : "bg-slate-200"
                         )} />
                         <div className={cn(
                           "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform",
                           addImages ? "translate-x-7" : "translate-x-1"
                         )} />
                       </div>
                       <span className="text-xs font-black uppercase tracking-widest opacity-60">Reserve Space for AI Images</span>
                    </label>

                    {/* Knowledge & Template */}
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                           <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Asset Bench</label>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                           <button
                             type="button"
                             onClick={() => setShowTemplateModal(true)}
                             className={cn(
                               "h-24 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 overflow-hidden transition-all",
                               visualTemplate ? "border-amber-200 bg-amber-50/20" : "border-slate-100 hover:bg-slate-50"
                             )}
                           >
                             {visualTemplate ? (
                               <img src={visualTemplate} className="w-full h-full object-cover opacity-60" referrerPolicy="no-referrer" />
                             ) : (
                               <>
                                 <Palette className="w-5 h-5 opacity-20" />
                                 <span className="text-[8px] font-black uppercase tracking-widest opacity-40">Style Template</span>
                               </>
                             )}
                           </button>
                           <button
                             type="button"
                             onClick={() => setShowContentModal(true)}
                             className={cn(
                               "h-24 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 overflow-hidden transition-all",
                               customContents.length > 0 ? "border-brand/20 bg-brand/5" : "border-slate-100 hover:bg-slate-50"
                             )}
                           >
                             <div className="flex items-center gap-1">
                               <Plus className="w-4 h-4 opacity-40" />
                               {customContents.length > 0 && <span className="bg-brand text-white text-[8px] px-1.5 py-0.5 rounded-full">{customContents.length}</span>}
                             </div>
                             <span className="text-[8px] font-black uppercase tracking-widest opacity-40">Add Research</span>
                           </button>
                        </div>
                    </div>

                    {addImages && (
                      <div className="space-y-4 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-3xl animate-in fade-in slide-in-from-top-2">
                        <label className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2 block">Image Placement</label>
                        <div className="grid grid-cols-5 gap-2">
                          {[
                            { id: 'auto', label: 'Auto' },
                            { id: 'top', label: 'Up' },
                            { id: 'bottom', label: 'Bottom' },
                            { id: 'left', label: 'Left' },
                            { id: 'right', label: 'Right' },
                          ].map((pos) => (
                            <button
                              key={pos.id}
                              type="button"
                              onClick={() => setImagePlacement(pos.id as any)}
                              className={cn(
                                "h-10 rounded-xl text-[8px] font-black uppercase tracking-widest border transition-all",
                                imagePlacement === pos.id ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-100 text-ink/40"
                              )}
                            >
                              {pos.label}
                            </button>
                          ))}
                        </div>
                        <p className="text-[8px] font-medium opacity-40 italic">Note: Auto adjusts based on content density.</p>
                      </div>
                    )}

                    <div className="pt-4 border-t border-slate-100">
                      <button
                        type="submit"
                        disabled={loading || !topic.trim()}
                        className="w-full h-20 rounded-[2rem] text-white font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-4 shadow-2xl transition-all hover:translate-y-[-4px] active:scale-95 disabled:opacity-50"
                        style={{ backgroundColor: themeColor, boxShadow: `0 20px 40px -10px ${themeColor}66` }}
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-6 h-6 animate-spin" />
                            Synthesizing...
                          </>
                        ) : (
                          <>
                            Commence generation
                            <Sparkles className="w-5 h-5" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </motion.div>
          )}

          {step === "editor" && data && (
            <motion.div 
              key="editor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col p-8 max-w-7xl mx-auto w-full"
            >
              <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-1">
                  <div className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">Workspace // {viewMode === 'gallery' ? 'Gallary Overview' : `Slide ${currentSlideIndex + 1}`}</div>
                  <h2 className="text-4xl font-display font-bold tracking-tight mb-2 leading-none">{data.title}</h2>
                </div>
                <div className="flex items-center gap-3">
                   <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-1 rounded-2xl flex items-center gap-1 shadow-sm mr-4">
                      <button 
                        onClick={() => setViewMode('gallery')}
                        className={cn(
                          "px-4 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                          viewMode === 'gallery' ? "bg-slate-900 text-white" : "text-ink/40 hover:bg-slate-50 dark:hover:bg-slate-700 font-bold"
                        )}
                      >
                        <Layers className="w-3 h-3" /> Gallery
                      </button>
                      <button 
                        onClick={() => setViewMode('single')}
                        className={cn(
                          "px-4 h-10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                          viewMode === 'single' ? "bg-slate-900 text-white" : "text-ink/40 hover:bg-slate-50 dark:hover:bg-slate-700 font-bold"
                        )}
                      >
                        <Monitor className="w-3 h-3" /> Present
                      </button>
                   </div>

                   <button
                    onClick={handleExportPdf}
                    className="h-14 px-6 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-ink dark:text-white font-bold text-xs uppercase tracking-widest flex items-center gap-3 shadow-sm hover:translate-y-[-2px] transition-all"
                  >
                    <FileDown className="w-4 h-4" /> PDF
                  </button>
                  <button
                    onClick={handleExport}
                    className="h-14 px-8 rounded-2xl text-white font-black text-xs uppercase tracking-[0.2em] flex items-center gap-3 shadow-2xl hover:translate-y-[-2px] transition-all active:scale-95"
                    style={{ backgroundColor: themeColor }}
                  >
                    PPTX
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {readingTimeEstimate && (
                <div className="mb-8 p-4 rounded-2xl bg-brand/5 border border-brand/10 dark:border-brand/20 flex items-center gap-4 animate-in fade-in slide-in-from-top-4">
                  <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center text-brand">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-brand opacity-60">Speech Analysis</p>
                    <p className="text-sm font-bold">Estimated Presentation Time: <span className="text-brand">{readingTimeEstimate.min} – {readingTimeEstimate.max} minutes</span> <span className="opacity-40 font-medium ml-2">({readingTimeEstimate.wordCount} words)</span></p>
                  </div>
                </div>
              )}

              {viewMode === 'gallery' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 pb-20">
                  {data.slides.map((slide, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="slide-preview-card bg-white dark:bg-slate-800 rounded-[2.5rem] border border-slate-100 dark:border-slate-700 p-8 shadow-sm hover:shadow-xl transition-all group flex flex-col gap-6 relative overflow-hidden"
                      style={{ borderTop: `8px solid ${themeColor}` }}
                    >
                      <div className="absolute top-4 right-4 w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-700 flex items-center justify-center text-[10px] font-black text-ink/20 dark:text-slate-400">
                        {i + 1}
                      </div>

                      <div className="space-y-2">
                        <textarea
                          rows={2}
                          value={slide.title}
                          onChange={(e) => handleUpdateSlideAt(i, { ...slide, title: e.target.value })}
                          className="w-full bg-transparent font-display font-bold text-2xl tracking-tight resize-none focus:outline-none border-b border-transparent focus:border-brand/20 p-1"
                        />
                      </div>

                      <div className={cn(
                        "flex-1 flex gap-4",
                        imagePlacement === 'top' ? "flex-col-reverse" : "flex-col"
                      )}>
                        <div className="flex-1 space-y-4">
                          {slide.content.map((point, pi) => (
                            <div key={pi} className="flex gap-3">
                              <div className="w-1.5 h-1.5 rounded-full mt-2.5 flex-shrink-0" style={{ backgroundColor: themeColor }} />
                              <textarea
                                rows={2}
                                value={point}
                                onChange={(e) => {
                                  const newContent = [...slide.content];
                                  newContent[pi] = e.target.value;
                                  handleUpdateSlideAt(i, { ...slide, content: newContent });
                                }}
                                className="flex-1 bg-transparent text-sm font-medium text-ink/60 dark:text-slate-400 leading-relaxed resize-none focus:outline-none border-b border-transparent focus:border-brand/20 p-1"
                              />
                              <button 
                                onClick={() => {
                                  const newContent = slide.content.filter((_, idx) => idx !== pi);
                                  handleUpdateSlideAt(i, { ...slide, content: newContent });
                                }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-rose-400 hover:text-rose-500"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          <button 
                            onClick={() => {
                              handleUpdateSlideAt(i, { ...slide, content: [...slide.content, ""] });
                            }}
                            className="w-full py-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-[8px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all font-bold"
                          >
                            + Add Point
                          </button>
                        </div>

                        <div 
                          className="aspect-video rounded-2xl bg-slate-50 dark:bg-slate-900/50 relative overflow-hidden flex items-center justify-center border border-slate-100 dark:border-slate-700 hover:border-brand/40 transition-all group/img"
                        >
                          {slideImages[i] ? (
                            <div className="w-full h-full relative group/img">
                              <img 
                                src={slideImages[i]} 
                                alt="slide content" 
                                className="w-full h-full object-cover group-hover/img:scale-110 transition-transform" 
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  // If image fails to load, show a retry state
                                  const parent = e.currentTarget.parentElement;
                                  if (parent) {
                                    parent.setAttribute('data-failed', 'true');
                                  }
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                               <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                                  <div className="flex gap-2">
                                     <button 
                                       onClick={() => openImageAssistant(i)}
                                       className="flex items-center gap-2 bg-white px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-widest text-ink hover:scale-105 transition-transform"
                                     >
                                        <Sparkles className="w-3 h-3 text-brand" /> Regenerate
                                     </button>
                                     <button 
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         setSlideImages(prev => {
                                           const next = { ...prev };
                                           delete next[i];
                                           return next;
                                         });
                                       }}
                                       className="flex items-center justify-center bg-rose-500 w-8 h-8 rounded-full text-white hover:scale-110 transition-transform"
                                       title="Remove Image"
                                     >
                                        <Trash2 className="w-4 h-4" />
                                     </button>
                                  </div>
                                  <label className="flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/20 px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-widest text-white hover:bg-white/20 transition-all cursor-pointer">
                                     <Upload className="w-3 h-3" /> Upload New
                                     <input 
                                       type="file" 
                                       className="hidden" 
                                       accept="image/*"
                                       onChange={(e) => handleLocalImageUpload(i, e)}
                                     />
                                  </label>
                               </div>
                              <div className="image-fail-msg hidden absolute inset-0 bg-rose-50 flex-col items-center justify-center p-4 text-center gap-2 group-data-[failed=true]/img:flex">
                                 <X className="w-6 h-6 text-rose-400" />
                                 <span className="text-[8px] font-black uppercase tracking-widest text-rose-500">Visual Blocked or Failed</span>
                                 <div className="flex gap-2">
                                   <button 
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       openImageAssistant(i);
                                     }}
                                     className="mt-2 text-[8px] font-black underline uppercase tracking-widest text-ink"
                                   >
                                     AI Try
                                   </button>
                                   <label className="mt-2 text-[8px] font-black underline uppercase tracking-widest text-ink cursor-pointer">
                                     Upload
                                     <input 
                                       type="file" 
                                       className="hidden" 
                                       accept="image/*"
                                       onChange={(e) => handleLocalImageUpload(i, e)}
                                     />
                                   </label>
                                 </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-3 opacity-30 group-hover/img:opacity-100 transition-opacity">
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => openImageAssistant(i)}
                                  className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm hover:text-brand transition-colors"
                                  title="AI Generate"
                                >
                                  <Sparkles className="w-5 h-5" />
                                </button>
                                <label 
                                  className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm hover:text-brand transition-colors cursor-pointer"
                                  title="Upload Image"
                                >
                                  <Upload className="w-5 h-5" />
                                  <input 
                                    type="file" 
                                    className="hidden" 
                                    accept="image/*"
                                    onChange={(e) => handleLocalImageUpload(i, e)}
                                  />
                                </label>
                              </div>
                              <span className="text-[8px] font-black uppercase tracking-widest">Add Visual to Slide</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  
                  <button 
                    onClick={() => {
                      const newSlide: SlideData = { title: "New Slide", content: ["Enter content here"] };
                      setData({ ...data, slides: [...data.slides, newSlide] });
                    }}
                    className="h-full min-h-[400px] rounded-[2.5rem] border-4 border-dashed border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center gap-4 text-slate-300 dark:text-slate-700 hover:border-brand/20 hover:text-brand transition-all group"
                  >
                    <Plus className="w-12 h-12 group-hover:scale-110 transition-transform" />
                    <span className="font-black uppercase tracking-widest text-xs font-bold">Insert New Slide</span>
                  </button>
                </div>
              ) : (
                <div className="flex-1 grid lg:grid-cols-[1fr_380px] gap-8 overflow-hidden h-60 min-h-[700px] pb-20">
                  <div className="flex flex-col gap-6 overflow-hidden">
                     <div 
                       className="flex-1 bg-white dark:bg-slate-800 rounded-[4rem] border-[12px] border-slate-100 dark:border-slate-700 shadow-[inset_0_32px_64px_-16px_rgba(0,0,0,0.05)] p-16 relative overflow-hidden flex flex-col group transition-all"
                       style={{ borderTop: `24px solid ${themeColor}` }}
                     >
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={currentSlideIndex}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className={cn(
                              "flex-1 flex gap-12",
                              imagePlacement === 'left' ? "flex-row-reverse" : 
                              imagePlacement === 'right' ? "flex-row" : 
                              imagePlacement === 'top' ? "flex-col-reverse" : 
                              imagePlacement === 'bottom' ? "flex-col" : 
                              "flex-col" // auto/default
                            )}
                          >
                             <div className="flex-1 space-y-12">
                                <div className="flex items-start justify-between gap-4">
                                  <textarea
                                    rows={2}
                                    value={data.slides[currentSlideIndex].title}
                                    onChange={(e) => handleUpdateSlideAt(currentSlideIndex, { ...data.slides[currentSlideIndex], title: e.target.value })}
                                    className="flex-1 bg-transparent font-display font-bold text-5xl tracking-tight leading-tight resize-none focus:outline-none border-b border-transparent focus:border-brand/20 p-2"
                                  />
                                  <button 
                                    onClick={() => openImageAssistant(currentSlideIndex)}
                                    className="mt-2 p-4 bg-brand/5 text-brand rounded-3xl hover:bg-brand/10 transition-all active:scale-90"
                                    title="Magic Visual"
                                  >
                                    <Sparkles className="w-8 h-8" />
                                  </button>
                                </div>
                                <div className="space-y-8">
                                   {data.slides[currentSlideIndex].content.map((point, pi) => (
                                      <motion.div 
                                        key={pi}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: pi * 0.1 }}
                                        className="flex items-start gap-4"
                                      >
                                         <div className="w-2.5 h-2.5 rounded-full mt-5 flex-shrink-0" style={{ backgroundColor: themeColor }} />
                                         <textarea
                                           rows={2}
                                           value={point}
                                           onChange={(e) => {
                                             const newContent = [...data.slides[currentSlideIndex].content];
                                             newContent[pi] = e.target.value;
                                             handleUpdateSlideAt(currentSlideIndex, { ...data.slides[currentSlideIndex], content: newContent });
                                           }}
                                           className="flex-1 bg-transparent text-xl font-medium text-ink/70 dark:text-slate-300 leading-relaxed resize-none focus:outline-none border-b border-transparent focus:border-brand/10 p-1"
                                         />
                                      </motion.div>
                                   ))}
                                </div>
                             </div>

                             {addImages && (
                               slideImages[currentSlideIndex] ? (
                                <div 
                                  onClick={() => openImageAssistant(currentSlideIndex)}
                                  className={cn(
                                   "rounded-3xl overflow-hidden shadow-2xl border-4 border-white dark:border-slate-700 shrink-0 self-center transition-all cursor-pointer hover:scale-105 active:scale-95 group/main",
                                   (imagePlacement === 'left' || imagePlacement === 'right') ? "w-1/3 aspect-square" : 
                                   (imagePlacement === 'top' || imagePlacement === 'bottom') ? "w-full max-h-64 object-cover" :
                                   "mt-12 absolute right-10 bottom-10 w-1/3 aspect-video slam-in" // auto
                                )}>
                                   <img 
                                     src={slideImages[currentSlideIndex]} 
                                     className="w-full h-full object-cover" 
                                     referrerPolicy="no-referrer" 
                                     onLoad={(e) => {
                                        e.currentTarget.parentElement?.removeAttribute('data-failed');
                                        e.currentTarget.style.display = 'block';
                                     }}
                                     onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                        e.currentTarget.parentElement?.setAttribute('data-failed', 'true');
                                     }}
                                   />
                                   <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/main:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openImageAssistant(currentSlideIndex);
                                        }}
                                        className="w-12 h-12 bg-white text-brand rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                                      >
                                         <Sparkles className="w-6 h-6" />
                                      </button>
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSlideImages(prev => {
                                            const next = { ...prev };
                                            delete next[currentSlideIndex];
                                            return next;
                                          });
                                        }}
                                        className="w-12 h-12 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                                      >
                                         <Trash2 className="w-6 h-6" />
                                      </button>
                                   </div>
                                   <div className="image-fail-msg hidden absolute inset-0 bg-rose-50 flex-col items-center justify-center p-4 text-center gap-2 group-data-[failed=true]/main:flex">
                                     <X className="w-8 h-8 text-rose-400" />
                                     <button 
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         openImageAssistant(currentSlideIndex);
                                       }}
                                       className="text-[10px] font-black underline uppercase text-ink"
                                     >
                                       Retry
                                     </button>
                                   </div>
                                </div>
                               ) : (
                                <div 
                                  onClick={() => openImageAssistant(currentSlideIndex)}
                                  className={cn(
                                   "rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-brand/40 transition-all group/plus shrink-0 self-center",
                                   (imagePlacement === 'left' || imagePlacement === 'right') ? "w-1/3 aspect-square" : 
                                   (imagePlacement === 'top' || imagePlacement === 'bottom') ? "w-full h-32" :
                                   "mt-12 absolute right-10 bottom-10 w-1/3 aspect-video" // auto
                                )}>
                                   <div className="flex gap-3">
                                     <button 
                                       onClick={() => openImageAssistant(currentSlideIndex)}
                                       className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm hover:text-brand transition-all hover:scale-105"
                                       title="AI Visual"
                                     >
                                       <Sparkles className="w-6 h-6" />
                                     </button>
                                     <label 
                                       className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm hover:text-brand transition-all hover:scale-105 cursor-pointer"
                                       title="Upload Image"
                                     >
                                       <Upload className="w-6 h-6" />
                                       <input 
                                         type="file" 
                                         className="hidden" 
                                         accept="image/*"
                                         onChange={(e) => handleLocalImageUpload(currentSlideIndex, e)}
                                       />
                                     </label>
                                   </div>
                                   <span className="text-[10px] font-black uppercase tracking-widest opacity-30">Add Slide Visual</span>
                                </div>
                               )
                             )}
                          </motion.div>
                        </AnimatePresence>

                        {/* Navigation Arrows */}
                        <div className="absolute inset-y-0 left-6 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                           <button 
                            disabled={currentSlideIndex === 0}
                            onClick={() => setCurrentSlideIndex(prev => prev - 1)}
                            className="w-16 h-16 rounded-full bg-white dark:bg-white/10 shadow-2xl border border-slate-100 dark:border-slate-600 flex items-center justify-center disabled:opacity-0 active:scale-90 transition-all" 
                           >
                             <ChevronLeft className="w-8 h-8" />
                           </button>
                        </div>
                        <div className="absolute inset-y-0 right-6 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                           <button 
                            disabled={currentSlideIndex === data.slides.length - 1}
                            onClick={() => setCurrentSlideIndex(prev => prev + 1)}
                            className="w-16 h-16 rounded-full bg-white dark:bg-white/10 shadow-2xl border border-slate-100 dark:border-slate-600 flex items-center justify-center disabled:opacity-0 active:scale-90 transition-all" 
                           >
                             <ChevronRight className="w-8 h-8" />
                           </button>
                        </div>
                     </div>
                     
                     <div className="flex items-center justify-between px-8 py-4 glass rounded-[2.5rem]">
                        <div className="flex gap-2 w-full">
                           {data.slides.map((_, i) => (
                             <div 
                                key={i} 
                                className={cn(
                                 "h-1.5 flex-1 rounded-full transition-all duration-500",
                                 currentSlideIndex === i ? "bg-brand" : "bg-slate-200 dark:bg-slate-700"
                                )} 
                                style={{ backgroundColor: currentSlideIndex === i ? themeColor : undefined }}
                             />
                           ))}
                        </div>
                     </div>
                </div>

                <div className="space-y-8 overflow-y-auto pr-2 custom-scrollbar">
                   <div className="bg-white/70 dark:bg-slate-800/70 border border-white dark:border-slate-700 rounded-[2.5rem] p-8 shadow-sm backdrop-blur-md">
                      <div className="flex items-center gap-4 mb-6">
                         <div className="w-10 h-10 bg-brand rounded-xl flex items-center justify-center text-white shadow-lg">
                            <Sparkles className="w-5 h-5" />
                         </div>
                         <div>
                           <h4 className="text-lg font-display font-bold tracking-tight">AI Assistant</h4>
                           <p className="text-[9px] font-black uppercase tracking-widest opacity-40">Slide {currentSlideIndex + 1} Tools</p>
                         </div>
                      </div>
                      <div className="space-y-3">
                         <button 
                           onClick={() => openImageAssistant(currentSlideIndex)}
                           className="w-full h-16 rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 flex items-center justify-center gap-3 text-xs font-black uppercase tracking-widest hover:border-brand hover:text-brand transition-all shadow-sm active:scale-95 group"
                         >
                           <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center text-brand group-hover:scale-110 transition-transform">
                             <ImageIcon className="w-4 h-4" />
                           </div>
                           Generate Image
                         </button>

                         <button 
                           onClick={() => {
                             const topic = data.slides[currentSlideIndex].title;
                             window.open(`https://www.google.com/search?q=${encodeURIComponent(topic)}+image+clipart`, '_blank');
                           }}
                           className="w-full h-12 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-60 hover:opacity-100 transition-all"
                         >
                           <Search className="w-3 h-3" /> Find Assets
                         </button>
                      </div>
                   </div>

                   <div className="bg-white/70 dark:bg-slate-800/70 border border-white dark:border-slate-700 rounded-[2.5rem] p-8 shadow-sm backdrop-blur-md">
                     <div className="flex items-center gap-4 mb-6">
                        <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white">
                           <FileText className="w-5 h-5" />
                        </div>
                        <h4 className="text-lg font-display font-bold tracking-tight">References</h4>
                     </div>
                     <div className="space-y-3">
                        {data.sources?.map((url, i) => (
                          <a 
                             key={i} 
                             href={url.startsWith('http') ? url : `https://${url}`} 
                             target="_blank" 
                             className="p-4 bg-white dark:bg-slate-700/50 border border-slate-100 dark:border-slate-700 rounded-2xl flex items-center gap-4 hover:border-brand hover:shadow-md transition-all group overflow-hidden"
                          >
                             <Link className="w-3 h-3 text-brand" />
                             <span className="text-[10px] font-bold text-ink/60 dark:text-slate-400 truncate">{url}</span>
                          </a>
                        ))}
                     </div>
                   </div>

                   {addImages && (
                      <div className="card-main rounded-[2.5rem] p-8 space-y-6">
                        <div className="flex items-center gap-4">
                           <div className="w-10 h-10 bg-brand/10 rounded-xl flex items-center justify-center text-brand">
                              <ImageIcon className="w-5 h-5" />
                           </div>
                           <h4 className="text-lg font-display font-bold">Slide Visuals</h4>
                        </div>
                        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl">
                          {slideImages[currentSlideIndex] ? (
                            <div className="aspect-video rounded-xl overflow-hidden relative group">
                              <img src={slideImages[currentSlideIndex]} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              <button onClick={() => setSlideImages(prev => { const n = {...prev}; delete n[currentSlideIndex]; return n; })} className="absolute top-2 right-2 p-2 bg-rose-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3" /></button>
                            </div>
                          ) : (
                            <button onClick={() => openImageAssistant(currentSlideIndex)} className="w-full aspect-video border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 text-ink/30"><Plus /><span className="text-[8px] font-black uppercase">Add Image</span></button>
                          )}
                        </div>
                      </div>
                   )}
                </div>
              </div>
              )}
              <div className="mt-12 pb-20">
                 <div className="bg-white/70 dark:bg-slate-800/70 border border-white dark:border-slate-700 rounded-[2.5rem] p-10 shadow-sm backdrop-blur-md">
                   <div className="flex items-center gap-4 mb-8">
                      <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white">
                         <FileText className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-2xl font-display font-bold tracking-tight text-ink dark:text-white">Sources & References</h4>
                        <p className="text-xs font-medium text-ink/40 dark:text-slate-400">Verified academic references used for this presentation.</p>
                      </div>
                   </div>
                   <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {data.sources?.length > 0 ? (
                         data.sources.map((url, i) => (
                            <a 
                               key={i} 
                               href={url.startsWith('http') ? url : `https://${url}`} 
                               target="_blank" 
                               rel="noopener noreferrer"
                               className="p-6 bg-white dark:bg-slate-700/50 border border-slate-100 dark:border-slate-700 rounded-2xl flex items-center gap-4 hover:border-brand hover:shadow-md transition-all group overflow-hidden"
                            >
                               <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center group-hover:bg-brand/10 transition-colors">
                                  <Link className="w-4 h-4 text-slate-400 group-hover:text-brand" />
                               </div>
                               <span className="text-xs font-bold text-ink/60 dark:text-slate-400 truncate group-hover:text-brand transition-colors">{url}</span>
                            </a>
                         ))
                      ) : (
                         <p className="text-xs font-medium text-ink/30 italic col-span-full">No references provided for this presentation.</p>
                      )}
                   </div>
                 </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Visual Template Modal */}
      <AnimatePresence>
        {showTemplateModal && (
          <motion.div 
            key="template-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-8 bg-black/60 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[3rem] p-10 max-w-xl w-full shadow-[0_100px_150px_-50px_rgba(0,0,0,0.5)] space-y-8"
            >
               <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-widest opacity-40">Style Template</h3>
                    <p className="text-[10px] font-bold opacity-30 uppercase tracking-widest">Base PPT style on this image</p>
                  </div>
                  <button onClick={() => {
                    setShowTemplateModal(false);
                    setCameraActive(false);
                  }} className="p-3 border border-slate-100 rounded-full hover:bg-slate-50 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
               </div>

               <div className="space-y-6">
                 <div className="h-60">
                    <label className="h-full border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-slate-50 transition-all hover:border-brand/40 group">
                      <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Upload className="w-8 h-8 opacity-20" />
                      </div>
                      <div className="text-center">
                        <span className="block text-[10px] font-black uppercase tracking-widest opacity-40">Pick Template Image</span>
                        <span className="text-[8px] font-bold opacity-20 uppercase">Canvas, UI, File</span>
                      </div>
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setVisualTemplate(reader.result as string);
                              setShowTemplateModal(false);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                 </div>
               </div>

               <div className="p-6 bg-slate-50 rounded-2xl">
                 <p className="text-[10px] leading-relaxed font-bold opacity-30 text-center uppercase tracking-widest">
                   The AI will extract architectural cues and color codes from this image to inform the generated slide structure.
                 </p>
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Content Source Modal */}
      <AnimatePresence>
        {showContentModal && (
          <motion.div 
            key="content-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-8 bg-black/60 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[3rem] p-10 max-w-xl w-full shadow-2xl space-y-8"
            >
               <div className="flex items-center justify-between">
                  <h3 className="text-xl font-black uppercase tracking-widest opacity-40">Add Research Data</h3>
                  <button onClick={() => {
                    setShowContentModal(false);
                    if (cameraActive) {
                      const video = document.getElementById('camera-preview') as HTMLVideoElement;
                      if (video && video.srcObject) {
                        (video.srcObject as MediaStream).getTracks().forEach(t => t.stop());
                      }
                      setCameraActive(false);
                    }
                  }} className="p-2 border border-slate-100 rounded-full hover:bg-slate-50 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
               </div>

               <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                  <button 
                    onClick={() => { setContentType('text'); setContentData(""); }}
                    className={cn(
                      "flex-1 h-12 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                      contentType === 'text' ? "bg-white shadow-sm" : "opacity-40"
                    )}
                  >
                    Add Text
                  </button>
                  <button 
                    onClick={() => { setContentType('image'); setContentData(""); }}
                    className={cn(
                      "flex-1 h-12 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                      contentType === 'image' ? "bg-white shadow-sm" : "opacity-40"
                    )}
                  >
                    Upload Source
                  </button>
               </div>

               <div className="space-y-6">
                  {contentType === 'text' ? (
                    <textarea 
                      value={contentData}
                      onChange={(e) => setContentData(e.target.value)}
                      placeholder="Paste relevant notes, excerpts or specific text for this slide..."
                      className="w-full h-40 p-6 bg-slate-50 rounded-2xl font-bold text-sm focus:outline-none border border-slate-100"
                    />
                  ) : (
                    <div className="space-y-4">
                      {contentData ? (
                        <div className="h-48 rounded-2xl border-4 border-slate-100 overflow-hidden relative">
                          <img src={contentData} className="w-full h-full object-contain bg-slate-50" referrerPolicy="no-referrer" />
                          <button 
                            onClick={() => setContentData("")}
                            className="absolute top-2 right-2 p-2 bg-rose-500 text-white rounded-full shadow-xl"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : cameraActive ? (
                        <div className="h-48 rounded-2xl border-4 border-slate-100 overflow-hidden relative bg-black flex flex-col items-center justify-center">
                           <video 
                             id="camera-preview"
                             autoPlay 
                             playsInline
                             className="w-full h-full object-cover"
                           />
                           <button 
                            onClick={async () => {
                              const video = document.getElementById('camera-preview') as HTMLVideoElement;
                              if (video) {
                                const canvas = document.createElement('canvas');
                                canvas.width = video.videoWidth;
                                canvas.height = video.videoHeight;
                                canvas.getContext('2d')?.drawImage(video, 0, 0);
                                const dataUrl = canvas.toDataURL('image/png');
                                setContentData(dataUrl);
                                
                                // Stop tracks
                                const stream = video.srcObject as MediaStream;
                                if (stream) {
                                  stream.getTracks().forEach(t => t.stop());
                                }
                                setCameraActive(false);
                              }
                            }}
                            className="absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-2 bg-white text-xs font-black uppercase tracking-widest rounded-full shadow-2xl"
                           >
                             Take Snapshot
                           </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4 h-48">
                          <label className="border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-slate-50 transition-colors">
                            <Upload className="w-8 h-8 opacity-20" />
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Choose File</span>
                            <input 
                              type="file" 
                              accept="image/*" 
                              className="hidden" 
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onloadend = () => setContentData(reader.result as string);
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                          </label>
                          <button 
                            onClick={async () => {
                              setCameraActive(true);
                              try {
                                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                                setTimeout(() => {
                                  const video = document.getElementById('camera-preview') as HTMLVideoElement;
                                  if (video) video.srcObject = stream;
                                }, 100);
                              } catch (err) {
                                console.error(err);
                                alert("Camera access denied.");
                                setCameraActive(false);
                              }
                            }}
                            className="border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-3 hover:bg-slate-50 transition-colors"
                          >
                            <Camera className="w-8 h-8 opacity-20" />
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Capture Live</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-6">
                     <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest opacity-40">Target Slide</label>
                        <select 
                          value={targetSlide}
                          onChange={(e) => setTargetSlide(Number(e.target.value))}
                          className="w-full h-12 bg-slate-50 rounded-xl px-4 font-bold text-xs focus:outline-none"
                        >
                          {Array.from({ length: numSlides }, (_, i) => (
                            <option key={i+1} value={i+1}>Slide {i+1}</option>
                          ))}
                        </select>
                     </div>
                     <div className="space-y-3">
                        <label className="text-[9px] font-black uppercase tracking-widest opacity-40">Process Mode</label>
                        <div className="flex gap-2">
                           <button 
                            onClick={() => setProcessMode('exact')}
                            className={cn(
                              "flex-1 h-10 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all",
                              processMode === 'exact' ? "bg-slate-900 text-white border-slate-900 shadow-lg" : "border-slate-200 text-slate-400"
                            )}
                           >
                             Exact
                           </button>
                           <button 
                            onClick={() => setProcessMode('bullet')}
                            className={cn(
                              "flex-1 h-10 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all",
                              processMode === 'bullet' ? "bg-slate-900 text-white border-slate-900 shadow-lg" : "border-slate-200 text-slate-400"
                            )}
                           >
                             Bullet
                           </button>
                        </div>
                     </div>
                  </div>
               </div>

               <button 
                onClick={addContentToBench}
                className="w-full h-14 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:translate-y-[-2px] transition-all"
               >
                  Add to Knowledge Bench
               </button>
            </motion.div>
          </motion.div>
        )}

        {/* Image AI Assistant Modal */}
        <AnimatePresence>
          {activeImageSlideIndex !== null && showImageAssistant && (
            <ImageAssistantModal 
              index={activeImageSlideIndex}
              onClose={() => {
                setShowImageAssistant(false);
                setActiveImageSlideIndex(null);
              }}
              onImageSelect={(url) => {
                setSlideImages(prev => ({ ...prev, [activeImageSlideIndex!]: url }));
                setShowImageAssistant(false);
                setActiveImageSlideIndex(null);
              }}
              slideTitle={data?.slides[activeImageSlideIndex].title || ""}
              themeColor={themeColor}
            />
          )}
        </AnimatePresence>
      </AnimatePresence>

      {/* Persistent Global Status */}
      <footer className="h-16 px-8 flex items-center justify-between border-t border-white/50 glass text-[10px] font-black uppercase tracking-[0.2em] text-ink/20 shrink-0">
         <div className="flex gap-8">
            <span className="flex items-center gap-2"><div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" /> Neural Network: Active</span>
            <span className="hidden sm:inline">Engine: SlideCraft v2.0 // Gemini-3-Flash</span>
         </div>
         <div>© 2026 Crafted for Education</div>
      </footer>
    </div>
  );
}
