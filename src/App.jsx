import { useState, useRef, useEffect, useCallback } from "react";
import "./App.css";

// ── Constants ──────────────────────────────────────────────
const DEFAULT_PERSONA =
  "You are Nova, a sharp and helpful AI assistant. You are warm, thoughtful, and a little witty. You help with anything — research, writing, coding, analysis, and more.";

const SUGGESTIONS = [
  { icon: "🔍", text: "Search the web", sub: "Find latest news & info", prompt: "Search for the latest AI news today" },
  { icon: "💡", text: "Brainstorm ideas", sub: "Creative thinking partner", prompt: "Give me 5 creative startup ideas for 2025" },
  { icon: "✍️", text: "Help me write", sub: "Drafts, emails, essays", prompt: "Help me write a professional email" },
  { icon: "💻", text: "Code assistant", sub: "Debug, explain, build", prompt: "Explain how React hooks work" },
];

// ── File helpers ───────────────────────────────────────────
function readAsBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("Read failed"));
    r.readAsDataURL(file);
  });
}
function readAsText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error("Read failed"));
    r.readAsText(file);
  });
}

// ── Main Component ─────────────────────────────────────────
export default function App() {
  const [sessions, setSessions]     = useState([{ id: 1, title: "New chat", messages: [] }]);
  const [activeId, setActiveId]     = useState(1);
  const [input, setInput]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [persona, setPersona]       = useState(DEFAULT_PERSONA);
  const [webSearch, setWebSearch]   = useState(true);
  const [sidebarOpen, setSidebar]   = useState(true);
  const [pendingFiles, setFiles]    = useState([]);
  const [error, setError]           = useState(null);

  const bottomRef    = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef  = useRef(null);
  const nextId       = useRef(2);

  const activeSession = sessions.find(s => s.id === activeId);
  const messages      = activeSession?.messages || [];

  // Auto-scroll
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── Session helpers ──
  const updateSession = useCallback((id, fn) => {
    setSessions(prev => prev.map(s => s.id === id ? fn(s) : s));
  }, []);

  const newChat = () => {
    const id = nextId.current++;
    setSessions(prev => [...prev, { id, title: "New chat", messages: [] }]);
    setActiveId(id);
    setFiles([]);
    setError(null);
  };

  // ── File handling ──
  const handleFileAdd = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const parsed = await Promise.all(files.map(async (f) => {
      const isImage = f.type.startsWith("image/");
      const isPdf   = f.type === "application/pdf";
      const data    = (isImage || isPdf) ? await readAsBase64(f) : await readAsText(f);
      return { name: f.name, type: f.type, data, isImage, isPdf };
    }));
    setFiles(prev => [...prev, ...parsed]);
    e.target.value = "";
  };

  const removeFile = (name) => setFiles(prev => prev.filter(f => f.name !== name));

  // ── Build API content ──
  const buildContent = (text, files) => {
    if (!files.length) return text;
    const parts = [];
    for (const f of files) {
      if (f.isImage) {
        parts.push({ type: "image", source: { type: "base64", media_type: f.type, data: f.data } });
      } else if (f.isPdf) {
        parts.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data } });
      } else {
        parts.push({ type: "text", text: `[File: ${f.name}]\n\`\`\`\n${f.data}\n\`\`\`` });
      }
    }
    if (text.trim()) parts.push({ type: "text", text });
    return parts;
  };

  // ── Send message ──
  const sendMessage = async (text = input) => {
    if (!text.trim() && !pendingFiles.length) return;
    setError(null);

    const content = buildContent(text, pendingFiles);
    const userMsg = {
      role: "user",
      content,
      displayText: text,
      files: pendingFiles.map(f => f.name),
    };

    const updated = [...messages, userMsg];
    updateSession(activeId, s => ({
      ...s,
      title: s.messages.length === 0 ? (text.slice(0, 38) || "File upload") : s.title,
      messages: updated,
    }));

    setInput("");
    setFiles([]);
    setLoading(true);

    const apiMessages = updated.map(m => ({ role: m.role, content: m.content }));

    try {
      const body = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: persona,
        messages: apiMessages,
      };

      if (webSearch) {
        body.tools = [{ type: "web_search_20250305", name: "web_search" }];
      }

      const res  = await fetch("http://localhost:3001/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "API error");

      const reply = (data.content || [])
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("\n")
        .trim();

      updateSession(activeId, s => ({
        ...s,
        messages: [...s.messages, { role: "assistant", content: reply, displayText: reply }],
      }));
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const autoResize = (e) => {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
  };

  // ── Render ──────────────────────────────────────────────
  return (
    <div className="app">

      {/* ── Sidebar ── */}
      <aside className={`sidebar ${sidebarOpen ? "" : "collapsed"}`}>

        <div className="sidebar-header">
          <div className="logo-mark">✦</div>
          <div>
            <div className="logo-name">Nova</div>
            <div className="logo-tagline">AI Assistant</div>
          </div>
        </div>

        <div className="sidebar-body">

          {/* Personality */}
          <div className="sidebar-section">
            <div className="section-label">Personality</div>
            <textarea
              className="persona-box"
              value={persona}
              onChange={e => setPersona(e.target.value)}
              rows={4}
              placeholder="Describe how Nova should behave…"
            />
          </div>

          {/* Features */}
          <div className="sidebar-section">
            <div className="section-label">Features</div>
            <div className="toggle-row">
              <div className="toggle-info">
                <span className="toggle-name">🔍 Web Search</span>
                <span className="toggle-desc">Browse the internet live</span>
              </div>
              <button
                className={`toggle ${webSearch ? "on" : ""}`}
                onClick={() => setWebSearch(v => !v)}
                aria-label="Toggle web search"
              />
            </div>
          </div>

          {/* History */}
          <div className="history-section">
            <div className="section-label">History</div>
            <div className="history-list">
              {sessions.slice().reverse().map(s => (
                <div
                  key={s.id}
                  className={`history-item ${s.id === activeId ? "active" : ""}`}
                  onClick={() => { setActiveId(s.id); setError(null); }}
                >
                  <span className="history-icon">💬</span>
                  <span className="history-text">{s.title}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        <button className="new-chat-btn" onClick={newChat}>
          ＋ New Chat
        </button>
      </aside>

      {/* ── Main Panel ── */}
      <main className="main">

        {/* Header */}
        <div className="chat-header">
          <div className="chat-header-left">
            <button className="collapse-btn" onClick={() => setSidebar(v => !v)} title="Toggle sidebar">
              {sidebarOpen ? "◀" : "▶"}
            </button>
            <div className="status-pill">
              <div className="status-dot" />
              <span className="status-text">Online</span>
            </div>
            <div>
              <div className="chat-title">Nova AI</div>
              <div className="chat-sub">General-purpose assistant</div>
            </div>
          </div>

          <div className="header-badges">
            {webSearch && (
              <span className="badge badge-search">🔍 Search ON</span>
            )}
            {pendingFiles.length > 0 && (
              <span className="badge badge-file">
                📎 {pendingFiles.length} file{pendingFiles.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Messages / Welcome */}
        {messages.length === 0 && !loading ? (
          <div className="welcome">
            <div className="welcome-orb">✦</div>
            <h1 className="welcome-title">Hello, I'm <span>Nova</span></h1>
            <p className="welcome-sub">
              Your all-purpose AI assistant. Ask me anything, upload files, or let me search the web for you.
            </p>
            <div className="suggestions-grid">
              {SUGGESTIONS.map(s => (
                <button
                  key={s.text}
                  className="suggestion-card"
                  onClick={() => sendMessage(s.prompt)}
                >
                  <span className="suggestion-icon">{s.icon}</span>
                  <div className="suggestion-text">{s.text}</div>
                  <div className="suggestion-sub">{s.sub}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="messages-wrap">
            {messages.map((m, i) => (
              <div key={i} className={`message ${m.role === "user" ? "user" : "bot"}`}>
                <div className={`avatar ${m.role === "user" ? "user" : "bot"}`}>
                  {m.role === "user" ? "U" : "✦"}
                </div>
                <div className="bubble-wrap">
                  {m.files?.length > 0 && m.files.map(f => (
                    <span key={f} className="file-tag">📎 {f}</span>
                  ))}
                  {m.displayText && (
                    <div className="bubble">{m.displayText}</div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="message bot">
                <div className="avatar bot">✦</div>
                <div className="typing-bubble">
                  <div className="dot" /><div className="dot" /><div className="dot" />
                </div>
              </div>
            )}

            {error && (
              <div className="error-box">
                ⚠️ {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}

        {/* Input */}
        <div className="input-area">
          {pendingFiles.length > 0 && (
            <div className="file-chips">
              {pendingFiles.map(f => (
                <div key={f.name} className="file-chip">
                  📎 {f.name}
                  <button className="chip-remove" onClick={() => removeFile(f.name)}>✕</button>
                </div>
              ))}
            </div>
          )}

          <div className="input-box">
            <textarea
              ref={textareaRef}
              className="chat-input"
              rows={1}
              value={input}
              onChange={e => { setInput(e.target.value); autoResize(e); }}
              onKeyDown={handleKeyDown}
              placeholder="Message Nova…"
            />
            <div className="input-actions">
              <button
                className={`attach-btn ${pendingFiles.length > 0 ? "has-files" : ""}`}
                title="Attach file"
                onClick={() => fileInputRef.current?.click()}
              >📎</button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                hidden
                accept="image/*,.pdf,.txt,.md,.csv,.json,.js,.ts,.py,.html,.css"
                onChange={handleFileAdd}
              />
              <button
                className="send-btn"
                disabled={loading || (!input.trim() && !pendingFiles.length)}
                onClick={() => sendMessage()}
                title="Send (Enter)"
              >➤</button>
            </div>
          </div>

          <p className="input-hint">
            Enter to send · Shift+Enter for new line · Attach images, PDFs, or text files
          </p>
        </div>

      </main>
    </div>
  );
}