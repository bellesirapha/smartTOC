/**
 * LlmConfigModal
 *
 * Allows users to configure the optional LLM refinement pass.
 * API keys are stored only in sessionStorage and never transmitted
 * except directly to the chosen provider's endpoint.
 */

import React, { useState } from 'react';
import type { LlmConfig } from '../lib/llmRefinement';
import './LlmConfigModal.css';

interface Props {
  initial: LlmConfig | null;
  onSave: (config: LlmConfig) => void;
  onSkip: () => void;
  onClear: () => void;
}

const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini';
const AZURE_MODEL_PLACEHOLDER = '(determined by Azure endpoint)';

export const LlmConfigModal: React.FC<Props> = ({ initial, onSave, onSkip, onClear }) => {
  const [provider, setProvider] = useState<'openai' | 'azure'>(
    initial?.provider ?? 'openai'
  );
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '');
  const [azureEndpoint, setAzureEndpoint] = useState(initial?.azureEndpoint ?? '');
  const [model, setModel] = useState(initial?.model ?? '');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!apiKey.trim()) {
      setError('API key is required.');
      return;
    }
    if (provider === 'azure' && !azureEndpoint.trim()) {
      setError('Azure endpoint URL is required.');
      return;
    }

    const config: LlmConfig = {
      provider,
      apiKey: apiKey.trim(),
      ...(provider === 'azure' ? { azureEndpoint: azureEndpoint.trim() } : {}),
      ...(model.trim() ? { model: model.trim() } : {}),
    };
    onSave(config);
  }

  return (
    <div className="llm-modal__overlay" role="dialog" aria-modal="true" aria-label="LLM Configuration">
      <div className="llm-modal__box">
        <h2 className="llm-modal__title">🤖 LLM Refinement (optional)</h2>
        <p className="llm-modal__desc">
          Optionally enable a secondary AI pass to improve confidence scoring,
          correct heading levels, and filter false positives.
          Your API key is stored only in session memory and sent directly to the provider.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          {/* Provider */}
          <div className="llm-modal__field">
            <label className="llm-modal__label">Provider</label>
            <div className="llm-modal__radio-group">
              <label className="llm-modal__radio-label">
                <input
                  type="radio"
                  name="provider"
                  value="openai"
                  checked={provider === 'openai'}
                  onChange={() => setProvider('openai')}
                />
                OpenAI
              </label>
              <label className="llm-modal__radio-label">
                <input
                  type="radio"
                  name="provider"
                  value="azure"
                  checked={provider === 'azure'}
                  onChange={() => setProvider('azure')}
                />
                Azure OpenAI
              </label>
            </div>
          </div>

          {/* API Key */}
          <div className="llm-modal__field">
            <label className="llm-modal__label" htmlFor="llm-apikey">
              {provider === 'azure' ? 'Azure API Key' : 'OpenAI API Key'}
            </label>
            <div className="llm-modal__key-row">
              <input
                id="llm-apikey"
                className="llm-modal__input"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={provider === 'openai' ? 'sk-...' : 'Your Azure API key'}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="llm-modal__show-btn"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? 'Hide key' : 'Show key'}
              >
                {showKey ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {/* Azure endpoint */}
          {provider === 'azure' && (
            <div className="llm-modal__field">
              <label className="llm-modal__label" htmlFor="llm-endpoint">
                Azure Endpoint URL
              </label>
              <input
                id="llm-endpoint"
                className="llm-modal__input"
                type="url"
                value={azureEndpoint}
                onChange={(e) => setAzureEndpoint(e.target.value)}
                placeholder="https://<resource>.openai.azure.com/openai/deployments/<deployment>/chat/completions?api-version=2024-08-01-preview"
                spellCheck={false}
              />
            </div>
          )}

          {/* Model (OpenAI only) */}
          {provider === 'openai' && (
            <div className="llm-modal__field">
              <label className="llm-modal__label" htmlFor="llm-model">
                Model <span className="llm-modal__optional">(optional)</span>
              </label>
              <input
                id="llm-model"
                className="llm-modal__input"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={OPENAI_DEFAULT_MODEL}
                spellCheck={false}
              />
            </div>
          )}

          {provider === 'azure' && (
            <p className="llm-modal__hint">{AZURE_MODEL_PLACEHOLDER}</p>
          )}

          {error && <p className="llm-modal__error">{error}</p>}

          <div className="llm-modal__actions">
            <button type="submit" className="llm-modal__btn llm-modal__btn--primary">
              Enable LLM Refinement
            </button>
            <button type="button" className="llm-modal__btn llm-modal__btn--secondary" onClick={onSkip}>
              Skip (heuristic only)
            </button>
          </div>
        </form>

        {initial?.apiKey && (
          <button className="llm-modal__clear-link" onClick={onClear} type="button">
            Clear saved key
          </button>
        )}
      </div>
    </div>
  );
};
