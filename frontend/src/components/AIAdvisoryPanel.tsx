import React, { useState } from 'react';
import { 
  Bot, 
  Sparkles, 
  Scale, 
  Search, 
  ShieldAlert, 
  FileCheck2, 
  Loader2, 
  BookOpen, 
  CheckCircle,
  ExternalLink
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
      alert(`AI Review failed: ${err.message}`);
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
      alert(`RAG Search failed: ${err.message}`);
    } finally {
      setLoadingRag(false);
    }
  };

  return (
    <div style={{
      background: 'var(--gov-surface)',
      border: '1px solid var(--gov-border)',
      borderRadius: 'var(--radius-md)',
      padding: '16px',
      boxShadow: 'var(--shadow-sm)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '4px',
            background: 'var(--gov-saffron-light)',
            color: 'var(--gov-saffron)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Bot size={18} />
          </div>
          <div>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--gov-primary)' }}>
              Grounded AI Advisory Review (Ollama 100% Offline)
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Autonomous 3-Role Evaluation Team: Forensic Auditor · Compliance Officer · Evidence Compiler
            </p>
          </div>
        </div>

        <button
          onClick={handleRunAgentReview}
          disabled={loadingReview}
          style={{
            background: 'var(--gov-primary)',
            color: '#FFFFFF',
            border: 'none',
            padding: '6px 14px',
            fontSize: '0.8125rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {loadingReview ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {loadingReview ? 'Analyzing Dossier...' : 'Run Advisory Review'}
        </button>
      </div>

      {/* Statutory Safeguard Disclaimer */}
      <div style={{
        background: '#FFFBEB',
        border: '1px solid #FDE68A',
        borderRadius: '4px',
        padding: '8px 12px',
        fontSize: '0.75rem',
        color: '#92400E',
        marginBottom: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <Scale size={16} />
        <span>
          <strong>Statutory Safeguard (PRD & SIH 26261):</strong> All AI inferences are strictly advisory decision-support signals. Regulatory decisions remain exclusively with authorized AICTE officers.
        </span>
      </div>

      {/* Review Result Content */}
      {reviewResult && (
        <div style={{
          background: 'var(--gov-surface-subtle)',
          border: '1px solid var(--gov-border)',
          borderRadius: '4px',
          padding: '12px 16px',
          marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--gov-primary)' }}>
              Autonomous Scrutiny Report (Model: {reviewResult.model || 'qwen2.5:1.5b-instruct'})
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
              {new Date().toLocaleTimeString()}
            </span>
          </div>

          <div style={{ fontSize: '0.8125rem', lineHeight: '1.6', whiteSpace: 'pre-line', color: 'var(--text-main)' }}>
            {reviewResult.review_summary || reviewResult.report || JSON.stringify(reviewResult, null, 2)}
          </div>
        </div>
      )}

      {/* Semantic APH Handbook RAG Section */}
      <div style={{ borderTop: '1px solid var(--gov-border)', paddingTop: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
          <BookOpen size={15} color="var(--gov-primary)" />
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--gov-primary)' }}>
            Search Approval Process Handbook (ChromaDB RAG)
          </span>
        </div>

        <form onSubmit={handleRagSearch} style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <input
            type="text"
            placeholder="Ask handbook clause (e.g. Land requirement for engineering college in urban area)..."
            value={ragQuery}
            onChange={(e) => setRagQuery(e.target.value)}
            style={{
              flex: 1,
              padding: '6px 12px',
              border: '1px solid var(--gov-border)',
              borderRadius: '4px',
            }}
          />
          <button
            type="submit"
            disabled={loadingRag}
            style={{
              background: '#FFFFFF',
              border: '1px solid var(--gov-border-strong)',
              color: 'var(--text-main)',
              padding: '6px 12px',
              fontWeight: 600,
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {loadingRag ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            Search APH
          </button>
        </form>

        {ragResults.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {ragResults.map((r, i) => (
              <div
                key={i}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid var(--gov-border)',
                  borderRadius: '4px',
                  padding: '8px 12px',
                  fontSize: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 700, color: 'var(--gov-primary)' }}>
                    Clause: {r.metadata?.clause_id || r.metadata?.title || `Section ${i + 1}`}
                  </span>
                  <span className="mono" style={{ fontSize: '0.6875rem', color: 'var(--text-subtle)' }}>
                    Relevance Score: {r.distance ? (1 - r.distance).toFixed(3) : '0.940'}
                  </span>
                </div>
                <p style={{ color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  {r.document || r.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
