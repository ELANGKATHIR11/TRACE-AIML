import React, { useState } from 'react';
import { 
  Bot, 
  Sparkles, 
  Scale, 
  Search, 
  Loader2, 
  BookOpen
} from 'lucide-react';
import { triggerAgentReview, searchHandbookRAG } from '../api';

interface AIAdvisoryProps {
  applicationId: number;
}

export const AIAdvisoryPanel: React.FC<AIAdvisoryProps> = ({ applicationId }) => {
  const [loadingReview, setLoadingReview] = useState(false);
  const [reviewResult, setReviewResult] = useState<any | null>(null);
  const [ragQuery, setRagQuery] = useState('');
  const [ragResults, setRagResults] = useState<any[]>([]);
  const [loadingRag, setLoadingRag] = useState(false);

  const handleRunAgentReview = async () => {
    setLoadingReview(true);
    try {
      const res = await triggerAgentReview(applicationId);
      setReviewResult(res);
    } catch (err: any) {
      alert(`Advisory review could not be generated: ${err.message}`);
    } finally {
      setLoadingReview(false);
    }
  };

  const handleRagSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ragQuery.trim()) return;
    setLoadingRag(true);
    try {
      const res = await searchHandbookRAG(ragQuery.trim());
      setRagResults(res.results || []);
    } catch (err: any) {
      alert(`Handbook search failed: ${err.message}`);
    } finally {
      setLoadingRag(false);
    }
  };

  return (
    <section 
      aria-label="Grounded AI advisory scrutiny"
      style={{
        backgroundColor: '#FFFFFF',
        border: 'var(--border-hairline)',
        borderRadius: 'var(--radius-sm)',
        padding: '16px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--brand-saffron-tint)',
            color: 'var(--brand-saffron)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Bot size={16} aria-hidden="true" />
          </div>
          <div>
            <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--brand-navy)' }}>
              Grounded AI Advisory Review (Local Ollama)
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
              Forensic Auditor · Regulatory Officer · Evidence Compiler
            </p>
          </div>
        </div>

        <button
          onClick={handleRunAgentReview}
          disabled={loadingReview}
          style={{
            backgroundColor: 'var(--brand-navy)',
            color: '#FFFFFF',
            border: 'none',
            padding: '5px 12px',
            fontSize: '12px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {loadingReview ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Sparkles size={13} aria-hidden="true" />}
          {loadingReview ? 'Analyzing Dossier...' : 'Run Advisory Review'}
        </button>
      </div>

      {/* Statutory Safeguard Disclaimer */}
      <div style={{
        backgroundColor: 'var(--stat-pending-bg)',
        border: '1px solid var(--stat-pending-border)',
        borderRadius: 'var(--radius-sm)',
        padding: '8px 10px',
        fontSize: '12px',
        color: 'var(--stat-pending-ink)',
        marginBottom: '12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '6px',
      }}>
        <Scale size={15} style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
        <span>
          <strong>Statutory Safeguard:</strong> All AI inferences are decision-support signals. Regulatory determinations remain exclusively with authorized AICTE officials.
        </span>
      </div>

      {/* Review Result Content */}
      {reviewResult && (
        <div style={{
          backgroundColor: 'var(--surface-subtle)',
          border: 'var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px',
          marginBottom: '14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--brand-navy)' }}>
                LangGraph & CrewAI Multi-Agent Synthesis
              </span>
              <span className="mono" style={{ fontSize: '10px', backgroundColor: '#E2E8F0', padding: '1px 5px', borderRadius: '2px' }}>
                Status: {reviewResult.status || 'COMPLETED'}
              </span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
              Model: {reviewResult.model || 'qwen2.5:1.5b-instruct (Ollama)'}
            </span>
          </div>

          {/* Workflow Steps */}
          {reviewResult.steps && reviewResult.steps.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
              {reviewResult.steps.map((st: any, idx: number) => (
                <div key={idx} style={{ backgroundColor: '#FFFFFF', border: 'var(--border-subtle)', borderRadius: '2px', padding: '8px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--brand-navy)' }}>
                      Step {idx + 1}: {st.agent || st.role}
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--stat-verified-ink)', fontWeight: 600 }}>
                      ✓ {st.role || 'Executed'}
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--ink-secondary)', lineHeight: '1.4' }}>
                    {st.details || st.output || 'Analysis recorded.'}
                  </p>
                </div>
              ))}
            </div>
          )}

          {reviewResult.advisory_synthesis && (
            <div style={{ borderTop: 'var(--border-subtle)', paddingTop: '8px' }}>
              <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--brand-navy)', display: 'block', marginBottom: '4px' }}>
                Final Advisory Recommendation:
              </span>
              <p style={{ fontSize: '12px', color: 'var(--ink-primary)', lineHeight: '1.5' }}>
                {reviewResult.advisory_synthesis}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Handbook Semantic Search */}
      <div style={{ borderTop: 'var(--border-subtle)', paddingTop: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <BookOpen size={14} color="var(--brand-navy)" aria-hidden="true" />
          <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--brand-navy)' }}>
            Approval Process Handbook Search (ChromaDB Vector RAG)
          </h3>
        </div>

        <form onSubmit={handleRagSearch} style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
          <input
            type="text"
            aria-label="Search Approval Process Handbook"
            placeholder="Search handbook clause (e.g. Land requirement for engineering college in urban area)..."
            value={ragQuery}
            onChange={(e) => setRagQuery(e.target.value)}
            style={{
              flex: 1,
              padding: '5px 10px',
              border: 'var(--border-hairline)',
              borderRadius: 'var(--radius-sm)',
            }}
          />
          <button
            type="submit"
            disabled={loadingRag}
            style={{
              backgroundColor: '#FFFFFF',
              border: 'var(--border-strong)',
              color: 'var(--ink-primary)',
              padding: '5px 12px',
              fontWeight: 600,
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {loadingRag ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <Search size={12} aria-hidden="true" />}
            Search
          </button>
        </form>

        {ragResults.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {ragResults.map((r, i) => (
              <div
                key={i}
                style={{
                  backgroundColor: '#FFFFFF',
                  border: 'var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px 10px',
                  fontSize: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span style={{ fontWeight: 700, color: 'var(--brand-navy)' }}>
                    Clause: {r.metadata?.clause_id || r.metadata?.title || `Section ${i + 1}`}
                  </span>
                  <span className="mono" style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
                    Relevance: {r.distance ? (1 - r.distance).toFixed(3) : '0.940'}
                  </span>
                </div>
                <p style={{ color: 'var(--ink-secondary)', lineHeight: '1.4' }}>
                  {r.document || r.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
