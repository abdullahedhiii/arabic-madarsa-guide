import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
const MAX_PAGES = 5;

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

async function requestJson(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  const isJson = contentType.includes("application/json");
  const data = text && isJson ? JSON.parse(text) : null;

  if (!response.ok) {
    const detail = data?.detail || response.statusText || "Request failed";
    throw new Error(Array.isArray(detail) ? detail.map((item) => item.msg).join(", ") : detail);
  }

  if (text && !isJson) {
    throw new Error("The app reached a page instead of the backend API. Please check that the backend is running and VITE_API_BASE_URL points to FastAPI.");
  }

  return data;
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderArabicAwareText(value = "") {
  const parts = String(value).split(/([\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff][\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\s\u064b-\u065f\u0670]*)/g);

  return parts.map((part, index) => {
    if (/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/.test(part)) {
      return (
        <span className="arabic-inline" key={`${part}-${index}`}>
          {part}
        </span>
      );
    }

    return part;
  });
}

function markdownToHtml(markdown = "") {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let inList = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      continue;
    }

    if (line.startsWith("<!--")) {
      html.push(`<p class="pill">${escapeHtml(line.replace(/[<!\->]/g, "").trim())}</p>`);
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      const level = heading[1].length;
      html.push(`<h${level}>${escapeHtml(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${escapeHtml(bullet[1])}</li>`);
      continue;
    }

    if (inList) {
      html.push("</ul>");
      inList = false;
    }
    html.push(`<p>${escapeHtml(line)}</p>`);
  }

  if (inList) html.push("</ul>");
  return html.join("");
}

function parsePageRange(startValue, endValue) {
  const startPage = Number.parseInt(startValue, 10);
  const endPage = Number.parseInt(endValue, 10);

  if (!Number.isInteger(startPage) || !Number.isInteger(endPage)) {
    throw new Error("Enter a valid start and end page.");
  }

  if (startPage <= 0 || endPage <= 0) {
    throw new Error("Page numbers must start from 1.");
  }

  if (endPage < startPage) {
    throw new Error("End page must be greater than or equal to start page.");
  }

  const pageCount = endPage - startPage + 1;
  if (pageCount > MAX_PAGES) {
    throw new Error(`Select a maximum of ${MAX_PAGES} pages for this demo.`);
  }

  return Array.from({ length: pageCount }, (_, index) => startPage + index);
}

function StatusBox({ status }) {
  return (
    <div className={`status-box ${status.type || ""}`.trim()} role="status" aria-live="polite">
      {status.message}
    </div>
  );
}

function EmptyState({ mark, title, children }) {
  return (
    <div className="empty-state">
      <span className="empty-mark">{mark}</span>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}

function PagePreview({ bookId, pages, onOpenPage }) {
  if (!bookId || pages.length === 0) {
    return (
      <div className="page-preview-empty">
        Select a valid range to preview pages.
      </div>
    );
  }

  return (
    <div className="page-preview-grid" aria-label="Selected page previews">
      {pages.map((page) => (
        <button
          className="page-preview-card"
          key={`${bookId}-${page}`}
          type="button"
          onClick={() => onOpenPage(page)}
          aria-label={`Open page ${page} preview`}
        >
          <img src={apiUrl(`/books/${encodeURIComponent(bookId)}/pages/${page}/preview`)} alt={`Page ${page} preview`} />
          <figcaption>Page {page}</figcaption>
        </button>
      ))}
    </div>
  );
}

function PreviewModal({ bookId, page, onClose }) {
  if (!bookId || !page) return null;

  return (
    <div className="preview-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Page ${page} preview`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="preview-modal-header">
          <div>
            <p className="eyebrow">Page preview</p>
            <h2>Page {page}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close preview">
            X
          </button>
        </div>
        <img
          src={apiUrl(`/books/${encodeURIComponent(bookId)}/pages/${page}/preview`)}
          alt={`Large preview of page ${page}`}
        />
      </section>
    </div>
  );
}

function SourcePagesViewer({ lesson }) {
  const [isOpen, setIsOpen] = useState(false);
  const [openPreviewPage, setOpenPreviewPage] = useState(null);
  const bookId = lesson?.book_id;
  const pages = Array.isArray(lesson?.pages) ? lesson.pages : [];

  if (!bookId || pages.length === 0) return null;

  return (
    <>
      <button className="source-pages-button" type="button" onClick={() => setIsOpen(true)}>
        View source pages
      </button>

      {isOpen && (
        <div className="source-pages-backdrop" role="presentation" onClick={() => setIsOpen(false)}>
          <section
            className="source-pages-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Source textbook pages"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="source-pages-header">
              <div>
                <p className="eyebrow">Original pages</p>
                <h2>Read these pages</h2>
                <p>This lesson was generated from these textbook pages.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setIsOpen(false)} aria-label="Close source pages">
                X
              </button>
            </div>
            <PagePreview bookId={bookId} pages={pages} onOpenPage={setOpenPreviewPage} />
          </section>
        </div>
      )}

      <PreviewModal bookId={bookId} page={openPreviewPage} onClose={() => setOpenPreviewPage(null)} />
    </>
  );
}

