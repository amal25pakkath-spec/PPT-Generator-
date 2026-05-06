import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Sparkles, 
  X, 
  Upload, 
  Link as LinkIcon, 
  Search, 
  ArrowRight,
  FileText,
  Loader2
} from "lucide-react";
import { generateImage } from "../lib/gemini";
import { cn } from "../lib/utils";

interface ImageAssistantModalProps {
  index: number;
  onClose: () => void;
  onImageSelect: (url: string) => void;
  slideTitle: string;
  themeColor: string;
}

export function ImageAssistantModal({ 
  index, 
  onClose, 
  onImageSelect, 
  slideTitle, 
  themeColor 
}: ImageAssistantModalProps) {
  const [activeTab, setActiveTab] = useState<'ai' | 'upload' | 'url'>('ai');
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [url, setUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<string>("Professional 3D illustration");

  const styles = [
    { id: "Professional 3D illustration", label: "3D Art", icon: "🎨" },
    { id: "Minimalist vector art", label: "Vector", icon: "📐" },
    { id: "Realistic cinematic photography", label: "Photo", icon: "📷" },
    { id: "Vibrant abstract design", label: "Abstract", icon: "✨" },
  ];

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setIsLoadingImage(true);
    setPreviewUrl(null);
    try {
      const finalPrompt = `${selectedStyle} of ${prompt}, high quality, clean background, 8k resolution`;
      const generatedUrl = await generateImage(finalPrompt);
      setPreviewUrl(generatedUrl);
    } catch (e) {
      console.error(e);
      alert("Something went wrong with the AI engine. Please try again.");
      setIsLoadingImage(false);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      onImageSelect(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] bg-slate-900/80 backdrop-blur-xl flex items-center justify-center p-6"
    >
      <motion.div 
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-8 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg" style={{ backgroundColor: themeColor }}>
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-2xl font-display font-black tracking-tight">Visual Engine</h3>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Slide {index + 1} // Precision Media Control</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex p-1.5 bg-slate-100 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-700 shrink-0">
          {[
            { id: 'ai', label: 'AI Generator', icon: Sparkles },
            { id: 'upload', label: 'Local Store', icon: Upload },
            { id: 'url', label: 'Web Source', icon: LinkIcon },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                setPreviewUrl(null);
                setIsLoadingImage(false);
              }}
              className={cn(
                "flex-1 py-4 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all rounded-2xl",
                activeTab === tab.id 
                  ? "bg-white dark:bg-slate-800 shadow-md text-brand scale-100" 
                  : "opacity-40 hover:opacity-100 scale-95"
              )}
              style={{ color: activeTab === tab.id ? themeColor : undefined }}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
        
        <div className="p-10 space-y-8 overflow-y-auto">
           {activeTab === 'ai' && (
             <div className="space-y-6">
                <div className="space-y-3">
                  <div className="text-[9px] font-black uppercase tracking-widest opacity-40 ml-2">Choose Artistic Style</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {styles.map((style) => (
                      <button
                        key={style.id}
                        onClick={() => setSelectedStyle(style.id)}
                        className={cn(
                          "py-3 px-2 rounded-xl text-[10px] font-bold border transition-all flex flex-col items-center gap-1",
                          selectedStyle === style.id 
                            ? "border-brand bg-brand/5 dark:border-brand" 
                            : "border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50 opacity-60 hover:opacity-100"
                        )}
                        style={{ 
                          borderColor: selectedStyle === style.id ? themeColor : undefined,
                          backgroundColor: selectedStyle === style.id ? `${themeColor}10` : undefined,
                          color: selectedStyle === style.id ? themeColor : undefined
                        }}
                      >
                        <span className="text-xl">{style.icon}</span>
                        {style.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="relative group">
                  <div className="absolute -top-3 left-6 px-2 py-1 bg-white dark:bg-slate-800 text-[8px] font-black uppercase tracking-widest opacity-40 rounded-md border border-slate-100 dark:border-slate-700">Prompt</div>
                  <textarea 
                    rows={3}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe what you want to see..."
                    className="w-full p-8 pt-10 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 rounded-[2.5rem] font-display font-medium text-lg focus:outline-none focus:border-brand shadow-sm resize-none transition-all"
                    style={{ borderColor: prompt ? `${themeColor}40` : undefined }}
                  />
                  <button 
                    onClick={() => setPrompt(slideTitle)}
                    className="absolute right-6 bottom-6 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-[9px] font-black uppercase tracking-widest rounded-full hover:bg-brand hover:text-white transition-all"
                  >
                    Sync Topic
                  </button>
                </div>

                {previewUrl && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="aspect-video relative rounded-[2rem] overflow-hidden border-4 border-white shadow-2xl bg-slate-100"
                  >
                    {isLoadingImage && (
                       <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-900 z-10 gap-3">
                          <Loader2 className="w-8 h-8 animate-spin text-brand" style={{ color: themeColor }} />
                          <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Processing Visual...</span>
                       </div>
                    )}
                    <img 
                      src={previewUrl} 
                      className={cn("w-full h-full object-cover transition-opacity duration-700", isLoadingImage ? "opacity-0" : "opacity-100")} 
                      alt="Preview" 
                      onLoad={() => setIsLoadingImage(false)}
                      onError={() => {
                        setIsLoadingImage(false);
                        setPreviewUrl(null);
                        alert("The image service is currently busy. Please try a different prompt or style.");
                      }}
                    />
                    {!isLoadingImage && (
                      <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/80 to-transparent flex justify-between items-center">
                         <div className="text-white">
                           <span className="block text-[8px] font-black uppercase tracking-[0.2em] opacity-60">Result Generated</span>
                           <span className="text-xs font-bold font-display">Ready for Slide {index + 1}</span>
                         </div>
                         <button 
                           onClick={() => onImageSelect(previewUrl)}
                           className="px-8 py-3 bg-white text-ink rounded-full text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 shadow-xl transition-all"
                         >
                           Attach to Slide
                         </button>
                      </div>
                    )}
                  </motion.div>
                )}

                <button 
                  onClick={handleGenerate}
                  disabled={isGenerating || !prompt.trim()}
                  className="w-full h-20 rounded-[2rem] text-white font-black text-sm uppercase tracking-[0.3em] shadow-2xl transition-all flex items-center justify-center gap-4 disabled:opacity-50 active:scale-95"
                  style={{ backgroundColor: themeColor }}
                >
                  {isGenerating ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <>
                      {previewUrl ? "Regenerate Visual" : "Generate Neural Image"}
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
             </div>
           )}

           {activeTab === 'upload' && (
             <div className="space-y-4">
                <label className="w-full h-80 border-4 border-dashed border-slate-100 dark:border-slate-700 rounded-[3rem] flex flex-col items-center justify-center gap-6 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition-all group overflow-hidden relative">
                   <div className="w-24 h-24 rounded-[2.5rem] bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 shadow-xl">
                      <Upload className="w-10 h-10" style={{ color: themeColor }} />
                   </div>
                   <div className="text-center relative z-10 px-8">
                     <h4 className="text-xl font-display font-black tracking-tight mb-2">Import Local Media</h4>
                     <p className="text-[10px] opacity-40 font-black uppercase tracking-[0.2em] max-w-[200px] mx-auto leading-relaxed">
                       Drag your high-res assets here or click to browse files
                     </p>
                   </div>
                   <input type="file" className="hidden" accept="image/*" onChange={handleUpload} />
                </label>
             </div>
           )}

           {activeTab === 'url' && (
             <div className="space-y-8">
                <div className="space-y-3">
                  <div className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-4">Smart Link Integration</div>
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <LinkIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 opacity-30" />
                      <input 
                        value={url}
                        onChange={(e) => {
                          setUrl(e.target.value);
                        }}
                        onBlur={() => setPreviewUrl(url)}
                        placeholder="Paste direct JPG/PNG link..."
                        className="w-full h-16 bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-700 rounded-[1.5rem] px-14 text-sm font-medium focus:outline-none focus:border-brand transition-all"
                        style={{ borderColor: url ? `${themeColor}40` : undefined }}
                      />
                    </div>
                    <button 
                      onClick={() => url && onImageSelect(url)}
                      className="px-10 h-16 rounded-[1.5rem] text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all"
                      style={{ backgroundColor: themeColor }}
                    >
                      Fetch
                    </button>
                  </div>
                </div>

                {previewUrl && (
                   <motion.div 
                     initial={{ opacity: 0, y: 20 }}
                     animate={{ opacity: 1, y: 0 }}
                     className="aspect-video relative rounded-[2rem] overflow-hidden border-2 border-slate-100 shadow-lg"
                   >
                      <img 
                        src={previewUrl} 
                        className="w-full h-full object-cover" 
                        alt="URL Preview" 
                        onError={() => setPreviewUrl(null)}
                      />
                   </motion.div>
                )}

                <div className="p-10 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-[2.5rem] space-y-6 shadow-inner">
                   <div className="flex items-center gap-3 text-slate-500">
                      <div className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm">
                        <Search className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em]">Global Media Search</span>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                      <a 
                        href={`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(slideTitle)}`}
                        target="_blank"
                        className="flex flex-col p-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm hover:shadow-xl hover:translate-y-[-4px] hover:border-brand transition-all border-2 border-transparent group"
                      >
                         <span className="text-sm font-black font-display mb-1 group-hover:text-brand transition-colors">Google Images</span>
                         <span className="text-[8px] opacity-40 font-black uppercase tracking-widest leading-none">Find anything fast</span>
                      </a>
                      <a 
                        href={`https://unsplash.com/s/photos/${encodeURIComponent(slideTitle)}`}
                        target="_blank"
                        className="flex flex-col p-6 bg-white dark:bg-slate-800 rounded-2xl shadow-sm hover:shadow-xl hover:translate-y-[-4px] hover:border-brand transition-all border-2 border-transparent group"
                      >
                         <span className="text-sm font-black font-display mb-1 group-hover:text-brand transition-colors">Unsplash</span>
                         <span className="text-[8px] opacity-40 font-black uppercase tracking-widest leading-none">Curated Aesthetics</span>
                      </a>
                   </div>
                   <div className="p-5 bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl relative overflow-hidden">
                      <div className="absolute inset-y-0 left-0 w-1 bg-amber-400" />
                      <p className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest leading-loose">
                        <span className="text-amber-600 font-black">PRO TIP:</span> RIGHT-CLICK ANY IMAGE ON THE WEB, SELECT <span className="text-indigo-600">"COPY IMAGE ADDRESS"</span>, AND PASTE IT ABOVE FOR INSTANT IMPORT.
                      </p>
                   </div>
                </div>
             </div>
           )}
        </div>
      </motion.div>
    </motion.div>
  );
}
