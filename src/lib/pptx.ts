import pptxgen from "pptxgenjs";
import { PresentationData } from "./gemini";

export async function exportToPptx(data: PresentationData, themeColor: string = "#3b82f6", images: Record<number, string> = {}) {
  const pptx = new pptxgen();
  const hexColor = themeColor.replace("#", "");

  // Set presentation properties
  pptx.title = data.title;

  // Render slides
  data.slides.forEach((slide, index) => {
    const s = pptx.addSlide();
    const hasImage = !!images[index];
    
    // Add slide title
    s.addText(slide.title, {
      x: 0.5,
      y: 0.5,
      w: hasImage ? "50%" : "90%",
      fontSize: 32,
      bold: true,
      color: hexColor,
    });

    // Add bullet points
    s.addText(
      slide.content.map((point) => ({ text: point, options: { bullet: true, margin: 5 } })),
      {
        x: 0.5,
        y: 1.5,
        w: hasImage ? "45%" : "90%",
        h: "70%",
        fontSize: 18,
        color: "444444",
        valign: "top",
      }
    );

    // Add Image if exists
    if (hasImage) {
      s.addImage({
        path: images[index],
        x: "55%",
        y: 1.5,
        w: "40%",
        h: "60%",
      });
    }
  });

  // Add Sources & References Slide
  if (data.sources && data.sources.length > 0) {
    const refSlide = pptx.addSlide();
    refSlide.addText("Sources & References", {
      x: 0.5,
      y: 0.5,
      w: "90%",
      fontSize: 32,
      bold: true,
      color: hexColor,
    });

    refSlide.addText(
      data.sources.map((source) => ({ text: source, options: { bullet: true, margin: 5, color: "0000FF" } })),
      {
        x: 0.5,
        y: 1.5,
        w: "90%",
        h: "70%",
        fontSize: 14,
        color: "444444",
        valign: "top",
      }
    );
  }

  // Save the file
  await pptx.writeFile({ fileName: `${data.title.replace(/\s+/g, "_")}.pptx` });
}