function ListSection({ title, items, renderItem }) {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <section className="section">
      <h3>{title}</h3>
      <div className="section-grid">{items.map(renderItem)}</div>
    </section>
  );
}

function Flashcard({ card, index }) {
  const [isFlipped, setIsFlipped] = useState(false);

  return (
    <button
      className={`flashcard ${isFlipped ? "flipped" : ""}`}
      type="button"
      onClick={() => setIsFlipped((value) => !value)}
      aria-label={`Flip flashcard ${index + 1}`}
    >
      <span className="flashcard-corner">Card {index + 1}</span>
      <span className="flashcard-face flashcard-front">
        {card.arabic_focus && <span className="flashcard-arabic">{card.arabic_focus}</span>}
        <span className="flashcard-prompt">{renderArabicAwareText(card.front || "Review this concept")}</span>
        <span className="flashcard-hint">Click to reveal</span>
      </span>
      <span className="flashcard-face flashcard-back">
        <span className="flashcard-answer">{renderArabicAwareText(card.back || "No answer provided.")}</span>
        {card.arabic_focus && <span className="flashcard-focus">{card.arabic_focus}</span>}
        <span className="flashcard-hint">Click to flip back</span>
      </span>
    </button>
  );
}

function getMiniLessonSteps(miniLesson) {
  return Array.isArray(miniLesson?.step_by_step_explanation) ? miniLesson.step_by_step_explanation.filter(Boolean) : [];
}

function getRecapItems(miniLesson) {
  return Array.isArray(miniLesson?.tiny_recap) ? miniLesson.tiny_recap.filter(Boolean) : [];
}

function lessonHasDiagram(diagram) {
  return Boolean(diagram && (diagram.title || diagram.purpose || diagram.source_example || diagram.nodes?.length || diagram.connections?.length));
}

function diagramLabel(diagram) {
  return (diagram?.type || "diagram").replaceAll("_", " ");
}

function diagramNodeContent(node) {
  return (
    <>
      {node.arabic && <span className="diagram-arabic">{node.arabic}</span>}
      <strong>{node.label || node.english || node.id}</strong>
      {node.english && node.english !== node.label && <small>{renderArabicAwareText(node.english)}</small>}
      {node.role && <em>{renderArabicAwareText(node.role)}</em>}
    </>
  );
}

