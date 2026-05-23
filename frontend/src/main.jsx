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

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const detail = data?.detail || response.statusText || "Request failed";
    throw new Error(Array.isArray(detail) ? detail.map((item) => item.msg).join(", ") : detail);
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

function GeneratedContent({ generation }) {
  const [lessonTab, setLessonTab] = useState("overview");
  const result = generation?.result || {};
  const sections = [
    { id: "overview", label: "Overview", count: result.summary || result.title ? 1 : 0 },
    { id: "notes", label: "Learn", count: result.revision_notes?.length || 0 },
    { id: "flashcards", label: "Practice cards", count: result.flashcards?.length || 0 },
    { id: "terms", label: "Words", count: result.key_terms?.length || 0 },
    { id: "quiz", label: "Quiz", count: result.quiz?.length || 0 },
    { id: "exercises", label: "Answers", count: result.exercise_answers?.length || 0 },
  ];

  const hasAnySection =
    result.title ||
    result.summary ||
    ["revision_notes", "flashcards", "key_terms", "quiz", "exercise_answers", "teacher_review_flags"].some(
      (key) => Array.isArray(result[key]) && result[key].length > 0,
    );

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
          <h2>{result.title || "Learning material"}</h2>
          <p>Work through the sections one by one. Start with the summary, then try the cards and quiz.</p>
        </div>
        <div className="lesson-stats">
          <span>{result.revision_notes?.length || 0} lessons</span>
          <span>{result.flashcards?.length || 0} cards</span>
          <span>{result.quiz?.length || 0} questions</span>
        </div>
      </section>

      <div className="lesson-tabs" role="tablist" aria-label="Generated lesson sections">
        {sections.map((section) => (
          <button
            className={`lesson-tab ${lessonTab === section.id ? "active" : ""}`}
            type="button"
            key={section.id}
            onClick={() => setLessonTab(section.id)}
          >
            <span>{section.label}</span>
            <strong>{section.count}</strong>
          </button>
        ))}
      </div>

      {lessonTab === "overview" && (
        <section className="lesson-panel">
          <p className="eyebrow">Summary</p>
          <h3>{result.title || "Today's lesson"}</h3>
          <p>{renderArabicAwareText(result.summary || "No summary was returned for this lesson.")}</p>
        </section>
      )}

      {lessonTab === "notes" && (
        <section className="lesson-panel">
          <div className="lesson-section-heading">
            <p className="eyebrow">Revision</p>
            <h3>Learn the main ideas</h3>
          </div>
          <div className="notes-list">
            {(result.revision_notes || []).map((note, index) => (
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
        </section>
      )}

      {lessonTab === "flashcards" && (
        <section className="lesson-panel">
          <div className="lesson-section-heading">
            <p className="eyebrow">Practice</p>
            <h3>Tap a card to flip it</h3>
          </div>
          <div className="flashcard-grid">
            {(result.flashcards || []).map((card, index) => (
              <Flashcard card={card} index={index} key={`flashcard-${index}`} />
            ))}
          </div>
        </section>
      )}

      {lessonTab === "terms" && (
        <section className="lesson-panel">
          <div className="lesson-section-heading">
            <p className="eyebrow">Vocabulary</p>
            <h3>Important words</h3>
          </div>
          <div className="term-grid">
            {(result.key_terms || []).map((term, index) => (
              <article className="term-card" key={`term-${index}`}>
                {term.arabic && <p className="arabic">{term.arabic}</p>}
                <h4>{term.english || "Term"}</h4>
                <p>{renderArabicAwareText(term.simple_explanation)}</p>
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
            {(result.quiz || []).map((quiz, index) => (
              <article className="quiz-card" key={`quiz-${index}`}>
                <span className="pill">{quiz.question_type || "question"}</span>
                <h4>{renderArabicAwareText(quiz.question)}</h4>
                {Array.isArray(quiz.options) && quiz.options.length > 0 && (
                  <div className="option-list">
                    {quiz.options.map((option, optionIndex) => (
                      <span key={`quiz-${index}-option-${optionIndex}`}>{renderArabicAwareText(option)}</span>
                    ))}
                  </div>
                )}
                {quiz.answer && <p><strong>Answer:</strong> {renderArabicAwareText(quiz.answer)}</p>}
                {quiz.explanation && <p className="muted">{renderArabicAwareText(quiz.explanation)}</p>}
              </article>
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
            {(result.exercise_answers || []).map((exercise, index) => (
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

    </div>
  );
}

function LessonPage({ lesson, onBack }) {
  return (
    <main className="lesson-page">
      <div className="lesson-page-topbar">
        <button className="secondary-button compact" type="button" onClick={onBack}>
          Back to dashboard
        </button>
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
              <span className="pill">{item.pages?.length ? `Pages ${item.pages.join(", ")}` : "Saved result"}</span>
              <span>{new Date(item.created_at).toLocaleDateString()}</span>
            </div>
            <h3>{item.title}</h3>
            {item.summary && <p className="history-summary">{item.summary}</p>}
            <div className="mini-lesson-preview">
              <span>Revision plan</span>
              <strong>{item.counts?.revision_notes || 0}</strong>
              <span>Flashcards</span>
              <strong>{item.counts?.flashcards || 0}</strong>
              <span>Quiz checks</span>
              <strong>{item.counts?.quiz || 0}</strong>
            </div>
            <div className="history-meta">
              <span>{item.book_id || "Unknown book"}</span>
              <span>{new Date(item.created_at).toLocaleTimeString()}</span>
            </div>
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

  const maxEndPage = useMemo(() => {
    const parsedStart = Number.parseInt(startPage, 10);
    const rangeMax = Number.isInteger(parsedStart) && parsedStart > 0 ? parsedStart + MAX_PAGES - 1 : MAX_PAGES;
    return Math.min(rangeMax, totalPages);
  }, [startPage, totalPages]);

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

    if (!Number.isInteger(parsedStart) || parsedStart <= 0) return;
    const nextStartPage = Math.min(parsedStart, totalPages);
    if (nextStartPage !== parsedStart) {
      setStartPage(String(nextStartPage));
      return;
    }

    if (!Number.isInteger(parsedEnd) || parsedEnd < nextStartPage) {
      setEndPage(String(nextStartPage));
    } else if (parsedEnd > maxEndPage) {
      setEndPage(String(maxEndPage));
    }
  }, [endPage, maxEndPage, startPage, totalPages]);

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
                  min={startPage || "1"}
                  max={maxEndPage}
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
