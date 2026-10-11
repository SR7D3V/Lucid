'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { api, errorMessage } from '@/lib/api';
import type { SchemaTable, SqlResult } from '@/lib/types';

const HISTORY_KEY = 'lucid-sql-history';
const HISTORY_LIMIT = 50;

function formatCell(value: unknown) {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export default function SqlConsole({ schema }: { schema: SchemaTable[] }) {
  const [query, setQuery] = useState(
    'SELECT product_id, name, category_name, subcategory_name, price, total_stock\nFROM product_catalog\nORDER BY product_id\nLIMIT 20;'
  );
  const [result, setResult] = useState<SqlResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? '[]');
      if (Array.isArray(saved)) {
        const frame = requestAnimationFrame(() => setHistory(saved.filter((item) => typeof item === 'string')));
        return () => cancelAnimationFrame(frame);
      }
    } catch {}
  }, []);

  const execute = async () => {
    const sql = query.trim();
    if (!sql || running) return;

    const nextHistory = [sql, ...history.filter((item) => item !== sql)].slice(0, HISTORY_LIMIT);
    setHistory(nextHistory);
    setHistoryIndex(-1);
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
    } catch {}

    setRunning(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api<SqlResult>('/api/admin/sql', { method: 'POST', body: { query: sql } }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRunning(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void execute();
    } else if (event.key === 'ArrowUp' && event.altKey && history.length > 0) {
      event.preventDefault();
      const next = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(next);
      setQuery(history[next]);
    } else if (event.key === 'ArrowDown' && event.altKey && historyIndex >= 0) {
      event.preventDefault();
      const next = historyIndex - 1;
      setHistoryIndex(next);
      setQuery(next === -1 ? '' : history[next]);
    }
  };

  return (
    <div className="sql-layout">
      <div className="sql-results">
        <div className="panel" style={{ marginBottom: '2rem' }}>
          <h3 className="panel-title" style={{ fontSize: '1.2rem' }}>Schema Reference</h3>
          <ul className="schema-list">
            {schema.map((table) => (
              <li key={table.table}>
                <strong>{table.table}</strong> <span>{table.columns.join(', ')}</span>
              </li>
            ))}
          </ul>
        </div>

        <h2 className="panel-title" style={{ fontSize: '1.2rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
          Results Console
        </h2>
        {!result && !error && <p className="muted" style={{ marginTop: '1rem' }}>{running ? 'Running…' : 'Run a query to see results here.'}</p>}
        {error && <div className="alert error" style={{ marginTop: '1rem' }}>{error}</div>}
        {result && (
          <div style={{ marginTop: '1rem' }}>
            <p className="muted small" style={{ marginBottom: '0.75rem' }}>
              {result.command} · {result.rowCount} row{result.rowCount === 1 ? '' : 's'} · {result.durationMs} ms
              {result.truncated && ' · showing first 500 rows'}
            </p>
            {result.columns.length > 0 &&
              (result.rows.length === 0 ? (
                <p>No rows returned.</p>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>{result.columns.map((column, i) => <th key={i}>{column}</th>)}</tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, i) => (
                        <tr key={i}>{row.map((value, j) => <td key={j}>{formatCell(value)}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="sql-editor">
        <div className="sql-editor-sticky">
          <h2 className="panel-title" style={{ fontSize: '1.2rem' }}>SQL Editor</h2>
          <textarea
            className="sql-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="SELECT * FROM products;"
            spellCheck={false}
            aria-label="SQL query"
          />
          <button className="btn block" onClick={execute} disabled={running} style={{ marginBottom: '2rem' }}>
            {running ? 'Running...' : 'Execute SQL (Cmd + Enter)'}
          </button>

          <h2 className="panel-title" style={{ fontSize: '1.2rem' }}>Query History</h2>
          {history.length === 0 ? (
            <p className="muted small" style={{ padding: '1rem', border: '1px solid var(--border)' }}>No history yet.</p>
          ) : (
            <ul className="history-list">
              {history.map((item, i) => (
                <li
                  key={item}
                  className={historyIndex === i ? 'active' : ''}
                  onClick={() => {
                    setQuery(item);
                    setHistoryIndex(i);
                  }}
                >
                  <span className="muted" style={{ marginRight: 10 }}>{i + 1}.</span>
                  {item.length > 50 ? `${item.slice(0, 50)}…` : item}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