function DiagramView({ diagram }) {
  if (!lessonHasDiagram(diagram)) return null;

  const nodes = diagram.nodes || [];
  const connections = diagram.connections || [];
  const incomingIds = new Set(connections.map((connection) => connection.to));
  const rootNodes = nodes.filter((node) => !incomingIds.has(node.id));
  const visibleRoots = rootNodes.length ? rootNodes : nodes.slice(0, 1);
  const style = diagram.type || "diagram";

  function childrenFor(nodeId) {
    return connections
      .filter((connection) => connection.from === nodeId)
      .map((connection) => ({
        connection,
        node: nodes.find((item) => item.id === connection.to),
      }))
      .filter((item) => item.node);
  }

  if (style === "classification_tree") {
    return (
      <section className="diagram-card diagram-tree classification-tree">
        {visibleRoots.map((root) => (
          <div className="tree-group" key={root.id}>
            <div className="tree-root-wrap">
              <span className="tree-label">Main idea</span>
              <div className="diagram-node root-node">{diagramNodeContent(root)}</div>
            </div>
            <div className="tree-helper">splits into</div>
            <div className="tree-branches">
              {childrenFor(root.id).map(({ connection, node }, index) => (
                <div className="tree-branch" key={`${connection.from}-${connection.to}`}>
                  <span className="connection-label">{connection.label ? renderArabicAwareText(connection.label) : `Type ${index + 1}`}</span>
                  <div className="diagram-node">{diagramNodeContent(node)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    );
  }

  if (style === "timeline" || style === "flowchart") {
    return (
      <section className={`diagram-card ${style === "timeline" ? "diagram-timeline" : "diagram-flow"}`}>
        {nodes.map((node, index) => (
          <div className="diagram-step" key={node.id || index}>
            <span className="step-number">{index + 1}</span>
            <div className="diagram-node">{diagramNodeContent(node)}</div>
          </div>
        ))}
      </section>
    );
  }

  if (style === "comparison_cards") {
    return (
      <section className="diagram-card diagram-comparison">
        {nodes.map((node) => (
          <article className="diagram-node comparison-node" key={node.id}>
            {diagramNodeContent(node)}
          </article>
        ))}
      </section>
    );
  }

  if (style === "morphology_breakdown") {
    return (
      <section className="diagram-card morphology-strip">
        {nodes.map((node) => (
          <div className="morph-part" key={node.id}>
            {diagramNodeContent(node)}
          </div>
        ))}
      </section>
    );
  }

  if (style === "iraab_color_diagram") {
    return (
      <section className="diagram-card iraab-grid">
        {nodes.map((node) => (
          <div className={`iraab-chip ${node.color_hint || ""}`} key={node.id}>
            {diagramNodeContent(node)}
          </div>
        ))}
      </section>
    );
  }

  return (
    <section className="diagram-card relationship-map">
      <div className="relationship-nodes">
        {nodes.map((node) => (
          <div className="diagram-node" key={node.id}>
            {diagramNodeContent(node)}
          </div>
        ))}
      </div>
      {connections.length > 0 && (
        <div className="relationship-lines">
          {connections.map((connection, index) => {
            const from = nodes.find((node) => node.id === connection.from);
            const to = nodes.find((node) => node.id === connection.to);

            return (
              <div className="relationship-line" key={`${connection.from}-${connection.to}-${index}`}>
                <span>{renderArabicAwareText(from?.label || from?.arabic || connection.from)}</span>
                <strong>{connection.label ? renderArabicAwareText(connection.label) : "connects to"}</strong>
                <span>{renderArabicAwareText(to?.label || to?.arabic || connection.to)}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MiniLessonPanel({ miniLesson, legacyNotes }) {
  const steps = getMiniLessonSteps(miniLesson);
  const recapItems = getRecapItems(miniLesson);

  if (!miniLesson && legacyNotes?.length) {
    return (
      <div className="notes-list">
        {legacyNotes.map((note, index) => (
          <article className="note-card" key={`note-${index}`}>
            <span className="note-number">{index + 1}</span>
            <h4>{renderArabicAwareText(note.heading || "Note")}</h4>
            {note.explanation && <p>{renderArabicAwareText(note.explanation)}</p>}
            {(note.examples || []).length > 0 && (
              <div className="example-strip">
                {(note.examples || []).map((example, exampleIndex) => (
                  <div className="example-chip" key={`note-${index}-example-${exampleIndex}`}>
                    {example.arabic && <span className="arabic">{example.arabic}</span>}
                    {example.english && <span>{renderArabicAwareText(example.english)}</span>}
                    {example.note && <small>{renderArabicAwareText(example.note)}</small>}
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    );
  }

  return (
    <div className="mini-lesson-layout">
      {miniLesson?.simple_intro && (
        <article className="lesson-intro-card">
          <p className="eyebrow">Big idea</p>
          <p>{renderArabicAwareText(miniLesson.simple_intro)}</p>
        </article>
      )}

      {steps.length > 0 && (
        <div className="lesson-steps">
          {steps.map((step, index) => (
            <article className="step-card" key={`step-${index}`}>
              <span className="note-number">{index + 1}</span>
              <p>{renderArabicAwareText(step)}</p>
            </article>
          ))}
        </div>
      )}

      <div className="interactive-grid">
        {miniLesson?.think_about_it && (
          <article className="interactive-card">
            <p className="eyebrow">Think about it</p>
            <h4>{renderArabicAwareText(miniLesson.think_about_it.question)}</h4>
            {miniLesson.think_about_it.hint && <p><strong>Hint:</strong> {renderArabicAwareText(miniLesson.think_about_it.hint)}</p>}
            {miniLesson.think_about_it.answer && <p className="muted"><strong>Answer:</strong> {renderArabicAwareText(miniLesson.think_about_it.answer)}</p>}
          </article>
        )}

        {miniLesson?.try_it_yourself && (
          <article className="interactive-card try-card">
            <p className="eyebrow">Try it yourself</p>
            <h4>{renderArabicAwareText(miniLesson.try_it_yourself.task)}</h4>
            {miniLesson.try_it_yourself.expected_answer && <p><strong>Expected:</strong> {renderArabicAwareText(miniLesson.try_it_yourself.expected_answer)}</p>}
            {miniLesson.try_it_yourself.simple_reason && <p className="muted">{renderArabicAwareText(miniLesson.try_it_yourself.simple_reason)}</p>}
          </article>
        )}

        {miniLesson?.common_mistake && (
          <article className="interactive-card mistake-card">
            <p className="eyebrow">Common mistake</p>
            <p>{renderArabicAwareText(miniLesson.common_mistake.mistake)}</p>
            {miniLesson.common_mistake.correction && <p><strong>Fix:</strong> {renderArabicAwareText(miniLesson.common_mistake.correction)}</p>}
          </article>
        )}
      </div>

      {recapItems.length > 0 && (
        <article className="recap-card">
          <p className="eyebrow">Tiny recap</p>
          <ul>
            {recapItems.map((item, index) => (
              <li key={`recap-${index}`}>{renderArabicAwareText(item)}</li>
            ))}
          </ul>
        </article>
      )}
    </div>
  );
}

function normalizeLessonSections(result = {}) {
  if (Array.isArray(result.sections) && result.sections.length > 0) {
    return result.sections.map((section, index) => ({
      ...section,
      section_id: section.section_id || `section-${index + 1}`,
      title: section.title || `Lesson section ${index + 1}`,
    }));
  }

  return [{
    ...result,
    section_id: "section-1",
    title: result.title || "Today's lesson",
  }];
}

function sectionStepCount(section) {
  return getMiniLessonSteps(section.mini_lesson).length || section.revision_notes?.length || 0;
}

function sectionSummary(section) {
  return section.summary || section.mini_lesson?.simple_intro || "";
}

function sectionHasContent(section) {
  return Boolean(
    section.title ||
    sectionSummary(section) ||
    sectionStepCount(section) ||
    lessonHasDiagram(section.diagram) ||
    ["flashcards", "key_terms", "word_help", "quiz", "exercise_answers"].some(
      (key) => Array.isArray(section[key]) && section[key].length > 0,
    ),
  );
}

function LessonSectionChooser({ sections, selectedId, onSelect }) {
  if (sections.length <= 1) return null;

  return (
    <section className="section-picker" aria-label="Lesson sections">
      <div className="section-picker-heading">
        <div>
          <p className="eyebrow">Step 1</p>
          <h3>Choose a section</h3>
        </div>
        <p>Each section is a small lesson. Pick one, then use the study buttons below.</p>
      </div>
      <div className="section-picker-grid">
        {sections.map((section, index) => (
          <button
            className={`section-picker-card ${selectedId === section.section_id ? "active" : ""}`}
            type="button"
            key={section.section_id}
            onClick={() => onSelect(section.section_id)}
          >
            <span>Section {index + 1}</span>
            <strong>{section.title}</strong>
            {sectionSummary(section) && <small>{renderArabicAwareText(sectionSummary(section))}</small>}
          </button>
        ))}
      </div>
    </section>
  );
}

function normalizeAnswer(value = "") {
  return String(value).trim().toLowerCase();
}

function QuizQuestion({ quiz, index }) {
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [isRevealed, setIsRevealed] = useState(false);
  const options = Array.isArray(quiz.options) ? quiz.options.filter(Boolean) : [];
  const correctAnswer = quiz.correct_answer || quiz.answer || "";
  const explanation = quiz.simple_explanation || quiz.explanation || "";
  const hasOptions = options.length > 0;
  const isAnswered = Boolean(selectedAnswer) || isRevealed;
  const isCorrect = selectedAnswer && normalizeAnswer(selectedAnswer) === normalizeAnswer(correctAnswer);

  return (
    <article className="quiz-card">
      <span className="pill">{(quiz.type || quiz.question_type || `Question ${index + 1}`).replaceAll("_", " ")}</span>
      <h4>{renderArabicAwareText(quiz.question || `Question ${index + 1}`)}</h4>

      {hasOptions ? (
        <div className="quiz-option-grid">
          {options.map((option, optionIndex) => {
            const optionIsSelected = selectedAnswer === option;
            const optionIsCorrect = isAnswered && normalizeAnswer(option) === normalizeAnswer(correctAnswer);
            const optionIsWrong = optionIsSelected && !optionIsCorrect;

            return (
              <button
                className={`quiz-option-button ${optionIsSelected ? "selected" : ""} ${optionIsCorrect ? "correct" : ""} ${optionIsWrong ? "incorrect" : ""}`}
                type="button"
                key={`quiz-${index}-option-${optionIndex}`}
                onClick={() => setSelectedAnswer(option)}
              >
                <span>{String.fromCharCode(65 + optionIndex)}</span>
                <strong>{renderArabicAwareText(option)}</strong>
              </button>
            );
          })}
        </div>
      ) : (
        <button className="show-answer-button" type="button" onClick={() => setIsRevealed(true)}>
          Show answer
        </button>
      )}

      {isAnswered && (
        <div className={`quiz-feedback ${isCorrect || isRevealed ? "correct" : "incorrect"}`}>
          {hasOptions && (
            <strong>{isCorrect ? "Correct." : "Not quite."}</strong>
          )}
          {correctAnswer && <p><span>Answer:</span> {renderArabicAwareText(correctAnswer)}</p>}
          {explanation && <p>{renderArabicAwareText(explanation)}</p>}
        </div>
      )}
    </article>
  );
}

function StudyNextAction({ nextSection, onNext }) {
  if (!nextSection) {
    return (
      <div className="study-next-action done">
        <div>
          <strong>Section complete</strong>
          <span>You reached the end of this study path.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="study-next-action">
      <div>
        <strong>Ready for the next step?</strong>
        <span>Move to {nextSection.label.toLowerCase()} when this page feels clear.</span>
      </div>
      <button className="primary-button compact" type="button" onClick={onNext}>
        Next: {nextSection.label}
      </button>
    </div>
  );
}

function GeneratedContent({ generation }) {
  const [lessonTab, setLessonTab] = useState("overview");
  const result = generation?.result || {};
  const normalizedSections = useMemo(() => normalizeLessonSections(result), [result]);
  const [selectedSectionId, setSelectedSectionId] = useState(normalizedSections[0]?.section_id || "section-1");

  useEffect(() => {
    if (!normalizedSections.some((section) => section.section_id === selectedSectionId)) {
      setSelectedSectionId(normalizedSections[0]?.section_id || "section-1");
      setLessonTab("overview");
    }
  }, [normalizedSections, selectedSectionId]);

  const activeSection = normalizedSections.find((section) => section.section_id === selectedSectionId) || normalizedSections[0] || {};
  const miniLesson = activeSection.mini_lesson || null;
  const legacyNotes = activeSection.revision_notes || [];
  const hasMiniLesson = Boolean(
    miniLesson?.simple_intro ||
    getMiniLessonSteps(miniLesson).length ||
    miniLesson?.think_about_it ||
    miniLesson?.try_it_yourself ||
    miniLesson?.common_mistake ||
    getRecapItems(miniLesson).length,
  );
  const diagram = activeSection.diagram || null;
  const hasDiagram = lessonHasDiagram(diagram);
  const lessonTitle = result.title || activeSection.title || "Learning material";
  const sections = [
    { id: "overview", label: "Overview", helper: "Start with the big idea" },
    { id: "notes", label: "Learn", helper: "Read the explanation" },
    ...(hasDiagram ? [{ id: "diagram", label: "Diagram", helper: "See the idea visually" }] : []),
    { id: "flashcards", label: "Cards", helper: "Tap to remember" },
    { id: "terms", label: "Words", helper: "Important vocabulary" },
    { id: "quiz", label: "Quiz", helper: "Check yourself" },
    { id: "exercises", label: "Answers", helper: "Workbook help" },
  ];
  const currentSectionIndex = sections.findIndex((section) => section.id === lessonTab);
  const nextStudySection = sections[currentSectionIndex + 1] || null;

  const hasAnySection = normalizedSections.some(sectionHasContent);

  if (!hasAnySection) {
    return (
      <section className="summary-card">
        <h2>This lesson is empty</h2>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </section>
    );
  }

  return (
    <div className="lesson-viewer">
      <section className="lesson-hero">
        <div>
          <p className="eyebrow">Your lesson</p>
          <h2>{lessonTitle}</h2>
          <p>Pick one section and follow the buttons from left to right: overview, learn, cards, words, then quiz.</p>
        </div>
        {activeSection.difficulty_level && <span className="difficulty-pill">{activeSection.difficulty_level}</span>}
      </section>

      <LessonSectionChooser
        sections={normalizedSections}
        selectedId={activeSection.section_id}
        onSelect={(sectionId) => {
          setSelectedSectionId(sectionId);
          setLessonTab("overview");
        }}
      />

      <section className="study-layout">
        <aside className="study-sidebar" aria-label="Study menu">
          <p className="eyebrow">Study menu</p>
          {sections.map((section) => (
            <button
              className={`study-menu-item ${lessonTab === section.id ? "active" : ""}`}
              type="button"
              key={section.id}
              onClick={() => setLessonTab(section.id)}
            >
              <strong>{section.label}</strong>
              <span>{section.helper}</span>
            </button>
          ))}
        </aside>

        <div className="study-content">
          {lessonTab === "overview" && (
            <section className="lesson-panel">
              <p className="eyebrow">Summary</p>
              <h3>{activeSection.title || "Today's lesson"}</h3>
              <p>{renderArabicAwareText(sectionSummary(activeSection) || "No summary was returned for this lesson section.")}</p>
            </section>
          )}

          {lessonTab === "notes" && (
            <section className="lesson-panel">
              <div className="lesson-section-heading">
                <p className="eyebrow">Mini lesson</p>
                <h3>Learn step by step</h3>
              </div>
              <MiniLessonPanel miniLesson={miniLesson} legacyNotes={legacyNotes} />
            </section>
          )}

          {lessonTab === "diagram" && hasDiagram && (
            <section className="lesson-panel">
              <div className="lesson-section-heading">
                <p className="eyebrow">{diagramLabel(diagram)}</p>
                <h3>{diagram.title || "Lesson diagram"}</h3>
                {diagram.purpose && <p>{renderArabicAwareText(diagram.purpose)}</p>}
                {diagram.source_example && <p className="diagram-source">{renderArabicAwareText(diagram.source_example)}</p>}
              </div>
              <DiagramView diagram={diagram} />
              {Array.isArray(diagram.notes) && diagram.notes.length > 0 && (
                <ul className="diagram-notes">
                  {diagram.notes.map((note, index) => (
                    <li key={`diagram-note-${index}`}>{renderArabicAwareText(note)}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {lessonTab === "flashcards" && (
            <section className="lesson-panel">
              <div className="lesson-section-heading">
                <p className="eyebrow">Practice</p>
                <h3>Tap a card to flip it</h3>
              </div>
              <div className="flashcard-grid">
                {(activeSection.flashcards || []).map((card, index) => (
                  <Flashcard card={card} index={index} key={`flashcard-${index}`} />
                ))}
              </div>
            </section>
          )}

          {lessonTab === "terms" && (
            <section className="lesson-panel">
              <div className="lesson-section-heading">
                <p className="eyebrow">Vocabulary</p>
                <h3>Helpful words</h3>
              </div>
              {Array.isArray(activeSection.word_help) && activeSection.word_help.length > 0 && (
                <div className="word-help-grid">
                  {activeSection.word_help.map((word, index) => (
                    <article className="word-help-card" key={`word-help-${index}`}>
                      {word.arabic && <p className="arabic">{word.arabic}</p>}
                      <div>
                        <h4>{word.english || "Helpful word"}</h4>
                        {word.transliteration && <span>{word.transliteration}</span>}
                      </div>
                      {word.kid_note && <p>{renderArabicAwareText(word.kid_note)}</p>}
                      {word.why_it_matters && <small>{renderArabicAwareText(word.why_it_matters)}</small>}
                    </article>
                  ))}
                </div>
              )}
              <div className="term-grid">
                {(activeSection.key_terms || []).map((term, index) => (
                  <article className="term-card" key={`term-${index}`}>
                    {term.arabic && <p className="arabic">{term.arabic}</p>}
                    <h4>{term.english || "Term"}</h4>
                    <p>{renderArabicAwareText(term.simple_explanation)}</p>
                    {term.example_from_text && <small>{renderArabicAwareText(term.example_from_text)}</small>}
                  </article>
                ))}
              </div>
            </section>
          )}

          {lessonTab === "quiz" && (
            <section className="lesson-panel">
              <div className="lesson-section-heading">
                <p className="eyebrow">Check understanding</p>
                <h3>Try the quiz</h3>
              </div>
              <div className="quiz-list">
                {(activeSection.quiz || []).map((quiz, index) => (
                  <QuizQuestion quiz={quiz} index={index} key={`quiz-${index}`} />
                ))}
              </div>
            </section>
          )}

          {lessonTab === "exercises" && (
            <section className="lesson-panel">
              <div className="lesson-section-heading">
                <p className="eyebrow">Workbook</p>
                <h3>Exercise answers</h3>
              </div>
              <div className="exercise-list">
                {(activeSection.exercise_answers || []).map((exercise, index) => (
                  <article className="exercise-card" key={`exercise-${index}`}>
                    <span className="pill">Exercise {exercise.exercise_number || index + 1}</span>
                    <h4>{renderArabicAwareText(exercise.question)}</h4>
                    {exercise.answer && <p><strong>Answer:</strong> {renderArabicAwareText(exercise.answer)}</p>}
                    {exercise.reason && <p className="muted">{renderArabicAwareText(exercise.reason)}</p>}
                  </article>
                ))}
              </div>
            </section>
          )}

          <StudyNextAction
            nextSection={nextStudySection}
            onNext={() => setLessonTab(nextStudySection.id)}
          />
        </div>
      </section>
    </div>
  );
}

function LessonPage({ lesson, onBack }) {
  return (
    <main className="lesson-page">
      <div className="lesson-page-topbar">
        <div className="lesson-page-actions">
          <button className="secondary-button compact" type="button" onClick={onBack}>
            Back to dashboard
          </button>
          <SourcePagesViewer lesson={lesson} />
        </div>
        <p>Study mode</p>
      </div>
      <GeneratedContent generation={lesson} />
    </main>
  );
}

function HistoryList({ items, selectedId, isLoading, onRefresh, onOpen }) {
  if (isLoading) {
    return (
      <div className="history-empty">
        Loading saved lessons...
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="history-empty">
        No saved lessons yet.
      </div>
    );
  }

  return (
    <div className="history-list">
      <div className="history-header">
        <div>
          <p className="eyebrow">Saved lessons</p>
          <h2>My lessons</h2>
        </div>
        <button className="secondary-button compact" type="button" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      <div className="history-grid">
        {items.map((item) => (
          <button
            className={`history-card ${selectedId === item.generation_id ? "active" : ""}`}
            type="button"
            key={item.generation_id}
            onClick={() => onOpen(item.generation_id)}
          >
            <div className="history-card-topline">
              <span className="pill">{item.pages?.length ? `Pages ${item.pages.join(", ")}` : "Saved lesson"}</span>
            </div>
            <h3>{item.title}</h3>
            {item.summary && <p className="history-summary">{item.summary}</p>}
            <div className="history-section-list" aria-label="Lesson sections">
              {(item.sections?.length ? item.sections : [{ title: item.title }]).slice(0, 4).map((section, sectionIndex) => (
                <span className="history-section-chip" key={section.section_id || `history-section-${sectionIndex}`}>
                  {section.title || `Section ${sectionIndex + 1}`}
                </span>
              ))}
              {(item.sections?.length || 0) > 4 && (
                <span className="history-section-chip soft">More sections</span>
              )}
            </div>
            <span className="open-lesson-button">Open lesson</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState("extract");
  const [books, setBooks] = useState([]);
  const [bookId, setBookId] = useState("");
  const [startPage, setStartPage] = useState("1");
  const [endPage, setEndPage] = useState("3");
  const [status, setStatus] = useState({ message: "Ready to connect.", type: "" });
  const [isExtracting, setIsExtracting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [extraction, setExtraction] = useState(null);
  const [generation, setGeneration] = useState(null);
  const [currentLesson, setCurrentLesson] = useState(null);
  const [isLessonPageOpen, setIsLessonPageOpen] = useState(false);
  const [openPreviewPage, setOpenPreviewPage] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyGeneration, setHistoryGeneration] = useState(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const selectedBook = useMemo(
    () => books.find((book) => book.book_id === bookId),
    [bookId, books],
  );

  const totalPages = selectedBook?.total_pages || 999;
  const maxStartPage = Math.max(1, totalPages);

  const previewPages = useMemo(() => {
    try {
      return parsePageRange(startPage, endPage).filter((page) => page <= totalPages);
    } catch {
      return [];
    }
  }, [endPage, startPage, totalPages]);

  useEffect(() => {
    const parsedStart = Number.parseInt(startPage, 10);
    const parsedEnd = Number.parseInt(endPage, 10);

    if (Number.isInteger(parsedStart) && parsedStart > totalPages) {
      setStartPage(String(totalPages));
    }

    if (Number.isInteger(parsedEnd) && parsedEnd > totalPages) {
      setEndPage(String(totalPages));
    }
  }, [endPage, startPage, totalPages]);

  function selectBook(nextBookId, nextBooks = books) {
    const nextBook = nextBooks.find((book) => book.book_id === nextBookId);
    const nextTotalPages = nextBook?.total_pages || 999;

    setBookId(nextBookId);
    setStartPage("1");
    setEndPage(String(Math.min(3, nextTotalPages)));
    setExtraction(null);
    setGeneration(null);
    setCurrentLesson(null);
    setIsLessonPageOpen(false);
    setOpenPreviewPage(null);
  }

  async function loadBooks() {
    setStatus({ message: "Loading available books...", type: "" });

    try {
      const data = await requestJson("/books");
      setBooks(data || []);
      selectBook(data?.[0]?.book_id || "", data || []);

      if (!data?.length) {
        setStatus({ message: "No PDF books were found in backend storage.", type: "error" });
        return;
      }

      setStatus({
        message: `${data.length} book${data.length === 1 ? "" : "s"} ready for extraction.`,
        type: "success",
      });
    } catch (error) {
      setBooks([]);
      setBookId("");
      setStatus({ message: error.message, type: "error" });
    }
  }

  useEffect(() => {
    loadBooks();
    loadHistory();
  }, []);

  async function loadHistory() {
    setIsHistoryLoading(true);

    try {
      const data = await requestJson("/generations");
      setHistoryItems(data || []);
    } catch (error) {
      setStatus({ message: error.message, type: "error" });
    } finally {
      setIsHistoryLoading(false);
    }
  }

  async function openHistoryGeneration(generationId) {
    try {
      setStatus({ message: "Opening lesson...", type: "" });

      const data = await requestJson(`/generations/${encodeURIComponent(generationId)}`);
      setHistoryGeneration(data);
      setCurrentLesson(data);
      setIsLessonPageOpen(true);
      setStatus({ message: "Lesson opened.", type: "success" });
    } catch (error) {
      setStatus({ message: error.message, type: "error" });
    }
  }

  async function extractPages() {
    try {
      const pages = parsePageRange(startPage, endPage);
      if (!bookId) throw new Error("Choose a book before extracting pages.");
      if (pages.some((page) => page > totalPages)) {
        throw new Error(`Selected page range exceeds this book's ${totalPages} pages.`);
      }

      setIsExtracting(true);
      setStatus({ message: "Reading the selected pages. This may take a little while.", type: "" });

      const data = await requestJson("/extract", {
        method: "POST",
        body: JSON.stringify({ book_id: bookId, pages }),
      });

      setExtraction(data);
      setGeneration(null);
      setCurrentLesson(null);
      setStatus({ message: "Pages are ready. Build the lesson when you are happy with them.", type: "success" });
      setActiveTab("extract");
    } catch (error) {
      setStatus({ message: error.message, type: "error" });
    } finally {
      setIsExtracting(false);
    }
  }

  async function generateContent() {
    if (!extraction?.extraction_id) {
      setStatus({ message: "Run an extraction before generating content.", type: "error" });
      return;
    }

    try {
      setIsGenerating(true);
      setStatus({ message: "Generating learning material from the extraction.", type: "" });

      const data = await requestJson("/generate", {
        method: "POST",
        body: JSON.stringify({ extraction_id: extraction.extraction_id }),
      });

      setGeneration(data);
      setCurrentLesson(data);
      setIsLessonPageOpen(true);
      loadHistory();
      setStatus({ message: "Your lesson is ready.", type: "success" });
    } catch (error) {
      setStatus({ message: error.message, type: "error" });
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    isLessonPageOpen && currentLesson ? (
      <LessonPage
        lesson={currentLesson}
        onBack={() => {
          setIsLessonPageOpen(false);
          setActiveTab("history");
        }}
      />
    ) : (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Arabic learning content studio</p>
          <h1>Arabic Madrasa Guide</h1>
          <p className="subtitle">
            Choose a few textbook pages and turn them into a simple study lesson with notes, cards, words, and a quiz.
          </p>
        </div>
        <div className="hero-panel" aria-label="Workflow summary">
          <div>
            <span className="metric">5</span>
            <span className="metric-label">page demo limit</span>
          </div>
          <div>
            <span className="metric">Text</span>
            <span className="metric-label">from book pages</span>
          </div>
          <div>
            <span className="metric">Study</span>
            <span className="metric-label">lesson builder</span>
          </div>
        </div>
      </section>

      <section className="workspace">
        <aside className="control-panel" aria-label="Extraction controls">
          <div className="panel-heading">
            <p className="eyebrow">Book</p>
            <h2>Choose pages</h2>
          </div>

          <div className="field">
            <div className="field-row">
              <span>Book</span>
              <button className="icon-button" type="button" title="Refresh books" aria-label="Refresh books" onClick={loadBooks}>
                R
              </button>
            </div>
            <select value={bookId} onChange={(event) => selectBook(event.target.value)}>
              {books.length === 0 ? (
                <option value="">No books loaded</option>
              ) : (
                books.map((book) => (
                  <option value={book.book_id} key={book.book_id}>
                    {book.book_title || book.title || book.book_id}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="field">
            <span>Which pages?</span>
            <div className="range-row">
              <label>
                <span>From</span>
                <input
                  type="number"
                  min="1"
                  max={maxStartPage}
                  value={startPage}
                  onChange={(event) => setStartPage(event.target.value)}
                />
              </label>
              <label>
                <span>To</span>
                <input
                  type="number"
                  min="1"
                  max={totalPages}
                  value={endPage}
                  onChange={(event) => setEndPage(event.target.value)}
                />
              </label>
            </div>
            <small>
              Maximum {MAX_PAGES} pages per extraction
              {selectedBook?.total_pages ? ` | ${selectedBook.total_pages} pages in this book` : ""}.
            </small>
          </div>

          <div className="field">
            <span>Check pages</span>
            <PagePreview bookId={bookId} pages={previewPages} onOpenPage={setOpenPreviewPage} />
          </div>

          <button className="primary-button" type="button" onClick={extractPages} disabled={isExtracting}>
            {isExtracting ? "Reading pages..." : "Read these pages"}
          </button>

          <StatusBox status={status} />
        </aside>

        <section className="result-panel" aria-label="Results">
          <div className="tabs" role="tablist" aria-label="Result views">
            <button className={`tab ${activeTab === "extract" ? "active" : ""}`} type="button" onClick={() => setActiveTab("extract")}>
              Create lesson
            </button>
            <button
              className={`tab ${activeTab === "lesson" ? "active" : ""}`}
              type="button"
              onClick={() => {
                if (currentLesson) {
                  setIsLessonPageOpen(true);
                } else {
                  setActiveTab("lesson");
                }
              }}
            >
              Lesson
            </button>
            <button className={`tab ${activeTab === "history" ? "active" : ""}`} type="button" onClick={() => setActiveTab("history")}>
              My lessons
            </button>
          </div>

          {activeTab === "extract" && (
            <div className="tab-view active">
              {!extraction ? (
                <EmptyState mark="AR" title="Select a book and pages to begin">
                  The page text will appear here before you build the lesson.
                </EmptyState>
              ) : (
                <>
                  <div className="result-toolbar">
                    <div>
                      <p className="eyebrow">Pages ready</p>
                      <h2>Check the page text</h2>
                      <p className="muted">
                        Book: {extraction.book_id} | Pages: {extraction.pages.join(", ")}
                      </p>
                    </div>
                    <button className="secondary-button" type="button" onClick={generateContent} disabled={isGenerating}>
                      {isGenerating ? "Building lesson..." : "Build lesson"}
                    </button>
                  </div>
                  <article className="markdown-card" dangerouslySetInnerHTML={{ __html: markdownToHtml(extraction.markdown) }} />
                </>
              )}
            </div>
          )}

          {activeTab === "lesson" && (
            <div className="tab-view active">
              {!currentLesson ? (
                <EmptyState mark="OK" title="No lesson open yet">
                  Create a new lesson or open one from My lessons.
                </EmptyState>
              ) : (
                <GeneratedContent generation={currentLesson} />
              )}
            </div>
          )}

          {activeTab === "history" && (
            <div className="tab-view active">
              <HistoryList
                items={historyItems}
                selectedId={historyGeneration?.generation_id}
                isLoading={isHistoryLoading}
                onRefresh={loadHistory}
                onOpen={openHistoryGeneration}
              />

              {!historyGeneration && (
                <EmptyState mark="HI" title="Choose a lesson">
                  Select a saved lesson to open it in study mode.
                </EmptyState>
              )}
            </div>
          )}
        </section>
      </section>

      <PreviewModal bookId={bookId} page={openPreviewPage} onClose={() => setOpenPreviewPage(null)} />
    </main>
    )
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
