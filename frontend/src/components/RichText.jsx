import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * Renders text with inline LaTeX maths.
 *
 * Supports $...$ / \(...\) for inline and $$...$$ / \[...\] for display mode.
 *
 * KaTeX rather than MathJax on purpose: it renders synchronously, so a card in
 * the autoplay slideshow paints its formula in the same frame as the rest of
 * the card instead of visibly reflowing a beat later.
 */

const SEGMENT = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+?\$|\\\([\s\S]+?\\\))/g;

function parse(text) {
  if (!text) return [];

  return text.split(SEGMENT).filter(Boolean).map((chunk) => {
    const display =
      (chunk.startsWith("$$") && chunk.endsWith("$$")) ||
      (chunk.startsWith("\\[") && chunk.endsWith("\\]"));
    const inline =
      (chunk.startsWith("$") && chunk.endsWith("$") && !display) ||
      (chunk.startsWith("\\(") && chunk.endsWith("\\)"));

    if (!display && !inline) return { type: "text", value: chunk };

    const body = display ? chunk.slice(2, -2) : chunk.startsWith("\\(") ? chunk.slice(2, -2) : chunk.slice(1, -1);

    try {
      return {
        type: "math",
        display,
        html: katex.renderToString(body, { displayMode: display, throwOnError: false }),
      };
    } catch {
      // Malformed maths shows as the raw source rather than blowing up the card.
      return { type: "text", value: chunk };
    }
  });
}

export default function RichText({ text, className = "" }) {
  const segments = useMemo(() => parse(text), [text]);

  return (
    <span className={`rich-text ${className}`}>
      {segments.map((segment, index) =>
        segment.type === "math" ? (
          <span
            key={index}
            className={segment.display ? "rich-math-block" : "rich-math-inline"}
            // KaTeX output is generated from the user's own card text, and
            // throwOnError:false means it never emits anything but markup.
            dangerouslySetInnerHTML={{ __html: segment.html }}
          />
        ) : (
          <span key={index}>{segment.value}</span>
        )
      )}
    </span>
  );
}
