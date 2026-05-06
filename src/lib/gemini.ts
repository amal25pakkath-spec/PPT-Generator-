import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface SlideData {
  title: string;
  content: string[];
}

export interface PresentationData {
  title: string;
  slides: SlideData[];
  sources: string[];
  suggestedThemeColor?: string;
}

export interface CustomContent {
  type: 'image' | 'text';
  data: string;
  targetSlide: number;
  mode: 'exact' | 'bullet';
}

export async function generatePresentation(
  topic: string, 
  options: { 
    numSlides: number; 
    style: string; 
    eduLevel: string;
    complexity: string;
    studentName: string;
    batch: string;
    institution: string;
    customContent?: CustomContent[];
    visualTemplate?: string;
  }
): Promise<PresentationData> {
  const { numSlides, style, eduLevel, complexity, studentName, batch, institution, customContent, visualTemplate } = options;
  
  const contentContext = customContent?.map(c => 
    `Slide ${c.targetSlide} specialized content (${c.mode} mode): ${c.type === 'text' ? c.data : '[Image data attached below]'}`
  ).join('\n') || 'None provided';

  const images = customContent?.filter(c => c.type === 'image').map(c => ({
    inlineData: {
      mimeType: c.data.split(';')[0].split(':')[1],
      data: c.data.split(',')[1]
    }
  })) || [];

  if (visualTemplate) {
    images.push({
      inlineData: {
        mimeType: visualTemplate.split(';')[0].split(':')[1],
        data: visualTemplate.split(',')[1]
      }
    });
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            text: `Generate a structured, academically accurate presentation for a student.
    Topic: "${topic}"
    Target Education Level: ${eduLevel}
    Tone/Style: ${style}
    Complexity Level: ${complexity}
    Length: Generate exactly ${numSlides} content slides plus Introduction and Conclusion.
    
    Custom Content Instructions:
    ${contentContext}
    
    Visual Template Context:
    ${visualTemplate ? "An image of a visual template/reference is provided. Analyze its aesthetic, color scheme, and layout. Suggested theme color should be extracted from this image (hex code)." : "No specific visual template provided."}

    Academic Requirements:
    1. Content MUST be factually correct and reliable.
    2. Do NOT mention source links or references INSIDE the slide content text.
    3. You MUST provide a separate list of 3-5 real, verifiable academic source URLs (e.g., .edu, .gov, Britannica, ScienceDirect, NASA, etc.). These will be returned in the 'sources' field.

    Structure Requirements:
    1. Slide 1 MUST be a detail-rich Title Slide. It should include the topic and the student details: Name: ${studentName}, Batch: ${batch}, Institution: ${institution}.
    2. Slide 2 MUST be an Introduction slide.
    3. The last slide MUST be a Conclusion slide.
    4. Each slide should have a clear title and 3-5 concise bullet points.
    5. Content complexity should be ${complexity} for ${eduLevel} students.
    6. For any images or visual template provided, naturally integrate analysis into the relevant slides and extract a 'suggestedThemeColor'.`
          },
          ...images
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          suggestedThemeColor: { type: Type.STRING },
          sources: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          slides: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                content: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ["title", "content"],
            },
          },
        },
        required: ["title", "slides", "sources"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("No content generated");
  return JSON.parse(text);
}

export async function generateImage(prompt: string): Promise<string> {
  const cleanPrompt = prompt.trim().replace(/[\n\r]/g, ' ');
  const encodedPrompt = encodeURIComponent(cleanPrompt);
  const uniqueSeed = Math.floor(Math.random() * 1000000000);
  
  // Directly return the URL. Polinations.ai works best when accessed via <img> tags directly.
  // We use Flux model for high quality.
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&seed=${uniqueSeed}&model=flux`;
  
  return imageUrl;
}
